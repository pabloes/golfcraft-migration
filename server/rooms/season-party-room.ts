import {Client, Room} from "colyseus";
import {ArraySchema, Schema, type} from "@colyseus/schema";
import fetch from "cross-fetch";
import {promisify} from "util";
import {PlayFabServer} from "playfab-sdk";
import {tryFetch} from "../utils/try-fetch";
import {recordHoleStart} from "../hole-start";
import {creatServerGolfPlay} from "./golfplay-server";
import {Gameplay, Vector3} from "./GamePlayState";
import {getCourseDefinition} from "../../common/course-definitions/course-definition-repository";
import {migrateCourseDefinitionAnimations} from "../../common/course-animations-migration";
import MESSAGE from "./mesages";
import {createFrameReproduction} from "../../common/frame-reproductor";
import {createEventManager} from "../../scene/golfplay/src/services/EventManagerFactory";
import {EVENT} from "../../scene/golfplay/src/gameplay-handlers/handler-def";
import {
    cloneJSON,
    getCatFromTier,
    getNumberOfFrames,
    getRandomFromList,
    getTierFromSub,
    getTierPercentiles,
    mapPropertiesMultInt,
    sleep,
    tryFn,
    waitFor
} from "../../common/utils";
import {CURRENCY} from "../../common/currency-codes";
import {
    countdownByTierCat,
    Ghost,
    MATERIAL_FACTOR,
    PlayerResults,
    RECORDED_FPS,
    RECORDED_FRAME,
    RECORDED_FRAME_MS,
    serializeFrames,
    sumDrops
} from "./Season-Room";
import {PartyMember, takeParty} from "./season-party-registry";
import {isEnergyFree} from "../energy";
import {disconnectIfOnlySpectators, isSpectator, LiveGameMetadata, spectatorAuth, wantsToSpectate} from "./spectator";

//Slots kept in the room for people watching, on top of the party's own size.
const MAX_SPECTATORS = 20;

// "Play ranked with friends": a Season run (4 rounds against recorded ghosts)
// for 2-4 players at once. Season-Room is single player by design (one ball,
// results[0] hardcoded), so this is a separate room that follows it round by
// round and takes the per-player physics from live-tournament-room.
//
// Rules:
//   - The room plays at the level of its LOWEST member: courses, ghosts and the
//     hole countdown come from that tier.
//   - Each player is scored exactly like a solo run: against the 3 ghosts only,
//     never against the other friends. The shared scoreboard (state.results)
//     still ranks everybody, to show who did best.
//   - A player whose own solo run would be harder than the room (different tier
//     category, or a different ghost percentile band) earns 0 season points, is
//     never penalised for leaving and is not recorded as a ghost. Materials, GC
//     and xp are given to everyone, with the room's tier multiplier.
//   - Anyone leaving mid-game does not affect the others.
const API_URL = process.env.PROD ? `https://golfcraftgame.com` : `http://localhost:2569`;
const playfabServerApiKey = process.env.PLAYFAB_API_KEY;
const NUM_GHOSTS = 3;
const NUM_SOLO_PLAYERS = 4;//a solo field: the player + 3 ghosts
const TIME_TO_START = 12000;//Season-Room READY -> START
const READY_WAIT_MS = 15000;//how long a round waits for slow players before starting without them

class PartyPlayer extends Schema {
    @type("string")
    address: string;

    @type("string")
    displayName: string;

    @type("number")
    tierSub = 0;

    //earns season points (plays at their own level)
    @type("boolean")
    eligible = true;

    @type("boolean")
    left = false;

    @type("boolean")
    holed = false;

    //live ball, so every client can draw the other players' balls
    @type(Vector3)
    position = new Vector3(0, 0, 0);

    userId: string;
    PlayFabId: string;
    token: string;
    resultIndex: number;
    client: Client | null = null;
    readyRound = -1;
    lastPingTimeMs = 0;
    lastPingMs = 0;
    golfPlay: any = null;
    frameReproduction: any = null;
    frameEventHandler = createEventManager();
    recordedFrames: { type: number, value: any }[] = [];
    recordPositionFrames = false;
    lastRecordedFrameTime = 0;
    shoots = 0;
    //field scores per round: [self, ghost0, ghost1, ghost2]
    fieldScores: number[][] = [[], [], [], []];
    rewards = {GC: 0, WD: 0, ST: 0, IR: 0, GD: 0, FT: 0, EN: 0, DM: 0};

    constructor(member: PartyMember, resultIndex: number) {
        super();
        this.address = member.address;
        this.userId = member.userId;
        this.displayName = member.displayName;
        this.PlayFabId = member.PlayFabId;
        this.token = member.token;
        this.resultIndex = resultIndex;
    }
}

class SeasonPartyRoomState extends Gameplay {
    @type([PartyPlayer])
    players = new ArraySchema<PartyPlayer>();

