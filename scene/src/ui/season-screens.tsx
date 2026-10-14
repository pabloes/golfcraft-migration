// The Season screens between the lobby and the holes, after the design canvas:
//   - JoiningScreen   (Joining.dc.html)     solo run, waiting for the ghosts
//   - PartyScreen     (Party.dc.html)       "play ranked with friends" room
//   - HoleResultScreen (HoleResult.dc.html) between holes
//   - RunCompleteScreen (RunComplete.dc.html) after the fourth hole
// They only read seasonWaitState / seasonNextGameState, which the existing
// flows fill; the rounds and the server messages are untouched. Each one is a
// 1280x720 panel contained in the interactable area, like the lobby menu.
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'

import { globalStore } from '../services/globalStore/globalStore'
import { seasonWaitState, SeasonWaitPlayer } from './season-wait-state'
import { seasonNextGameState, SeasonScoreRow } from './season-results-state'
import { lobbyMenuState } from './lobby-menu-state'
import { lobbyHudState } from './lobby-hud-state'
import { seasonCatalog } from '../components/lobby/seasons/season-catalog'
import { C, hex, fmt, mmss, ordinal, shortName, pressable, title, materialIcon, MATERIAL_ICON } from './ui-theme'
import { containLayout, scaler, DESIGN_W, DESIGN_H, type Px, type Layout } from './ui-scale'
// @ts-ignore - common/utils has @ts-nocheck
import { getCatFromTier, getPointsOnCurrentTier, getTierFromSub, seasonPointsPerCategory } from '../../../common/utils'
// @ts-ignore - season-tier-definitions has @ts-nocheck
import { seasonTierDefinitions } from '../../../common/season-tier-definitions'

const MARGIN = 16
const SLOTS = 4

// ---------------------------------------------------------------------------
// Shared pieces

// Full-screen backdrop + the contained panel; children are laid out in a column.
const screen = (L: Layout, px: Px, children: ReactEcs.JSX.Element[], padding = { top: 26, bottom: 26, left: 32, right: 32 }) => (
  <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }} uiBackground={{ color: C.backdrop }}>
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { left: L.left, top: L.top },
        width: L.panelW,
        height: L.panelH,
        flexDirection: 'column',
        alignItems: 'center',
        padding: { top: px(padding.top), bottom: px(padding.bottom), left: px(padding.left), right: px(padding.right) },
        borderRadius: px(24),
        borderWidth: Math.max(2, px(4)),
        borderColor: C.dark
      }}
      uiBackground={{ color: C.bg }}
    >
      {children}
    </UiEntity>
  </UiEntity>
)

const darkChip = (px: Px, fs: Px, text: string, size = 20, color: Color4 = C.white) => (
  <UiEntity uiTransform={{ height: px(40), padding: { left: px(16), right: px(16) }, borderRadius: px(14), justifyContent: 'center' }} uiBackground={{ color: C.dark }}>
    <Label value={text} fontSize={fs(size)} color={color} textAlign="middle-center" uiTransform={{ height: px(40) }} textWrap="nowrap" />
  </UiEntity>
)

const avatarBox = (px: Px, userId: string, size: number, color: Color4) => (
  <UiEntity
    uiTransform={{ width: px(size), height: px(size), borderRadius: px(size * 0.26), borderWidth: Math.max(2, px(5)), borderColor: C.dark }}
    uiBackground={userId ? { avatarTexture: { userId }, color } : { color }}
  />
)

const seasonName = () => {
  const userData = globalStore.userData.getState()
  return (seasonCatalog as any)[String(userData?.config?.currentSeasonCollectionId ?? 4)]?.name || 'MOUNTAIN'
}

const myTierName = () => {
  const tierSub = Number(globalStore.userData.getState()['statistic_tier-sub'] || 0)
  return seasonTierDefinitions[Number(getTierFromSub(tierSub) || 0)]?.name || 'WOOD 5'
}

// A wide yellow pill with a bold figure: "Starting in 7", "Starts in 42s".
const timerPill = (px: Px, fs: Px, text: string, size = 26) => (
  <UiEntity
    uiTransform={{
      height: px(52),
      padding: { left: px(22), right: px(22) },
      borderRadius: px(18),
      borderWidth: Math.max(2, px(4)),
      borderColor: C.dark,
      justifyContent: 'center',
      alignItems: 'center'
    }}
    uiBackground={{ color: C.yellow }}
  >
    <Label value={text} fontSize={fs(size)} color={C.dark} textAlign="middle-center" uiTransform={{ height: px(52) }} textWrap="nowrap" />
  </UiEntity>
)

// An empty slot with a dashed look: dim background and violet border.
const emptySlot = (px: Px, fs: Px, key: string, caption: string, glyph: string) => (
  <UiEntity
    key={key}
    uiTransform={{
      width: '23.5%',
      height: '100%',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: px(26),
      borderWidth: Math.max(2, px(4)),
      borderColor: C.violet
    }}
    uiBackground={{ color: hex('#1C0A3F', 0.35) }}
  >
    <UiEntity
      uiTransform={{ width: px(100), height: px(100), borderRadius: px(28), borderWidth: Math.max(2, px(4)), borderColor: C.violet, justifyContent: 'center', alignItems: 'center' }}
    >
      <Label value={glyph} fontSize={fs(40)} color={C.muted} textAlign="middle-center" uiTransform={{ height: px(100) }} textWrap="nowrap" />
    </UiEntity>
    <Label value={caption} fontSize={fs(19)} color={C.muted} textAlign="middle-center" uiTransform={{ width: '100%', height: px(30), margin: { top: px(14) } }} textWrap="nowrap" />
  </UiEntity>
)

