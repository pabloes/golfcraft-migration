// Keeps the market tables that /market-report reads (2026-11-04, user request).
//
// Nothing here runs inside a request: `syncMarket` is called once at web
// startup and then every SYNC_EVERY_MS, like the PlayFab account export.
//
// Sources, all public and keyless:
//   - Decentraland marketplace API (marketplace-api.decentraland.org): the
//     GolfCraft collections (every collection of each creator wallet, plus any
//     extra contract named in the config) and every sale of each one, which is
//     where the wearables and emotes trade. Prices are MANA wei.
//   - CoinGecko: the daily MANA/USD close, so a sale is worth what it was worth
//     the day it happened instead of today's price.
//   - A Polygon RPC: totalSupply of the game's own ERC721s (golf clubs, lands).
//
// The config row `marketReport` (MySQL `config`, edited in the admin panel)
// holds `{creators: ["0x…"], extraContracts: [{address, name}], hidden: ["0x…"]}`.
// Without the row the defaults below are used, so the report works out of the box.
import fetch from "cross-fetch";
import {PrismaClient} from "@prisma/client";
import {POLYGON_RPC} from "../../../common/constants";

const MARKETPLACE_API = "https://marketplace-api.decentraland.org/v1";
const COINGECKO = "https://api.coingecko.com/api/v3";
const BINANCE = "https://api.binance.com/api/v3";
// Collections are made by these wallets: the studio's creator account and the
// deployer that signed the co-branded ones (COCOBAY, Halloween, contests).
const DEFAULT_CREATORS = [
    "0xcf10cd8b5dc2323b1eb6de6164647756bad4de4d",
    "0x598f8af1565003ae7456dac280a18ee826df7a2c"
];
// The game's own NFTs, which are not Decentraland collections: they have no
// marketplace of their own, so the report shows what the chain says of them.
export const GAME_CONTRACTS: {address: string, name: string, kind: string, standard: string, tokens?: {[id: string]: string}}[] = [
    {address: "0xf044647af5d795a9459b7bc0bd47625d4764a222", name: "Golf clubs", kind: "golfclub", standard: "erc721"},
    {address: "0x0776cd532b1a2c899be7323951ae4ca1801edd94", name: "GolfLand", kind: "land", standard: "erc721"},
    {address: "0xb50e29a3ccf7c0ab133ea7de46b09d0d8feafdf0", name: "Refined materials", kind: "materials", standard: "erc1155",
        //the ids the game mints (common/constants + the bridge's MATERIAL_TOKEN)
        tokens: {0: "FT chain", 1: "FT500 chain", 2: "DM chain", 3: "DM100 chain", 4: "Planks", 5: "Stone blocks", 6: "Iron bars", 7: "Gold bars"}},
    {address: "0x4820e6424989c22ef7f41b67e7439ab9969fe948", name: "Course parts", kind: "parts", standard: "erc1155"}
];
//ids to probe on an ERC1155 with no id list of its own
const ERC1155_SCAN = 16;
const PAGE = 100;
const SALES_MAX_PAGES = 200;
const FETCH_TIMEOUT_MS = 30000;
const SYNC_EVERY_MS = 60 * 60 * 1000;
const CONFIG_KEY = "marketReport";
// A sale is re-read from a little before the newest one already stored, so a
// row that landed out of order is still picked up.
const OVERLAP_MS = 10 * 60 * 1000;

let syncing = false;

type MarketConfig = {creators: string[], extraContracts: {address: string, name?: string}[], hidden: string[]};

const lower = (s: unknown) => String(s || "").trim().toLowerCase();
const isAddress = (s: unknown) => /^0x[0-9a-f]{40}$/.test(lower(s));