    @type([Ghost])
    ghosts = new ArraySchema<Ghost>();

    @type("int8")
    currentGame = 0;

    //players first (same order as `players`), then the 3 ghosts
    @type([PlayerResults])
    results = new ArraySchema<PlayerResults>();

    //the tier-sub the room plays at (lowest member)
    @type("number")
    playerTierSub = 0;

    countdownTime = 0;
    seasonStartTime = Date.now();

    constructor() {
        super(null, false);
        this.started = false;
        this.finished = false;
        this.startTime = Number.MAX_SAFE_INTEGER;
    }
}

export class SeasonPartyRoom extends Room<SeasonPartyRoomState> {
    private preparing: Promise<void>;
    private disposed = false;
    private selectedCourses: any[];
    private ghostsData: any[] = [[], [], [], []];
    private gameDefinition: any;
    private courseDefinition: any;
    private roomCat = 0;
    private SEASON_REWARD_FACTOR = 0.25;
    private intervalGhosts: ReturnType<typeof setInterval>;
    private readyTimeout: ReturnType<typeof setTimeout>;
    private ghostIdleStarTimes = [0, 0, 0];

    onCreate({partyId}) {
        const members = takeParty(partyId);
        if (!members?.length) throw new Error("season-party-room: unknown party " + partyId);
        //room for the members plus whoever is watching: only a listed token
        //gets a seat, so the extra slots can never be taken by a player
        this.maxClients = members.length + MAX_SPECTATORS;

        this.setState(new SeasonPartyRoomState());
        members.forEach((member, index) => {
            const player = new PartyPlayer(member, index);
            this.state.players.push(player);
            const row = new PlayerResults();
            row.name = member.displayName;
            row.address = member.address;
            this.state.results.push(row);
        });
        for (let i = 0; i < NUM_GHOSTS; i++) this.state.results.push(new PlayerResults());

        this.onMessage(MESSAGE.READY, (client) => this.handleReady(client));

        this.onMessage(MESSAGE.PING, (client) => {
            const player = this.getPlayer(client);
            if (player) player.lastPingTimeMs = Date.now();
            client.send(MESSAGE.PONG);
        });
        this.onMessage(MESSAGE.PING2, (client) => {
            const player = this.getPlayer(client);
            if (player) player.lastPingMs = Date.now() - player.lastPingTimeMs;
        });

        this.onMessage(MESSAGE.SHOOT, (client, message) => {
            this.handleShoot(client, message).catch(error => console.log("season-party SHOOT error", error));
        });

        this.setSimulationInterval((deltaTime) => this.update(deltaTime / 1000), 15);

        this.preparing = this.prepare();
        this.preparing.catch((error) => {
            console.log("season-party-room prepare error", error);
            this.disconnect();
        });
    }

    onAuth(client: Client, options: any = {}) {
        //A spectator needs no token and takes no seat (rooms/spectator.ts).
        if (wantsToSpectate(options)) return spectatorAuth();
        const player = this.state.players.find(p => p.token === options?.token);
        if (!player || player.left || player.client) return false;
        return true;
    }

    async onJoin(client: Client, {token}: any = {}) {
        if (isSpectator(client)) {
            //the courses, so it can draw them; no player index, no ghosts data
            await this.preparing;
            client.send(MESSAGE.GAME_DEFINITIONS, {
                gameDefinitions: this.selectedCourses.map(c => ({courseId: c.alias, type: "season", subType: "1"})),
                ghostsData: [],
                playerIndex: -1
            });
            this.publishLiveMetadata();
            return;
        }
        const player = this.state.players.find(p => p.token === token);
        player.client = client;
        //listed in */live-games as soon as somebody is in, not only once the
        //first hole starts: otherwise nobody can find it to watch
        this.publishLiveMetadata();
        await this.preparing;
        if (player.left) return;
        client.send(MESSAGE.GAME_DEFINITIONS, {
            gameDefinitions: this.selectedCourses.map(c => ({courseId: c.alias, type: "season", subType: "1"})),
            ghostsData: this.ghostsData,
            playerIndex: player.resultIndex
        });
    }

    async onLeave(client: Client, consented: boolean) {
        const player = this.getPlayer(client);
        if (!player) return;
        try {
            if (consented) throw new Error("consented leave " + player.displayName);
            //the scene retries for ~17 s (room-reconnect.ts)
            player.client = await this.allowReconnection(client, 20);
        } catch (error) {
            await this.markLeft(player);
            //the last member has gone: anyone watching goes with them
            disconnectIfOnlySpectators(this);
        }
    }

