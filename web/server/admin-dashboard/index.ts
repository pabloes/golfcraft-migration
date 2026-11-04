// The owner's dashboard at golfcraftgame.com/admin-dashboard (user request,
// 2026-11-04): the two things he actually does from the admin, with controls
// instead of a JSON box.
//
//   1. turn the events on and off (the `config` rows freeEnergy, giveaway,
//      gameWindow, partyMaxPlayers, currentSeasonCollectionId, marketReport)
//   2. send one message to everybody in the game, which the colyseus monitor
//      could only do to one client at a time
//
// AdminJS at /admin stays: it is the generic database editor and the only way
// to reach the other tables. This page is a standalone HTML file plus its own
// JSON API, like stats/ and market/, so there is no client rebuild.
//
// AUTHENTICATION: one password in ADMIN_DASHBOARD_PASSWORD (the older
// ADMIN_DASHBOARD_TOKEN is still read, so an existing deploy keeps working
// until that variable is removed), sent as the `x-admin-token` header, never
// a query string, which ends up in access logs. With none set, every route
// here REFUSES, page included: an admin page that falls open on a missing env
// var is worse than no admin page. Nothing here ever answers with a secret,
// and it is not in the page's HTML: the owner types it and the browser keeps
// it in sessionStorage.
//
// Nothing the public can reach names an environment variable. A stranger who
// finds this URL gets "wrong password" and no hint about how it is wired
// (user, 2026-11-04); the operator's detail goes to the server log instead.
//
// `gameWindow` carries the wallet allow-list, which is why /api/config filters
// it out. It is served HERE, to an authenticated caller only.
import path from "path";
import * as crypto from "crypto";
import fetch from "cross-fetch";
import {PrismaClient} from "@prisma/client";
import {SERVER_HTTP_URL} from "../../../common/constants";
import {FreeEnergyConfig, getFreeEnergyStatus} from "../../../common/free-energy";
import {GameWindowConfig, getGameWindowStatus} from "../../../common/game-window";

const PAGE = path.resolve(__dirname, "dashboard.html");
//a 4-character password on a public URL guarding a broadcast to every
//player is not a password; refuse rather than pretend it is one
const TOKEN_MIN = 12;
const WS_TIMEOUT_MS = 5000;
//the config table's key column is VARCHAR(45)
const KEY_MAX = 45;
const WALLET = /^0x[0-9a-fA-F]{40}$/;
const WALLETS_MAX = 500;
//what the scene's toast can show without being cut, and what the game server
//accepts (server/server.ts ADMIN_MESSAGE_MAX)
export const BROADCAST_MAX = 300;

type Ok = {value: any};
type Bad = {error: string};
type Checked = Ok | Bad;
const bad = (error: string): Bad => ({error});
const isBad = (checked: any): checked is Bad => !!checked && typeof checked.error === "string";

type KnownKey = {
    //which control the page draws; "json" is the raw fallback
    kind: "window" | "gameWindow" | "number" | "json",
    label: string,
    help: string,
    check: (value: any) => Checked
};

const plainObject = (value: any) => !!value && typeof value === "object" && !Array.isArray(value);

//A date as the admin should store it: an ISO instant in UTC. The page sends
//whatever the browser's datetime picker produced, so it is normalised here and
//not there: the row is read by the scene, the web API and the game server.
//"" is an absent date, which is a valid state; anything unparseable is not.
function checkIso(value: any): {iso: string | null} | Bad {
    if (value === undefined || value === null || value === "") return {iso: null};
    const at = Date.parse(String(value));
    if (!isFinite(at)) return bad("not a date");
    return {iso: new Date(at).toISOString()};
}

// {"from","to"} / {"enabled":bool}: the shape freeEnergy (common/free-energy.ts)
// and giveaway (scene/src/services/giveaway.ts) share. Unknown keys are refused
// rather than stored, because a typo in this row reads as "the event is off".
function checkWindow(value: any): Checked {
    if (!plainObject(value)) return bad(`expected an object like {"from":"…","to":"…"} or {"enabled":false}`);
    const extra = Object.keys(value).filter(key => !["from", "to", "enabled"].includes(key));
    if (extra.length) return bad(`unexpected keys: ${extra.join(", ")} (only from, to, enabled)`);
    const out: FreeEnergyConfig = {};
    if (value.enabled !== undefined) {
        if (typeof value.enabled !== "boolean") return bad("enabled must be true or false");
        out.enabled = value.enabled;
    }
    for (const field of ["from", "to"] as const) {
        const checked = checkIso(value[field]);
        if (isBad(checked)) return bad(`${field} is not a date`);
        if (checked.iso !== null) out[field] = checked.iso;
    }
    if (out.from && out.to && Date.parse(out.to) <= Date.parse(out.from)) return bad("to must be after from");
    if (!out.from !== !out.to) return bad("give both from and to, or neither");
    if (!out.from && out.enabled === undefined) return bad(`empty: give dates, or {"enabled":true}`);
    return {value: out};
}

