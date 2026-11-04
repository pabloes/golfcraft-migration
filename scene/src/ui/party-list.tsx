// The members of a Ranked party, as a list (user request, 2026-11-04: not
// cards any more, because a party is no longer capped at four and four cards
// across is all the width there is).
//
// It lives in its own file so the party screen only has to call it, and it
// takes the players it is given rather than reading the state, so the screen
// stays the one place that decides what is on screen.
//
// ReactEcs has no scrolling, so the list shows as many rows as it has room for
// and ends with "+N more" rather than silently dropping people: in a party of
// twenty, everyone has to be able to see that twenty are in.
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'

import { SeasonWaitPlayer } from './season-wait-state'
import { avatarFaceUrl } from '../services/avatar-face'
import { C, hex } from './ui-theme'
import { type Px } from './ui-scale'
import { P, at, text, box, rankBadge, border } from './ui2'

const ROW_H = 26
const GAP = 3
const FACE = 20

const tierIndexByName = (name: string, tiers: any[]) => (name ? tiers.findIndex((t: any) => t?.name === name) : -1)

// One row: face, name, rank badge and rank, HOST tag, and whether the player
// scores season points in this room.
const memberRow = (
  px: Px,
  fs: Px,
  key: string,
  player: SeasonWaitPlayer,
  index: number,
  x: number,
  y: number,
  w: number,
  tiers: any[]
) => {
  const face = avatarFaceUrl(player.userId)
  const tier = tierIndexByName(player.tierName || '', tiers)
  const host = !!player.isHost
  // Above the room's level: plays for nothing and scores nothing, the rule
  // the waiting screen has always spelled out per seat.
  const scores = player.eligible !== false
  return [
    box(px, key, x, y, w, ROW_H, {
      color: host ? P.navyEdge : P.navy,
      radius: 8,
      border: 2,
      borderColor: host ? C.yellow : P.navyEdge
    }),
    <UiEntity
      key={`${key}-face`}
      uiTransform={{ ...at(px, x + 3, y + 3, FACE, FACE), borderRadius: px(FACE / 2), borderWidth: border(px, 1), borderColor: P.white }}
      uiBackground={{ color: hex('#2D6FE0') }}
    >
      {face ? (
        <UiEntity uiTransform={{ width: '100%', height: '100%', borderRadius: px(FACE / 2 - 1) }} uiBackground={{ texture: { src: face }, textureMode: 'stretch' }} />
      ) : (
        <Label value={String(index + 1)} fontSize={fs(10)} color={P.white} textAlign="middle-center" uiTransform={{ width: '100%', height: '100%' }} />
      )}
    </UiEntity>,
    text(px, fs, player.displayName || '-', x + FACE + 9, y + 5, w - 190, 16, 12, P.white, 'middle-left'),
    tier >= 0 ? rankBadge(px, tier, 18, x + w - 168, y + 4) : null,
    tier >= 0 ? text(px, fs, player.tierName || '', x + w - 146, y + 5, 70, 16, 10, P.pale, 'middle-left') : null,
    host
      ? box(px, `${key}-host`, x + w - 72, y + 6, 30, 14, { color: C.yellow, radius: 5, justify: 'center', align: 'center' }, [
          <Label value="HOST" fontSize={fs(8)} color={P.ink} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
        ])
      : null,
    text(px, fs, scores ? 'scores' : 'no points', x + w - 38, y + 5, 36, 16, 9, scores ? P.green : C.yellow, 'middle-left')
  ]
}

// The whole list inside a panel. `height` is the design-px box it must fit in.
export const partyMemberList = (
  px: Px,
  fs: Px,
  players: SeasonWaitPlayer[],
  maxPlayers: number,
  x: number,
  y: number,
  w: number,
  height: number,
  tiers: any[]
) => {
  const rows = Math.max(1, Math.floor((height - 6) / (ROW_H + GAP)))
  const overflow = players.length > rows
  // one row goes to the "+N more" line when there are too many
  const shown = overflow ? players.slice(0, rows - 1) : players
  const out: any[] = [box(px, 'party-list', x, y, w, height, { color: P.navyDeep, radius: 12, border: 2, borderColor: P.navyEdge })]
  shown.forEach((player, i) => {
    out.push(...memberRow(px, fs, `party-row-${i}`, player, i, x + 4, y + 4 + i * (ROW_H + GAP), w - 8, tiers))
  })
  if (overflow) {
    out.push(
      text(
        px,
        fs,
        `+${players.length - shown.length} more in the party`,
        x + 4,
        y + 4 + shown.length * (ROW_H + GAP) + 4,
        w - 8,
        16,
        11,
        P.pale,
        'middle-center'
      )
    )
  } else if (!players.length) {
    out.push(text(px, fs, 'Waiting for friends…', x + 4, y + height / 2 - 8, w - 8, 16, 12, P.pale, 'middle-center'))
  }
  // An empty slot line, so the party's size is readable at a glance.
  if (!overflow && players.length && players.length < maxPlayers) {
    out.push(
      text(
        px,
        fs,
        `${maxPlayers - players.length} free place${maxPlayers - players.length === 1 ? '' : 's'}`,
        x + 4,
        y + 4 + shown.length * (ROW_H + GAP) + 4,
        w - 8,
        16,
        11,
        P.pale,
        'middle-center'
      )
    )
  }
  return out
}
