// cannon 0.6.2 ships no types. Same loose shim as scene/src/types/cannon.d.ts,
// so the shared physics code (scene/golfplay/physics) type-checks unchanged.
// Kept outside src/: the Studio build auto-imports every src/**/*.ts file.
declare module 'cannon' {
  namespace CANNON {
    type Material = any
    type Body = any
    type World = any
    type Vec3 = any
    type Sphere = any
    type Box = any
    type Quaternion = any
    type Trimesh = any
    type ContactMaterial = any
    type SAPBroadphase = any
    type GSSolver = any
  }
  const CANNON: any
  export default CANNON
  export = CANNON
}
