//first: captures every log line printed after it (GET /api/_logs)
import {logsHandler} from "../../common/log-buffer";
//before handleProcessExit(): its handlers print errors through it
import {redactedMessage, redactUrls} from "../../common/redact";
import {coursesApi} from "./courses/api";
handleProcessExit();
require('dotenv').config();
import express from 'express';
import cors from 'cors';
import path from "path";
import {tournamentApi} from "./tournaments/api";
import fetch from "cross-fetch";
import {PlayFabServer} from "playfab-sdk";
import {PrismaClient} from "@prisma/client";
import {dailyMissionsApi} from "./daily-missions";
import {statsApi} from "./stats";
import {marketApi} from "./market";
import {nftApi} from "./nft";
import {adminDashboardApi} from "./admin-dashboard";
import {authApi} from "./auth";
import {raffle} from "./raffle/raffle";
import {promisify} from "util";
import {deserializeRecipe, getCatFromTier, getPointsToTier, getTierFromSub} from "../../common/utils";
import {getGameAccess, GameWindowConfig} from "../../common/game-window";
import {getFreeEnergyStatus, FreeEnergyConfig} from "../../common/free-energy";
const GAME_WINDOW_KEY = "gameWindow";
const FREE_ENERGY_KEY = "freeEnergy";
import {textImageApi} from "./text-image/text-image";
import {seasonsApi} from "./seasons";
import {runChecks} from "../../chain-playfab/security/securityChecks";
import * as dcl from 'decentraland-crypto-middleware';
import {getAllowedFindArgs} from "./prisma-read-allow-list";
//handleProcessExit();

const fallback = require("express-history-api-fallback");
const fs = require("fs");
const http = require("http");
import { discordHook } from '../../common/discord-hooks'
console.log("FOO")
if(!process.env.PLAYFAB_TITLE_ID || !process.env.PLAYFAB_SECRET_KEY){
    console.log("missing PlayFab config");
    process.exit(1);
}
PlayFabServer.settings.titleId = process.env.PLAYFAB_TITLE_ID;
PlayFabServer.settings["DeveloperSecretKey"] = PlayFabServer.settings.developerSecretKey = process.env.PLAYFAB_SECRET_KEY;

console.log("starting ...");
callDiscordHook("Starting server ...");
const GOLF_API_KEY = process.env.GOLF_API_KEY;
const port = Number(process.env.PORT || 2569) + Number(process.env.NODE_APP_INSTANCE || 0);
const app = express();
const router = express.Router();
router.get("/api/_logs", logsHandler);
const prisma = new PrismaClient();
const whitelist = ['https://play.decentraland.org', 'https://decentraland.org'];
const corsOptions = {
    //origin: process.env.PROD ? 'https://play.decentraland.org':"*"
   /* origin:(origin, callback)=>{
        if (whitelist.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS '+origin));
        }
    }*/
    origin:"*"
}
var distPath = path.resolve(__dirname, "..", "client", "dist");
var staticPath = path.resolve(__dirname, "..", "client", "dist", "static");


// Private Network Access: when the SDK7 scene is served from a PUBLIC https
// origin (the cloudflared preview-realm tunnel), Chrome treats fetches to this
// localhost web API as public->private and blocks them unless the preflight is
// answered with Access-Control-Allow-Private-Network. Without this, get-login-id
// + parts get "blocked by CORS policy: loopback address space" and login falls
// back to the junk PlayFab account. (Dev only; harmless in PROD behind https.)
router.use((req, res, next) => {
    res.header('Access-Control-Allow-Private-Network', 'true');
    next();
});
router.use(cors({
    corsOptions: process.env.PROD?corsOptions:undefined
}));

console.log("clientRootPath",staticPath);
console.log("__dirname",__dirname);

