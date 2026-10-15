// The Season screens between the lobby and the holes, after the "Escritorio ·
// propuesta 2" page of the GolfCraft UI canvas:
//   - JoiningScreen    (Joining2.dc.html)    solo run, waiting for the players
//   - PartyScreen      (Party2.dc.html)      "play ranked with friends" room
//   - HoleResultScreen (HoleResult2.dc.html) between holes
//   - RunCompleteScreen (RunComplete2.dc.html) after the fourth hole
// They only read seasonWaitState / seasonNextGameState, which the existing
// flows fill; the rounds and the server messages are untouched. Each one is a
// 1280x720 panel contained in the interactable area, like the lobby menu.
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
import { containLayout, scaler, DESIGN_W, DESIGN_H, type Px } from './ui-scale'
import { P, at, img, imgW, text, box, frame, button2, viewHeader, navyPill, resIcon, rankBadge, border, initialAvatar } from './ui2'
// @ts-ignore - common/utils has @ts-nocheck
import { getCatFromTier, getPointsOnCurrentTier, getTierFromSub, seasonPointsPerCategory } from '../../../common/utils'
// @ts-ignore - season-tier-definitions has @ts-nocheck
import { seasonTierDefinitions } from '../../../common/season-tier-definitions'

const MARGIN = 16
const SLOTS = 4
const card = { color: P.navy, radius: 20, border: 4, shadow: 10 }
const SALMON = hex('#FFB4A6')
const CONFESSION = hex('#FF8FE6')

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

// Rank pill: the rank's badge and its name.
const rankPill = (px: Px, fs: Px, key: string, cx: number, y: number, tier: number, name: string) => {
  const w = 44 + name.length * 9
  return box(px, key, cx - w / 2, y, w, 32, { color: P.dim, radius: 12, align: 'center', padding: { left: px(6) } }, [
    tier >= 0 ? rankBadge(px, tier, 22) : null,
    <Label value={name} fontSize={fs(15)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(32), margin: { left: px(6) } }} />
  ])
}

// Player card of the waiting screens: avatar, name, then whatever `extra`
// draws under it (rank, state, eligibility).
const playerCard = (px: Px, fs: Px, key: string, x: number, y: number, w: number, h: number, color: Color4, ring: boolean, player: SeasonWaitPlayer, avatar: number, extra: any[]) => {
  const cx = x + w / 2
  const face = avatarFaceUrl(player.userId)
  return [
    box(px, key, x, y, w, h, { color, radius: 22, border: ring ? 5 : 4, borderColor: ring ? C.yellow : P.white, shadow: 10 }),
    <UiEntity
      key={`${key}-avatar`}
      uiTransform={{ ...at(px, cx - avatar / 2, y + 26, avatar, avatar), borderRadius: px(avatar * 0.23), borderWidth: border(px, 4), borderColor: P.white }}
      uiBackground={{ color: hex('#2D6FE0') }}
    >
      {face ? <UiEntity uiTransform={{ width: '100%', height: '100%', borderRadius: px(avatar * 0.2) }} uiBackground={{ texture: { src: face }, textureMode: 'stretch' }} /> : null}
    </UiEntity>,
    text(px, fs, player.displayName, x + 10, y + 26 + avatar + 12, w - 20, 34, 24, P.white, 'middle-center'),
    ...extra
  ]
}

// An empty seat: translucent card, a glyph box and a caption.
const emptySlot = (px: Px, fs: Px, key: string, x: number, y: number, w: number, h: number, caption: string, plus: boolean) => {
  const cx = x + w / 2
  const cy = y + h / 2
  return [
    box(px, key, x, y, w, h, { color: P.dim, radius: 22, border: 4, borderColor: Color4.create(1, 1, 1, 0.55) }),
    box(px, `${key}-glyph`, cx - 52, cy - 76, 104, 104, { color: P.clear, radius: 28, border: 4, borderColor: Color4.create(1, 1, 1, 0.55), justify: 'center', align: 'center' }, [
      plus
        ? img(px, 'gl_plus', undefined, undefined, 1)
        : (
            <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center' }}>
              {[1, 0.7, 0.4].map((a, i) => (
                <UiEntity key={i} uiTransform={{ width: px(14), height: px(14), borderRadius: px(7), margin: { left: i ? px(8) : 0 } }} uiBackground={{ color: Color4.create(1, 1, 1, a) }} />
              ))}
            </UiEntity>
          )
    ]),
    text(px, fs, caption, x + 10, cy + 42, w - 20, 30, 19, P.paler, 'middle-center')
  ]
}

