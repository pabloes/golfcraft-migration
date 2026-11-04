// Public market report at golfcraftgame.com/market-report (2026-11-04, user
// request): what every GolfCraft NFT has traded for, and how many of the
// game's own NFTs exist.
//
// `/market-report` serves the page, `/api/market-report` the numbers
// (aggregates only, cached CACHE_MS). The tables behind it are filled by
// indexer.ts, which runs at startup and hourly, never inside a request.
//
// Money: a sale's price is MANA, and its dollar value is MANA's close on the
// day it happened (mana_price), not today's price, so old sales are not
// re-valued by a later pump. Sales with no price for their day count 0 USD and
// are reported as `usdCoverage` below 1.
import path from "path";
import {Prisma, PrismaClient} from "@prisma/client";
import {GAME_CONTRACTS, marketSyncInterval, readMarketConfig, syncMarket} from "./indexer";

const CACHE_MS = 60 * 1000;
const PAGE = path.resolve(__dirname, "market.html");
const DAY = 1000 * 60 * 60 * 24;
const TOP_SALES = 12;

let cached: {at: number, data: Promise<any>} = null;

export function marketApi(router, prisma: PrismaClient){
    prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS market_collection (
        contractAddress VARCHAR(45) NOT NULL PRIMARY KEY,
        name VARCHAR(120) NOT NULL DEFAULT '',
        creator VARCHAR(45) NOT NULL DEFAULT '',
        discoveredAt DATETIME NULL,
        lastSyncedAt DATETIME NULL
    )`).catch(error => console.log("market_collection table error", error?.message));
    prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS market_sale (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        contractAddress VARCHAR(45) NOT NULL,
        itemId VARCHAR(32) NOT NULL DEFAULT '',
        tokenId VARCHAR(80) NOT NULL DEFAULT '',
        type VARCHAR(16) NOT NULL DEFAULT '',
        priceWei VARCHAR(40) NOT NULL DEFAULT '0',
        priceMana DOUBLE NOT NULL DEFAULT 0,
        buyer VARCHAR(45) NOT NULL DEFAULT '',
        seller VARCHAR(45) NOT NULL DEFAULT '',
        soldAt DATETIME NOT NULL,
        INDEX idx_market_sale_soldAt (soldAt),
        INDEX idx_market_sale_contract (contractAddress, soldAt)
    )`).catch(error => console.log("market_sale table error", error?.message));
    prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS mana_price (
        day DATE NOT NULL PRIMARY KEY,
        usd DOUBLE NOT NULL DEFAULT 0
    )`).catch(error => console.log("mana_price table error", error?.message));
    prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS market_supply (
        day DATE NOT NULL,
        contractAddress VARCHAR(45) NOT NULL,
        tokenId VARCHAR(16) NOT NULL DEFAULT '',
        tokenName VARCHAR(40) NOT NULL DEFAULT '',
        totalSupply INT UNSIGNED NOT NULL DEFAULT 0,
        PRIMARY KEY (day, contractAddress, tokenId)
    )`).then(() => addSupplyTokenColumns(prisma))
        .catch(error => console.log("market_supply table error", error?.message));

    //the first sync fills the tables; after that an hour is plenty for a
    //market that sees a handful of sales a week
    setTimeout(() => syncMarket(prisma), 10000);
    setInterval(() => syncMarket(prisma), marketSyncInterval);

    router.get("/market-report", (req, res) => res.sendFile(PAGE));

    router.get("/api/market-report", async (req, res) => {
        try{
            if(!cached || Date.now() - cached.at > CACHE_MS){
                const data = computeMarket(prisma);
                cached = {at: Date.now(), data};
                data.catch(() => { if(cached?.data === data) cached = null; });
            }
            res.set("Cache-Control", "public, max-age=60");
            return res.send(await cached.data);
        }catch(error){
            console.log("/api/market-report error", error?.message || error);
            return res.status(500).send({error: "market report unavailable"});
        }
    });
}

