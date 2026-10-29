// The Season screens between the lobby and the holes, after the "Móvil ·
// propuesta 2" page of the GolfCraft UI canvas, on phones and desktop alike:
//   - JoiningScreen    (M2Joining.dc.html)     solo run, waiting for the players
//   - PartyScreen      (M2Party.dc.html)       "play ranked with friends" room
//   - HoleResultScreen (M2HoleResult.dc.html)  between holes
//   - RunCompleteScreen (M2RunComplete.dc.html) after the fourth hole
// They only read seasonWaitState / seasonNextGameState, which the existing
// flows fill; the rounds and the server messages are untouched. Each one is
// full screen like the lobby menu (ui-scale.ts fullLayout), with the corners
// left free for the explorer's own controls.
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'

import { globalStore } from '../services/globalStore/globalStore'
import { seasonWaitState, SeasonWaitPlayer } from './season-wait-state'
import { seasonNextGameState, SeasonScoreRow } from './season-results-state'
import { lobbyMenuState, nextSeasonPrize, prizeSoldOut } from './lobby-menu-state'
import { lobbyHudState } from './lobby-hud-state'
import { seasonCatalog } from '../components/lobby/seasons/season-catalog'
import { avatarFaceUrl } from '../services/avatar-face'
import { C, hex, fmt, mmss, ordinal, shortName } from './ui-theme'
import { fullLayout, scaler, type Px } from './ui-scale'
import { P, at, img, imgW, text, box, fullFrame, button2, yellowTag, resIcon, rankBadge, border, initialAvatar } from './ui2'
// @ts-ignore - common/utils has @ts-nocheck
import { getCatFromTier, getPointsOnCurrentTier, getTierFromSub, seasonPointsPerCategory } from '../../../common/utils'
// @ts-ignore - season-tier-definitions has @ts-nocheck
import { seasonTierDefinitions } from '../../../common/season-tier-definitions'

const SLOTS = 4
const SALMON = hex('#FFB4A6')
const RANK_TEXT = hex('#E8DFFF')
const EMPTY_EDGE = Color4.create(1, 1, 1, 0.45)
const EMPTY_BG = Color4.create(27 / 255, 33 / 255, 96 / 255, 0.5)
// The four seats of the waiting screens, across the centre and right columns.
const SEAT_W = 121
const SEAT_X = (i: number) => 152 + i * 129.5

const seasonName = () => {
  const userData = globalStore.userData.getState()
  return (seasonCatalog as any)[String(userData?.config?.currentSeasonCollectionId ?? 4)]?.name || 'MOUNTAIN'
}
const tierOf = (tierSub: number) => Number(getTierFromSub(tierSub) || 0)
const myTierSub = () => Number(globalStore.userData.getState()['statistic_tier-sub'] || 0)
const tierIndexByName = (name?: string) => {
  if (!name) return -1
  return seasonTierDefinitions.findIndex((d: any) => d?.name === name)
}

// Pill of the top bar: a label and a yellow value.
const topPill = (px: Px, fs: Px, key: string, x: number, w: number, label: string, value: string) =>
  box(px, key, x, 10, w, 36, { color: P.navyDeep, radius: 10, border: 2, borderColor: P.navyEdge, align: 'center', justify: 'center' }, [
    <Label value={label} fontSize={fs(13)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(32) }} />,
    <Label value={value} fontSize={fs(16)} color={C.yellow} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(32), margin: { left: px(5) } }} />
  ])

// Countdown box of the top bar's right end ("Starting in 7").
const countdown = (px: Px, fs: Px, key: string, x: number, w: number, label: string, value: string) =>
  box(px, key, x, 8, w, 40, { color: P.navyDeep, radius: 12, border: 2, borderColor: C.yellow, align: 'center', justify: 'center' }, [
    <Label value={label} fontSize={fs(12)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(36) }} />,
    value ? <Label value={value} fontSize={fs(22)} color={C.yellow} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(36), margin: { left: px(6) } }} /> : null
  ])

