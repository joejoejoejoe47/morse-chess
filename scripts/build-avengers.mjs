/**
 * Assemble real LDraw minifigs (CC BY 4.0, LDraw.org parts library) into the
 * named body/head/arm/leg groups the Brick Verse board already animates.
 */
import fs from "fs";
import * as THREE from "three";
import { LDrawLoader } from "three/examples/jsm/loaders/LDrawLoader.js";
import { LDrawConditionalLineMaterial } from "three/examples/jsm/materials/LDrawConditionalLineMaterial.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = class FileReader {
    constructor() {
      this.result = null;
      this.onloadend = null;
    }
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buf) => {
        this.result = buf;
        if (this.onloadend) this.onloadend();
      });
    }
  };
}

if (typeof globalThis.ProgressEvent === "undefined") {
  globalThis.ProgressEvent = class ProgressEvent extends Event {
    constructor(type, init = {}) {
      super(type);
      this.lengthComputable = !!init.lengthComputable;
      this.loaded = init.loaded || 0;
      this.total = init.total || 0;
    }
  };
}

const LIB = "file:///tmp/ldraw/ldraw/";

globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  let path = url;
  if (path.startsWith("file://")) path = decodeURIComponent(new URL(path).pathname);
  if (path.startsWith("/")) {
    const buf = fs.readFileSync(path);
    return new Response(buf);
  }
  throw new Error("unexpected fetch " + url);
};

const ARM_R = "-15.552 9 0 0.985 -0.17 0 0.17 0.985 0 0 0 1";
const ARM_L = "15.552 9 0 0.985 0.17 0 -0.17 0.985 0 0 0 1";
const HAND_R = "-23.69 26.774 -9.898 0.985 -0.12 0.12 0.17 0.696 -0.696 0 0.707 0.707";
const HAND_L = "23.69 26.774 -9.898 0.985 0.12 -0.12 -0.17 0.696 -0.696 0 0.707 0.707";

function line(color, xform, file) {
  return `1 ${color} ${xform} ${file}`;
}

/** A standing minifig. Each entry is lines that belong to that joint group. */
function fig(parts) {
  return parts;
}

const RED = 4;
const BLACK = 0;
const DBLE = 272; // dark blue
const DBG = 72; // dark bluish grey
const YEL = 14;
const BLONDE = 226;
const BROWN = 308;
const NOUGAT = 78;
const PURPLE = 22;
const SILVER = 80;
const PEARL = 179;
const WHITE = 15;
const GOLD = 28; // dark tan as a warm metal stand-in if needed