// ---------------------------------------------------------------------------
// Solo run: waiting for the ghosts

const joiningCard = (px: Px, fs: Px, player: SeasonWaitPlayer, index: number, isLast: boolean) => {
  const me = index === 0
  const justJoined = !me && isLast
  return (
    <UiEntity
      key={player.userId + index}
      uiTransform={{
        width: '23.5%',
        height: '100%',
        flexDirection: 'column',
        alignItems: 'center',
        padding: { top: px(26), bottom: px(20), left: px(14), right: px(14) },
        borderRadius: px(26),
        borderWidth: Math.max(2, px(justJoined ? 6 : 4)),
        borderColor: justJoined ? C.yellow : C.dark
      }}
      uiBackground={{ color: me ? C.hotPink : C.purple }}
    >
      {avatarBox(px, player.userId, 132, me ? C.teal : C.blue)}
      <Label
        value={player.displayName}
        fontSize={fs(24)}
        color={me ? C.dark : C.white}
        textAlign="middle-center"
        uiTransform={{ width: '100%', height: px(34), margin: { top: px(12) } }} textWrap="nowrap"
      />
      <UiEntity uiTransform={{ flexGrow: 1 }} />
      <UiEntity
        uiTransform={{ height: px(36), padding: { left: px(14), right: px(14) }, borderRadius: px(12), justifyContent: 'center' }}
        uiBackground={{ color: justJoined ? C.yellow : C.dark }}
      >
        <Label
          value={me ? 'YOU' : justJoined ? 'Just joined!' : 'Joined'}
          fontSize={fs(18)}
          color={justJoined ? C.dark : C.white}
          textAlign="middle-center"
          uiTransform={{ height: px(36) }} textWrap="nowrap"
        />
      </UiEntity>
    </UiEntity>
  )
}

export const JoiningScreen = () => {
  const w = seasonWaitState
  if (!w.visible || w.mode !== 'solo') return null
  const L = containLayout(DESIGN_W, DESIGN_H, { margin: MARGIN })
  const { px, fs } = scaler(L.scale)
  const players = w.players
  const cards: ReactEcs.JSX.Element[] = players.map((p, i) => joiningCard(px, fs, p, i, i === players.length - 1))
  for (let i = players.length; i < SLOTS; i++) cards.push(emptySlot(px, fs, `empty-${i}`, 'Finding a rival', '· · ·'))

  return screen(L, px, [
    title(fs, 'WAITING PLAYERS TO JOIN', 56, px(66)),
    <UiEntity uiTransform={{ height: px(52), flexDirection: 'row', alignItems: 'center', margin: { top: px(10) } }}>
      {darkChip(px, fs, `${seasonName()} Season · ${myTierName()}`)}
      <UiEntity uiTransform={{ width: px(16) }} />
      {timerPill(px, fs, w.secondsLeft > 0 ? `Starting in ${w.secondsLeft}` : 'Starting...')}
    </UiEntity>,
    <UiEntity uiTransform={{ width: '100%', flexGrow: 1, flexDirection: 'row', justifyContent: 'space-between', margin: { top: px(22), bottom: px(22) } }}>
      {cards}
    </UiEntity>,
    <UiEntity uiTransform={{ width: '100%', height: px(78), flexDirection: 'row', alignItems: 'center' }}>
      <UiEntity
        uiTransform={{ flexGrow: 1, height: px(68), padding: { left: px(20), right: px(20) }, borderRadius: px(18), justifyContent: 'center' }}
        uiBackground={{ color: C.dark }}
      >
        <Label
          value={w.sub || 'Anonymous confession: nothing to confess yet'}
          fontSize={fs(17)}
          color={hex('#FF8FE6')}
          textAlign="middle-left"
          textWrap="wrap"
          uiTransform={{ width: '100%', height: px(68) }}
        />
      </UiEntity>
      <UiEntity uiTransform={{ width: px(20) }} />
      {pressable(
        {
          id: 'wait-cancel',
          width: px(210),
          height: px(68),
          color: C.white,
          radius: px(20),
          borderWidth: Math.max(2, px(4)),
          borderColor: C.dark,
          shadow: px(7),
          disabled: !w.onCancel,
          onClick: () => w.onCancel && w.onCancel()
        },
        <Label value="CANCEL" fontSize={fs(26)} color={hex('#B3154F')} textAlign="middle-center" uiTransform={{ width: '100%', height: px(68) }} textWrap="nowrap" />
      )}
    </UiEntity>
  ])
}

// ---------------------------------------------------------------------------
// Party room