// The scene calls `https://golfcraftgame.com/bridge/...` (hardcoded, same as
// SDK6) but the bridge is its own service: onchain-queue, which mints the
// season wearables and the storymode emote. Proxying it here instead of in the
// reverse proxy keeps the mapping in the repo, so it behaves the same locally
// (the bridge on :8111) and in production, and survives recreating the app.
// Registered BEFORE express.json() so the request body is piped untouched.
// Where the bridge lives is deployment config, not code: BRIDGE_URL comes from
// the environment, and the only default is the local dev one.
const BRIDGE_URL = process.env.BRIDGE_URL || "http://localhost:8111";
if (process.env.PROD && !process.env.BRIDGE_URL) {
    console.log("⚠ BRIDGE_URL is not set: /bridge will be proxied to", BRIDGE_URL);
}
router.use("/bridge", (req, res) => {
    const target = new URL(BRIDGE_URL);
    //no cookie: the AdminJS session must not reach the bridge (authorization
    //stays, /bridge/_logs needs it)
    const headers = {...req.headers, host: target.host};
    delete headers.cookie;
    const proxyReq = http.request({
        host: target.hostname,
        port: target.port || 80,
        path: "/bridge" + req.url,//express strips the mount path from req.url
        method: req.method,
        headers
    }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(res);
    });
    proxyReq.on("error", (error) => {
        console.log("bridge proxy error", error?.message, BRIDGE_URL);
        if (!res.headersSent) res.status(502).json({error: "bridge unavailable"});
    });
    req.pipe(proxyReq);
});

