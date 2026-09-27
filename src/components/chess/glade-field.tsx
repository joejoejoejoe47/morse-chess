import { useEffect, useMemo } from "react";
import { useGLTF, useTexture } from "@react-three/drei";
import * as THREE from "three";

export const GLADE_PITCH = 2;

export function gladeHeight(x: number, z: number) {
  const board = 4 * GLADE_PITCH;
  const court = Math.max(Math.abs(x), Math.abs(z));
  const mask = THREE.MathUtils.smoothstep(court, board + 0.15, board + 9);
  const roll =
    Math.sin(x * 0.07) * Math.cos(z * 0.06) * 0.55 +
    Math.sin(x * 0.15 + 0.7) * Math.sin(z * 0.13) * 0.22 +
    Math.cos(x * 0.038 - z * 0.032) * 0.7;
  const lawn = Math.sin(x * 0.28) * Math.cos(z * 0.24) * 0.12 + Math.sin(x * 0.7 + z * 0.55) * 0.04;
  return roll * mask + lawn * (1 - mask);
}

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function scatter(root: THREE.Object3D, count: number, place: (i: number, dummy: THREE.Object3D) => void) {
  root.updateMatrixWorld(true);
  const made: THREE.InstancedMesh[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry.clone();
    geo.applyMatrix4(mesh.matrixWorld);
    const inst = new THREE.InstancedMesh(geo, mesh.material, count);
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.frustumCulled = false;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      dummy.position.set(0, 0, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.quaternion.identity();
      place(i, dummy);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    made.push(inst);
  });
  return made;
}

function paintGrid() {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const span = 8 * GLADE_PITCH + 0.5;
  if (!ctx) return { tex: null as THREE.CanvasTexture | null, span };
  const px = (v: number) => ((v + span / 2) / span) * size;
  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < 9; i++) {
    const p = (i - 4) * GLADE_PITCH;
    const a = px(-4 * GLADE_PITCH);
    const b = px(4 * GLADE_PITCH);
    const c = px(p);
    ctx.strokeStyle = "rgba(24, 32, 18, 0.55)";
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(a, c);
    ctx.lineTo(b, c);
    ctx.moveTo(c, a);
    ctx.lineTo(c, b);
    ctx.stroke();
    ctx.strokeStyle = "rgba(250, 246, 232, 0.94)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(a, c);
    ctx.lineTo(b, c);
    ctx.moveTo(c, a);
    ctx.lineTo(c, b);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, span };
}

const SKY_VERT = `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = `
  varying vec3 vDir;
  float hsh(vec2 p){return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);}
  float nse(vec2 p){
    vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hsh(i), hsh(i+vec2(1.0,0.0)), f.x), mix(hsh(i+vec2(0.0,1.0)), hsh(i+vec2(1.0,1.0)), f.x), f.y);
  }
  void main() {
    vec3 dir = normalize(vDir);
    float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(vec3(0.83, 0.84, 0.74), vec3(0.45, 0.68, 0.86), smoothstep(0.0, 0.45, h));
    col = mix(col, vec3(0.20, 0.42, 0.74), smoothstep(0.35, 0.9, h));
    float cloud = smoothstep(0.55, 0.75, nse(dir.xz / max(dir.y + 0.25, 0.15) * 1.8));
    col = mix(col, vec3(0.97, 0.98, 0.99), cloud * smoothstep(0.02, 0.2, dir.y));
    float sun = pow(max(dot(dir, normalize(vec3(0.72, 0.46, 0.28))), 0.0), 40.0);
    col += vec3(1.0, 0.86, 0.55) * sun;
    gl_FragColor = vec4(col, 1.0);
  }