    //What */live-games shows about this room. Names only, never a wallet.
    publishLiveMetadata() {
        try {
            this.setMetadata({
                mode: "party",
                courseId: this.selectedCourses?.[this.state.currentGame]?.alias || "",
                players: this.state.players.filter(p => !p.left).map(p => p.displayName).filter(Boolean),
                startedAt: Number(this.state.startTime) || Date.now(),
                hole: Number(this.state.currentGame) + 1,
                holes: this.selectedCourses?.length || 4,
                spectators: this.clients.filter(c => isSpectator(c)).length
            } as LiveGameMetadata);
        } catch (error) {
            console.log("season-party setMetadata error", (error as any)?.message);
        }
    }

    onDispose() {
        console.log("SeasonPartyRoom dispose");
        this.disposed = true;
        this.intervalGhosts && clearInterval(this.intervalGhosts);
        this.readyTimeout && clearTimeout(this.readyTimeout);
        this.state.players.forEach(player => this.disposePlayerGolfPlay(player));
    }

    private getPlayer(client: Client) {
        return this.state.players.find(p => p.client === client);
    }

    private isActive(player: PartyPlayer) {
        return !!player.client && !player.left;
    }

    private async prepare() {
        //fresh tier-sub for every member. The room plays at the host's level
        //(players[0], the lobby's members[0]: the creator, or whoever took the
        //seat). Each player is scored against the recorded players only, so
        //those at that level or below earn season points; higher ones don't.
        for (const player of this.state.players) {
            player.tierSub = await promisify(PlayFabServer.GetPlayerStatistics)({
                PlayFabId: player.PlayFabId,
                StatisticNames: ["tier-sub"],
            }).then(r => r.data.Statistics[0]?.Value || 0, (error) => {
                console.log("GetPlayerStatistics error", error);
                return 0;
            });
        }
        const roomTierSub = Math.max(0, this.state.players[0].tierSub);
        const roomTier = getTierFromSub(roomTierSub);
        this.state.playerTierSub = roomTierSub;
        this.roomCat = Math.max(0, getCatFromTier(roomTier));
        this.state.players.forEach(player => {
            player.eligible = isAtOrBelowRoomLevel(getTierFromSub(player.tierSub), roomTier);
        });
        console.log("season-party-room prepare", {
            roomTierSub,
            roomCat: this.roomCat,
            players: this.state.players.map(p => `${p.displayName}:${p.tierSub}${p.eligible ? "" : " (no season points)"}`)
        });

        this.SEASON_REWARD_FACTOR = await promisify(PlayFabServer.GetTitleData)({Keys: ["SeasonRewardFactor"]})
            .then(r => r.data.Data.SeasonRewardFactor && Number(r.data.Data.SeasonRewardFactor) || 0.25, () => 0.25);

        //same course pick as Season-Room, with the room's category
        const courseQuery = {
            "query": {
                "where": {
                    "minTierCat": {"lte": this.roomCat},
                    "maxTierCat": {"gte": this.roomCat},
                    "isSeason": 1
                }
            },
            "table": "courses"
        };
        this.selectedCourses = [];
        for (let i = 0; i < 4; i++) {
            const course = await tryFetch(1, API_URL + `/api/get-random-row?r=${Date.now() + i}`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(courseQuery)
            }).then(r => r.json());
            if (!course?.alias) throw new Error("season-party-room: no season course for cat " + this.roomCat);
            this.selectedCourses.push(course);
        }
        this.selectedCourses.sort((a, b) => a.minTierCat - b.minTierCat);

