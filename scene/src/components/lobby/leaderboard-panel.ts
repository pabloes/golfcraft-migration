// SDK7 port of SDK6 scene/src/components/lobby/training/training-leaderboard-panel.ts.
//
// A `board.glb` on a wall with the top ten of a ranking written over it, and a
// click to refresh. SDK6 had two of these in the lobby, wired in
// lobby-training.ts: "Season ranking" (the `tier-sub-max` statistic) and "Days
// connected" (`connected-days`). Neither was migrated at the SDK7 cutover; the
// user asked for them back (2026-11-07) plus a rolling 24 hour one.
//
// SDK6's table (scene/TextShapeTable) is ONE multi-line TextShape per column,
// the rows joined with "\n", left column left-aligned at the table's x and
// right column right-aligned at its total width. That is what this does, so
// each board is 3 entities and not 22, and the title is simply the first line
// of the left column, exactly as SDK6 passed it in as `[title, ""]`.
import {
  ColliderLayer,
  Entity,
  Font,
  GltfContainer,
  InputAction,
  TextAlignMode,
  TextShape,
  Transform,
  engine,
  pointerEventsSystem
} from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'

import { LeaderboardRow } from '../../services/leaderboards'

// SDK6: createTextShapeTable at local (-1.8, 3.6, 0) with columns of width
// 3.45 (left) and 0.3 (right), so the values sit at 3.75 - 1.8 = 1.95.
const TABLE = { x: -1.8, y: 3.6, right: 1.95 }
const FONT_SIZE = 2
// SDK6: new Color3(1, 1, 0.5).
const TEXT_COLOR = Color4.create(1, 1, 0.5, 1)
const BOARD_MODEL = 'models/board.glb'
// SDK6 guarded the click with `lastTimeRefresh + 1000 > Date.now()`.
const CLICK_GUARD_MS = 1000
// SDK6 refreshed only at creation and on click, so a board nobody touched
// could sit on hours-old rows. The 24 h one would be wrong rather than stale,
// so every board also refreshes itself on a slow timer.
const AUTO_REFRESH_MS = 120000
const ROWS = 10

export type LeaderboardPanelOptions = {
  position: Vector3
  rotation: Quaternion
  title: string
  // What to show: the panel knows nothing about where the rows come from.
  load: () => Promise<LeaderboardRow[]>
  // Printed to the right of each name. The raw number by default.
  format?: (value: number) => string
  // The signed-in player, so their own row replaces the tenth when they are
  // outside the top ten (SDK6 sliceLimitAndPutOwn).
  own?: () => { playFabId: string; name: string; value: number } | null
}

export const createLeaderboardPanel = (parent: Entity, opts: LeaderboardPanelOptions) => {
  const owned: Entity[] = []
  const add = (): Entity => {
    const entity = engine.addEntity()
    owned.push(entity)
    return entity
  }

  const entity = add()
  Transform.create(entity, { parent, position: opts.position, rotation: opts.rotation })

  const board = add()
  Transform.create(board, { parent: entity })
  // A GltfContainer has no collider on its visible meshes in SDK7 and
  // board.glb carries no `*_collider` mesh, so without this the click never
  // happens and the board looks dead (the same trap as the storymode NPC,
  // CLAUDE.md 2.2). Pointer only: it must not stop anyone walking.
  GltfContainer.create(board, { src: BOARD_MODEL, visibleMeshesCollisionMask: ColliderLayer.CL_POINTER })

  const names = add()
  Transform.create(names, { parent: entity, position: Vector3.create(TABLE.x, TABLE.y, 0) })
  TextShape.create(names, {
    text: opts.title,
    font: Font.F_SANS_SERIF,
    fontSize: FONT_SIZE,
    textAlign: TextAlignMode.TAM_TOP_LEFT,
    textColor: TEXT_COLOR
  })

  const values = add()
  Transform.create(values, { parent: entity, position: Vector3.create(TABLE.right, TABLE.y, 0) })
  TextShape.create(values, {
    text: '',
    font: Font.F_SANS_SERIF,
    fontSize: FONT_SIZE,
    textAlign: TextAlignMode.TAM_TOP_RIGHT,
    textColor: TEXT_COLOR
  })

  const format = opts.format || ((value: number) => String(value))

  const draw = (rows: LeaderboardRow[], note?: string) => {
    const nameLines = [opts.title]
    const valueLines = ['']
    for (const row of rows) {
      nameLines.push(`${row.rank} ${row.name}`)
      valueLines.push(format(row.value))
    }
    if (!rows.length) {
      nameLines.push(note || '...')
      valueLines.push('')
    }
    const nameText = TextShape.getMutableOrNull(names)
    if (nameText) nameText.text = nameLines.join('\n')
    const valueText = TextShape.getMutableOrNull(values)
    if (valueText) valueText.text = valueLines.join('\n')
  }

  // SDK6 put the player's own row in the tenth slot when they were below it,
  // with a blank rank, so everyone sees where they stand.
  const withOwnRow = (rows: LeaderboardRow[]): LeaderboardRow[] => {
    const own = opts.own ? opts.own() : null
    if (!own || !own.playFabId) return rows
    if (rows.some((row) => row.playFabId === own.playFabId)) return rows
    if (rows.length < ROWS) return rows
    const last = rows[ROWS - 1]
    if (last.value <= own.value) return rows
    const trimmed = rows.slice(0, ROWS - 1)
    trimmed.push({ rank: 0, name: own.name || 'you', playFabId: own.playFabId, value: own.value })
    return trimmed
  }

  let lastClickAt = 0
  let loading = false
  let disposed = false

  const refresh = async () => {
    if (disposed || loading) return
    loading = true
    try {
      const rows = await opts.load()
      if (disposed) return
      draw(withOwnRow(rows), 'no scores yet')
    } catch (err) {
      console.log('[leaderboard]', opts.title, 'unavailable', err)
      // Keep whatever is on the board rather than blanking it on one failure.
    } finally {
      loading = false
    }
  }

  pointerEventsSystem.onPointerDown(
    { entity: board, opts: { button: InputAction.IA_POINTER, hoverText: 'refresh' } },
    () => {
      if (lastClickAt + CLICK_GUARD_MS > Date.now()) return
      lastClickAt = Date.now()
      refresh()
    }
  )

  let nextAutoAt = Date.now() + AUTO_REFRESH_MS
  const autoRefresh = () => {
    if (Date.now() < nextAutoAt) return
    nextAutoAt = Date.now() + AUTO_REFRESH_MS
    refresh()
  }
  engine.addSystem(autoRefresh)

  draw([], 'loading...')
  refresh()

  return {
    refresh,
    // SDK7 does not cascade engine.removeEntity to children, so every entity
    // this made is removed by hand (CLAUDE.md 6 #11).
    dispose: () => {
      disposed = true
      engine.removeSystem(autoRefresh)
      pointerEventsSystem.removeOnPointerDown(board)
      owned.forEach((e) => engine.removeEntity(e))
      owned.length = 0
    }
  }
}
