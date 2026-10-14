import {Client, matchMaker, Room} from "colyseus";
import {ArraySchema, Schema, type} from "@colyseus/schema";
import {PlayFabServer} from "playfab-sdk";
import {promisify} from "util";
import MESSAGE from "./mesages";
import {tryFn} from "../../common/utils";
import {createPartyToken, registerParty} from "./season-party-registry";
import {gameClosedMessage, getGameAccessFor} from "../game-window-gate";

// "Play ranked with friends" waiting room. One instance, one waiting party:
// nobody can create another until this one is cancelled or starts.
//
//   - members[0] is always the host. If the host leaves before the start, the
//     next member becomes host (can cancel or start).
//   - 1 member and no change for PARTY_IDLE_MS -> cancelled.
//   - 2+ members and no change in the count for PARTY_IDLE_MS -> started.
//   - The host can start at any time with 2+ members.
// On start the slot is freed right away, so a new party can form.
const MAX_PARTY_PLAYERS = 4;
const PARTY_IDLE_MS = 60000;

class PartyMemberState extends Schema {
    @type("string")
    address: string;

    @type("string")
    displayName: string;

    @type("number")
    tierSub: number;

    userId: string;
    PlayFabId: string;
    client: Client;

    constructor({address, userId, displayName, tierSub, PlayFabId, client}) {
        super();
        this.address = address;
        this.userId = userId;
        this.displayName = displayName;
        this.tierSub = tierSub;
        this.PlayFabId = PlayFabId;
        this.client = client;
    }
}

class SeasonPartyLobbyState extends Schema {
    @type([PartyMemberState])
    members = new ArraySchema<PartyMemberState>();

    //a party is waiting in the slot
    @type("boolean")
    open = false;

    //the host (or the idle timer) started it and the game room is being created
    @type("boolean")
    starting = false;

    //seconds until auto-cancel (1 member) or auto-start (2+ members)
    @type("uint8")
    secondsLeft = 0;

    lastCountChange = 0;
}

class PartyError extends Error {}

export class SeasonPartyLobbyRoom extends Room<SeasonPartyLobbyState> {
    private interval: ReturnType<typeof setInterval>;
    private users = new Map<string, any>();

    onCreate() {
        this.setState(new SeasonPartyLobbyState());

        this.onMessage(MESSAGE.PARTY_CREATE, (client) => this.handle(client, async () => {
            if (this.isSlotTaken()) throw new PartyError("A party is already waiting, join it or wait until it starts");
            const member = await this.resolveMember(client);
            //re-check after the PlayFab round trip: another CREATE may have won
            if (this.isSlotTaken()) throw new PartyError("A party is already waiting, join it or wait until it starts");
            this.state.members.push(member);
            this.state.open = true;
            this.touch();
        }));

        this.onMessage(MESSAGE.PARTY_JOIN, (client) => this.handle(client, async () => {
            if (!this.state.open || this.state.starting) throw new PartyError("There is no party waiting");
            const member = await this.resolveMember(client);
            if (!this.state.open || this.state.starting) throw new PartyError("There is no party waiting");
            if (this.state.members.find(m => m.address === member.address)) throw new PartyError("You are already in the party");
            if (this.state.members.length >= MAX_PARTY_PLAYERS) throw new PartyError("The party is full");
            this.state.members.push(member);
            this.touch();
        }));

        this.onMessage(MESSAGE.PARTY_LEAVE, (client) => this.handle(client, async () => {
            this.removeMember(client);
        }));

        this.onMessage(MESSAGE.PARTY_CANCEL, (client) => this.handle(client, async () => {
            if (!this.isHost(client) || this.state.starting) return;
            this.cancelParty("host");
        }));

        this.onMessage(MESSAGE.PARTY_START, (client) => this.handle(client, async () => {
            if (!this.isHost(client)) return;
            if (this.state.members.length < 2) throw new PartyError("Wait for at least one friend to join");
            await this.startParty();
        }));

        this.interval = setInterval(() => tryFn(() => this.checkIdle(), (error) => console.log("season-party-lobby checkIdle error", error)), 1000);
    }

    onJoin(client: Client, {user}: any = {}) {
        this.users.set(client.sessionId, user);
    }

    onLeave(client: Client) {
        this.users.delete(client.sessionId);
        this.removeMember(client);
    }

    onDispose() {
        clearInterval(this.interval);
    }

    private isSlotTaken() {
        return this.state.open || this.state.starting;
    }

