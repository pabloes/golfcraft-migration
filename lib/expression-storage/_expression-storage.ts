// Client-side (SDK7 scene) expression evaluation for REACTIVE course parts —
// switches / trigger-zones that hide walls, text, etc. esbuild bundles THIS .ts
// for the scene; the server (ts-node) resolves the sibling _expression-storage.js
// (the full SDK6 jsep build) — see .claude/CLAUDE.md §9 #2.
//
// visual-part.ts uses exactly two functions to decide whether a part is hidden
// (getVariablesFromExpression -> which vars it listens to; evaluateExpression ->
// the hide condition against the variable values the server pushes). They were
// previously stubbed (returned []/undefined), so reactive parts NEVER hid. These
// are now REAL, ported from SDK6 lib/expression-storage/jsep-eval.js but using
// only `jsep` (dropping lodash/assert, which don't load in the sandbox).
//
// createExpressionStorage stays a stub: the server owns the authoritative
// variable storage and streams variable changes to the client, which only needs
// to evaluate each part's hide-condition against those values.
import jsep from 'jsep'

const BINARY: Record<string, (a: any, b: any) => any> = {
  '===': (a, b) => a === b,
  '!==': (a, b) => a !== b,
  '==': (a, b) => a == b, // eslint-disable-line eqeqeq
  '!=': (a, b) => a != b, // eslint-disable-line eqeqeq
  '>': (a, b) => a > b,
  '<': (a, b) => a < b,
  '>=': (a, b) => a >= b,
  '<=': (a, b) => a <= b,
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '*': (a, b) => a * b,
  '/': (a, b) => a / b,
  '%': (a, b) => a % b,
  '**': (a, b) => a ** b,
  '&': (a, b) => a & b,
  '|': (a, b) => a | b,
  '^': (a, b) => a ^ b,
  '<<': (a, b) => a << b,
  '>>': (a, b) => a >> b,
  '>>>': (a, b) => a >>> b,
  '||': (a, b) => a || b,
  '&&': (a, b) => a && b
}

const UNARY: Record<string, (a: any) => any> = {
  '!': (a) => !a,
  '~': (a) => ~a,
  '+': (a) => +a,
  '-': (a) => -a
}

const evalNode = (node: any, ctx: any): any => {
  if (!node) return undefined
  switch (node.type) {
    case 'Literal':
      return node.value
    case 'Identifier':
      return ctx ? ctx[node.name] : undefined
    case 'ThisExpression':
      return ctx
    case 'UnaryExpression': {
      const f = UNARY[node.operator]
      return f ? f(evalNode(node.argument, ctx)) : undefined
    }
    case 'BinaryExpression':
    case 'LogicalExpression': {
      const f = BINARY[node.operator]
      return f ? f(evalNode(node.left, ctx), evalNode(node.right, ctx)) : undefined
    }
    case 'ConditionalExpression':
      return evalNode(node.test, ctx) ? evalNode(node.consequent, ctx) : evalNode(node.alternate, ctx)
    case 'MemberExpression': {
      const obj = evalNode(node.object, ctx)
      if (obj == null) return undefined
      const prop = node.computed ? evalNode(node.property, ctx) : node.property.name
      return obj[prop]
    }
    case 'ArrayExpression':
      return (node.elements || []).map((e: any) => evalNode(e, ctx))
    case 'CallExpression': {
      const callee = evalNode(node.callee, ctx)
      const args = (node.arguments || []).map((a: any) => evalNode(a, ctx))
      return typeof callee === 'function' ? callee.apply(null, args) : undefined
    }
    case 'Compound': {
      let r: any
      for (const el of node.body || []) r = evalNode(el, ctx)
      return r
    }
    default:
      return undefined
  }
}

const getVariablesFromExpression = (expression: string): string[] => {
  if (!expression) return []
  const vars: string[] = []
  const walk = (node: any) => {
    if (!node) return
    switch (node.type) {
      case 'Identifier':
        vars.push(node.name)
        break
      case 'MemberExpression':
        walk(node.object)
        if (node.computed) walk(node.property)
        break
      case 'UnaryExpression':
        walk(node.argument)
        break
      case 'BinaryExpression':
      case 'LogicalExpression':
        walk(node.left)
        walk(node.right)
        break
      case 'ConditionalExpression':
        walk(node.test)
        walk(node.consequent)
        walk(node.alternate)
        break
      case 'CallExpression':
        walk(node.callee)
        ;(node.arguments || []).forEach(walk)
        break
      case 'ArrayExpression':
        ;(node.elements || []).forEach(walk)
        break
      case 'Compound':
        ;(node.body || []).forEach(walk)
        break
    }
  }
  try {
    walk(jsep(expression))
  } catch (_) {
    // unparseable expression -> listens to nothing
  }
  return vars
}

const evaluateExpression = (expression: string, state: any): any => {
  if (!expression) return undefined
  try {
    return evalNode(jsep(expression), state || {})
  } catch (_) {
    return undefined
  }
}

// Stub — see header. The client never runs the authoritative storage.
const createExpressionStorage = (initialState: any = {}, _initialAssignments?: any) => {
  const state: { [key: string]: any } = { ...initialState }
  const eventCallbacks: Array<(event: any) => void> = []
  const controls: { [id: string]: any } = {}

  return {
    getState: () => state,
    setValue: (key: string, value: any) => {
      state[key] = value
      eventCallbacks.forEach((cb) => cb({ type: 'EVENT_VARIABLE_CHANGE', data: { key, value, targetControlIds: [] } }))
    },
    addControl: ({ id, runtime }: { id: string; runtime: any }) => {
      const control = {
        id,
        runtime,
        evaluate: (_prop?: string) => false,
        setValue: (value: any) => {
          state[id] = value
          eventCallbacks.forEach((cb) =>
            cb({ type: 'EVENT_VARIABLE_CHANGE', data: { targetControlIds: [id], value } })
          )
        }
      }
      controls[id] = control
      return control
    },
    addRuntimeAssignment: (_assignment: { storage: string; [key: string]: any }) => {},
    onEvent: (cb: (event: any) => void) => {
      eventCallbacks.push(cb)
      return () => {
        const idx = eventCallbacks.indexOf(cb)
        if (idx !== -1) eventCallbacks.splice(idx, 1)
      }
    }
  }
}

export default {
  getVariablesFromExpression,
  evaluateExpression,
  createExpressionStorage
}
