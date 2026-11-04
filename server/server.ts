//first: captures every log line printed after it (GET */_logs)
import {logsHandler} from "../common/log-buffer";
//before handleProcessExit(): its handlers print errors through it
import {redactedMessage} from "../common/redact";
import {TournamentRoom} from "./rooms/Tournament-Room";
import {MultiplayerDemoRoom} from "./rooms/Multiplayer-Demo-Room";

console.log("initializing server ...");
import dotenv from'dotenv';
const fetch = require("node-fetch");
import {tryFetch} from "./utils/try-fetch";
dotenv.config();
handleProcessExit();
import { initializeMaterials } from '../scene/golfplay/physics/world';
import { getLobbyRoom } from "./rooms/GameLobbyRoom";

import CANNON from "cannon";
(<any>global).CANNON = CANNON;
initializeMaterials();

import PlayFabServer from 'playfab-sdk/Scripts/PlayFab/PlayFabServer';
import PlayFabAdmin from 'playfab-sdk/Scripts/PlayFab/PlayFabAdmin';
if(!process.env.PLAYFAB_TITLE_ID){
  console.log("missing .env vars");
  process.exit(1);
}

if(!process.env.SERVER){
  console.log("missing SERVER env var");
  process.exit(1);
}

PlayFabServer.settings.titleId = process.env.PLAYFAB_TITLE_ID;
PlayFabServer.settings["DeveloperSecretKey"] = PlayFabServer.settings.developerSecretKey = process.env.PLAYFAB_SECRET_KEY;
PlayFabAdmin.settings.titleId = process.env.PLAYFAB_TITLE_ID;
PlayFabAdmin.settings["DeveloperSecretKey"] = PlayFabAdmin.settings.developerSecretKey = process.env.PLAYFAB_SECRET_KEY;
import express from 'express';
import cors from 'cors';

import { createServer } from 'http';
import { Server, RelayRoom, matchMaker } from 'colyseus';
import { monitor } from '@colyseus/monitor';
import { GameLobbyRoom } from './rooms/GameLobbyRoom';
import { TrainingRace } from './rooms/Training-Race';
import { TestRoom} from './rooms/Test-Room';
import {TrainingZone} from "./rooms/Training-Zone";
import {TrainingVoxters} from "./rooms/Training-Voxters";
import {TrainingHole} from "./rooms/Training-Hole";
import {CompetitionGroupRoom} from "./rooms/Competition-Group";
import MESSAGE from "./rooms/mesages";
import basicAuth = require("express-basic-auth");
import { json } from 'body-parser';
import { promisify } from 'util';
import {ValidateRoom} from "./rooms/Validate-Room";
import {PingRoom} from "./rooms/Ping-Room";
import {TestRoom2} from "./rooms/Test-Room2";
import {RaceEventRoom} from "./rooms/Race-Event-Room";
import {MissionRoom} from "./rooms/Mission-Room";
import {SeasonRoom} from "./rooms/Season-Room";
import {DclAwardsRoom} from "./rooms/DclAwardsRoom";
import {LiveTournamentLobbyRoom} from "./rooms/live-tournament-lobby";
import {LiveTournamentRoom} from "./rooms/live-tournament-room";
import {SeasonPartyLobbyRoom} from "./rooms/season-party-lobby";
import {SeasonPartyRoom} from "./rooms/season-party-room";
import { discordHook } from '../common/discord-hooks'

require('dotenv').config();
const port = Number(process.env.PORT || 2567) + Number(process.env.NODE_APP_INSTANCE || 0);
const app = express();
/*app.use(express.json({limit: '25mb'}));
app.use(express.urlencoded({limit: '25mb'}));*/
var whitelist = ['https://play.decentraland.org', 'https://decentraland.org', 'https://pirate-fever.estornut.vercel.app']
const corsOptions = {
  //origin: process.env.PROD ? 'https://decentraland.org':"*"
  origin:(origin, callback)=>{
    if (whitelist.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS '+origin));
    }
  }
}

if(process.env.PROD){
  //console.log = function(){}
}
if(!process.env.GOLF_API_KEY){
    throw Error("missing GOLF_API_KEY");
}
//before cors: the logs route never answers with CORS headers
app.get('*/_logs', logsHandler);

app.use(cors({
  corsOptions: process.env.PROD?corsOptions:undefined
}));

app.use(express.json());