// A seat with a player: avatar, name, then whatever `extra` draws under it.
const playerSeat = (px: Px, fs: Px, key: string, i: number, ring: boolean, player: SeasonWaitPlayer, extra: any[]) => {
  const x = SEAT_X(i)
  const cx = x + SEAT_W / 2
  const face = avatarFaceUrl(player.userId)
  return [
    box(px, key, x, 58, SEAT_W, 156, { color: P.navy, radius: 14, border: 2, borderColor: ring ? C.yellow : P.navyEdge }),
    <UiEntity
      key={`${key}-avatar`}
      uiTransform={{ ...at(px, cx - 26, 70, 52, 52), borderRadius: px(26), borderWidth: border(px, 3), borderColor: P.white }}
      uiBackground={{ color: hex('#2D6FE0') }}
    >
      {face ? <UiEntity uiTransform={{ width: '100%', height: '100%', borderRadius: px(23) }} uiBackground={{ texture: { src: face }, textureMode: 'stretch' }} /> : null}
    </UiEntity>,
    text(px, fs, player.displayName, x + 4, 128, SEAT_W - 8, 16, 13, P.white, 'middle-center'),
    ...extra
  ]
}

// An empty seat: a translucent card, a placeholder circle and a caption.
const emptySeat = (px: Px, fs: Px, key: string, i: number, caption: string, plus: boolean) => {
  const x = SEAT_X(i)
  const cx = x + SEAT_W / 2
  return [
    box(px, key, x, 58, SEAT_W, 156, { color: EMPTY_BG, radius: 14, border: 2, borderColor: EMPTY_EDGE }),
    box(px, `${key}-glyph`, cx - 26, 70, 52, 52, { color: P.glass, radius: 26, border: 2, borderColor: EMPTY_EDGE, justify: 'center', align: 'center' }, [
      <Label value={plus ? '+' : '?'} fontSize={fs(24)} color={Color4.create(1, 1, 1, 0.5)} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
    ]),
    text(px, fs, caption, x + 4, 130, SEAT_W - 8, 16, 12, P.pale, 'middle-center'),
    plus
      ? null
      : (
          <UiEntity key={`${key}-dots`} uiTransform={{ ...at(px, cx - 13, 154, 26, 6), flexDirection: 'row', justifyContent: 'space-between' }}>
            {[1, 0.6, 0.3].map((a, k) => (
              <UiEntity key={k} uiTransform={{ width: px(6), height: px(6), borderRadius: px(3) }} uiBackground={{ color: Color4.create(1, 0.82, 0.12, a) }} />
            ))}
          </UiEntity>
        )
  ]
}

// Badge + rank name, centred in a seat.
const seatRank = (px: Px, fs: Px, key: string, i: number, y: number, tier: number, name: string) => (
  <UiEntity key={key} uiTransform={{ ...at(px, SEAT_X(i), y, SEAT_W, 18), flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
    {tier >= 0 ? rankBadge(px, tier, 18) : null}
    <Label value={name} fontSize={fs(11)} color={RANK_TEXT} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(18), margin: { left: px(4) } }} />
  </UiEntity>
)

// Small state chip at the bottom of a seat (YOU, Joined, Just joined!).
const seatChip = (px: Px, fs: Px, key: string, i: number, value: string, color: Color4, fg: Color4) => {
  const w = 18 + value.length * 6
  return box(px, key, SEAT_X(i) + (SEAT_W - w) / 2, 172, w, 16, { color, radius: 8, justify: 'center', align: 'center' }, [
    <Label value={value} fontSize={fs(10)} color={fg} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
  ])
}

const lavenderButton = (px: Px, id: string, x: number, w: number, caption: string, onClick: (() => void) | null) =>
  button2(px, { id, x, y: 302, w, h: 52, color: onClick ? P.lavender : C.disabled, radius: 15, shadow: 5, shadowColor: onClick ? P.lavenderShadow : C.dark, disabled: !onClick, onClick: onClick || undefined }, [
    img(px, caption, undefined, undefined, 0.75)
  ])

// ---------------------------------------------------------------------------
// Solo run: waiting for the players

