const fs = require('fs');
let code = fs.readFileSync('src/game/StickmanModel.ts', 'utf8');

// The current StickmanModel generates a procedural rig. We need to swap this out to load the GLTF model.
// However, StickmanModel currently returns a synchronous StickmanMeshParts object containing limbs to animate via math.
// For a skeletal GLB, we use THREE.GLTFLoader and THREE.AnimationMixer. 
// Let's modify the file to handle both styles, or simply replace the blocky rig with the GLTF loader.
// Since createStickmanMesh must return instantly (synchronous), we'll return a shell object, and load the GLB asynchronously, attaching it to the root when ready.

const glbReplacement = `
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';

export interface StickmanMeshParts {
  root: THREE.Group;
  materials: THREE.Material[];
  nameTagSprite: THREE.Sprite;
  chatBubbleSprite: THREE.Sprite;
  shadowMesh: THREE.Mesh;
  mixer?: THREE.AnimationMixer;
  modelGroup?: THREE.Group;
}

export function createStickmanMesh(colorHex: string = '#383b42', name: string = 'Stickman'): StickmanMeshParts {
  const root = new THREE.Group();
  root.name = 'StickmanRoot';

  // We will load the GLB asynchronously and attach it to root.
  const modelGroup = new THREE.Group();
  root.add(modelGroup);

  const loader = new GLTFLoader();
  const parts: Partial<StickmanMeshParts> = {};

  loader.load('/2003.glb', (gltf) => {
    const model = gltf.scene;
    // Scale and position adjustment to match standard collision size
    model.scale.set(0.5, 0.5, 0.5); 
    model.position.y = 0;
    
    // Cast shadows
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    modelGroup.add(model);

    // Setup animation mixer if animations exist
    if (gltf.animations && gltf.animations.length > 0) {
      parts.mixer = new THREE.AnimationMixer(model);
      // We could store the clips if we want to play them by name, but for now we'll just store the mixer.
      (parts as any).animations = gltf.animations;
      
      // Try to play a default idle animation if one exists
      const idleClip = THREE.AnimationClip.findByName(gltf.animations, 'idle') || gltf.animations[0];
      if (idleClip) {
        parts.mixer.clipAction(idleClip).play();
      }
    }
  });

  // Drop shadow
  const shadowGeo = new THREE.CircleGeometry(0.5, 32);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.15,
    depthWrite: false,
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.y = 0.01;
  root.add(shadowMesh);

  // Name Tag
  const nameTagSprite = createRetroNameSprite(name, colorHex);
  nameTagSprite.position.set(0, 2.42, 0);
  nameTagSprite.scale.set(1.6, 0.4, 1);
  root.add(nameTagSprite);

  // Chat Bubble
  const chatBubbleSprite = createRetroChatSprite('');
  chatBubbleSprite.position.set(0, 2.92, 0);
  chatBubbleSprite.scale.set(2.2, 0.7, 1);
  chatBubbleSprite.visible = false;
  root.add(chatBubbleSprite);

  const finalParts: StickmanMeshParts = {
    root,
    materials: [],
    nameTagSprite,
    chatBubbleSprite,
    shadowMesh,
    modelGroup,
  };

  // We assign the mixer reference asynchronously if it gets created
  Object.defineProperty(finalParts, 'mixer', {
    get: () => parts.mixer,
  });
  Object.defineProperty(finalParts, 'animations', {
    get: () => (parts as any).animations,
  });

  return finalParts;
}

export function animateStickman(
  parts: StickmanMeshParts,
  time: number,
  anim: 'idle' | 'walk' | 'run' | 'jump' | 'kick' | 'wave' | 'dance' | 'slip',
  speed: number = 0,
  dt: number = 0
) {
  // If we have an animation mixer loaded from the GLB, update it
  if (parts.mixer) {
    parts.mixer.update(dt);
    
    // Simple state machine to blend animations if they are named properly in the GLB
    // This requires the GLB to have animations named 'idle', 'walk', 'run', etc.
    const anyParts = parts as any;
    if (anyParts.animations && anyParts.currentAnimName !== anim) {
      const clip = THREE.AnimationClip.findByName(anyParts.animations, anim);
      if (clip) {
        const action = parts.mixer.clipAction(clip);
        if (anyParts.currentAction) {
          anyParts.currentAction.crossFadeTo(action, 0.2, true);
        }
        action.reset().play();
        anyParts.currentAction = action;
        anyParts.currentAnimName = anim;
      }
    }
    return; // Skip procedural math if we are using skeletal animation
  }

  // Fallback procedural animation (bobbing) while loading
  if (parts.modelGroup) {
      if (anim === 'run') {
        const cycle = time * 14.5;
        parts.modelGroup.position.y = Math.abs(Math.sin(cycle)) * 0.1;
        parts.modelGroup.rotation.z = Math.sin(cycle) * 0.05;
      } else if (anim === 'walk') {
        const cycle = time * 8.5;
        parts.modelGroup.position.y = Math.abs(Math.sin(cycle)) * 0.05;
        parts.modelGroup.rotation.z = Math.sin(cycle) * 0.03;
      } else if (anim === 'jump') {
        parts.modelGroup.position.y = 0.2;
      } else {
        const breath = Math.sin(time * 2.2);
        parts.modelGroup.position.y = breath * 0.02;
        parts.modelGroup.rotation.z = 0;
      }
  }
}
`;

// Replace everything above updateStickmanColor with the new glbReplacement
const colorUpdateIndex = code.indexOf('export function updateStickmanColor');
let remainingCode = code.substring(colorUpdateIndex);
// The remaining code has createRetroNameSprite etc which we still need.
fs.writeFileSync('src/game/StickmanModel.ts', glbReplacement + '\n' + remainingCode);