//market_supply was first created with one row per contract; the per-token rows
//(an ERC1155's materials and parts) need tokenId in the key. MySQL 8 has no
//ADD COLUMN IF NOT EXISTS, so it is an information_schema check like stats'.
async function addSupplyTokenColumns(prisma: PrismaClient){
    try{
        const found: any[] = await prisma.$queryRaw`SELECT COUNT(*) AS n FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'market_supply' AND COLUMN_NAME = 'tokenId'`;
        if(Number(found[0]?.n)) return;
        await prisma.$executeRawUnsafe(`ALTER TABLE market_supply
                ADD COLUMN tokenId VARCHAR(16) NOT NULL DEFAULT '',
                ADD COLUMN tokenName VARCHAR(40) NOT NULL DEFAULT '',
                DROP PRIMARY KEY, ADD PRIMARY KEY (day, contractAddress, tokenId)`);
        console.log("market_supply: tokenId and tokenName columns added");
    }catch(error){
        console.log("market_supply migration error", error?.message);
    }
}

async function computeMarket(prisma: PrismaClient){
    const since30 = new Date(Date.now() - 30 * DAY);
    const since365 = new Date(Date.now() - 365 * DAY);
    const config = await readMarketConfig(prisma);
    //a collection the admin hid is out of every number
    const hidden = config.hidden.length ? config.hidden : ["-"];

    const [totals, last30, collections, monthly, topSales, byType, supply, manaNow, coverage]: any[] = await Promise.all([
        prisma.$queryRaw`SELECT COUNT(*) AS sales, COALESCE(SUM(s.priceMana), 0) AS mana,
                COALESCE(SUM(s.priceMana * COALESCE(p.usd, 0)), 0) AS usd,
                COUNT(DISTINCT s.buyer) AS buyers, COUNT(DISTINCT s.seller) AS sellers,
                DATE_FORMAT(MIN(s.soldAt), '%Y-%m-%d') AS firstSale, DATE_FORMAT(MAX(s.soldAt), '%Y-%m-%d') AS lastSale
            FROM market_sale s LEFT JOIN mana_price p ON p.day = DATE(s.soldAt)
            WHERE s.contractAddress NOT IN (${Prisma.join(hidden)})`.catch(() => []),
        prisma.$queryRaw`SELECT COUNT(*) AS sales, COALESCE(SUM(s.priceMana), 0) AS mana,
                COALESCE(SUM(s.priceMana * COALESCE(p.usd, 0)), 0) AS usd, COUNT(DISTINCT s.buyer) AS buyers
            FROM market_sale s LEFT JOIN mana_price p ON p.day = DATE(s.soldAt)
            WHERE s.soldAt >= ${since30}`.catch(() => []),
        prisma.$queryRaw`SELECT c.contractAddress AS address, c.name,
                COUNT(s.id) AS sales, COALESCE(SUM(s.priceMana), 0) AS mana,
                COALESCE(SUM(s.priceMana * COALESCE(p.usd, 0)), 0) AS usd,
                COALESCE(MAX(s.priceMana), 0) AS best,
                COALESCE(SUM(CASE WHEN s.soldAt >= ${since365} THEN s.priceMana ELSE 0 END), 0) AS manaYear,
                DATE_FORMAT(MAX(s.soldAt), '%Y-%m-%d') AS lastSale
            FROM market_collection c LEFT JOIN market_sale s ON s.contractAddress = c.contractAddress
            LEFT JOIN mana_price p ON p.day = DATE(s.soldAt)
            GROUP BY c.contractAddress, c.name ORDER BY usd DESC, sales DESC`.catch(() => []),
        prisma.$queryRaw`SELECT DATE_FORMAT(s.soldAt, '%Y-%m') AS month, COUNT(*) AS sales,
                COALESCE(SUM(s.priceMana), 0) AS mana, COALESCE(SUM(s.priceMana * COALESCE(p.usd, 0)), 0) AS usd
            FROM market_sale s LEFT JOIN mana_price p ON p.day = DATE(s.soldAt)
            GROUP BY month ORDER BY month`.catch(() => []),
        prisma.$queryRaw`SELECT s.id, c.name AS collection, s.itemId, s.priceMana AS mana,
                s.priceMana * COALESCE(p.usd, 0) AS usd, DATE_FORMAT(s.soldAt, '%Y-%m-%d') AS day, s.type
            FROM market_sale s LEFT JOIN market_collection c ON c.contractAddress = s.contractAddress
            LEFT JOIN mana_price p ON p.day = DATE(s.soldAt)
            ORDER BY s.priceMana DESC LIMIT ${TOP_SALES}`.catch(() => []),
        prisma.$queryRaw`SELECT type, COUNT(*) AS sales, COALESCE(SUM(priceMana), 0) AS mana
            FROM market_sale GROUP BY type ORDER BY sales DESC`.catch(() => []),
        prisma.$queryRaw`SELECT m.contractAddress AS address, m.tokenId, m.tokenName, m.totalSupply,
                DATE_FORMAT(m.day, '%Y-%m-%d') AS day
            FROM market_supply m
            JOIN (SELECT contractAddress, MAX(day) AS day FROM market_supply GROUP BY contractAddress) latest
                ON latest.contractAddress = m.contractAddress AND latest.day = m.day
            ORDER BY m.contractAddress, m.totalSupply DESC`.catch(() => []),
        prisma.$queryRaw`SELECT usd, DATE_FORMAT(day, '%Y-%m-%d') AS day FROM mana_price ORDER BY day DESC LIMIT 1`.catch(() => []),
        prisma.$queryRaw`SELECT COUNT(*) AS total, SUM(p.usd IS NOT NULL) AS priced
            FROM market_sale s LEFT JOIN mana_price p ON p.day = DATE(s.soldAt)`.catch(() => [])
    ]);

    const n = (v: any) => Number(v || 0);
    const supplyBy: {[address: string]: any} = {};
    const tokensBy: {[address: string]: any[]} = {};
    (supply || []).forEach((row: any) => {
        const address = String(row.address);
        //tokenId '' is the contract's headline number (an ERC1155's is the sum)
        if(String(row.tokenId || "") === "") supplyBy[address] = row;
        else (tokensBy[address] = tokensBy[address] || []).push({
            tokenId: String(row.tokenId), name: String(row.tokenName || ""), supply: Number(row.totalSupply || 0)
        });
    });
    const priced = n(coverage[0]?.priced), allSales = n(coverage[0]?.total);

    return {
        updatedAt: new Date().toISOString(),
        //every sale of every GolfCraft collection, all time
        totals: {
            sales: n(totals[0]?.sales), mana: n(totals[0]?.mana), usd: n(totals[0]?.usd),
            buyers: n(totals[0]?.buyers), sellers: n(totals[0]?.sellers),
            firstSale: totals[0]?.firstSale || null, lastSale: totals[0]?.lastSale || null
        },
        last30Days: {sales: n(last30[0]?.sales), mana: n(last30[0]?.mana), usd: n(last30[0]?.usd), buyers: n(last30[0]?.buyers)},
        collections: (collections || []).map((c: any) => ({
            address: String(c.address), name: String(c.name || c.address),
            sales: n(c.sales), mana: n(c.mana), usd: n(c.usd), best: n(c.best), manaYear: n(c.manaYear),
            lastSale: c.lastSale || null
        })),
        monthly: (monthly || []).map((m: any) => ({month: String(m.month), sales: n(m.sales), mana: n(m.mana), usd: n(m.usd)})),
        topSales: (topSales || []).map((s: any) => ({
            collection: String(s.collection || ""), itemId: String(s.itemId || ""),
            mana: n(s.mana), usd: n(s.usd), day: s.day || null, type: String(s.type || "")
        })),
        byType: (byType || []).map((t: any) => ({type: String(t.type || ""), sales: n(t.sales), mana: n(t.mana)})),
        //the game's own NFTs: no marketplace of their own, so this is the chain's count
        game: GAME_CONTRACTS.map(c => ({
            name: c.name, kind: c.kind, standard: c.standard, address: c.address,
            totalSupply: supplyBy[c.address] ? n(supplyBy[c.address].totalSupply) : null,
            day: supplyBy[c.address]?.day || null,
            tokens: tokensBy[c.address] || []
        })),
        manaUsd: manaNow[0] ? {usd: n(manaNow[0].usd), day: manaNow[0].day} : null,
        //share of sales whose day has a MANA price (the dollar figures cover only those)
        usdCoverage: allSales ? priced / allSales : 1
    };
}