    private isHost(client: Client) {
        return this.state.members[0]?.client === client;
    }

    //any change in the member count restarts the idle countdown
    private touch() {
        this.state.lastCountChange = Date.now();
        this.state.secondsLeft = Math.ceil(PARTY_IDLE_MS / 1000);
    }

    private reset() {
        this.state.members.splice(0, this.state.members.length);
        this.state.open = false;
        this.state.starting = false;
        this.state.secondsLeft = 0;
    }

    private removeMember(client: Client) {
        if (this.state.starting) return;
        const index = this.state.members.findIndex(m => m.client === client);
        if (index === -1) return;
        //removing members[0] makes the next one the host
        this.state.members.splice(index, 1);
        if (!this.state.members.length) {
            this.reset();
        } else {
            this.touch();
        }
    }

    private cancelParty(reason: string) {
        console.log("season-party-lobby cancel", reason);
        this.state.members.forEach(m => safeSend(m.client, MESSAGE.PARTY_CANCELLED, {reason}));
        this.reset();
    }

    private checkIdle() {
        if (!this.state.open || this.state.starting) return;
        const elapsed = Date.now() - this.state.lastCountChange;
        this.state.secondsLeft = Math.max(0, Math.ceil((PARTY_IDLE_MS - elapsed) / 1000));
        if (elapsed < PARTY_IDLE_MS) return;
        if (this.state.members.length > 1) {
            this.startParty().catch(error => console.log("season-party-lobby auto start error", error));
        } else {
            this.cancelParty("timeout");
        }
    }

    private async startParty() {
        if (!this.state.open || this.state.starting || this.state.members.length < 2) return;
        this.state.starting = true;
        const members = this.state.members.map(m => ({
            address: m.address,
            userId: m.userId,
            displayName: m.displayName,
            PlayFabId: m.PlayFabId,
            token: createPartyToken(),
            client: m.client
        }));
        try {
            const partyId = registerParty(members.map(({client, ...member}) => member));
            const room = await matchMaker.createRoom("season-party-room", {partyId});
            console.log("season-party-lobby started", room.roomId, members.map(m => m.displayName));
            members.forEach(m => safeSend(m.client, MESSAGE.PARTY_STARTED, {roomId: room.roomId, token: m.token}));
        } catch (error) {
            console.log("season-party-lobby start error", error);
            members.forEach(m => safeSend(m.client, MESSAGE.PARTY_ERROR, "Could not start the party"));
        } finally {
            this.reset();
        }
    }

    //Same identity source as Season-Room: the user object sent on join,
    //resolved to a PlayFab account by wallet address.
    private async resolveMember(client: Client) {
        const user = this.users.get(client.sessionId);
        const address = user?.publicKey;
        if (!address) throw new PartyError("Connect a wallet to play ranked");
        //monthly game window: no new party outside it, unless allow-listed. A
        //party that already formed may still start (startParty doesn't check).
        const access = await getGameAccessFor(address);
        if (!access.open) throw new PartyError(gameClosedMessage(access));
        const [{PlayFabId}] = await promisify(PlayFabServer.GetPlayFabIDsFromGenericIDs)({
            GenericIDs: [{ServiceName: "address", UserId: address}]
        }).then(r => r.data.Data);
        if (!PlayFabId) throw new PartyError("No GolfCraft account for this wallet");
        const [tierSub, energy] = await Promise.all([
            promisify(PlayFabServer.GetPlayerStatistics)({PlayFabId, StatisticNames: ["tier-sub"]})
                .then(r => r.data.Statistics[0]?.Value || 0),
            promisify(PlayFabServer.GetUserInventory)({PlayFabId})
                .then(r => Number(r.data.VirtualCurrency?.EN || 0))
        ]);
        if (energy < 1) throw new PartyError("You need 1 energy to play ranked");
        return new PartyMemberState({
            address,
            userId: user.userId,
            displayName: user.displayName,
            tierSub,
            PlayFabId,
            client
        });
    }

    private async handle(client: Client, fn: () => Promise<void>) {
        try {
            await fn();
        } catch (error) {
            if (!(error instanceof PartyError)) console.log("season-party-lobby error", error);
            safeSend(client, MESSAGE.PARTY_ERROR, error instanceof PartyError ? error.message : "Something went wrong");
        }
    }
}

function safeSend(client: Client, type: MESSAGE, message?: any) {
    tryFn(() => client?.send(type, message));
}
