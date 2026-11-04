// Who owns every GolfCraft golf club NFT, kept current from the contract's own
// Transfer events (2026-11-04, user request: "quiero que indexe y actualice a
// cada cambio/transfer del contrato").
//
// Why this exists. Club ownership had two readers and both were broken in
// their own way: the scene read the contract live at every boot (correct but
// fragile, see §6 #39, and 19 RPC calls for a holder of 9 clubs), and the
// lobby room's daily energy bonus for NFT holders read a The Graph subgraph
// that has had no indexer allocated since January, so it silently paid nobody.
// One index in our own MySQL serves both, instantly and without an RPC in the
// request path.
//
// How it keeps up. The seed reads the CURRENT state straight from the contract
// (totalSupply, then ownerOf per token), so there is no deployment-block
// archaeology and no million-block backfill. After that each tick asks for the
// Transfer logs since the last indexed block and applies them in order; a
// mint (from the zero address) also reads the token's model once, since
// getGolfclubId never changes after issue. A full re-seed every hour corrects
// anything a chain reorg could have left behind, which the forward-only log
// scan cannot do by itself.
//
// Cost: one eth_getLogs per tick (plus the hourly re-seed), for the whole
// collection and every player, instead of one RPC round per player per login.
import fetch from "cross-fetch";
import {PrismaClient} from "@prisma/client";
import {GOLFCLUB_CONTRACT, POLYGON_RPC} from "../../../common/constants";

//Transfer(address indexed from, address indexed to, uint256 indexed tokenId)
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO = "0x0000000000000000000000000000000000000000";

const SELECTOR = {
    totalSupply: "0x18160ddd",
    //ERC721Enumerable: the i-th token that EXISTS, so a burn leaves no gap and
    //no token above the supply is missed. Enumerating 0..totalSupply-1 as ids
    //would do both wrong.
    tokenByIndex: "0x4f6ccce7",
    ownerOf: "0x6352211e",
    getGolfclubId: "0x1f56940f"
};

//public RPCs cap eth_getLogs at 10k blocks; Polygon does ~43k blocks a day
const LOG_CHUNK = 9000;
//so one catch-up tick cannot run for ever if the service was down for days
const MAX_CHUNKS_PER_TICK = 20;
//sub-calls per JSON-RPC batch, server side (Node's fetch, not the explorer's)
const BATCH = 100;
const FETCH_TIMEOUT_MS = 20000;
//the chain can reorg a block or two; stay just behind the head and let the
//hourly re-seed settle anything deeper
const HEAD_LAG = 6;

export const SYNC_EVERY_MS = 20 * 1000;
const RESEED_EVERY_MS = 60 * 60 * 1000;
//a club token id is a plain counter on this contract, so it fits an INT
const MAX_TOKEN_ID = 2_000_000_000;

const CONTRACT = String(GOLFCLUB_CONTRACT).toLowerCase();

let lastSeededAt = 0;
let running = false;

const word = (hex: string) => hex.replace(/^0x/, "").padStart(64, "0");
const addressFromTopic = (topic: string) => "0x" + String(topic || "").slice(-40).toLowerCase();

async function rpc(body: unknown): Promise<any>{
    const response: any = await Promise.race([
        fetch(POLYGON_RPC, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(body)
        }).then(r => r.json()),
        new Promise((_, reject) => setTimeout(() => reject(new Error("rpc timeout")), FETCH_TIMEOUT_MS))
    ]);
    return response;
}

async function ethCall(data: string): Promise<string | null>{
    const answer = await rpc({jsonrpc: "2.0", id: 1, method: "eth_call", params: [{to: CONTRACT, data}, "latest"]});
    const hex = answer?.result;
    return !hex || hex === "0x" ? null : hex;
}

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

