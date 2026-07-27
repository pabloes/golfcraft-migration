// @ts-nocheck
import { shuffle } from "./utils";
export const GOLF_CLUB_BONUSES = {
  "0":25,
  "3":5,
  "2":1,
  "5":1,
  "6":15,
  "7":1,
  "8":1,
    "9":1
};
export const MAX_BONUS_GOLFCLUB = 0.5;
export const TRAINING = {
    RACE:"1",
    ZONE:"2",
    VOXTER:"3",
    HOLE:"4"
};

export const trainingIdNameMap = {
    [TRAINING.RACE]:"race",
    [TRAINING.ZONE]:"zone",
    [TRAINING.VOXTER]:"voxters",
    [TRAINING.HOLE]:"hole"
};

export const LEAVE_CODE = {
    COMPLETED:4000,
    TIMEOUT:4001,
    FAILED:4002,
    PROBLEM:4003
};

export const STATISTICS = {    
    TRAINING_RACE_1_COMPLETED:'training_race_1_completed',
    TRAINING_RACE_1_FAILED:'training_race_1_failed',
    TRAINING_ZONE_1_COMPLETED:'training_zone_1_completed',
    TRAINING_ZONE_1_FAILED:'training_zone_1_failed',
    TRAINING_VOXTERS_1_COMPLETED:'training_voxters_1_completed',
    TRAINING_VOXTERS_1_FAILED:'training_voxters_1_failed',
    TRAINING_HOLE_1_COMPLETED:'training_hole_1_completed',
    TRAINING_HOLE_1_FAILED:'training_hole_1_failed',
};

export const MAX_PER_GROUP = 3;
export const PRICE_COMPETITION_GROUP = 20;//TODO move to playfab title data
export const ChestTier1Winner1 = "ChestTier1Winner1";
export const ChestTier1Winner2 = "ChestTier1Winner2";
export const ChestTier1Winner3 = "ChestTier1Winner3";
export const USE_REMOTE_SERVER = false;
// Local dev runs the bevy-web explorer LOCALLY (http://localhost:5173) — a
// plain-http origin — so the browser WebSocket can connect to ws://localhost:2567
// DIRECTLY. No cloudflared tunnel / wss cert needed: the wss requirement was only
// for the hosted https explorer + the native deno_websocket (Mozilla-roots only),
// see .claude/CLAUDE.md §6 #22. This kills the trycloudflare URL churn. colyseus.js
// derives the matchmaking http endpoint from WS_HOST.
const SERVER_URL = USE_REMOTE_SERVER ? `ws.golfcraftgame.com` : `localhost:2567`;
export const SERVER_HTTP_URL = USE_REMOTE_SERVER ? `https://${SERVER_URL}` : `http://${SERVER_URL}`;
export const WS_HOST = USE_REMOTE_SERVER ? `wss://${SERVER_URL}` : `ws://${SERVER_URL}`;
// Onchain materials subgraph (GolfcraftMaterials ERC1155 on Polygon). SDK6's
// subgraph (owner Eibriel, id Ccskr6...) is dead ("no allocations"); this is a
// fresh deploy on The Graph Studio (materials-only). Studio dev endpoint needs
// no API key. Source lives in this repo at subgraph/golfcraft/.
export const MATERIALS_SUBGRAPH_URL = `https://api.studio.thegraph.com/query/9782/golfcraft/v0.0.1`;
// Golfcraft Golfclub ERC721 on Polygon. SDK6 resolved an equipped NFT club's
// model via the subgraph; we read getGolfclubId(tokenId) (selector 0x1f56940f)
// straight from the contract instead, over a public Polygon RPC.
export const GOLFCLUB_CONTRACT = `0xf044647af5d795a9459b7bc0bd47625d4764a222`;
export const POLYGON_RPC = `https://polygon-bor-rpc.publicnode.com`;
export const TIER_CATEGORIES = ["WOOD","STONE","IRON","BRONZE","SILVER","GOLD","DIAMOND","MASTER","GRAND MASTER","SUPREME"];
export const TIER_COLORS = [
    "#9f412c",
    "#4e5459",
    "#636d75",
    "#8c5120",
    "#b2b2b2",
    "#ff9717",
    "#3788b4",
    "#ff0000",
    "#5dff00",
    "#0093ff"];
export const TIERS = TIER_CATEGORIES.reduce((acc,current)=>{
    acc = [...acc, ...new Array(5).fill(current).map((c,i)=>`${c} ${5-i}`)];
    return acc;
},[]);