export const JoiningScreen = () => {
  const w = seasonWaitState
  if (!w.visible || w.mode !== 'solo') return null
  const L = fullLayout()
  const { px, fs } = scaler(L.scale)
  const players = w.players
  const myTier = tierOf(myTierSub())
  const myTierName = seasonTierDefinitions[myTier]?.name || 'WOOD 5'
  const rib = 0.42

  const seats: any[] = []
  for (let i = 0; i < SLOTS; i++) {
    const p = players[i]
    if (!p) {
      seats.push(emptySeat(px, fs, `seat-${i}`, i, 'Finding a rival', false))
      continue
    }
    const me = i === 0
    const justJoined = !me && i === players.length - 1
    seats.push(
      playerSeat(px, fs, `seat-${i}`, i, me, p, [
        me ? seatRank(px, fs, `seat-rank-${i}`, i, 148, myTier, myTierName) : null,
        seatChip(px, fs, `seat-state-${i}`, i, me ? 'YOU' : justJoined ? 'Just joined!' : 'Joined', me ? C.yellow : justJoined ? P.teal : P.green, me || !justJoined ? P.ink : P.white)
      ])
    )
  }

  return fullFrame(L, [
    img(px, 'rb_waiting', 140, 11, rib),
    yellowTag(px, fs, `${seasonName()} Season · ${myTierName}`, 140 + imgW('rb_waiting', rib) + 8, 17, 164, 22, 11),
    countdown(px, fs, 'wait-timer', 541, 120, w.secondsLeft > 0 ? 'Starting in' : 'Starting...', w.secondsLeft > 0 ? String(w.secondsLeft) : ''),

    box(px, 'confession', 6, 58, 140, 188, { color: P.purple, radius: 14, border: 2 }),
    text(px, fs, 'CONFESSION', 16, 64, 124, 18, 14),
    text(px, fs, 'Anonymous, from another player', 16, 84, 124, 14, 10, hex('#E6DAFF')),
    text(px, fs, (w.sub || 'Nothing to confess yet').replace(/^Anonymous confession:\s*/, ''), 16, 104, 124, 132, 12, P.white, 'middle-left', true),

    ...seats,

    box(px, 'wait-info', 152, 222, 340, 66, { color: P.navy, radius: 14, border: 2, borderColor: P.navyEdge, column: true, justify: 'center', align: 'center' }, [
      <Label value="You race 3 players at your rank over 4 holes" fontSize={fs(13)} color={P.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(20) }} />,
      <Label value="It starts as soon as the last rival joins" fontSize={fs(11)} color={P.pale} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(16) }} />
    ]),
    lavenderButton(px, 'wait-cancel', 232, 180, 'bt_cancel', w.onCancel)
  ])
}

// ---------------------------------------------------------------------------
// Party room

export const PartyScreen = () => {
  const w = seasonWaitState
  if (!w.visible || w.mode !== 'party') return null
  const L = fullLayout()
  const { px, fs } = scaler(L.scale)
  const alone = w.players.length < 2
  const roomTier = tierIndexByName(w.roomTierName)

  const seats: any[] = []
  for (let i = 0; i < SLOTS; i++) {
    const p = w.players[i]
    if (!p) {
      seats.push(emptySeat(px, fs, `party-seat-${i}`, i, 'Waiting for a friend', true))
      continue
    }
    const x = SEAT_X(i)
    seats.push(
      playerSeat(px, fs, `party-seat-${i}`, i, !!p.isHost, p, [
        p.isHost
          ? box(px, `party-host-${i}`, x + SEAT_W - 40, 62, 36, 14, { color: C.yellow, radius: 6, justify: 'center', align: 'center' }, [
              <Label value="HOST" fontSize={fs(9)} color={P.ink} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
            ])
          : null,
        p.tierName ? seatRank(px, fs, `party-rank-${i}`, i, 146, tierIndexByName(p.tierName), p.tierName) : null,
        p.eligible === false
          ? text(px, fs, 'Above room level: plays free, no season points', x + 6, 166, SEAT_W - 12, 40, 10, C.yellow, 'middle-center', true)
          : text(px, fs, 'Scores season points', x + 6, 170, SEAT_W - 12, 16, 10, P.green, 'middle-center')
      ])
    )
  }

  const note = (key: string, icon: string, y: number, value: string) => [
    img(px, icon, 14, y + 2, 14 / Math.max(1, imgW(icon))),
    text(px, fs, value, 34, y, 106, 50, 11, P.white, 'middle-left', true)
  ]

  return fullFrame(L, [
    img(px, 'rb_friends', 140, 9, 0.55),
    topPill(px, fs, 'party-count', 412, 100, `${w.players.length} / ${SLOTS}`, 'players'),
    countdown(px, fs, 'party-timer', 518, 143, alone ? 'Cancels in' : 'Starts in', `${w.secondsLeft}s`),

    box(px, 'party-rules', 6, 58, 140, 188, { color: P.navy, radius: 14, border: 2, borderColor: P.navyEdge }),
    ...note('party-rule-1', 'ic_people_w', 64, `Friends see JOIN PARTY (${w.players.length}/${SLOTS}) on their Season screen`),
    ...note('party-rule-2', 'ic_flag_w', 122, 'Same 4 holes for everyone, each player races 3 rivals'),
    ...note('party-rule-3', 'ic_timer_w', 180, 'Starts on its own after 60 s with no one joining or leaving'),

    ...seats,

    box(px, 'party-level', 152, 222, 340, 66, { color: P.rankBox, radius: 14, border: 2, borderColor: P.rankEdge, align: 'center', padding: { left: px(12) } }, [
      roomTier >= 0 && !alone ? rankBadge(px, roomTier, 42) : null,
      <UiEntity uiTransform={{ flexDirection: 'column', margin: { left: px(10) } }}>
        <Label value={alone ? 'Waiting for a friend to join' : `Playing at ${w.roomTierName} level`} fontSize={fs(16)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(22) }} />
        <Label value="the lowest rank in the room" fontSize={fs(11)} color={RANK_TEXT} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(16) }} />
      </UiEntity>
    ]),

    w.onStart ? lavenderButton(px, 'party-cancel', 152, 160, 'bt_cancel', w.onCancel) : lavenderButton(px, 'party-cancel', 232, 180, 'bt_cancel', w.onCancel),
    w.onStart
      ? button2(px, { id: 'party-start', x: 320, y: 302, w: 172, h: 52, color: P.yellow, radius: 15, shadow: 5, shadowColor: P.yellowShadow, onClick: () => w.onStart && w.onStart() }, [
          img(px, 'bt_start', undefined, undefined, 0.6),
          <UiEntity uiTransform={{ width: px(8) }} />,
          img(px, 'ic_play_n', undefined, undefined, 0.5)
        ])
      : null
  ])
}

