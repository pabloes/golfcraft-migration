import {PlayFabServer} from "playfab-sdk";
import {promisify} from "util";

// Who is joining a room, proven by the PlayFab session ticket the client sends
// in its join options (clientInfo.sessionTicket), see docs/contracts/login.md.
//
//   PlayFabId: from the ticket (the client-sent PlayFabId is ignored).
//   address:   user.publicKey when that wallet really is this account's
//              "address" generic ID; otherwise the PlayFabId. Players without
//              a wallet (Studio guests, email, Google) get their records keyed
//              by PlayFabId and never match the wallet allow-list.
//
// Without a ticket the old, unverified lookup is kept (publicKey -> account,
// or the client-sent PlayFabId) until the deployed scene sends the ticket in
// every join; then drop the fallback.
export type ResolvedPlayer = {PlayFabId: string, address: string};

export async function resolvePlayer({clientInfo, user, PlayFabId}: any): Promise<ResolvedPlayer> {
    const ticket = clientInfo?.sessionTicket;
    const wallet = typeof user?.publicKey === "string" && /^0x[0-9a-fA-F]{40}$/.test(user.publicKey)
        ? user.publicKey.toLowerCase() : null;

    if (!ticket) {
        console.log("session-auth: join without session ticket", user?.displayName);
        const id = wallet ? await findAccountByAddress(wallet) : PlayFabId;
        if (!id) throw new Error("no account for this player");
        return {PlayFabId: id, address: wallet || id};
    }

    const {data} = await promisify(PlayFabServer.AuthenticateSessionTicket)({SessionTicket: ticket});
    if (data?.IsSessionTicketExpired || !data?.UserInfo?.PlayFabId) throw new Error("invalid session ticket");
    const id = data.UserInfo.PlayFabId;
    const owned = wallet && (await findAccountByAddress(wallet)) === id;
    if (wallet && !owned) console.log("session-auth: publicKey does not belong to the account", user?.displayName, id);
    return {PlayFabId: id, address: owned ? wallet : id};
}

async function findAccountByAddress(address: string): Promise<string | null> {
    const [{PlayFabId}] = await promisify(PlayFabServer.GetPlayFabIDsFromGenericIDs)({
        GenericIDs: [{ServiceName: "address", UserId: address}]
    }).then(r => r.data.Data);
    return PlayFabId || null;
}
