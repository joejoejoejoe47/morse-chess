import * as THREE from "three";

/**
 * The LEGO figures were converted from LDraw, where a right leg or a left arm is the mirror
 * copy of the other side. The mirror flipped those parts' triangle winding while their normals
 * still point outwards, so the renderer culled the outside of the part and showed its inside:
 * see-through legs with the hip pins and leg hollows showing through. This turns every triangle
 * whose winding disagrees with its own vertex normals back the right way round. Geometry is
 * shared between figure copies, so each geometry is fixed once (it is a no-op after that).
 */
export function fixLegoWinding(root: THREE.Object3D) {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry;
    if (geo.userData.windingFixed) return;
    geo.userData.windingFixed = true;
    const pos = geo.getAttribute("position");
    const nor = geo.getAttribute("normal");
    const index = geo.getIndex();
    if (!pos || !nor || !index) return;
    const ids = index.array;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const n = new THREE.Vector3();
    const m = new THREE.Vector3();
    let flipped = 0;
    for (let t = 0; t + 2 < index.count; t += 3) {
      const i0 = ids[t], i1 = ids[t + 1], i2 = ids[t + 2];
      a.fromBufferAttribute(pos, i0);
      b.fromBufferAttribute(pos, i1).sub(a);
      c.fromBufferAttribute(pos, i2).sub(a);
      n.crossVectors(b, c);
      m.fromBufferAttribute(nor, i0);
      a.fromBufferAttribute(nor, i1);
      m.add(a);
      a.fromBufferAttribute(nor, i2);
      m.add(a);
      if (n.dot(m) < 0) {
        ids[t + 1] = i2;
        ids[t + 2] = i1;
        flipped += 1;
      }
    }
    if (flipped) index.needsUpdate = true;
  });
}