// ---------------------------------------------------------------------------
// Results

const pointsSign = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0')
const pointsColor = (n: number) => (n > 0 ? P.green : n < 0 ? SALMON : P.paler)

// Reward rows of the side cards: the game's icon (a green XP square for xp)
// and the amount; five at most.
const rewardRows = (px: Px, fs: Px, prefix: string, rewards: { code: string; amount: number }[], x: number, y: number, rowH: number) =>
  rewards.length
    ? rewards.slice(0, 5).map((r, k) => (
        <UiEntity key={`${prefix}-${r.code}`} uiTransform={{ ...at(px, x, y + k * rowH, 130, rowH), flexDirection: 'row', alignItems: 'center' }}>
          {r.code.toUpperCase() === 'XP' ? (
            <UiEntity uiTransform={{ width: px(22), height: px(22), borderRadius: px(6), justifyContent: 'center', alignItems: 'center', flexShrink: 0 }} uiBackground={{ color: P.ink }}>
              <Label value="XP" fontSize={fs(9)} color={C.yellow} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(22) }} />
            </UiEntity>
          ) : (
            resIcon(px, r.code, 22)
          )}
          <Label value={`+${fmt(r.amount)}`} fontSize={fs(15)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(rowH), margin: { left: px(7) } }} />
        </UiEntity>
      ))
    : [text(px, fs, 'Nothing this time', x, y, 130, 20, 11, P.paler)]

// Rank maths shared by both result screens.
const tierInfo = (tierSub: number) => {
  const tier = tierOf(tierSub)
  const cat = getCatFromTier(tier)
  return {
    tier,
    name: seasonTierDefinitions[tier]?.name || 'WOOD 5',
    onTier: Number(getPointsOnCurrentTier(tierSub) || 0),
    perTier: Number(seasonPointsPerCategory[cat] || 5),
    nextName: seasonTierDefinitions[tier + 1]?.name || null
  }
}

const secondsLeft = (until: number) => Math.max(0, Math.ceil((until - Date.now()) / 1000))