//One eth_call per `data`, up to BATCH per request. Server side only: Node's
//fetch sends an array body happily, unlike the explorer's (§6 #39).
//
//A public node answers a long burst of batches only in part (the first seed
//lost the model of 225 of 525 tokens that way), and a missing answer is NOT
//the same as "no value": the callers must not read it as a burnt token or an
//unknown model. So anything that did not come back is retried in smaller
//slices, and what is still missing stays null for the caller to handle.
async function ethCallBatch(datas: string[]): Promise<(string | null)[]>{
    const out: (string | null)[] = new Array(datas.length).fill(null);
    let pending = datas.map((_, i) => i);
    for(let attempt = 0; attempt < 3 && pending.length; attempt++){
        const size = attempt === 0 ? BATCH : Math.max(10, Math.floor(BATCH / (attempt * 4)));
        for(let start = 0; start < pending.length; start += size){
            const slice = pending.slice(start, start + size);
            const answer = await rpc(slice.map((index, i) => ({
                jsonrpc: "2.0", id: i, method: "eth_call", params: [{to: CONTRACT, data: datas[index]}, "latest"]
            })));
            if(!Array.isArray(answer)){
                if(attempt === 0 && start === 0) throw new Error("RPC batch not supported");
                continue;
            }
            for(const row of answer){
                const hex = row?.result;
                const index = slice[Number(row?.id)];
                if(hex && hex !== "0x" && index !== undefined) out[index] = hex;
            }
            //a burst of batches is what the node throttles
            await pause(60);
        }
        pending = pending.filter(i => out[i] === null);
        if(pending.length) await pause(500 * (attempt + 1));
    }
    if(pending.length) console.log(`nft index: ${pending.length} of ${datas.length} calls had no answer`);
    return out;
}

async function blockNumber(): Promise<number>{
    const answer = await rpc({jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: []});
    const value = parseInt(answer?.result, 16);
    if(isNaN(value)) throw new Error("no block number");
    return value;
}

async function getTransferLogs(fromBlock: number, toBlock: number): Promise<any[]>{
    const answer = await rpc({
        jsonrpc: "2.0", id: 1, method: "eth_getLogs",
        params: [{
            address: CONTRACT,
            topics: [TRANSFER_TOPIC],
            fromBlock: "0x" + fromBlock.toString(16),
            toBlock: "0x" + toBlock.toString(16)
        }]
    });
    if(answer?.error) throw new Error(answer.error?.message || "eth_getLogs failed");
    return Array.isArray(answer?.result) ? answer.result : [];
}

export async function ensureNftTables(prisma: PrismaClient){
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS nft_owner (
        contractAddress VARCHAR(45) NOT NULL,
        tokenId INT NOT NULL,
        owner VARCHAR(45) NOT NULL,
        model INT NULL,
        updatedAt DATETIME NOT NULL,
        PRIMARY KEY (contractAddress, tokenId),
        INDEX idx_nft_owner_owner (contractAddress, owner)
    )`).catch(error => console.log("nft_owner table error", error?.message));
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS nft_sync (
        contractAddress VARCHAR(45) NOT NULL PRIMARY KEY,
        lastBlock BIGINT NOT NULL DEFAULT 0,
        seededAt DATETIME NULL,
        updatedAt DATETIME NULL
    )`).catch(error => console.log("nft_sync table error", error?.message));
}

async function readSync(prisma: PrismaClient): Promise<{lastBlock: number, seededAt: Date | null}>{
    const rows: any[] = await prisma.$queryRaw`SELECT lastBlock, seededAt FROM nft_sync
            WHERE contractAddress = ${CONTRACT}`;
    if(!rows.length) return {lastBlock: 0, seededAt: null};
    return {lastBlock: Number(rows[0].lastBlock || 0), seededAt: rows[0].seededAt || null};
}

async function writeSync(prisma: PrismaClient, lastBlock: number, seeded: boolean){
    const now = new Date();
    await prisma.$executeRawUnsafe(
        `INSERT INTO nft_sync (contractAddress, lastBlock, seededAt, updatedAt) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE lastBlock = VALUES(lastBlock), updatedAt = VALUES(updatedAt)
         ${seeded ? ", seededAt = VALUES(seededAt)" : ""}`,
        CONTRACT, lastBlock, seeded ? now : null, now
    );
}

//The models we already know, so a re-seed never re-reads getGolfclubId: it is
//written once at issue and never changes.
async function knownModels(prisma: PrismaClient): Promise<Map<number, number>>{
    const rows: any[] = await prisma.$queryRaw`SELECT tokenId, model FROM nft_owner
            WHERE contractAddress = ${CONTRACT} AND model IS NOT NULL`;
    return new Map(rows.map(r => [Number(r.tokenId), Number(r.model)]));
}

async function writeOwners(prisma: PrismaClient, rows: {tokenId: number, owner: string, model: number | null}[]){
    if(!rows.length) return;
    const now = new Date();
    for(let start = 0; start < rows.length; start += 200){
        const slice = rows.slice(start, start + 200);
        const values = slice.map(() => "(?, ?, ?, ?, ?)").join(", ");
        const params: any[] = [];
        for(const row of slice) params.push(CONTRACT, row.tokenId, row.owner, row.model, now);
        //a token's model is only ever learnt, never unlearnt
        await prisma.$executeRawUnsafe(
            `INSERT INTO nft_owner (contractAddress, tokenId, owner, model, updatedAt) VALUES ${values}
             ON DUPLICATE KEY UPDATE owner = VALUES(owner), model = COALESCE(VALUES(model), model),
             updatedAt = VALUES(updatedAt)`,
            ...params
        );
    }
}

