
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
    model.scale.set(0.18, 0.18, 0.18); 
    model.position.y = 0; model.rotation.x = -Math.PI / 2;
    
    // Cast shadows and make it metallic
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => { m.metalness = 1.0; m.roughness = 0.2; });
          } else {
            child.material.metalness = 1.0; child.material.roughness = 0.2;
          }
        }
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
  if (parts.mixer) {
    parts.mixer.update(dt);
    const anyParts = parts as any;
    if (anyParts.animations && anyParts.currentAnimName !== anim) {
      // Try to find the specific clip by name (case-insensitive-ish or exact)
      let clip = THREE.AnimationClip.findByName(anyParts.animations, anim);
      
      // If we can't find it, try some common capitalized names, or fallback to the first animation in the file
      if (!clip) {
        const titleCase = anim.charAt(0).toUpperCase() + anim.slice(1);
        clip = THREE.AnimationClip.findByName(anyParts.animations, titleCase);
      }
      if (!clip && (anim === 'walk' || anim === 'run')) {
         clip = anyParts.animations[0]; // fallback to whatever animation exists so they don't T-pose
      }

      if (clip) {
        const action = parts.mixer.clipAction(clip);
        if (anyParts.currentAction && anyParts.currentAction !== action) {
          anyParts.currentAction.crossFadeTo(action, 0.2, true);
        }
        action.reset().play();
        anyParts.currentAction = action;
        anyParts.currentAnimName = anim;
      }
    }
  }

  // ALways apply procedural movement to the root modelGroup!
  // This ensures that even if it's stuck in a T-pose (no skeletal anims), the character still bobs, leans, and jumps!
  if (parts.modelGroup) {
      if (anim === 'run') {
        const cycle = time * 14.5;
        parts.modelGroup.position.y = Math.abs(Math.sin(cycle)) * 0.15;
        parts.modelGroup.rotation.z = Math.sin(cycle) * 0.08;
        parts.modelGroup.rotation.x = 0.2;
      } else if (anim === 'walk') {
        const cycle = time * 8.5;
        parts.modelGroup.position.y = Math.abs(Math.sin(cycle)) * 0.08;
        parts.modelGroup.rotation.z = Math.sin(cycle) * 0.05;
        parts.modelGroup.rotation.x = 0.1;
      } else if (anim === 'jump') {
        parts.modelGroup.position.y = 0.25;
        parts.modelGroup.rotation.x = -0.1;
      } else if (anim === 'kick') {
        parts.modelGroup.position.y = 0.1;
        parts.modelGroup.rotation.x = -0.2;
        parts.modelGroup.rotation.z = 0.2;
      } else if (anim === 'slip') {
        parts.modelGroup.position.y = -0.15;
        parts.modelGroup.rotation.x = -Math.PI / 2.5;
      } else {
        const breath = Math.sin(time * 2.2);
        parts.modelGroup.position.y = breath * 0.03;
        parts.modelGroup.rotation.z = 0;
        parts.modelGroup.rotation.x = 0;
      }
  }
}

export function updateStickmanColor(parts: StickmanMeshParts, hex: string) {
  const col = new THREE.Color(hex);
  if (parts.modelGroup) {
    parts.modelGroup.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
             mesh.material.forEach(m => {
               if ((m as any).color) (m as any).color.copy(col);
             });
          } else {
             if ((mesh.material as any).color) (mesh.material as any).color.copy(col);
          }
        }
      }
    });
  }
}

export function createRetroNameSprite(text: string, accentHex: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 64);
  ctx.fillStyle = '#111827';
  ctx.fillRect(8, 10, 240, 44);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.strokeRect(8, 10, 240, 44);
  ctx.fillStyle = accentHex || '#84cc16';
  ctx.font = 'bold 22px "Comic Neue", monospace, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 32);
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
