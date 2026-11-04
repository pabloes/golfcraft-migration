import fetch from "cross-fetch";

// The golf club NFTs a wallet holds, from the web API's index
// (web/server/nft/), which follows the contract's Transfer events on Polygon.
//
// It replaces the subgraph the lobby room used to query for the daily energy
// bonus: that subgraph has had no indexer allocated since January 2026, so it
// answered an error and the bonus silently paid nobody for ten months.
//
// Never fatal: on any failure the caller treats it as "no clubs", which only
// means the bonus is not paid on this connection and is tried again on the
// next one, exactly as a failed subgraph query used to behave.
const API_URL = process.env.PROD ? `https://golfcraftgame.com` : `http://localhost:2569`;
const TIMEOUT_MS = 5000;

export async function getNftGolfclubs(address: string): Promise<{tokenId: number, model: number | null}[]>{
    const wallet = String(address || "").toLowerCase();
    //guests and Studio accounts have no wallet: nothing to look up
    if(!/^0x[0-9a-f]{40}$/.test(wallet)) return [];
    const answer: any = await Promise.race([
        fetch(`${API_URL}/api/nft-golfclubs?address=${encodeURIComponent(wallet)}`).then(r => r.json()),
        new Promise((_, reject) => setTimeout(() => reject(new Error("nft index timeout")), TIMEOUT_MS))
    ]);
    if(!answer?.ready){
        //the index is still seeding: not the same as "this wallet owns none"
        console.log("nft golfclub index not ready yet", wallet);
        return [];
    }
    return Array.isArray(answer.clubs) ? answer.clubs : [];
}

// How many DISTINCT club models the wallet holds, which is what the daily
// energy bonus pays on (one Energy per model, as in SDK6).
export async function getNftGolfclubModelCount(address: string): Promise<number>{
    const clubs = await getNftGolfclubs(address);
    return new Set(clubs.map(c => c.model).filter(m => m !== null && m !== undefined)).size;
}