        await this.prepareGhostsData(roomTierSub);
        await this.prepareMap(this.selectedCourses[0].alias);
        this.resetPlayersBall();
        await this.prepareRound();
    }

    private async prepareGhostsData(roomTierSub: number) {
        const [minPercentile, maxPercentile] = getTierPercentiles(getTierFromSub(roomTierSub));
        const addresses = this.state.players.map(p => p.userId);
        try {
            const ghostsData = await fetch(API_URL + '/api/get-random-recorded-games', {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    courseAliases: this.selectedCourses.map(c => c.alias),
                    address: addresses[0],
                    //never race a friend's own recorded game while they play live
                    excludeAddresses: addresses,
                    minPercentile,
                    maxPercentile
                })
            }).then(r => r.json());
            if (Array.isArray(ghostsData) && ghostsData.length === 4) this.ghostsData = ghostsData;
        } catch (error) {
            console.log("season-party-room get-random-recorded-games error", error);
        }
    }

    private async prepareMap(courseId: string) {
        //"season" is not in the GameDefinition union, same as Season-Room's untyped call
        this.gameDefinition = {courseId, type: "season", subType: "1"};
        const originalCourseDef: any = await getCourseDefinition(this.gameDefinition, fetch, true);
        this.courseDefinition = migrateCourseDefinitionAnimations(originalCourseDef, []);
    }

    private resetPlayersBall() {
        const initialPosDef = this.courseDefinition.parts.find(p => p.type === "initial_position");
        const [x, y, z] = initialPosDef.position;
        this.state.players.forEach(player => {
            player.position.x = x;
            player.position.y = y;
            player.position.z = z;
        });
    }

    //Season-Room prepareGame, once per player instead of once per room
    private async prepareRound() {
        this.setGhostsData(this.ghostsData[this.state.currentGame] || []);

        for (const player of this.state.players) {
            if (player.left) continue;
            player.golfPlay = await creatServerGolfPlay({
                gameDefinition: this.gameDefinition,
                courseDefinition: this.courseDefinition,
                timeStep: 1 / (60 * 4)
            });
            this.listenPlayerEvents(player);
        }

        const round = this.state.currentGame;
        waitFor(() => this.disposed || this.state.currentGame !== round || this.state.started, 50).then(() => {
            if (this.disposed || this.state.currentGame !== round) return;
            this.intervalGhosts = setInterval(() => tryFn(
                () => this.reproduceGhostsFrame(),
                (error) => console.log("season-party reproduceGhostsFrame error", error)
            ), RECORDED_FRAME_MS);
        });
    }

    private setGhostsData(ghostsData: any[]) {
        this.state.ghosts.splice(0, this.state.ghosts.length);
        const firstGhostRow = this.state.players.length;
        ghostsData.forEach((ghostData, index) => {
            if (!(ghostData?.frames?.length)) {
                console.log("ghost with no frames", ghostData?.ID);
                return;
            }
            const ghost = new Ghost();
            const [, x, y, z] = ghostData.frames[0];
            ghost.position = new Vector3(x, y, z);
            ghost.velocity = new Vector3(0, 0, 0);
            this.state.results[firstGhostRow + index].name = ghost.name = ghostData.displayName;
            this.state.results[firstGhostRow + index].address = ghost.address = ghostData.address;
            this.state.ghosts.push(ghost);
        });
    }

    private listenPlayerEvents(player: PartyPlayer) {
        player.frameEventHandler.dispose();
        player.frameEventHandler = createEventManager();
        player.frameEventHandler.onEvent(EVENT.ANY, async ({type, data}) => {
            if (this.state.finished || player.holed || player.left) return;
            player.golfPlay?.updateHandlers(0);
            if (!this.state.started) return;
            if (type === EVENT.CLIENT_LOG) {
                tryFn(() => player.client?.send(MESSAGE.CLIENT_LOG, data));
            } else if (type === EVENT.OUT || type === EVENT.SLEEP) {
                this.recordIdle(player);
            } else if (type === EVENT.HOLE) {
                await this.handlePlayerHole(player);
            }
        });
    }

    private recordIdle(player: PartyPlayer) {
        player.recordPositionFrames = false;
        const position = player.golfPlay.getPhysicBall().body.position;
        player.recordedFrames.push({type: RECORDED_FRAME.IDLE, value: [position.x, position.y, position.z]});
        player.lastRecordedFrameTime = Date.now();
    }

    private async handlePlayerHole(player: PartyPlayer) {
        console.log("season-party player HOLE", player.displayName);
        const time = Date.now() - this.state.startTime;
        player.holed = true;
        player.recordPositionFrames = false;
        player.recordedFrames.push({type: RECORDED_FRAME.HOLE, value: undefined});
        player.golfPlay?.dispose();
        this.state.results[player.resultIndex].time[this.state.currentGame] = time;

        if (!this.state.countdownTime) this.startHoleCountdown();

        //only games played at the player's own level become ghosts
        if (!player.eligible) return;
        if (mustIgnoreRecording(player.recordedFrames)) {
            console.log("IGNORED RECORDING", player.displayName);
            return;
        }
        const dataToSave = {
            courseID: this.courseDefinition.ID,
            courseAlias: this.courseDefinition.alias,
            courseName: this.courseDefinition.displayName || this.courseDefinition.alias,
            address: player.userId,
            displayName: player.displayName,
            PlayFabId: player.PlayFabId,
            frames: serializeFrames(player.recordedFrames),
            time,
            shots: player.shoots
        };
        try {
            await fetch(`${API_URL}/api/recorded-game`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(dataToSave)
            });
        } catch (error) {
            console.log("season-party recorded-game error", error);
        }
    }

    //Players can load a round at slightly different speeds. The round starts
    //when every active player sent READY, or READY_WAIT_MS after the first one;
    //a late player gets the same START (and simply starts late).
    private handleReady(client: Client) {
        const player = this.getPlayer(client);
        if (!player || player.left) return;
        if (this.state.startTime !== Number.MAX_SAFE_INTEGER) {
            this.sendStart(player);
            return;
        }
        player.readyRound = this.state.currentGame;
        if (this.everyoneReady()) {
            this.scheduleStart();
        } else if (!this.readyTimeout) {
            this.readyTimeout = setTimeout(() => this.scheduleStart(), READY_WAIT_MS);
        }
    }

    //members still joining (round 0) or reconnecting are waited for too
    private everyoneReady() {
        const expected = this.state.players.filter(p => !p.left);
        return expected.length > 0 && expected.every(p => p.readyRound === this.state.currentGame);
    }

    private scheduleStart() {
        if (this.disposed || this.state.startTime !== Number.MAX_SAFE_INTEGER) return;
        this.readyTimeout && clearTimeout(this.readyTimeout);
        this.readyTimeout = null;
        if (this.state.currentGame === 0) {
            //members that never made it into the room are out from now on
            this.state.players.forEach(player => {
                if (!player.client) player.left = true;
            });
        }
        this.state.startTime = Date.now() + TIME_TO_START;
        console.log("season-party START", this.state.currentGame, new Date(this.state.startTime).toISOString());
        this.state.players
            .filter(p => this.isActive(p) && p.readyRound === this.state.currentGame)
            .forEach(p => this.sendStart(p));
    }

    private sendStart(player: PartyPlayer) {
        tryFn(() => player.client?.send(MESSAGE.START, {
            startTime: this.state.startTime,
            serverTime: Date.now(),
            courseAlias: this.courseDefinition.alias
        }));
    }

    private async handleShoot(client: Client, {impulse, timeStep, delayMs}) {
        const player = this.getPlayer(client);
        if (!player || player.left || player.holed || !player.golfPlay) return;
        if (!this.state.started || this.state.finished) return;
        const round = this.state.currentGame;

        const frames = player.recordedFrames;
        if (frames.length === 2 && frames[0].type === RECORDED_FRAME.IDLE && frames[1].type === RECORDED_FRAME.IDLE) {
            frames.shift();//same workaround as Season-Room (an OUT at start leaves 2 IDLE frames)
        }
        if (frames.length) {
            (frames[frames.length - 1].value as number[]).push(Math.ceil((Date.now() - player.lastRecordedFrameTime) / RECORDED_FRAME_MS));
        }
        frames.push({type: RECORDED_FRAME.SHOOT, value: [impulse.x, impulse.y, impulse.z]});
        player.lastRecordedFrameTime = Date.now();
        setTimeout(() => {
            player.recordPositionFrames = true;
        }, Math.max(0, delayMs - 50));
        player.shoots++;
        this.state.results[player.resultIndex].shots[round]++;

        const lastPingMs = player.lastPingMs || 0;
        const {frames: shootFrames, processingTimeMs} = player.golfPlay.getFrames({
            timeStep,
            impulse,
            delayMs: Math.max(0, delayMs - lastPingMs),
            lastPingMs
        });
        client.send(MESSAGE.SHOOT_FRAMES, {frames: shootFrames, timeStep, impulse});
        await sleep(Math.max(0, delayMs - (processingTimeMs || 0) - lastPingMs * 2));
        if (this.disposed || this.state.currentGame !== round || this.state.finished) return;
        tryFn(() => client.send(MESSAGE.START_SHOOT_FRAMES));
        await sleep(lastPingMs);
        if (this.disposed || this.state.currentGame !== round || this.state.finished || !player.golfPlay) return;

        player.golfPlay.setIdle(false);
        player.frameReproduction = createFrameReproduction({
            frames: shootFrames,
            timeStep,
            onEvent: (event) => player.frameEventHandler.trigger(event),
            onUpdateBall: ({position, velocity}) => {
                const body = player.golfPlay?.getPhysicBall()?.body;
                if (body) {
                    Object.assign(body.position, position);
                    Object.assign(body.velocity, velocity);
                }
                player.position.x = position.x;
                player.position.y = position.y;
                player.position.z = position.z;
            },
            onFinish: () => {
                player.frameReproduction = null;
            }
        });
    }

    private update(dt: number) {
        if (this.state.finished) return;
        if (!this.state.started && Date.now() > this.state.startTime) {
            console.log("season-party STARTED = TRUE", this.state.currentGame);
            this.state.started = true;
            //one hole per member still in the party, like their player_game rows
            recordHoleStart("season", this.state.players.filter(p => this.isActive(p)).map(p => p.address));
            this.publishLiveMetadata();
            this.state.players.forEach(player => {
                if (!this.isActive(player) || !player.golfPlay) return;
                player.lastRecordedFrameTime = Date.now();
                const position = player.golfPlay.getPhysicBall().body.position;
                player.recordedFrames.push({type: RECORDED_FRAME.IDLE, value: [position.x, position.y, position.z]});
            });
        }
        //one player's failure must not stop the others (nor crash the process)
        this.state.players.forEach(player => tryFn(() => {
            if (player.left || !player.golfPlay) return;
            if (player.recordPositionFrames && (Date.now() - player.lastRecordedFrameTime) > RECORDED_FRAME_MS) {
                player.lastRecordedFrameTime = Date.now();
                const {position, velocity} = player.golfPlay.getPhysicBall().body;
                player.recordedFrames.push({
                    type: RECORDED_FRAME.MOVE,
                    value: [position.x, position.y, position.z, velocity.x, velocity.y, velocity.z]
                });
            }
            player.frameReproduction?.update(dt);
            player.golfPlay.updateAnimations(dt);
        }, (error) => console.log("season-party update error", player.displayName, error)));
    }

    //Season-Room reproduceGhostsFrame, with the ghost rows after the players
    private reproduceGhostsFrame() {
        if (this.state.finished || !this.state.started) return;
        const round = this.state.currentGame;
        const firstGhostRow = this.state.players.length;
        this.state.ghosts.forEach((ghost, ghostIndex) => {
            if (ghost.finished) return;
            const ghostData = this.ghostsData[round]?.[ghostIndex];
            const frame = ghostData?.frames?.[ghost.currentFrame];
            if (!frame) {
                ghost.finished = true;
                return;
            }
            const [type] = frame;
            if (type === RECORDED_FRAME.IDLE) {
                this.ghostIdleStarTimes[ghostIndex] = this.ghostIdleStarTimes[ghostIndex] || Date.now();
                const [, , , , framesToPass] = frame;
                const timeDiffInFrames = Math.floor((Date.now() - this.ghostIdleStarTimes[ghostIndex]) / RECORDED_FRAME_MS);
                if (timeDiffInFrames > framesToPass) {
                    this.ghostIdleStarTimes[ghostIndex] = 0;
                    ghost.currentFrame++;
                }
            } else if (type === RECORDED_FRAME.MOVE) {
                const [, x, y, z, vx, vy, vz] = frame;
                ghost.velocity.x = vx;
                ghost.velocity.y = vy;
                ghost.velocity.z = vz;
                ghost.position.x = x;
                ghost.position.y = y;
                ghost.position.z = z;
                ghost.currentFrame++;
            } else if (type === RECORDED_FRAME.SHOOT) {
                if (!ghost.shooting) {
                    this.state.results[firstGhostRow + ghostIndex].shots[round]++;
                    setTimeout(() => {
                        ghost.currentFrame++;
                        ghost.shooting = false;
                    }, 400);
                }
                ghost.shooting = true;
            } else if (type === RECORDED_FRAME.HOLE) {
                this.state.results[firstGhostRow + ghostIndex].time[round] = ghostData.time;
                this.state.results[firstGhostRow + ghostIndex].shots[round] = ghostData.shots;
                if (!this.state.countdownTime) this.startHoleCountdown();
                ghost.finished = true;
            }
            ghost.frameCount++;
        });
    }

    private async startHoleCountdown() {
        this.state.countdownTime = Date.now();
        const round = this.state.currentGame;
        const countdownMs = countdownByTierCat[this.roomCat] || 30000;
        console.log("season-party startHoleCountdown", round, countdownMs);
        this.broadcast(MESSAGE.COUNTDOWN, countdownMs);
        //a player who left counts as done, so the round is not held for them
        const leftRows = () => this.state.players.filter(p => p.left).map(p => p.resultIndex);
        await Promise.race([
            sleep(countdownMs),
            waitFor(() => this.disposed || this.state.currentGame !== round || this.state.finished
                || this.state.results.every((row, index) => Number(row.time[round]) > 0 || leftRows().includes(index)))
        ]);
        if (this.disposed) return;

        this.broadcast(MESSAGE.END_COUNTDOWN);
        clearInterval(this.intervalGhosts);
        this.state.players.forEach(player => this.disposePlayerGolfPlay(player));
        this.state.finished = true;
        this.state.countdownTime = 0;

        const spentTime = Date.now() - this.state.startTime;
        this.scoreRound(round, spentTime);
        this.broadcastPatch();

        const currencyCodes = Object.values(CURRENCY).filter(i => i !== CURRENCY.COINS && i !== CURRENCY.ENERGY);
        const activePlayers = this.state.players.filter(p => this.isActive(p));
        activePlayers.forEach(player => {
            const value = 2 - fieldRank(player.fieldScores, [round]);
            const courseRewards = value > 0 ? {[getRandomFromList(currencyCodes)]: value, GC: value} : {};
            sumDrops(courseRewards, player.rewards);
            if (round !== 3) {
                tryFn(() => player.client.send(MESSAGE.COMPLETED, {
                    tierSub: undefined,
                    newTierSub: undefined,
                    rewards: courseRewards
                }));
            }
        });

        if (round === 3) {
            await Promise.all(activePlayers.map(player => this.completeRun(player).catch(error => {
                console.log("season-party completeRun error", player.displayName, error);
            })));
        } else {
            await this.prepareNext();
        }
    }

    //The shared scoreboard ranks every row (who did best); each player's own
    //season score is computed separately against the ghosts only.
    private scoreRound(round: number, spentTime: number) {
        const rows = cloneJSON(this.state.results);
        const tableScores = roundScores(rows, round, spentTime, rows.length);
        tableScores.forEach((score, index) => this.state.results[index].score[round] = score);

        const ghostRows = rows.slice(this.state.players.length);
        this.state.players.forEach(player => {
            const field = [rows[player.resultIndex], ...ghostRows];
            player.fieldScores[round] = roundScores(field, round, spentTime, NUM_SOLO_PLAYERS);
        });
    }

    private async completeRun(player: PartyPlayer) {
        const {PlayFabId} = player;
        const accumulatedValue = 2 - fieldRank(player.fieldScores, [0, 1, 2, 3]);
        const tierSubDelta = player.eligible ? accumulatedValue : 0;
        const base = JSON.parse(JSON.stringify(player.rewards));
        const [fWearables, fGolfclubs] = await promisify(PlayFabServer.GetUserReadOnlyData)({
            PlayFabId,
            Keys: ["wearablesBonus", "golfclubsBonus"]
        }).then(d => [
            1 + (Number(d.data.Data.wearablesBonus?.Value || 0) / 100),
            1 + (Number(d.data.Data.golfclubsBonus?.Value || 0) / 100)
        ]).then(ns => [isNaN(ns[0]) ? 1 : ns[0], isNaN(ns[1]) ? 1 : ns[1]]);

        const tierCatF = 1 + (this.roomCat / 5);
        Object.assign(player.rewards, mapPropertiesMultInt(player.rewards, fWearables));
        Object.assign(player.rewards, mapPropertiesMultInt(player.rewards, fGolfclubs));
        Object.assign(player.rewards, mapPropertiesMultInt(player.rewards, tierCatF));
        Object.keys(player.rewards).forEach((materialKey) => {
            if (MATERIAL_FACTOR[materialKey]) {
                player.rewards[materialKey] = Math.ceil(player.rewards[materialKey]
                    * MATERIAL_FACTOR[materialKey]
                    * (this.SEASON_REWARD_FACTOR || 0.25));
            }
        });

        console.log("season-party completeRun", player.displayName, {accumulatedValue, tierSubDelta, eligible: player.eligible});
        tryFn(() => player.client?.send(MESSAGE.COMPLETED, {
            tierSub: Math.max(0, player.tierSub),
            newTierSub: Math.max(0, player.tierSub + tierSubDelta),
            rewards: player.rewards,
            rewardsBonus: {base, wearables: fWearables, golfclubs: fGolfclubs, tier: isNaN(tierCatF) ? 0 : tierCatF},
            eligible: player.eligible
        }));

        const completion: any = await promisify(PlayFabServer.ExecuteCloudScript)({
            PlayFabId,
            FunctionName: "completeSeasonMap",
            FunctionParameter: {
                xpReward: (1 + this.roomCat) * 10,
                rewards: player.rewards,
                tierSub: tierSubDelta,
                playerTierSub: Math.max(0, player.tierSub),
                apiKey: playfabServerApiKey,
                PlayFabId
            }
        });
        //a cloudscript failure comes back inside a 200 response, never as a throw:
        //without this log a wrong PLAYFAB_API_KEY ("protected") silently drops every reward
        if (completion?.data?.Error) console.log("completeSeasonMap FAILED", PlayFabId, completion.data.Error.Error, completion.data.Error.Message);

        await fetch(`${API_URL}/api/player-game`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                apiKey: process.env.GOLF_API_KEY,
                address: player.userId,
                PlayFabId,
                startTime: this.state.seasonStartTime,
                endTime: Date.now(),
                time: Date.now() - this.state.seasonStartTime,
                gameMode: "season",
                subType: 1,
                data: null,
                rankedPoints: tierSubDelta//what this run added to tier-sub (0 above the room's level), for the stats page
            })
        });
    }

    private async prepareNext() {
        if (this.state.currentGame === 0) {
            //Season-Room charges the energy once the first round is played; a
            //player above the room's level scores no season points, so plays free
            if (await isEnergyFree()) {
                console.log("free energy week: not charging the party");
            } else {
                //ONE energy for the whole party, paid by whoever opened it
                //(user, 2026-11-04). It used to charge every member who was
                //scoring points, which made playing with friends cost the
                //group N energy for the same four holes. players[0] is the
                //host seat: the creator, or whoever took it when the creator
                //left before the start, and the room plays at that player's
                //level, so the one who pays is the one the room is built for.
                const host = this.state.players[0];
                if (host && this.isActive(host)) {
                    console.log("season-party: charging the host only", host.displayName);
                    promisify(PlayFabServer.SubtractUserVirtualCurrency)({PlayFabId: host.PlayFabId, VirtualCurrency: "EN", Amount: 1})
                        .catch(error => console.log("season-party subtract EN error", host.displayName, error));
                }
            }
        }
        this.state.currentGame++;
        this.state.finished = false;
        this.state.started = false;
        this.state.startTime = Number.MAX_SAFE_INTEGER;
        this.ghostIdleStarTimes = [0, 0, 0];
        this.state.players.forEach(player => {
            player.holed = false;
            player.shoots = 0;
            player.recordedFrames = [];
            player.recordPositionFrames = false;
            player.lastRecordedFrameTime = 0;
        });

        await this.prepareMap(this.selectedCourses[this.state.currentGame].alias);
        this.resetPlayersBall();
        await this.prepareRound();
    }

    private async markLeft(player: PartyPlayer) {
        if (player.left) return;
        console.log("season-party player left", player.displayName, "round", this.state.currentGame);
        player.left = true;
        this.disposePlayerGolfPlay(player);

        //the rest may have been waiting for this player's READY
        if (this.state.startTime === Number.MAX_SAFE_INTEGER && this.everyoneReady()) {
            this.scheduleStart();
        }

        //Season-Room abandon penalty, for players who were earning season points
        if (!player.eligible || this.state.currentGame < 2) return;
        const rounds = [0, 1, 2, 3].filter(r => player.fieldScores[r]?.length);
        const accumulatedValue = 2 - fieldRank(player.fieldScores, rounds);
        const finishedRun = this.state.currentGame >= 3 && (this.state.finished || player.holed);
        if (player.tierSub > 20 && accumulatedValue < 0 && !finishedRun) {
            console.log("SUBSTRACT tier-sub", player.displayName, accumulatedValue);
            try {
                await promisify(PlayFabServer.UpdatePlayerStatistics)({
                    PlayFabId: player.PlayFabId,
                    Statistics: [{StatisticName: "tier-sub", Value: -1}],
                    CustomTags: {"season-game-abandoned": "yes"}
                });
            } catch (error) {
                console.log("season-party abandon penalty error", error);
            }
        }
    }

    private disposePlayerGolfPlay(player: PartyPlayer) {
        tryFn(() => player.frameReproduction?.dispose());
        player.frameReproduction = null;
        tryFn(() => player.golfPlay?.dispose());
    }
}

