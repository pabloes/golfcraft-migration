// SDK7 port of SDK6 scene/src/components/lobby/golfclub-screen/golfclub-screen-ui.ts
//
// The in-world golfclub board: browse your clubs (E/F or the side arrows), see
// level + power/control/aim, select one as active, and spend materials to bump
// an attribute. This is the screen storymode mission 7 sends the player to
// ("Back there is a screen where you can improve your golfclub"); raising `aim`
// is what advances current_mission 7 -> 8 via /api/check-npc-mission.
//
// Upgrade rules (enforced again server-side by the `upgradeGolfclub`
// cloudscript, so the UI only mirrors them):
//   - cost = [10,20,30,60,120][current attribute value], spent from
//     power->IR (iron), control->ST (stone), aim->WD (wood)
//   - available while the club has xp, its xp level > attributes level
//     (1+power+control+aim) and that attributes level is < 16
import {
  Entity,
  GltfContainer,
  InputAction,
  Material,
  MaterialTransparencyMode,
  MeshCollider,
  MeshRenderer,
  ColliderLayer,
  PointerEvents,
  PointerEventType,
  TextAlignMode,
  TextShape,
  Transform,
  VisibilityComponent,
  engine,
  inputSystem
} from '@dcl/sdk/ecs'
import { Color3, Quaternion, Vector3 } from '@dcl/sdk/math'

// @ts-ignore - common/utils has @ts-nocheck
import { getLevelInfo } from '../../../../../common/utils'
import { getGLTFShape, getTexture } from '../../../../golfplay/services/resource-repo'
import { lobbyHudState } from '../../../ui/lobby-hud-state'
import { registerSound, reproduceAvatarSound } from '../../../../golfplay/mana-fever-utils/lib/sound/avatar-sound'
import { createScreenBar } from './screen-bar'
import { createHandlerFrom } from './button-handler'
import { createAttributeUpdateButton } from './attribute-update-button'
import { createScreenIconWithValue } from './screen-icon-with-value'
import { setSpritePlane } from './sprite-material'

// SDK6 registered these at module load. Our lobby can be re-created after a
// mission (SDK6 hid/showed it instead), and registerSound throws on a duplicate
// name, so guard it — same fix as golfplay-client (see CLAUDE.md §6 #23).
let soundsRegistered = false
const registerBoardSounds = () => {
  if (soundsRegistered) return
  soundsRegistered = true
  registerSound('ui_club_select')
  registerSound('ui_club_next')
  registerSound('ui_club_previous')
  registerSound('ui_club_inc_power')
  registerSound('ui_club_inc_aim')
  registerSound('ui_club_inc_control')
}

const UPGRADE_COSTS = [10, 20, 30, 60, 120]
const UPGRADE_MATERIALS: { [attribute: string]: 'IR' | 'ST' | 'WD' } = {
  power: 'IR',
  control: 'ST',
  aim: 'WD'
}

export type BoardGolfclub = {
  tokenId: string | null
  golfclubId: string | number
  xp: number
  DisplayName?: string
  ItemInstanceId?: string
  attributes: { power: number; control: number; aim: number }
  minting: number | boolean
}

export type CreateGolfclubBoardOptions = {
  position: Vector3.MutableVector3
  rotation: Quaternion.MutableQuaternion
  golfclubCollection: BoardGolfclub[]
  activeGolfClubTokenId: string | null
}

