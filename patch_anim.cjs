const fs = require('fs');

let code = fs.readFileSync('src/game/StickmanModel.ts', 'utf8');

const startIdx = code.indexOf('export function animateStickman');
const endIdx = code.indexOf('\n}', startIdx) + 2;

const newAnim = `export function animateStickman(
  parts: StickmanMeshParts,
  time: number,
  anim: 'idle' | 'walk' | 'run' | 'jump' | 'kick' | 'wave' | 'dance' | 'slip',
  speed: number = 0
) {
  const {
    bodyGroup,
    head,
    torso,
    leftUpperArm,
    leftLowerArm,
    rightUpperArm,
    rightLowerArm,
    leftUpperLeg,
    leftLowerLeg,
    rightUpperLeg,
    rightLowerLeg,
    shadowMesh,
  } = parts;

  const BASE_Y = 1.42;

  // Reset default baselines
  head.rotation.set(0, 0, 0);
  torso.rotation.set(0, 0, 0);
  torso.scale.set(1, 1, 1);
  bodyGroup.position.set(0, BASE_Y, 0);
  bodyGroup.rotation.set(0, 0, 0);

  // Keep dummy interface limbs zeroed by default
  leftLowerArm.rotation.set(0, 0, 0);
  rightLowerArm.rotation.set(0, 0, 0);
  leftLowerLeg.rotation.set(0, 0, 0);
  rightLowerLeg.rotation.set(0, 0, 0);

  if (anim === 'kick') {
    bodyGroup.position.y = BASE_Y + 0.02;
    bodyGroup.rotation.x = -0.28;
    bodyGroup.rotation.y = 0.20;
    bodyGroup.rotation.z = -0.12;

    torso.rotation.x = -0.16;
    torso.rotation.y = 0.10;

    rightUpperLeg.rotation.set(1.62, -0.05, -0.10);
    rightLowerLeg.rotation.set(-0.1, 0, 0); // straight kick

    leftUpperLeg.rotation.set(-0.35, 0, 0.16);
    leftLowerLeg.rotation.set(0.3, 0, 0); // slightly bent planted leg

    rightUpperArm.rotation.set(-0.90, -0.15, -0.50);
    rightLowerArm.rotation.set(-0.5, 0, 0);

    leftUpperArm.rotation.set(0.72, 0.20, 0.40);
    leftLowerArm.rotation.set(-1.0, 0, 0); // bent guard

    head.rotation.set(0.32, 0.14, 0.08);
    shadowMesh.scale.set(0.9, 0.9, 0.9);
  } else if (anim === 'jump') {
    bodyGroup.position.y = BASE_Y + 0.54;
    bodyGroup.rotation.x = 0.08;

    leftUpperLeg.rotation.set(-0.38, 0, 0.10);
    leftLowerLeg.rotation.set(0.8, 0, 0);

    rightUpperLeg.rotation.set(-0.38, 0, -0.10);
    rightLowerLeg.rotation.set(0.8, 0, 0);

    leftUpperArm.rotation.set(2.20, 0, 0.95);
    leftLowerArm.rotation.set(-0.2, 0, 0);

    rightUpperArm.rotation.set(2.20, 0, -0.95);
    rightLowerArm.rotation.set(-0.2, 0, 0);

    head.rotation.set(-0.18, 0, 0);
    shadowMesh.scale.set(0.60, 0.60, 0.60);
  } else if (anim === 'run') {
    const cycle = time * 14.5;
    const stride = 0.88;
    const lAngle = Math.sin(cycle) * stride;
    const bounce = Math.abs(Math.sin(cycle)) * 0.065;

    bodyGroup.position.y = BASE_Y + bounce;
    bodyGroup.rotation.z = Math.sin(cycle) * 0.05;

    torso.rotation.x = 0.25;
    torso.rotation.y = -Math.sin(cycle) * 0.18;

    leftUpperLeg.rotation.set(lAngle, 0, 0.03);
    // bend knee when swinging backward
    leftLowerLeg.rotation.set(lAngle < 0 ? -lAngle * 1.5 : 0.1, 0, 0);

    rightUpperLeg.rotation.set(-lAngle, 0, -0.03);
    rightLowerLeg.rotation.set(-lAngle < 0 ? lAngle * 1.5 : 0.1, 0, 0);

    leftUpperArm.rotation.set(-lAngle * 0.95, 0, 0.15);
    leftLowerArm.rotation.set(-1.2, 0, 0); // bent elbow

    rightUpperArm.rotation.set(lAngle * 0.95, 0, -0.15);
    rightLowerArm.rotation.set(-1.2, 0, 0);

    head.rotation.set(-0.08, Math.sin(cycle) * 0.06, 0);
    shadowMesh.scale.set(1.0, 1.0, 1.0);
  } else if (anim === 'walk') {
    const cycle = time * 8.5;
    const lAngle = Math.sin(cycle) * 0.52;
    const bob = Math.abs(Math.sin(cycle)) * 0.038;

    bodyGroup.position.y = BASE_Y + bob;
    bodyGroup.rotation.z = Math.sin(cycle) * 0.03;

    torso.rotation.x = 0.06;
    torso.rotation.y = -Math.sin(cycle) * 0.12;

    leftUpperLeg.rotation.set(lAngle, 0, 0.01);
    leftLowerLeg.rotation.set(lAngle < 0 ? -lAngle : 0.05, 0, 0);

    rightUpperLeg.rotation.set(-lAngle, 0, -0.01);
    rightLowerLeg.rotation.set(-lAngle < 0 ? lAngle : 0.05, 0, 0);

    leftUpperArm.rotation.set(-lAngle * 0.72, 0, 0.10);
    leftLowerArm.rotation.set(-0.5, 0, 0);

    rightUpperArm.rotation.set(lAngle * 0.72, 0, -0.10);
    rightLowerArm.rotation.set(-0.5, 0, 0);

    head.rotation.set(bob * 0.4, Math.sin(cycle) * 0.06, 0);
    shadowMesh.scale.set(1.0, 1.0, 1.0);
  } else if (anim === 'wave') {
    bodyGroup.position.y = BASE_Y + Math.sin(time * 3) * 0.015;

    leftUpperLeg.rotation.set(0, 0, 0.01);
    rightUpperLeg.rotation.set(0, 0, -0.01);

    leftUpperArm.rotation.set(0.08, 0, 0.10);
    leftLowerArm.rotation.set(-0.1, 0, 0);

    rightUpperArm.rotation.set(0, 0, -2.45 + Math.sin(time * 8.5) * 0.38);
    rightLowerArm.rotation.set(-0.2, 0, 0);

    head.rotation.set(0, 0, 0.14 + Math.sin(time * 3) * 0.05);
    shadowMesh.scale.set(1.0, 1.0, 1.0);
  } else if (anim === 'dance') {
    const beat = time * 7.5;
    bodyGroup.position.y = BASE_Y + Math.abs(Math.sin(beat)) * 0.08;
    bodyGroup.rotation.z = Math.sin(beat * 0.5) * 0.14;

    torso.rotation.y = Math.sin(beat * 0.5) * 0.26;

    leftUpperArm.rotation.set(Math.sin(beat) * 0.68, 0, 0.40);
    leftLowerArm.rotation.set(-1.0, 0, 0);

    rightUpperArm.rotation.set(-Math.sin(beat) * 0.68, 0, -0.40);
    rightLowerArm.rotation.set(-1.0, 0, 0);

    leftUpperLeg.rotation.set(-Math.sin(beat * 0.5) * 0.32, 0, 0.06);
    leftLowerLeg.rotation.set(0.3, 0, 0);

    rightUpperLeg.rotation.set(Math.sin(beat * 0.5) * 0.32, 0, -0.06);
    rightLowerLeg.rotation.set(0.3, 0, 0);

    head.rotation.set(Math.sin(beat) * 0.06, Math.sin(beat * 0.5) * 0.22, 0);
    shadowMesh.scale.set(1.0, 1.0, 1.0);
  } else if (anim === 'slip') {
    bodyGroup.position.y = BASE_Y - 0.22;
    bodyGroup.rotation.x = -0.85;
    bodyGroup.rotation.z = 0.16;

    torso.rotation.x = -0.32;
    torso.rotation.y = 0.10;

    leftUpperLeg.rotation.set(1.85, 0, 0.12);
    leftLowerLeg.rotation.set(-0.2, 0, 0);

    rightUpperLeg.rotation.set(-0.48, 0, -0.16);
    rightLowerLeg.rotation.set(1.0, 0, 0);

    leftUpperArm.rotation.set(-1.25, 0, 0.85);
    leftLowerArm.rotation.set(-0.5, 0, 0);

    rightUpperArm.rotation.set(-1.30, 0, -0.85);
    rightLowerArm.rotation.set(-0.5, 0, 0);

    head.rotation.set(0.50, -0.10, 0);
    shadowMesh.scale.set(1.25, 0.75, 1.0);
  } else {
    const breath = Math.sin(time * 2.2);
    bodyGroup.position.y = BASE_Y + breath * 0.008;
    bodyGroup.rotation.z = Math.sin(time * 1.1) * 0.012;

    torso.scale.set(1 + breath * 0.006, 1 + breath * 0.003, 1 + breath * 0.006);

    leftUpperArm.rotation.set(0.06 + breath * 0.015, 0, 0.10);
    leftLowerArm.rotation.set(-0.1, 0, 0); // Slight bend

    rightUpperArm.rotation.set(0.06 + breath * 0.015, 0, -0.10);
    rightLowerArm.rotation.set(-0.1, 0, 0); // Slight bend

    leftUpperLeg.rotation.set(0, 0, 0.01);
    leftLowerLeg.rotation.set(0, 0, 0); // Straight leg

    rightUpperLeg.rotation.set(0, 0, -0.01);
    rightLowerLeg.rotation.set(0, 0, 0); // Straight leg

    head.rotation.set(breath * 0.012, Math.sin(time * 0.7) * 0.04, Math.sin(time * 1.1) * 0.015);
    shadowMesh.scale.set(1.0, 1.0, 1.0);
  }
}
`;

const newCode = code.substring(0, startIdx) + newAnim + code.substring(endIdx);
fs.writeFileSync('src/game/StickmanModel.ts', newCode);
