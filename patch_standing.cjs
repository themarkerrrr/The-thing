const fs = require('fs');

let code = fs.readFileSync('src/components/SandboxGame.tsx', 'utf8');

// 1. Increase jump heights
code = code.replace(/p\.vy = 5\.0;/g, 'p.vy = 8.5;');
code = code.replace(/p\.vy = 10\.0;/g, 'p.vy = 18.0;'); // trampoline

// 2. Add floorY logic
const physicsLogicOriginal = `
      p.vy -= 9.81 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      if (p.y <= 0) {
        p.y = 0;
        p.vy = 0;
        p.isGrounded = true;
        if (p.anim === 'jump') {
          p.anim = inputLen > 0.05 ? (isSprinting ? 'run' : 'walk') : 'idle';
        }
      }
`;

const physicsLogicNew = `
      // Calculate dynamic floorY by checking overlapping physics objects
      let floorY = 0;
      const playerRadius = 0.25;
      
      for (const [, item] of physicsObjectsRef.current) {
        if (item.data.type === 'trampoline') continue; // Handled separately
        
        const px = item.mesh.position.x;
        const py = item.mesh.position.y;
        const pz = item.mesh.position.z;
        const size = item.data.size;
        
        let halfW = size[0] / 2;
        let halfH = size[1] / 2;
        let halfD = size[2] / 2;
        
        if (item.data.type === 'sphere') {
          halfW = size[0]; halfH = size[0]; halfD = size[0];
        } else if (item.data.type === 'ramp') {
          // Approximate ramp as a flat box for standing logic
          halfW = size[0] / 2; halfH = size[1] / 2; halfD = size[2] / 2;
        }
        
        const dx = Math.abs(p.x - px);
        const dz = Math.abs(p.z - pz);
        
        if (dx < halfW + playerRadius && dz < halfD + playerRadius) {
          const topY = py + halfH;
          // Only stand on it if we are falling onto it or already on it (feet above object center)
          if (p.y >= py - 0.2) {
            floorY = Math.max(floorY, topY);
          }
        }
      }

      p.vy -= 18 * dt; // slightly stronger gravity for snappier jumps
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      if (p.y <= floorY) {
        p.y = floorY;
        p.vy = Math.max(0, p.vy);
        p.isGrounded = true;
        if (p.anim === 'jump') {
          p.anim = inputLen > 0.05 ? (isSprinting ? 'run' : 'walk') : 'idle';
        }
      } else {
        p.isGrounded = false;
      }
`;

code = code.replace(physicsLogicOriginal.trim(), physicsLogicNew.trim());

fs.writeFileSync('src/components/SandboxGame.tsx', code);
