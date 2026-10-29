// Login and account linking for clients that cannot produce Decentraland's
// signed auth chain (the Studio client). Contract: docs/contracts/login.md.
//
//   GET  /api/login-wallet/nonce?address=0x…  message to sign + expiresAt
//   POST /api/login-wallet                    {address, message, signature} -> {CustomId}
//   POST /api/link-wallet                     {sessionTicket, address, message, signature}
//
// The wallet proves itself with an EIP-191 personal_sign of a message this
// server issued; the session ticket proves which PlayFab account is logged in.
// Accounts are never merged: link-wallet moves an identity, not progress.
import crypto from "crypto";
import {promisify} from "util";
import {PlayFabServer} from "playfab-sdk";
import {PrismaClient} from "@prisma/client";
import Web3 from "web3";
import {recordVisit} from "../stats";
import {authenticateSessionTicket} from "./session-ticket";

const MESSAGE_TTL_MS = 5 * 60 * 1000;
const RATE_LIMIT = 20;            //requests per minute per IP, per route group
const RATE_WINDOW_MS = 60 * 1000;
const PRODUCT = "GolfCraft";

const web3 = new Web3();

//HMAC key for the nonce. Several web instances validate each other's nonces
//when they share LOGIN_WALLET_SECRET; without it (local dev) a random key
//only lasts this process.
const SECRET = process.env.LOGIN_WALLET_SECRET || (() => {
    console.log("LOGIN_WALLET_SECRET not set: wallet login nonces only valid on this instance");
    return crypto.randomBytes(32).toString("hex");
})();

export function authApi(router, prisma: PrismaClient){
    router.get("/api/login-wallet/nonce", rateLimited, (req, res) => {
        const address = normalizeAddress(req.query.address);
        if (!address) return res.status(400).send({error: "Malformed address"});
        const issuedAt = Date.now();
        const expiresAt = issuedAt + MESSAGE_TTL_MS;
        const message = buildMessage(address, issuedAt, expiresAt);
        return res.send({message, expiresAt});
    });

    router.post("/api/login-wallet", rateLimited, async (req, res) => {
        try{
            const address = verifyLogin(req.body);
            if (!address) return res.status(401).send({error: "Invalid login"});
            //every Studio wallet login passes here: the daily visitors of /stats
            recordVisit(prisma, address);
            const PlayFabId = await findAccountByAddress(address);
            const CustomId = PlayFabId ? await getCustomId(PlayFabId) : generateString(100);
            return res.send({CustomId});
        }catch(error){
            console.log("/api/login-wallet error", error?.message || error);
            return res.status(500).send({error: "Login failed"});
        }
    });

    router.post("/api/link-wallet", rateLimited, async (req, res) => {
        try{
            const current = await authenticateSessionTicket(req.body?.sessionTicket);
            if (!current) return res.status(401).send({error: "Invalid session"});
            const address = verifyLogin(req.body);
            if (!address) return res.status(401).send({error: "Invalid login"});

            const walletAccount = await findAccountByAddress(address);
            if (!walletAccount) {
                //the wallet is new: it becomes this account's address, as
                //initializePlayer does for the scene (CLAUDE.md §6 #24)
                await promisify(PlayFabServer.AddGenericID)({
                    PlayFabId: current,
                    GenericId: {ServiceName: "address", UserId: address}
                });
                await promisify(PlayFabServer.UpdateUserData)({PlayFabId: current, Data: {address}});
                return res.send({linked: true});
            }
            if (walletAccount === current) return res.send({linked: true});

            const walletProgress = await getProgress(prisma, walletAccount);
            const currentProgress = await getProgress(prisma, current);
            if (currentProgress.hasProgress && req.body?.abandonCurrent !== true) {
                //PlayFab cannot merge accounts: the client shows both and the
                //wallet account always wins (Decentraland progress is kept)
                return res.status(409).send({
                    error: "both-have-progress",
                    wallet: walletProgress.summary,
                    current: currentProgress.summary
                });
            }
            //the current account is left behind (empty, or abandoned on request):
            //the client continues as the wallet account
            return res.send({linked: false, CustomId: await getCustomId(walletAccount)});
        }catch(error){
            console.log("/api/link-wallet error", error?.message || error);
            return res.status(500).send({error: "Link failed"});
        }
    });
}

function buildMessage(address: string, issuedAt: number, expiresAt: number){
    return [
        `${PRODUCT} login`,
        `Address: ${address}`,
        `Nonce: ${nonceFor(address, issuedAt)}`,
        `Issued at: ${new Date(issuedAt).toISOString()}`,
        `Expires at: ${new Date(expiresAt).toISOString()}`
    ].join("\n");
}

