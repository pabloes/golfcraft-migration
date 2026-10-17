// SDK7 port of SDK6 scene/src/components/attached-golfclub.ts
// (handleAttachedGolfclubs): every player in the realm who has an NFT golf
// club equipped carries its model on their avatar, and everyone sees it.
//
// Same data path as SDK6: each client tells the shared `gameLobbyRoom`
// which club it has equipped (MESSAGE.ACTIVE_GOLFCLUB), the room keeps one
// PlayerState per connected player {address, realm, activeGolfclub}, and
// every client attaches models/attached/golfClub<id>.glb to the avatar of each
// player in its realm, at the avatar's position anchor (the model carries its
// own offset). The basic club (id 1) is never shown. The attachments are
// hidden while the local player is in a match, as in SDK6.
//
// Deviation: SDK6 only re-sent the club when it changed to an NFT one, so a
// player who went back to the basic club kept showing the old model; this
// sends every change, and the receiving end removes it.
import { engine, Entity, GltfContainer, AvatarAttach, AvatarAnchorPointType, VisibilityComponent } from '@dcl/sdk/ecs'

import MESSAGE from '../../../server/rooms/mesages'
import { globalStore } from '../services/globalStore/globalStore'
import { lobbyHudState } from '../ui/lobby-hud-state'

type Attached = { address: string; entity: Entity | null; golfclubId: number }

const attached: Record<string, Attached> = {}
let localAddress = ''
let hidden = false

const isNFTGolfclub = (id: any) => typeof id === 'number' && !isNaN(id) && id !== 1
const modelFor = (id: number) => `models/attached/golfClub${id}.glb`

function attachModel(address: string, golfclubId: number): Entity {
  const entity = engine.addEntity()
  GltfContainer.create(entity, { src: modelFor(golfclubId) })
  // The local avatar is addressed without an id.
  AvatarAttach.create(entity, {
    avatarId: address === localAddress ? undefined : address,
    anchorPointId: AvatarAnchorPointType.AAPT_POSITION
  })
  if (hidden) VisibilityComponent.createOrReplace(entity, { visible: false })
  return entity
}

function handleNewPlayer(address: string, golfclubId: number) {
  if (!address || attached[address]) return
  attached[address] = { address, golfclubId, entity: isNFTGolfclub(golfclubId) ? attachModel(address, golfclubId) : null }
}

function handlePlayerGolfclubChange(address: string, golfclubId: number) {
  const found = attached[address]
  if (!found) return handleNewPlayer(address, golfclubId)
  if (found.golfclubId === golfclubId) return
  if (found.entity) {
    engine.removeEntity(found.entity)
    found.entity = null
  }
  if (isNFTGolfclub(golfclubId)) found.entity = attachModel(address, golfclubId)
  found.golfclubId = golfclubId
}

function removePlayer(address: string) {
  const found = attached[address]
  if (!found) return
  if (found.entity) engine.removeEntity(found.entity)
  delete attached[address]
}

export function clearAttachedGolfclubs() {
  Object.keys(attached).forEach(removePlayer)
}

// SDK6 hid the shapes while the local player was playing (a globalStore
// onChange on `playing`); our store has no pub/sub, so a system polls it.
function visibilitySystem() {
  const playing = !!globalStore.game.getState().playing
  if (playing === hidden) return
  hidden = playing
  for (const found of Object.values(attached)) {
    if (found.entity) VisibilityComponent.createOrReplace(found.entity, { visible: !hidden })
  }
}

let systemAdded = false
let lastSentGolfclub: number | null = null
let currentRoom: any = null

// Sends this player's equipped club whenever the HUD resolves a different one
// (at login, and after EQUIP on the board or in the WORKSHOP view).
function ownGolfclubSystem() {
  const id = lobbyHudState.resources.golfclub?.id
  if (!currentRoom || typeof id !== 'number' || id === lastSentGolfclub) return
  try {
    currentRoom.send(MESSAGE.ACTIVE_GOLFCLUB, id)
    lastSentGolfclub = id
  } catch (err) {
    console.log('[attached-golfclub] send failed', err)
  }
}

export function handleAttachedGolfclubs(lobbyRoom: any, { realm, address }: { realm: string; address: string }) {
  localAddress = String(address || '').toLowerCase()
  currentRoom = lobbyRoom
  lastSentGolfclub = null
  if (!systemAdded) {
    systemAdded = true
    engine.addSystem(visibilitySystem)
    engine.addSystem(ownGolfclubSystem)
  }

  const watch = (player: any) => {
    if (!player || player.realm !== realm) return
    const playerAddress = String(player.address || '').toLowerCase()
    handleNewPlayer(playerAddress, Number(player.activeGolfclub))
    player.onChange = (changes: any[]) => {
      changes.forEach((change) => {
        if (change.field === 'activeGolfclub') handlePlayerGolfclubChange(playerAddress, Number(change.value))
      })
    }
  }

  const players = lobbyRoom.state?.players
  if (!players) return
  players.forEach((player: any) => watch(player))
  players.onAdd = (player: any) => watch(player)
  players.onRemove = (player: any) => {
    if (player?.realm === realm) removePlayer(String(player.address || '').toLowerCase())
  }
}