const statePill = (px: Px, fs: Px, key: string, cx: number, y: number, value: string, yellow: boolean) => {
  const w = 30 + value.length * 10
  return box(px, key, cx - w / 2, y, w, 34, { color: yellow ? C.yellow : hex('#1C0A3F'), radius: 12, justify: 'center', align: 'center' }, [
    <Label value={value} fontSize={fs(17)} color={yellow ? P.ink : P.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: px(34) }} />
  ])
}

const lavenderCancel = (px: Px, id: string, x: number, y: number, w: number, h: number, onCancel: (() => void) | null) =>
  button2(px, { id, x, y, w, h, color: onCancel ? P.lavender : C.disabled, radius: 18, shadow: 7, shadowColor: onCancel ? P.lavenderShadow : C.dark, disabled: !onCancel, onClick: onCancel || undefined }, [
    img(px, 'bt_cancel')
  ])

// ---------------------------------------------------------------------------
// Solo run: waiting for the players

export const JoiningScreen = () => {
  const w = seasonWaitState
  if (!w.visible || w.mode !== 'solo') return null
  const L = containLayout(DESIGN_W, DESIGN_H, { margin: MARGIN })
  const { px, fs } = scaler(L.scale)
  const players = w.players
  const cardW = (1176 - 3 * 22) / 4
  const myTier = tierOf(myTierSub())
  const myTierName = seasonTierDefinitions[myTier]?.name || 'WOOD 5'

  const seats: any[] = []
  for (let i = 0; i < SLOTS; i++) {
    const x = 52 + i * (cardW + 22)
    const p = players[i]
    if (!p) {
      seats.push(emptySlot(px, fs, `seat-${i}`, x, 200, cardW, 392, 'Finding a rival', false))
      continue
    }
    const me = i === 0
    const justJoined = !me && i === players.length - 1
    const cx = x + cardW / 2
    seats.push(
      playerCard(px, fs, `seat-${i}`, x, 200, cardW, 392, me ? P.teal : P.purple, justJoined, p, 128, [
        me ? rankPill(px, fs, `seat-rank-${i}`, cx, 200 + 26 + 128 + 54, myTier, myTierName) : null,
        statePill(px, fs, `seat-state-${i}`, cx, 200 + 392 - 22 - 34, me ? 'YOU' : justJoined ? 'Just joined!' : 'Joined', me || justJoined)
      ])
    )
  }

  const timer = w.secondsLeft > 0 ? `Starting in ${w.secondsLeft}` : 'Starting...'
  const infoW = 300
  const timerW = 220
  const rowX = (1280 - infoW - 14 - timerW) / 2

  return frame(L, 'view', [
    img(px, 'rb_waiting', (1280 - imgW('rb_waiting')) / 2, 30),
    navyPill(px, fs, 'wait-info', rowX, 128, infoW, 48, [
      <Label value={`${seasonName()} Season ·`} fontSize={fs(17)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(42) }} />,
      <Label value={myTierName} fontSize={fs(17)} color={C.yellow} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(42), margin: { left: px(6) } }} />
    ]),
    box(px, 'wait-timer', rowX + infoW + 14, 128, timerW, 48, { color: C.yellow, radius: 14, shadow: 5, shadowColor: P.yellowShadow, justify: 'center', align: 'center' }, [
      img(px, 'ic_timer_n', undefined, undefined, 0.55),
      <Label value={timer} fontSize={fs(22)} color={P.ink} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(48), margin: { left: px(10) } }} />
    ]),
    ...seats,
    box(px, 'confession', 52, 616, 948, 70, { color: P.navy, radius: 16, border: 3, borderColor: P.navyEdge, align: 'center', padding: { left: px(20), right: px(20) } }, [
      <Label value="CONFESSION" fontSize={fs(12)} color={P.pale} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(64), margin: { right: px(12) }, flexShrink: 0 }} />,
      <Label value={(w.sub || 'Anonymous confession: nothing to confess yet').replace(/^Anonymous confession:\s*/, '')} fontSize={fs(16)} color={CONFESSION} textAlign="middle-left" textWrap="wrap" uiTransform={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, height: px(64) }} />
    ]),
    lavenderCancel(px, 'wait-cancel', 1018, 616, 210, 68, w.onCancel)
  ])
}