//Current ownership straight from the contract. Cheap (525 tokens today, ~11
//requests) and the only thing that can correct a reorg or a missed log.
async function seed(prisma: PrismaClient, head: number){
    const supplyHex = await ethCall(SELECTOR.totalSupply);
    const supply = supplyHex ? parseInt(supplyHex, 16) : 0;
    if(!supply || supply > MAX_TOKEN_ID) throw new Error(`bad totalSupply ${supplyHex}`);

    const indexes = Array.from({length: supply}, (_, i) => i);
    const idHexes = await ethCallBatch(indexes.map(i => SELECTOR.tokenByIndex + word(i.toString(16))));
    const tokenIds = idHexes
        .map(hex => (hex ? parseInt(hex, 16) : NaN))
        .filter(id => !isNaN(id) && id >= 0 && id <= MAX_TOKEN_ID);
    if(tokenIds.length < supply) console.log(`nft index: ${supply - tokenIds.length} of ${supply} tokens did not enumerate`);

    const ownerHexes = await ethCallBatch(tokenIds.map(id => SELECTOR.ownerOf + word(id.toString(16))));
    const models = await knownModels(prisma);
    const unknown = tokenIds.filter((id, i) => ownerHexes[i] && !models.has(id));
    if(unknown.length){
        const read = await ethCallBatch(unknown.map(id => SELECTOR.getGolfclubId + word(id.toString(16))));
        unknown.forEach((id, i) => { if(read[i]) models.set(id, parseInt(read[i], 16)); });
    }

    const rows = tokenIds
        //a call with no answer is not a burnt token: leave that row alone
        //rather than writing or deleting it on a transient RPC failure
        .map((id, i) => ({id, ownerHex: ownerHexes[i]}))
        .filter(row => row.ownerHex)
        .map(row => ({
            tokenId: row.id,
            owner: addressFromTopic(row.ownerHex),
            model: models.has(row.id) ? models.get(row.id) : null
        }));
    await writeOwners(prisma, rows);
    //A token that no longer exists must stop counting for whoever held it. The
    //list to keep is what ENUMERATED, not what answered ownerOf: enumeration
    //is the contract's own index of existing tokens, so only a complete one is
    //safe to delete against.
    if(tokenIds.length === supply) await dropMissing(prisma, tokenIds);
    await writeSync(prisma, head, true);
    lastSeededAt = Date.now();
    const missing = tokenIds.length - rows.length;
    console.log(`nft index: seeded ${rows.length} golf clubs at block ${head}${missing ? `, ${missing} left unread` : ""}`);
}

async function dropMissing(prisma: PrismaClient, tokenIds: number[]){
    if(!tokenIds.length) return;
    const list = tokenIds.join(",");
    const removed = await prisma.$executeRawUnsafe(
        `DELETE FROM nft_owner WHERE contractAddress = ? AND tokenId NOT IN (${list})`, CONTRACT
    );
    if(removed) console.log(`nft index: ${removed} tokens no longer exist`);
}

//Everything that moved since the last indexed block, in order.
async function follow(prisma: PrismaClient, from: number, head: number): Promise<number>{
    let cursor = from;
    for(let chunk = 0; chunk < MAX_CHUNKS_PER_TICK && cursor <= head; chunk++){
        const to = Math.min(cursor + LOG_CHUNK, head);
        const logs = await getTransferLogs(cursor, to);
        if(logs.length){
            //one row per token, last log wins, which is what the chain says now
            const byToken = new Map<number, {tokenId: number, owner: string, model: number | null}>();
            const minted: number[] = [];
            for(const log of logs){
                const tokenId = parseInt(log?.topics?.[3], 16);
                if(isNaN(tokenId) || tokenId > MAX_TOKEN_ID) continue;
                const from = addressFromTopic(log?.topics?.[1]);
                const owner = addressFromTopic(log?.topics?.[2]);
                if(from === ZERO) minted.push(tokenId);
                byToken.set(tokenId, {tokenId, owner, model: null});
            }
            if(minted.length){
                const known = await knownModels(prisma);
                const toRead = minted.filter(id => !known.has(id));
                const read = toRead.length ? await ethCallBatch(toRead.map(id => SELECTOR.getGolfclubId + word(id.toString(16)))) : [];
                toRead.forEach((id, i) => { if(read[i]) known.set(id, parseInt(read[i], 16)); });
                for(const id of minted){
                    const row = byToken.get(id);
                    if(row && known.has(id)) row.model = known.get(id);
                }
            }
            await writeOwners(prisma, Array.from(byToken.values()));
            console.log(`nft index: ${logs.length} transfers in blocks ${cursor}-${to}`);
        }
        cursor = to + 1;
        await writeSync(prisma, to, false);
    }
    return cursor - 1;
}

