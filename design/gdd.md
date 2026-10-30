*Work in progress · grown from `gdd-template.md`*

*Draft complete for the owner's review: every section is written. Lines marked `[agent-decided]` are the agent's proposals, `TBD:` marks facts nobody knows yet. Next: the owner's review, then the submission check.*

# OhMyGolf

**Decentraland Creator Success Program**

| | |
|---|---|
| Public experience title | OhMyGolf, a new fork of Golfcraft (this name is used in this document only; the deployed scene is still titled Golfcraft) — IP & [Content Policy](https://decentraland.org/content/) status: owner declaration: the applicant owns the Golfcraft IP, and OhMyGolf is their own fork of it; name screening: concern found (2026-10-29): "Oh My Golf" is also a Unity browser game listed on GamePix (released June 2024, no developer named), an iOS app "OhMyGolf HD" (reviewed in 2013) and an indoor golf simulator in Morzine, France; unresolved: whether to keep the name given those matches, and the deployed scene and World still carry the Golfcraft title |
| Deployment target | Genesis City, 47,-45: https://decentraland.org/places/place/47,-45, where the game is live (owner). The program's page asks for the test scene in the applicant's own World; the same build deploys there with `scripts/deploy-scene-world.sh`. [OPEN: whether to add a World deploy, and under which NAME] |
| Studio / team name | pablo.dcl.eth |
| Date | 2026-10-30 |
| Contact (Discord + email) | pabloest + estornut@gmail.com |

---

## 0. TL;DR

| | |
|---|---|
| **Player promise** | You play minigolf against other players (recorded runs) and climb to win the season rewards. Players can create custom maps and organize their own tournaments. |
| **Primary player** | For players who already enjoy short competitive rounds (minigolf, racing ghosts, ranked ladders), arriving alone or with one friend, looking for a 10-minute run with something to climb. [agent-decided] |
| **Current status** | Playable core loop live in Decentraland. OhMyGolf is a new fork of Golfcraft, the owner's minigolf game live since 2020 (owner). Golfcraft's record: about 220,000 finished games since 2022, 837 community-made maps, and 1,759 tournaments created by 33 organizers (from our database). The SDK7 version already plays: many playable holes, the tutorial missions, Ranked Season against recorded players, Ranked with friends (2–4 players) and the 20 wearables to earn each season (owner; Ranked Season is being verified end to end before next week). Mobile support goes public with the relaunch on November 1, 2026, together with @cocobayworld. The V0 slice, community tournaments (live and async) created, listed and played from the game menu, ran in the old SDK6 version with in-world panels and the website, and is not in SDK7 yet (from the repo). Playable link: https://decentraland.org/places/place/47,-45. Phone screenshots (Decentraland mobile app, iPhone SE): [a Ranked hole with the live ranking](screenshots/phone-ranked-hole.webp) and [the season prizes by rank](screenshots/phone-prizes-by-rank.webp). |
| **Requested round** | V0 |
| **Live at end of the round** | A player can find or create a community tournament, async or live, from the game menu on a phone, and play it beside the Ranked runs that already work. [agent-decided] |

---

## 1. Player Promise

**One-line promise.**

You play minigolf against other players (recorded runs) and climb to win the season rewards. Players can create custom maps and organize their own tournaments.

---

## 2. First Minutes & How to Play

| Time | Player experience |
|---|---|
| **0–5 seconds after control** | You land in front of the clubhouse. A welcome card fills the screen: a champion, a builder, a promoter, and one button: OK, Let's Go! |
| **5–10 seconds** | You tap it. The menu opens on the Season card: your tier, WOOD 5, the next wearable to win, a big PLAY. The goal is clear: climb the season. |
| **10–60 seconds** | PLAY loads the first map. Three balls wait beside yours, other players' recordings. You aim with the arrows, set the power, tap SHOOT. Your ball rolls; theirs roll too. Shots and seconds count. |
| **1–3 minutes** | Your ball drops in. The hole result ranks the four of you by shots and time, and the next hole loads. Four holes make a run. |
| **3–10 minutes** | After the fourth hole, the run-complete screen: season points won or lost, your tier, materials, xp, and the next wearable's distance. You choose: play again, Play together with friends, or a tournament. |
| **Natural stopping point** | A run costs one energy; you get 10 a day. The menu shows the energy left, your tier and the points still needed for the next prize: tomorrow's 10 runs are the way to it. |

The 5/10 rule (80% act within 5 s and can state the goal within 10 s) is untested [HYPOTHESIS H1-01].

**Player-facing How to Play.**

- Aim, set power, tap SHOOT
- Fewer shots and faster beats the other three
- Friends play live; others are recorded runs

---

## 3. Core Loop

The core loop is a **Ranked run**: you can always play alone, without waiting for anyone, because your opponents are other players' recorded runs. Tournaments (async and live) are extra modes on top of it (Section 9). Steps and numbers come from the game as built (from the repo).

| # | Step (verb) | What the player does (Player input → what they see or hear → what changes) | Why do it again? |
|---|---|---|---|
| 1 | Start a run | Tap PLAY on the Season card of the menu → the first of 4 maps picked for your tier loads, with 3 recorded players lined up at the tee → 1 energy is spent | Every run is a new set of maps and a new field |
| 2 | Shoot | Aim (arrows or drag), set the power, tap SHOOT → the ball rolls on the server's physics while the other balls play their recordings → shots and time count | The shot is the skill: the same map rewards a better line |
| 3 | Hole out | Reach the hole; when the first ball holes, a countdown starts for the rest (30 s at WOOD, down to 10 s at the top tiers) → the hole result ranks the 4 players by shots and time | Beating recorded players who were once as good as you |
| 4 | Collect | After the 4th hole, the run-complete screen → season points move your tier up or down, materials and xp are added, and the next season prize shows how far it is | The tier and the next of the 20 season wearables |

| | |
|---|---|
| **One complete loop takes** | A run of 4 holes, about 5–10 minutes. Its completion is the run-complete screen with the season points and rewards; the earlier payoff is each hole's result, every 1–2 minutes. |
| **Decision, challenge, or expression** | Where to aim and how hard to hit on each shot; which golf club to equip (power, control, aim); whether to play alone, with friends (2–4 at once) or in a tournament. |
| **Shortest satisfying visit / typical session** | One run, about 5–10 minutes / TBD: ask the owner what a typical session is today |
| **Why repetition 10 remains appealing** | 372 Season maps, 4 picked at random for your tier each run, and different recorded players each time; climbing a tier shortens the countdown and changes the maps (from the repo) |

**Pillars.**

1. Never wait: a run starts alone, and the opponents are real players' recordings
2. Everything from the menu: a 2D menu, not avatar navigation, so it plays on a phone
3. A season worth climbing: tiers and 20 wearables to earn

---

## 4. Why Players Come Back

### 4.1 The next-day (D1) sentence

> "A player who enjoyed their first session returns the next day (D1) because Hook 1, the season track: their 10 energy refill overnight, and the run-complete screen showed how many points the next wearable still needs, which they know from the menu's next-prize bar." [agent-decided; untested, the criterion is TBD]

### 4.2 The progression chain

> **Repeatable action → persistent reward → new capability, status, or social role → new decision or challenge**

| Moment | What persists or has been built? | What becomes possible next? | How can another player tell? |
|---|---|---|---|
| **End of first session** | Your tier moved (50 tiers, WOOD 5 to SUPREME), season points, materials and xp in the workshop, and your run is recorded as an opponent for others | Tomorrow's 10 runs; the first golf club upgrade with the materials | Your recording shows up, by name, in other players' runs [agent-decided] |
| **End of first week** | A higher tier category (STONE or IRON), the first season wearable claimed, an upgraded golf club | Harder maps and shorter countdowns; a party with friends at your level; joining a tournament | The season wearable on your avatar, anywhere in Decentraland; your name in the Season top 10 [agent-decided] |
| **Week 3+ — what takes more than two weeks?** | The upper tiers (GOLD and above) and the full set of 20 wearables; an organizer record from the tournaments you ran | Organizing tournaments and map contests; the organizer milestones (100, 250, 500 points) that reward emotes | A full-set outfit, your name as organizer on the tournament list [agent-decided] |

You open the menu after the daily refill and your tier reads STONE 3, two above where you ended on day one. The next prize bar is almost full, so you play a run against three recordings at your new level, and the countdowns are tighter than last week. The run-complete screen flips the bar: the first wearable is yours, and it is on your avatar when you walk out of the clubhouse. A friend's party is waiting in the menu, so you join for one more. [agent-decided]

Currency or tradable rewards: energy is earned at 10 a day and spent 1 per run; materials and coins are won per run and spent in the workshop on golf club attributes; the season wearables are NFTs minted to the player's wallet, one per tier reached. Main abuse risk: multi-accounting to farm materials and recordings, limited by the daily energy cap and server-side physics. [agent-decided]

### 4.3 Two return hooks

| Selected hook | Exact trigger or timing | What the player anticipates | Reminder channel + no-reminder fallback |
|---|---|---|---|
| **1.** Season track — tiers and 20 wearables | Energy refills to 10 every day; each run moves season points; a wearable is sent at each tier milestone until the season ends (season length: TBD), and the season's top 10 earn diamonds when it closes | The next wearable, and the tier they left the day before | Discord and the Event listing on season launches; fallback: the next-prize bar and the energy count on the Season card [agent-decided] |
| **2.** Community tournaments — async and live, with their leaderboards | An async tournament stays open from its start date to its end date; a live one has its start time; both appear in the menu's tournament list | A tournament they entered is still open, or its final board; the next one on the list | Discord posts when a tournament is created and when it ends (already automated); fallback: the tournament list in the menu [agent-decided, replaces the brief's "weekly leaderboard history"] |