const gameServer = new Server({
    server: createServer(app),
    pingInterval: process.env.PROD ? 1500 : 0,
    //SDK6 kept the default 2, which drops a client after ~4.5 s without a
    //pong: the Decentraland desktop client stalls that long while it loads a
    //neighbouring scene, and the Season run was lost. 6 tolerates ~10 s.
    pingMaxRetries: 6,
});

gameServer.define('validate-room', ValidateRoom)
    .filterBy(['roomInstanceId'])
    .enableRealtimeListing();

gameServer.define('test-room', TestRoom)
.filterBy(['roomInstanceId'])
.enableRealtimeListing();

gameServer.define('test-room2', TestRoom2)
.filterBy(['courseId'])
.enableRealtimeListing();

gameServer.define('race-event-room', RaceEventRoom)
    .filterBy(['courseId'])
    .enableRealtimeListing();

gameServer.define('training-race', TrainingRace)
.filterBy(['roomInstanceId'])
.enableRealtimeListing();

gameServer.define('training-zone', TrainingZone)
.filterBy(['roomInstanceId'])
.enableRealtimeListing();

gameServer.define('training-voxters', TrainingVoxters)
.filterBy(['roomInstanceId'])
.enableRealtimeListing();

gameServer.define('training-hole', TrainingHole)
.filterBy(['roomInstanceId'])
.enableRealtimeListing();

gameServer.define('mission-room', MissionRoom)
.filterBy(['roomInstanceId'])
.enableRealtimeListing();

gameServer.define('demo-room', MultiplayerDemoRoom)
    .filterBy(['roomInstanceId'])
    .enableRealtimeListing();

gameServer.define('season-room', SeasonRoom)
    .filterBy(['roomInstanceId'])
    .enableRealtimeListing();

//"Play ranked with friends": one shared waiting room, and the game rooms it
//creates (joined by id only, see season-party-registry)
gameServer.define('season-party-lobby', SeasonPartyLobbyRoom);
gameServer.define('season-party-room', SeasonPartyRoom);

gameServer.define('dcl-awards-room', DclAwardsRoom)
    .enableRealtimeListing();

gameServer.define('gameLobbyRoom', GameLobbyRoom, {gameServer})
//.filterBy(['realm'])
.enableRealtimeListing();
gameServer.define("LiveTournamentLobbyRoom", LiveTournamentLobbyRoom)
    .enableRealtimeListing();

gameServer.define("live-tournament", LiveTournamentRoom).filterBy(["roomIndex","instanceId"]).enableRealtimeListing();

gameServer.define('ping', PingRoom);

gameServer.define(`competition-group`, CompetitionGroupRoom)
.filterBy(['roomInstanceId'])
.enableRealtimeListing();//TODO we filter for now userId, but at some point we could like to show them all together
gameServer.define(`tournament`, TournamentRoom)
    .filterBy(['roomInstanceId'])
    .enableRealtimeListing();//TODO we filter for now userId, but at some point we could like to show them all together
// The monitor lists every live room and can call methods on them, so its
// password cannot sit in the source: this repo is going public. An unset
// MONITOR_PASSWORD REFUSES the route instead of falling back to a default,
// because a default committed here is the same leak with extra steps.
const MONITOR_USER = process.env.MONITOR_USER || "golfcraft";
const MONITOR_PASSWORD = process.env.MONITOR_PASSWORD;
if(!MONITOR_PASSWORD){
    console.log("MONITOR_PASSWORD is not set: */monitor will refuse every request");
}
const basicAuthMiddleware = MONITOR_PASSWORD
    ? basicAuth({
        users: {[MONITOR_USER]: MONITOR_PASSWORD},

        // sends WWW-Authenticate header, which will prompt the user to fill
        // credentials in
        challenge: true
    })
    //no challenge: a browser prompt would suggest there is a password to find
    : (req, res) => res.status(503).send("monitor is not configured");
var router = express.Router();

app.use('*/ping', (req, res)=>{
  res.status(200).send("OK")
});