router.use(express.json());
(async ()=>{
    coursesApi(router, app, prisma);
    tournamentApi(router, prisma);
    seasonsApi(router, prisma);
    statsApi(router, prisma);
    marketApi(router, prisma);
    nftApi(router, prisma);
    //the owner's events + broadcast page; refuses unless ADMIN_DASHBOARD_TOKEN is set
    adminDashboardApi(router, prisma);
    authApi(router, prisma);

    await dailyMissionsApi(router, process.env.PROD);
    await textImageApi(router);

    let foundWearables = 0;
    let foundWearablesLastTime = 0;
console.log(".-")
    router.post("/api/set-affiliate-code", async (req, res)=>{
        //TODO check signature from effemeral address

        const {code, playerAddress, PlayFabId, displayName} = req.body;
console.log("set-affiliate-code",code, playerAddress, PlayFabId, displayName)
        const affiliate = await prisma.affiliates.findFirst({
            where:{code}
        });
        if(!affiliate) return res.status(404).send({error:"NOT FOUND"})
        const foundPlayer = await prisma.affiliate_player.findFirst({
            where:{playerAddress}
        });

        if(foundPlayer){
            return res.status(404).send({error:"ERROR: CREATOR CODE WAS ALREADY SET"})
        }else{
            await prisma.affiliate_player.create({
                data:{
                    affiliateID:affiliate.ID,
                    playerAddress,
                    PlayFabId,
                    displayName
                }
            })
        }
        return res.send({ok:true});
    });

    router.get("/api/get-affiliate-info/:affiliateID", async (req, res)=>{
        try{
            const {affiliateID} = req.params;
            const affiliatePlayers:any[] = await prisma.affiliate_player.findMany({
                where:{
                    affiliateID:Number(affiliateID),
                }
            });
            let totalPlayedGames = 0;
            let affiliatesPerRankCategory = [0,0,0,0,0,0,0,0,0,0];
            let totalDaysConnected = 0;
            let totalSeasonPoints = 0;

            for(let affiliatePlayer of (affiliatePlayers||[])){
                affiliatePlayer.playedGames = await prisma.player_game.count({
                    where:{
                        PlayFabId:affiliatePlayer.PlayFabId
                    }
                });
                [affiliatePlayer.tierSub, affiliatePlayer.daysConnected] = await promisify(PlayFabServer.GetPlayerStatistics)({PlayFabId:affiliatePlayer.PlayFabId, StatisticNames:["tier-sub-max", "connected-days"]})
                    .then(r=>[r.data?.Statistics[0]?.Value||0,r.data?.Statistics[1]?.Value||0]);
                totalDaysConnected += affiliatePlayer.daysConnected;
                totalSeasonPoints += affiliatePlayer.tierSub;
                const tierCat = getCatFromTier(getTierFromSub(affiliatePlayer.tierSub));
                affiliatesPerRankCategory[tierCat]++;
                totalPlayedGames += affiliatePlayer.playedGames;
            }



            //TODO return:
            /**
             * - total number of affiliates
             * - number of affiliates on each rank
             * - number of total played games by affiliates
             * - affiliates collection, and for each one:
             * -- played games
             * -- tier-sub-max
             * -- days connected
             */
            return res.send({
                affiliatePlayers,
                affiliatesPerRankCategory,
                totalPlayedGames,
                totalSeasonPoints,
                totalDaysConnected
            });
        }catch(error){
            console.error("error",error)
            return res.status(500).send({error});
        }
    })

    router.get("/api/generate-affiliate-report", async(req,res) => {
        console.log("generate-affiliate-report");
        try{
            const affiliateIDs = (   await prisma.affiliates.findMany({select:{ID:true}})).map(i=>i.ID);
            console.log("affiliateIDs",affiliateIDs)
            const affiliatePlayers = await prisma.affiliate_player.findMany({});
            let str = ``;
            for (let ID of affiliateIDs){
                let affiliateReward = 0;
                const affiliateInfo = await fetch("https://golfcraftgame.com/api/get-affiliate-info/"+ID, {
                    method:"GET", headers:{"Content-Type":"application/json"}
                }).then(r=>r.json());
                if(affiliatePlayers.find(p=>p.affiliateID === ID)){//if there is any player, otherwise we dont generate report

                    const affiliate = await prisma.affiliates.findFirst({where:{ID:Number(ID)}});
                    str += `\n\n\n\n REPORT FOR ${affiliate.code}\n`;
                    const {affiliatesPerRankCategory, totalPlayedGames, totalSeasonPoints, totalDaysConnected} = affiliateInfo;
                    str += `\n\n  affiliatesPerRankCategory:${affiliatesPerRankCategory} | totalPlayedGames:${totalPlayedGames} | totalSeasonPoints:${totalSeasonPoints} | totalDaysConnected:${totalDaysConnected} | totalDaysConnected:${totalDaysConnected}`
                    let affiliateReward = 0;
                    for(let player of affiliateInfo.affiliatePlayers){
                        const playerReward = calculateAffiliatePlayerReward(player);
                        str += `\n\n Players:`;
                        str += `\n    ${player.displayName} season-points:${player.tierSub} daysConnected:${player.daysConnected} playedGames:${player.playedGames} reward:${playerReward} MANA`;
                        affiliateReward += playerReward
                    }
                    str += `\naffiliate total reward: ${affiliateReward} MANA`

                }

            }
            callDiscordHook(str, discordHook('DISCORD_HOOK_WEB_ALERTS'));

            res.send(str.replace(/\n/g, "<br>"));
        }catch(error){
            res.status(500).send(error);
        }

        function calculateAffiliatePlayerReward({playedGames, daysConnected, tierSub}){
            if(daysConnected >= 45 && tierSub >= getPointsToTier(5*7) && playedGames >= 500){
                return 45;
            }else if(daysConnected >= 40 && tierSub >= getPointsToTier(5*6) && playedGames >= 320){
                return 40;
            }else if(daysConnected >= 30 && tierSub >= getPointsToTier(5*5) && playedGames >= 180){
                return 30;
            }else if(daysConnected >= 15 && tierSub >= getPointsToTier(5*4) && playedGames >= 90){
                return 15;
            }else if(daysConnected >= 10 && tierSub >= getPointsToTier(5*3) && playedGames >= 30){
                return 10;
            }else if(daysConnected >= 5 && tierSub >= getPointsToTier(5*2) && playedGames >= 10){
                return 5
            }else{
                return 0;
            }
        }
    });

    router.get("/api/halloween-found-wearables", async (req, res)=>{
        const HALLOWEEN_WEARABLE_STATISTIC = "wearable:halloween-2022";

        if(foundWearablesLastTime + 120000 < Date.now()){
            const {data} = await promisify(PlayFabServer.GetLeaderboard)({
                StatisticName:HALLOWEEN_WEARABLE_STATISTIC,
                MaxResultsCount:100,
                StartPosition:0
            });
            const reducedLeaderboardResult = data.Leaderboard.reduce((acc, current)=>{
                acc = acc + current.StatValue;
                return acc;
            }, 0);
            foundWearables = reducedLeaderboardResult;
            foundWearablesLastTime = Date.now();
        }
        return res.send({result:foundWearables});
    });
    router.get("/api/config", async (req, res) => {
        try{
            const configRows = await prisma.config.findMany();
            //gameWindow carries the allow-listed wallets: served by /api/game-window only
            return res.send(configRows.filter(({key}) => key !== GAME_WINDOW_KEY).reduce((acc, {ID, key, value})=> (acc[key] = JSON.parse(value), acc),{}));
        }catch(error:any){
            console.log("/api/config/ error",error, error?.mesage);
            return res.status(500).send({error, message:error?.message});
        }

    })
    //When the game can be played (common/game-window.ts) for one wallet. The
    //config row is edited in the admin; a missing or unreadable row means open.
    //It also carries the free-Energy window (common/free-energy.ts): the game
    //server asks whether to charge for a run and the scene has to let a player
    //with 0 Energy press PLAY while it lasts. It rides here rather than in its
    //own route because this is the only thing the scene re-polls (every 10
    //minutes), so a window that opens or closes is picked up without a reload.
    router.get("/api/game-window", async (req, res) => {
        try{
            const address = typeof req.query.address === "string" ? req.query.address : null;
            const [windowConfig, energyConfig] = await Promise.all([readGameWindowConfig(), readFreeEnergyConfig()]);
            const energy = getFreeEnergyStatus(energyConfig);
            return res.send({...getGameAccess(windowConfig, address), freeEnergy: energy.free, freeEnergyUntil: energy.until});
        }catch(error:any){
            console.log("/api/game-window error", error?.message);
            return res.send({...getGameAccess(null, null), freeEnergy: false, freeEnergyUntil: null});
        }
    });
    async function readFreeEnergyConfig(): Promise<FreeEnergyConfig | null> {
        const row = await prisma.config.findFirst({where:{key:FREE_ENERGY_KEY}});
        if (!row?.value) return null;
        try{
            return JSON.parse(row.value);
        }catch(error){
            console.log("freeEnergy config is not valid JSON, ignoring it", row.value);
            return null;
        }
    }
    async function readGameWindowConfig(): Promise<GameWindowConfig | null> {
        const row = await prisma.config.findFirst({where:{key:GAME_WINDOW_KEY}});
        if (!row?.value) return null;
        try{
            return JSON.parse(row.value);
        }catch(error){
            console.log("gameWindow config is not valid JSON, ignoring it", row.value);
            return null;
        }
    }
    router.post("/api/report-claimed-wearable", async (req, res)=>{
        const {ID, claimed} = req.body;
        await prisma.wearables_catalog.update({
            where:{ ID },
            data:{ claimed }
        });
        return res.send();
    });

    router.get("/api/wearables-catalog", async (req, res) => {
        const collections = await prisma.wearables_collections.findMany();
        var data
        try {
            data = await prisma.wearables_catalog.findMany({
            });
        } catch(error) {
            return res.status(500).send({error})
        }
        return res.send(data.filter(i=>req.query.use2?i.disabled === 2:!i.disabled).reduce((acc, current) => {
            acc[current.contract] = acc[current.contract] || {};
            acc[current.contract].items = acc[current.contract].items || [];
            acc[current.contract].contract = current.contract;
            acc[current.contract].name = collections.find(c=>c.address === current.contract)?.name;
            acc[current.contract].items.push({
                ID: current.ID,
                name: current.name,
                relay: !!current.relay,
                id: current.itemId,
                image_url: current.image_url,
                wearableId: current.wearableId,
                price: deserializeRecipe(current.price),
                position: current.position && current.position.split(",") || [0, 0, 0],
                rotation: current.rotation && current.rotation.split(",") || [0, 0, 0],
                maxStock: current.maxStock,
                supply: current.supply,
                minPlayerLevel: current.minPlayerLevel || 0,
                maxMintsByAddress: current.maxMintsByAddress || null,
                sold: current.claimed,
                storage: current.storage,
                tierReward: current.tierReward
            });
            return acc;
        }, {}));
    });

    //TODO raffleApi(router);
    router.post("/api/raffle", async (req, res)=>{
        try {
            const {seed, prizes, tickets} = req.body;
            return res.send(raffle(seed, prizes, tickets));
        }catch(error){
            return res.status(500).send({error})
        }
    });

    //only the tables, filters and columns its callers need (prisma-read-allow-list.ts)
    router.post("/api/prisma-find-many/:table", async (req, res)=>{
        const args = getAllowedFindArgs(req.params.table, req.body);
        if(!args) return res.status(403).send({error:"forbidden"});
        try{
            return res.send(await prisma[req.params.table].findMany(args));
        } catch(error){
            return res.status(500).send({error});
        }
    });
    router.post("/api/prisma-find-first/:table", async (req, res)=>{
        const args = getAllowedFindArgs(req.params.table, req.body);
        if(!args) return res.status(403).send({error:"forbidden"});
        try{
            const result = await prisma[req.params.table].findFirst(args);
            //findFirst answers null when nothing matches, and res.send(null)
            //writes an EMPTY body, which the caller then fails to parse: the
            //game server logged "Unexpected end of JSON input" on every hole
            //simply because no chest event was running (2026-11-05).
            return res.json(result === undefined ? null : result);
        } catch(error){
            return res.status(500).send({error});
        }
    });
    router.use("*/static", express.static(staticPath));
    router.use(fallback("index.html", {root:distPath}));

    const contextPath = process.env.CONTEXT_PATH || "";
    app.use(router);
    app.listen(port, ()=>{
        console.log("listening ...",port);
    });
})();


