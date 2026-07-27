// @ts-ignore
import { cloneJSON } from '../../../../common/utils'
import { EVENT, GameplayHandler } from './handler-def'

export const voxtersHandler: GameplayHandler = (world: any, gameEvents: any, gameplay: any) => {
  const { courseDefinition, ballBody, state } = gameplay
  const voxters = courseDefinition.parts.filter((p: any) => p.type === 'voxter')
  const voxtersState: { collidedIndexes: number[] } = { collidedIndexes: [] }
  const backupState = cloneJSON(voxtersState)
  return {
    update,
    onEvent,
    enable: (_value: any) => {},
    saveState: () => {
      Object.assign(backupState, cloneJSON(voxtersState))
    },
    restoreState: () => {
      Object.assign(voxtersState, cloneJSON(backupState))
    }
  }

  function onEvent(fn: Function) {
    gameEvents.onEvent(EVENT.VOXTER, fn)
  }

  function update(_dt: number) {
    if (state.idle || state.finished) return

    const collision = voxters.reduce((acc: any, voxter: any, index: number) => {
      if (acc) return acc
      if (voxtersState.collidedIndexes.indexOf(index) !== -1) return acc
      const [x2, y2, z2] = voxter.position
      const { x, y, z } = ballBody.position
      const distance = Math.pow(Math.pow(x2 - x, 2) / 2 + Math.pow(y2 - y, 2) / 2 + Math.pow(z2 - z, 2), 0.5)
      if (distance < 0.4) {
        return { voxter, index }
      }
      return acc
    }, undefined as any)

    if (collision) {
      voxtersState.collidedIndexes.push(collision.index)
      gameEvents.trigger({
        type: EVENT.VOXTER,
        data: {
          index: collision.index,
          hit: voxtersState.collidedIndexes.length,
          isLast: voxtersState.collidedIndexes.length === voxters.length
        }
      })
    }
  }
}