const figs = {
  // Endgame Ant-Man: official helmet 46534pb1 (set 76124, MagFors, CC BY 4.0)
  antman: fig({
    body: [line(320, "0 0 0 1 0 0 0 1 0 0 0 1", "973.dat"), line(320, "0 30 0 1 0 0 0 1 0 0 0 1", "3815b.dat")],
    head: [
      line(NOUGAT, "0 -24 0 1 0 0 0 1 0 0 0 1", "3626b.dat"),
      line(PEARL, "0 -24 0 1 0 0 0 1 0 0 0 1", "46534pb1.dat"),
    ],
    armL: [line(320, ARM_L, "3819.dat"), line(PEARL, HAND_L, "3820.dat")],
    armR: [line(320, ARM_R, "3818.dat"), line(PEARL, HAND_R, "3820.dat")],
    legL: [line(320, "0 42 0 1 0 0 0 1 0 0 0 1", "3817c.dat")],
    legR: [line(320, "0 42 0 1 0 0 0 1 0 0 0 1", "3816c.dat")],
  }),
  // Thor: Mjolnir is the official sledgehammer part 75904 (keywords Thor, Mjolnir, Asgard)
  thor: fig({
    body: [
      line(DBLE, "0 0 0 1 0 0 0 1 0 0 0 1", "973.dat"),
      line(DBLE, "0 30 0 1 0 0 0 1 0 0 0 1", "3815b.dat"),
      line(RED, "0 0 0 1 0 0 0 1 0 0 0 1", "4524.dat"),
    ],
    head: [
      line(NOUGAT, "0 -24 0 1 0 0 0 1 0 0 0 1", "3626b.dat"),
      line(BLONDE, "0 -24 0 1 0 0 0 1 0 0 0 1", "21268.dat"),
    ],
    armL: [line(DBLE, ARM_L, "3819.dat"), line(NOUGAT, HAND_L, "3820.dat")],
    armR: [
      line(DBLE, ARM_R, "3818.dat"),
      line(NOUGAT, HAND_R, "3820.dat"),
      line(SILVER, HAND_R, "75904.dat"),
    ],
    legL: [line(DBLE, "0 42 0 1 0 0 0 1 0 0 0 1", "3817c.dat")],
    legR: [line(DBLE, "0 42 0 1 0 0 0 1 0 0 0 1", "3816c.dat")],
  }),
  // Bucky: one silver arm, dark hair, stubble head print 3626cp72
  bucky: fig({
    body: [line(DBLE, "0 0 0 1 0 0 0 1 0 0 0 1", "973.dat"), line(BLACK, "0 30 0 1 0 0 0 1 0 0 0 1", "3815b.dat")],
    head: [
      line(NOUGAT, "0 -24 0 1 0 0 0 1 0 0 0 1", "3626cp72.dat"),
      line(BROWN, "0 -24 0 1 0 0 0 1 0 0 0 1", "3901.dat"),
    ],
    armL: [line(SILVER, ARM_L, "3819.dat"), line(SILVER, HAND_L, "3820.dat")],
    armR: [line(DBLE, ARM_R, "3818.dat"), line(NOUGAT, HAND_R, "3820.dat")],
    legL: [line(BLACK, "0 42 0 1 0 0 0 1 0 0 0 1", "3817c.dat")],
    legR: [line(BLACK, "0 42 0 1 0 0 0 1 0 0 0 1", "3816c.dat")],
  }),
  // Hawkeye: official minifig bow 95051 and quiver 4498
  hawkeye: fig({
    body: [
      line(PURPLE, "0 0 0 1 0 0 0 1 0 0 0 1", "973.dat"),
      line(BLACK, "0 30 0 1 0 0 0 1 0 0 0 1", "3815b.dat"),
      line(BROWN, "0 6 10 1 0 0 0 1 0 0 0 1", "4498.dat"),
    ],
    head: [
      line(NOUGAT, "0 -24 0 1 0 0 0 1 0 0 0 1", "3626b.dat"),
      line(BROWN, "0 -24 0 1 0 0 0 1 0 0 0 1", "3901.dat"),
    ],
    armL: [line(PURPLE, ARM_L, "3819.dat"), line(NOUGAT, HAND_L, "3820.dat")],
    armR: [
      line(PURPLE, ARM_R, "3818.dat"),
      line(NOUGAT, HAND_R, "3820.dat"),
      line(BROWN, HAND_R, "95051.dat"),
    ],
    legL: [line(BLACK, "0 42 0 1 0 0 0 1 0 0 0 1", "3817c.dat")],
    legR: [line(BLACK, "0 42 0 1 0 0 0 1 0 0 0 1", "3816c.dat")],
  }),
  // The Wasp: official wing part 10183 is keyworded "The Wasp"
  wasp: fig({
    body: [
      line(YEL, "0 0 0 1 0 0 0 1 0 0 0 1", "973.dat"),
      line(BLACK, "0 30 0 1 0 0 0 1 0 0 0 1", "3815b.dat"),
      line(46, "0 0 2 1 0 0 0 1 0 0 0 1", "10183.dat"),
    ],
    head: [
      line(84, "0 -24 0 1 0 0 0 1 0 0 0 1", "3626cpd66.dat"),
      line(BLACK, "0 -24 0 1 0 0 0 1 0 0 0 1", "3901.dat"),
    ],
    armL: [line(YEL, ARM_L, "3819.dat"), line(YEL, HAND_L, "3820.dat")],
    armR: [line(YEL, ARM_R, "3818.dat"), line(YEL, HAND_R, "3820.dat")],
    legL: [line(BLACK, "0 42 0 1 0 0 0 1 0 0 0 1", "3817c.dat")],
    legR: [line(BLACK, "0 42 0 1 0 0 0 1 0 0 0 1", "3816c.dat")],
  }),
  // Captain Marvel: printed torso 973pc1 / hips 3815bpc1 / leg 3817cpc1, set 76049
  marvel: fig({
    body: [line(DBLE, "0 0 0 1 0 0 0 1 0 0 0 1", "973pc1.dat"), line(DBLE, "0 30 0 1 0 0 0 1 0 0 0 1", "3815bpc1.dat")],
    head: [
      line(84, "0 -24 0 1 0 0 0 1 0 0 0 1", "3626cpd66.dat"),
      line(BLONDE, "0 -24 0 1 0 0 0 1 0 0 0 1", "21268.dat"),
    ],
    armL: [line(DBLE, ARM_L, "3819.dat"), line(RED, HAND_L, "3820.dat")],
    armR: [line(DBLE, ARM_R, "3818.dat"), line(RED, HAND_R, "3820.dat")],
    legL: [line(DBLE, "0 42 0 1 0 0 0 1 0 0 0 1", "3817cpc1.dat")],
    legR: [line(DBLE, "0 42 0 1 0 0 0 1 0 0 0 1", "3816c.dat")],
  }),
  // War Machine: printed suit from set 76006 plus the silver Iron Man visor
  warmachine: fig({
    body: [line(DBG, "0 0 0 1 0 0 0 1 0 0 0 1", "973pbd.dat"), line(DBG, "0 30 0 1 0 0 0 1 0 0 0 1", "3815bpbd.dat")],
    head: [
      line(DBG, "0 -24 0 1 0 0 0 1 0 0 0 1", "10907.dat"),
      line(SILVER, "0 -24 0 1 0 0 0 1 0 0 0 1", "10908p03.dat"),
    ],
    armL: [line(DBG, ARM_L, "3819.dat"), line(DBG, HAND_L, "3820.dat")],
    armR: [line(DBG, ARM_R, "3818.dat"), line(DBG, HAND_R, "3820.dat")],
    legL: [line(DBG, "0 42 0 1 0 0 0 1 0 0 0 1", "3817cpbd.dat")],
    legR: [line(DBG, "0 42 0 1 0 0 0 1 0 0 0 1", "3816cpbd.dat")],
  }),
  // Vision: red face, a big yellow mind stone, a second stone on the chest, pearl-gold suit, dark red cape.
  vision: fig({
    body: [
      line(297, "0 0 0 1 0 0 0 1 0 0 0 1", "973.dat"),
      line(297, "0 30 0 1 0 0 0 1 0 0 0 1", "3815b.dat"),
      line(320, "0 0 0 1 0 0 0 1 0 0 0 1", "4524.dat"),
      line(46, "0 6 -12 0.26 0 0 0 0.26 0 0 0 0.26", "30385.dat"),
    ],
    head: [
      line(4, "0 -24 0 1 0 0 0 1 0 0 0 1", "3626b.dat"),
      line(46, "0 -38 -12 0.5 0 0 0 0.5 0 0 0 0.5", "30385.dat"),
      line(15, "-4 -33 -10 0.38 0 0 0 0.38 0 0 0 0.38", "98138.dat"),
      line(15, "4 -33 -10 0.38 0 0 0 0.38 0 0 0 0.38", "98138.dat"),
    ],
    armL: [line(297, ARM_L, "3819.dat"), line(4, HAND_L, "3820.dat")],
    armR: [line(297, ARM_R, "3818.dat"), line(4, HAND_R, "3820.dat")],
    legL: [line(297, "0 42 0 1 0 0 0 1 0 0 0 1", "3817c.dat")],
    legR: [line(297, "0 42 0 1 0 0 0 1 0 0 0 1", "3816c.dat")],
  }),
  // A plain person. On a capture the copies split off him.
  person: fig({
    body: [line(1, "0 0 0 1 0 0 0 1 0 0 0 1", "973.dat"), line(1, "0 30 0 1 0 0 0 1 0 0 0 1", "3815b.dat")],
    head: [
      line(14, "0 -24 0 1 0 0 0 1 0 0 0 1", "3626b.dat"),
      line(6, "0 -24 0 1 0 0 0 1 0 0 0 1", "3901.dat"),
    ],
    armL: [line(1, ARM_L, "3819.dat"), line(14, HAND_L, "3820.dat")],
    armR: [line(1, ARM_R, "3818.dat"), line(14, HAND_R, "3820.dat")],
    legL: [line(272, "0 42 0 1 0 0 0 1 0 0 0 1", "3817c.dat")],
    legR: [line(272, "0 42 0 1 0 0 0 1 0 0 0 1", "3816c.dat")],
  }),
};

