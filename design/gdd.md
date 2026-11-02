# OhMyGolf

**Decentraland Creator Success Program**

| |                                                                            |
|---|----------------------------------------------------------------------------|
| Public experience title | OhMyGolf, a new fork of Golfcraft, with improvements and adapted to mobile. IP ownership. |
| Deployment target | Genesis City, 47,-45: https://decentraland.org/places/place/47,-45         |
| Studio / team name | pablo                                                              |
| Date | 2026-11-02                                                                 |
| Contact (Discord + email) | pabloest + estornut@gmail.com                                              |

---

## 0. TL;DR

| |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
|---|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Visual GDD** | A 12-page visual version of this document: [gdd.pdf](gdd.pdf). |
| **Player promise** | You play minigolf against other players (recorded runs) and climb to win the season rewards. Players can create custom maps and organize their own tournaments. |
| **Primary player** | Casual players who like a relaxed, social round of minigolf anyone understands, arriving alone or with a friend for a few minutes with something to climb, plus the organizers who run tournaments and the builders who make maps. |
| **Current status** | Playable core loop live in Decentraland. OhMyGolf is a fork of Golfcraft, our minigolf game live since 2020: about 220,000 finished games since 2022, 837 community maps and 1,759 tournaments by 33 organizers. The maps come from Golfcraft's in-world editor, not in SDK7 yet (v2). Playable: https://decentraland.org/places/place/47,-45. Screenshots (iPhone SE): [a Ranked hole with the live ranking](screenshots/phone-ranked-hole.webp) and [the season prizes by rank](screenshots/phone-prizes-by-rank.webp). |
| **Requested round** | V0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Live at end of the round** | Ranked and Ranked with friends as live today, tested with the community in a public event and polished from it, plus a controls tutorial on the first hole; tournaments in the menu are the four-week v1 plan (Section 9).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

---

## 1. Player Promise

**One-line promise.**

You play minigolf against other players (recorded runs) and climb to win the season rewards. Players can create custom maps and organize their own tournaments.

**One familiar comparison.**

It's like Golf With Your Friends, but you never wait for anyone: your opponents are other players' recorded runs, and the maps and tournaments come from the community.

**Why this game.**

Golfcraft went through years of iteration until we found a model that keeps players coming back. Minigolf is a game almost everyone already knows how to play, and its calm pace leaves room to socialize.

---

## 2. First Minutes & How to Play

| Time | Player experience |
|---|---|
| **0–5 seconds after control** | You land in front of the clubhouse. A welcome card fills the screen with one button: OK, Let's Go! |
| **5–10 seconds** | You tap it. The menu opens on the Ranked card: your rank, the next wearable, a big PLAY. The goal is clear: climb the ranks. A Tutorial card offers Dr. Par's guided holes first, if you want. |
| **10–60 seconds** | PLAY loads the first map. Three balls wait beside yours: other players' recordings. Three prompts over the controls walk you through the first hole: aim, set power, tap SHOOT (controls tutorial, V0). Your ball rolls, theirs too. |
| **1–3 minutes** | Your ball drops in. The hole result ranks the four of you by shots and time; the next hole loads. Four holes, one run. |
| **3–10 minutes** | After the fourth hole, the run-complete screen: rank points won or lost, your rank, materials, and how far the next wearable is. You choose: play again, Play together with friends or, from v1, a tournament. |
| **Natural stopping point** | A run costs one energy; you get 10 a day. The menu shows your energy, rank and points to the next prize: tomorrow's 10 runs get you there. |

**Player-facing How to Play.**

- Aim, set power, tap SHOOT
- Fewer shots and faster beats the other three
- Friends play live; others are recorded runs

---

## 3. Core Loop

The core loop is a **Ranked run**: you can always play alone, because your opponents are other players' recorded runs. Tournaments (async and live) are modes on top of it (Section 9).

