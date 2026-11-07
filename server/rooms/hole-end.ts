// When a hole ends, and who may end it (user, 2026-11-07).
//
// Until now ONE shared countdown ran from the moment the first ball dropped,
// whoever it belonged to, and its length came from the rank of the room:
// countdownByTierCat, 30 s in WOOD down to 15 s from SILVER up. That cut the
// player off whenever a recorded opponent holed early, and a row with no time
// scores 0 for the hole (setScoresAtRound), so it cost the whole hole. The
// production log of one afternoon had 3 of 8 holes ending with the countdown
// expiring exactly, i.e. with somebody still playing, and 3 more resolving
// with less than 1.7 s to spare.
//
// The fix is to notice WHO is actually waiting. A recorded opponent is a
// replay: it finished days ago and nothing waits on it, so its hole-out no
// longer starts any countdown. The rank countdown now runs only once every
// LIVE player is done, which is what it was always for: giving the replays
// still rolling a window to finish on screen.
//
// Nobody is held hostage by that: SKIP HOLE shows from the moment the first
// ball drops, and HOLE_SAFETY_MS caps the hole whatever happens.
export const HOLE_SAFETY_MS = 120000

// The last seconds of that cap are broadcast as a normal countdown, so a
// player about to be cut off sees it coming instead of the hole just ending.
export const SAFETY_WARNING_MS = 20000

// Ranked with friends only: a player who has already finished may end the hole
// for everyone after waiting this long, so one slow friend cannot hold three
// others for the full cap. Before that, SKIP only marks the sender done.
export const FORCE_END_WAIT_MS = 60000