export const createGolfclubBoard = (parent: Entity, opts: CreateGolfclubBoardOptions) => {
  registerBoardSounds()
  const { position, rotation, golfclubCollection, activeGolfClubTokenId } = opts

  const callbacks: {
    onSelect: ((data: { golfclub: BoardGolfclub }) => void) | null
    onUpgrade: ((data: { attribute: string; ItemInstanceId?: string }) => void) | null
    onMint: (() => void) | null
  } = { onSelect: null, onUpgrade: null, onMint: null }

  const foundGolfclubIndex = golfclubCollection.findIndex((g) => g.tokenId === activeGolfClubTokenId)
  // eslint-disable-next-line eqeqeq
  const indexOfStandard = golfclubCollection.findIndex((g) => g.golfclubId == '1')
  const state: any = {
    loading: false,
    section: 1,
    currentGolfClub: foundGolfclubIndex >= 0 ? foundGolfclubIndex : Math.max(indexOfStandard, 0),
    activeGolfClubTokenId,
    golfclubCollection,
    upgradingAttribute: null
  }

  // Track every entity so dispose() can clean up: SDK7 removeEntity does NOT
  // cascade to children (CLAUDE.md §6 #11), and the lobby is destroyed whenever
  // a mission starts.
  const ownedEntities: Entity[] = []
  const addEntity = () => {
    const e = engine.addEntity()
    ownedEntities.push(e)
    return e
  }

  const entity = addEntity()
  Transform.create(entity, { parent, position, rotation })
  GltfContainer.create(entity, { src: getGLTFShape('models/board.glb').src })

  const levelBar = createScreenBar(entity, {
    position: Vector3.create(0, 2.9, 0),
    scale: Vector3.create(1.8, 0.15, 1),
    value: 1
  })

  // Club thumbnail (images/<golfclubId>.png). These are fully opaque artwork
  // cards (a purple background is part of the image — no alpha channel at all),
  // so no transparency here. SDK6 lit them with emissiveColor White at intensity
  // 2; under bevy that washed the purple out to bright pink, so render them
  // plain.
  const thumbnail = addEntity()
  Transform.create(thumbnail, {
    parent: entity,
    position: Vector3.create(-0.8, 2.5, 0),
    scale: Vector3.create(1.4, 1.4, 1)
  })
  MeshRenderer.setPlane(thumbnail)
  const setThumbnail = (golfclubId: string | number) => {
    const texture = Material.Texture.Common({ src: getTexture(`images/${golfclubId}.png`).src })
    Material.setPbrMaterial(thumbnail, { texture, roughness: 1, metallic: 0 })
  }
  setThumbnail(golfclubCollection[state.currentGolfClub].golfclubId)

  const arrowLeft = addEntity()
  Transform.create(arrowLeft, {
    parent: entity,
    position: Vector3.create(-1.8, 2.35, 0),
    scale: Vector3.create(0.5, 0.5, 0.5)
  })
  setSpritePlane(arrowLeft, 'images/arrow-left.png')

  const arrowRight = addEntity()
  Transform.create(arrowRight, {
    parent: entity,
    position: Vector3.create(1.8, 2.35, 0),
    scale: Vector3.create(0.5, 0.5, 0.5)
  })
  setSpritePlane(arrowRight, 'images/arrow-right.png')

  // The static labels strip (LEVEL / POWER / CONTROL / AIM).
  const attributes = addEntity()
  Transform.create(attributes, {
    parent: entity,
    position: Vector3.create(0.35, 2.65, 0),
    scale: Vector3.create(1, 1.1, 1)
  })
  setSpritePlane(attributes, 'images/attributes.png')

  const attributesText = addEntity()
  Transform.create(attributesText, { parent: entity, position: Vector3.create(0.9, 3.23, 0) })
  TextShape.create(attributesText, {
    text: attributesTextFor(golfclubCollection[state.currentGolfClub]),
    lineCount: 6,
    textAlign: TextAlignMode.TAM_TOP_LEFT,
    fontSize: 2
  })

  const selectButton = addEntity()
  Transform.create(selectButton, {
    parent: entity,
    position: Vector3.create(-0.8, 1.5, -0.01),
    scale: Vector3.create(1, 0.4, 1)
  })
  setSpritePlane(selectButton, 'images/select.png')
  const selectHandler = createHandlerFrom(
    selectButton,
    state,
    () => {
      reproduceAvatarSound('ui_club_select')
      state.activeGolfClubTokenId = state.golfclubCollection[state.currentGolfClub].tokenId
      callbacks.onSelect && callbacks.onSelect({ golfclub: state.golfclubCollection[state.currentGolfClub] })
    },
    { hoverText: 'Select this golfclub for playing' }
  )

  // Shown in place of "select" when this club is already the active one.
  const activeButton = addEntity()
  Transform.create(activeButton, {
    parent: entity,
    position: Vector3.create(-0.8, 1.5, -0.01),
    scale: Vector3.create(1, 0.4, 1)
  })
  setSpritePlane(activeButton, 'images/active.png')

  const materialCost = createScreenIconWithValue(entity, {
    position: Vector3.create(0.45, 1.85, -0.01),
    value: 1,
    // SDK6 passed 'images/screen-icon-WD.png' here; only the lowercase file is
    // committed, and setIcon() always lowercases anyway.
    src: 'images/screen-icon-wd.png'
  })
  materialCost.hide()

  const confirmButton = addEntity()
  Transform.create(confirmButton, {
    parent: entity,
    position: Vector3.create(0.8, 1.5, -0.01),
    scale: Vector3.create(1, 0.3, 1)
  })
  setSpritePlane(confirmButton, 'images/confirm.png')
  const confirmHandler = createHandlerFrom(
    confirmButton,
    state,
    () => {
      callbacks.onUpgrade &&
        callbacks.onUpgrade({
          attribute: state.upgradingAttribute,
          ItemInstanceId: state.golfclubCollection[state.currentGolfClub].ItemInstanceId
        })
    },
    { hoverText: 'Confirm upgrade' }
  )

  const mintButton = addEntity()
  Transform.create(mintButton, {
    parent: entity,
    position: Vector3.create(0.8, 1.5, -0.01),
    scale: Vector3.create(1, 0.3, 1)
  })
  setSpritePlane(mintButton, 'images/mint.png')
  const mintHandler = createHandlerFrom(
    mintButton,
    state,
    () => {
      state.loading = true
      callbacks.onMint && callbacks.onMint()
      updateViewFromState()
    },
    { hoverText: 'Mint golf club' }
  )

  // "Not enough materials" badge, shown where confirm would be.
  const insufficient = addEntity()
  Transform.create(insufficient, {
    parent: entity,
    position: Vector3.create(0.8, 1.5, 0),
    scale: Vector3.create(1, 0.3, 1)
  })
  setSpritePlane(insufficient, 'images/insufficient.png')

  const loading = addEntity()
  Transform.create(loading, {
    parent: entity,
    position: Vector3.create(0, 1.5, 0),
    scale: Vector3.create(1, 0.5, 1)
  })
  setSpritePlane(loading, 'images/loading.png')

  // Big invisible box over the whole screen: E cycles left, F cycles right.
  // SDK6 read event.buttonId (1=E, 2=F) inside a single OnPointerDown.
  //
  // SDK7 gotcha: pointerEventsSystem.onPointerDown is keyed BY ENTITY, so
  // registering it twice on this box (once per InputAction) silently replaced the
  // first handler and only F worked. Declare both buttons on the PointerEvents
  // component (that's what draws the hover hints) and poll them in a system
  // instead.
  const handler = addEntity()
  Transform.create(handler, {
    parent: entity,
    // SDK6 centred this box on the screen plane (z:0), which left only ~5mm
    // between its front face and the small [+] click boxes. Push it just behind
    // the plane so the buttons always win the raycast; board.glb has no collider
    // meshes, so nothing occludes it and E/F still register anywhere on the
    // screen that isn't a button.
    position: Vector3.create(0, 2.3, 0.06),
    scale: Vector3.create(4, 2.9, 0.08)
  })
  // Collider only (SDK6 used an alpha-0 BoxShape; SDK7 needs no renderer).
  MeshCollider.setBox(handler, ColliderLayer.CL_POINTER)
  PointerEvents.create(handler, {
    pointerEvents: [
      {
        eventType: PointerEventType.PET_DOWN,
        eventInfo: { button: InputAction.IA_PRIMARY, hoverText: 'Previous golf club' }
      },
      {
        eventType: PointerEventType.PET_DOWN,
        eventInfo: { button: InputAction.IA_SECONDARY, hoverText: 'Next golf club' }
      }
    ]
  })
  const browseSystem = () => {
    if (state.loading) return
    if (inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN, handler)) {
      goLeft()
      updateViewFromState()
    } else if (inputSystem.isTriggered(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN, handler)) {
      goRight()
      updateViewFromState()
    }
  }
  engine.addSystem(browseSystem)

  const addPower = createAttributeUpdateButton(entity, { position: Vector3.create(1.2, 2.65, -0.01) })
  const addControl = createAttributeUpdateButton(entity, { position: Vector3.create(1.2, 2.44, -0.01) })
  const addAim = createAttributeUpdateButton(entity, { position: Vector3.create(1.2, 2.22, -0.01) })

  const selectAttribute = (attribute: 'power' | 'control' | 'aim') => {
    reproduceAvatarSound(`ui_club_inc_${attribute}`)
    state.upgradingAttribute = attribute
    addPower.setState({ value: attribute === 'power' })
    addControl.setState({ value: attribute === 'control' })
    addAim.setState({ value: attribute === 'aim' })
    updateViewFromState()
  }
  addPower.onClick(() => selectAttribute('power'))
  addControl.onClick(() => selectAttribute('control'))
  addAim.onClick(() => selectAttribute('aim'))

  updateViewFromState()

  function attributesTextFor(club: BoardGolfclub) {
    return `${getLevelFromAttributes(club.attributes)}\n\n${club.attributes.power}\n${club.attributes.control}\n${
      club.attributes.aim
    }\n${club.DisplayName || ''}`
  }

  function getLevelFromAttributes(attributes: { [key: string]: number }) {
    return Object.keys(attributes).reduce((acc: number, key: string) => acc + attributes[key], 1)
  }

  function clearSelectedAttribute() {
    state.upgradingAttribute = null
    addPower.setState({ value: false })
    addControl.setState({ value: false })
    addAim.setState({ value: false })
  }

  function goLeft() {
    reproduceAvatarSound('ui_club_previous')
    if (state.currentGolfClub) {
      state.currentGolfClub--
      clearSelectedAttribute()
    }
  }

  function goRight() {
    reproduceAvatarSound('ui_club_next')
    if (state.currentGolfClub < state.golfclubCollection.length - 1) {
      state.currentGolfClub++
      clearSelectedAttribute()
    }
  }

  function setVisible(e: Entity, visible: boolean) {
    VisibilityComponent.createOrReplace(e, { visible })
  }

  function getMaterialCost() {
    return UPGRADE_COSTS[state.golfclubCollection[state.currentGolfClub].attributes[state.upgradingAttribute]]
  }

  function updateViewFromState() {
    const currentGolfClub = state.golfclubCollection[state.currentGolfClub]
    const text = TextShape.getMutableOrNull(attributesText)
    if (text) text.text = attributesTextFor(currentGolfClub)

    setVisible(arrowLeft, !!state.currentGolfClub)
    setVisible(arrowRight, state.currentGolfClub < state.golfclubCollection.length - 1)
    setVisible(loading, state.loading)

    const isActive =
      state.activeGolfClubTokenId === currentGolfClub.tokenId ||
      (foundGolfclubIndex === -1 && state.currentGolfClub === indexOfStandard)
    setVisible(activeButton, isActive && !state.loading)
    setVisible(selectButton, !isActive && !state.loading)
    selectHandler.enable(!isActive && !state.loading)

    const xpLevel = getLevelInfo(currentGolfClub.xp).currentLevel
    const attributesLevel = getLevelFromAttributes(currentGolfClub.attributes)
    const upgradeAvailable = !!currentGolfClub.xp && xpLevel > attributesLevel && attributesLevel < 16
    // eslint-disable-next-line eqeqeq
    const mintAvailable =
      !currentGolfClub.minting && !!currentGolfClub.xp && attributesLevel === 16 && currentGolfClub.golfclubId == 1

    setVisible(mintButton, mintAvailable && !state.loading)
    mintHandler.enable(mintAvailable && !state.loading)

    addPower.setState({
      visible: !(state.loading || !upgradeAvailable || currentGolfClub.attributes.power >= 5),
      value: state.upgradingAttribute === 'power'
    })
    addControl.setState({
      visible: !(state.loading || !upgradeAvailable || currentGolfClub.attributes.control >= 5),
      value: state.upgradingAttribute === 'control'
    })
    addAim.setState({
      visible: !(state.loading || !upgradeAvailable || currentGolfClub.attributes.aim >= 5),
      value: state.upgradingAttribute === 'aim'
    })

    // SDK6 read the material balance from globalStore.userData (the PlayFab
    // UserVirtualCurrency spread into it). In this migration those live in the
    // lobby HUD state, populated by bootstrap:applyCombinedInfoToHud.
    const balance = state.upgradingAttribute
      ? (lobbyHudState.resources as any)[UPGRADE_MATERIALS[state.upgradingAttribute]] || 0
      : 0
    const enoughMaterials = balance >= getMaterialCost()

    const showConfirm = !state.loading && !!state.upgradingAttribute && enoughMaterials
    setVisible(confirmButton, showConfirm)
    confirmHandler.enable(showConfirm)
    setVisible(insufficient, !state.loading && !!state.upgradingAttribute && !enoughMaterials)

    setThumbnail(currentGolfClub.golfclubId)

    levelBar.setValue(upgradeAvailable ? 1 : getLevelInfo(currentGolfClub.xp).progressPercentage / 100)

    if (state.upgradingAttribute && upgradeAvailable) {
      const material = UPGRADE_MATERIALS[state.upgradingAttribute]
      materialCost.setIcon(`images/screen-icon-${material.toLowerCase()}.png`)
      materialCost.updateValue(UPGRADE_COSTS[currentGolfClub.attributes[state.upgradingAttribute]])
      materialCost.show()
    } else if (mintAvailable) {
      materialCost.updateValue(120)
      materialCost.setIcon('images/screen-icon-dm.png')
      materialCost.show()
    } else {
      materialCost.hide()
    }
  }

  return {
    updateState: (newState: any) => {
      Object.assign(state, newState)
      updateViewFromState()
    },
    onSelect: (fn: (data: { golfclub: BoardGolfclub }) => void) => {
      callbacks.onSelect = fn
    },
    onUpgrade: (fn: (data: { attribute: string; ItemInstanceId?: string }) => void) => {
      callbacks.onUpgrade = fn
    },
    onMint: (fn: () => void) => {
      callbacks.onMint = fn
    },
    dispose: () => {
      engine.removeSystem(browseSystem)
      selectHandler.dispose()
      confirmHandler.dispose()
      mintHandler.dispose()
      addPower.dispose()
      addControl.dispose()
      addAim.dispose()
      levelBar.dispose()
      materialCost.dispose()
      for (const e of ownedEntities) engine.removeEntity(e)
      ownedEntities.length = 0
    }
  }
}