async function getJson(url: string): Promise<any> {
    const result: any = await Promise.race([
        fetch(url).then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${url}`))),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout " + url)), FETCH_TIMEOUT_MS))
    ]);
    return result;
}

export async function readMarketConfig(prisma: PrismaClient): Promise<MarketConfig> {
    const config: MarketConfig = {creators: DEFAULT_CREATORS, extraContracts: [], hidden: []};
    try{
        const row = await prisma.config.findFirst({where: {key: CONFIG_KEY}});
        if(!row?.value) return config;
        const parsed = JSON.parse(row.value);
        if(Array.isArray(parsed.creators) && parsed.creators.length) config.creators = parsed.creators.filter(isAddress).map(lower);
        if(Array.isArray(parsed.extraContracts)) {
            config.extraContracts = parsed.extraContracts
                .map((c: any) => (typeof c === "string" ? {address: c} : c))
                .filter((c: any) => isAddress(c?.address))
                .map((c: any) => ({address: lower(c.address), name: c.name ? String(c.name).slice(0, 120) : undefined}));
        }
        if(Array.isArray(parsed.hidden)) config.hidden = parsed.hidden.filter(isAddress).map(lower);
    }catch(error){
        console.log("[market] bad marketReport config, using the defaults:", error?.message);
    }
    return config;
}

// Every GolfCraft collection: whatever each creator wallet made, plus the
// extras from the config (a co-created collection belongs to its own creator).
async function discoverCollections(prisma: PrismaClient, config: MarketConfig){
    const found: {[address: string]: {name: string, creator: string}} = {};
    for(const creator of config.creators){
        try{
            const data = await getJson(`${MARKETPLACE_API}/collections?creator=${creator}&first=100`);
            (data?.data || []).forEach((c: any) => {
                if(!isAddress(c?.contractAddress)) return;
                found[lower(c.contractAddress)] = {name: String(c.name || "").slice(0, 120), creator};
            });
        }catch(error){
            console.log("[market] collections of", creator, "failed:", error?.message);
        }
    }
    for(const extra of config.extraContracts){
        if(found[extra.address]) continue;
        let name = extra.name || "";
        if(!name){
            try{
                const data = await getJson(`${MARKETPLACE_API}/collections?contractAddress=${extra.address}`);
                name = String(data?.data?.[0]?.name || "").slice(0, 120);
            }catch(error){
                console.log("[market] name of", extra.address, "failed:", error?.message);
            }
        }
        found[extra.address] = {name: name || extra.address, creator: "config"};
    }
    for(const address of Object.keys(found)){
        const {name, creator} = found[address];
        await prisma.$executeRaw`INSERT INTO market_collection (contractAddress, name, creator, discoveredAt)
                VALUES (${address}, ${name}, ${creator}, UTC_TIMESTAMP())
                ON DUPLICATE KEY UPDATE name = VALUES(name), creator = VALUES(creator)`;
    }
    return Object.keys(found).length;
}

// Every sale of one collection, newest first, from `since` onwards.
async function syncCollectionSales(prisma: PrismaClient, address: string): Promise<number> {
    const last: any[] = await prisma.$queryRaw`SELECT UNIX_TIMESTAMP(MAX(soldAt)) * 1000 AS ms FROM market_sale WHERE contractAddress = ${address}`;
    const since = Number(last[0]?.ms || 0);
    const from = since ? Math.max(0, since - OVERLAP_MS) : 0;
    let stored = 0;
    for(let page = 0; page < SALES_MAX_PAGES; page++){
        const url = `${MARKETPLACE_API}/sales?contractAddress=${address}&first=${PAGE}&skip=${page * PAGE}` + (from ? `&from=${from}` : "");
        let rows: any[] = [];
        try{
            rows = (await getJson(url))?.data || [];
        }catch(error){
            console.log("[market] sales page failed", address, page, error?.message);
            break;
        }
        for(const sale of rows){
            const id = String(sale?.id || "").slice(0, 64);
            if(!id || !sale?.timestamp) continue;
            const priceWei = String(sale.price || "0");
            //MANA has 18 decimals; the double is only for sums and charts
            const priceMana = Number(priceWei) / 1e18;
            await prisma.$executeRaw`INSERT INTO market_sale
                    (id, contractAddress, itemId, tokenId, type, priceWei, priceMana, buyer, seller, soldAt)
                    VALUES (${id}, ${address}, ${String(sale.itemId ?? "").slice(0, 32)},
                        ${String(sale.tokenId ?? "").slice(0, 80)}, ${String(sale.type || "").slice(0, 16)},
                        ${priceWei.slice(0, 40)}, ${isFinite(priceMana) ? priceMana : 0},
                        ${lower(sale.buyer).slice(0, 45)}, ${lower(sale.seller).slice(0, 45)},
                        FROM_UNIXTIME(${Math.floor(Number(sale.timestamp) / 1000)}))
                    ON DUPLICATE KEY UPDATE priceMana = VALUES(priceMana)`;
            stored++;
        }
        if(rows.length < PAGE) break;
    }
    await prisma.$executeRaw`UPDATE market_collection SET lastSyncedAt = UTC_TIMESTAMP() WHERE contractAddress = ${address}`;
    return stored;
}

// The daily MANA close, so historical volume can be shown in dollars. Binance
// klines are free, keyless and go back to 2020 (the first GolfCraft sale is
// 2021); CoinGecko's free tier now refuses a history that long (401), so it is
// only the fallback, for the last year. Missing days are refetched, so a gap
// heals on the next run.
async function syncManaPrices(prisma: PrismaClient){
    const have: any[] = await prisma.$queryRaw`SELECT COUNT(*) AS n, DATEDIFF(UTC_DATE(), MAX(day)) AS staleDays FROM mana_price`;
    const rows = Number(have[0]?.n || 0);
    const stale = have[0]?.staleDays === null ? 9999 : Number(have[0].staleDays);
    if(rows && stale < 1) return 0;
    //from the first sale (or 2021) when the table is empty, else from the gap
    const first: any[] = await prisma.$queryRaw`SELECT UNIX_TIMESTAMP(MIN(soldAt)) * 1000 AS ms FROM market_sale`;
    const startAll = Number(first[0]?.ms || Date.parse("2021-01-01T00:00:00Z"));
    const startGap = Date.now() - Math.min(400, stale + 3) * 86400000;
    let start = rows ? startGap : startAll - 7 * 86400000;
    let saved = 0;
    try{
        for(let page = 0; page < 10; page++){
            const klines: any[] = await getJson(`${BINANCE}/klines?symbol=MANAUSDT&interval=1d&limit=1000&startTime=${Math.floor(start)}`);
            if(!Array.isArray(klines) || !klines.length) break;
            for(const k of klines){
                const usd = Number(k?.[4]);
                const openMs = Number(k?.[0]);
                if(!isFinite(usd) || !isFinite(openMs)) continue;
                await prisma.$executeRaw`INSERT INTO mana_price (day, usd) VALUES (DATE(FROM_UNIXTIME(${Math.floor(openMs / 1000)})), ${usd})
                        ON DUPLICATE KEY UPDATE usd = VALUES(usd)`;
                saved++;
            }
            const lastOpen = Number(klines[klines.length - 1][0]);
            if(klines.length < 1000 || lastOpen >= Date.now() - 86400000) break;
            start = lastOpen + 86400000;
        }
        console.log(`[market] MANA price: ${saved} days from Binance`);
        return saved;
    }catch(error){
        console.log("[market] Binance price failed, trying CoinGecko:", error?.message);
    }
    try{
        const data = await getJson(`${COINGECKO}/coins/decentraland/market_chart?vs_currency=usd&days=365`);
        for(const [ms, usd] of (data?.prices || [])){
            if(!ms || !isFinite(usd)) continue;
            await prisma.$executeRaw`INSERT INTO mana_price (day, usd) VALUES (DATE(FROM_UNIXTIME(${Math.floor(ms / 1000)})), ${Number(usd)})
                    ON DUPLICATE KEY UPDATE usd = VALUES(usd)`;
            saved++;
        }
        console.log(`[market] MANA price: ${saved} points from CoinGecko`);
    }catch(error){
        console.log("[market] MANA price failed:", error?.message);
    }
    return saved;
}

// How many of the game's own NFTs exist, one snapshot a day: totalSupply() for
// the ERC721s, totalSupply(id) per token for the ERC1155s (both implement it),
// plus a row with the sum so a contract has one headline number.
async function rpcCall(to: string, data: string): Promise<number | null> {
    try{
        const body = {jsonrpc: "2.0", id: 1, method: "eth_call", params: [{to, data}, "latest"]};
        const result: any = await Promise.race([
            fetch(POLYGON_RPC, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)}).then(r => r.json()),
            new Promise((_, reject) => setTimeout(() => reject(new Error("rpc timeout")), FETCH_TIMEOUT_MS))
        ]);
        const hex = result?.result;
        if(!hex || hex === "0x") return null;
        const value = parseInt(hex, 16);
        return isFinite(value) ? value : null;
    }catch(error){
        return null;
    }
}

const hexId = (id: number) => id.toString(16).padStart(64, "0");

async function syncGameContracts(prisma: PrismaClient){
    for(const contract of GAME_CONTRACTS){
        try{
            const rows: {tokenId: string, name: string, supply: number}[] = [];
            if(contract.standard === "erc721"){
                const supply = await rpcCall(contract.address, "0x18160ddd");
                if(supply === null) continue;
                rows.push({tokenId: "", name: contract.name, supply});
            }else{
                //totalSupply(uint256) = 0xbd85b039
                const ids = contract.tokens
                    ? Object.keys(contract.tokens).map(Number)
                    : Array.from({length: ERC1155_SCAN}, (_, i) => i);
                let sum = 0;
                for(const id of ids){
                    const supply = await rpcCall(contract.address, "0xbd85b039" + hexId(id));
                    if(!supply) continue;
                    sum += supply;
                    rows.push({tokenId: String(id), name: contract.tokens?.[id] || `#${id}`, supply});
                }
                if(!rows.length) continue;
                rows.push({tokenId: "", name: contract.name, supply: sum});
            }
            for(const row of rows){
                await prisma.$executeRaw`INSERT INTO market_supply (day, contractAddress, tokenId, tokenName, totalSupply)
                        VALUES (UTC_DATE(), ${contract.address}, ${row.tokenId}, ${row.name.slice(0, 40)}, ${row.supply})
                        ON DUPLICATE KEY UPDATE totalSupply = VALUES(totalSupply), tokenName = VALUES(tokenName)`;
            }
        }catch(error){
            console.log("[market] supply of", contract.name, "failed:", error?.message);
        }
    }
}

export async function syncMarket(prisma: PrismaClient): Promise<void> {
    if(syncing) return;
    syncing = true;
    const started = Date.now();
    try{
        const config = await readMarketConfig(prisma);
        const collections = await discoverCollections(prisma, config);
        const addresses: any[] = await prisma.$queryRaw`SELECT contractAddress FROM market_collection`;
        let sales = 0;
        for(const row of addresses){
            sales += await syncCollectionSales(prisma, String(row.contractAddress));
        }
        await syncManaPrices(prisma);
        await syncGameContracts(prisma);
        console.log(`[market] synced ${collections} collections, ${sales} sales in ${Math.round((Date.now() - started) / 1000)}s`);
    }catch(error){
        console.log("[market] sync failed:", error?.message || error);
    }finally{
        syncing = false;
    }
}

export const marketSyncInterval = SYNC_EVERY_MS;
