import React, { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import {
  StickmanMeshParts,
  createStickmanMesh,
  animateStickman,
  updateNameTag,
  updateChatBubble,
  updateStickmanColor,
} from '../game/StickmanModel.ts';
import { createPhysicsObjectMesh, updateObjectAnchorVisual } from '../game/PhysicsProps.ts';
import { sound } from '../game/SoundEffects.ts';
import type {
  ActiveTool,
  ClientMessage,
  ObjectType,
  PhysicsObject,
  PlayerState,
  ServerMessage,
} from '../types.ts';
import { TouchControls } from './TouchControls.tsx';

interface SandboxGameProps {
  playerName: string;
  playerColor: string;
  roomId: string;
  isPrivateRoom: boolean;
  isMobileDevice: boolean;
  onRoomIdConfirmed: (id: string) => void;
  onPlayerCountChange: (count: number) => void;
  onPingChange: (ping: number) => void;
  onPlayerCoordsChange?: (x: number, z: number) => void;
  activeEmote: PlayerState['anim'] | null;
  onEmoteConsumed: () => void;
  activeTool?: ActiveTool;
  onSelectTool?: (tool: ActiveTool) => void;
  isBuildMode: boolean;
  selectedObjectType: ObjectType;
  buildRotationDeg: number;
  onRotateBuild: () => void;
  onToggleBuildMode: () => void;
  autoAnchor?: boolean;
  buildScale?: number;
  chatMessageToSend: string | null;
  onChatConsumed: () => void;
  onChatReceived: (sender: string, text: string) => void;
}

function getObjectDimensions(type: ObjectType, scale: number = 1): { size: [number, number, number]; halfHeight: number } {
  const s = Math.max(0.2, scale);
  switch (type) {
    case 'box':
      return { size: [1.2 * s, 1.2 * s, 1.2 * s], halfHeight: 0.6 * s };
    case 'sphere':
      return { size: [0.9 * s, 0.9 * s, 0.9 * s], halfHeight: 0.45 * s };
    case 'barrel':
      return { size: [0.75 * s, 1.5 * s, 0.75 * s], halfHeight: 0.75 * s };
    case 'domino':
      return { size: [1.0 * s, 1.8 * s, 0.25 * s], halfHeight: 0.9 * s };
    case 'ramp':
      return { size: [3 * s, 0.8 * s, 3 * s], halfHeight: 0.4 * s };
    case 'trampoline':
      return { size: [3 * s, 0.4 * s, 3 * s], halfHeight: 0.2 * s };
    case 'dice':
      return { size: [1.3 * s, 1.3 * s, 1.3 * s], halfHeight: 0.65 * s };
  }
}

export const SandboxGame: React.FC<SandboxGameProps> = ({
  playerName,
  playerColor,
  roomId,
  isPrivateRoom,
  isMobileDevice,
  onRoomIdConfirmed,
  onPlayerCountChange,
  onPingChange,
  onPlayerCoordsChange,
  activeEmote,
  onEmoteConsumed,
  activeTool = 'none',
  onSelectTool,
  isBuildMode,
  selectedObjectType,
  buildRotationDeg,
  onRotateBuild,
  onToggleBuildMode,
  autoAnchor = true,
  buildScale = 1,
  chatMessageToSend,
  onChatConsumed,
  onChatReceived,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const updateRendererSizeRef = useRef<(() => void) | null>(null);

  // Local stickman state
  const selfIdRef = useRef<string | null>(null);
  const localPlayerStateRef = useRef<{
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    rotY: number;
    anim: PlayerState['anim'];
    isGrounded: boolean;
  }>({
    x: 0,
    y: 0,
    z: 2,
    vx: 0,
    vy: 0,
    vz: 0,
    rotY: 0,
    anim: 'idle',
    isGrounded: true,
  });

  // Local mesh
  const localStickmanRef = useRef<StickmanMeshParts | null>(null);

  // Remote players
  const remotePlayersRef = useRef<
    Map<string, { state: PlayerState; meshParts: StickmanMeshParts; targetPos: THREE.Vector3; targetRotY: number }>
  >(new Map());

  // Physics Objects
  const physicsObjectsRef = useRef<
    Map<string, { mesh: THREE.Object3D; data: PhysicsObject; targetPos: THREE.Vector3; targetQuat: THREE.Quaternion }>
  >(new Map());

  // Ground plane ref for raycasting
  const groundMeshRef = useRef<THREE.Mesh | null>(null);
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const fillLightRef = useRef<THREE.DirectionalLight | null>(null);

  // BABFT Ghost Preview Mesh Ref
  const ghostMeshRef = useRef<THREE.Group | null>(null);
  const ghostSnapPosRef = useRef<[number, number, number]>([0, 0.6, 0]);

  // Target Reticle for Anchor / Unanchor tool selection
  const targetReticleRef = useRef<THREE.LineSegments | null>(null);
  const targetReticleMatRef = useRef<THREE.LineBasicMaterial | null>(null);
  const hoveredObjectIdRef = useRef<string | null>(null);

  // Input states
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const touchMoveRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isTouchSprintingRef = useRef<boolean>(false);
  const kickCooldownRef = useRef<number>(0);

  // Orbit camera parameters (stuck to orbit)
  const cameraAngleRef = useRef<{ theta: number; phi: number; distance: number }>({
    theta: Math.PI / 4,
    phi: Math.PI / 3.4,
    distance: 14,
  });
  const isMouseDownRef = useRef<boolean>(false);
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const mouseDownStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Raycaster & Mouse for building and anchoring
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseCoordsRef = useRef<THREE.Vector2>(new THREE.Vector2(0, 0));

  // WebGL scene refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  // Send message helper
  const sendWs = useCallback((msg: ClientMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // Dynamic state refs to prevent WebGL scene teardown when equipping items or toggling modes
  const activeToolRef = useRef<ActiveTool>(activeTool);
  activeToolRef.current = activeTool || (isBuildMode ? 'build' : 'none');

  const isBuildModeRef = useRef(isBuildMode);
  isBuildModeRef.current = isBuildMode;

  const selectedObjectTypeRef = useRef(selectedObjectType);
  selectedObjectTypeRef.current = selectedObjectType;

  const buildRotationDegRef = useRef(buildRotationDeg);
  buildRotationDegRef.current = buildRotationDeg;

  const autoAnchorRef = useRef(autoAnchor);
  autoAnchorRef.current = autoAnchor;

  const buildScaleRef = useRef(buildScale);
  buildScaleRef.current = buildScale;

  const playerNameRef = useRef(playerName);
  playerNameRef.current = playerName;

  const playerColorRef = useRef(playerColor);
  playerColorRef.current = playerColor;

  const callbacksRef = useRef({
    onChatReceived,
    onPingChange,
    onPlayerCountChange,
    onRoomIdConfirmed,
    onRotateBuild,
    onToggleBuildMode,
    onSelectTool,
    onPlayerCoordsChange,
  });
  callbacksRef.current = {
    onChatReceived,
    onPingChange,
    onPlayerCountChange,
    onRoomIdConfirmed,
    onRotateBuild,
    onToggleBuildMode,
    onSelectTool,
    onPlayerCoordsChange,
  };

  // Place block in BABFT build mode (used by mouse click or touch button/tap)
  const lastActionTimeRef = useRef<number>(0);
  const lastTouchEndTimeRef = useRef<number>(0);

  const calculatePlacementPosition = useCallback((screenX: number, screenY: number): [number, number, number] | null => {
    if (!rendererRef.current || !cameraRef.current) return null;
    const rect = rendererRef.current.domElement.getBoundingClientRect();
    const ndcX = ((screenX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((screenY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), cameraRef.current);

    const targets: THREE.Object3D[] = [];
    if (groundMeshRef.current) targets.push(groundMeshRef.current);
    for (const [, item] of physicsObjectsRef.current) {
      targets.push(item.mesh);
    }

    const intersects = raycaster.intersectObjects(targets, true);
    const { halfHeight } = getObjectDimensions(selectedObjectTypeRef.current, buildScaleRef.current);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const pt = hit.point;

      // Grid snap (1 unit grid for smooth ground alignment)
      const grid = 1.0;
      let snapX = Math.round(pt.x / grid) * grid;
      let snapZ = Math.round(pt.z / grid) * grid;
      let snapY = halfHeight;

      // If hitting another physics object, snap onto its top or side surface
      if (hit.object !== groundMeshRef.current && hit.point.y > 0.05) {
        const normal = hit.face ? hit.face.normal.clone() : new THREE.Vector3(0, 1, 0);
        normal.transformDirection(hit.object.matrixWorld);

        if (normal.y > 0.4) {
          // Top face
          snapX = Math.round(pt.x / 0.5) * 0.5;
          snapZ = Math.round(pt.z / 0.5) * 0.5;
          snapY = pt.y + halfHeight;
        } else {
          // Side face
          snapX = Math.round((pt.x + normal.x * 0.5) / 0.5) * 0.5;
          snapZ = Math.round((pt.z + normal.z * 0.5) / 0.5) * 0.5;
          snapY = Math.max(halfHeight, Math.round(pt.y / 0.5) * 0.5);
        }
      }
      return [snapX, snapY, snapZ];
    }

    // Fallback: ray-plane intersection with ground plane (y = 0)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const planeTarget = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, planeTarget)) {
      const snapX = Math.round(planeTarget.x / 1.0) * 1.0;
      const snapZ = Math.round(planeTarget.z / 1.0) * 1.0;
      return [snapX, halfHeight, snapZ];
    }

    return null;
  }, []);

  const findObjectAtScreenCoords = useCallback((screenX: number, screenY: number): string | null => {
    if (!rendererRef.current || !cameraRef.current) return null;
    const rect = rendererRef.current.domElement.getBoundingClientRect();
    const ndcX = ((screenX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((screenY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), cameraRef.current);

    const targets: THREE.Object3D[] = [];
    const objMap = new Map<THREE.Object3D, string>();
    for (const [id, item] of physicsObjectsRef.current) {
      targets.push(item.mesh);
      objMap.set(item.mesh, id);
    }

    const intersects = raycaster.intersectObjects(targets, true);
    if (intersects.length > 0) {
      let topMesh: THREE.Object3D | null = intersects[0].object;
      while (topMesh && !objMap.has(topMesh) && topMesh.parent) {
        topMesh = topMesh.parent;
      }
      return topMesh ? (objMap.get(topMesh) || null) : null;
    }
    return null;
  }, []);

  const handleZoomIn = useCallback(() => {
    cameraAngleRef.current.distance = Math.max(5, cameraAngleRef.current.distance - 2);
  }, []);

  const handleZoomOut = useCallback(() => {
    cameraAngleRef.current.distance = Math.min(32, cameraAngleRef.current.distance + 2);
  }, []);

  const handlePlaceBlock = useCallback((overridePos?: [number, number, number]) => {
    if (activeToolRef.current !== 'build' && !isBuildModeRef.current) return;
    const now = performance.now();
    if (now - lastActionTimeRef.current < 200) return;
    lastActionTimeRef.current = now;

    const spawnPos = overridePos || ghostSnapPosRef.current;
    const rotRad = (buildRotationDegRef.current * Math.PI) / 180;

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      const scene = sceneRef.current;
      if (scene) {
        const objId = `local_obj_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const s = buildScaleRef.current;
        const type = selectedObjectTypeRef.current;
        let baseSize: [number, number, number] = [1.5, 1.5, 1.5];
        if (type === 'domino') baseSize = [0.35, 1.8, 0.9];
        else if (type === 'sphere') baseSize = [0.9, 0.9, 0.9];
        else if (type === 'barrel') baseSize = [0.75, 1.6, 0.75];
        else if (type === 'dice') baseSize = [1.2, 1.2, 1.2];
        else if (type === 'ramp') baseSize = [3.5, 1.8, 5.0];
        else if (type === 'trampoline') baseSize = [3.2, 0.4, 3.2];

        const scaledSize: [number, number, number] = [
          baseSize[0] * s,
          baseSize[1] * s,
          baseSize[2] * s,
        ];

        const obj: PhysicsObject = {
          id: objId,
          type,
          x: spawnPos[0],
          y: spawnPos[1],
          z: spawnPos[2],
          qx: 0,
          qy: Math.sin(rotRad / 2),
          qz: 0,
          qw: Math.cos(rotRad / 2),
          vx: 0,
          vy: 0,
          vz: 0,
          size: scaledSize,
          color: '#b45309',
          mass: autoAnchorRef.current ? 0 : 5,
          restitution: type === 'trampoline' ? 0.9 : (type === 'sphere' ? 0.8 : 0.3),
          isStatic: autoAnchorRef.current,
        };

        const mesh = createPhysicsObjectMesh(obj);
        mesh.position.set(obj.x, obj.y, obj.z);
        mesh.quaternion.set(obj.qx, obj.qy, obj.qz, obj.qw);
        scene.add(mesh);
        physicsObjectsRef.current.set(objId, {
          mesh,
          data: obj,
          targetPos: new THREE.Vector3(obj.x, obj.y, obj.z),
          targetQuat: new THREE.Quaternion(obj.qx, obj.qy, obj.qz, obj.qw),
        });
      }
      sound.playPop();
      return;
    }

    sendWs({
      type: 'spawn_object',
      objectType: selectedObjectTypeRef.current,
      position: spawnPos,
      rotationY: rotRad,
      isStatic: autoAnchorRef.current,
      scale: buildScaleRef.current,
    });
    sound.playPop();
  }, [sendWs]);

  const handleAnchorAction = useCallback((isStatic: boolean, overrideObjectId?: string) => {
    const targetId = overrideObjectId || hoveredObjectIdRef.current;
    if (!targetId) return;
    const now = performance.now();
    if (now - lastActionTimeRef.current < 200) return;
    lastActionTimeRef.current = now;

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      const item = physicsObjectsRef.current.get(targetId);
      if (item) {
        item.data.isStatic = isStatic;
        updateObjectAnchorVisual(item.mesh, isStatic);
        if (isStatic) {
          sound.playAnchor();
        } else {
          sound.playUnanchor();
        }
      }
      return;
    }

    sendWs({
      type: 'set_anchor',
      objectId: targetId,
      isStatic,
    });
    if (isStatic) {
      sound.playAnchor();
    } else {
      sound.playUnanchor();
    }
  }, [sendWs]);

  const handleScaleAction = useCallback((overrideObjectId?: string) => {
    const targetId = overrideObjectId || hoveredObjectIdRef.current;
    if (!targetId) return;
    const now = performance.now();
    if (now - lastActionTimeRef.current < 200) return;
    lastActionTimeRef.current = now;

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      const item = physicsObjectsRef.current.get(targetId);
      if (item) {
        const s = buildScaleRef.current;
        item.mesh.scale.set(s, s, s);
        item.data.size = [item.data.size[0] * s, item.data.size[1] * s, item.data.size[2] * s];
        sound.playPop();
      }
      return;
    }

    sendWs({
      type: 'scale_object',
      objectId: targetId,
      scale: buildScaleRef.current,
    });
    sound.playPop();
  }, [sendWs]);

  const handleDeleteAction = useCallback((overrideObjectId?: string) => {
    const targetId = overrideObjectId || hoveredObjectIdRef.current;
    if (!targetId) return;
    const now = performance.now();
    if (now - lastActionTimeRef.current < 200) return;
    lastActionTimeRef.current = now;

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      const item = physicsObjectsRef.current.get(targetId);
      if (item && sceneRef.current) {
        sceneRef.current.remove(item.mesh);
        physicsObjectsRef.current.delete(targetId);
        sound.playPop();
      }
      return;
    }

    sendWs({
      type: 'delete_object',
      objectId: targetId,
    });
    sound.playPop();
  }, [sendWs]);

  // Handle local Kick / Interact with realistic impulse and torque
  const triggerKick = useCallback(() => {
    const now = Date.now();
    if (now - kickCooldownRef.current < 400) return;
    kickCooldownRef.current = now;

    localPlayerStateRef.current.anim = 'kick';
    sound.playKick();

    // Kick physics objects directly in front
    const p = localPlayerStateRef.current;
    const kickFwdX = Math.sin(p.rotY);
    const kickFwdZ = Math.cos(p.rotY);

    for (const [, item] of physicsObjectsRef.current) {
      if (item.data.isStatic) continue;
      const dx = item.mesh.position.x - p.x;
      const dy = item.mesh.position.y - p.y;
      const dz = item.mesh.position.z - p.z;
      const dist = Math.hypot(dx, dz);

      const dot = (dx * kickFwdX + dz * kickFwdZ) / (dist || 1);
      if (dist < 3.2 && dy >= -0.6 && dy <= 2.4 && dot > 0.35) {
        const mass = item.data.mass || 3.5;
        // Realistic impulse scaled with object mass and impact velocity
        const kickPower = Math.max(18, 32 * Math.sqrt(mass / 3.5));
        const upLift = Math.min(12, 6 + mass * 1.2);

        // Contact point at foot level (induces natural tumbling torque)
        const hitPoint: [number, number, number] = [
          item.mesh.position.x - kickFwdX * 0.3,
          item.mesh.position.y - 0.35,
          item.mesh.position.z - kickFwdZ * 0.3,
        ];

        sendWs({
          type: 'interact_object',
          objectId: item.data.id,
          impulse: [kickFwdX * kickPower, upLift, kickFwdZ * kickPower],
          point: hitPoint,
        });
      }
    }

    setTimeout(() => {
      if (localPlayerStateRef.current.anim === 'kick') {
        localPlayerStateRef.current.anim = 'idle';
      }
    }, 380);
  }, [sendWs]);

  // Jump handler
  const triggerJump = useCallback(() => {
    const p = localPlayerStateRef.current;
    if (p.isGrounded) {
      p.vy = 11.8;
      p.isGrounded = false;
      p.anim = 'jump';
      sound.playJump();
    }
  }, []);

  // Slip handler (iconic slippery sign slip!)
  const triggerSlip = useCallback(() => {
    const p = localPlayerStateRef.current;
    p.anim = 'slip';
    sound.playSlip();
    sendWs({ type: 'emote', anim: 'slip' });
    const camAngle = cameraAngleRef.current.theta;
    p.vx += -Math.sin(camAngle) * 4.2;
    p.vz += -Math.cos(camAngle) * 4.2;
    setTimeout(() => {
      if (localPlayerStateRef.current.anim === 'slip') {
        localPlayerStateRef.current.anim = 'idle';
      }
    }, 1400);
  }, [sendWs]);

  // Handle Emote Trigger
  useEffect(() => {
    if (!activeEmote) return;
    if (activeEmote === 'kick') {
      triggerKick();
    } else if (activeEmote === 'slip') {
      triggerSlip();
    } else {
      localPlayerStateRef.current.anim = activeEmote;
      sendWs({ type: 'emote', anim: activeEmote });
      if (activeEmote === 'wave' || activeEmote === 'dance') {
        setTimeout(() => {
          if (localPlayerStateRef.current.anim === activeEmote) {
            localPlayerStateRef.current.anim = 'idle';
          }
        }, 3000);
      }
    }
    onEmoteConsumed();
  }, [activeEmote, onEmoteConsumed, sendWs, triggerKick, triggerSlip]);

  // Handle Chat Message
  useEffect(() => {
    if (chatMessageToSend) {
      sendWs({ type: 'chat', text: chatMessageToSend });
      if (localStickmanRef.current) {
        updateChatBubble(localStickmanRef.current, chatMessageToSend);
        setTimeout(() => {
          if (localStickmanRef.current) {
            updateChatBubble(localStickmanRef.current, '');
          }
        }, 5000);
      }
      onChatConsumed();
    }
  }, [chatMessageToSend, onChatConsumed, sendWs]);

  // Create or Update BABFT Ghost Preview Mesh when build mode or object type changes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (ghostMeshRef.current) {
      scene.remove(ghostMeshRef.current);
      ghostMeshRef.current = null;
    }

    if (!isBuildMode) return;

    const group = new THREE.Group();
    const { size, halfHeight } = getObjectDimensions(selectedObjectType, buildScale);

    let geom: THREE.BufferGeometry;
    if (selectedObjectType === 'sphere') {
      geom = new THREE.SphereGeometry(size[0], 16, 16);
    } else if (selectedObjectType === 'barrel') {
      geom = new THREE.CylinderGeometry(size[0], size[0], size[1], 16);
    } else {
      geom = new THREE.BoxGeometry(size[0], size[1], size[2]);
    }

    // Hologram translucent body (amber glow if auto-anchored, green if dynamic)
    const ghostColor = autoAnchor ? 0xf59e0b : 0x22c55e;
    const mat = new THREE.MeshBasicMaterial({
      color: ghostColor,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
    });
    const fillMesh = new THREE.Mesh(geom, mat);
    group.add(fillMesh);

    // Floor placement ring / footprint
    const ringGeom = new THREE.RingGeometry(0.5 * Math.max(0.5, buildScale), 0.7 * Math.max(0.5, buildScale), 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: ghostColor, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -halfHeight + 0.02;
    group.add(ring);

    group.userData = { halfHeight };
    scene.add(group);
    ghostMeshRef.current = group;

    return () => {
      if (ghostMeshRef.current && scene) {
        scene.remove(ghostMeshRef.current);
        ghostMeshRef.current = null;
      }
    };
  }, [isBuildMode, selectedObjectType, buildScale, autoAnchor]);

  // Main 3D Scene Initialization
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // Three.js Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color('#ffffff');
    scene.fog = new THREE.FogExp2('#ffffff', 0.0035);

    // Camera (Orbit Perspective) with extended view distance for truly infinite world
    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 2000);
    cameraRef.current = camera;

    // WebGL Renderer with subtle retro pixelation
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    rendererRef.current = renderer;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Lighting (High-specular directional setup for metallic Chrome stickman)
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xcbd5e1, 0.85);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.45);
    dirLight.position.set(16, 32, 16);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 120;
    const d = 36;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);
    dirLightRef.current = dirLight;

    const fillLight = new THREE.DirectionalLight(0xe2e8f0, 0.45);
    fillLight.position.set(-16, 16, -16);
    scene.add(fillLight);
    fillLightRef.current = fillLight;

    // Tiled White Infinite Floor (Continuous Infinite Grid)
    const floorSize = 1600; // Expansive field that seamlessly tracks player
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

    // Target Reticle (Wireframe Box for Anchor & Unanchor Tools)
    const reticleGeom = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    const reticleMat = new THREE.LineBasicMaterial({
      color: 0xf59e0b,
      linewidth: 3,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    });
    const reticleMesh = new THREE.LineSegments(reticleGeom, reticleMat);
    reticleMesh.renderOrder = 999;
    reticleMesh.visible = false;
    scene.add(reticleMesh);
    targetReticleRef.current = reticleMesh;
    targetReticleMatRef.current = reticleMat;

    // Create Local Stickman Mesh
    const localParts = createStickmanMesh(playerColor, playerName);
    localStickmanRef.current = localParts;
    scene.add(localParts.root);

    // Resize & Crisp High-Definition Scaling Handler
    const updateRendererSize = () => {
      if (!container || !camera || !renderer) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      const aspect = w / h;
      camera.aspect = aspect;

      // Adjust camera FOV in portrait so character and arena remain comfortable on iPhone/iPad portrait
      if (aspect < 1) {
        camera.fov = Math.min(82, 55 / Math.max(0.62, aspect));
      } else {
        camera.fov = 55;
      }
      camera.updateProjectionMatrix();

      // Subtle Retro Pixelation Scaling (gentle, stylish pixel crunch)
      const scale = 1.35;
      const renderW = Math.max(160, Math.floor(w / scale));
      const renderH = Math.max(120, Math.floor(h / scale));
      renderer.setPixelRatio(1);
      renderer.setSize(renderW, renderH, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.imageRendering = 'pixelated';
    };
    updateRendererSizeRef.current = updateRendererSize;
    updateRendererSize();

    // ResizeObserver for reliable dimension changes across orientations and address bar shifts
    const resizeObserver = new ResizeObserver(() => {
      updateRendererSize();
    });
    resizeObserver.observe(container);

    // WebSocket Connection to Room
    const searchParams = new URLSearchParams(window.location.search);
    const customServer = searchParams.get('server') || (import.meta.env.VITE_WS_URL as string | undefined);
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const defaultWsUrl = `${protocol}//${window.location.host}/ws`;
    const wsUrl = customServer || defaultWsUrl;

    let isInitialized = false;

    const setupOfflineFallback = () => {
      if (isInitialized) return;
      isInitialized = true;
      selfIdRef.current = 'local_player';
      callbacksRef.current.onRoomIdConfirmed(roomId || 'offline');
      callbacksRef.current.onPlayerCountChange(1);
      callbacksRef.current.onPingChange(0);
      callbacksRef.current.onChatReceived(
        'System',
        'Offline Sandbox active. You can build, jump, & explore! (To connect multiplayer, pass ?server=wss://...)'
      );

      // Spawn starter props in local scene if empty
      if (physicsObjectsRef.current.size === 0) {
        const starterObjects: PhysicsObject[] = [
          {
            id: 'starter_trampoline',
            type: 'trampoline',
            x: 0,
            y: 0.15,
            z: 7,
            qx: 0,
            qy: 0,
            qz: 0,
            qw: 1,
            vx: 0,
            vy: 0,
            vz: 0,
            size: [3.2, 0.3, 3.2],
            color: '#10b981',
            mass: 0,
            restitution: 0.9,
            isStatic: true,
          },
          {
            id: 'starter_ramp',
            type: 'ramp',
            x: -7,
            y: 0.9,
            z: 3,
            qx: 0,
            qy: 0,
            qz: 0,
            qw: 1,
            vx: 0,
            vy: 0,
            vz: 0,
            size: [3.5, 1.8, 5],
            color: '#d97706',
            mass: 0,
            restitution: 0.2,
            isStatic: true,
          },
          {
            id: 'starter_crate',
            type: 'box',
            x: 5,
            y: 0.75,
            z: 2,
            qx: 0,
            qy: 0,
            qz: 0,
            qw: 1,
            vx: 0,
            vy: 0,
            vz: 0,
            size: [1.5, 1.5, 1.5],
            color: '#b45309',
            mass: 5,
            restitution: 0.3,
            isStatic: true,
          },
          {
            id: 'starter_sphere',
            type: 'sphere',
            x: -4,
            y: 0.9,
            z: -4,
            qx: 0,
            qy: 0,
            qz: 0,
            qw: 1,
            vx: 0,
            vy: 0,
            vz: 0,
            size: [0.9, 0.9, 0.9],
            color: '#ec4899',
            mass: 3,
            restitution: 0.8,
            isStatic: true,
          },
        ];

        for (const obj of starterObjects) {
          const mesh = createPhysicsObjectMesh(obj);
          mesh.position.set(obj.x, obj.y, obj.z);
          scene.add(mesh);
          physicsObjectsRef.current.set(obj.id, {
            mesh,
            data: obj,
            targetPos: new THREE.Vector3(obj.x, obj.y, obj.z),
            targetQuat: new THREE.Quaternion(obj.qx, obj.qy, obj.qz, obj.qw),
          });
        }
      }
    };

    // If on a purely static host like GitHub Pages or Neocities with no backend, fallback automatically
    const connectionTimeout = setTimeout(() => {
      if (!isInitialized) {
        setupOfflineFallback();
      }
    }, 2800);

    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        clearTimeout(connectionTimeout);
        sendWs({
          type: 'join',
          name: playerName,
          color: playerColor,
          roomId: roomId || 'public',
          isPrivate: isPrivateRoom,
        });
      };

      ws.onerror = () => {
        setupOfflineFallback();
      };

      ws.onclose = () => {
        setupOfflineFallback();
      };
    } catch {
      setupOfflineFallback();
    }

    // Ping loop
    const pingInterval = setInterval(() => {
      sendWs({ type: 'ping', t: performance.now() });
    }, 2500);

    if (ws) {
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as ServerMessage;

          if (msg.type === 'init') {
            isInitialized = true;
            clearTimeout(connectionTimeout);
            selfIdRef.current = msg.selfId;
            callbacksRef.current.onRoomIdConfirmed(msg.roomId);

          // Spawn existing physics objects
          for (const obj of msg.objects) {
            if (!physicsObjectsRef.current.has(obj.id)) {
              const mesh = createPhysicsObjectMesh(obj);
              mesh.position.set(obj.x, obj.y, obj.z);
              mesh.quaternion.set(obj.qx, obj.qy, obj.qz, obj.qw);
              scene.add(mesh);
              physicsObjectsRef.current.set(obj.id, {
                mesh,
                data: obj,
                targetPos: new THREE.Vector3(obj.x, obj.y, obj.z),
                targetQuat: new THREE.Quaternion(obj.qx, obj.qy, obj.qz, obj.qw),
              });
            }
          }

          // Spawn existing players
          for (const p of msg.players) {
            if (p.id !== msg.selfId && !remotePlayersRef.current.has(p.id)) {
              const remoteParts = createStickmanMesh(p.color, p.name);
              remoteParts.root.position.set(p.x, p.y, p.z);
              remoteParts.root.rotation.y = p.rotY;
              scene.add(remoteParts.root);
              remotePlayersRef.current.set(p.id, {
                state: p,
                meshParts: remoteParts,
                targetPos: new THREE.Vector3(p.x, p.y, p.z),
                targetRotY: p.rotY,
              });
            }
          }

          callbacksRef.current.onPlayerCountChange(remotePlayersRef.current.size + 1);
        } else if (msg.type === 'player_joined') {
          if (msg.player.id !== selfIdRef.current) {
            const existing = remotePlayersRef.current.get(msg.player.id);
            if (existing) {
              updateNameTag(existing.meshParts, msg.player.name, msg.player.color);
            } else {
              const remoteParts = createStickmanMesh(msg.player.color, msg.player.name);
              remoteParts.root.position.set(msg.player.x, msg.player.y, msg.player.z);
              remoteParts.root.rotation.y = msg.player.rotY;
              scene.add(remoteParts.root);
              remotePlayersRef.current.set(msg.player.id, {
                state: msg.player,
                meshParts: remoteParts,
                targetPos: new THREE.Vector3(msg.player.x, msg.player.y, msg.player.z),
                targetRotY: msg.player.rotY,
              });
              callbacksRef.current.onPlayerCountChange(remotePlayersRef.current.size + 1);
              callbacksRef.current.onChatReceived('System', `${msg.player.name} joined room`);
            }
          }
        } else if (msg.type === 'player_left') {
          const item = remotePlayersRef.current.get(msg.id);
          if (item) {
            scene.remove(item.meshParts.root);
            remotePlayersRef.current.delete(msg.id);
            callbacksRef.current.onPlayerCountChange(remotePlayersRef.current.size + 1);
            callbacksRef.current.onChatReceived('System', `${item.state.name} left room`);
          }
        } else if (msg.type === 'world_tick') {
          for (const p of msg.players) {
            if (p.id !== selfIdRef.current) {
              const remote = remotePlayersRef.current.get(p.id);
              if (remote) {
                remote.targetPos.set(p.x, p.y, p.z);
                remote.targetRotY = p.rotY;
                remote.state.anim = p.anim;
                remote.state.isGrounded = p.isGrounded;
              }
            }
          }

          for (const obj of msg.objects) {
            const item = physicsObjectsRef.current.get(obj.id);
            if (item) {
              item.targetPos.set(obj.x, obj.y, obj.z);
              item.targetQuat.set(obj.qx, obj.qy, obj.qz, obj.qw);
            }
          }
        } else if (msg.type === 'object_spawned') {
          if (!physicsObjectsRef.current.has(msg.object.id)) {
            const mesh = createPhysicsObjectMesh(msg.object);
            mesh.position.set(msg.object.x, msg.object.y, msg.object.z);
            mesh.quaternion.set(msg.object.qx, msg.object.qy, msg.object.qz, msg.object.qw);
            scene.add(mesh);
            physicsObjectsRef.current.set(msg.object.id, {
              mesh,
              data: msg.object,
              targetPos: new THREE.Vector3(msg.object.x, msg.object.y, msg.object.z),
              targetQuat: new THREE.Quaternion(msg.object.qx, msg.object.qy, msg.object.qz, msg.object.qw),
            });
          }
        } else if (msg.type === 'object_updated') {
          const item = physicsObjectsRef.current.get(msg.object.id);
          if (item) {
            const sizeChanged =
              !item.data.size ||
              item.data.size[0] !== msg.object.size[0] ||
              item.data.size[1] !== msg.object.size[1] ||
              item.data.size[2] !== msg.object.size[2];

            item.data = { ...msg.object };
            if (sizeChanged) {
              scene.remove(item.mesh);
              const newMesh = createPhysicsObjectMesh(msg.object);
              newMesh.position.set(msg.object.x, msg.object.y, msg.object.z);
              newMesh.quaternion.set(msg.object.qx, msg.object.qy, msg.object.qz, msg.object.qw);
              scene.add(newMesh);
              item.mesh = newMesh;
            }

            item.targetPos.set(msg.object.x, msg.object.y, msg.object.z);
            item.targetQuat.set(msg.object.qx, msg.object.qy, msg.object.qz, msg.object.qw);
            updateObjectAnchorVisual(item.mesh, Boolean(msg.object.isStatic), item.data.size);
          }
        } else if (msg.type === 'object_removed') {
          const item = physicsObjectsRef.current.get(msg.id);
          if (item) {
            scene.remove(item.mesh);
            physicsObjectsRef.current.delete(msg.id);
            if (hoveredObjectIdRef.current === msg.id) {
              hoveredObjectIdRef.current = null;
              if (targetReticleRef.current) {
                targetReticleRef.current.visible = false;
              }
            }
          }
        } else if (msg.type === 'objects_reset') {
          for (const [, item] of physicsObjectsRef.current) {
            scene.remove(item.mesh);
          }
          physicsObjectsRef.current.clear();
          for (const obj of msg.objects) {
            const mesh = createPhysicsObjectMesh(obj);
            mesh.position.set(obj.x, obj.y, obj.z);
            mesh.quaternion.set(obj.qx, obj.qy, obj.qz, obj.qw);
            scene.add(mesh);
            physicsObjectsRef.current.set(obj.id, {
              mesh,
              data: obj,
              targetPos: new THREE.Vector3(obj.x, obj.y, obj.z),
              targetQuat: new THREE.Quaternion(obj.qx, obj.qy, obj.qz, obj.qw),
            });
          }
          callbacksRef.current.onChatReceived('System', 'Room objects reset');
        } else if (msg.type === 'chat_broadcast') {
          callbacksRef.current.onChatReceived(msg.name, msg.text);
          const remote = remotePlayersRef.current.get(msg.id);
          if (remote) {
            updateChatBubble(remote.meshParts, msg.text);
            setTimeout(() => {
              updateChatBubble(remote.meshParts, '');
            }, 5000);
          }
        } else if (msg.type === 'pong') {
          const rtt = Math.round(performance.now() - msg.t);
          callbacksRef.current.onPingChange(Math.max(1, rtt));
        }
      } catch (err) {
        console.error('Error processing WS packet:', err);
      }
    };
  }

    // Keyboard handlers
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;

      keysRef.current[e.code] = true;

      if (e.code === 'Space') {
        e.preventDefault();
        triggerJump();
      } else if (e.code === 'KeyE') {
        e.preventDefault();
        triggerKick();
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        triggerSlip();
      } else if (e.code === 'KeyR') {
        // Rotate block in build mode
        e.preventDefault();
        callbacksRef.current.onRotateBuild();
      } else if (e.code === 'KeyB' || e.code === 'KeyQ') {
        // Toggle build mode
        e.preventDefault();
        callbacksRef.current.onToggleBuildMode();
      } else if (e.code === 'KeyL' || e.code === 'Digit1') {
        // Equip/Toggle Anchor Tool (Lock block)
        e.preventDefault();
        callbacksRef.current.onSelectTool?.('anchor');
      } else if (e.code === 'KeyU' || e.code === 'Digit2') {
        // Equip/Toggle Unanchor Tool (Unlock block)
        e.preventDefault();
        callbacksRef.current.onSelectTool?.('unanchor');
      } else if (e.code === 'KeyX' || e.code === 'Digit3' || e.code === 'Delete' || e.code === 'Backspace') {
        // Equip/Toggle Delete Tool (Remove block)
        e.preventDefault();
        callbacksRef.current.onSelectTool?.('delete');
      } else if (e.code === 'Digit4' || e.code === 'KeyZ') {
        // Equip/Toggle Scale Tool
        e.preventDefault();
        callbacksRef.current.onSelectTool?.('scale');
      } else if (e.code === 'Escape') {
        e.preventDefault();
        callbacksRef.current.onSelectTool?.('none');
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    const handleBlur = () => {
      keysRef.current = {};
    };
    window.addEventListener('blur', handleBlur);

    // Mouse & Pointer handlers
    const handlePointerDown = (e: MouseEvent) => {
      // Ignore synthetic mouse events fired after touch events
      if (performance.now() - lastTouchEndTimeRef.current < 500) return;

      if ((e.target as HTMLElement)?.tagName === 'CANVAS') {
        isMouseDownRef.current = true;
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        mouseDownStartPosRef.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handlePointerMove = (e: MouseEvent) => {
      // Update normalized mouse coordinates for raycasting
      const rect = renderer.domElement.getBoundingClientRect();
      mouseCoordsRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseCoordsRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (!isMouseDownRef.current) return;
      const dx = e.clientX - lastMousePosRef.current.x;
      const dy = e.clientY - lastMousePosRef.current.y;
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };

      // Orbit camera rotation
      cameraAngleRef.current.theta -= dx * 0.007;
      cameraAngleRef.current.phi = Math.max(0.18, Math.min(Math.PI / 2.05, cameraAngleRef.current.phi - dy * 0.007));
    };

    const handlePointerUp = (e: MouseEvent) => {
      if (performance.now() - lastTouchEndTimeRef.current < 500) return;
      if (!isMouseDownRef.current) return;
      isMouseDownRef.current = false;

      // Check if it was a quick click rather than a camera drag
      const dragDist = Math.hypot(
        e.clientX - mouseDownStartPosRef.current.x,
        e.clientY - mouseDownStartPosRef.current.y
      );

      if (dragDist < 6 && (e.target as HTMLElement)?.tagName === 'CANVAS') {
        if (activeToolRef.current === 'anchor') {
          const hitId = findObjectAtScreenCoords(e.clientX, e.clientY);
          handleAnchorAction(true, hitId || undefined);
        } else if (activeToolRef.current === 'unanchor') {
          const hitId = findObjectAtScreenCoords(e.clientX, e.clientY);
          handleAnchorAction(false, hitId || undefined);
        } else if (activeToolRef.current === 'delete') {
          const hitId = findObjectAtScreenCoords(e.clientX, e.clientY);
          handleDeleteAction(hitId || undefined);
        } else if (activeToolRef.current === 'scale') {
          const hitId = findObjectAtScreenCoords(e.clientX, e.clientY);
          handleScaleAction(hitId || undefined);
        } else if (activeToolRef.current === 'build') {
          const pos = calculatePlacementPosition(e.clientX, e.clientY);
          handlePlaceBlock(pos || undefined);
        }
      }
    };

    const handleWheel = (e: WheelEvent) => {
      cameraAngleRef.current.distance = Math.max(5, Math.min(32, cameraAngleRef.current.distance + e.deltaY * 0.015));
    };

    // Touch handlers for mobile orbit and tap-to-interact
    let touchStartPos = { x: 0, y: 0 };
    let lastTouchPos = { x: 0, y: 0 };
    let initialPinchDist = 0;
    let isTouchOrbiting = false;
    let touchStartTime = 0;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const t = e.touches[0];
        touchStartPos = { x: t.clientX, y: t.clientY };
        lastTouchPos = { x: t.clientX, y: t.clientY };
        touchStartTime = performance.now();
        isTouchOrbiting = true;

        const rect = renderer.domElement.getBoundingClientRect();
        mouseCoordsRef.current.x = ((t.clientX - rect.left) / rect.width) * 2 - 1;
        mouseCoordsRef.current.y = -((t.clientY - rect.top) / rect.height) * 2 + 1;

        // In build mode on mobile, preview ghost immediately at touched location
        if (activeToolRef.current === 'build' || isBuildModeRef.current) {
          const previewPos = calculatePlacementPosition(t.clientX, t.clientY);
          if (previewPos && ghostMeshRef.current) {
            ghostMeshRef.current.position.set(previewPos[0], previewPos[1], previewPos[2]);
            ghostMeshRef.current.visible = true;
            ghostSnapPosRef.current = previewPos;
          }
        }
      } else if (e.touches.length === 2) {
        isTouchOrbiting = false;
        initialPinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1 && isTouchOrbiting) {
        const t = e.touches[0];
        const dx = t.clientX - lastTouchPos.x;
        const dy = t.clientY - lastTouchPos.y;
        lastTouchPos = { x: t.clientX, y: t.clientY };

        cameraAngleRef.current.theta -= dx * 0.007;
        cameraAngleRef.current.phi = Math.max(0.18, Math.min(Math.PI / 2.05, cameraAngleRef.current.phi - dy * 0.007));

        const rect = renderer.domElement.getBoundingClientRect();
        mouseCoordsRef.current.x = ((t.clientX - rect.left) / rect.width) * 2 - 1;
        mouseCoordsRef.current.y = -((t.clientY - rect.top) / rect.height) * 2 + 1;
      } else if (e.touches.length === 2) {
        const currentDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const delta = initialPinchDist - currentDist;
        initialPinchDist = currentDist;
        cameraAngleRef.current.distance = Math.max(5, Math.min(32, cameraAngleRef.current.distance + delta * 0.05));
      }
    };

    const handleTouchEnd = () => {
      if (isTouchOrbiting) {
        isTouchOrbiting = false;
        lastTouchEndTimeRef.current = performance.now();
        const elapsed = performance.now() - touchStartTime;
        const dist = Math.hypot(lastTouchPos.x - touchStartPos.x, lastTouchPos.y - touchStartPos.y);

        // Tap detected (< 350ms and moved < 16px)
        if (elapsed < 350 && dist < 16) {
          if (activeToolRef.current === 'anchor') {
            const hitId = findObjectAtScreenCoords(touchStartPos.x, touchStartPos.y);
            handleAnchorAction(true, hitId || undefined);
          } else if (activeToolRef.current === 'unanchor') {
            const hitId = findObjectAtScreenCoords(touchStartPos.x, touchStartPos.y);
            handleAnchorAction(false, hitId || undefined);
          } else if (activeToolRef.current === 'delete') {
            const hitId = findObjectAtScreenCoords(touchStartPos.x, touchStartPos.y);
            handleDeleteAction(hitId || undefined);
          } else if (activeToolRef.current === 'scale') {
            const hitId = findObjectAtScreenCoords(touchStartPos.x, touchStartPos.y);
            handleScaleAction(hitId || undefined);
          } else if (activeToolRef.current === 'build') {
            const spawnPos = calculatePlacementPosition(touchStartPos.x, touchStartPos.y);
            handlePlaceBlock(spawnPos || undefined);
          }
        }
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: true });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    container.addEventListener('wheel', handleWheel, { passive: true });
    window.addEventListener('resize', updateRendererSize);
    window.addEventListener('orientationchange', updateRendererSize);

    // Game loop
    let animationFrameId: number;
    let lastTime = performance.now();
    let networkSendTimer = 0;
    let coordsSendTimer = 0;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      // 1. Process Local Movement with Realistic Kinematics (Ground Traction vs. Air Drag)
      const p = localPlayerStateRef.current;
      const keys = keysRef.current;
      const touch = touchMoveRef.current;

      let moveX = 0;
      let moveZ = 0;

      if (keys['KeyW'] || keys['ArrowUp']) moveZ -= 1;
      if (keys['KeyS'] || keys['ArrowDown']) moveZ += 1;
      if (keys['KeyA'] || keys['ArrowLeft']) moveX -= 1;
      if (keys['KeyD'] || keys['ArrowRight']) moveX += 1;

      if (Math.hypot(touch.x, touch.y) > 0.05) {
        moveX += touch.x;
        moveZ += touch.y;
      }

      const inputLen = Math.hypot(moveX, moveZ);
      const isSprinting = keys['ShiftLeft'] || keys['ShiftRight'] || isTouchSprintingRef.current;
      const maxMoveSpeed = isSprinting ? 9.2 : 5.6;

      const camAngle = cameraAngleRef.current.theta;
      const fwdX = -Math.sin(camAngle);
      const fwdZ = -Math.cos(camAngle);
      const rightX = Math.cos(camAngle);
      const rightZ = -Math.sin(camAngle);

      let targetVx = 0;
      let targetVz = 0;

      if (inputLen > 0.01) {
        const nx = moveX / inputLen;
        const nz = moveZ / inputLen;
        targetVx = (rightX * nx + fwdX * (-nz)) * maxMoveSpeed;
        targetVz = (rightZ * nx + fwdZ * (-nz)) * maxMoveSpeed;
      }

      // Realistic physical responsiveness: high ground traction, realistic air inertia
      const accelRate = p.isGrounded ? (inputLen > 0.01 ? 16 : 14) : 4.5;
      p.vx += (targetVx - p.vx) * Math.min(dt * accelRate, 1);
      p.vz += (targetVz - p.vz) * Math.min(dt * accelRate, 1);

      if (Math.hypot(p.vx, p.vz) > 0.1) {
        const targetRot = Math.atan2(p.vx, p.vz);
        let diff = targetRot - p.rotY;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        p.rotY += diff * Math.min(dt * 15, 1);

        if (p.isGrounded && p.anim !== 'kick' && p.anim !== 'slip') {
          p.anim = isSprinting ? 'run' : 'walk';
        }
      } else {
        if (p.isGrounded && p.anim !== 'kick' && p.anim !== 'slip' && p.anim !== 'wave' && p.anim !== 'dance') {
          p.anim = 'idle';
        }
      }

      // 1. Calculate tentative horizontal movement
      let standingOnObjVelocity = { vx: 0, vz: 0 };
      let nextX = p.x + (p.vx + standingOnObjVelocity.vx) * dt;
      let nextZ = p.z + (p.vz + standingOnObjVelocity.vz) * dt;
      const playerRadius = 0.30;

      // 2. Horizontal obstacle collision resolution (blocks player from walking through walls/anchored blocks)
      for (const [, item] of physicsObjectsRef.current) {
        if (item.data.type === 'trampoline') continue;
        const px = item.mesh.position.x;
        const py = item.mesh.position.y;
        const pz = item.mesh.position.z;
        const size = item.data.size;

        if (item.data.type === 'sphere') {
          const radius = size[0];
          const bottomY = py - radius;
          const topY = py + radius;
          if (p.y < topY - 0.25 && p.y + 1.6 > bottomY + 0.05) {
            const dx = nextX - px;
            const dz = nextZ - pz;
            const dist = Math.hypot(dx, dz);
            const minDist = radius + playerRadius;
            if (dist < minDist && dist > 0.001) {
              const push = minDist - dist;
              nextX += (dx / dist) * push;
              nextZ += (dz / dist) * push;
            }
          }
        } else if (item.data.type === 'barrel') {
          const radius = size[0];
          const halfH = size[1] / 2;
          const bottomY = py - halfH;
          const topY = py + halfH;
          if (p.y < topY - 0.28 && p.y + 1.6 > bottomY + 0.05) {
            const dx = nextX - px;
            const dz = nextZ - pz;
            const dist = Math.hypot(dx, dz);
            const minDist = radius + playerRadius;
            if (dist < minDist && dist > 0.001) {
              const push = minDist - dist;
              nextX += (dx / dist) * push;
              nextZ += (dz / dist) * push;
            }
          }
        } else if (item.data.type === 'ramp') {
          // Ramp allows slope walking from lower edge
          const halfW = size[0] / 2;
          const halfD = size[2] / 2;
          const h = size[1];
          const bottomY = py - h / 2;
          const topY = py + h / 2;
          if (p.y < bottomY - 0.1 && p.y + 1.6 > bottomY) {
            const dx = nextX - px;
            const dz = nextZ - pz;
            if (Math.abs(dx) < halfW + playerRadius && Math.abs(dz) < halfD + playerRadius) {
              const penX = (halfW + playerRadius) - Math.abs(dx);
              const penZ = (halfD + playerRadius) - Math.abs(dz);
              if (penX < penZ) {
                nextX += Math.sign(dx) * penX;
              } else {
                nextZ += Math.sign(dz) * penZ;
              }
            }
          }
        } else {
          // Box, Domino, Dice
          const halfW = size[0] / 2;
          const halfH = size[1] / 2;
          const halfD = size[2] / 2;
          const bottomY = py - halfH;
          const topY = py + halfH;

          // If the player is below the top step height, they hit the solid walls of the block
          if (p.y < topY - 0.28 && p.y + 1.6 > bottomY + 0.05) {
            const rotY = item.mesh.rotation.y || 0;
            const cosA = Math.cos(-rotY);
            const sinA = Math.sin(-rotY);
            const relX = (nextX - px) * cosA - (nextZ - pz) * sinA;
            const relZ = (nextX - px) * sinA + (nextZ - pz) * cosA;
            const extX = halfW + playerRadius;
            const extZ = halfD + playerRadius;

            if (Math.abs(relX) < extX && Math.abs(relZ) < extZ) {
              const penX = extX - Math.abs(relX);
              const penZ = extZ - Math.abs(relZ);
              let pushLocalX = 0;
              let pushLocalZ = 0;
              if (penX < penZ) {
                pushLocalX = Math.sign(relX) * penX;
              } else {
                pushLocalZ = Math.sign(relZ) * penZ;
              }
              const cosR = Math.cos(rotY);
              const sinR = Math.sin(rotY);
              nextX += pushLocalX * cosR - pushLocalZ * sinR;
              nextZ += pushLocalX * sinR + pushLocalZ * cosR;
            }
          }
        }
      }

      p.x = nextX;
      p.z = nextZ;

      // 3. Dynamic surface vertical support (standing / walking on top of blocks, ramps, spheres)
      let floorY = 0;
      standingOnObjVelocity = { vx: 0, vz: 0 };
      
      for (const [, item] of physicsObjectsRef.current) {
        if (item.data.type === 'trampoline') continue; // Handled separately
        
        const px = item.mesh.position.x;
        const py = item.mesh.position.y;
        const pz = item.mesh.position.z;
        const size = item.data.size;
        
        if (item.data.type === 'sphere') {
          const radius = size[0];
          const dx = p.x - px;
          const dz = p.z - pz;
          const distXZ = Math.hypot(dx, dz);
          if (distXZ < radius + playerRadius * 0.8) {
            const domeY = py + Math.sqrt(Math.max(0, radius * radius - distXZ * distXZ));
            if (p.y >= domeY - 0.45) {
              if (domeY > floorY) {
                floorY = domeY;
                if (!item.data.isStatic) {
                  standingOnObjVelocity = { vx: item.data.vx, vz: item.data.vz };
                }
              }
            }
          }
        } else if (item.data.type === 'ramp') {
          const halfW = size[0] / 2;
          const h = size[1];
          const halfD = size[2] / 2;
          const dx = Math.abs(p.x - px);
          const localZ = p.z - pz;
          
          if (dx < halfW + playerRadius * 0.7 && Math.abs(localZ) < halfD + playerRadius * 0.7) {
            // Slope height calculation: top at z = -halfD, bottom at z = +halfD
            const t = Math.max(0, Math.min(1, (localZ + halfD) / (halfD * 2)));
            const rampSurfaceY = (py + h / 2) - h * t;
            if (p.y >= rampSurfaceY - 0.45) {
              floorY = Math.max(floorY, rampSurfaceY);
            }
          }
        } else {
          // Box, Domino, Barrel, Dice
          const halfW = (item.data.type === 'barrel' ? size[0] : size[0] / 2);
          const halfH = size[1] / 2;
          const halfD = (item.data.type === 'barrel' ? size[0] : size[2] / 2);
          
          const rotY = item.mesh.rotation.y || 0;
          const cosA = Math.cos(-rotY);
          const sinA = Math.sin(-rotY);
          const relX = (p.x - px) * cosA - (p.z - pz) * sinA;
          const relZ = (p.x - px) * sinA + (p.z - pz) * cosA;
          
          if (Math.abs(relX) < halfW + playerRadius * 0.75 && Math.abs(relZ) < halfD + playerRadius * 0.75) {
            const topY = py + halfH;
            if (p.y >= topY - 0.45) {
              if (topY > floorY) {
                floorY = topY;
                if (!item.data.isStatic) {
                  standingOnObjVelocity = { vx: item.data.vx, vz: item.data.vz };
                }
              }
            }
          }
        }
      }

      // Realistic ballistic gravity & air terminal velocity
      const prevVy = p.vy;
      p.vy -= 20.0 * dt;
      p.vy = Math.max(-32, p.vy);

      p.y += p.vy * dt;

      if (p.y <= floorY) {
        p.y = floorY;
        // Impact landing sound when landing with downward speed
        if (!p.isGrounded && prevVy < -3.5) {
          sound.playLand(Math.min(2.5, Math.abs(prevVy) / 5.5));
        }
        p.vy = Math.max(0, p.vy);
        p.isGrounded = true;
        if (p.anim === 'jump') {
          p.anim = inputLen > 0.05 ? (isSprinting ? 'run' : 'walk') : 'idle';
        }
      } else {
        p.isGrounded = false;
      }

      // Trampoline check with Hooke's spring launch
      for (const [, item] of physicsObjectsRef.current) {
        if (item.data.type === 'trampoline') {
          const dx = Math.abs(p.x - item.mesh.position.x);
          const dz = Math.abs(p.z - item.mesh.position.z);
          const halfW = item.data.size[0] / 2;
          const halfD = item.data.size[2] / 2;

          if (dx < halfW && dz < halfD && p.y <= item.mesh.position.y + 0.35 && p.vy <= 0) {
            p.vy = 22.5;
            p.y = item.mesh.position.y + 0.4;
            p.isGrounded = false;
            p.anim = 'jump';
            sound.playBounce();
          }
        }
      }

      // Truly Infinite World: No boundary walls or clamps!
      // If player drops into the void below y = -40, recover safely to ground level
      if (p.y < -40) {
        p.y = 0;
        p.vy = 0;
      }

      // Dynamically reposition the infinite floor mesh centered around player,
      // snapped to 4-unit texture grid intervals so the grid lines never jitter or slide
      if (groundMeshRef.current) {
        groundMeshRef.current.position.x = Math.floor(p.x / 4) * 4;
        groundMeshRef.current.position.z = Math.floor(p.z / 4) * 4;
      }

      // Dynamically move directional shadow-casting lights along with player
      if (dirLightRef.current) {
        dirLightRef.current.position.set(p.x + 16, 32, p.z + 16);
        dirLightRef.current.target.position.set(p.x, p.y, p.z);
        dirLightRef.current.target.updateMatrixWorld();
      }
      if (fillLightRef.current) {
        fillLightRef.current.position.set(p.x - 16, 16, p.z - 16);
      }

      // Update Local Stickman Mesh
      if (localStickmanRef.current) {
        localStickmanRef.current.root.position.set(p.x, p.y, p.z);
        localStickmanRef.current.root.rotation.y = p.rotY;
        const currentSpeed = Math.hypot(p.vx, p.vz);
        animateStickman(localStickmanRef.current, now * 0.001, p.anim, currentSpeed, dt, p.vy);
      }

      // 2. BABFT Style Placement Raycasting & Snapping
      if (isBuildModeRef.current && ghostMeshRef.current && camera) {
        raycasterRef.current.setFromCamera(mouseCoordsRef.current, camera);

        // Raycast targets: ground mesh and all physics objects
        const targets: THREE.Object3D[] = [];
        if (groundMeshRef.current) targets.push(groundMeshRef.current);
        for (const [, item] of physicsObjectsRef.current) {
          targets.push(item.mesh);
        }

        const intersects = raycasterRef.current.intersectObjects(targets, true);
        const { halfHeight } = getObjectDimensions(selectedObjectTypeRef.current, buildScaleRef.current);

        if (intersects.length > 0) {
          const hit = intersects[0];
          const pt = hit.point;

          // Grid snap (1 unit grid for smooth boat/structure building)
          const grid = 1.0;
          let snapX = Math.round(pt.x / grid) * grid;
          let snapZ = Math.round(pt.z / grid) * grid;
          let snapY = halfHeight;

          // If hitting another physics object, snap on its surface
          if (hit.object !== groundMeshRef.current && hit.point.y > 0.05) {
            const normal = hit.face ? hit.face.normal.clone() : new THREE.Vector3(0, 1, 0);
            normal.transformDirection(hit.object.matrixWorld);

            if (normal.y > 0.4) {
              // Top face
              snapX = Math.round(pt.x / 0.5) * 0.5;
              snapZ = Math.round(pt.z / 0.5) * 0.5;
              snapY = pt.y + halfHeight;
            } else {
              // Side face
              snapX = Math.round((pt.x + normal.x * 0.5) / 0.5) * 0.5;
              snapZ = Math.round((pt.z + normal.z * 0.5) / 0.5) * 0.5;
              snapY = Math.max(halfHeight, Math.round(pt.y / 0.5) * 0.5);
            }
          }

          ghostMeshRef.current.visible = true;
          ghostMeshRef.current.position.set(snapX, snapY, snapZ);
          ghostMeshRef.current.rotation.y = (buildRotationDegRef.current * Math.PI) / 180;
          ghostSnapPosRef.current = [snapX, snapY, snapZ];
        } else {
          // Default in front of stickman
          const fwdX = Math.sin(p.rotY);
          const fwdZ = Math.cos(p.rotY);
          const fallbackX = Math.round((p.x + fwdX * 2.5) / 1.0) * 1.0;
          const fallbackZ = Math.round((p.z + fwdZ * 2.5) / 1.0) * 1.0;
          ghostMeshRef.current.position.set(fallbackX, halfHeight, fallbackZ);
          ghostMeshRef.current.rotation.y = (buildRotationDegRef.current * Math.PI) / 180;
          ghostSnapPosRef.current = [fallbackX, halfHeight, fallbackZ];
        }
      }

      // 2b. Anchor / Unanchor / Delete / Scale Tool Raycasting & Target Reticle
      if ((activeToolRef.current === 'anchor' || activeToolRef.current === 'unanchor' || activeToolRef.current === 'delete' || activeToolRef.current === 'scale') && camera) {
        raycasterRef.current.setFromCamera(mouseCoordsRef.current, camera);
        const targets: THREE.Object3D[] = [];
        const objMap = new Map<THREE.Object3D, string>();
        for (const [id, item] of physicsObjectsRef.current) {
          targets.push(item.mesh);
          objMap.set(item.mesh, id);
        }

        const intersects = raycasterRef.current.intersectObjects(targets, true);
        if (intersects.length > 0) {
          let topMesh: THREE.Object3D | null = intersects[0].object;
          while (topMesh && !objMap.has(topMesh) && topMesh.parent) {
            topMesh = topMesh.parent;
          }
          const hitId = topMesh ? objMap.get(topMesh) : null;
          hoveredObjectIdRef.current = hitId || null;

          if (hitId && targetReticleRef.current && targetReticleMatRef.current) {
            const item = physicsObjectsRef.current.get(hitId);
            if (item) {
              targetReticleRef.current.visible = true;
              targetReticleRef.current.position.copy(item.mesh.position);
              targetReticleRef.current.quaternion.copy(item.mesh.quaternion);
              const [sx, sy, sz] = item.data.size;
              targetReticleRef.current.scale.set(sx * 1.08, sy * 1.08, sz * 1.08);

              if (activeToolRef.current === 'anchor') {
                targetReticleMatRef.current.color.setHex(0xf59e0b); // Amber gold for anchor lock
              } else if (activeToolRef.current === 'unanchor') {
                targetReticleMatRef.current.color.setHex(0x38bdf8); // Sky blue for unanchor
              } else if (activeToolRef.current === 'scale') {
                targetReticleMatRef.current.color.setHex(0xa855f7); // Purple for scale
              } else {
                targetReticleMatRef.current.color.setHex(0xef4444); // Crimson red for delete
              }
            }
          }
        } else {
          hoveredObjectIdRef.current = null;
          if (targetReticleRef.current) {
            targetReticleRef.current.visible = false;
          }
        }
      } else if (targetReticleRef.current) {
        targetReticleRef.current.visible = false;
        hoveredObjectIdRef.current = null;
      }

      // 3. Interpolate Remote Players
      for (const [, remote] of remotePlayersRef.current) {
        remote.meshParts.root.position.lerp(remote.targetPos, Math.min(dt * 15, 1));
        let diff = remote.targetRotY - remote.meshParts.root.rotation.y;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        remote.meshParts.root.rotation.y += diff * Math.min(dt * 15, 1);

        const remoteVy = (remote.targetPos.y - remote.meshParts.root.position.y) / Math.max(0.016, dt);
        animateStickman(remote.meshParts, now * 0.001, remote.state.anim, 5, dt, remoteVy);
      }

      // 4. Interpolate Physics Objects
      for (const [, item] of physicsObjectsRef.current) {
        if (!item.data.isStatic) {
          item.mesh.position.lerp(item.targetPos, Math.min(dt * 20, 1));
          item.mesh.quaternion.slerp(item.targetQuat, Math.min(dt * 20, 1));
        }
      }

      // 5. Update Orbit Camera (Strictly Orbit Mode)
      if (cameraRef.current) {
        const { theta, phi, distance } = cameraAngleRef.current;
        const camX = p.x + distance * Math.sin(phi) * Math.sin(theta);
        const camY = p.y + distance * Math.cos(phi) + 1.1;
        const camZ = p.z + distance * Math.sin(phi) * Math.cos(theta);

        cameraRef.current.position.x += (camX - cameraRef.current.position.x) * Math.min(dt * 12, 1);
        cameraRef.current.position.y += (camY - cameraRef.current.position.y) * Math.min(dt * 12, 1);
        cameraRef.current.position.z += (camZ - cameraRef.current.position.z) * Math.min(dt * 12, 1);

        cameraRef.current.lookAt(p.x, p.y + 1.1, p.z);
      }

      
      // 6. Scale Name Tags and Chat Bubbles dynamically so they are always readable
      if (cameraRef.current) {
        const camPos = cameraRef.current.position;
        
        // Scale local player tags
        if (localStickmanRef.current) {
          const dist = Math.max(12, localStickmanRef.current.root.position.distanceTo(camPos));
          const factor = dist / 12; // Base distance where scale is 1
          localStickmanRef.current.nameTagSprite.scale.set(3.2 * factor, 0.8 * factor, 1);
          localStickmanRef.current.chatBubbleSprite.scale.set(2.2 * factor, 0.7 * factor, 1);
          
          // Slightly raise them so they don't overlap as much when scaled up
          localStickmanRef.current.nameTagSprite.position.set(0, 2.8 + (factor - 1) * 0.8, 0);
          localStickmanRef.current.chatBubbleSprite.position.set(0, 3.4 + (factor - 1) * 1.0, 0);
        }

        // Scale remote player tags
        for (const [, remote] of remotePlayersRef.current) {
          const dist = Math.max(12, remote.meshParts.root.position.distanceTo(camPos));
          const factor = dist / 12;
          remote.meshParts.nameTagSprite.scale.set(3.2 * factor, 0.8 * factor, 1);
          remote.meshParts.chatBubbleSprite.scale.set(2.2 * factor, 0.7 * factor, 1);
          
          remote.meshParts.nameTagSprite.position.set(0, 2.8 + (factor - 1) * 0.8, 0);
          remote.meshParts.chatBubbleSprite.position.set(0, 3.4 + (factor - 1) * 1.0, 0);
        }
      }

      // 7. Send Network & Coordinates Update
      networkSendTimer += dt;
      if (networkSendTimer >= 0.04) {
        networkSendTimer = 0;
        sendWs({
          type: 'player_update',
          x: p.x,
          y: p.y,
          z: p.z,
          vx: p.vx,
          vy: p.vy,
          vz: p.vz,
          rotY: p.rotY,
          anim: p.anim,
          isGrounded: p.isGrounded,
        });
      }

      coordsSendTimer += dt;
      if (coordsSendTimer >= 0.1) {
        coordsSendTimer = 0;
        callbacksRef.current.onPlayerCoordsChange?.(Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10);
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      clearInterval(pingInterval);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
      container.removeEventListener('wheel', handleWheel);
      window.removeEventListener('resize', updateRendererSize);
      window.removeEventListener('orientationchange', updateRendererSize);
      resizeObserver.disconnect();
      if (wsRef.current) {
        wsRef.current.close();
      }
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [isPrivateRoom, roomId, sendWs, triggerJump, triggerKick, triggerSlip]);

  // Update local avatar appearance if player color or name changes dynamically
  useEffect(() => {
    if (localStickmanRef.current) {
      updateStickmanColor(localStickmanRef.current, playerColor);
      updateNameTag(localStickmanRef.current, playerName, playerColor);
    }
  }, [playerColor, playerName]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-900 select-none">
      {/* 3D WebGL Canvas */}
      <div
        id="sandbox-3d-canvas-container"
        ref={containerRef}
        className={`h-full w-full ${isBuildMode ? 'cursor-cell' : 'cursor-crosshair'}`}
      />

      {/* Mobile Touch Controls */}
      <TouchControls
        visible={isMobileDevice}
        isBuildMode={isBuildMode}
        buildRotationDeg={buildRotationDeg}
        onPlaceBlock={handlePlaceBlock}
        onRotateBlock={onRotateBuild}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onMove={(dx, dy) => {
          touchMoveRef.current = { x: dx, y: dy };
        }}
        onJump={triggerJump}
        onKick={triggerKick}
        onSlip={triggerSlip}
        onSprintToggle={(sprinting) => {
          isTouchSprintingRef.current = sprinting;
        }}
      />
    </div>
  );
};