| # | Step (verb) | What the player does (Player input → what they see or hear → what changes) | Why do it again? |
|---|---|---|---|
| 1 | Start a run | Tap PLAY on the Ranked card → the first of 4 maps for your rank loads, with 3 recorded players at the tee → 1 energy is spent | New maps and a new field every run |
| 2 | Shoot | Aim (arrows or drag), set the power, tap SHOOT → the ball rolls on the server's physics while the other balls play their recordings → shots and time count | The shot is the skill: a better line beats the same map |
| 3 | Hole out | When the first ball holes, a countdown starts for the rest (30 s at the first ranks, 10 s at the top) → the hole result ranks the 4 by shots and time | Beating recorded players who were once as good as you |
| 4 | Collect | After the 4th hole, the run-complete screen → rank points move your rank up or down, materials and xp are added, the next prize shows how far it is | The rank and the next of the 20 season wearables |

| |                                                                                                                                                                                                                                                                                                                                                                                                                 |
|---|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **One complete loop takes** | A run of 4 holes, about 4 minutes (at the first ranks the play on a hole is about 20 s). |
| **Decision, challenge, or expression** | Where to aim and how hard to hit on each shot; which golf club to equip (power, control, aim); whether to play alone, with friends (2–4) or in a tournament.                                                                                                                                                                                                                                            |
| **Shortest satisfying visit / typical session** | One run, about 4 minutes / a typical day of play is 7 runs, about 27 minutes (median over 7,706 player-days; 37% of days use all 10 energy) |
| **Why repetition 10 remains appealing** | 20 wearables to collect, 372 Ranked maps, 4 picked at random for your rank each run, and different recorded players each time. |

**Pillars.**

1. Never wait: a run starts alone, and the opponents are real players' recordings
2. Everything from the menu: a 2D menu, not avatar navigation
3. A ranking worth climbing: ranks and 20 season wearables to collect

---

## 4. Why Players Come Back

### 4.1 The next-day (D1) sentence

> "A player who enjoyed their first session returns the next day (D1) because the first maps are very easy and the first wearable comes quickly; their rank persists, and their 10 energy are back the next day to climb for the next prize (hook 1, Section 4.3)."

### 4.2 The progression chain

> **Repeatable action → persistent reward → new capability, status, or social role → new decision or challenge**

Higher rank means harder maps, but also rarer wearables (fewer copies, more value) and more materials per run to build maps.

| Moment | What persists or has been built?                                                                                                             | What becomes possible next?                                                                                 | How can another player tell?                                                                                                                                                              |
|---|----------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **End of first session** | You moved up the rank ladder, and you have materials and xp to improve your golf club | Keep collecting and climbing; discover community tournaments                                 | Your rank is shown next to your name                                                                                                                                                      |
| **End of first week** | You keep climbing: a higher rank, the first season wearable, an upgraded golf club                                                           | You notice other players organize their own tournaments and join one (v1)                                  | The wearable on your avatar; your name on a tournament's board                                                                                                                            |
| **Week 3+ — what takes more than two weeks?** | The upper ranks, rarer wearables and bigger material drops, the full set of 20; an organizer record     | Organizing tournaments and map contests; organizer milestones (100, 250, 500 points) reward emotes | A full-set outfit; your name as organizer on the tournament list and as builder on your maps, which you promote because your rewards grow with every player |

You open the menu after the daily refill: your rank is two above day one and the next-prize bar is almost full. You play a run against three recordings at your new level; the countdowns are tighter than last week. The run-complete screen flips the bar: the first wearable is yours and already on your avatar. A friend's party is waiting in the menu, so you join for one more.

Currency or tradable rewards: energy, 10 a day, 1 per run; materials and coins won per run (more at higher ranks) and spent on golf club upgrades and, with the editor (v2), on map parts; season wearables are NFTs minted to the player's wallet at rank milestones. Main abuse risk: multi-accounting, contained: an extra account is just another player and only reaches the first rewards, the ones with the largest supply. Bots are contained the same way.

### 4.3 Two return hooks

| Selected hook                                                              | Exact trigger or timing | What the player anticipates | Reminder channel + no-reminder fallback                                                                                                                                                       |
|----------------------------------------------------------------------------|---|---|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **1.** Collecting the 20 season wearables through the rank ladder          | Energy refills to 10 every day; a wearable is sent at each rank milestone until the season ends (season length: TBD), and the season's top 10 earn diamonds when it closes | The next wearable, and the rank they left the day before | Discord (TBD)                                                                                                                                                                 |
| **2.** Community tournaments (v1): async and live, with their leaderboards | An async tournament is open between its start and end dates; a live one has a start time; both are in the menu's tournament list | A tournament they entered is still open, or its final board; the next one on the list | Discord posts when a tournament is created and when it ends (already automated); fallback: the tournament list in the menu |

