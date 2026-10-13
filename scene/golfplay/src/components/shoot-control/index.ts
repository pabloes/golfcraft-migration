import { engine, Entity, inputSystem, InputAction, PointerEventType } from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import * as utils from '@dcl-sdk/utils'
import { createShootControlVisual } from './shoot-control-visual'
import { CAMERA_AIM_MODE } from '../../../../src/config/controls'
import { isMobile } from '../../../../src/services/platform'
import { mobileShootState } from '../../../../src/ui/mobile-shoot-state'
import { createControlHint } from './bottom-panel'
// @ts-ignore - createState is plain TS, no SDK contact
import { createState } from '../../../../state'
// @ts-ignore - common/utils has @ts-nocheck
import { getRandom } from '../../../../../common/utils'
import { SHOOT_IMPULSE } from '../../../../../common/physics-config'

type Vec3 = Vector3.MutableVector3
type Quat = Quaternion.MutableQuaternion

type CreateShootControlOptions = {
  position: Vec3
  rotation: Quat
  golfclub: {
    power: number
    control: number
    aim: number
    id: string | number
  }
  hideGolfclub?: boolean
  currentGame?: any
  // CAMERA_AIM_MODE: the orbit camera's heading, in degrees. When given, it is
  // the aim.
  getAimYaw?: () => number
}

type ShootControlState = {
  _id: number
  rotation: number
  modifiedRotation: number
  power: number
  step: 0 | 1 | 2
  ePressed: boolean
  fPressed: boolean
  n3Pressed: boolean
  n4Pressed: boolean
  visible: boolean
  timePressed: number
  VELOCITY: number
}

type UpdateEffectDefinition = {
  condition: (state: ShootControlState) => boolean
  effect: (state: ShootControlState, dt?: number) => any
}

const controlHint = createControlHint()
const MIN_VELOCITY = 0.5
const MAX_VELOCITY = 4
const START_OF_DEVIANCE_BY_POWER = 40
export const MAX_DEGREES_DEVIANCE = 2

export const devianceFactorLevels = [1, 0.8, 0.6, 0.4, 0.2, 0]
export const maxPowerByGolfclubLevel = [60, 70, 80, 90, 95, 100]
export const aimLengths = [0, 20, 40, 60, 80, 100]

