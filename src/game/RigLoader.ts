import * as THREE from 'three';
import { USDLoader } from 'three/examples/jsm/loaders/USDLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { StickmanMeshParts } from './StickmanModel.ts';

export async function applyCustomModelToParts(
  model: THREE.Object3D,
  parts: StickmanMeshParts,
  animations: THREE.AnimationClip[] = []
) {
  // Hide the default stickman body
  parts.bodyGroup.visible = false;

  // Remove previous custom model if any
  if (parts.customModel) {
    parts.root.remove(parts.customModel);
  }

  // Traverse to enable shadows and clean materials
  model.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });

  // Calculate bounding box to normalize scale to ~1.85m height
  const bbox = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const center = new THREE.Vector3();
  bbox.getCenter(center);

  const targetHeight = 1.85;
  const currentHeight = size.y || 1;
  const scaleFactor = targetHeight / currentHeight;

  model.scale.multiplyScalar(scaleFactor);

  // Re-compute bbox after scale to position on the ground
  const scaledBbox = new THREE.Box3().setFromObject(model);
  const minY = scaledBbox.min.y;
  const scaledCenter = new THREE.Vector3();
  scaledBbox.getCenter(scaledCenter);

  // Center on X/Z and align bottom to y=0
  model.position.x = -scaledCenter.x;
  model.position.z = -scaledCenter.z;
  model.position.y = -minY;

  const wrapper = new THREE.Group();
  wrapper.name = 'CustomRigWrapper';
  wrapper.add(model);

  parts.root.add(wrapper);
  parts.customModel = wrapper;

  // Adjust nametag and chat bubble above custom model
  const topY = scaledBbox.max.y - minY;
  parts.nameTagSprite.position.set(0, topY + 0.35, 0);
  parts.chatBubbleSprite.position.set(0, topY + 0.85, 0);

  // Setup AnimationMixer if clips exist
  if (animations && animations.length > 0) {
    const mixer = new THREE.AnimationMixer(model);
    parts.mixer = mixer;
    const actions: { [key: string]: THREE.AnimationAction } = {};
    for (const clip of animations) {
      actions[clip.name.toLowerCase()] = mixer.clipAction(clip);
    }
    parts.actions = actions;

    // Play the first idle/walk animation if available
    const firstAction = Object.values(actions)[0];
    if (firstAction) {
      firstAction.play();
    }
  }

  return wrapper;
}

export async function loadModelFromUrl(url: string, parts: StickmanMeshParts): Promise<boolean> {
  try {
    const lower = url.toLowerCase();
    if (lower.endsWith('.usdz') || lower.endsWith('.usd')) {
      const loader = new USDLoader();
      const model = await loader.loadAsync(url);
      await applyCustomModelToParts(model, parts);
      return true;
    } else {
      // GLTF / GLB
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(url);
      await applyCustomModelToParts(gltf.scene, parts, gltf.animations);
      return true;
    }
  } catch (err) {
    console.warn(`Could not load custom model from ${url}:`, err);
    return false;
  }
}

export async function loadModelFromFile(file: File, parts: StickmanMeshParts): Promise<boolean> {
  const blobUrl = URL.createObjectURL(file);
  try {
    const name = file.name.toLowerCase();
    let success = false;
    if (name.endsWith('.usdz') || name.endsWith('.usd')) {
      const loader = new USDLoader();
      const model = await loader.loadAsync(blobUrl);
      await applyCustomModelToParts(model, parts);
      success = true;
    } else {
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(blobUrl);
      await applyCustomModelToParts(gltf.scene, parts, gltf.animations);
      success = true;
    }
    return success;
  } catch (err) {
    console.error('Failed to parse uploaded 3D model:', err);
    throw err;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

export async function autoCheckDefaultCustomRig(parts: StickmanMeshParts): Promise<boolean> {
  const candidates = ['/scene.usdz', '/scene.glb', '/model.usdz', '/model.glb'];
  for (const path of candidates) {
    try {
      const res = await fetch(path, { method: 'HEAD' });
      if (res.ok) {
        console.log(`Found custom rig at ${path}! Loading...`);
        const loaded = await loadModelFromUrl(path, parts);
        if (loaded) return true;
      }
    } catch {
      // Ignore network errors on candidate checks
    }
  }
  return false;
}