//A token's model (getGolfclubId) is written once at issue and never changes,
//so a row only lacks one when its read had no answer. Those are picked up on
//the next tick instead of waiting for the hourly re-seed: a club with no model
//is a club the collection cannot name and the energy bonus cannot count.
async function fillMissingModels(prisma: PrismaClient){
    const rows: any[] = await prisma.$queryRaw`SELECT tokenId, owner FROM nft_owner
            WHERE contractAddress = ${CONTRACT} AND model IS NULL ORDER BY tokenId LIMIT 300`;
    if(!rows.length) return;
    const ids = rows.map(r => Number(r.tokenId));
    const read = await ethCallBatch(ids.map(id => SELECTOR.getGolfclubId + word(id.toString(16))));
    const found = rows
        .map((row, i) => ({tokenId: Number(row.tokenId), owner: String(row.owner), model: read[i] ? parseInt(read[i], 16) : null}))
        .filter(row => row.model !== null && !isNaN(row.model));
    if(!found.length) return;
    await writeOwners(prisma, found);
    console.log(`nft index: model read for ${found.length} of ${rows.length} clubs that lacked one`);
}

export async function syncGolfclubOwners(prisma: PrismaClient): Promise<void>{
    if(running) return;
    running = true;
    try{
        const head = Math.max(0, (await blockNumber()) - HEAD_LAG);
        const {lastBlock, seededAt} = await readSync(prisma);
        //a restart must not re-seed on its first tick just because this
        //process has not seeded yet: the table remembers when it last did
        if(!lastSeededAt && seededAt) lastSeededAt = new Date(seededAt).getTime();

        if(!lastBlock || !seededAt){
            await seed(prisma, head);
            return;
        }
        if(head > lastBlock){
            try{
                await follow(prisma, lastBlock + 1, head);
            }catch(error){
                //public nodes only serve recent logs (publicnode answers
                //"Archive requests require a personal token" beyond ~12 days),
                //so a long outage cannot be caught up from logs. Current
                //ownership from the contract is authoritative anyway.
                console.log("nft index: follow failed, re-seeding instead:", error?.message || error);
                await seed(prisma, head);
                return;
            }
        }
        //the periodic re-seed is what corrects a chain reorg: the forward-only
        //log scan cannot unapply a transfer that was rolled back
        if(Date.now() - lastSeededAt > RESEED_EVERY_MS) await seed(prisma, head);
        await fillMissingModels(prisma);
    }catch(error){
        console.log("nft index sync error", error?.message || error);
    }finally{
        running = false;
    }
}

export type IndexedClub = {tokenId: number, model: number | null};

//What a wallet owns right now, from the index. Never touches the chain, so a
//caller gets an answer in a millisecond or not at all.
export async function getGolfclubsOf(prisma: PrismaClient, address: string): Promise<IndexedClub[]>{
    const wallet = String(address || "").toLowerCase();
    if(!/^0x[0-9a-f]{40}$/.test(wallet)) return [];
    const rows: any[] = await prisma.$queryRaw`SELECT tokenId, model FROM nft_owner
            WHERE contractAddress = ${CONTRACT} AND owner = ${wallet} ORDER BY tokenId`;
    return rows.map(r => ({tokenId: Number(r.tokenId), model: r.model === null ? null : Number(r.model)}));
}

export async function getIndexStatus(prisma: PrismaClient){
    const {lastBlock, seededAt} = await readSync(prisma);
    const rows: any[] = await prisma.$queryRaw`SELECT COUNT(*) AS tokens FROM nft_owner
            WHERE contractAddress = ${CONTRACT}`;
    return {
        contract: CONTRACT,
        lastBlock,
        seededAt: seededAt || null,
        tokens: Number(rows[0]?.tokens || 0),
        ready: !!lastBlock && !!seededAt
    };
}