function makeLoader() {
  const loader = new LDrawLoader();
  loader.setPath(LIB);
  loader.setPartsLibraryPath(LIB);
  loader.smoothNormals = false;
  loader.setConditionalLineMaterial(LDrawConditionalLineMaterial);
  return loader;
}

function parse(loader, text) {
  return new Promise((resolve, reject) => {
    loader.parse(text, resolve, reject);
  });
}

function polish(root) {
  const drop = [];
  root.traverse((o) => {
    if (o.isLine || o.isLineSegments || o.isLineLoop) drop.push(o);
    const mesh = o;
    if (mesh.isMesh && mesh.material && !Array.isArray(mesh.material)) {
      const m = mesh.material;
      const metal = /metal|pearl|chrome|silver|gold/i.test(m.name || "");
      m.roughness = metal ? 0.35 : 0.55;
      m.metalness = metal ? 0.55 : 0.04;
      m.flatShading = true;
      if (m.transparent && m.opacity > 0.95) {
        m.transparent = false;
        m.depthWrite = true;
      }
    }
  });
  for (const o of drop) o.parent?.remove(o);
}

async function buildOne(name, spec) {
  const loader = makeLoader();
  await loader.preloadMaterials("LDConfig.ldr");
  const root = new THREE.Group();
  root.name = name;
  for (const part of ["body", "head", "armL", "armR", "legL", "legR"]) {
    const lines = spec[part];
    const text = `0 ${name} ${part}\n${lines.join("\n")}\n`;
    const g = await parse(loader, text);
    g.name = part;
    polish(g);
    root.add(g);
  }
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  console.log(name, "size", size.toArray().map((n) => +n.toFixed(2)), "y", +box.min.y.toFixed(2), +box.max.y.toFixed(2));
  for (const part of ["body", "head", "armL", "armR", "legL", "legR"]) {
    const n = root.getObjectByName(part);
    const b = new THREE.Box3().setFromObject(n);
    console.log("   ", part, "y", +b.min.y.toFixed(1), +b.max.y.toFixed(1), "tris~", countTris(n));
  }
  return root;
}