//public counters for golfcraftgame.com/stats: everyone in the scene is in
//gameLobbyRoom, and a player in a match also sits in one of the game rooms
const NON_GAME_ROOMS = ["gameLobbyRoom", "season-party-lobby", "LiveTournamentLobbyRoom", "ping"];
//The games being played right now, for the scene's spectator view
//(rooms/spectator.ts). Only rooms that published metadata are listed, which
//today means a Ranked run and a Ranked party; a room has to opt in by calling
//publishLiveMetadata, so nothing is exposed by accident. Names only: no wallet
//and no PlayFabId ever leaves this endpoint.
app.get('*/live-games', async (req, res)=>{
  try{
    const rooms = await matchMaker.query({});
    const games = rooms
        .filter(room => (room.metadata as any)?.mode)
        .map(room => {
          const meta = room.metadata as any;
          return {
            roomId: room.roomId,
            name: room.name,
            mode: meta.mode,
            courseId: meta.courseId || "",
            players: Array.isArray(meta.players) ? meta.players.slice(0, 32) : [],
            startedAt: Number(meta.startedAt) || 0,
            hole: Number(meta.hole) || 1,
            holes: Number(meta.holes) || 4,
            spectators: Number(meta.spectators) || 0
          };
        })
        //the one that started most recently first: it has the longest left to watch
        .sort((a, b) => b.startedAt - a.startedAt);
    res.set("Cache-Control", "no-store");
    res.send({games});
  }catch(error){
    console.log("/live-games error", error);
    res.status(500).send({error: "unavailable"});
  }
});

app.get('*/online', async (req, res)=>{
  try{
    const rooms = await matchMaker.query({});
    const playing = rooms
        .filter(room => !NON_GAME_ROOMS.includes(room.name))
        .reduce((total, room) => total + room.clients, 0);
    res.send({inScene: getLobbyRoom()?.state.players.size || 0, playing});
  }catch(error){
    console.log("/online error", error);
    res.status(500).send({error: "unavailable"});
  }
});

//Everything below is for the owner's admin dashboard (web/server/admin-dashboard).
//Only the web service calls these, with GOLF_API_KEY, the same key /api/hole-start
//checks; the key travels in the BODY and not in a query string, which ends up in
//access logs. A broadcast and a room listing are not worth a session mechanism.
const ADMIN_MESSAGE_MAX = 300;
const ADMIN_TIMEOUT_MIN = 1000;
const ADMIN_TIMEOUT_MAX = 2 * 60 * 1000;
const ADMIN_TIMEOUT_DEFAULT = 15000;

//The colyseus monitor can only message ONE client at a time
//(Room.prototype._sendMessageToClient), which is why the owner could not
//announce anything. Everyone in the scene sits in gameLobbyRoom, players in a
//match included, so that room IS "everybody in the game", and its clients
//already understand the "server" message (scene/src/meta/game-lobby.ts shows it
//as a toast). The scene strips <color=..> markup, so this is plain text.
app.post('*/admin-broadcast', async (req, res)=>{
  try{
    const {apiKey, message, timeout} = req.body || {};
    if(apiKey !== process.env.GOLF_API_KEY) return res.status(400).send({error: "NON AUTH"});
    const text = String(message ?? "").trim().slice(0, ADMIN_MESSAGE_MAX);
    if(!text) return res.status(400).send({error: "empty message"});
    const asked = Number(timeout);
    const ms = isFinite(asked) ? Math.min(ADMIN_TIMEOUT_MAX, Math.max(ADMIN_TIMEOUT_MIN, Math.round(asked))) : ADMIN_TIMEOUT_DEFAULT;
    const lobbyRoom = getLobbyRoom();
    //nobody has joined the lobby since this process started: say so rather than
    //answering 200 to a broadcast that reached no one
    if(!lobbyRoom) return res.status(503).send({error: "lobby room is not up"});
    const sent = lobbyRoom.clients.length;
    lobbyRoom.broadcast("server", {message: text, timeout: ms});
    //worth a log line: it is the one action here that every player sees
    console.log("admin broadcast to", sent, "clients:", text);
    res.send({sent, timeout: ms});
  }catch(error){
    console.log("/admin-broadcast error", redactedMessage(error?.message));
    res.status(500).send({error: "broadcast failed"});
  }
});