// ---------------------------------------------------------------------------
// Party room

export const PartyScreen = () => {
  const w = seasonWaitState
  if (!w.visible || w.mode !== 'party') return null
  const L = containLayout(DESIGN_W, DESIGN_H, { margin: MARGIN })
  const { px, fs } = scaler(L.scale)
  const alone = w.players.length < 2
  const cardW = (1176 - 3 * 20) / 4

  const seats: any[] = []
  for (let i = 0; i < SLOTS; i++) {
    const x = 52 + i * (cardW + 20)
    const p = w.players[i]
    if (!p) {
      seats.push(emptySlot(px, fs, `party-seat-${i}`, x, 192, cardW, 384, 'Waiting for a friend', true))
      continue
    }
    const cx = x + cardW / 2
    const tier = tierIndexByName(p.tierName)
    seats.push(
      playerCard(px, fs, `party-seat-${i}`, x, 192, cardW, 384, p.isHost ? P.teal : P.purple, !!p.isHost, p, 116, [
        p.isHost
          ? box(px, `party-host-${i}`, cx - 50, 174, 100, 30, { color: C.yellow, radius: 12, border: 3, justify: 'center', align: 'center' }, [
              img(px, 'gl_crown', undefined, undefined, 0.6),
              <Label value="HOST" fontSize={fs(16)} color={P.ink} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(30), margin: { left: px(6) } }} />
            ])
          : null,
        p.tierName ? rankPill(px, fs, `party-rank-${i}`, cx, 192 + 26 + 116 + 52, tier, p.tierName) : null,
        p.eligible === false
          ? box(px, `party-elig-${i}`, x + 14, 192 + 384 - 18 - 56, cardW - 28, 56, { color: hex('#1C0A3F'), radius: 12, justify: 'center', align: 'center', padding: { left: px(8), right: px(8) } }, [
              <Label value="Above room level: plays for fun, no season points" fontSize={fs(14)} color={C.yellow} textAlign="middle-center" textWrap="wrap" uiTransform={{ width: '100%', height: px(52) }} />
            ])
          : text(px, fs, 'Scores season points', x + 10, 192 + 384 - 18 - 30, cardW - 20, 30, 16, C.yellow, 'middle-center')
      ])
    )
  }

  return frame(L, 'view', [
    ...viewHeader(px, 'rb_friends', w.onCancel),
    navyPill(px, fs, 'party-count', 1030, 44, 198, 46, [
      img(px, 'ic_people_w', undefined, undefined, 0.6),
      <Label value={`${w.players.length} / ${SLOTS} players`} fontSize={fs(18)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(40), margin: { left: px(10) } }} />
    ]),
    box(px, 'party-timer', 300, 116, 230, 52, { color: C.yellow, radius: 14, shadow: 5, shadowColor: P.yellowShadow, justify: 'center', align: 'center' }, [
      img(px, 'ic_timer_n', undefined, undefined, 0.6),
      <Label value={alone ? `Cancels in ${w.secondsLeft}s` : `Starts in ${w.secondsLeft}s`} fontSize={fs(23)} color={P.ink} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(52), margin: { left: px(10) } }} />
    ]),
    text(px, fs, alone ? 'Waiting for a friend to join' : `Playing at ${w.roomTierName} level, the lowest rank in the room`, 548, 116, 680, 52, 17),
    ...seats,
    box(px, 'party-rules', 52, 598, 690, 92, { color: P.navy, radius: 16, border: 3, borderColor: P.navyEdge, column: true, justify: 'center', padding: { left: px(20), right: px(20) } }, [
      <Label value={`Friends see JOIN PARTY (${w.players.length}/${SLOTS}) on their Season screen`} fontSize={fs(15)} color={P.paler} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(24) }} />,
      <Label value="Same 4 holes for everyone, each player races 3 rivals" fontSize={fs(15)} color={P.paler} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(24) }} />,
      <Label value="Starts on its own after 60 s with no one joining or leaving" fontSize={fs(15)} color={P.paler} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(24) }} />
    ]),
    lavenderCancel(px, 'party-cancel', w.onStart ? 758 : 1038, 606, 190, 70, w.onCancel),
    w.onStart
      ? button2(px, { id: 'party-start', x: 968, y: 598, w: 260, h: 84, color: P.yellow, radius: 20, shadow: 8, shadowColor: P.yellowShadow, onClick: () => w.onStart && w.onStart() }, [
          img(px, 'bt_start'),
          <UiEntity uiTransform={{ width: px(14) }} />,
          img(px, 'ic_play_n', undefined, undefined, 0.85)
        ])
      : null
  ])
}