const partyCard = (px: Px, fs: Px, player: SeasonWaitPlayer, index: number) => (
  <UiEntity
    key={player.userId + index}
    uiTransform={{
      width: '23.5%',
      height: '100%',
      flexDirection: 'column',
      alignItems: 'center',
      padding: { top: px(26), bottom: px(18), left: px(14), right: px(14) },
      borderRadius: px(26),
      borderWidth: Math.max(2, px(player.isHost ? 5 : 4)),
      borderColor: player.isHost ? C.yellow : C.dark
    }}
    uiBackground={{ color: C.purple }}
  >
    {player.isHost ? (
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: px(-16) },
          height: px(30),
          padding: { left: px(12), right: px(12) },
          borderRadius: px(12),
          borderWidth: Math.max(1, px(3)),
          borderColor: C.dark,
          justifyContent: 'center'
        }}
        uiBackground={{ color: C.yellow }}
      >
        <Label value="HOST" fontSize={fs(16)} color={C.dark} textAlign="middle-center" uiTransform={{ height: px(30) }} textWrap="nowrap" />
      </UiEntity>
    ) : null}
    {avatarBox(px, player.userId, 116, index === 0 ? C.teal : C.pink)}
    <Label value={player.displayName} fontSize={fs(24)} color={C.white} textAlign="middle-center" uiTransform={{ width: '100%', height: px(32), margin: { top: px(10) } }} textWrap="nowrap" />
    <UiEntity uiTransform={{ height: px(32), flexDirection: 'row', alignItems: 'center', padding: { left: px(12), right: px(12) }, margin: { top: px(6) }, borderRadius: px(12) }} uiBackground={{ color: C.dark }}>
      <UiEntity uiTransform={{ width: px(18), height: px(18), borderRadius: px(9), borderWidth: Math.max(1, px(2)), borderColor: C.white }} uiBackground={{ color: C.orange }} />
      <Label value={player.tierName || ''} fontSize={fs(16)} color={C.white} textAlign="middle-left" uiTransform={{ height: px(32), margin: { left: px(8) } }} textWrap="nowrap" />
    </UiEntity>
    <UiEntity uiTransform={{ flexGrow: 1 }} />
    {player.eligible === false ? (
      <UiEntity uiTransform={{ width: '100%', height: px(56), padding: { left: px(10), right: px(10) }, borderRadius: px(12), justifyContent: 'center' }} uiBackground={{ color: C.dark }}>
        <Label
          value="Above room level: plays for fun, no season points"
          fontSize={fs(14)}
          color={C.yellow}
          textAlign="middle-center"
          textWrap="wrap"
          uiTransform={{ width: '100%', height: px(56) }}
        />
      </UiEntity>
    ) : (
      <Label value="Scores season points" fontSize={fs(17)} color={C.green} textAlign="middle-center" uiTransform={{ width: '100%', height: px(30) }} textWrap="nowrap" />
    )}
  </UiEntity>
)

