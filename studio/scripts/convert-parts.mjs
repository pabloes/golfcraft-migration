#!/usr/bin/env node
/**
 * Packs the Decentraland client's course part models (gltf + bin + textures)
 * into single binary GLBs for the Studio project.
 *
 *   node scripts/convert-parts.mjs <name> [<name> ...]   one or more parts
 *   node scripts/convert-parts.mjs --all                 every part
 *
 * Source: ../scene/golfplay/models/<name>.gltf (read-only, shared with the scene).
 * Output: assets/parts/<name>.glb, loaded as `@project/assets/parts/<name>.glb`.
 * External buffers and images are embedded; geometry and materials are unchanged.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const STUDIO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = path.resolve(STUDIO_ROOT, '../scene/golfplay/models');
const OUT_DIR = path.join(STUDIO_ROOT, 'assets/parts');

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('usage: node scripts/convert-parts.mjs <name> [<name> ...] | --all');
  process.exit(1);
}

const names = args.includes('--all')
  ? fs.readdirSync(SOURCE_DIR).filter((f) => f.endsWith('.gltf')).map((f) => f.slice(0, -'.gltf'.length))
  : args.map((a) => a.replace(/\.gltf$/, ''));

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
fs.mkdirSync(OUT_DIR, { recursive: true });

let failed = 0;
for (const name of names) {
  const src = path.join(SOURCE_DIR, `${name}.gltf`);
  const out = path.join(OUT_DIR, `${name}.glb`);
  try {
    const doc = await io.read(src);
    // The Blender exports carry an extra empty scene ("Ball"). The source omits
    // its `nodes`, but the writer emits `nodes: []`, which fails validation.
    const root = doc.getRoot();
    for (const scene of root.listScenes()) {
      if (scene !== root.getDefaultScene() && scene.listChildren().length === 0) scene.dispose();
    }
    const glb = await io.writeBinary(doc);
    fs.writeFileSync(out, glb);
    console.log(`ok   ${name} -> ${path.relative(STUDIO_ROOT, out)} (${glb.byteLength} bytes)`);
  } catch (err) {
    failed++;
    console.error(`FAIL ${name}: ${err instanceof Error ? err.message : err}`);
  }
}

console.log(`${names.length - failed}/${names.length} converted`);
process.exit(failed ? 1 : 0);
