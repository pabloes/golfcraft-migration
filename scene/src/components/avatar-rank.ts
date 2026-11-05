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
// One table of badge shapes for the UI and for this, rather than two copies.
import { badgeAspect } from '../ui/ui2'
// @ts-ignore - common/* has @ts-nocheck
import { getCatFromTier, getTierFromSub } from '../../../common/utils'
// @ts-ignore - common/* has @ts-nocheck
import { TIER_COLORS } from '../../../common/constants'
// @ts-ignore - common/* has @ts-nocheck
import { seasonTierDefinitions } from '../../../common/season-tier-definitions'

type Shown = { address: string; root: Entity; badge: Entity; label: Entity; tier: number; at: number; pokes: number }

const shown: Record<string, Shown> = {}
let localAddress = ''
let hidden = false

// Design, in metres above the name tag. The badge art is 103x106, so a square
// plane is close enough; the name goes under it, between badge and name tag.
const BADGE_Y = 0.44
// The HEIGHT of the badge: its width comes from the art's own ratio
// (ui2.ts:badgeAspect), because the files are not all the same shape and a
// square plane stretched the high ranks.
const BADGE_HEIGHT = 0.26
const LABEL_Y = 0.22
// 1.6 made a long name like "GRAND MASTER 5" wider than the avatar (user,
// 2026-11-04).
const LABEL_FONT = 1.1

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
    scale: Vector3.create(BADGE_HEIGHT * badgeAspect(tier), BADGE_HEIGHT, 1)
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
  shown[address] = { address, tier, at: Date.now(), pokes: 0, ...createBadge(address, tier) }
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

// A new player's badge never appeared (user, 2026-11-04). The old wiring hung
// off colyseus's onAdd / onChange, chained behind attached-golfclub.ts's own
// hooks, and it had two ways to miss somebody: a callback that did not reach
// us, and a player whose `tier` had not arrived yet when their row did. It
// also created the AvatarAttach the instant the room announced them, which
// can be before the explorer has their avatar, and an attach that binds to
// nothing never recovers.
//
// So no callbacks: a system reconciles what is drawn against what the room
// says, which cannot miss an event because it does not listen for any, and
// re-creates each badge once a few seconds in, which fixes an attach that
// bound too early.
const RECONCILE_MS = 1500
// An AvatarAttach created before the explorer has loaded that avatar binds to
// nothing and never recovers on its own, and this SDK (7.23.3) exposes no way
// to ask whether an avatar is there yet: no PlayerIdentityData, no AvatarBase,
// no enter-scene event. So the attach is written again a few times over the
// first minute, which is long enough for a remote avatar and its wearables to
// arrive on a busy scene. The badge and its label are left alone: rewriting
// only the attach gives the explorer another chance to bind WITHOUT the badge
// blinking for everyone whose attach was fine all along.
const REPOKE_AFTER_MS = [5000, 15000, 40000]
let reconciledAt = 0
let realmFilter = ''

function reconcileSystem() {
  if (!currentRoom || Date.now() - reconciledAt < RECONCILE_MS) return
  reconciledAt = Date.now()
  const players = currentRoom.state?.players
  if (!players) return

  const wanted = new Map<string, number>()
  players.forEach((player: any) => {
    if (!player || player.realm !== realmFilter) return
    const address = String(player.address || '').toLowerCase()
    const tier = Number(player.tier)
    if (address && isDrawable(tier)) wanted.set(address, tier)
  })

  for (const address of Object.keys(shown)) {
    if (!wanted.has(address)) removeBadge(address)
  }
  for (const [address, tier] of wanted) {
    const found = shown[address]
    if (!found) {
      handleNewPlayer(address, tier)
    } else if (found.tier !== tier) {
      removeBadge(address)
      handleNewPlayer(address, tier)
    } else if (found.pokes < REPOKE_AFTER_MS.length && Date.now() - found.at > REPOKE_AFTER_MS[found.pokes]) {
      AvatarAttach.createOrReplace(found.root, {
        avatarId: address === localAddress ? undefined : address,
        anchorPointId: AvatarAnchorPointType.AAPT_NAME_TAG
      })
      found.pokes++
      found.at = Date.now()
    }
  }
}

export function handleAvatarRanks(lobbyRoom: any, { realm, address }: { realm: string; address: string }) {
  localAddress = String(address || '').toLowerCase()
  realmFilter = realm
  currentRoom = lobbyRoom
  lastSentTier = null
  if (!systemAdded) {
    systemAdded = true
    engine.addSystem(visibilitySystem)
    engine.addSystem(ownTierSystem)
    engine.addSystem(reconcileSystem)
  }
  reconciledAt = 0
}