export const PartyScreen = () => {
  const w = seasonWaitState
  if (!w.visible || w.mode !== 'party') return null
  const L = containLayout(DESIGN_W, DESIGN_H, { margin: MARGIN })
  const { px, fs } = scaler(L.scale)
  const cards: ReactEcs.JSX.Element[] = w.players.map((p, i) => partyCard(px, fs, p, i))
  for (let i = w.players.length; i < SLOTS; i++) cards.push(emptySlot(px, fs, `empty-${i}`, 'Waiting for a friend', '+'))
  const alone = w.players.length < 2

  return screen(
    L,
    px,
    [
      <UiEntity uiTransform={{ width: '100%', height: px(64), flexDirection: 'row', alignItems: 'center' }}>
        {pressable(
          {
            id: 'party-back',
            width: px(60),
            height: px(60),
            color: C.white,
            radius: px(18),
            borderWidth: Math.max(2, px(4)),
            borderColor: C.dark,
            shadow: px(6),
            disabled: !w.onCancel,
            onClick: () => w.onCancel && w.onCancel()
          },
          <Label value="<" fontSize={fs(30)} color={C.dark} textAlign="middle-center" uiTransform={{ width: px(60), height: px(60) }} textWrap="nowrap" />
        )}
        <UiEntity uiTransform={{ width: px(18) }} />
        {title(fs, 'PLAY WITH FRIENDS', 48, px(64))}
        <UiEntity uiTransform={{ flexGrow: 1 }} />
        {darkChip(px, fs, `${w.players.length} / ${SLOTS} players`)}
      </UiEntity>,
      <UiEntity uiTransform={{ height: px(56), flexDirection: 'row', alignItems: 'center', margin: { top: px(12) } }}>
        {timerPill(px, fs, alone ? `Cancels in ${w.secondsLeft}s` : `Starts in ${w.secondsLeft}s`, 30)}
        <UiEntity uiTransform={{ width: px(18) }} />
        <Label
          value={alone ? 'Waiting for a friend to join' : `Playing at ${w.roomTierName} level, the lowest rank in the room`}
          fontSize={fs(20)}
          color={C.white}
          textAlign="middle-left"
          uiTransform={{ height: px(56) }} textWrap="nowrap"
        />
      </UiEntity>,
      <UiEntity uiTransform={{ width: '100%', flexGrow: 1, flexDirection: 'row', justifyContent: 'space-between', margin: { top: px(26), bottom: px(20) } }}>
        {cards}
      </UiEntity>,
      <UiEntity uiTransform={{ width: '100%', height: px(86), flexDirection: 'row', alignItems: 'center' }}>
        <UiEntity
          uiTransform={{ flexGrow: 1, height: px(86), flexDirection: 'column', justifyContent: 'center', padding: { left: px(20), right: px(20) }, borderRadius: px(18) }}
          uiBackground={{ color: C.dark }}
        >
          <Label value={`Friends see JOIN PARTY (${w.players.length}/${SLOTS}) on their Season screen`} fontSize={fs(15)} color={C.lilac} textAlign="middle-left" uiTransform={{ height: px(22) }} textWrap="nowrap" />
          <Label value="Same 4 holes for everyone, each player races 3 rivals" fontSize={fs(15)} color={C.lilac} textAlign="middle-left" uiTransform={{ height: px(22) }} textWrap="nowrap" />
          <Label value="Starts on its own after 60 s with no one joining or leaving" fontSize={fs(15)} color={C.lilac} textAlign="middle-left" uiTransform={{ height: px(22) }} textWrap="nowrap" />
        </UiEntity>
        <UiEntity uiTransform={{ width: px(18) }} />
        {pressable(
          {
            id: 'party-cancel',
            width: px(210),
            height: px(68),
            color: C.white,
            radius: px(20),
            borderWidth: Math.max(2, px(4)),
            borderColor: C.dark,
            shadow: px(7),
            disabled: !w.onCancel,
            onClick: () => w.onCancel && w.onCancel()
          },
          <Label value="CANCEL" fontSize={fs(26)} color={hex('#B3154F')} textAlign="middle-center" uiTransform={{ width: '100%', height: px(68) }} textWrap="nowrap" />
        )}
        {w.onStart ? <UiEntity uiTransform={{ width: px(18) }} /> : null}
        {w.onStart
          ? pressable(
              {
                id: 'party-start',
                width: px(260),
                height: px(76),
                color: C.yellow,
                radius: px(22),
                borderWidth: Math.max(2, px(4)),
                borderColor: C.dark,
                shadow: px(8),
                onClick: () => w.onStart && w.onStart()
              },
              <Label value="START" fontSize={fs(38)} color={C.dark} textAlign="middle-center" uiTransform={{ width: '100%', height: px(76) }} textWrap="nowrap" />
            )
          : null}
      </UiEntity>
    ],
    { top: 22, bottom: 28, left: 28, right: 28 }
  )
}

// ---------------------------------------------------------------------------
// Results

const REWARD_STYLE: Record<string, { color: Color4; label: string }> = {
  GC: { color: C.yellow, label: 'GC' },
  WD: { color: C.wood, label: 'WD' },
  ST: { color: C.stone, label: 'ST' },
  IR: { color: C.iron, label: 'IR' },
  GD: { color: C.gold, label: 'GD' },
  DM: { color: C.diamond, label: 'DM' },
  FT: { color: C.ticket, label: 'FT' },
  PT: { color: C.cyan, label: 'PT' },
  XP: { color: C.green, label: 'XP' }
}

const rewardTile = (px: Px, fs: Px, code: string, amount: number, size: number) => {
  const style = REWARD_STYLE[code.toUpperCase()] || { color: C.lilac, label: code }
  return (
    <UiEntity
      key={code}
      uiTransform={{
        width: '48%',
        height: px(size),
        flexDirection: 'row',
        alignItems: 'center',
        margin: { bottom: px(10) },
        padding: { left: px(10), right: px(10) },
        borderRadius: px(14),
        borderWidth: Math.max(1, px(3)),
        borderColor: C.dark
      }}
      uiBackground={{ color: C.tealDark }}
    >
      {MATERIAL_ICON[code.toUpperCase()] ? (
        materialIcon(px, code, 32)
      ) : (
        <UiEntity uiTransform={{ width: px(30), height: px(30), borderRadius: px(9), borderWidth: Math.max(1, px(3)), borderColor: C.darker, justifyContent: 'center', alignItems: 'center' }} uiBackground={{ color: style.color }}>
          <Label value={style.label} fontSize={fs(10)} color={C.dark} textAlign="middle-center" uiTransform={{ height: px(30) }} textWrap="nowrap" />
        </UiEntity>
      )}
      <Label value={`+${fmt(amount)}`} fontSize={fs(21)} color={C.white} textAlign="middle-left" uiTransform={{ height: px(size), margin: { left: px(8) } }} textWrap="nowrap" />
    </UiEntity>
  )
}

const rewardsPanel = (px: Px, fs: Px, heading: string, rewards: { code: string; amount: number }[], grow: boolean) => (
  <UiEntity
    uiTransform={{
      width: '100%',
      flexGrow: grow ? 1 : undefined,
      flexDirection: 'column',
      padding: { top: px(16), bottom: px(8), left: px(20), right: px(20) },
      borderRadius: px(24),
      borderWidth: Math.max(2, px(4)),
      borderColor: C.dark
    }}
    uiBackground={{ color: C.teal }}
  >
    <Label value={heading} fontSize={fs(22)} color={C.white} textAlign="middle-left" uiTransform={{ height: px(30), margin: { bottom: px(10) } }} textWrap="nowrap" />
    <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
      {rewards.length ? rewards.slice(0, 6).map((r) => rewardTile(px, fs, r.code, r.amount, 48)) : null}
      {!rewards.length ? <Label value="Nothing this time" fontSize={fs(16)} color={C.lilac} textAlign="middle-left" uiTransform={{ height: px(30) }} textWrap="nowrap" /> : null}
    </UiEntity>
  </UiEntity>
)