const createShootControl = (
  parent: Entity,
  { position, rotation, golfclub, hideGolfclub, currentGame, getAimYaw }: CreateShootControlOptions
) => {
  const _innerState = {
    // With the camera doing the aiming there is no manual rotation step, which
    // is exactly what `rotationEnabled: false` already means everywhere below:
    // every path that would return to step 1 goes to step 2 instead.
    rotationEnabled: !CAMERA_AIM_MODE,
    bottomPanelEnabled: true
  }

  const initialEuler = Quaternion.toEulerAngles(rotation)
  const store = createState({
    _id: Date.now(),
    rotation: initialEuler.y,
    modifiedRotation: initialEuler.y,
    power: 50,
    // Aiming with the camera removes the rotation step, so the control opens
    // straight on power.
    step: CAMERA_AIM_MODE ? 2 : 1,
    ePressed: false,
    fPressed: false,
    n3Pressed: false,
    n4Pressed: false,
    visible: true,
    timePressed: 0,
    VELOCITY: MIN_VELOCITY
  })
  const state = store.getState() as ShootControlState

  const callbacks: {
    onShoot: ((data: { impulse: Vec3; delayMs: number }) => void) | null
    onFinishShootAnimation: (() => void) | null
  } = {
    onShoot: null,
    onFinishShootAnimation: null
  }

  const showBottomPanel = () => {
    if (_innerState.bottomPanelEnabled) controlHint.show()
  }

  const control = createShootControlVisual(parent, {
    position,
    rotation,
    aimLength: aimLengths[golfclub?.aim || 0],
    golfClubId: golfclub.id,
    hideGolfclub
  })
  control.setPower(state.power)
  showBottomPanel()
  controlHint.setStep(0)
  // Mobile touch panel (src/ui/mobile-shoot-controls.tsx): its SHOOT button
  // takes the place of the click, which on a phone is any touch.
  mobileShootState.shoot = () => onMouseDown()
  let mobileHoldActive = false

  const unsubscribeStoreChange = store.onChange(() => {
    const s = store.getState() as ShootControlState
    mobileShootState.visible = s.visible
    mobileShootState.power = s.power
    if (!s.visible) {
      mobileShootState.aimHold = 0
      mobileShootState.powerHold = 0
    }
    control.setAngle(s.modifiedRotation)
    control.setPower(s.power)
    if (s.visible) {
      control.show()
      showBottomPanel()
      if (s.step === 1) {
        controlHint.setStep(0)
        control.modeRotation()
      } else if (s.step === 2) {
        controlHint.setStep(1)
        control.modePower()
      }
    } else {
      control.hide()
      controlHint.hide()
    }
  })

  const updateEffects: UpdateEffectDefinition[] = [
    {
      condition: (s) => !s.ePressed && !s.fPressed,
      effect: () => {
        state.VELOCITY = MIN_VELOCITY
        return {}
      }
    },
    {
      condition: (s) => s.step === 1 && s.ePressed && !s.fPressed,
      effect: (s) => ({ rotation: s.rotation - s.VELOCITY })
    },
    {
      condition: (s) => s.step === 1 && !s.ePressed && s.fPressed,
      effect: (s) => ({ rotation: s.rotation + s.VELOCITY })
    },
    {
      condition: (s) => s.step === 2 && s.ePressed && !s.fPressed,
      effect: (s) => ({
        power: Math.min(maxPowerByGolfclubLevel[golfclub?.power || 0], s.power + s.VELOCITY * 1.5)
      })
    },
    {
      condition: (s) => s.step === 2 && !s.ePressed && s.fPressed,
      effect: (s) => ({ power: Math.max(0, s.power - s.VELOCITY * 1.5) })
    },
    {
      condition: (s) => s.step === 2 && s.ePressed && s.fPressed,
      effect: (s) => {
        if (!_innerState.rotationEnabled) return {}
        return { step: 1 }
      }
    }
  ]

  const update = (dt: number) => {
    const s = store.getState() as ShootControlState

    // CAMERA_AIM_MODE: the aim is the orbit camera's heading (golfplay/src/
    // components/orbit-camera.ts), which also keeps the avatar still. The idea
    // comes from SDK6's unshipped shoot-control/index-camera-version.ts, which
    // had to drag the player to the ball with movePlayerTo every frame.
    if (getAimYaw && s.visible) state.rotation = getAimYaw()

    // E/F key polling: SDK6 used Input.subscribe; SDK7 uses inputSystem polled
    // each frame via this system.
    const eDown = inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)
    const eUp = inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_UP)
    const fDown = inputSystem.isTriggered(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN)
    const fUp = inputSystem.isTriggered(InputAction.IA_SECONDARY, PointerEventType.PET_UP)
    const click = inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN)

    if (eDown) {
      if (!s.fPressed) state.timePressed = Date.now()
      state.ePressed = true
    }
    if (eUp) {
      if (!s.fPressed) state.timePressed = 0
      state.ePressed = false
    }
    if (fDown) state.fPressed = true
    if (fUp) state.fPressed = false
    if (isMobile()) {
      // A held power button is the held key; releasing it releases the key.
      const hold = mobileShootState.powerHold
      if (hold !== 0) {
        state.ePressed = hold > 0
        state.fPressed = hold < 0
        mobileHoldActive = true
      } else if (mobileHoldActive) {
        state.ePressed = false
        state.fPressed = false
        mobileHoldActive = false
      }
      // Without the orbit camera the arrows turn the shot itself.
      if (!CAMERA_AIM_MODE && mobileShootState.aimHold && s.step === 1) {
        store.setState({ rotation: s.rotation + mobileShootState.aimHold * s.VELOCITY })
      }
    } else if (click) {
      onMouseDown()
    }

    if (XOR(state.ePressed, state.fPressed)) {
      state.VELOCITY = Math.min(MAX_VELOCITY, state.VELOCITY + dt * 2)
    }

    if (state.power > START_OF_DEVIANCE_BY_POWER) {
      const deviance =
        devianceFactorLevels[golfclub.control] *
        ((MAX_DEGREES_DEVIANCE * (state.power - START_OF_DEVIANCE_BY_POWER)) /
          (100 - START_OF_DEVIANCE_BY_POWER))
      state.modifiedRotation = state.rotation + ((deviance && getRandom(-deviance, deviance)) || 0)
    } else {
      state.modifiedRotation = state.rotation
    }

    updateEffects.forEach((effectDefinition) => {
      if (effectDefinition.condition(state)) {
        store.setState(effectDefinition.effect(state, dt))
      }
    })
  }

  engine.addSystem(update)

  function onMouseDown() {
    const s = store.getState() as ShootControlState
    if (s.step === 1) {
      control.idle()
      state.step = 2
      state.ePressed = false
      state.fPressed = false
    } else if (s.step === 2 && s.visible && s.power) {
      const delayMs = 400
      control.shoot()
      if (callbacks.onShoot) callbacks.onShoot({ impulse: getImpulseVectorFromState(s), delayMs })
      if (!hideGolfclub) {
        utils.timers.setTimeout(() => {
          if (callbacks.onFinishShootAnimation) callbacks.onFinishShootAnimation()
          control.idle()
        }, delayMs)
      }
      if (_innerState.rotationEnabled) {
        state.step = 1
      } else {
        state.step = 2
      }
    }
  }

  return {
    enable: () => {},
    disable: () => {},
    show: () => {
      if (_innerState.rotationEnabled) {
        state.step = 1
      } else {
        state.ePressed = false
        state.fPressed = false
        state.step = 2
      }
      state.visible = true
    },
    hide: () => {
      state.visible = false
    },
    disableBottomPanel: () => {
      controlHint.hide()
      _innerState.bottomPanelEnabled = false
    },
    disableRotation: (_disable: boolean) => {
      _innerState.rotationEnabled = !_disable
      if (_innerState.rotationEnabled) {
        store.setState({ step: 1 })
      } else {
        store.setState({ step: 2 })
      }
    },
    setPower: (_power: number) => {
      store.setState({ power: _power })
    },
    dispose: () => {
      if (unsubscribeStoreChange) unsubscribeStoreChange()
      state.visible = false
      callbacks.onShoot = null
      callbacks.onFinishShootAnimation = null
      controlHint.hide()
      mobileShootState.shoot = null
      mobileShootState.visible = false
      mobileShootState.aimHold = 0
      mobileShootState.powerHold = 0
      control.dispose()
      engine.removeSystem(update)
    },
    onShoot: (fn: (data: { impulse: Vec3; delayMs: number }) => void) => {
      callbacks.onShoot = fn
      return () => {
        callbacks.onShoot = null
      }
    },
    setPosition: (newPos: any) => {
      control.setPosition(newPos)
    },
    getEntity: () => control.getEntity(),
    onFinishShootAnimation: (fn: () => void) => {
      callbacks.onFinishShootAnimation = fn
      return () => {
        callbacks.onFinishShootAnimation = null
      }
    }
  }
}

export { createShootControl }

function getImpulseVectorFromState(state: ShootControlState): Vec3 {
  const radians = (state.modifiedRotation * Math.PI) / 180
  const y = 0
  const x = Math.sin(radians) * (state.power / 100) * 2
  const z = Math.cos(radians) * (state.power / 100) * 2
  return Vector3.create(x * SHOOT_IMPULSE, y * SHOOT_IMPULSE, z * SHOOT_IMPULSE)
}

function XOR(a: boolean, b: boolean) {
  return (a && !b) || (!a && b)
}