`;

useGLTF.preload("/glade/clump1/grass_medium_01_1k.gltf");
useGLTF.preload("/glade/clump2/grass_medium_02_1k.gltf");
useGLTF.preload("/glade/lawn/grass_bermuda_01_1k.gltf");

export function MeadowField() {
  const thick = useGLTF("/glade/clump1/grass_medium_01_1k.gltf");
  const tuft = useGLTF("/glade/clump2/grass_medium_02_1k.gltf");
  const blades = useGLTF("/glade/lawn/grass_bermuda_01_1k.gltf");
  const maps = useTexture({
    map: "/glade/ground/diff.jpg",
    normalMap: "/glade/ground/nor.jpg",
    roughnessMap: "/glade/ground/rough.jpg",
  });

  const field = useMemo(() => {
    const repeat = 22;
    for (const tex of [maps.map, maps.normalMap, maps.roughnessMap]) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeat, repeat);
      tex.anisotropy = 8;
    }
    maps.map.colorSpace = THREE.SRGBColorSpace;
    maps.normalMap.colorSpace = THREE.LinearSRGBColorSpace;
    maps.roughnessMap.colorSpace = THREE.LinearSRGBColorSpace;

    const ground = new THREE.PlaneGeometry(150, 150, 96, 96);
    ground.rotateX(-Math.PI / 2);
    const pos = ground.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, gladeHeight(pos.getX(i), pos.getZ(i)));
    ground.computeVertexNormals();

    const groundMat = new THREE.MeshStandardMaterial({
      map: maps.map,
      normalMap: maps.normalMap,
      roughnessMap: maps.roughnessMap,
      roughness: 1,
      metalness: 0,
    });
    groundMat.normalScale.set(1.45, 1.45);

    const painted = paintGrid();
    const court = new THREE.PlaneGeometry(painted.span, painted.span, 40, 40);
    court.rotateX(-Math.PI / 2);
    const cpos = court.attributes.position;
    for (let i = 0; i < cpos.count; i++) cpos.setY(i, gladeHeight(cpos.getX(i), cpos.getZ(i)) + 0.035);
    court.computeVertexNormals();
    const courtMat = new THREE.MeshStandardMaterial({
      map: painted.tex ?? undefined,
      transparent: true,
      depthWrite: false,
      roughness: 1,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });

    const board = 4 * GLADE_PITCH;
    const outside = (i: number, salt: number, min: number, span: number, sc: number) => {
      return (dummy: THREE.Object3D) => {
        const a = hash(i * 1.17 + salt) * Math.PI * 2;
        const rad = min + hash(i + salt) * span;
        let x = Math.cos(a) * rad;
        let z = Math.sin(a) * rad;
        if (Math.abs(x) < board && Math.abs(z) < board) {
          if (Math.abs(x) > Math.abs(z)) x = Math.sign(x || 1) * (board + 0.6 + hash(i + 8) * 2);
          else z = Math.sign(z || 1) * (board + 0.6 + hash(i + 8) * 2);
        }
        dummy.position.set(x, gladeHeight(x, z), z);
        dummy.rotation.y = hash(i + salt + 3) * Math.PI * 2;
        const s = sc * (0.85 + hash(i + salt + 5) * 0.5);
        dummy.scale.setScalar(s);
      };
    };
    const clumps = scatter(thick.scene, 12, (i, dummy) => outside(i, 20, board + 1.4, 16, 3.1)(dummy));
    const tufts = scatter(tuft.scene, 26, (i, dummy) => outside(i, 60, board + 0.8, 22, 3.4)(dummy));
    const lawn = scatter(blades.scene, 70, (i, dummy) => {
      const onCourt = hash(i + 9) < 0.45;
      const x = onCourt ? (hash(i + 1) - 0.5) * 15.2 : Math.cos(hash(i) * 6.28) * (board + 1 + hash(i + 2) * 20);
      const z = onCourt ? (hash(i + 3) - 0.5) * 15.2 : Math.sin(hash(i) * 6.28) * (board + 1 + hash(i + 4) * 20);
      dummy.position.set(x, gladeHeight(x, z), z);
      dummy.rotation.y = hash(i + 6) * Math.PI * 2;
      dummy.scale.setScalar(onCourt ? 2.1 + hash(i + 7) * 0.6 : 3.2 + hash(i + 7) * 1.4);
    });

    const skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });

    return { ground, groundMat, court, courtMat, paint: painted.tex, clumps, tufts, lawn, skyMat };
  }, [blades.scene, maps.map, maps.normalMap, maps.roughnessMap, thick.scene, tuft.scene]);

  useEffect(
    () => () => {
      field.ground.dispose();
      field.groundMat.dispose();
      field.court.dispose();
      field.courtMat.dispose();
      field.paint?.dispose();
      field.skyMat.dispose();
      for (const mesh of [...field.clumps, ...field.tufts, ...field.lawn]) mesh.geometry.dispose();
    },
    [field],
  );

  return (
    <group>
      <mesh>
        <sphereGeometry args={[140, 32, 20]} />
        <primitive object={field.skyMat} attach="material" />
      </mesh>
      <mesh geometry={field.ground} material={field.groundMat} receiveShadow />
      <mesh geometry={field.court} material={field.courtMat} receiveShadow />
      {field.clumps.map((mesh, i) => (
        <primitive key={`c-${i}`} object={mesh} />
      ))}
      {field.tufts.map((mesh, i) => (
        <primitive key={`t-${i}`} object={mesh} />
      ))}
      {field.lawn.map((mesh, i) => (
        <primitive key={`l-${i}`} object={mesh} />
      ))}
    </group>
  );
}