function countTris(o) {
  let n = 0;
  o.traverse((m) => {
    if (m.isMesh && m.geometry?.index) n += m.geometry.index.count / 3;
    else if (m.isMesh && m.geometry) n += (m.geometry.attributes.position?.count || 0) / 3;
  });
  return Math.round(n);
}

const only = process.argv[2];
const outDir = "/workspace/morse-chess-src/public/lego/chars";
fs.mkdirSync(outDir, { recursive: true });

for (const [name, spec] of Object.entries(figs)) {
  if (only && name !== only) continue;
  const root = await buildOne(name, spec);
  // LDraw keeps +Y down. Flip onto the board (head up, feet on y=0) and match the other minifigs' height.
  root.rotation.x = Math.PI;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const h = box.max.y - box.min.y;
  const target = 1.15;
  const s = target / h;
  root.scale.setScalar(s);
  root.position.y = -box.min.y * s;
  root.updateMatrixWorld(true);
  // bake scale/position into children so the runtime scale is the only one
  root.updateMatrixWorld(true);
  const baked = new THREE.Group();
  baked.name = name;
  for (const partName of ["body", "head", "armL", "armR", "legL", "legR"]) {
    const src = root.getObjectByName(partName);
    const holder = new THREE.Group();
    holder.name = partName;
    // clone geometry in world space
    src.updateWorldMatrix(true, true);
    src.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.clone();
      m.geometry = o.geometry.clone();
      m.geometry.applyMatrix4(o.matrixWorld);
      m.position.set(0, 0, 0);
      m.rotation.set(0, 0, 0);
      m.scale.set(1, 1, 1);
      m.updateMatrix();
      holder.add(m);
    });
    baked.add(holder);
  }
  const exporter = new GLTFExporter();
  const bin = await exporter.parseAsync(baked, { binary: true });
  const file = `${outDir}/${name}.glb`;
  fs.writeFileSync(file, Buffer.from(bin));
  console.log("wrote", file, fs.statSync(file).size);
}
