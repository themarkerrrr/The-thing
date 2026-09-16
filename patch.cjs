const fs = require('fs');
let code = fs.readFileSync('src/components/SandboxGame.tsx', 'utf8');

// 1. Change scene background and fog
code = code.replace(
  /scene\.background = new THREE\.Color\('#e2e8f0'\);[^\n]*\n[^\n]*scene\.fog = new THREE\.FogExp2\('#e2e8f0', 0\.012\);/,
  `scene.background = new THREE.Color('#ffffff');\n    scene.fog = new THREE.FogExp2('#ffffff', 0.02);`
);

// 2. Change hemisphere light
code = code.replace(
  /const hemiLight = new THREE\.HemisphereLight\(0xffffff, 0x94a3b8, 0\.85\);/,
  `const hemiLight = new THREE.HemisphereLight(0xffffff, 0xcbd5e1, 0.85);`
);

// 3. Update floor and remove walls
const floorStart = code.indexOf('// Tiled White Arena Floor');
const localPartsStart = code.indexOf('// Create Local Stickman Mesh');

const newFloorCode = `// Tiled White Arena Floor (Infinite Grid)
    const floorSize = 1000; // Large enough to fade into fog
    const floorGeom = new THREE.PlaneGeometry(floorSize, floorSize);

    const floorCanvas = document.createElement('canvas');
    floorCanvas.width = 512;
    floorCanvas.height = 512;
    const fCtx = floorCanvas.getContext('2d');
    if (fCtx) {
      fCtx.fillStyle = '#ffffff';
      fCtx.fillRect(0, 0, 512, 512);
      fCtx.strokeStyle = '#e2e8f0'; // Faint grid lines
      fCtx.lineWidth = 3;
      const gridSize = 64;
      for (let x = 0; x <= 512; x += gridSize) {
        fCtx.beginPath();
        fCtx.moveTo(x, 0);
        fCtx.lineTo(x, 512);
        fCtx.stroke();
      }
      for (let y = 0; y <= 512; y += gridSize) {
        fCtx.beginPath();
        fCtx.moveTo(0, y);
        fCtx.lineTo(512, y);
        fCtx.stroke();
      }
    }

    const floorTexture = new THREE.CanvasTexture(floorCanvas);
    floorTexture.wrapS = THREE.RepeatWrapping;
    floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(floorSize / 4, floorSize / 4);

    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTexture,
      roughness: 0.8,
      metalness: 0.1,
    });
    const floorMesh = new THREE.Mesh(floorGeom, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);
    groundMeshRef.current = floorMesh;

    `;

code = code.substring(0, floorStart) + newFloorCode + code.substring(localPartsStart);

// 4. Update scale to 2
code = code.replace(
  /const scale = 1\.5;/,
  `const scale = 2;`
);

fs.writeFileSync('src/components/SandboxGame.tsx', code);