function checkWallets(list: any, field: string): string[] | Bad {
    if (list === undefined || list === null) return [];
    if (!Array.isArray(list)) return bad(`${field} must be a list of wallets`);
    if (list.length > WALLETS_MAX) return bad(`${field} is limited to ${WALLETS_MAX} wallets`);
    const out: string[] = [];
    for (const entry of list) {
        const wallet = String(entry ?? "").trim().toLowerCase();
        if (!wallet) continue;
        if (!WALLET.test(wallet)) return bad(`${wallet.slice(0, 12)}… is not a wallet address`);
        if (!out.includes(wallet)) out.push(wallet);
    }
    return out;
}

function checkGameWindow(value: any): Checked {
    if (!plainObject(value)) return bad("expected an object");
    const extra = Object.keys(value).filter(key => !["fromDay", "toDay", "force", "allowWallets"].includes(key));
    if (extra.length) return bad(`unexpected keys: ${extra.join(", ")}`);
    const out: GameWindowConfig = {};
    //the same bounds common/game-window.ts clamps to, so what is stored is
    //what takes effect: no month has fewer than 28 days
    const fromDay = Math.floor(Number(value.fromDay ?? 1));
    const toDay = Math.floor(Number(value.toDay ?? 7));
    if (!isFinite(fromDay) || fromDay < 1 || fromDay > 28) return bad("fromDay must be a day from 1 to 28");
    if (!isFinite(toDay) || toDay < fromDay || toDay > 31) return bad(`toDay must be a day from ${fromDay} to 31`);
    out.fromDay = fromDay;
    out.toDay = toDay;
    if (value.force !== undefined && value.force !== null) {
        if (value.force !== "open" && value.force !== "closed") return bad(`force must be "open", "closed" or null`);
        out.force = value.force;
    } else {
        out.force = null;
    }
    const wallets = checkWallets(value.allowWallets, "allowWallets");
    if (!Array.isArray(wallets)) return wallets;
    out.allowWallets = wallets;
    return {value: out};
}

function checkNumber(min: number, max: number) {
    return (value: any): Checked => {
        const asked = Math.floor(Number(value));
        if (!isFinite(asked)) return bad("expected a number");
        if (asked < min || asked > max) return bad(`expected a number from ${min} to ${max}`);
        return {value: asked};
    };
}

function checkMarketReport(value: any): Checked {
    if (!plainObject(value)) return bad("expected an object");
    const extra = Object.keys(value).filter(key => !["creators", "extraContracts", "hidden"].includes(key));
    if (extra.length) return bad(`unexpected keys: ${extra.join(", ")}`);
    const out: any = {};
    for (const field of ["creators", "hidden"] as const) {
        if (value[field] === undefined) continue;
        const wallets = checkWallets(value[field], field);
        if (!Array.isArray(wallets)) return wallets;
        out[field] = wallets;
    }
    if (value.extraContracts !== undefined) {
        if (!Array.isArray(value.extraContracts)) return bad("extraContracts must be a list");
        out.extraContracts = [];
        for (const entry of value.extraContracts) {
            const address = String(entry?.address ?? "").trim().toLowerCase();
            if (!WALLET.test(address)) return bad(`extraContracts: ${address.slice(0, 12)}… is not a contract address`);
            out.extraContracts.push({address, name: String(entry?.name ?? "").slice(0, 120)});
        }
    }
    return {value: out};
}

//Only these rows get a control of their own, and only these can be CREATED or
//DELETED here. Every other row (the 3D panels, statsPlayFabAccounts) can be
//edited as raw JSON but not created: a new key typed by hand is far more often
//a typo than an intention, and AdminJS is still there for a genuinely new one.
const KNOWN: {[key: string]: KnownKey} = {
    freeEnergy: {
        kind: "window",
        label: "Free Energy",
        help: "While it runs a Ranked run costs no Energy. With both dates it ends by itself. Energy is the only limit on season points, so keep it short.",
        check: checkWindow
    },
    giveaway: {
        kind: "window",
        label: "Giveaway campaign",
        help: "Shows the poster on the Season card, in the lobby HUD and on the sign by the Season wall. The poster image itself is in the scene, so a new campaign still needs a deploy.",
        check: checkWindow
    },
    gameWindow: {
        kind: "gameWindow",
        label: "Game window",
        help: "The days of each month when a match can START, UTC. A match already running is never cut. Allow-listed wallets play any day.",
        check: checkGameWindow
    },
    partyMaxPlayers: {
        kind: "number",
        //server/party-size.ts clamps to MIN_MAX..HARD_MAX whatever is here
        label: "Ranked party size",
        help: "How many friends can share a Ranked party. The game server clamps it to 2..100 and reads it within a minute; every player costs about 2 MB of server physics.",
        check: checkNumber(2, 100)
    },
    currentSeasonCollectionId: {
        kind: "number",
        label: "Season collection",
        help: "Which wearable collection the current season awards (4 MOUNTAIN, 5 COCOBAY). The lobby dialog shows its name next to Season.",
        check: checkNumber(1, 999)
    },
    marketReport: {
        kind: "json",
        label: "Market report sources",
        help: `Extra collections for /market-report: {"creators":["0x…"],"extraContracts":[{"address":"0x…","name":"…"}],"hidden":["0x…"]}. No row means the two GolfCraft creator wallets.`,
        check: checkMarketReport
    }
};