// ---------------------------------------------------------------------------
// Results

const pointsSign = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0')
const pointsColor = (n: number) => (n > 0 ? P.green : n < 0 ? SALMON : P.paler)

// Reward tile: the game's icon (a green XP square for xp) and the amount.
const rewardTile = (px: Px, fs: Px, key: string, x: number, y: number, w: number, h: number, code: string, amount: number) =>
  box(px, key, x, y, w, h, { color: P.dim, radius: 14, align: 'center', padding: { left: px(10) } }, [
    code.toUpperCase() === 'XP' ? (
      <UiEntity uiTransform={{ width: px(32), height: px(32), borderRadius: px(9), justifyContent: 'center', alignItems: 'center', flexShrink: 0 }} uiBackground={{ color: P.green }}>
        <Label value="XP" fontSize={fs(12)} color={P.ink} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(32) }} />
      </UiEntity>
    ) : (
      resIcon(px, code, 32)
    ),
    <Label value={`+${fmt(amount)}`} fontSize={fs(22)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(h), margin: { left: px(10) } }} />
  ])

const rewardTiles = (px: Px, fs: Px, prefix: string, rewards: { code: string; amount: number }[], x: number, y: number, tileW: number, tileH: number) =>
  rewards.length
    ? rewards.slice(0, 6).map((r, k) => rewardTile(px, fs, `${prefix}-${r.code}`, x + (k % 2) * (tileW + 10), y + Math.floor(k / 2) * (tileH + 10), tileW, tileH, r.code, r.amount))
    : [text(px, fs, 'Nothing this time', x, y, 300, 30, 16, P.paler)]

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
  const L = containLayout(DESIGN_W, DESIGN_H, { margin: MARGIN })
  const { px, fs } = scaler(L.scale)
  const after = tierInfo(n.newTierSub)
  const gained = n.newTierSub - n.tierSub
  // Bar on the rank AFTER the hole: what you had in yellow, what you gained in green.
  const hadPct = Math.max(0, Math.min(100, ((after.onTier - Math.max(0, gained)) * 100) / after.perTier))
  const gainPct = Math.max(0, Math.min(100 - hadPct, (Math.max(0, gained) * 100) / after.perTier))

  const rows = n.rows
  const rowsTop = 184
  const rowH = Math.min(114, (680 - rowsTop - (rows.length - 1) * 10) / Math.max(1, rows.length))
  const rowEls = rows.map((row: SeasonScoreRow, i: number) => {
    const y = rowsTop + i * (rowH + 10)
    const fg = row.isMe ? P.ink : P.white
    return [
      box(px, `hole-row-${i}`, 76, y, 740, rowH, row.isMe ? { color: P.yellow, radius: 16, border: 3, shadow: 6, shadowColor: P.yellowShadow } : { color: P.glass, radius: 16, border: 2, borderColor: P.glassEdge }),
      box(px, `hole-pos-${i}`, 92, y + rowH / 2 - 22, 44, 44, { color: row.isMe ? P.ink : row.rank === 1 ? C.yellow : Color4.create(1, 1, 1, 0.2), radius: 22, border: 3, justify: 'center', align: 'center' }, [
        <Label value={String(row.rank)} fontSize={fs(22)} color={row.isMe ? C.yellow : row.rank === 1 ? P.ink : P.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
      ]),
      <UiEntity key={`hole-av-${i}`} uiTransform={at(px, 158, y + rowH / 2 - 14)}>
        {initialAvatar(px, fs, row.name, 28, i)}
      </UiEntity>,
      text(px, fs, row.isMe ? `${row.name} · you` : row.name, 196, y + rowH / 2 - 16, 300, 32, 21, fg),
      text(px, fs, String(row.shots), 520, y + rowH / 2 - 16, 90, 32, 24, fg, 'middle-center'),
      text(px, fs, row.timeUp ? 'time up' : mmss(row.timeMs), 630, y + rowH / 2 - 16, 90, 32, row.timeUp ? 15 : 24, row.timeUp ? SALMON : fg, 'middle-center'),
      text(px, fs, pointsSign(row.points), 722, y + rowH / 2 - 16, 80, 32, row.isMe ? 28 : 24, row.isMe ? P.ink : pointsColor(row.points), 'middle-right')
    ]
  })

  const ribbonW = imgW('rb_hole_done')
  const groupX = (1280 - (ribbonW + 22 + 124 + 22 + 150)) / 2

  return frame(L, 'result', [
    img(px, 'rb_hole_done', groupX, 22),
    navyPill(px, fs, 'hole-of', groupX + ribbonW + 22, 46, 124, 46, [
      <Label value="Hole" fontSize={fs(17)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(40) }} />,
      <Label value={`${n.hole} / ${n.holes}`} fontSize={fs(17)} color={C.yellow} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(40), margin: { left: px(6) } }} />
    ]),
    box(px, 'hole-me', groupX + ribbonW + 22 + 124 + 22, 46, 150, 46, { color: P.green, radius: 14, border: 3, justify: 'center', align: 'center' }, [
      <Label value={`${n.myRank ? ordinal(n.myRank) : '-'} · ${pointsSign(n.myPoints)} pt`} fontSize={fs(21)} color={P.ink} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: px(46) }} />
    ]),

    box(px, 'hole-table', 52, 132, 788, 558, card),
    text(px, fs, 'PLAYER', 158, 150, 200, 22, 13, P.pale),
    text(px, fs, 'SHOTS', 520, 150, 90, 22, 13, P.pale, 'middle-center'),
    text(px, fs, 'TIME', 630, 150, 90, 22, 13, P.pale, 'middle-center'),
    text(px, fs, 'PTS', 722, 150, 80, 22, 13, P.pale, 'middle-right'),
    ...rowEls,

    box(px, 'hole-points', 860, 132, 368, 150, card),
    text(px, fs, 'SEASON POINTS', 882, 150, 180, 22, 13, P.pale),
    <UiEntity key="hole-points-value" uiTransform={{ ...at(px, 1006, 146, 200, 30), flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }}>
      <Label value={`${n.tierSub} → `} fontSize={fs(24)} color={P.white} textAlign="middle-right" textWrap="nowrap" uiTransform={{ height: px(30) }} />
      <Label value={String(n.newTierSub)} fontSize={fs(24)} color={gained >= 0 ? P.green : SALMON} textAlign="middle-right" textWrap="nowrap" uiTransform={{ height: px(30) }} />
    </UiEntity>,
    box(px, 'hole-points-bar', 882, 188, 324, 18, { color: P.dim, radius: 9 }, [
      <UiEntity uiTransform={{ width: `${hadPct}%`, height: '100%' }} uiBackground={{ color: C.yellow }} />,
      <UiEntity uiTransform={{ width: `${gainPct}%`, height: '100%' }} uiBackground={{ color: P.green }} />
    ]),
    rankBadge(px, after.tier, 24, 882, 222),
    text(px, fs, after.nextName ? `${after.name} · ${after.perTier - after.onTier} pts to ${after.nextName}` : `${after.name} · top rank`, 914, 222, 300, 24, 14, P.paler),

    box(px, 'hole-found', 860, 300, 368, 280, { ...card, color: P.teal }),
    img(px, 'tt_you_found', 882, 318),
    ...rewardTiles(px, fs, 'hole-reward', n.rewards, 882, 356, 157, 64),

    button2(px, { id: 'next-hole', x: 860, y: 598, w: 368, h: 92, color: P.yellow, radius: 20, shadow: 8, shadowColor: P.yellowShadow, onClick: () => n.onSkip && n.onSkip() }, [
      img(px, 'bt_next_hole'),
      box(px, 'next-hole-count', 280, 23, 46, 46, { color: P.ink, radius: 23, justify: 'center', align: 'center' }, [
        <Label value={String(secondsLeft(n.until))} fontSize={fs(22)} color={C.yellow} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
      ])
    ])
  ])
}

