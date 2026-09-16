const fs = require('fs');
let code = fs.readFileSync('src/game/StickmanModel.ts', 'utf8');

// We need to apply the color to the GLTF model meshes.
// Since materials array might be empty initially, we can traverse the modelGroup.

const newColorFn = `
export function updateStickmanColor(parts: StickmanMeshParts, hex: string) {
  const col = new THREE.Color(hex);
  if (parts.modelGroup) {
    parts.modelGroup.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.material) {
          // If it's an array of materials
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
`;

const oldColorFnRegex = /export function updateStickmanColor\([\s\S]*?\}\n\}/m;
code = code.replace(oldColorFnRegex, newColorFn.trim());

fs.writeFileSync('src/game/StickmanModel.ts', code);
