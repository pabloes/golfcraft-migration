import fetch from "cross-fetch";
import {redactedMessage} from "../../../common/redact";

// Public Decentraland names for a list of wallets, and the cut form of a wallet
// that is safe to serve. Both are what /stats has been doing since 2026-10-21;
// this module exists so a second page does not have to reinvent them. /stats
// and /relaunch-data both use it since 2026-11-07, so they share one name cache.
//
// ⚠ `maskWallet` is NOT an identity. It keeps 5 hex characters, so distinct
// wallets collide: in September 2023 alone, 0x95044…566d and 0x9509a…7d6d both
// render "0x950...6d". Never group, merge or deduplicate rows by the mask — key
// them on the lowercased address, or on a hash of it like /api/relaunch-data's
// `id`, and use the mask only for display.
//
// The lambdas answer `GET /lambdas/profiles?id=` with 405 now: only the batched
// POST works (stats §16). A lookup that fails leaves the name empty and is
// tried again on the next request, so a dead peer never fails a page.
const PROFILES_URL = "https://peer-lb.decentraland.org/lambdas/profiles";
const PROFILES_TIMEOUT_MS = 5000;
const PROFILE_CACHE_MS = 60 * 60 * 1000;
const BATCH = 100;
const NAME_MAX = 40;

const profileNames: {[address: string]: {at: number, name: string}} = {};

export const isWallet = (address: string) => /^0x[0-9a-f]{40}$/.test(address);

//"0x27ffcc...eb57" -> "0x27f...57". Full wallets never leave the server.
export function maskWallet(address: string){
    return address.length > 9 ? `${address.slice(0, 5)}...${address.slice(-2)}` : "...";
}

export async function lookupNames(addresses: string[], logLabel = "profiles"): Promise<{[address: string]: string}> {
    const now = Date.now();
    const missing = addresses.filter(a => isWallet(a) && !(profileNames[a] && now - profileNames[a].at < PROFILE_CACHE_MS));
    for(let i = 0; i < missing.length; i += BATCH){
        const ids = missing.slice(i, i + BATCH);
        try{
            const profiles: any[] = await Promise.race([
                fetch(PROFILES_URL, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ids})})
                    .then(r => r.ok ? r.json() : Promise.reject(new Error(`profiles ${r.status}`))),
                new Promise((_, reject) => setTimeout(() => reject(new Error("profiles timeout")), PROFILES_TIMEOUT_MS))
            ]) as any[];
            const found: {[address: string]: string} = {};
            (Array.isArray(profiles) ? profiles : []).forEach(profile => {
                const avatar = profile?.avatars?.[0];
                const id = String(avatar?.ethAddress || avatar?.userId || "").toLowerCase();
                if(id) found[id] = String(avatar?.name || "").slice(0, NAME_MAX);
            });
            ids.forEach(a => profileNames[a] = {at: now, name: found[a] || ""});
        }catch(error){
            console.log(`${logLabel} lookup error`, redactedMessage(error));
        }
    }
    return addresses.reduce((acc, a) => (acc[a] = profileNames[a]?.name || "", acc), {});
}
