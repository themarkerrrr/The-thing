const fs = require('fs');
let code = fs.readFileSync('src/game/StickmanModel.ts', 'utf8');

// 1. Scale down
code = code.replace(/model\.scale\.set\(0\.35, 0\.35, 0\.35\);/g, 'model.scale.set(0.18, 0.18, 0.18);');

// 2. Fix the animate function so it doesn't return early if a mixer exists, allowing procedural fallback to still move the model around
const newAnimate = `export function animateStickman(
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
}`;

const oldAnimateRegex = /export function animateStickman\([\s\S]*?\}\n\}/m;
code = code.replace(oldAnimateRegex, newAnimate);

fs.writeFileSync('src/game/StickmanModel.ts', code);