export const HoleResultScreen = () => {
  const n = seasonNextGameState
  if (!n.visible || n.kind !== 'hole') return null
  const L = fullLayout()
  const { px, fs } = scaler(L.scale)
  const after = tierInfo(n.newTierSub)
  const gained = n.newTierSub - n.tierSub
  // Bar on the rank AFTER the hole: what you had in yellow, what you gained in green.
  const hadPct = Math.max(0, Math.min(100, ((after.onTier - Math.max(0, gained)) * 100) / after.perTier))
  const gainPct = Math.max(0, Math.min(100 - hadPct, (Math.max(0, gained) * 100) / after.perTier))
  const rib = 38 / 93

  const rows = n.rows
  const rowsTop = 80
  const rowH = Math.min(44, (284 - rowsTop - (rows.length - 1) * 4) / Math.max(1, rows.length))
  const rowEls = rows.map((row: SeasonScoreRow, i: number) => {
    const y = rowsTop + i * (rowH + 4)
    const fg = row.isMe ? P.ink : P.white
    return [
      box(px, `hole-row-${i}`, 158, y, 328, rowH, { color: row.isMe ? P.yellow : P.glass, radius: 10 }),
      text(px, fs, String(row.rank), 164, y, 18, rowH, 15, fg),
      <UiEntity key={`hole-av-${i}`} uiTransform={at(px, 186, y + (rowH - 24) / 2)}>
        {initialAvatar(px, fs, row.name, 24, i)}
      </UiEntity>,
      text(px, fs, row.isMe ? `${row.name} · you` : row.name, 216, y, 118, rowH, 12, fg),
      text(px, fs, String(row.shots), 336, y, 44, rowH, 13, fg, 'middle-center'),
      text(px, fs, row.timeUp ? 'time up' : mmss(row.timeMs), 382, y, 48, rowH, row.timeUp ? 10 : 12, row.timeUp ? SALMON : fg, 'middle-center'),
      text(px, fs, pointsSign(row.points), 432, y, 48, rowH, 15, row.isMe ? P.ink : pointsColor(row.points), 'middle-right')
    ]
  })
  const ribW = imgW('rb_hole_done', rib)

  return fullFrame(L, [
    img(px, 'rb_hole_done', 140, 9, rib),
    topPill(px, fs, 'hole-of', 140 + ribW + 8, 92, 'Hole', `${n.hole} / ${n.holes}`),
    box(px, 'hole-me', 140 + ribW + 106, 10, 108, 36, { color: P.green, radius: 10, border: 2, justify: 'center', align: 'center' }, [
      <Label value={`${n.myRank ? ordinal(n.myRank) : '-'} · ${pointsSign(n.myPoints)} pt`} fontSize={fs(15)} color={P.ink} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
    ]),

    box(px, 'hole-points', 6, 58, 140, 188, { color: P.rankBox, radius: 14, border: 2, borderColor: P.rankEdge }),
    text(px, fs, 'SEASON POINTS', 6, 66, 140, 13, 10, RANK_TEXT, 'middle-center'),
    <UiEntity key="hole-points-value" uiTransform={{ ...at(px, 6, 82, 140, 32), flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
      <Label value={`${n.tierSub} → `} fontSize={fs(24)} color={P.pale} textAlign="middle-right" textWrap="nowrap" uiTransform={{ height: px(32) }} />
      <Label value={String(n.newTierSub)} fontSize={fs(24)} color={gained >= 0 ? C.yellow : SALMON} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(32) }} />
    </UiEntity>,
    box(px, 'hole-points-bar', 18, 118, 116, 8, { color: P.dim, radius: 4 }, [
      <UiEntity uiTransform={{ width: `${hadPct}%`, height: '100%' }} uiBackground={{ color: C.yellow }} />,
      <UiEntity uiTransform={{ width: `${gainPct}%`, height: '100%' }} uiBackground={{ color: P.green }} />
    ]),
    rankBadge(px, after.tier, 52, 50, 134),
    text(px, fs, after.name, 6, 188, 140, 18, 15, P.white, 'middle-center'),
    text(px, fs, after.nextName ? `${after.perTier - after.onTier} pts to ${after.nextName}` : 'Top rank', 10, 208, 132, 30, 11, RANK_TEXT, 'middle-center', true),

    box(px, 'hole-table', 152, 58, 340, 232, { color: P.navy, radius: 14, border: 2, borderColor: P.navyEdge }),
    text(px, fs, 'PLAYER', 216, 63, 100, 14, 10, P.pale),
    text(px, fs, 'SHOTS', 336, 63, 44, 14, 10, P.pale, 'middle-center'),
    text(px, fs, 'TIME', 382, 63, 48, 14, 10, P.pale, 'middle-center'),
    text(px, fs, 'PTS', 432, 63, 48, 14, 10, P.pale, 'middle-right'),
    ...rowEls,

    box(px, 'hole-found', 498, 58, 163, 168, { color: P.teal, radius: 14, border: 2, shadow: 4 }),
    img(px, 'tt_you_found', 508, 65, 0.6),
    ...rewardRows(px, fs, 'hole-reward', n.rewards, 508, 86, 24),

    button2(px, { id: 'next-hole', x: 222, y: 302, w: 200, h: 52, color: P.yellow, radius: 15, shadow: 5, shadowColor: P.yellowShadow, onClick: () => n.onSkip && n.onSkip() }, [
      img(px, 'bt_next_hole', undefined, undefined, 0.7),
      <UiEntity uiTransform={{ width: px(10) }} />,
      <UiEntity uiTransform={{ width: px(30), height: px(30), borderRadius: px(15), justifyContent: 'center', alignItems: 'center' }} uiBackground={{ color: P.ink }}>
        <Label value={String(secondsLeft(n.until))} fontSize={fs(17)} color={C.yellow} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
      </UiEntity>
    ])
  ])
}

