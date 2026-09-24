import * as crypto from "crypto";

// Hand-off between season-party-lobby and season-party-room.
//
// The lobby registers the party here and then creates the game room with only
// the partyId. The room reads the members back from this in-process map, so a
// client calling joinOrCreate("season-party-room", {...}) cannot make up its
// own member list: an unknown partyId makes onCreate throw.
export type PartyMember = {
    address: string;//user.publicKey, used for the PlayFab lookup
    userId: string;//user.userId, used for results and recorded games (same as Season-Room)
    displayName: string;
    PlayFabId: string;
    token: string;//secret handed to that member only; season-party-room onAuth checks it
};

const pendingParties = new Map<string, PartyMember[]>();

export const registerParty = (members: PartyMember[]): string => {
    const partyId = crypto.randomUUID();
    pendingParties.set(partyId, members);
    return partyId;
};

export const takeParty = (partyId: string): PartyMember[] | undefined => {
    const members = pendingParties.get(partyId);
    pendingParties.delete(partyId);
    return members;
};

export const createPartyToken = () => crypto.randomUUID();
