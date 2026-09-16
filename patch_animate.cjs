const fs = require('fs');
let code = fs.readFileSync('src/game/StickmanModel.ts', 'utf8');

const startIdx = code.indexOf('export function animateStickman');
const before = code.substring(0, startIdx);

const newFn = `export function animateStickman(
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
    return;
  }

  if (parts.modelGroup) {
      if (anim === 'run') {
        const cycle = time * 14.5;
        parts.modelGroup.position.y = Math.abs(Math.sin(cycle)) * 0.15;
        parts.modelGroup.rotation.z = Math.sin(cycle) * 0.08;
        parts.modelGroup.rotation.x = 0.1;
      } else if (anim === 'walk') {
        const cycle = time * 8.5;
        parts.modelGroup.position.y = Math.abs(Math.sin(cycle)) * 0.08;
        parts.modelGroup.rotation.z = Math.sin(cycle) * 0.05;
        parts.modelGroup.rotation.x = 0.05;
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
`;

fs.writeFileSync('src/game/StickmanModel.ts', before + newFn);
