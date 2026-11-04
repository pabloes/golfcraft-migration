// Golf club NFT ownership, served from our own index (indexer.ts) instead of
// from the chain or from a subgraph (2026-11-04, user request).
//
// Two readers today:
//   - the scene, at login, to build the player's club collection
//     (scene/src/meta/bootstrap.ts:fetchNftGolfclubs, which keeps the direct
//     contract read as a fallback),
//   - the game server, for the daily energy bonus NFT holders get in the
//     lobby room (server/rooms/GameLobbyRoom.ts), which used to ask a dead
//     subgraph and therefore paid nobody since January.
//
// Public and unauthenticated: it answers nothing that is not already public on
// Polygon, and the scene has no credentials to offer. It is a single indexed
// SELECT, with no RPC in the request path.
import {PrismaClient} from "@prisma/client";
import {ensureNftTables, getGolfclubsOf, getIndexStatus, SYNC_EVERY_MS, syncGolfclubOwners} from "./indexer";

export function nftApi(router, prisma: PrismaClient){
    //the tables first: the sync reads them on its first tick
    ensureNftTables(prisma).then(() => {
        setTimeout(() => syncGolfclubOwners(prisma), 5000);
        setInterval(() => syncGolfclubOwners(prisma), SYNC_EVERY_MS);
    }, error => console.log("nft tables error", error?.message));

    router.get("/api/nft-golfclubs", async (req, res) => {
        const address = String(req.query?.address || "").toLowerCase();
        if(!/^0x[0-9a-f]{40}$/.test(address)){
            return res.status(400).send({error: "address required"});
        }
        try{
            const [clubs, status] = await Promise.all([
                getGolfclubsOf(prisma, address),
                getIndexStatus(prisma)
            ]);
            //distinct models, which is what both callers actually score on:
            //the energy bonus pays per model and the collection shows one card
            //per token
            const models = Array.from(new Set(clubs.map(c => c.model).filter(m => m !== null))).sort((a, b) => a - b);
            //a client must be able to tell "no clubs" from "index not ready",
            //or it would show an empty collection as if it were the truth
            res.set("Cache-Control", "public, max-age=15");
            return res.send({address, clubs, models, ready: status.ready, lastBlock: status.lastBlock});
        }catch(error){
            console.log("/api/nft-golfclubs error", error?.message || error);
            return res.status(500).send({error: "nft index unavailable"});
        }
    });

    router.get("/api/nft-index-status", async (req, res) => {
        try{
            return res.send(await getIndexStatus(prisma));
        }catch(error){
            return res.status(500).send({error: "nft index unavailable"});
        }
    });
}