function nonceFor(address: string, issuedAt: number){
    return crypto.createHmac("sha256", SECRET).update(`${address}${issuedAt}`).digest("hex").slice(0, 32);
}

//Nonces already accepted inside their window, so a captured login cannot be
//replayed. Pruned on every write.
const usedNonces = new Map<string, number>();
function consumeNonce(nonce: string, expiresAt: number){
    const now = Date.now();
    usedNonces.forEach((exp, n) => { if (exp < now) usedNonces.delete(n); });
    if (usedNonces.has(nonce)) return false;
    usedNonces.set(nonce, expiresAt);
    return true;
}

//Checks {address, message, signature}; returns the lowercase address or null.
//Failures are not explained to the caller.
function verifyLogin(body: any): string | null {
    const address = normalizeAddress(body?.address);
    const {message, signature} = body || {};
    if (!address || typeof message !== "string" || typeof signature !== "string") return null;

    const lines = message.split("\n");
    const field = (label) => lines.find(l => l.startsWith(`${label}: `))?.slice(label.length + 2);
    if (lines[0] !== `${PRODUCT} login`) return null;
    if (field("Address") !== address) return null;
    const issuedAt = Date.parse(field("Issued at") || "");
    const expiresAt = Date.parse(field("Expires at") || "");
    if (!issuedAt || !expiresAt || expiresAt !== issuedAt + MESSAGE_TTL_MS) return null;
    if (Date.now() > expiresAt) return null;
    const nonce = field("Nonce");
    if (!nonce || nonce !== nonceFor(address, issuedAt)) return null;
    if (message !== buildMessage(address, issuedAt, expiresAt)) return null;

    let recovered;
    try{
        recovered = web3.eth.accounts.recover(message, signature);
    }catch(error){
        return null;
    }
    if (typeof recovered !== "string" || recovered.toLowerCase() !== address) return null;
    if (!consumeNonce(nonce, expiresAt)) return null;
    return address;
}

function normalizeAddress(value: any): string | null {
    if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) return null;
    return value.toLowerCase();
}

//Same lookup as /api/get-login-id: the account whose "address" generic ID is
//the wallet, or null for an unknown wallet.
async function findAccountByAddress(address: string): Promise<string | null> {
    const [{PlayFabId}] = await promisify(PlayFabServer.GetPlayFabIDsFromGenericIDs)({
        GenericIDs: [{ServiceName: "address", UserId: address}]
    }).then(r => r.data.Data);
    return PlayFabId || null;
}

async function getCustomId(PlayFabId: string): Promise<string> {
    const {CustomIdInfo} = await promisify(PlayFabServer.GetUserAccountInfo)({PlayFabId}).then(r => r.data.UserInfo);
    return CustomIdInfo?.CustomId;
}

//"Progress" per docs/contracts/login.md: xp, a rank, a mission past the
//first, or any recorded game.
async function getProgress(prisma: PrismaClient, PlayFabId: string){
    const [xp, stats, games, recorded] = await Promise.all([
        promisify(PlayFabServer.GetUserReadOnlyData)({PlayFabId, Keys: ["xp"]})
            .then(r => Number(r.data.Data?.xp?.Value || 0)),
        promisify(PlayFabServer.GetPlayerStatistics)({PlayFabId, StatisticNames: ["tier-sub", "current_mission"]})
            .then(r => Object.fromEntries((r.data.Statistics || []).map(s => [s.StatisticName, s.Value]))),
        prisma.player_game.count({where: {PlayFabId}}),
        prisma.recorded_game.count({where: {PlayFabId}})
    ]);
    const tierSub = Number(stats["tier-sub"] || 0);
    const currentMission = Number(stats["current_mission"] || 1);
    return {
        hasProgress: xp > 0 || tierSub > 0 || currentMission > 1 || games > 0 || recorded > 0,
        summary: {xp, tierSub, currentMission, games}
    };
}

const hits = new Map<string, {count: number, windowStart: number}>();
function rateLimited(req, res, next){
    const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "?";
    const now = Date.now();
    const hit = hits.get(ip);
    if (!hit || now - hit.windowStart > RATE_WINDOW_MS) {
        hits.set(ip, {count: 1, windowStart: now});
    } else if (++hit.count > RATE_LIMIT) {
        return res.status(429).send({error: "Too many requests"});
    }
    if (hits.size > 10000) hits.forEach((h, k) => { if (now - h.windowStart > RATE_WINDOW_MS) hits.delete(k); });
    return next();
}

function generateString(length: number){
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += characters.charAt(crypto.randomInt(characters.length));
    }
    return result;
}
