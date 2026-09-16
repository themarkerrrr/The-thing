const fs = require('fs');

let code = fs.readFileSync('src/game/StickmanModel.ts', 'utf8');

const startIdx = code.indexOf('export function createStickmanMesh');
const endIdx = code.indexOf('export function updateStickmanColor');

const newFunc = `export function createStickmanMesh(colorHex: string = '#383b42', name: string = 'Stickman'): StickmanMeshParts {
  const root = new THREE.Group();
  root.name = 'StickmanRoot';

  const baseColor = new THREE.Color(colorHex);
  const mainMaterial = new THREE.MeshStandardMaterial({
    color: baseColor,
    roughness: 0.14,
    metalness: 0.82,
  });

  const materials: THREE.MeshStandardMaterial[] = [mainMaterial];

  const bodyGroup = new THREE.Group();
  bodyGroup.position.y = 0.9;
  root.add(bodyGroup);

  const createJoint = (r: number) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 24), mainMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  const createBone = (r: number, len: number) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 24), mainMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.y = -len / 2;
    return mesh;
  };

  // Torso (a blobby main body made of a large capsule)
  const torsoRadius = 0.28;
  const torsoLength = 0.45;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(torsoRadius, torsoLength, 24, 24), mainMaterial);
  torso.castShadow = true;
  torso.receiveShadow = true;
  bodyGroup.add(torso);

  // Neck
  const neck = createBone(0.12, 0.2);
  neck.position.y = torsoLength / 2 + torsoRadius;
  bodyGroup.add(neck);

  // Head
  const head = createJoint(0.32);
  head.position.y = 0.2 + 0.2;
  neck.add(head);

  // Arm settings
  const armRadius = 0.12;
  const upperArmLength = 0.4;
  const lowerArmLength = 0.4;

  const leftUpperArm = new THREE.Group();
  leftUpperArm.position.set(torsoRadius + 0.05, torsoLength / 2, 0);
  bodyGroup.add(leftUpperArm);
  leftUpperArm.add(createJoint(armRadius * 1.1)); // Shoulder
  leftUpperArm.add(createBone(armRadius, upperArmLength));

  const leftLowerArm = new THREE.Group();
  leftLowerArm.position.y = -upperArmLength;
  leftUpperArm.add(leftLowerArm);
  leftLowerArm.add(createJoint(armRadius * 1.05)); // Elbow
  leftLowerArm.add(createBone(armRadius, lowerArmLength));
  const lHand = createJoint(armRadius * 1.1);
  lHand.position.y = -lowerArmLength;
  leftLowerArm.add(lHand);

  const rightUpperArm = new THREE.Group();
  rightUpperArm.position.set(-torsoRadius - 0.05, torsoLength / 2, 0);
  bodyGroup.add(rightUpperArm);
  rightUpperArm.add(createJoint(armRadius * 1.1)); // Shoulder
  rightUpperArm.add(createBone(armRadius, upperArmLength));

  const rightLowerArm = new THREE.Group();
  rightLowerArm.position.y = -upperArmLength;
  rightUpperArm.add(rightLowerArm);
  rightLowerArm.add(createJoint(armRadius * 1.05)); // Elbow
  rightLowerArm.add(createBone(armRadius, lowerArmLength));
  const rHand = createJoint(armRadius * 1.1);
  rHand.position.y = -lowerArmLength;
  rightLowerArm.add(rHand);

  // Leg settings
  const legRadius = 0.14;
  const upperLegLength = 0.45;
  const lowerLegLength = 0.45;

  const leftUpperLeg = new THREE.Group();
  leftUpperLeg.position.set(0.15, -torsoLength / 2 - torsoRadius * 0.5, 0);
  bodyGroup.add(leftUpperLeg);
  leftUpperLeg.add(createJoint(legRadius * 1.1)); // Hip
  leftUpperLeg.add(createBone(legRadius, upperLegLength));

  const leftLowerLeg = new THREE.Group();
  leftLowerLeg.position.y = -upperLegLength;
  leftUpperLeg.add(leftLowerLeg);
  leftLowerLeg.add(createJoint(legRadius * 1.05)); // Knee
  leftLowerLeg.add(createBone(legRadius, lowerLegLength));
  const lFoot = createJoint(legRadius * 1.1);
  lFoot.position.y = -lowerLegLength;
  leftLowerLeg.add(lFoot);

  const rightUpperLeg = new THREE.Group();
  rightUpperLeg.position.set(-0.15, -torsoLength / 2 - torsoRadius * 0.5, 0);
  bodyGroup.add(rightUpperLeg);
  rightUpperLeg.add(createJoint(legRadius * 1.1)); // Hip
  rightUpperLeg.add(createBone(legRadius, upperLegLength));

  const rightLowerLeg = new THREE.Group();
  rightLowerLeg.position.y = -upperLegLength;
  rightUpperLeg.add(rightLowerLeg);
  rightLowerLeg.add(createJoint(legRadius * 1.05)); // Knee
  rightLowerLeg.add(createBone(legRadius, lowerLegLength));
  const rFoot = createJoint(legRadius * 1.1);
  rFoot.position.y = -lowerLegLength;
  rightLowerLeg.add(rFoot);

  // Contact Shadow underneath
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const sctx = shadowCanvas.getContext('2d');
  if (sctx) {
    const grad = sctx.createRadialGradient(64, 64, 10, 64, 64, 60);
    grad.addColorStop(0, 'rgba(15,20,25,0.75)');
    grad.addColorStop(0.4, 'rgba(25,30,40,0.38)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, 128, 128);
  }
  const shadowTex = new THREE.CanvasTexture(shadowCanvas);
  shadowTex.minFilter = THREE.NearestFilter;
  shadowTex.magFilter = THREE.NearestFilter;

  const shadowGeo = new THREE.PlaneGeometry(1.7, 1.7);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.position.y = 0.01;
  root.add(shadowMesh);

  // Retro Comic Nametag sprite
  const nameTagSprite = createRetroNameSprite(name, colorHex);
  nameTagSprite.position.set(0, 2.7, 0);
  nameTagSprite.scale.set(1.6, 0.4, 1);
  root.add(nameTagSprite);

  // Comic Chat bubble sprite
  const chatBubbleSprite = createRetroChatSprite('');
  chatBubbleSprite.position.set(0, 3.2, 0);
  chatBubbleSprite.scale.set(2.2, 0.7, 1);
  chatBubbleSprite.visible = false;
  root.add(chatBubbleSprite);

  return {
    root,
    bodyGroup,
    head,
    neck,
    torso,
    leftUpperArm,
    leftLowerArm,
    rightUpperArm,
    rightLowerArm,
    leftUpperLeg,
    leftLowerLeg,
    rightUpperLeg,
    rightLowerLeg,
    materials,
    nameTagSprite,
    chatBubbleSprite,
    shadowMesh,
  };
}
`;

const newCode = code.substring(0, startIdx) + newFunc + code.substring(endIdx);
fs.writeFileSync('src/game/StickmanModel.ts', newCode);