//What the monitor's own HTTP API answers at */monitor/api (rooms, clients,
//cpu, memory), without handing the dashboard the monitor's password. No
//wallet, PlayFabId or session ticket is in any of it.
app.post('*/admin-status', async (req, res)=>{
  try{
    const {apiKey} = req.body || {};
    if(apiKey !== process.env.GOLF_API_KEY) return res.status(400).send({error: "NON AUTH"});
    const now = Date.now();
    const rooms = await matchMaker.query({});
    const listed = rooms.map(room => ({
      roomId: room.roomId,
      name: room.name,
      clients: room.clients,
      maxClients: room.maxClients,
      locked: room.locked || false,
      //createdAt is a Date in local storage and a string over redis
      elapsedTime: Math.max(0, now - new Date(room.createdAt).getTime())
    })).sort((a, b) => b.clients - a.clients || a.name.localeCompare(b.name));
    const lobbyRoom = getLobbyRoom();
    res.send({
      rooms: listed,
      connections: listed.reduce((total, room) => total + room.clients, 0),
      inScene: lobbyRoom?.state.players.size || 0,
      playing: listed.filter(room => !NON_GAME_ROOMS.includes(room.name)).reduce((total, room) => total + room.clients, 0),
      server: process.env.SERVER || "",
      //the process, not the host: these apps share a CapRover machine
      uptime: Math.round(process.uptime()),
      memoryMB: Math.round(process.memoryUsage().rss / (1024 * 1024)),
      now
    });
  }catch(error){
    console.log("/admin-status error", redactedMessage(error?.message));
    res.status(500).send({error: "status unavailable"});
  }
});

const GROUP_MATCHER_URL = process.env.PROD?"http://52.12.188.146/golfcraft-competition":"http://localhost:2568";

tryFetch(1, `${GROUP_MATCHER_URL}/groups`, {method:"GET"}).then(async g=>console.log("groups",await g.json()), (err)=>console.error(err))

const lastTimeUnlock = {};

const apiKey = process.env.PLAYFAB_API_KEY;

app.post(`*/unlock-all`, async (req, res) => {
  const {DisplayName, PlayFabId} = req.body;  
  console.log("unlock-all", {DisplayName, PlayFabId});
  if(lastTimeUnlock[PlayFabId] && lastTimeUnlock[PlayFabId]+500 > Date.now()){
    console.log("unlock too fast", DisplayName, PlayFabId);
    return res.status(400).send("too fast");
  }
  lastTimeUnlock[PlayFabId] = Date.now();
  try{
    const result = await promisify(PlayFabServer.ExecuteCloudScript)({
      FunctionName:'unlockAll',
      PlayFabId,
      FunctionParameter:{
        apiKey,
        DisplayName,
        PlayFabId
      }
    });
    //not the whole result: its cloudscript Logs can echo the parameters (apiKey)
    console.log("result", {FunctionResult: result?.data?.FunctionResult, Error: result?.data?.Error?.Message});
    const {data} = result;
    const {FunctionResult} = data;
    console.log("unlocked all", FunctionResult);
    return res.json({FunctionResult});
  }catch(err){
    console.log("error", err);
    return res.status(400).send();
  }
  
});
app.post(`*/unlockWithXp`, async (req, res) => {
  const {DisplayName, PlayFabId, ContainerItemId} = req.body;

  console.log("unlockWithXp", {DisplayName, PlayFabId, ContainerItemId});

  if(lastTimeUnlock[PlayFabId] && lastTimeUnlock[PlayFabId]+500 > Date.now()){
    console.log("unlock too fast", DisplayName, PlayFabId);
    return res.status(400).send("too fast");
  }
  lastTimeUnlock[PlayFabId] = Date.now();
  try{
    const {data} = await promisify(PlayFabServer.ExecuteCloudScript)({
      FunctionName:'unlockWithXp',
      PlayFabId,
      FunctionParameter:{
        apiKey,
        DisplayName,
        PlayFabId,
        ContainerItemId
      }
    });
    console.log("data", {FunctionResult: data?.FunctionResult, Error: data?.Error?.Message});
    const {FunctionResult} = data;
    return res.json({FunctionResult});
  }catch(err){
    console.log("error" ,err);
    return res.status(400).send();
  }
});

app.use("*/request-competition-group-room", async (req, res) => {
    try{
        const {userId, displayName, PlayFabId, competition_points} = req.body;
        console.log("request-competition-group-room", {userId, displayName, PlayFabId, competition_points});
        const {data} =  await promisify(PlayFabServer.GetUserInventory)({
            PlayFabId
        });
        //console.log("useInventory", data);

        if(data.Inventory.filter(i=>i.ItemClass === "Chest").length >= 10){
            return res.status(400).json({error:"Too many chests"});
        }

        try{
            const result = await fetch(`${GROUP_MATCHER_URL}/request-competition-group-room`, {
                method:"POST",
                headers: {
                    'Content-Type': 'application/json',
                },
                body:JSON.stringify({
                    userId, displayName, PlayFabId,
                    competition_points,
                    server:process.env.SERVER
                })
            }).then(r=>r.json());

            return res.send(result);
        }catch(err){
            console.log("RES ERROR", err, req.body.userId);
            return res.status(400).send({error:err||null});
        }
    }catch(error){
        return res.status(500).send({error})
    }

});



