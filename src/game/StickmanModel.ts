import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';

export interface SlicedLimbGeometries {
  head: THREE.BufferGeometry;
  upperTorso: THREE.BufferGeometry;
  lowerTorso: THREE.BufferGeometry;
  pelvis: THREE.BufferGeometry;
  leftUpperArm: THREE.BufferGeometry;
  leftLowerArm: THREE.BufferGeometry;
  leftHand: THREE.BufferGeometry;
  rightUpperArm: THREE.BufferGeometry;
  rightLowerArm: THREE.BufferGeometry;
  rightHand: THREE.BufferGeometry;
  leftUpperLeg: THREE.BufferGeometry;
  leftLowerLeg: THREE.BufferGeometry;
  leftFoot: THREE.BufferGeometry;
  rightUpperLeg: THREE.BufferGeometry;
  rightLowerLeg: THREE.BufferGeometry;
  rightFoot: THREE.BufferGeometry;
}

let cachedSlicedLimbs: SlicedLimbGeometries | null = null;
let gltfLoadingPromise: Promise<SlicedLimbGeometries> | null = null;

export const MODEL_SCALE = 0.22;
export const BASE_PELVIS_Y = 3.35 * MODEL_SCALE; // 0.737m

// Slices the single monolithic 3D mesh geometry into 15+ distinct articulated limb geometries
function sliceMeshInto15Limbs(sourceGeometry: THREE.BufferGeometry): SlicedLimbGeometries {
  const nonIndexed = sourceGeometry.index ? sourceGeometry.toNonIndexed() : sourceGeometry;
  const posAttr = nonIndexed.attributes.position;
  const normAttr = nonIndexed.attributes.normal;

  const count = posAttr.count;

  // Joint pivots in raw model space (where model Z is vertical up [0 to 7.76], X is left-right [-3.7 to +3.7], Y is depth)
  const rawPivots: Record<keyof SlicedLimbGeometries, [number, number, number]> = {
    head: [0, 0, 6.15],
    upperTorso: [0, 0, 4.75],
    lowerTorso: [0, 0, 3.85],
    pelvis: [0, 0, 3.35],
    leftUpperArm: [-0.92, 0, 5.55],
    leftLowerArm: [-2.10, 0, 5.55],
    leftHand: [-3.05, 0, 5.55],
    rightUpperArm: [0.92, 0, 5.55],
    rightLowerArm: [2.10, 0, 5.55],
    rightHand: [3.05, 0, 5.55],
    leftUpperLeg: [-0.43, 0, 3.35],
    leftLowerLeg: [-0.43, 0, 1.75],
    leftFoot: [-0.43, 0, 0.45],
    rightUpperLeg: [0.43, 0, 3.35],
    rightLowerLeg: [0.43, 0, 1.75],
    rightFoot: [0.43, 0, 0.45],
  };

  const buckets: Record<keyof SlicedLimbGeometries, { pos: number[]; norm: number[] }> = {
    head: { pos: [], norm: [] },
    upperTorso: { pos: [], norm: [] },
    lowerTorso: { pos: [], norm: [] },
    pelvis: { pos: [], norm: [] },
    leftUpperArm: { pos: [], norm: [] },
    leftLowerArm: { pos: [], norm: [] },
    leftHand: { pos: [], norm: [] },
    rightUpperArm: { pos: [], norm: [] },
    rightLowerArm: { pos: [], norm: [] },
    rightHand: { pos: [], norm: [] },
    leftUpperLeg: { pos: [], norm: [] },
    leftLowerLeg: { pos: [], norm: [] },
    leftFoot: { pos: [], norm: [] },
    rightUpperLeg: { pos: [], norm: [] },
    rightLowerLeg: { pos: [], norm: [] },
    rightFoot: { pos: [], norm: [] },
  };

  for (let i = 0; i < count; i += 3) {
    const x0 = posAttr.getX(i), y0 = posAttr.getY(i), z0 = posAttr.getZ(i);
    const x1 = posAttr.getX(i + 1), y1 = posAttr.getY(i + 1), z1 = posAttr.getZ(i + 1);
    const x2 = posAttr.getX(i + 2), y2 = posAttr.getY(i + 2), z2 = posAttr.getZ(i + 2);

    const cz = (z0 + z1 + z2) / 3;
    const cx = (x0 + x1 + x2) / 3;

    let limb: keyof SlicedLimbGeometries = 'pelvis';
    if (cz >= 6.15) {
      limb = 'head';
    } else if (cz < 3.35) {
      const isLeft = cx < 0;
      if (cz >= 1.75) {
        limb = isLeft ? 'leftUpperLeg' : 'rightUpperLeg';
      } else if (cz >= 0.45) {
        limb = isLeft ? 'leftLowerLeg' : 'rightLowerLeg';
      } else {
        limb = isLeft ? 'leftFoot' : 'rightFoot';
      }
    } else {
      // Arms vs Torso (3.35 <= cz < 6.15)
      if (cx < -0.92) {
        // Left arm hierarchy
        if (cx > -2.10) {
          limb = 'leftUpperArm';
        } else if (cx > -3.05) {
          limb = 'leftLowerArm'; // Elbow/forearm
        } else {
          limb = 'leftHand';
        }
      } else if (cx > 0.92) {
        // Right arm hierarchy
        if (cx < 2.10) {
          limb = 'rightUpperArm';
        } else if (cx < 3.05) {
          limb = 'rightLowerArm'; // Elbow/forearm
        } else {
          limb = 'rightHand';
        }
      } else {
        // Spine & Torso hierarchy
        if (cz >= 4.75) {
          limb = 'upperTorso'; // Chest & Shoulders
        } else if (cz >= 3.85) {
          limb = 'lowerTorso'; // Abdomen / bottom torso
        } else {
          limb = 'pelvis'; // Hips / base
        }
      }
    }

    const b = buckets[limb];
    const pivot = rawPivots[limb];

    // Push 3 vertices with local pivot offset and upright coordinate conversion (x' = rx, y' = rz, z' = -ry)
    for (let v = 0; v < 3; v++) {
      const idx = i + v;
      const rx = posAttr.getX(idx) - pivot[0];
      const ry = posAttr.getY(idx) - pivot[1];
      const rz = posAttr.getZ(idx) - pivot[2];

      b.pos.push(rx * MODEL_SCALE, rz * MODEL_SCALE, -ry * MODEL_SCALE);

      if (normAttr) {
        const nx = normAttr.getX(idx);
        const ny = normAttr.getY(idx);
        const nz = normAttr.getZ(idx);
        b.norm.push(nx, nz, -ny);
      }
    }
  }

  const makeGeo = (b: { pos: number[]; norm: number[] }): THREE.BufferGeometry => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    if (b.norm.length > 0) {
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.norm, 3));
    } else {
      geo.computeVertexNormals();
    }
    return geo;
  };

  return {
    head: makeGeo(buckets.head),
    upperTorso: makeGeo(buckets.upperTorso),
    lowerTorso: makeGeo(buckets.lowerTorso),
    pelvis: makeGeo(buckets.pelvis),
    leftUpperArm: makeGeo(buckets.leftUpperArm),
    leftLowerArm: makeGeo(buckets.leftLowerArm),
    leftHand: makeGeo(buckets.leftHand),
    rightUpperArm: makeGeo(buckets.rightUpperArm),
    rightLowerArm: makeGeo(buckets.rightLowerArm),
    rightHand: makeGeo(buckets.rightHand),
    leftUpperLeg: makeGeo(buckets.leftUpperLeg),
    leftLowerLeg: makeGeo(buckets.leftLowerLeg),
    leftFoot: makeGeo(buckets.leftFoot),
    rightUpperLeg: makeGeo(buckets.rightUpperLeg),
    rightLowerLeg: makeGeo(buckets.rightLowerLeg),
    rightFoot: makeGeo(buckets.rightFoot),
  };
}

