const fs = require('fs');
let code = fs.readFileSync('src/game/StickmanModel.ts', 'utf8');

// The user wants to "change the rig". A classic Roblox R6 style "Blocky" rig uses box geometries instead of capsules/spheres.
// Let's replace CapsuleGeometry and SphereGeometry with BoxGeometry for that classic blocky builder style.

const boxRig = `
  const bodyGroup = new THREE.Group();
  bodyGroup.position.y = 0;
  root.add(bodyGroup);

  // BLOCKY RIG: Roblox R6 style dimensions
  // Torso: 2x2x1 in roblox units, let's scale to our game (e.g. 0.8 width, 0.8 height, 0.4 depth)
  const torsoW = 0.8, torsoH = 0.8, torsoD = 0.4;
  const torsoGeo = new THREE.BoxGeometry(torsoW, torsoH, torsoD);
  const torso = new THREE.Mesh(torsoGeo, mainMaterial);
  torso.castShadow = true;
  torso.receiveShadow = true;
  torso.position.y = 1.0;
  bodyGroup.add(torso);

  const neckGeo = new THREE.BufferGeometry();
  const neck = new THREE.Mesh(neckGeo, mainMaterial);
  neck.visible = false;
  bodyGroup.add(neck);

  // Head: 1x1x1 (0.4x0.4x0.4 in our scale)
  const headSize = 0.45;
  const headGeo = new THREE.BoxGeometry(headSize, headSize, headSize);
  const head = new THREE.Mesh(headGeo, mainMaterial);
  head.castShadow = true;
  head.receiveShadow = true;
  head.position.y = 1.625; // torsoY (1.0) + halfTorsoH (0.4) + halfHead (0.225)
  bodyGroup.add(head);

  // Arms: 1x2x1
  const armW = 0.35, armH = 0.8, armD = 0.35;
  const armGeo = new THREE.BoxGeometry(armW, armH, armD);

  // Legs: 1x2x1
  const legW = 0.38, legH = 0.8, legD = 0.38;
  const legGeo = new THREE.BoxGeometry(legW, legH, legD);

  const leftUpperArm = new THREE.Group();
  leftUpperArm.position.set(torsoW/2 + armW/2 + 0.02, 1.4, 0);
  bodyGroup.add(leftUpperArm);
  const leftArmMesh = new THREE.Mesh(armGeo, mainMaterial);
  leftArmMesh.castShadow = true;
  leftArmMesh.receiveShadow = true;
  leftArmMesh.position.y = -armH / 2 + 0.1; // joint near the top
  leftUpperArm.add(leftArmMesh);
  const leftLowerArm = new THREE.Group();
  leftUpperArm.add(leftLowerArm);

  const rightUpperArm = new THREE.Group();
  rightUpperArm.position.set(-(torsoW/2 + armW/2 + 0.02), 1.4, 0);
  bodyGroup.add(rightUpperArm);
  const rightArmMesh = new THREE.Mesh(armGeo, mainMaterial);
  rightArmMesh.castShadow = true;
  rightArmMesh.receiveShadow = true;
  rightArmMesh.position.y = -armH / 2 + 0.1;
  rightUpperArm.add(rightArmMesh);
  const rightLowerArm = new THREE.Group();
  rightUpperArm.add(rightLowerArm);

  const leftUpperLeg = new THREE.Group();
  leftUpperLeg.position.set(legW/2 + 0.01, 0.6, 0); // torso bottom is at 0.6
  bodyGroup.add(leftUpperLeg);
  const leftLegMesh = new THREE.Mesh(legGeo, mainMaterial);
  leftLegMesh.castShadow = true;
  leftLegMesh.receiveShadow = true;
  leftLegMesh.position.y = -legH / 2 + 0.1;
  leftUpperLeg.add(leftLegMesh);
  const leftLowerLeg = new THREE.Group();
  leftUpperLeg.add(leftLowerLeg);

  const rightUpperLeg = new THREE.Group();
  rightUpperLeg.position.set(-(legW/2 + 0.01), 0.6, 0);
  bodyGroup.add(rightUpperLeg);
  const rightLegMesh = new THREE.Mesh(legGeo, mainMaterial);
  rightLegMesh.castShadow = true;
  rightLegMesh.receiveShadow = true;
  rightLegMesh.position.y = -legH / 2 + 0.1;
  rightUpperLeg.add(rightLegMesh);
  const rightLowerLeg = new THREE.Group();
  rightUpperLeg.add(rightLowerLeg);
`;

const oldRigRegex = /const bodyGroup = new THREE\.Group\(\);[\s\S]*?rightUpperLeg\.add\(rightLowerLeg\);/m;
code = code.replace(oldRigRegex, boxRig);

fs.writeFileSync('src/game/StickmanModel.ts', code);