export const RunCompleteScreen = () => {
  const n = seasonNextGameState
  if (!n.visible || n.kind !== 'run') return null
  const L = fullLayout()
  const { px, fs } = scaler(L.scale)
  const before = tierInfo(n.tierSub)
  const after = tierInfo(n.newTierSub)
  const rankUp = after.tier > before.tier
  const rankDown = after.tier < before.tier
  const changed = after.tier !== before.tier
  const unlocked = lobbyMenuState.prizes.find((p) => p.tierReward > n.tierSub && p.tierReward <= n.newTierSub) || null
  const storedMax = Number(globalStore.userData.getState()['statistic_tier-sub-max'] || 0)
  const nextPrize = nextSeasonPrize(Math.max(n.newTierSub, storedMax))
  const prize = unlocked || nextPrize
  const sold = !!prize && prizeSoldOut(prize)
  const energy = lobbyHudState.resources.EN || 0
  const pillKey = rankUp ? 'bt_rank_up' : rankDown ? 'bt_rank_down' : 'bt_rank_kept'
  const rib = 38 / 101
  const ribW = imgW('rb_run_complete', rib)
  const pillW = imgW(pillKey, 0.6) + 20

  const prizeName = !prize ? 'All prizes reached' : sold ? `${prize.fashionTickets ? fmt(prize.fashionTickets) + ' ' : ''}Fashion Tickets` : shortName(prize.name)
  const prizeSub = !prize
    ? ''
    : unlocked
      ? sold
        ? 'Added to your balance'
        : 'On its way to your backpack'
      : `at ${seasonTierDefinitions[tierOf(prize.tierReward)]?.name || ''} · ${Math.max(0, prize.tierReward - n.newTierSub)} pts to go`
  const pic = !prize ? null : sold ? 'images/icons/ft.png' : prize.thumbnail

  const badgeRow = changed
    ? [
        rankBadge(px, before.tier, 52, 196, 66),
        text(px, fs, before.name, 172, 120, 100, 14, 11, RANK_TEXT, 'middle-center'),
        img(px, 'gl_arrow', 262, 80, 0.6),
        box(px, 'run-ring', 348, 60, 64, 64, { color: Color4.create(1, 0.82, 0.12, 0.2), radius: 32, border: 3, borderColor: C.yellow }),
        rankBadge(px, after.tier, 56, 352, 64),
        text(px, fs, after.name, 330, 126, 100, 16, 14, C.yellow, 'middle-center')
      ]
    : [rankBadge(px, after.tier, 60, 292, 64), text(px, fs, after.name, 252, 126, 140, 16, 14, C.yellow, 'middle-center')]

  const holeCells = n.holeScores.slice(0, 4).map((h, k) => {
    const x = 158 + (k % 2) * 167
    const y = 194 + Math.floor(k / 2) * 48
    return [
      box(px, `run-hole-${k}`, x, y, 161, 42, { color: h.rank === 1 ? C.yellow : P.glass, radius: 9 }),
      text(px, fs, `HOLE ${h.hole} · ${h.rank ? ordinal(h.rank) : '-'}`, x + 10, y, 100, 42, 12, h.rank === 1 ? P.ink : P.white),
      text(px, fs, pointsSign(h.points), x + 100, y, 51, 42, 16, h.rank === 1 ? P.ink : pointsColor(h.points), 'middle-right')
    ]
  })

  return fullFrame(L, [
    img(px, 'rb_run_complete', 140, 9, rib),
    box(px, 'run-pill', 140 + ribW + 8, 10, pillW, 36, { color: rankUp ? P.green : rankDown ? SALMON : P.lavender, radius: 10, border: 2, justify: 'center', align: 'center' }, [
      img(px, pillKey, undefined, undefined, 0.6)
    ]),

    box(px, 'run-rewards', 6, 58, 140, 188, { color: P.teal, radius: 14, border: 2 }),
    img(px, 'tt_this_run', 16, 65, 0.6),
    ...rewardRows(px, fs, 'run-reward', n.rewards, 16, 86, 26),

    box(px, 'run-rank', 152, 58, 340, 124, { color: P.rankBox, radius: 14, border: 2, borderColor: P.rankEdge, shadow: 4, shadowColor: P.rankShadow }),
    ...badgeRow,
    <UiEntity key="run-points" uiTransform={{ ...at(px, 152, 144, 340, 20), flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
      <Label value={`${n.tierSub} → `} fontSize={fs(16)} color={P.pale} textAlign="middle-right" textWrap="nowrap" uiTransform={{ height: px(20) }} />
      <Label value={`${n.newTierSub}`} fontSize={fs(16)} color={n.newTierSub >= n.tierSub ? C.yellow : SALMON} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(20) }} />
      <Label value=" season points" fontSize={fs(12)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(20) }} />
    </UiEntity>,
    n.note ? text(px, fs, n.note, 160, 164, 324, 16, 10, P.paler, 'middle-center') : null,

    box(px, 'run-holes', 152, 188, 340, 102, { color: P.navy, radius: 14, border: 2, borderColor: P.navyEdge }),
    ...holeCells,

    box(px, 'run-prize', 498, 58, 163, 168, { color: P.pink, radius: 14, border: 2, shadow: 4 }),
    text(px, fs, unlocked ? 'NEW PRIZE UNLOCKED' : 'NEXT PRIZE', 502, 64, 155, 13, 10, P.prizeText, 'middle-center'),
    <UiEntity key="run-prize-pic" uiTransform={{ ...at(px, 547, 82, 64, 64), borderRadius: px(12), borderWidth: border(px, 2), borderColor: P.white }} uiBackground={{ color: Color4.create(1, 1, 1, 0.2) }}>
      {pic ? <UiEntity uiTransform={{ width: '100%', height: '100%', borderRadius: px(10) }} uiBackground={{ texture: { src: pic }, textureMode: 'stretch' }} /> : null}
    </UiEntity>,
    text(px, fs, prizeName, 502, 150, 155, 18, 13, P.white, 'middle-center'),
    text(px, fs, prizeSub, 504, 170, 151, 28, 10, unlocked ? P.green : P.white, 'middle-center', true),

    button2(px, { id: 'run-lobby', x: 152, y: 302, w: 140, h: 52, color: P.lavender, radius: 15, shadow: 5, shadowColor: P.lavenderShadow, onClick: () => n.onSkip && n.onSkip() }, [
      img(px, 'bt_lobby', undefined, undefined, 0.7),
      <UiEntity uiTransform={{ width: px(8) }} />,
      <UiEntity uiTransform={{ width: px(26), height: px(26), borderRadius: px(13), justifyContent: 'center', alignItems: 'center' }} uiBackground={{ color: P.ink }}>
        <Label value={String(secondsLeft(n.until))} fontSize={fs(13)} color={C.yellow} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
      </UiEntity>
    ]),
    // PLAY AGAIN starts from the lobby for now: the button explains it.
    box(px, 'run-again', 300, 302, 192, 52, { color: C.disabled, radius: 15, column: true, justify: 'center', align: 'center' }, [
      <Label value="PLAY AGAIN" fontSize={fs(18)} color={P.ink} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(22) }} />,
      <Label value={`from the lobby · ${energy} energy`} fontSize={fs(10)} color={P.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(14) }} />
    ])
  ])
}