app.post("*/notify-group-update", async (req, res)=>{ //TODO group_matcher_server must call this endpoint when someone finishes
  const {groupId, players} = req.body;
  const lobbyRoom = getLobbyRoom();
  if(lobbyRoom){
    if(!players.forEach){
      console.log("players wrong value", players);
    }
    players.forEach(player => {
      if(player.server === process.env.SERVER){
        const winnerLobbyClient = player && lobbyRoom.clientsMapBySessionId[player.lobbySessionId];
        winnerLobbyClient && winnerLobbyClient.send(MESSAGE.UPDATE_COMPETITION_GROUP);
      }
    })
  }
});

app.post("*/notify-group-finish", async (req, res)=>{
  const {groupId, players} = req.body;
  const lobbyRoom = getLobbyRoom();

  if(lobbyRoom){
    if(!players.forEach){
      console.log("winners wrong value", players);
    }
    players.forEach(winner => {
      const winnerLobbyClient = winner && lobbyRoom.clientsMapBySessionId[winner.lobbySessionId];
      winnerLobbyClient && winnerLobbyClient.send(MESSAGE.UPDATE_COMPETITION_GROUP_REWARDS);
    })
  }
})

app.get('*/competition-group-list', async (req, res)=>{
  const userId = req.query.userId;
  const lobbySessionId = req.query.lobbySessionId;
  let url  =`${GROUP_MATCHER_URL}/competition-group-list?userId=${userId}`;
  if(lobbySessionId){
    url += `&lobbySessionId=${lobbySessionId}`;
  }
  return res.json( await tryFetch(3, url, undefined).then(r=>r.json(), (error)=>({error})));
});

app.use('*/monitor', basicAuthMiddleware, monitor());
/**app.post('*\/login', (req, res) => {//TODO not used for now
  console.log("req",req);
  try{
    const {signature, address, msgParams} = req.body;
    const recovered = recoverTypedSignature_v4({
      data:JSON.parse(msgParams),
      sig:signature
    });
    if(recovered.toLowerCase() === address.toLowerCase()){
      //res.sendStatus(200);
      PlayFabServer.LoginWithServerCustomId(<any>{
        CreateAccount:true,
        CustomId:address,
        InfoRequestParameters:{
          GetUserReadOnlyData:true,
          GetUserInventory:true,
          GetUserVirtualCurrency:true,
          GetPlayerStatistics:true
        },
        "X-SecretKey":process.env.PLAYFAB_SECRET_KEY,
        TitleId:"BEAFE"
      },(error, result)=>{
        console.log("pf Login res", error, result);
        if(!error){
          if(result.data.NewlyCreated){

          }
          res.status(200).send(result.data);
        }else{
          res.status(403).send(error);
        }
        
      });
    }else{
      throw new Error("wrong signature");
    }

  }catch(err){
    console.log(err);
    res.sendStatus(403);
  }
});*/
gameServer.listen(port);
console.log("listening...");

function handleProcessExit(){
  process.on('SIGTERM', async (signal) => {        
      await callDiscordHook(`Process ${process.pid} received a SIGTERM signal`);
      process.exit(0);
    })
    
    process.on('SIGINT', async (signal) => {
      await callDiscordHook(`Process ${process.pid} has been interrupted`);
      process.exit(0);
    })
  process.on('uncaughtException', async (err) => {
      await callDiscordHook(`Uncaught Exception: ${redactedMessage(err?.message)}`);
      process.exit(1);
  });
  process.on('unhandledRejection', async (reason, promise) => {
      //redacted: fetch errors carry URLs with webhook tokens and API keys
      await callDiscordHook(`unhandlerdRejection: ${redactedMessage(String(reason))} ${promise}`);
     // process.exit(1)
  });

  async function callDiscordHook(str:string){
    console.log(str);
    return;//TODO
    var body = {
            username:"bot",
            content: `WS SERVER: ${str}`
        };
  
    var url = discordHook('DISCORD_HOOK_ADMIN');
    //an unconfigured webhook (common/discord-hooks.ts) only logs
    if(!url) return;
  
    return await fetch(url,
        {
            method:"POST",
            body:JSON.stringify(body),
            headers:{'Content-Type':"application/json"}
        })
  }
}