//A player's solo difficulty: course category, ghost percentile band and hole
//countdown all derive from these two.
function isSameDifficulty(playerTier: number, roomTier: number) {
    const [playerMin, playerMax] = getTierPercentiles(playerTier);
    const [roomMin, roomMax] = getTierPercentiles(roomTier);
    return getCatFromTier(playerTier) === getCatFromTier(roomTier) && playerMin === roomMin && playerMax === roomMax;
}

//a player at the room's level (same category and band) or below it plays for
//season points; above it they would face easier players than their own
function isAtOrBelowRoomLevel(playerTier: number, roomTier: number) {
    return playerTier < roomTier || isSameDifficulty(playerTier, roomTier);
}

//Season-Room setScoresAtRound ordering, returning the scores by row index
//(the original matches rows back by name, and names can repeat here).
function roundScores(rows: any[], round: number, spentTime: number, numPlayers: number): number[] {
    const isMissingHole = (row) => !row.time[round] || row.time[round] > (spentTime + 200);
    const order = rows.map((_, index) => index).sort((ia, ib) => {
        const a = rows[ia], b = rows[ib];
        if (isMissingHole(a) && !isMissingHole(b)) return +1;
        if (!isMissingHole(a) && isMissingHole(b)) return -1;
        if (isMissingHole(a) && isMissingHole(b)) return 0;
        if (a.shots[round] === b.shots[round]) return a.time[round] - b.time[round];
        return a.shots[round] - b.shots[round];
    });
    const scores = new Array(rows.length).fill(0);
    order.forEach((rowIndex, position) => {
        scores[rowIndex] = rows[rowIndex].time[round] ? numPlayers - position : 0;
    });
    return scores;
}

//Position of the player (field index 0) among its field, summing the given
//rounds. Stable sort keeps the player ahead on ties, same as Season-Room where
//the player is results[0].
function fieldRank(fieldScores: number[][], rounds: number[]) {
    const totals = [0, 1, 2, 3].map(fieldIndex => rounds.reduce((acc, round) => acc + (fieldScores[round]?.[fieldIndex] || 0), 0));
    const order = totals.map((_, index) => index).sort((a, b) => totals[b] - totals[a]);
    return order.indexOf(0);
}

function mustIgnoreRecording(recordedFrames) {
    return recordedFrames.find(f => f.type === RECORDED_FRAME.IDLE && (f.value[3]) > getNumberOfFrames(15000, RECORDED_FPS));
}
