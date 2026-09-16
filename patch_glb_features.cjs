const fs = require('fs');
let code = fs.readFileSync('src/game/StickmanModel.ts', 'utf8');

// 1. Make it smaller
code = code.replace(/model\.scale\.set\(0\.5, 0\.5, 0\.5\);/, 'model.scale.set(0.35, 0.35, 0.35);');

// 2. Make it metallic in the loader
const metallicSnippet = `
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
`;
code = code.replace(/\/\/ Cast shadows[\s\S]*?\}\);/m, metallicSnippet.trim());

// 3. Fallback animations apply to limbs if we can find them, but it's a single mesh probably.
// We'll leave the procedural bobbing but make it more pronounced.
const oldFallback = /if \(parts\.modelGroup\) \{[\s\S]*?\}$/m;
const newFallback = `
  if (parts.modelGroup) {
      if (anim === 'run') {
        const cycle = time * 14.5;
        parts.modelGroup.position.y = Math.abs(Math.sin(cycle)) * 0.15;
        parts.modelGroup.rotation.z = Math.sin(cycle) * 0.08;
        parts.modelGroup.rotation.x = 0.1; // lean forward
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
`;
// Need to find where the procedural fallback starts. It's after `return; // Skip procedural math`
code = code.replace(/if \(parts\.modelGroup\) \{[\s\S]*?(?=\n\s*\})$/m, newFallback.trim());

fs.writeFileSync('src/game/StickmanModel.ts', code);