---

## 5. Social by Design

| |                                                                                                                                                                                                                                                                                                                                                                                       |
|---|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **The repeatable social loop** | Player A creates a party (Play together) or, from v1, a tournament → Player B joins from the menu → they play the same 4 maps at once, seeing each other's balls, and one scoreboard ranks everyone → the board and the organizer's record are the reason to regroup.                                                           |
| **The disappearance test** | Ranked keeps working: the recordings stay, so a solo run always has three opponents. Play together, live tournaments and new async tournaments break; existing async tournaments become empty boards.                                                                                                                                                                                 |
| **From strangers to a group** | The menu's tournament list shows each tournament's name, maps, players in and closing time, and the party button reads "JOIN PARTY (2/4)" with a countdown; one tap joins, no chat or shared language needed.                                                                                                                                                                         |
| **Recognition & continuity** | Names and faces (from the Decentraland profile) on every party seat and scoreboard; recorded opponents shown by name in the live ranking; every map credits its builder on the HUD ("jungle 12 by Satori"); the Ranked top 10 and the organizer names persist.                                                                                             |
| **Quiet hours & player counts** | With nobody online a solo player still gets a full Ranked run: the three recordings play alongside and the hole result ranks them. Recordings exist for every rank, so a first visitor never plays alone. Social play is viable at 2 players (a party), ideal at 4 (the party cap), target 8 (a tournament's default maximum).                                                     |
| **Drop-in / drop-out** | A late party member starts late on the same clock; a leaver's row stays and counts as done, so the others finish. Async tournaments have no dependency on who is online.                                                                                                                                                                                                              |
| **Visible play (the bystander test)** | Watching another player's shots teaches you the lines that climb the ladder.                                                                                                                                                                                                                                                                                                                     |
| **Shareable play (the memorable moment)** | The run-complete screen where the next-prize bar flips and a new wearable is claimed, or a hole-in-one against three live friends.                                                                                                                                                                                                                                    |
| **Bring-a-friend** | When you reach a rank whose maps you cannot beat alone: you create the party, it plays at your level, and a friend above it pays no energy and earns no points, so bringing a stronger friend costs them nothing and shows you those maps. Organizers and map builders invite players too, because their rewards grow with each one who takes part. |

---

## 6. Mobile-First

**Every core-loop verb on touch.**

| Core-loop verb | How it works with touch controls |
|---|---|
| Start a run | Tap PLAY on the Ranked card of the full-screen menu |
| Shoot | Hold the aim arrows or drag to turn, + / − for power, tap SHOOT (bottom centre, clear of the app's own buttons) |
| Hole out | Nothing extra: the countdown and the hole result are on screen |
| Collect | Tap through the run-complete screen |

**UI plan.**

A full-screen 2D menu keeps the Decentraland app's corner buttons free, with touch shot controls (aim arrows or drag, + / − power, SHOOT at the bottom centre); every v1 tournament screen uses the same layout, and creating a tournament is taps only, with presets for map count, players and duration. A first-run controls tutorial (V0) walks the first hole in three prompts over the controls, aim, power, SHOOT, because simple controls still lose someone.

**Performance.**

Target: 60 fps on recommended desktop hardware and 30 fps on an iPhone SE, both at 8 players. Measured: 30.0 fps on an iPhone SE during a solo Ranked hole (the app's own counter). Not measured yet at 8 live players.

**Desktop-only dependencies.**

TBD: Feature Gap tracker not checked yet. One known gap: the cinematic camera cannot be rotated by touch; the aim arrows work around it, and we will report it.

---

## 7. World, Look & Story

**Story / world.**

You are Dr. Par's new intern: four energy spheres escaped the lab to ancient Egypt, and the tutorial holes are how you push each one back into the hole. From there the maps change theme, Egypt, Jungle, futuristic, and each season's wearables follow that theme.

**Visual direction.**

Cartoon colours: bright themed courses floating over the clubhouse, four big coloured balls, and a 2D card menu over the 3D view.

---

## 8. Audience & Comparables

**Primary player + arrival context.**

Casual players who like a relaxed, social round of minigolf anyone understands, arriving alone or with a friend for a few minutes with something to climb, plus the organizers who run tournaments and the builders who make maps.

**How the first group arrives.**

The first group is Golfcraft's existing community, through its Discord and the November relaunch event. Map builders and tournament organizers bring players themselves, because their rewards grow with every player who plays their maps or enters their tournaments.

**Deliberately not for.**

Players who want a realistic golf simulation, a long story or a hardcore ladder: runs are short and the rules fit in three lines.

### Comparables

| | Comparable A — outside Decentraland: Golf With Your Friends | Comparable B — outside Decentraland: Golf Battle (mobile) |
|---|---|---|
| What we observed works | Playing with friends, and the community around it: hundreds of player-made maps | Its play is close to our Ranked: harder maps as you go up, and categories to climb |
| What does not fit our audience or context—and why | You need other people online to play; in Decentraland that is rare, so we use recorded runs instead | Climbing costs virtual coins, and the harder the category the more you pay to enter; we want players to always move forward, not get frustrated. Players also report losing their entry coins when a match drops (App Store reviews) |
| What we will do differently | Keep the community maps and the friends, but make the game playable alone at any hour: a run against recorded players starts at once, and friends (2–4) or a tournament are the step up, not the entry ticket | Keep the climb, drop the entry fee: a run costs one energy, never coins, and the reward for climbing is a season of 20 wearables. Our maps come from the players' own editor, not only from us |

---

## 9. 4 Week Plan (v1 scope)

**The slice: community tournaments in the game menu.** Two formats, as Golfcraft had them: **async**, open between a start and an end date, each player playing its maps when they can against the others' results; and **live**, everyone on the same maps at the same time, seeing the other balls. What changes is where they live: created, listed and played from the 2D menu instead of in-world panels and the website. No tournaments start on their own for now.

V0, this application, is the game as live today (Ranked runs and Ranked with friends), tested with the community in a public event and polished from it, plus the first-hole controls tutorial. v1 adds the tournaments described here; the in-world map editor and the map-building contests that need it come in v2.

| Week | What is playable / done |
|---|---|
| 1 — Prototype definition | The tournament list and the create screen in the menu (async format first); joining an async tournament by tapping it |
| 2 — Core interaction + first-group test | An async tournament played end to end from the menu, with its leaderboard; first test with the community: one tournament announced on Discord |
| 3 — Core systems refinement | Live tournaments in the menu: room, waiting screen, live scoreboard; organizer and map-creator rewards shown on the results screen |
| 4 — Playable release, including testing and deployment | A COCOBAY season tournament event with the community on the existing maps, played from the menu; playtest at 4–8 players; deploy to the parcels |

**What keeps the experience changing after launch.**

- Without building a new level, variation comes from the players' tournaments and maps and from the 4 random maps per run; a new season with a new wearable collection every few months (cadence TBD).
- If an update is skipped, the daily energy, the recordings at every rank and the community tournaments still create variation.
- If progression resets or creates a power gap, the wearables, golf clubs and maps persist; a new or returning player competes within one run, because opponents and maps are picked at their rank.
- One player behaviour that would change what we build next: if players create tournaments but few join them, we will add tournaments that start on their own on a schedule.

**Not building in v1.**

Moving the other SDK6 features to SDK7 is not part of this slice: the in-world map editor, Crafting, Chain Bridge, Lucky Balls, Fashion Shop, Chests, Notifications, Multiplayer Demo, the Voxters pet, the DCL Awards minigame and the 3D lobby panels. If v1 hits its numbers, the first to come back is the in-world map editor, with the map-building contests for the COCOBAY season (v2).

**Top risk + fallback.**

Top risk: live tournaments are the largest piece of v1 (the SDK6 live client is not in SDK7 yet) and need players online at the same hour. Fallback: async tournaments ship first (week 2) and are the v1 deliverable; if live slips past week 3, v1 closes with async in the menu plus one dated live event on Discord, and open live creation follows in v2.

---

**One last question.**

Section 4.2: the game had years of progression, but writing what persists for a new player, and what others can see of it, took the longest.
