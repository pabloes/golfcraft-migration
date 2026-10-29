*Work in progress · grown from `gdd-template.md`*

*Concept: name, formats and the 4-week intent are saved; next, the core loop steps (what a player does in one tournament).*

# OhMyGolf

**Decentraland Creator Success Program**

| |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
|---|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Public experience title | OhMyGolf, a new fork of Golfcraft (this name is used in this document only; the deployed scene is still titled Golfcraft) — IP & [Content Policy](https://decentraland.org/content/) status: owner declaration: the applicant owns the Golfcraft IP, and OhMyGolf is their own fork of it; name screening: concern found (2026-10-29): "Oh My Golf" is also a Unity browser game listed on GamePix (released June 2024, no developer named), an iOS app "OhMyGolf HD" (reviewed in 2013) and an indoor golf simulator in Morzine, France; unresolved: whether to keep the name given those matches, and the deployed scene and World still carry the Golfcraft title |
| Deployment target | The live game runs in Genesis City at 47,-45 (from the repo's `scene.json`). The same SDK7 game also deploys to a World with the repo's `scripts/deploy-scene-world.sh`. [OPEN: which World NAME]                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Studio / team name | pablo.dcl.eth |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Date | 2026-10-28                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Contact (Discord + email) |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

---

## 0. TL;DR

| | |
|---|---|
| **Current status** | OhMyGolf is a new fork of Golfcraft, the owner's minigolf game live in Decentraland since 2020 (owner). Golfcraft's record: about 220,000 finished games since 2022, 837 community-made maps, and 1,759 tournaments created by 33 organizers (from our database). The SDK7 version already plays: many playable holes, the tutorial missions, Ranked Season against recorded players, Ranked with friends (2–4 players) and the 20 wearables to earn each season (owner; Ranked Season is being verified end to end before next week). Mobile support goes public with the relaunch on November 1, 2026, together with @cocobayworld. The V0 slice, community tournaments (live and async) created, listed and played from the game menu, ran in the old SDK6 version with in-world panels and the website, and is not in SDK7 yet (from the repo). Playable link: https://decentraland.org/places/place/47,-45 |
| **Requested round** | V0 |

---

## 1. Player Promise

**One-line promise.**

[OPEN: waiting on the core loop] Owner seed: OhMyGolf is a minigolf game in Decentraland, a new fork of Golfcraft. The V0 slice is community tournaments: players create them, find them and play them from the game menu, live or async, and compete against the other players in the same tournament, with leaderboards and prizes.

---

## 3. Core Loop

| | |
|---|---|
| **One complete loop takes** | 10–15 minutes per tournament (owner): lobby → assigned match → play → result → reward. Two formats, as Golfcraft had them (owner): **live**, where everyone in the room plays the same maps at the same time and sees the other balls, and **async**, where a tournament stays open between a start and an end date and each player plays its maps when they want. What changes in this version is where they live: created, listed and played from the game menu instead of in-world panels and the website. No tournaments start on their own for now (owner). [OPEN: waiting on the loop steps — what marks each step and where the earlier payoff is] |

---

## 4. Why Players Come Back

### 4.2 The progression chain

Owner seed: progression comes from taking part in tournaments. [OPEN: what persists, and what it makes possible next]

Rewards are optional: wearables, SAND or something similar (owner). [OPEN: reward type, how it is earned, and its main abuse risk]

### 4.3 Two return hooks

| Selected hook | Exact trigger or timing | What the player anticipates | Reminder channel + no-reminder fallback |
|---|---|---|---|
| **1.** Community tournaments, live and async, created by players | [OPEN: waiting on the core loop — how often they appear, and how a player learns when the next one is] | | |
| **2.** Persistent leaderboards per tournament, with a weekly history | | | |

---

## 5. Social by Design

| | |
|---|---|
| **The repeatable social loop** | Owner seed: real-time competition against the other players in the same tournament. [OPEN: waiting on the core loop — what one player does that changes another player's play or result] |
| **From strangers to a group** | Players create tournaments and find open ones from the in-game menu, not from the website (owner). [OPEN: what the tournament list shows a newcomer, and how they pick one] |

---

## 6. Mobile-First

**UI plan.**

The SDK7 build already has touch shot controls: aim arrows and a SHOOT button at the bottom centre, and + / − power buttons beside the power bar. Menus and the in-game HUD use a full-screen phone layout that keeps the Decentraland app's corner buttons free (from the repo; reported working on an iPhone SE on 2026-10-13). Mobile support goes public with the November 1, 2026 relaunch (owner). Phone play is a first-class target for the slice (owner): every new tournament screen (create, list, waiting, results) uses the same phone layout as the current menus. [OPEN: how creating a tournament works with taps only, without typing on a phone keyboard]

---

## 9. 4 Week Plan (v1 scope)

If the application is confirmed, within four weeks the game has both the in-world map editor and community tournaments (live and async) in the game menu, and we run map-building contests for the COCOBAY season with them (owner). [OPEN: which of the two is the V0 slice agreed with the program, and which comes after it] [OPEN: the week-by-week table]

**Not building in v1.**

Moving the other SDK6 features to SDK7 is not part of this slice (owner): Crafting, Chain Bridge, Lucky Balls, Fashion Shop, Chests, Notifications, Multiplayer Demo, the Voxters pet, the DCL Awards minigame and the 3D lobby panels.
