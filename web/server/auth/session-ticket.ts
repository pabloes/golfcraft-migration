import {promisify} from "util";
import {PlayFabServer} from "playfab-sdk";

//Server-side check of a PlayFab Client session ticket. Returns the PlayFabId
//or null (missing, malformed or expired). Shared by the auth and stats routes.
export async function authenticateSessionTicket(sessionTicket: any): Promise<string | null> {
    if (typeof sessionTicket !== "string" || !sessionTicket || sessionTicket.length > 512) return null;
    try{
        const {data} = await promisify(PlayFabServer.AuthenticateSessionTicket)({SessionTicket: sessionTicket});
        if (data?.IsSessionTicketExpired) return null;
        return data?.UserInfo?.PlayFabId || null;
    }catch(error){
        return null;
    }
}