---

## 5. Social by Design

| | |
|---|---|
| **The repeatable social loop** | Player A creates a party (Play together) or a tournament → Player B joins from the menu list → they play the same 4 maps at once, seeing each other's balls, and the shared scoreboard ranks everyone → the board, and the organizer's record, are the reason to regroup for the next run or the next tournament. [agent-decided] |
| **The disappearance test** | Ranked keeps working: the recordings stay, so a solo run always has three opponents. Play together, live tournaments and new async tournaments break; existing async tournaments become empty boards. [agent-decided] |
| **From strangers to a group** | The menu's tournament list shows each tournament's name, maps, players in and closing time, and the party button reads "JOIN PARTY (2/4)" with a countdown; one tap joins, no chat or shared language needed. [agent-decided; the list's exact fields are part of the slice] |
| **Recognition & continuity** | Names and faces (from the Decentraland profile) sit on every party seat and scoreboard; recorded opponents are shown by name in the live ranking; every map credits its builder by name on the HUD ("jungle 12 by Satori"); the Season top 10 and the tournament organizer names persist. A rivalry with a named player is not designed yet: TBD. [agent-decided] |
| **Quiet hours & player counts** | With nobody online, a solo player enjoys a full Ranked run because the three recordings play alongside, and the hole result still ranks them. Recordings exist for every tier already (771 players' runs since 2023), so a first visitor never plays alone. Social play becomes viable at 2 players (a party); the ideal group is 4 (the party cap); the target player count is 8 (a tournament's default maximum). Tested count: a 2-client scripted party start on the live server (2026-09-22), not a playtest. A solo arrival meets others through the recordings and the always-visible party and tournament list. [agent-decided] |
| **Drop-in / drop-out** | A late party member starts late on the same clock; a leaver's row stays and counts as done, so the others finish. Async tournaments have no dependency on who is online. [agent-decided] |
| **Visible play (the bystander test)** | Four coloured balls racing across a floating course, with a ranking column at the side. [agent-decided] |
| **Shareable play (the memorable moment)** | The run-complete screen where the next-prize bar flips and a new wearable is claimed, or a hole-in-one against three live friends. [agent-decided] |
| **Bring-a-friend** | The moment you reach a tier whose maps you cannot beat alone: a party plays at the lowest member's level, and a friend above it pays no energy, so bringing a stronger friend costs them nothing and shows you the lines. [agent-decided] |

---

## 6. Mobile-First

**Every core-loop verb on touch.**

| Core-loop verb | How it works with touch controls |
|---|---|
| Start a run | Tap PLAY on the Season card; the whole menu is a full-screen phone layout |
| Shoot | Hold the aim arrows or drag to turn, + / − for power, tap SHOOT (bottom centre, clear of the app's own buttons) |
| Hole out | Nothing extra: the countdown and the hole result are on screen |
| Collect | Tap through the run-complete screen |

**UI plan.**

The SDK7 build already has touch shot controls: aim arrows and a SHOOT button at the bottom centre, and + / − power buttons beside the power bar. Menus and the in-game HUD use a full-screen phone layout that keeps the Decentraland app's corner buttons free (from the repo; reported working on an iPhone SE on 2026-10-13). Mobile support goes public with the November 1, 2026 relaunch (owner). Everything is reached from that 2D menu, not by walking the avatar to in-world panels, because a menu is easier on a phone than navigating a 3D lobby (owner). Phone play is a first-class target for the slice (owner): every new tournament screen (create, list, waiting, results) uses the same phone layout as the current menus. Creating a tournament uses taps only: presets for the map count, the maximum players and the duration, and the maps picked from a list, so no keyboard is needed. [agent-decided]

**Performance.**

Target: 60 fps on recommended desktop hardware and 30 fps on an iPhone SE in the Decentraland mobile app, both at 8 players, our target player count. Measured so far: the mobile app's own counter read 30.0 fps on an iPhone SE during a solo Ranked hole (4 balls, the player plus 3 recordings; staging client v1.16.0, 2026-10-30, owner's screenshot). Not measured yet at 8 live players. The likely risk is the physics of 4 to 8 balls plus the recordings per frame. [agent-decided]

**Desktop-only dependencies.**

TBD: check the Desktop vs Mobile Feature Gap tracker before submission. Two features are known to be optional: the NFT golf clubs attached to avatars and the video stream screens in the lobby; both can stay off on mobile without changing the loop. [agent-decided]

---

## 7. World, Look & Story

**Story / world.**

A minigolf club floating in Decentraland where every run you play is recorded and becomes someone else's opponent. Each season dresses the club in a new theme (Egypt, Jungle, CocoBay) and puts 20 wearables on the prize board. [agent-decided]

**Visual direction.**

Flat, high-contrast colours: the courses are bright themed tiles floating over the clubhouse, the four balls are coloured and large enough to follow at arm's length, and the menu is a 2D card layout with hard shadows and big buttons over the 3D view. Players keep their own Decentraland avatars, plus the golf club and the season wearables they earned. Signature shot: four coloured balls mid-roll on a floating course, your name tag at the top of the ranking column. [agent-decided]

---

## 8. Audience & Comparables

**Primary player + arrival context.**

For players who already enjoy short competitive rounds (minigolf, racing ghosts, ranked ladders), arriving alone or with one friend, looking for a 10-minute run with something to climb. [agent-decided]

**How the first group arrives.**

The first group is Golfcraft's existing community: the players who have run Season since 2023 and the Discord where tournaments are announced, brought back by the November 1 relaunch with @cocobayworld. Two of them in the menu at once already make a party, so the social threshold is reached whenever a tournament is announced. [agent-decided]

**Deliberately not for.**

Players looking for a realistic golf simulation or a long story; runs are short and the game is about the climb and the people on the board. [agent-decided]

### Comparables

| | Comparable A — outside Decentraland: Golf With Your Friends | Comparable B — outside Decentraland: Golf Battle (mobile) |
|---|---|---|
| What we observed works | Playing with friends, and the community around it: hundreds of player-made maps | Its play is close to our Ranked: harder maps as you go up, and categories to climb |
| What does not fit our audience or context—and why | You need other people online to play; in Decentraland that is rare, so we use recorded runs instead | Climbing costs virtual coins, and the harder the category the more you pay to enter. We want players to always move forward and not get frustrated. Players also report losing their entry coins when a match or connection drops (App Store reviews) |
| What we will do differently | Keep the community maps and the friends, but make the game playable alone at any hour: a run against recorded players starts at once, and friends (2–4) or a tournament are the step up, not the entry ticket | Keep the climb, drop the entry fee: a run costs one energy, never coins, and the reward for climbing is a season of 20 wearables. Our maps come from the players' own editor, not only from us [drafted from the owner's words and the game's specs] |

---

## 9. 4 Week Plan (v1 scope)

**The slice: community tournaments in the game menu** (owner). Two formats, as Golfcraft had them: **async**, where a tournament stays open between a start and an end date and each player plays its maps when they can, against the others' results; and **live**, where everyone in the room plays the same maps at the same time and sees the other balls. What changes is where they live: created, listed and played from the 2D game menu instead of in-world panels and the website, so they work on a phone. No tournaments start on their own for now (owner).

If the application is confirmed, within four weeks the game has both the in-world map editor and these tournaments, and we run map-building contests for the COCOBAY season with them (owner). [OPEN: which of the two is the V0 slice agreed with the program, and which comes after it]

| Week | What is playable / done |
|---|---|
| 1 — Prototype definition | The tournament list and the create screen in the menu (async format first), on the phone layout; joining an async tournament by tapping it [agent-decided] |
| 2 — Core interaction + first-group test | An async tournament played end to end from the menu, with its leaderboard; first test with the community: one tournament announced on Discord [agent-decided] |
| 3 — Core systems refinement | Live tournaments in the menu: room, waiting screen, live scoreboard; the in-world map editor brought to SDK7 [agent-decided] |
| 4 — Playable release, including testing and deployment | The COCOBAY map contest: maps built with the editor, played as a tournament; mobile playtest at 4–8 players; deploy to the parcels and the World [agent-decided] |

**What keeps the experience changing after launch.**

- Without building a new level, variation comes from the players' tournaments and maps and from the 4 random maps per run; a new season with a new wearable collection comes every few months (cadence TBD). [agent-decided]
- If an update is skipped, the daily energy, the recordings at every tier and the community tournaments still create variation. [agent-decided]
- If progression resets or creates a power gap, the wearables, golf clubs and maps persist; a new or returning player competes meaningfully within one run, because opponents and maps are picked at their own tier. [agent-decided]
- One player behaviour that would change what we build next: if players create tournaments but few join them, we will add tournaments that start on their own on a schedule. [agent-decided]

**Not building in v1.**

Moving the other SDK6 features to SDK7 is not part of this slice (owner): Crafting, Chain Bridge, Lucky Balls, Fashion Shop, Chests, Notifications, Multiplayer Demo, the Voxters pet, the DCL Awards minigame and the 3D lobby panels. If v1 hits its numbers, the first to come back is Notifications (in-game messages). [agent-decided]

**Top risk + fallback.**

Top risk: the in-world map editor is the largest SDK6 feature left to migrate, and the COCOBAY contest depends on it. Fallback: the tournaments ship first; if the editor slips past week 3, the contest runs on the 837 existing community maps, chosen by vote, and the editor follows. [agent-decided]

---

**One last question.**

Section 4.2: the game had years of progression, but writing what persists for a new player, and what others can see of it, took the longest. [agent-decided]
