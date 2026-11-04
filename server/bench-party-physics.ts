// What a party member really costs the game server, so the party cap is a
// measured number and not a guess (2026-11-04).
//
// season-party-room gives every player their own cannon world with the whole
// course loaded into it, and ticks all of them together. This creates N of
// them on a real season course and reports: memory per player, how long one
// costs to build, the per-tick cost of ticking all N, and the cost of a shot,
// which is the spiky one because getFrames simulates the entire shot at once.
//
// Run from the repo root with the web API up (it fetches the course and the
// remote physics parts):
//   npx ts-node --transpile-only server/bench-party-physics.ts [N] [courseId]
import fetch from "cross-fetch";
//server.ts does both of these once at boot: without the materials every cannon
//material is null, and the gameplay handlers reach for a global CANNON
import CANNON from "cannon";
import {initializeMaterials} from "../scene/golfplay/physics/world";
import {creatServerGolfPlay} from "./rooms/golfplay-server";

(global as any).CANNON = CANNON;
initializeMaterials();
// @ts-ignore - common has @ts-nocheck in places
import {getCourseDefinition} from "../common/course-definitions/course-definition-repository";
// @ts-ignore
import {migrateCourseDefinitionAnimations} from "../common/course-animations-migration";

const N = Number(process.argv[2] || 16);
const COURSE = process.argv[3] || "mission-1";

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
const ms = (value: number) => value.toFixed(2);

(async () => {
    const gameDefinition = {courseId: COURSE, type: "season", subType: "1"} as any;
    const original: any = await getCourseDefinition(gameDefinition, fetch, true);
    const courseDefinition = migrateCourseDefinitionAnimations(original, []);
    console.log(`course ${COURSE}: ${courseDefinition.parts.length} parts\n`);

    global.gc && global.gc();
    const before = process.memoryUsage().heapUsed;
    const players: any[] = [];
    const buildTimes: number[] = [];
    for (let i = 0; i < N; i++) {
        const t = Date.now();
        players.push(await creatServerGolfPlay({gameDefinition, courseDefinition, timeStep: 1 / (60 * 4)} as any));
        buildTimes.push(Date.now() - t);
        if ((i + 1) % 8 === 0 || i === N - 1) {
            const used = process.memoryUsage().heapUsed;
            console.log(`  ${String(i + 1).padStart(3)} players: heap ${mb(used)} MB, ${mb((used - before) / (i + 1))} MB each`);
        }
    }
    const built = process.memoryUsage().heapUsed;
    console.log(`\nbuild: ${ms(buildTimes.reduce((a, b) => a + b, 0) / N)} ms each, ${ms(buildTimes.reduce((a, b) => a + b, 0))} ms for ${N}`);
    console.log(`memory: ${mb(built - before)} MB for ${N}, ${mb((built - before) / N)} MB per player`);

    // The tick the room runs for everyone, 60 times a second.
    const TICKS = 600;
    const t0 = process.hrtime.bigint();
    for (let tick = 0; tick < TICKS; tick++) players.forEach(p => p.updateAnimations(1 / 60));
    const perTick = Number(process.hrtime.bigint() - t0) / 1e6 / TICKS;
    console.log(`\ntick with ${N} players: ${ms(perTick)} ms (a 60 Hz frame is 16.67 ms, and the process serves every room)`);

    // A shot: the whole trajectory is simulated at once, which is the spike.
    const shots: number[] = [];
    for (const player of players) {
        const t = Date.now();
        try {
            player.getFrames({timeStep: 1 / (60 * 4), impulse: {x: 4, y: 0.4, z: 4}, delayMs: 0, lastPingMs: 0});
        } catch (error: any) {
            console.log("  (getFrames not callable this way:", error?.message, ")");
            break;
        }
        shots.push(Date.now() - t);
    }
    if (shots.length) {
        console.log(`shot: ${ms(shots.reduce((a, b) => a + b, 0) / shots.length)} ms each; ${N} at once would be ${ms(shots.reduce((a, b) => a + b, 0))} ms of blocked event loop`);
    }
    process.exit(0);
})().catch(error => { console.log("ERROR", error?.stack || error); process.exit(1); });