export const RunCompleteScreen = () => {
  const n = seasonNextGameState
  if (!n.visible || n.kind !== 'run') return null
  const L = containLayout(DESIGN_W, DESIGN_H, { margin: MARGIN })
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
  const pillW = imgW(pillKey) + 40

  const prizeName = !prize ? 'All prizes reached' : sold ? `${prize.fashionTickets ? fmt(prize.fashionTickets) + ' ' : ''}Fashion Tickets` : shortName(prize.name)
  const prizeSub = !prize
    ? ''
    : unlocked
      ? sold
        ? `${shortName(prize.name)} sold out: Fashion Tickets instead`
        : 'Wearable NFT'
      : `at ${seasonTierDefinitions[tierOf(prize.tierReward)]?.name || ''} · ${Math.max(0, prize.tierReward - n.newTierSub)} season points to go`
  const pic = !prize ? null : sold ? 'images/icons/ft.png' : prize.thumbnail

  const badgeRow = changed
    ? [
        rankBadge(px, before.tier, 110, 140, 260),
        text(px, fs, before.name, 110, 376, 170, 26, 20, Color4.create(1, 1, 1, 0.75), 'middle-center'),
        img(px, 'gl_arrow', 290, 296),
        box(px, 'run-ring', 400, 236, 160, 160, { color: Color4.create(1, 0.82, 0.12, 0.2), radius: 80, border: 5, borderColor: C.yellow }),
        rankBadge(px, after.tier, 140, 410, 246),
        text(px, fs, after.name, 380, 404, 200, 30, 26, C.yellow, 'middle-center')
      ]
    : [rankBadge(px, after.tier, 150, 297, 236), text(px, fs, after.name, 272, 396, 200, 30, 26, C.yellow, 'middle-center')]

  const holeTiles = n.holeScores.map((h, k) =>
    box(px, `run-hole-${k}`, 76 + k * 152, 600, 142, 72, h.rank === 1 ? { color: C.yellow, radius: 14, border: 2, column: true, justify: 'center', align: 'center' } : { color: P.glass, radius: 14, border: 2, borderColor: P.glassEdge, column: true, justify: 'center', align: 'center' }, [
      <Label value={`HOLE ${h.hole} · ${h.rank ? ordinal(h.rank) : '-'}`} fontSize={fs(12)} color={h.rank === 1 ? P.ink : P.paler} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(20) }} />,
      <Label value={pointsSign(h.points)} fontSize={fs(24)} color={h.rank === 1 ? P.ink : P.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(32) }} />
    ])
  )

  return frame(L, 'result', [
    img(px, 'rb_run_complete', (1280 - imgW('rb_run_complete')) / 2, 18),

    box(px, 'run-rank', 52, 136, 640, 554, card),
    box(px, 'run-pill', 372 - pillW / 2, 158, pillW, 52, { color: rankUp ? P.green : rankDown ? SALMON : P.lavender, radius: 16, border: 3, shadow: 6, shadowColor: rankUp ? P.greenShadow : C.dark, justify: 'center', align: 'center' }, [img(px, pillKey)]),
    ...badgeRow,
    <UiEntity key="run-points" uiTransform={{ ...at(px, 72, 452, 600, 32), flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
      <Label value={`${n.tierSub} → `} fontSize={fs(24)} color={P.white} textAlign="middle-right" textWrap="nowrap" uiTransform={{ height: px(32) }} />
      <Label value={`${n.newTierSub}`} fontSize={fs(24)} color={n.newTierSub >= n.tierSub ? C.yellow : SALMON} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(32) }} />
      <Label value=" season points" fontSize={fs(24)} color={P.white} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: px(32) }} />
    </UiEntity>,
    n.note ? text(px, fs, n.note, 82, 492, 580, 90, 14, P.paler, 'middle-center', true) : null,
    ...holeTiles,

    box(px, 'run-prize', 712, 136, 516, 170, { ...card, color: P.pink }),
    <UiEntity key="run-prize-pic" uiTransform={{ ...at(px, 728, 157, 128, 128), borderRadius: px(18), borderWidth: border(px, 3), borderColor: P.white }} uiBackground={{ color: Color4.create(1, 1, 1, 0.2) }}>
      {pic ? <UiEntity uiTransform={{ width: '100%', height: '100%' }} uiBackground={{ texture: { src: pic }, textureMode: 'stretch' }} /> : null}
    </UiEntity>,
    text(px, fs, unlocked ? 'NEW PRIZE UNLOCKED' : 'NEXT PRIZE', 872, 160, 340, 20, 13, hex('#FFD6F1')),
    text(px, fs, prizeName, 872, 182, 340, 34, 26),
    text(px, fs, prizeSub, 872, 218, 340, 22, 14),
    unlocked
      ? box(px, 'run-prize-chip', 872, 248, 230, 26, { color: hex('#1C0A3F'), radius: 10, justify: 'center', align: 'center' }, [
          <Label value={sold ? 'Added to your balance' : 'On its way to your backpack'} fontSize={fs(13)} color={P.green} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: px(26) }} />
        ])
      : null,

    box(px, 'run-rewards', 712, 324, 516, 258, { ...card, color: P.teal }),
    img(px, 'tt_this_run', 734, 342),
    ...rewardTiles(px, fs, 'run-reward', n.rewards, 734, 380, 231, 54),

    button2(px, { id: 'run-lobby', x: 712, y: 600, w: 190, h: 90, color: P.lavender, radius: 20, shadow: 7, shadowColor: P.lavenderShadow, onClick: () => n.onSkip && n.onSkip() }, [
      img(px, 'bt_lobby'),
      box(px, 'run-lobby-count', 138, 27, 36, 36, { color: P.ink, radius: 18, justify: 'center', align: 'center' }, [
        <Label value={String(secondsLeft(n.until))} fontSize={fs(16)} color={C.yellow} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
      ])
    ]),
    // PLAY AGAIN starts from the lobby for now: the button explains it.
    box(px, 'run-again', 918, 600, 310, 90, { color: C.disabled, radius: 20, column: true, justify: 'center', align: 'center' }, [
      <Label value="PLAY AGAIN" fontSize={fs(26)} color={P.ink} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(34) }} />,
      <Label value={`from the lobby · ${energy} energy`} fontSize={fs(13)} color={P.white} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: px(20) }} />
    ])
  ])
}