function loadSlicedLimbGeometries(): Promise<SlicedLimbGeometries> {
  if (cachedSlicedLimbs) {
    return Promise.resolve(cachedSlicedLimbs);
  }
  if (gltfLoadingPromise) {
    return gltfLoadingPromise;
  }
  gltfLoadingPromise = new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    const base = import.meta.env.BASE_URL?.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL || './'}/`;
    const modelUrl = `${base}2003.glb`.replace(/\/\//g, '/');
    loader.load(
      modelUrl,
      (gltf) => {
        let foundGeometry: THREE.BufferGeometry | null = null;
        gltf.scene.traverse((child) => {
          if (!foundGeometry && (child as THREE.Mesh).isMesh) {
            foundGeometry = (child as THREE.Mesh).geometry;
          }
        });

        if (foundGeometry) {
          const sliced = sliceMeshInto15Limbs(foundGeometry);
          cachedSlicedLimbs = sliced;
          resolve(sliced);
        } else {
          reject(new Error('No mesh geometry found in /2003.glb'));
        }
      },
      undefined,
      (err) => {
        console.warn('Could not load /2003.glb, falling back to procedural rig', err);
        reject(err);
      }
    );
  });
  return gltfLoadingPromise;
}

export interface StickmanRigJoints {
  rootGroup: THREE.Group;
  pelvis: THREE.Group;
  lowerTorso: THREE.Group;
  upperTorso: THREE.Group;
  head: THREE.Group;
  leftUpperArm: THREE.Group;
  leftLowerArm: THREE.Group; // elbow
  leftHand: THREE.Group;
  rightUpperArm: THREE.Group;
  rightLowerArm: THREE.Group; // elbow
  rightHand: THREE.Group;
  leftUpperLeg: THREE.Group; // thigh
  leftLowerLeg: THREE.Group; // knee
  leftFoot: THREE.Group;
  rightUpperLeg: THREE.Group; // thigh
  rightLowerLeg: THREE.Group; // knee
  rightFoot: THREE.Group;
}

export interface StickmanMeshParts {
  root: THREE.Group;
  materials: THREE.MeshStandardMaterial[];
  nameTagSprite: THREE.Sprite;
  chatBubbleSprite: THREE.Sprite;
  shadowMesh?: THREE.Mesh;
  rig: StickmanRigJoints;
  mixer?: THREE.AnimationMixer;
  modelGroup: THREE.Group;
  bodyGroup?: THREE.Group;
  customModel?: THREE.Group;
  actions?: Record<string, THREE.AnimationAction>;
  animMeta?: {
    currentAnim: string;
    animTime: number;
    prevVy: number;
  };
}

export function createStickmanMesh(colorHex: string = '#383b42', name: string = 'Stickman'): StickmanMeshParts {
  const root = new THREE.Group();
  root.name = 'StickmanRoot';

  const modelGroup = new THREE.Group();
  modelGroup.name = 'CharacterModelGroup';
  root.add(modelGroup);

  const materials: THREE.MeshStandardMaterial[] = [];

  // Create metallic shader material with smooth double-sided rendering
  const bodyMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(colorHex),
    roughness: 0.3,
    metalness: 0.75,
    side: THREE.DoubleSide,
  });
  materials.push(bodyMat);

  // --- 15+ LIMBS RIG HIERARCHY ---
  // 1. Pelvis (Base Root at y = 3.35 * MODEL_SCALE = 0.737)
  const pelvis = new THREE.Group();
  pelvis.name = 'Pelvis';
  pelvis.position.y = BASE_PELVIS_Y;
  modelGroup.add(pelvis);

  // 2. Bottom Torso / Lower Torso (Waist/Abdomen attached to Pelvis)
  const lowerTorso = new THREE.Group();
  lowerTorso.name = 'LowerTorso';
  lowerTorso.position.set(0, (3.85 - 3.35) * MODEL_SCALE, 0);
  pelvis.add(lowerTorso);

  // 3. Upper Torso (Chest & Shoulders attached to Lower Torso)
  const upperTorso = new THREE.Group();
  upperTorso.name = 'UpperTorso';
  upperTorso.position.set(0, (4.75 - 3.85) * MODEL_SCALE, 0);
  lowerTorso.add(upperTorso);

  // 4. Head (attached to Upper Torso)
  const head = new THREE.Group();
  head.name = 'Head';
  head.position.set(0, (6.15 - 4.75) * MODEL_SCALE, 0);
  upperTorso.add(head);

  // 5. Left Upper Arm (Shoulder attached to Upper Torso)
  const leftUpperArm = new THREE.Group();
  leftUpperArm.name = 'LeftUpperArm';
  leftUpperArm.position.set(-0.92 * MODEL_SCALE, (5.55 - 4.75) * MODEL_SCALE, 0);
  upperTorso.add(leftUpperArm);

  // 6. Left Lower Arm / Elbow (attached to Left Upper Arm)
  const leftLowerArm = new THREE.Group();
  leftLowerArm.name = 'LeftLowerArm';
  leftLowerArm.position.set((-2.10 - (-0.92)) * MODEL_SCALE, 0, 0);
  leftUpperArm.add(leftLowerArm);

  // 7. Left Hand / Wrist (attached to Left Lower Arm)
  const leftHand = new THREE.Group();
  leftHand.name = 'LeftHand';
  leftHand.position.set((-3.05 - (-2.10)) * MODEL_SCALE, 0, 0);
  leftLowerArm.add(leftHand);

  // 8. Right Upper Arm (Shoulder attached to Upper Torso)
  const rightUpperArm = new THREE.Group();
  rightUpperArm.name = 'RightUpperArm';
  rightUpperArm.position.set(0.92 * MODEL_SCALE, (5.55 - 4.75) * MODEL_SCALE, 0);
  upperTorso.add(rightUpperArm);

  // 9. Right Lower Arm / Elbow (attached to Right Upper Arm)
  const rightLowerArm = new THREE.Group();
  rightLowerArm.name = 'RightLowerArm';
  rightLowerArm.position.set((2.10 - 0.92) * MODEL_SCALE, 0, 0);
  rightUpperArm.add(rightLowerArm);

  // 10. Right Hand / Wrist (attached to Right Lower Arm)
  const rightHand = new THREE.Group();
  rightHand.name = 'RightHand';
  rightHand.position.set((3.05 - 2.10) * MODEL_SCALE, 0, 0);
  rightLowerArm.add(rightHand);

  // 11. Left Upper Leg / Thigh (Hip joint attached to Pelvis)
  const leftUpperLeg = new THREE.Group();
  leftUpperLeg.name = 'LeftUpperLeg';
  leftUpperLeg.position.set(-0.43 * MODEL_SCALE, 0, 0);
  pelvis.add(leftUpperLeg);

  // 12. Left Lower Leg / Knee & Shin (attached to Left Upper Leg)
  const leftLowerLeg = new THREE.Group();
  leftLowerLeg.name = 'LeftLowerLeg';
  leftLowerLeg.position.set(0, (1.75 - 3.35) * MODEL_SCALE, 0);
  leftUpperLeg.add(leftLowerLeg);

  // 13. Left Foot / Ankle (attached to Left Lower Leg)
  const leftFoot = new THREE.Group();
  leftFoot.name = 'LeftFoot';
  leftFoot.position.set(0, (0.45 - 1.75) * MODEL_SCALE, 0);
  leftLowerLeg.add(leftFoot);

  // 14. Right Upper Leg / Thigh (Hip joint attached to Pelvis)
  const rightUpperLeg = new THREE.Group();
  rightUpperLeg.name = 'RightUpperLeg';
  rightUpperLeg.position.set(0.43 * MODEL_SCALE, 0, 0);
  pelvis.add(rightUpperLeg);

  // 15. Right Lower Leg / Knee & Shin (attached to Right Upper Leg)
  const rightLowerLeg = new THREE.Group();
  rightLowerLeg.name = 'RightLowerLeg';
  rightLowerLeg.position.set(0, (1.75 - 3.35) * MODEL_SCALE, 0);
  rightUpperLeg.add(rightLowerLeg);

  // 16. Right Foot / Ankle (attached to Right Lower Leg)
  const rightFoot = new THREE.Group();
  rightFoot.name = 'RightFoot';
  rightFoot.position.set(0, (0.45 - 1.75) * MODEL_SCALE, 0);
  rightLowerLeg.add(rightFoot);

  // Helper to create a shadow-casting mesh for each sliced limb
  const createLimbMesh = (geo: THREE.BufferGeometry): THREE.Mesh => {
    const mesh = new THREE.Mesh(geo, bodyMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  // Asynchronously load and mount the 15+ split limb meshes from the 3D model
  loadSlicedLimbGeometries().then((limbs) => {
    pelvis.add(createLimbMesh(limbs.pelvis));
    lowerTorso.add(createLimbMesh(limbs.lowerTorso));
    upperTorso.add(createLimbMesh(limbs.upperTorso));
    head.add(createLimbMesh(limbs.head));

    leftUpperArm.add(createLimbMesh(limbs.leftUpperArm));
    leftLowerArm.add(createLimbMesh(limbs.leftLowerArm));
    leftHand.add(createLimbMesh(limbs.leftHand));

    rightUpperArm.add(createLimbMesh(limbs.rightUpperArm));
    rightLowerArm.add(createLimbMesh(limbs.rightLowerArm));
    rightHand.add(createLimbMesh(limbs.rightHand));

    leftUpperLeg.add(createLimbMesh(limbs.leftUpperLeg));
    leftLowerLeg.add(createLimbMesh(limbs.leftLowerLeg));
    leftFoot.add(createLimbMesh(limbs.leftFoot));

    rightUpperLeg.add(createLimbMesh(limbs.rightUpperLeg));
    rightLowerLeg.add(createLimbMesh(limbs.rightLowerLeg));
    rightFoot.add(createLimbMesh(limbs.rightFoot));
  }).catch((err) => {
    console.warn('Could not slice 3D model into 15 limbs', err);
  });

  const rig: StickmanRigJoints = {
    rootGroup: modelGroup,
    pelvis,
    lowerTorso,
    upperTorso,
    head,
    leftUpperArm,
    leftLowerArm,
    leftHand,
    rightUpperArm,
    rightLowerArm,
    rightHand,
    leftUpperLeg,
    leftLowerLeg,
    leftFoot,
    rightUpperLeg,
    rightLowerLeg,
    rightFoot,
  };

  // Name Tag
  const nameTagSprite = createRetroNameSprite(name, colorHex);
  nameTagSprite.position.set(0, 2.8, 0);
  nameTagSprite.scale.set(3.2, 0.8, 1);
  root.add(nameTagSprite);

  // Chat Bubble
  const chatBubbleSprite = createRetroChatSprite('');
  chatBubbleSprite.position.set(0, 2.45, 0);
  chatBubbleSprite.scale.set(2.1, 0.65, 1);
  chatBubbleSprite.visible = false;
  root.add(chatBubbleSprite);

  return {
    root,
    materials,
    nameTagSprite,
    chatBubbleSprite,
    rig,
    modelGroup,
    bodyGroup: modelGroup,
  };
}

export function animateStickman(
  parts: StickmanMeshParts,
  time: number,
  anim: 'idle' | 'walk' | 'run' | 'jump' | 'kick' | 'wave' | 'dance' | 'slip',
  speed: number = 0,
  dt: number = 0,
  vy: number = 0
) {
  const rig = parts.rig;
  if (!rig) return;

  const {
    pelvis,
    lowerTorso,
    upperTorso,
    head,
    leftUpperArm,
    leftLowerArm,
    leftHand,
    rightUpperArm,
    rightLowerArm,
    rightHand,
    leftUpperLeg,
    leftLowerLeg,
    leftFoot,
    rightUpperLeg,
    rightLowerLeg,
    rightFoot,
  } = rig;

  // Track animation state and elapsed time for progressive multi-phase animations
  if (!parts.animMeta) {
    parts.animMeta = {
      currentAnim: anim,
      animTime: 0,
      prevVy: vy,
    };
  }

  if (parts.animMeta.currentAnim !== anim) {
    parts.animMeta.currentAnim = anim;
    parts.animMeta.animTime = 0;
  } else {
    parts.animMeta.animTime += dt > 0 ? dt : 0.016;
  }
  parts.animMeta.prevVy = vy;

  const animTime = parts.animMeta.animTime;

  // Base resting arm angles pointing down alongside body
  const LEFT_ARM_DOWN_Z = 1.38;
  const RIGHT_ARM_DOWN_Z = -1.38;

  if (anim === 'run') {
    const cycle = time * 13.5;
    const legWave = Math.sin(cycle);

    // Pelvis bounce and roll
    pelvis.position.y = BASE_PELVIS_Y + Math.abs(Math.sin(cycle * 2)) * 0.06;
    pelvis.rotation.y = legWave * 0.12;
    pelvis.rotation.z = -legWave * 0.04;

    // Bottom Torso (Waist articulation)
    lowerTorso.rotation.x = 0.08;
    lowerTorso.rotation.y = -legWave * 0.08;
    lowerTorso.rotation.z = legWave * 0.03;

    // Upper Torso (Chest forward lean and counter-twist)
    upperTorso.rotation.x = 0.12;
    upperTorso.rotation.y = -legWave * 0.08;
    upperTorso.rotation.z = legWave * 0.02;

    // Head stabilizes forward
    head.rotation.x = -0.12;
    head.rotation.y = 0;
    head.rotation.z = 0;

    // Legs: Thighs, Knees, and Feet
    // Left Leg
    leftUpperLeg.rotation.x = -legWave * 0.95;
    leftUpperLeg.rotation.z = 0.04;
    // Knee flexes backward when trailing (legWave < 0 -> kick back)
    leftLowerLeg.rotation.x = legWave < 0 ? -legWave * 1.35 : 0.1;
    leftFoot.rotation.x = legWave < 0 ? -legWave * 0.35 : -0.15;

    // Right Leg
    rightUpperLeg.rotation.x = legWave * 0.95;
    rightUpperLeg.rotation.z = -0.04;
    // Knee flexes backward when trailing (legWave > 0 -> kick back)
    rightLowerLeg.rotation.x = legWave > 0 ? legWave * 1.35 : 0.1;
    rightFoot.rotation.x = legWave > 0 ? legWave * 0.35 : -0.15;

    // Arms: Shoulders, Elbows, and Hands (athletic sprint pump with forearms facing forward)
    leftUpperArm.rotation.set(legWave * 0.85, 0, LEFT_ARM_DOWN_Z);
    // Lower arm / elbow flexes forward (+Y rotation)
    leftLowerArm.rotation.set(0, 0.85 + Math.max(0, legWave) * 0.35, 0);
    leftHand.rotation.set(0, 0.15, 0);

    rightUpperArm.rotation.set(-legWave * 0.85, 0, RIGHT_ARM_DOWN_Z);
    rightLowerArm.rotation.set(0, -(0.85 + Math.max(0, -legWave) * 0.35), 0);
    rightHand.rotation.set(0, -0.15, 0);
  } else if (anim === 'walk') {
    const cycle = time * 8.0;
    const legWave = Math.sin(cycle);

    pelvis.position.y = BASE_PELVIS_Y + Math.abs(Math.sin(cycle * 2)) * 0.035;
    pelvis.rotation.y = legWave * 0.08;
    pelvis.rotation.z = -legWave * 0.02;

    lowerTorso.rotation.x = 0.03;
    lowerTorso.rotation.y = -legWave * 0.05;
    lowerTorso.rotation.z = legWave * 0.01;

    upperTorso.rotation.x = 0.04;
    upperTorso.rotation.y = -legWave * 0.05;
    upperTorso.rotation.z = legWave * 0.01;

    head.rotation.x = -0.04;
    head.rotation.y = 0;
    head.rotation.z = 0;

    // Walking stride with natural knee flexion
    leftUpperLeg.rotation.x = -legWave * 0.55;
    leftUpperLeg.rotation.z = 0.02;
    leftLowerLeg.rotation.x = legWave < 0 ? -legWave * 0.75 : 0.05;
    leftFoot.rotation.x = legWave < 0 ? -legWave * 0.2 : 0;

    rightUpperLeg.rotation.x = legWave * 0.55;
    rightUpperLeg.rotation.z = -0.02;
    rightLowerLeg.rotation.x = legWave > 0 ? legWave * 0.75 : 0.05;
    rightFoot.rotation.x = legWave > 0 ? legWave * 0.2 : 0;

    // Forearms face and bend forward
    leftUpperArm.rotation.set(legWave * 0.55, 0, LEFT_ARM_DOWN_Z);
    leftLowerArm.rotation.set(0, 0.45 + Math.max(0, legWave) * 0.2, 0);
    leftHand.rotation.set(0, 0, 0);

    rightUpperArm.rotation.set(-legWave * 0.55, 0, RIGHT_ARM_DOWN_Z);
    rightLowerArm.rotation.set(0, -(0.45 + Math.max(0, -legWave) * 0.2), 0);
    rightHand.rotation.set(0, 0, 0);
  } else if (anim === 'jump') {
    // Upgraded Physics-Driven Multi-Phase Jump (Takeoff Leap -> Apex Tuck & Float -> Descent & Land Ready)
    const effectiveVy = vy !== 0 ? vy : (Math.sin(animTime * 4.5) * 6.0);

    if (effectiveVy > 2.0) {
      // Phase 1: Ascent / Explosive Leap
      const liftFactor = Math.min(1.0, (effectiveVy - 2.0) / 7.0);
      pelvis.position.y = BASE_PELVIS_Y + 0.04 + liftFactor * 0.06;
      pelvis.rotation.set(0, 0, 0);

      // Spine extension / arched back
      lowerTorso.rotation.set(-0.06 - liftFactor * 0.06, 0, 0);
      upperTorso.rotation.set(-0.10 - liftFactor * 0.08, 0, 0);
      head.rotation.set(0.12, 0, 0);

      // Trailing extended legs with pointed toes
      leftUpperLeg.rotation.set(0.12, 0, 0.08);
      leftLowerLeg.rotation.set(0.08, 0, 0);
      leftFoot.rotation.set(0.40, 0, 0);

      rightUpperLeg.rotation.set(0.08, 0, -0.08);
      rightLowerLeg.rotation.set(0.12, 0, 0);
      rightFoot.rotation.set(0.40, 0, 0);

      // Explosive upward/backward arm drive for lift
      leftUpperArm.rotation.set(-0.65 - liftFactor * 0.35, 0, LEFT_ARM_DOWN_Z - 0.75);
      leftLowerArm.rotation.set(0, 0.65, 0);
      leftHand.rotation.set(0, 0.15, 0);

      rightUpperArm.rotation.set(-0.65 - liftFactor * 0.35, 0, RIGHT_ARM_DOWN_Z + 0.75);
      rightLowerArm.rotation.set(0, -0.65, 0);
      rightHand.rotation.set(0, -0.15, 0);
    } else if (effectiveVy >= -2.5) {
      // Phase 2: Apex Float & Aerodynamic Tuck
      pelvis.position.y = BASE_PELVIS_Y + 0.12;
      pelvis.rotation.set(0, 0, 0);

      lowerTorso.rotation.set(0.08, 0, 0);
      upperTorso.rotation.set(0.14, 0, 0);
      head.rotation.set(-0.14, 0, 0);

      // Deep knee tuck & athletic hang-time
      leftUpperLeg.rotation.set(-0.95, 0, 0.15);
      leftLowerLeg.rotation.set(1.45, 0, 0);
      leftFoot.rotation.set(0.15, 0, 0);

      rightUpperLeg.rotation.set(-0.85, 0, -0.15);
      rightLowerLeg.rotation.set(1.35, 0, 0);
      rightFoot.rotation.set(0.15, 0, 0);

      // Wide balanced parachute arms
      leftUpperArm.rotation.set(0.15, 0, 0.65);
      leftLowerArm.rotation.set(0, 0.85, 0);
      leftHand.rotation.set(0, 0.20, 0);

      rightUpperArm.rotation.set(0.15, 0, -0.65);
      rightLowerArm.rotation.set(0, -0.85, 0);
      rightHand.rotation.set(0, -0.20, 0);
    } else {
      // Phase 3: Descent & Impact Absorption Preparation
      const fallFactor = Math.min(1.0, (-effectiveVy - 2.5) / 12.0);
      pelvis.position.y = BASE_PELVIS_Y + 0.05;
      pelvis.rotation.set(0, 0, 0);

      lowerTorso.rotation.set(0.06, 0, 0);
      upperTorso.rotation.set(0.12, 0, 0);
      head.rotation.set(-0.06, 0, 0);

      // Legs descend downward with softened knees ready to absorb landing
      leftUpperLeg.rotation.set(-0.25 + fallFactor * 0.1, 0, 0.06);
      leftLowerLeg.rotation.set(0.45 + fallFactor * 0.15, 0, 0);
      leftFoot.rotation.set(-0.12, 0, 0);

      rightUpperLeg.rotation.set(-0.25 + fallFactor * 0.1, 0, -0.06);
      rightLowerLeg.rotation.set(0.45 + fallFactor * 0.15, 0, 0);
      rightFoot.rotation.set(-0.12, 0, 0);

      // Arms flare upward with air resistance
      leftUpperArm.rotation.set(-0.35 - fallFactor * 0.35, 0, 0.85 + fallFactor * 0.35);
      leftLowerArm.rotation.set(0, 0.70, 0);
      leftHand.rotation.set(0, 0.15, 0);

      rightUpperArm.rotation.set(-0.35 - fallFactor * 0.35, 0, -0.85 - fallFactor * 0.35);
      rightLowerArm.rotation.set(0, -0.70, 0);
      rightHand.rotation.set(0, -0.15, 0);
    }
  } else if (anim === 'kick') {
    // Upgraded 4-Phase Martial Arts Kick (Chamber -> Explosive Snap -> Apex Hold -> Rechamber Plant)
    const KICK_DURATION = 0.38;
    const progress = Math.min(1.0, animTime / KICK_DURATION);

    if (progress < 0.22) {
      // Phase 1: High Chamber & Coiling Windup
      const t = progress / 0.22;
      pelvis.position.y = BASE_PELVIS_Y - 0.04 * t;
      pelvis.rotation.set(0.04 * t, -0.32 * t, 0);

      lowerTorso.rotation.set(-0.06 * t, -0.12 * t, 0);
      upperTorso.rotation.set(-0.12 * t, -0.18 * t, 0);
      head.rotation.set(0.05 * t, 0.12 * t, 0);

      // Planted left supporting leg absorbs weight with bent knee
      leftUpperLeg.rotation.set(-0.15 * t, 0, 0.10 * t);
      leftLowerLeg.rotation.set(0.35 * t, 0, 0);
      leftFoot.rotation.set(0, 0, 0);

      // Striking right leg chambers up tight to chest
      rightUpperLeg.rotation.set(-1.25 * t, 0, -0.12 * t);
      rightLowerLeg.rotation.set(1.85 * t, 0, 0); // knee folded tight
      rightFoot.rotation.set(0.20 * t, 0, 0);

      // High boxing guard
      leftUpperArm.rotation.set(-0.55 * t, 0, LEFT_ARM_DOWN_Z - 0.55 * t);
      leftLowerArm.rotation.set(0, 1.25 * t, 0);
      leftHand.rotation.set(0, 0.25 * t, 0);

      rightUpperArm.rotation.set(0.25 * t, 0, RIGHT_ARM_DOWN_Z + 0.35 * t);
      rightLowerArm.rotation.set(0, -1.05 * t, 0);
      rightHand.rotation.set(0, -0.25 * t, 0);
    } else if (progress < 0.58) {
      // Phase 2: Explosive Forward Strike & Knee Snap
      const t = (progress - 0.22) / 0.36;
      const ease = 1 - Math.pow(1 - t, 3);

      pelvis.position.y = BASE_PELVIS_Y - 0.04 + 0.10 * ease;
      pelvis.rotation.set(0.04 - 0.08 * ease, -0.32 + 0.75 * ease, 0);

      lowerTorso.rotation.set(-0.06 - 0.12 * ease, -0.12 + 0.35 * ease, 0.05 * ease);
      upperTorso.rotation.set(-0.12 - 0.14 * ease, -0.18 + 0.45 * ease, 0.08 * ease);
      head.rotation.set(0.05 - 0.08 * ease, 0.12 - 0.35 * ease, 0);

      // Supporting left leg solid base
      leftUpperLeg.rotation.set(-0.15 + 0.25 * ease, 0, 0.10);
      leftLowerLeg.rotation.set(0.35 - 0.15 * ease, 0, 0);
      leftFoot.rotation.set(0, 0, 0);

      // Striking leg punches forward with knee unlocking to full straight extension
      rightUpperLeg.rotation.set(-1.25 - 0.40 * ease, 0, -0.12);
      rightLowerLeg.rotation.set(1.85 * (1.0 - ease), 0, 0);
      rightFoot.rotation.set(0.20 - 0.55 * ease, 0, 0);

      // Kinetic arm whip generating counter-torque
      leftUpperArm.rotation.set(-0.55, 0, LEFT_ARM_DOWN_Z - 0.55);
      leftLowerArm.rotation.set(0, 1.25, 0);
      leftHand.rotation.set(0, 0.25, 0);

      rightUpperArm.rotation.set(0.25 + 0.70 * ease, 0, RIGHT_ARM_DOWN_Z + 0.35 + 0.35 * ease);
      rightLowerArm.rotation.set(0, -1.05 + 0.35 * ease, 0);
      rightHand.rotation.set(0, -0.25, 0);
    } else if (progress < 0.78) {
      // Phase 3: Impact Apex Hold & Follow-Through
      pelvis.position.y = BASE_PELVIS_Y + 0.06;
      pelvis.rotation.set(-0.04, 0.43, 0);

      lowerTorso.rotation.set(-0.18, 0.23, 0.05);
      upperTorso.rotation.set(-0.26, 0.27, 0.08);
      head.rotation.set(-0.03, -0.23, 0);

      leftUpperLeg.rotation.set(0.10, 0, 0.10);
      leftLowerLeg.rotation.set(0.20, 0, 0);
      leftFoot.rotation.set(0, 0, 0);

      rightUpperLeg.rotation.set(-1.65, 0, -0.12);
      rightLowerLeg.rotation.set(0, 0, 0);
      rightFoot.rotation.set(-0.35, 0, 0);

      leftUpperArm.rotation.set(-0.55, 0, LEFT_ARM_DOWN_Z - 0.55);
      leftLowerArm.rotation.set(0, 1.25, 0);
      leftHand.rotation.set(0, 0.25, 0);

      rightUpperArm.rotation.set(0.95, 0, RIGHT_ARM_DOWN_Z + 0.70);
      rightLowerArm.rotation.set(0, -0.70, 0);
      rightHand.rotation.set(0, -0.25, 0);
    } else {
      // Phase 4: Chambered Retraction & Balanced Stance Recovery
      const t = (progress - 0.78) / 0.22;
      const smooth = t * t * (3 - 2 * t);

      pelvis.position.y = BASE_PELVIS_Y + 0.06 * (1.0 - smooth);
      pelvis.rotation.set(-0.04 * (1.0 - smooth), 0.43 * (1.0 - smooth), 0);

      lowerTorso.rotation.set(-0.18 * (1.0 - smooth), 0.23 * (1.0 - smooth), 0.05 * (1.0 - smooth));
      upperTorso.rotation.set(-0.26 * (1.0 - smooth), 0.27 * (1.0 - smooth), 0.08 * (1.0 - smooth));
      head.rotation.set(-0.03 * (1.0 - smooth), -0.23 * (1.0 - smooth), 0);

      leftUpperLeg.rotation.set(0.10 * (1.0 - smooth), 0, 0.10 * (1.0 - smooth));
      leftLowerLeg.rotation.set(0.20 * (1.0 - smooth), 0, 0);
      leftFoot.rotation.set(0, 0, 0);

      rightUpperLeg.rotation.set(-1.65 * (1.0 - smooth), 0, -0.12 * (1.0 - smooth));
      rightLowerLeg.rotation.set(0.45 * (1.0 - smooth), 0, 0);
      rightFoot.rotation.set(-0.35 * (1.0 - smooth), 0, 0);

      leftUpperArm.rotation.set(-0.55 * (1.0 - smooth), 0, LEFT_ARM_DOWN_Z - 0.55 * (1.0 - smooth));
      leftLowerArm.rotation.set(0, 0.40 + 0.85 * (1.0 - smooth), 0);
      leftHand.rotation.set(0, 0.25 * (1.0 - smooth), 0);

      rightUpperArm.rotation.set(0.95 * (1.0 - smooth), 0, RIGHT_ARM_DOWN_Z + 0.70 * (1.0 - smooth));
      rightLowerArm.rotation.set(0, -(0.40 + 0.30 * (1.0 - smooth)), 0);
      rightHand.rotation.set(0, -0.25 * (1.0 - smooth), 0);
    }
  } else if (anim === 'wave') {
    // Friendly greeting wave with articulated elbow and hand
    pelvis.position.y = BASE_PELVIS_Y;
    pelvis.rotation.set(0, 0, 0);

    lowerTorso.rotation.set(0, 0, 0);
    upperTorso.rotation.set(0, 0, 0);
    head.rotation.set(0, 0, 0.12);

    leftUpperLeg.rotation.set(0, 0, 0.02);
    leftLowerLeg.rotation.set(0, 0, 0);
    leftFoot.rotation.set(0, 0, 0);

    rightUpperLeg.rotation.set(0, 0, -0.02);
    rightLowerLeg.rotation.set(0, 0, 0);
    rightFoot.rotation.set(0, 0, 0);

    // Left arm relaxed down with forearm forward
    leftUpperArm.rotation.set(0, 0, LEFT_ARM_DOWN_Z);
    leftLowerArm.rotation.set(0, 0.35, 0);
    leftHand.rotation.set(0, 0, 0);

    // Right arm raised, waving
    const waveCycle = Math.sin(time * 11.0);
    rightUpperArm.rotation.set(0, 0, -0.65);
    rightLowerArm.rotation.set(0, -0.65, 0);
    rightHand.rotation.set(0, 0, waveCycle * 0.4);
  } else if (anim === 'dance') {
    const beat = time * 7.5;
    const sway = Math.sin(beat);
    const bounce = Math.abs(Math.sin(beat * 2));

    pelvis.position.y = BASE_PELVIS_Y + bounce * 0.06;
    pelvis.rotation.set(0, sway * 0.25, sway * 0.1);

    lowerTorso.rotation.set(-Math.sin(beat * 2) * 0.05, -sway * 0.15, -sway * 0.05);
    upperTorso.rotation.set(-Math.sin(beat * 2) * 0.06, -sway * 0.2, -sway * 0.08);
    head.rotation.set(0, sway * 0.15, -sway * 0.12);

    leftUpperLeg.rotation.set(-Math.sin(beat) * 0.25, 0, 0.04);
    leftLowerLeg.rotation.set(bounce * 0.5, 0, 0);
    leftFoot.rotation.set(0, 0, 0);

    rightUpperLeg.rotation.set(Math.sin(beat) * 0.25, 0, -0.04);
    rightLowerLeg.rotation.set(bounce * 0.5, 0, 0);
    rightFoot.rotation.set(0, 0, 0);

    leftUpperArm.rotation.set(Math.sin(beat) * 0.35, 0, LEFT_ARM_DOWN_Z - 0.2);
    leftLowerArm.rotation.set(0, 0.75 + Math.sin(beat) * 0.3, 0);
    leftHand.rotation.set(0, 0, Math.sin(beat * 2) * 0.25);

    rightUpperArm.rotation.set(-Math.sin(beat) * 0.35, 0, RIGHT_ARM_DOWN_Z + 0.2);
    rightLowerArm.rotation.set(0, -(0.75 + Math.sin(beat) * 0.3), 0);
    rightHand.rotation.set(0, 0, -Math.sin(beat * 2) * 0.25);
  } else if (anim === 'slip') {
    // Slipping and falling backward, legs flying up with flailing knees and elbows
    pelvis.position.y = BASE_PELVIS_Y * 0.6;
    pelvis.rotation.set(-1.1, 0, 0);

    lowerTorso.rotation.set(-0.15, 0, 0);
    upperTorso.rotation.set(-0.2, 0, 0);
    head.rotation.set(0.45, 0, 0);

    leftUpperLeg.rotation.set(-1.3, 0, 0.2);
    leftLowerLeg.rotation.set(0.65, 0, 0);
    leftFoot.rotation.set(0.3, 0, 0);

    rightUpperLeg.rotation.set(-1.5, 0, -0.2);
    rightLowerLeg.rotation.set(0.85, 0, 0);
    rightFoot.rotation.set(0.3, 0, 0);

    const flail = Math.sin(time * 16.0) * 0.3;
    leftUpperArm.rotation.set(flail, 0, 0.8);
    leftLowerArm.rotation.set(0, 0.8, 0);
    leftHand.rotation.set(0, 0, flail * 0.5);

    rightUpperArm.rotation.set(-flail, 0, -0.8);
    rightLowerArm.rotation.set(0, -0.8, 0);
    rightHand.rotation.set(0, 0, -flail * 0.5);
  } else {
    // Idle breathing & gentle resting stance with bent elbows and forearms facing forward
    const breath = Math.sin(time * 2.0);
    pelvis.position.y = BASE_PELVIS_Y + breath * 0.008;
    pelvis.rotation.set(0, 0, 0);

    lowerTorso.rotation.set(-breath * 0.01, Math.sin(time * 1.0) * 0.015, 0);
    upperTorso.rotation.set(-breath * 0.015, Math.sin(time * 1.0) * 0.02, 0);
    head.rotation.set(breath * 0.015, 0, 0);

    leftUpperLeg.rotation.set(0, 0, 0.02);
    leftLowerLeg.rotation.set(0.04, 0, 0);
    leftFoot.rotation.set(0, 0, 0);

    rightUpperLeg.rotation.set(0, 0, -0.02);
    rightLowerLeg.rotation.set(0.04, 0, 0);
    rightFoot.rotation.set(0, 0, 0);

    // Relaxed arms hanging down with forearms facing forward
    leftUpperArm.rotation.set(-breath * 0.02, 0, LEFT_ARM_DOWN_Z + breath * 0.015);
    leftLowerArm.rotation.set(0, 0.40, 0);
    leftHand.rotation.set(0, 0, 0);

    rightUpperArm.rotation.set(-breath * 0.02, 0, RIGHT_ARM_DOWN_Z - breath * 0.015);
    rightLowerArm.rotation.set(0, -0.40, 0);
    rightHand.rotation.set(0, 0, 0);
  }
}

export function updateStickmanColor(parts: StickmanMeshParts, hex: string) {
  const col = new THREE.Color(hex);
  if (parts.materials) {
    parts.materials.forEach((mat) => {
      mat.color.copy(col);
    });
  }
  if (parts.modelGroup) {
    parts.modelGroup.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.material && (mesh.material as THREE.MeshStandardMaterial).color) {
          (mesh.material as THREE.MeshStandardMaterial).color.copy(col);
        }
      }
    });
  }
}

export function createRetroNameSprite(text: string, accentHex: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 512, 128);
  ctx.font = '900 64px "Comic Neue", monospace, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 10;
  ctx.strokeText(text, 256, 64);
  
  ctx.fillStyle = accentHex || '#84cc16';
  ctx.fillText(text, 256, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 999;
  return sprite;
}

export function createRetroChatSprite(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 512, 128);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(16, 16, 480, 80);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 4;
  ctx.strokeRect(16, 16, 480, 80);
  ctx.beginPath();
  ctx.moveTo(256, 96);
  ctx.lineTo(240, 120);
  ctx.lineTo(272, 96);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 28px "Comic Neue", monospace, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 56);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 1000;
  return sprite;
}

export function updateNameTag(parts: StickmanMeshParts, name: string, colorHex: string) {
  const newSprite = createRetroNameSprite(name, colorHex);
  parts.nameTagSprite.material.map = newSprite.material.map;
  parts.nameTagSprite.material.needsUpdate = true;
}

export function updateChatBubble(parts: StickmanMeshParts, text: string) {
  if (!text) {
    parts.chatBubbleSprite.visible = false;
    return;
  }
  parts.chatBubbleSprite.visible = true;
  const newSprite = createRetroChatSprite(text);
  parts.chatBubbleSprite.material.map = newSprite.material.map;
  parts.chatBubbleSprite.material.needsUpdate = true;
}
