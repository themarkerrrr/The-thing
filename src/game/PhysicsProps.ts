import * as THREE from 'three';
import type { ObjectType, PhysicsObject } from '../types.ts';

// Texture generators for props
function createDiceCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 12;
  ctx.strokeRect(6, 6, 244, 244);

  // Black dot in center
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(128, 128, 26, 0, Math.PI * 2);
  ctx.fill();

  // 4 corner dots
  const corners = [
    [64, 64],
    [192, 64],
    [64, 192],
    [192, 192],
  ];
  for (const [x, y] of corners) {
    ctx.beginPath();
    ctx.arc(x, y, 20, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas;
}

function createCrateCanvas(baseColorHex: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseColorHex;
  ctx.fillRect(0, 0, 256, 256);

  // Wooden plank borders
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 0, 256, 24);
  ctx.fillRect(0, 232, 256, 24);
  ctx.fillRect(0, 0, 24, 256);
  ctx.fillRect(232, 0, 24, 256);

  // Cross brace
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.moveTo(24, 24);
  ctx.lineTo(232, 232);
  ctx.moveTo(232, 24);
  ctx.lineTo(24, 232);
  ctx.stroke();

  // Screws/rivets
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  const rivets = [
    [12, 12],
    [244, 12],
    [12, 244],
    [244, 244],
    [128, 128],
  ];
  for (const [rx, ry] of rivets) {
    ctx.beginPath();
    ctx.arc(rx, ry, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas;
}

const diceTexture = new THREE.CanvasTexture(createDiceCanvas());

export function updateObjectAnchorVisual(mesh: THREE.Object3D, _isStatic: boolean, _size: [number, number, number]): void {
  const existing = mesh.getObjectByName('__anchorIndicator');
  if (existing) {
    mesh.remove(existing);
  }
}

export function createPhysicsObjectMesh(obj: PhysicsObject): THREE.Object3D {
  const { type, size, color, isStatic } = obj;
  let root: THREE.Object3D;

  if (type === 'sphere') {
    const radius = size[0];
    const geo = new THREE.SphereGeometry(radius, 28, 24);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      metalness: 0.2,
      roughness: 0.15,
      envMapIntensity: 1.0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root = mesh;
  } else if (type === 'barrel') {
    const radius = size[0];
    const height = size[1];
    const group = new THREE.Group();

    const barrelGeo = new THREE.CylinderGeometry(radius * 0.95, radius, height, 20);
    const barrelMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      metalness: 0.6,
      roughness: 0.35,
    });
    const barrelMesh = new THREE.Mesh(barrelGeo, barrelMat);
    barrelMesh.castShadow = true;
    barrelMesh.receiveShadow = true;
    group.add(barrelMesh);

    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.8,
      roughness: 0.2,
    });
    const ringGeo = new THREE.TorusGeometry(radius * 1.02, 0.04, 8, 24);
    ringGeo.rotateX(Math.PI / 2);

    const ring1 = new THREE.Mesh(ringGeo, ringMat);
    ring1.position.y = height * 0.25;
    group.add(ring1);

    const ring2 = new THREE.Mesh(ringGeo, ringMat);
    ring2.position.y = -height * 0.25;
    group.add(ring2);

    root = group;
  } else if (type === 'domino') {
    const [w, h, d] = size;
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      metalness: 0.4,
      roughness: 0.2,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root = mesh;
  } else if (type === 'dice') {
    const [w, h, d] = size;
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({
      map: diceTexture,
      roughness: 0.25,
      metalness: 0.1,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root = mesh;
  } else if (type === 'trampoline') {
    const [w, h, d] = size;
    const group = new THREE.Group();

    const baseGeo = new THREE.BoxGeometry(w, h * 0.7, d);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.7,
      roughness: 0.3,
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    group.add(baseMesh);

    const padGeo = new THREE.BoxGeometry(w * 0.86, h * 0.4, d * 0.86);
    const padMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      emissive: 0x0284c7,
      emissiveIntensity: 0.4,
      roughness: 0.2,
    });
    const padMesh = new THREE.Mesh(padGeo, padMat);
    padMesh.position.y = h * 0.22;
    group.add(padMesh);

    root = group;
  } else if (type === 'ramp') {
    const [w, h, d] = size;
    const shape = new THREE.Shape();
    shape.moveTo(-d / 2, 0);
    shape.lineTo(d / 2, 0);
    shape.lineTo(-d / 2, h);
    shape.closePath();

    const extrudeSettings = {
      steps: 1,
      depth: w,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.05,
      bevelSegments: 2,
    };
    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geo.rotateY(Math.PI / 2);
    geo.translate(-w / 2, -h / 2, 0);

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      metalness: 0.3,
      roughness: 0.4,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root = mesh;
  } else {
    // Default Box (Crate)
    const [w, h, d] = size;
    const geo = new THREE.BoxGeometry(w, h, d);
    const tex = new THREE.CanvasTexture(createCrateCanvas(color));
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.4,
      metalness: 0.1,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root = mesh;
  }

  return root;
}