const pointsSign = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0')

const resultRow = (px: Px, fs: Px, row: SeasonScoreRow, cols: [number, number, number, number], run: boolean) => {
  const [rankW, shotsW, timeW, ptsW] = cols
  const fg = row.isMe ? C.dark : C.white
  return (
    <UiEntity
      key={row.rank + row.name}
      uiTransform={{
        width: '100%',
        flexGrow: 1,
        flexDirection: 'row',
        alignItems: 'center',
        margin: { bottom: px(10) },
        padding: { left: px(14), right: px(14) },
        borderRadius: px(18),
        borderWidth: Math.max(1, px(row.isMe ? 4 : 3)),
        borderColor: C.dark
      }}
      uiBackground={{ color: row.isMe ? C.hotPink : C.purpleCard }}
    >
      <UiEntity uiTransform={{ width: px(rankW), height: px(46), justifyContent: 'flex-start', alignItems: 'center' }}>
        <UiEntity
          uiTransform={{ width: px(46), height: px(46), borderRadius: px(23), borderWidth: Math.max(1, px(3)), borderColor: C.dark, justifyContent: 'center', alignItems: 'center' }}
          uiBackground={{ color: row.isMe ? C.white : row.rank === 1 ? C.yellow : C.muted }}
        >
          <Label value={String(row.rank)} fontSize={fs(22)} color={C.dark} textAlign="middle-center" uiTransform={{ height: px(46) }} textWrap="nowrap" />
        </UiEntity>
      </UiEntity>
      <UiEntity uiTransform={{ flexGrow: 1, height: px(46), flexDirection: 'row', alignItems: 'center' }}>
        <UiEntity
          uiTransform={{ width: px(24), height: px(24), borderRadius: row.isGhost ? px(7) : px(12), borderWidth: Math.max(1, px(3)), borderColor: C.dark }}
          uiBackground={{ color: row.isGhost ? C.lilac : C.white }}
        />
        <Label value={row.isMe ? `${row.name} · you` : row.name} fontSize={fs(21)} color={fg} textAlign="middle-left" uiTransform={{ height: px(46), margin: { left: px(10) } }} textWrap="nowrap" />
      </UiEntity>
      <Label value={String(row.shots)} fontSize={fs(22)} color={fg} textAlign="middle-center" uiTransform={{ width: px(shotsW), height: px(46) }} textWrap="nowrap" />
      <Label
        value={row.timeUp && !run ? 'time up' : mmss(row.timeMs)}
        fontSize={fs(row.timeUp && !run ? 16 : 22)}
        color={row.timeUp && !run ? C.salmon : fg}
        textAlign="middle-center"
        uiTransform={{ width: px(timeW), height: px(46) }} textWrap="nowrap"
      />
      <Label value={pointsSign(row.points)} fontSize={fs(row.isMe ? 26 : 22)} color={row.isMe ? C.dark : C.lilac} textAlign="middle-right" uiTransform={{ width: px(ptsW), height: px(46) }} textWrap="nowrap" />
    </UiEntity>
  )
}

const rankingPanel = (px: Px, fs: Px, rows: SeasonScoreRow[], run: boolean) => {
  const cols: [number, number, number, number] = [56, 90, 90, 80]
  return (
    <UiEntity
      uiTransform={{
        width: '66%',
        height: '100%',
        flexDirection: 'column',
        padding: { top: px(18), bottom: px(10), left: px(24), right: px(24) },
        borderRadius: px(28),
        borderWidth: Math.max(2, px(5)),
        borderColor: C.yellow
      }}
      uiBackground={{ color: C.purple }}
    >
      <UiEntity uiTransform={{ width: '100%', height: px(24), flexDirection: 'row', alignItems: 'center', padding: { left: px(14), right: px(14) }, margin: { bottom: px(10) } }}>
        <UiEntity uiTransform={{ width: px(cols[0]) }} />
        <Label value="PLAYER" fontSize={fs(15)} color={C.lilac} textAlign="middle-left" uiTransform={{ flexGrow: 1, height: px(24) }} textWrap="nowrap" />
        <Label value={run ? 'SHOTS' : 'SHOTS'} fontSize={fs(15)} color={C.lilac} textAlign="middle-center" uiTransform={{ width: px(cols[1]), height: px(24) }} textWrap="nowrap" />
        <Label value="TIME" fontSize={fs(15)} color={C.lilac} textAlign="middle-center" uiTransform={{ width: px(cols[2]), height: px(24) }} textWrap="nowrap" />
        <Label value="PTS" fontSize={fs(15)} color={C.lilac} textAlign="middle-right" uiTransform={{ width: px(cols[3]), height: px(24) }} textWrap="nowrap" />
      </UiEntity>
      {rows.map((row) => resultRow(px, fs, row, cols, run))}
    </UiEntity>
  )
}