export function adminDashboardApi(router, prisma: PrismaClient) {
    const token = process.env.ADMIN_DASHBOARD_PASSWORD || process.env.ADMIN_DASHBOARD_TOKEN || "";
    const configured = token.length >= TOKEN_MIN;
    //never the value, and never a hint of how wrong it is beyond the length rule
    if (!token) console.log("ADMIN_DASHBOARD_PASSWORD is not set: /admin-dashboard will refuse every request");
    else if (!configured) console.log(`ADMIN_DASHBOARD_PASSWORD is shorter than ${TOKEN_MIN} characters: /admin-dashboard will refuse every request`);

    function sameToken(given: any): boolean {
        const a = Buffer.from(String(given ?? ""), "utf8");
        const b = Buffer.from(token, "utf8");
        //timingSafeEqual throws on a length mismatch, and the length is not the secret
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    }

    function requireToken(req, res, next) {
        res.set("Cache-Control", "no-store");
        if (!configured) return res.status(503).send({error: "this page is not available"});
        if (!sameToken(req.header("x-admin-token"))) return res.status(401).send({error: "wrong password"});
        next();
    }

    //The page carries no token, so serving it leaks nothing; it still refuses
    //when unconfigured, so a missing env var is visible instead of showing a
    //dashboard whose every button answers 503.
    router.get("/admin-dashboard", (req, res) => {
        res.set("Cache-Control", "no-store");
        //the operator reads the reason in the log; a stranger reads nothing
        if (!configured) return res.status(503).type("text/plain").send("This page is not available.");
        return res.sendFile(PAGE);
    });

    //what the page calls with the token the owner typed, before drawing anything
    router.post("/api/admin-dashboard/session", requireToken, (req, res) => res.send({ok: true}));

    router.get("/api/admin-dashboard/state", requireToken, async (req, res) => {
        try {
            const rows = await prisma.config.findMany();
            const byKey: {[key: string]: any} = {};
            const listed = rows.map(({ID, key, value}) => {
                const name = String(key ?? "");
                let parsed: any = null;
                let parseError: string | null = null;
                try {
                    parsed = JSON.parse(String(value ?? "null"));
                } catch (error: any) {
                    parseError = "the stored value is not valid JSON";
                }
                if (name && !parseError) byKey[name] = parsed;
                return {ID, key: name, value: String(value ?? ""), parsed, parseError, known: !!KNOWN[name]};
            }).sort((a, b) => Number(!!KNOWN[b.key]) - Number(!!KNOWN[a.key]) || a.key.localeCompare(b.key));

            const now = Date.now();
            return res.send({
                now,
                rows: listed,
                //the page shows what the row MEANS right now, computed by the
                //same functions the game reads it with
                status: {
                    freeEnergy: getFreeEnergyStatus(byKey.freeEnergy, now),
                    //the same shape, so the same evaluator; the scene falls back
                    //to the dates compiled into it when the row has none
                    giveaway: getFreeEnergyStatus(byKey.giveaway, now),
                    gameWindow: getGameWindowStatus(byKey.gameWindow, now),
                    allowedWallets: (byKey.gameWindow?.allowWallets || []).length
                },
                //the spec the page draws its controls from; `check` stays here
                known: Object.keys(KNOWN).map(key => {
                    const {kind, label, help} = KNOWN[key];
                    return {key, kind, label, help};
                })
            });
        } catch (error: any) {
            console.log("/api/admin-dashboard/state error", error?.message);
            return res.status(500).send({error: "could not read the config table"});
        }
    });

    router.put("/api/admin-dashboard/config", requireToken, async (req, res) => {
        try {
            const key = String(req.body?.key ?? "").trim();
            if (!key || key.length > KEY_MAX) return res.status(400).send({error: "missing or oversized key"});
            const known = KNOWN[key];
            const existing = await prisma.config.findFirst({where: {key}});
            if (!known && !existing) return res.status(400).send({error: `${key} is not one of this dashboard's settings; create a new row in /admin`});

            const checked: Checked = known ? known.check(req.body?.value) : checkAnyJson(req.body?.value);
            if (isBad(checked)) return res.status(400).send({error: checked.error});
            const value = JSON.stringify(checked.value);

            if (existing) await prisma.config.update({where: {ID: existing.ID}, data: {value}});
            else await prisma.config.create({data: {key, value}});
            //the value is not a secret: these rows are what /api/config serves
            console.log("admin dashboard set config", key, "=", value.slice(0, 200));
            return res.send({key, value, parsed: checked.value});
        } catch (error: any) {
            console.log("/api/admin-dashboard/config error", error?.message);
            return res.status(500).send({error: "could not write the config table"});
        }
    });

    //Removing the row is how an event goes back to its default ("no row at
    //all" is a documented state for every one of these), so it needs to be
    //reachable without opening AdminJS. Known keys only: deleting a 3D panel's
    //row by accident would make a sign disappear from the world.
    router.delete("/api/admin-dashboard/config/:key", requireToken, async (req, res) => {
        try {
            const key = String(req.params.key ?? "");
            if (!KNOWN[key]) return res.status(400).send({error: `${key} cannot be removed from here`});
            const {count} = await prisma.config.deleteMany({where: {key}});
            console.log("admin dashboard removed config", key, count);
            return res.send({key, removed: count});
        } catch (error: any) {
            console.log("/api/admin-dashboard/config delete error", error?.message);
            return res.status(500).send({error: "could not write the config table"});
        }
    });

    //The game server is a different service, so the browser never talks to it:
    //the dashboard token stops here and GOLF_API_KEY (which the browser must
    //never see) is what authenticates this hop.
    router.post("/api/admin-dashboard/broadcast", requireToken, async (req, res) => {
        const message = String(req.body?.message ?? "").trim();
        if (!message) return res.status(400).send({error: "write a message first"});
        if (message.length > BROADCAST_MAX) return res.status(400).send({error: `at most ${BROADCAST_MAX} characters`});
        if (!process.env.GOLF_API_KEY) return res.status(503).send({error: "GOLF_API_KEY is not set on the web service"});
        try {
            const answer = await askGameServer("/admin-broadcast", {message, timeout: req.body?.timeout});
            //"nobody is in the lobby room" is the game server's own answer, not a
            //gateway failure: keep its status so the page shows the real reason
            return res.status(answer.status).send(answer.body);
        } catch (error: any) {
            console.log("admin broadcast could not reach the game server", error?.message);
            return res.status(502).send({error: error?.message === "timeout"
                ? "the game server did not answer in time"
                : "the game server could not be reached"});
        }
    });

    //rooms and clients, i.e. what the colyseus monitor shows, without giving
    //the dashboard the monitor's password
    router.get("/api/admin-dashboard/server", requireToken, async (req, res) => {
        if (!process.env.GOLF_API_KEY) return res.send({error: "GOLF_API_KEY is not set on the web service"});
        try {
            //200 whatever happened: the page draws this panel beside the rest and
            //a game server that is down is a line in it, not a failed page
            return res.send((await askGameServer("/admin-status", {})).body);
        } catch (error: any) {
            return res.send({error: "the game server did not answer"});
        }
    });

    async function askGameServer(route: string, body: any): Promise<{status: number, body: any}> {
        //cross-fetch is node-fetch here: no AbortController, so race a timer
        //(the same shape server/party-size.ts uses)
        return await Promise.race([
            fetch(`${SERVER_HTTP_URL}${route}`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({...body, apiKey: process.env.GOLF_API_KEY})
            }).then(async r => {
                //A game server without these routes answers 404 with an HTML
                //error page, and parsing that as JSON used to surface as "the
                //game server did not answer", which blames the network for a
                //server that answered perfectly well (user, 2026-11-04).
                const text = await r.text();
                try {
                    return {status: r.status, body: JSON.parse(text)};
                } catch (_) {
                    return {
                        status: r.status,
                        body: {error: r.status === 404
                            ? "the game server does not have this route yet: it needs deploying"
                            : `the game server answered ${r.status}`}
                    };
                }
            }),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), WS_TIMEOUT_MS))
        ]);
    }
}

//the raw fallback for a row with no control of its own: it only has to be
//storable JSON, since this dashboard does not know what reads it
function checkAnyJson(value: any): Checked {
    if (value === undefined) return bad("missing value");
    try {
        const text = JSON.stringify(value);
        if (text === undefined) return bad("that value cannot be stored as JSON");
        return {value};
    } catch (error: any) {
        return bad("that value cannot be stored as JSON");
    }
}
