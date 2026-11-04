// Every player in the realm carries their current rank over their avatar's
// name, so you read who you are standing next to without opening anything
// (user request, 2026-11-04: "ver el de otros avatares, no solo el mío").
//
// Same data path as the attached golf clubs (components/attached-golfclub.ts):
// the shared `gameLobbyRoom` already keeps one PlayerState per connected
// player and that state already carries `tier` (the scene sends it in the join
// options, computed from the `tier-sub` statistic). Here we only read it and
// draw it, plus MESSAGE.ACTIVE_TIER so a rank-up during the session reaches
// everyone without rejoining: the room sets the tier on join and never again.
//
// The badge is anchored to AAPT_NAME_TAG, the avatar's floating name, and sits
// above it; the root is billboarded so badge and text always face the camera.
import {
  engine,
  Entity,
  Transform,
  AvatarAttach,
  AvatarAnchorPointType,
  Billboard,
  MeshRenderer,
  Material,
  TextShape,
  VisibilityComponent
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'

import MESSAGE from '../../../server/rooms/mesages'
import { globalStore } from '../services/globalStore/globalStore'
// @ts-ignore - common/* has @ts-nocheck
import { getCatFromTier, getTierFromSub } from '../../../common/utils'
// @ts-ignore - common/* has @ts-nocheck
import { TIER_COLORS } from '../../../common/constants'
// @ts-ignore - common/* has @ts-nocheck
import { seasonTierDefinitions } from '../../../common/season-tier-definitions'

type Shown = { address: string; root: Entity; badge: Entity; label: Entity; tier: number }

const shown: Record<string, Shown> = {}
let localAddress = ''
let hidden = false

// Design, in metres above the name tag. The badge art is 103x106, so a square
// plane is close enough; the name goes under it, between badge and name tag.
const BADGE_Y = 0.46
const BADGE_SIZE = 0.26
const LABEL_Y = 0.26
const LABEL_FONT = 1.6

const MAX_TIER = 49

const tierName = (tier: number): string => String(seasonTierDefinitions[tier]?.name || '')

// The tier's material colour (TIER_COLORS is one hex per category), so the
// text matches the badge art. Falls back to white on anything unexpected.
const tierColor = (tier: number): Color4 => {
  const hex = String(TIER_COLORS[getCatFromTier(tier)] || '').replace('#', '')
  if (hex.length !== 6) return Color4.White()
  const n = parseInt(hex, 16)
  if (isNaN(n)) return Color4.White()
  return Color4.create(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1)
}

const isDrawable = (tier: any) => typeof tier === 'number' && !isNaN(tier) && tier >= 0 && tier <= MAX_TIER

function createBadge(address: string, tier: number): { root: Entity; badge: Entity; label: Entity } {
  const root = engine.addEntity()
  // The local avatar is addressed without an id, as in attached-golfclub.
  AvatarAttach.create(root, {
    avatarId: address === localAddress ? undefined : address,
    anchorPointId: AvatarAnchorPointType.AAPT_NAME_TAG
  })
  Billboard.create(root, {})

  const badge = engine.addEntity()
  Transform.create(badge, {
    parent: root,
    position: Vector3.create(0, BADGE_Y, 0),
    scale: Vector3.create(BADGE_SIZE, BADGE_SIZE, BADGE_SIZE)
  })
  MeshRenderer.setPlane(badge)
  // Unlit, with the art's own alpha cut out: a PBR material would take the
  // scene's light and an emissive one would blow the sprite out (§6 #11 of
  // the golf club board's traps).
  Material.setBasicMaterial(badge, {
    texture: Material.Texture.Common({ src: `images/season-badges/${tier}.png` }),
    alphaTest: 0.5
  })

  const label = engine.addEntity()
  Transform.create(label, { parent: root, position: Vector3.create(0, LABEL_Y, 0) })
  TextShape.create(label, {
    text: tierName(tier),
    fontSize: LABEL_FONT,
    textColor: tierColor(tier),
    outlineColor: Color4.Black(),
    outlineWidth: 0.25
  })

  if (hidden) {
    VisibilityComponent.createOrReplace(badge, { visible: false })
    VisibilityComponent.createOrReplace(label, { visible: false })
  }
  return { root, badge, label }
}

// SDK7 removeEntity does NOT cascade to children (§6 #11), so the two child
// entities go with the root.
function removeBadge(address: string) {
  const found = shown[address]
  if (!found) return
  engine.removeEntity(found.badge)
  engine.removeEntity(found.label)
  engine.removeEntity(found.root)
  delete shown[address]
}

function handleNewPlayer(address: string, tier: number) {
  if (!address || shown[address] || !isDrawable(tier)) return
  shown[address] = { address, tier, ...createBadge(address, tier) }
}

function handlePlayerTierChange(address: string, tier: number) {
  const found = shown[address]
  if (!found) return handleNewPlayer(address, tier)
  if (found.tier === tier || !isDrawable(tier)) return
  removeBadge(address)
  handleNewPlayer(address, tier)
}

export function clearAvatarRanks() {
  Object.keys(shown).forEach(removeBadge)
}

// Out of the way while the local player is on a course, like the attached
// clubs: the store has no pub/sub, so a system polls it.
function visibilitySystem() {
  const playing = !!globalStore.game.getState().playing
  if (playing === hidden) return
  hidden = playing
  for (const found of Object.values(shown)) {
    VisibilityComponent.createOrReplace(found.badge, { visible: !hidden })
    VisibilityComponent.createOrReplace(found.label, { visible: !hidden })
  }
}

let systemAdded = false
let lastSentTier: number | null = null
let currentRoom: any = null

// This player's own rank, pushed whenever it changes (a finished Ranked run
// moves `tier-sub`, and bootstrap.refreshUserData writes it to the store), so
// the others see the rank-up without anyone rejoining the room.
function ownTierSystem() {
  if (!currentRoom) return
  const tier = getTierFromSub(Number(globalStore.userData.getState()['statistic_tier-sub'] || 0)) || 0
  if (tier === lastSentTier || !isDrawable(tier)) return
  try {
    currentRoom.send(MESSAGE.ACTIVE_TIER, tier)
    lastSentTier = tier
  } catch (err) {
    console.log('[avatar-rank] send failed', err)
  }
}

export function handleAvatarRanks(lobbyRoom: any, { realm, address }: { realm: string; address: string }) {
  localAddress = String(address || '').toLowerCase()
  currentRoom = lobbyRoom
  lastSentTier = null
  if (!systemAdded) {
    systemAdded = true
    engine.addSystem(visibilitySystem)
    engine.addSystem(ownTierSystem)
  }

  // colyseus.js 0.14 holds ONE callback per hook (a plain property, not a
  // listener list), and attached-golfclub.ts hooks the same three. So each one
  // here calls whatever was there before: wire this module AFTER the clubs and
  // both run. Anything else added later must chain in the same way.
  const watch = (player: any) => {
    if (!player || player.realm !== realm) return
    const playerAddress = String(player.address || '').toLowerCase()
    handleNewPlayer(playerAddress, Number(player.tier))
    const previous = player.onChange
    player.onChange = (changes: any[]) => {
      if (previous) previous(changes)
      changes.forEach((change) => {
        if (change.field === 'tier') handlePlayerTierChange(playerAddress, Number(change.value))
      })
    }
  }

  const players = lobbyRoom.state?.players
  if (!players) return
  players.forEach((player: any) => watch(player))
  const previousAdd = players.onAdd
  players.onAdd = (player: any) => {
    if (previousAdd) previousAdd(player)
    watch(player)
  }
  const previousRemove = players.onRemove
  players.onRemove = (player: any) => {
    if (previousRemove) previousRemove(player)
    if (player?.realm === realm) removeBadge(String(player.address || '').toLowerCase())
  }
}