function handleProcessExit(){
    try{
        process.on('SIGTERM', async (signal) => {
            await callDiscordHook(`Process ${process.pid} received a SIGTERM signal`);
            process.exit(0);
        })

        process.on('SIGINT', async (signal) => {
            await callDiscordHook(`Process ${process.pid} has been interrupted`);
            process.exit(0);
        })
        process.on('uncaughtException', async (err) => {
            console.trace();
            //redacted: fetch/web3 errors carry URLs with webhook tokens and keys
            console.error(redactUrls(err?.stack || err));
            // Only crash+restart in PROD (pm2 restarts it). In dev there is no
            // supervisor, so a stray error must NOT kill the whole web API.
            if (process.env.PROD) {
                try { await callDiscordHook(`🔥 Uncaught Exception: ${redactedMessage(err)}`); } catch (_) {}
                process.exit(1);
            }
        });
        process.on('unhandledRejection', async (reason, promise) => {
            console.trace();
            console.error(reason && redactUrls(reason.toString()));
            if (process.env.PROD) {
                try { await callDiscordHook(`‼️ unhandledRejection: ${redactUrls(JSON.stringify(reason))} ${JSON.stringify(promise)}`); } catch (_) {}
                process.exit(1);
            }
        });
    }catch(err){
        console.error(err);
    }
}