// Rank maths shared by both result screens.
const tierInfo = (tierSub: number) => {
  const tier = Number(getTierFromSub(tierSub) || 0)
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
  const before = tierInfo(n.tierSub)
  const after = tierInfo(n.newTierSub)
  const gained = n.newTierSub - n.tierSub
  // Bar on the rank AFTER the hole: what you had in green, what you gained in yellow.
  const hadPct = Math.max(0, Math.min(100, ((after.onTier - Math.max(0, gained)) * 100) / after.perTier))
  const gainPct = Math.max(0, Math.min(100 - hadPct, (Math.max(0, gained) * 100) / after.perTier))

  return screen(L, px, [
    <UiEntity uiTransform={{ height: px(70), flexDirection: 'row', alignItems: 'center' }}>
      {title(fs, 'HOLE DONE!', 60, px(70))}
      <UiEntity uiTransform={{ width: px(22) }} />
      {darkChip(px, fs, `Hole ${n.hole} / ${n.holes}`)}
      <UiEntity uiTransform={{ width: px(22) }} />
      <UiEntity
        uiTransform={{ height: px(46), padding: { left: px(16), right: px(16) }, borderRadius: px(16), borderWidth: Math.max(2, px(4)), borderColor: C.dark, justifyContent: 'center' }}
        uiBackground={{ color: C.green }}
      >
        <Label value={`${n.myRank ? ordinal(n.myRank) : '-'} · ${pointsSign(n.myPoints)} pt`} fontSize={fs(22)} color={C.dark} textAlign="middle-center" uiTransform={{ height: px(46) }} textWrap="nowrap" />
      </UiEntity>
    </UiEntity>,
    <UiEntity uiTransform={{ width: '100%', flexGrow: 1, flexDirection: 'row', justifyContent: 'space-between', margin: { top: px(20) } }}>
      {rankingPanel(px, fs, n.rows, false)}
      <UiEntity uiTransform={{ width: '32%', height: '100%', flexDirection: 'column', justifyContent: 'space-between' }}>
        <UiEntity
          uiTransform={{ width: '100%', flexDirection: 'column', padding: { top: px(16), bottom: px(16), left: px(20), right: px(20) }, borderRadius: px(24), borderWidth: Math.max(2, px(4)), borderColor: C.dark }}
          uiBackground={{ color: C.white }}
        >
          <UiEntity uiTransform={{ width: '100%', height: px(26), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Label value="SEASON POINTS" fontSize={fs(16)} color={C.dark} textAlign="middle-left" uiTransform={{ height: px(26) }} textWrap="nowrap" />
            <UiEntity uiTransform={{ height: px(26), flexDirection: 'row', alignItems: 'center' }}>
              <Label value={`${n.tierSub} → `} fontSize={fs(20)} color={C.dark} textAlign="middle-right" uiTransform={{ height: px(26) }} textWrap="nowrap" />
              <Label value={String(n.newTierSub)} fontSize={fs(20)} color={gained >= 0 ? C.greenDark : C.red} textAlign="middle-right" uiTransform={{ height: px(26) }} />
            </UiEntity>
          </UiEntity>
          <UiEntity
            uiTransform={{ width: '100%', height: px(22), flexDirection: 'row', margin: { top: px(10) }, borderRadius: px(12), borderWidth: Math.max(1, px(3)), borderColor: C.dark }}
            uiBackground={{ color: hex('#EDE7F7') }}
          >
            <UiEntity uiTransform={{ width: `${hadPct}%`, height: '100%' }} uiBackground={{ color: C.green }} />
            <UiEntity uiTransform={{ width: `${gainPct}%`, height: '100%' }} uiBackground={{ color: C.yellow }} />
          </UiEntity>
          <Label
            value={after.nextName ? `${after.name} · ${after.perTier - after.onTier} pts to ${after.nextName}` : `${after.name} · top rank`}
            fontSize={fs(16)}
            color={hex('#5A4A7A')}
            textAlign="middle-left"
            uiTransform={{ width: '100%', height: px(24), margin: { top: px(8) } }} textWrap="nowrap"
          />
        </UiEntity>
        {rewardsPanel(px, fs, 'YOU FOUND', n.rewards, false)}
        <UiEntity uiTransform={{ flexGrow: 1 }} />
        {pressable(
          {
            id: 'next-hole',
            width: '100%',
            height: px(76),
            color: C.yellow,
            radius: px(22),
            borderWidth: Math.max(2, px(4)),
            borderColor: C.dark,
            shadow: px(8),
            margin: { top: px(18) },
            onClick: () => n.onSkip && n.onSkip()
          },
          <Label value="NEXT HOLE" fontSize={fs(30)} color={C.dark} textAlign="middle-center" uiTransform={{ height: px(76) }} textWrap="nowrap" />,
          <UiEntity uiTransform={{ width: px(46), height: px(46), margin: { left: px(12) }, borderRadius: px(23), justifyContent: 'center', alignItems: 'center' }} uiBackground={{ color: C.dark }}>
            <Label value={String(secondsLeft(n.until))} fontSize={fs(22)} color={C.yellow} textAlign="middle-center" uiTransform={{ height: px(46) }} textWrap="nowrap" />
          </UiEntity>
        )}
      </UiEntity>
    </UiEntity>
  ])
}

const badge = (px: Px, tier: number, size: number) => (
  <UiEntity uiTransform={{ width: px(size), height: px(size), borderRadius: px(size / 2) }} uiBackground={{ texture: { src: `images/season-badges/${tier}.png` }, textureMode: 'stretch' }} />
)

export const RunCompleteScreen = () => {
  const n = seasonNextGameState
  if (!n.visible || n.kind !== 'run') return null
  const L = containLayout(DESIGN_W, DESIGN_H, { margin: MARGIN })
  const { px, fs } = scaler(L.scale)
  const before = tierInfo(n.tierSub)
  const after = tierInfo(n.newTierSub)
  const rankUp = after.tier > before.tier
  const rankDown = after.tier < before.tier
  const unlocked = lobbyMenuState.prizes.find((p) => p.tierReward > n.tierSub && p.tierReward <= n.newTierSub) || null
  const nextPrize = lobbyMenuState.prizes.find((p) => p.tierReward > n.newTierSub) || null
  const energy = lobbyHudState.resources.EN || 0

  return screen(L, px, [
    title(fs, 'RUN COMPLETE!', 64, px(74)),
    <UiEntity uiTransform={{ width: '100%', flexGrow: 1, flexDirection: 'row', justifyContent: 'space-between', margin: { top: px(16) } }}>
      <UiEntity
        uiTransform={{
          width: '51%',
          height: '100%',
          flexDirection: 'column',
          alignItems: 'center',
          padding: { top: px(20), bottom: px(20), left: px(28), right: px(28) },
          borderRadius: px(28),
          borderWidth: Math.max(2, px(5)),
          borderColor: C.yellow
        }}
        uiBackground={{ color: C.purple }}
      >
        <UiEntity
          uiTransform={{ height: px(50), padding: { left: px(18), right: px(18) }, borderRadius: px(16), borderWidth: Math.max(2, px(4)), borderColor: C.dark, justifyContent: 'center' }}
          uiBackground={{ color: rankUp ? C.green : rankDown ? C.salmon : C.lilac }}
        >
          <Label value={rankUp ? 'RANK UP!' : rankDown ? 'RANK DOWN' : 'RANK KEPT'} fontSize={fs(32)} color={C.dark} textAlign="middle-center" uiTransform={{ height: px(50) }} textWrap="nowrap" />
        </UiEntity>
        <UiEntity uiTransform={{ height: px(170), flexDirection: 'row', alignItems: 'center', margin: { top: px(16) } }}>
          {after.tier !== before.tier ? (
            <UiEntity uiTransform={{ flexDirection: 'column', alignItems: 'center', margin: { right: px(26) } }}>
              {badge(px, before.tier, 104)}
              <Label value={before.name} fontSize={fs(19)} color={C.lilac} textAlign="middle-center" uiTransform={{ height: px(26), margin: { top: px(6) } }} textWrap="nowrap" />
            </UiEntity>
          ) : null}
          {after.tier !== before.tier ? <Label value="→" fontSize={fs(44)} color={C.yellow} textAlign="middle-center" uiTransform={{ width: px(60), height: px(60), margin: { right: px(26) } }} textWrap="nowrap" /> : null}
          <UiEntity uiTransform={{ flexDirection: 'column', alignItems: 'center' }}>
            {badge(px, after.tier, 136)}
            <Label value={after.name} fontSize={fs(26)} color={C.white} textAlign="middle-center" uiTransform={{ height: px(32), margin: { top: px(6) } }} textWrap="nowrap" />
          </UiEntity>
        </UiEntity>
        <UiEntity uiTransform={{ height: px(30), flexDirection: 'row', alignItems: 'center', margin: { top: px(10) } }}>
          <Label value={`${n.tierSub} → `} fontSize={fs(22)} color={C.lilac} textAlign="middle-center" uiTransform={{ height: px(30) }} textWrap="nowrap" />
          <Label value={`${n.newTierSub} season points`} fontSize={fs(22)} color={n.newTierSub >= n.tierSub ? C.green : C.salmon} textAlign="middle-center" uiTransform={{ height: px(30) }} />
        </UiEntity>
        <UiEntity uiTransform={{ flexGrow: 1 }} />
        <UiEntity uiTransform={{ width: '100%', height: px(70), flexDirection: 'row', justifyContent: 'space-between' }}>
          {n.holeScores.map((h) => (
            <UiEntity
              key={h.hole}
              uiTransform={{
                width: '23.5%',
                height: px(70),
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                borderRadius: px(16),
                borderWidth: Math.max(1, px(3)),
                borderColor: C.dark
              }}
              uiBackground={{ color: h.rank === 1 ? C.yellow : C.purpleCard }}
            >
              <Label value={`HOLE ${h.hole} · ${h.rank ? ordinal(h.rank) : '-'}`} fontSize={fs(14)} color={h.rank === 1 ? C.dark : C.lilac} textAlign="middle-center" uiTransform={{ height: px(22) }} textWrap="nowrap" />
              <Label value={pointsSign(h.points)} fontSize={fs(23)} color={h.rank === 1 ? C.dark : C.white} textAlign="middle-center" uiTransform={{ height: px(30) }} textWrap="nowrap" />
            </UiEntity>
          ))}
        </UiEntity>
        {n.note ? (
          <Label value={n.note} fontSize={fs(14)} color={C.lilac} textAlign="middle-center" textWrap="wrap" uiTransform={{ width: '100%', height: px(44), margin: { top: px(10) } }} />
        ) : null}
      </UiEntity>
      <UiEntity uiTransform={{ width: '47%', height: '100%', flexDirection: 'column', justifyContent: 'space-between' }}>
        <UiEntity
          uiTransform={{ width: '100%', height: px(140), flexDirection: 'row', alignItems: 'center', padding: { left: px(20), right: px(20) }, borderRadius: px(24), borderWidth: Math.max(2, px(4)), borderColor: C.dark }}
          uiBackground={{ color: C.pink }}
        >
          <UiEntity uiTransform={{ width: px(104), height: px(104), borderRadius: px(24), borderWidth: Math.max(1, px(3)), borderColor: C.dark }} uiBackground={{ color: C.pinkDark }} />
          <UiEntity uiTransform={{ flexGrow: 1, flexDirection: 'column', justifyContent: 'center', margin: { left: px(18) } }}>
            <Label value={unlocked ? 'NEW PRIZE UNLOCKED' : 'NEXT PRIZE'} fontSize={fs(15)} color={hex('#FFD6F1')} textAlign="middle-left" uiTransform={{ height: px(22) }} textWrap="nowrap" />
            <Label
              value={unlocked ? shortName(unlocked.name) : nextPrize ? shortName(nextPrize.name) : 'All prizes reached'}
              fontSize={fs(26)}
              color={C.white}
              textAlign="middle-left"
              uiTransform={{ height: px(32) }} textWrap="nowrap"
            />
            <Label
              value={unlocked ? `Wearable NFT · ${unlocked.stock} left` : nextPrize ? `at ${seasonTierDefinitions[Number(getTierFromSub(nextPrize.tierReward) || 0)]?.name || ''} · ${nextPrize.stock} left` : ''}
              fontSize={fs(15)}
              color={C.white}
              textAlign="middle-left"
              uiTransform={{ height: px(22) }} textWrap="nowrap"
            />
            {unlocked ? (
              <UiEntity uiTransform={{ height: px(24), padding: { left: px(10), right: px(10) }, margin: { top: px(4) }, borderRadius: px(10), justifyContent: 'center', alignSelf: 'flex-start' }} uiBackground={{ color: C.dark }}>
                <Label value="On its way to your backpack" fontSize={fs(14)} color={C.green} textAlign="middle-center" uiTransform={{ height: px(24) }} textWrap="nowrap" />
              </UiEntity>
            ) : null}
          </UiEntity>
        </UiEntity>
        {rewardsPanel(px, fs, 'THIS RUN', n.rewards, true)}
        <UiEntity uiTransform={{ width: '100%', height: px(82), flexDirection: 'row', margin: { top: px(16) } }}>
          {pressable(
            {
              id: 'run-lobby',
              width: '38%',
              height: px(72),
              color: C.white,
              radius: px(20),
              borderWidth: Math.max(2, px(4)),
              borderColor: C.dark,
              shadow: px(8),
              onClick: () => n.onSkip && n.onSkip()
            },
            <Label value="LOBBY" fontSize={fs(28)} color={C.dark} textAlign="middle-center" uiTransform={{ height: px(72) }} textWrap="nowrap" />,
            <UiEntity uiTransform={{ width: px(40), height: px(40), margin: { left: px(10) }, borderRadius: px(20), justifyContent: 'center', alignItems: 'center' }} uiBackground={{ color: C.dark }}>
              <Label value={String(secondsLeft(n.until))} fontSize={fs(18)} color={C.yellow} textAlign="middle-center" uiTransform={{ height: px(40) }} textWrap="nowrap" />
            </UiEntity>
          )}
          <UiEntity uiTransform={{ width: '4%' }} />
          <UiEntity
            uiTransform={{ width: '58%', height: px(72), flexDirection: 'row', justifyContent: 'center', alignItems: 'center', borderRadius: px(20), borderWidth: Math.max(2, px(4)), borderColor: C.dark }}
            uiBackground={{ color: C.disabled }}
          >
            <Label value="PLAY AGAIN" fontSize={fs(26)} color={C.dark} textAlign="middle-center" uiTransform={{ height: px(72) }} textWrap="nowrap" />
            <UiEntity uiTransform={{ height: px(28), margin: { left: px(12) }, padding: { left: px(10), right: px(10) }, borderRadius: px(10), justifyContent: 'center' }} uiBackground={{ color: C.dark }}>
              <Label value={`from the lobby · ${energy} energy`} fontSize={fs(13)} color={C.cyan} textAlign="middle-center" uiTransform={{ height: px(28) }} textWrap="nowrap" />
            </UiEntity>
          </UiEntity>
        </UiEntity>
      </UiEntity>
    </UiEntity>
  ])
}