function callDiscordHook(str:any, url = discordHook('DISCORD_HOOK_WEB_DEFAULT')){
    console.log(str);
    if(!process.env.PROD) return;
    //an unconfigured webhook (common/discord-hooks.ts) only logs
    if(!url) return;
    var body = typeof str === "string"?{
        username:"Bot admin",
        content: `${str}`
    }:str;

    //not awaited by most callers: a failure must not become an unhandled
    //rejection (which exits in PROD), and is logged without the URL
    return fetch(url,
        {
            method:"POST",
            body:JSON.stringify(body),
            headers:{'Content-Type':"application/json"}
        }).catch((error)=>{
            console.log("discord hook error", redactedMessage(error));
        })
}

function eW(fn){ //middleware wrapper with try catch error handling
    return async (req, res, next)=>{
        try{
            await fn(req, res, next);
        }catch(error){
            return res.status(500).send({error});
        }
    }
}
async function apiKeyMiddleware(req, res, next){
    const {address, itemId, PlayFabId, apiKey} = req.body;
    if(apiKey !== GOLF_API_KEY){
        return res.status(500).send({error:"wrong api key"})
    }
    next();
}
let lastTimeUnlock = {};
async function controlMiddleware(req, res, next){
    const authchain0 = await JSON.parse(req.header(`x-identity-auth-chain-0`));
    const {address, PlayFabId} = req.body;

    if (lastTimeUnlock[PlayFabId] && ((lastTimeUnlock[PlayFabId] + 5000) > Date.now())) {
        return res.status(500).send({error: "don't spam please"});
    }
    lastTimeUnlock[PlayFabId] = Date.now();

    if(authchain0.payload.toLowerCase() !== address.toLowerCase()){
        console.log("payload", authchain0.payload.toLowerCase(), address.toLowerCase());
        callDiscordHook(`IMPERSONATION  ${new Date().toLocaleString()}${address.toLowerCase()} signed:${authchain0.payload.toLowerCase()} ${PlayFabId}`)
        return res.status(500).send({error:"Error x"});
    }

    if(!await checkAddressIsPlayFabId(address, PlayFabId)){
        callDiscordHook(`IMPERSONATION ${new Date().toLocaleString()} Not match PlayFabID ${address.toLowerCase()} signed:${authchain0.payload.toLowerCase()} ${PlayFabId}`)
        return res.status(500).send({error:"Error x"});
    }

    next();
}
async function checkAddressIsPlayFabId(address, PlayFabId){
    const Data = await promisify(PlayFabServer.GetPlayFabIDsFromGenericIDs)({
        "GenericIDs": [
            {
                "ServiceName": "address",
                "UserId": address.toLowerCase()
            }
        ]
    }).then(r=>r.data.Data);

    if(Data[0].PlayFabId !== PlayFabId){
        console.error("FT: Impersonation?", Data[0].PlayFabId, PlayFabId, address,);
        return false;
    }

    return true;
}
function handleSignedFetchError(err){
    callDiscordHook(`SignedFetch error ` + err.message);
    return ({ok: false, message:err.message});
}