import React, { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import {
  StickmanMeshParts,
  createStickmanMesh,
  animateStickman,
  updateNameTag,
  updateChatBubble,
} from '../game/StickmanModel.ts';
import { createPhysicsObjectMesh } from '../game/PhysicsProps.ts';
import { sound } from '../game/SoundEffects.ts';
import type {
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
  activeEmote: PlayerState['anim'] | null;
  onEmoteConsumed: () => void;
  isBuildMode: boolean;
  selectedObjectType: ObjectType;
  buildRotationDeg: number;
  onRotateBuild: () => void;
  onToggleBuildMode: () => void;
  chatMessageToSend: string | null;
  onChatConsumed: () => void;
  onChatReceived: (sender: string, text: string) => void;
}

function getObjectDimensions(type: ObjectType): { size: [number, number, number]; halfHeight: number } {
  switch (type) {
    case 'box':
      return { size: [1.2, 1.2, 1.2], halfHeight: 0.6 };
    case 'sphere':
      return { size: [0.9, 0.9, 0.9], halfHeight: 0.45 };
    case 'barrel':
      return { size: [0.75, 1.5, 0.75], halfHeight: 0.75 };
    case 'domino':
      return { size: [1.0, 1.8, 0.25], halfHeight: 0.9 };
    case 'ramp':
      return { size: [3, 0.8, 3], halfHeight: 0.4 };
    case 'trampoline':
      return { size: [3, 0.4, 3], halfHeight: 0.2 };
    case 'dice':
      return { size: [1.3, 1.3, 1.3], halfHeight: 0.65 };
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
  activeEmote,
  onEmoteConsumed,
  isBuildMode,
  selectedObjectType,
  buildRotationDeg,
  onRotateBuild,
  onToggleBuildMode,
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

  // BABFT Ghost Preview Mesh Ref
  const ghostMeshRef = useRef<THREE.Group | null>(null);
  const ghostSnapPosRef = useRef<[number, number, number]>([0, 0.6, 0]);

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

  // Raycaster & Mouse for BABFT building
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

  // Place block in BABFT build mode (used by mouse click or touch button/tap)
  
  const handleZoomIn = useCallback(() => {
    cameraAngleRef.current.distance = Math.max(5, cameraAngleRef.current.distance - 2);
  }, []);

  const handleZoomOut = useCallback(() => {
    cameraAngleRef.current.distance = Math.min(32, cameraAngleRef.current.distance + 2);
  }, []);

  const handlePlaceBlock = useCallback(() => {
    if (!isBuildMode) return;
    const rotRad = (buildRotationDeg * Math.PI) / 180;
    sendWs({
      type: 'spawn_object',
      objectType: selectedObjectType,
      position: ghostSnapPosRef.current,
      rotationY: rotRad,
    });
    sound.playPop();
  }, [buildRotationDeg, isBuildMode, selectedObjectType, sendWs]);

  // Handle local Kick / Interact
  const triggerKick = useCallback(() => {
    const now = Date.now();
    if (now - kickCooldownRef.current < 400) return;
    kickCooldownRef.current = now;

    localPlayerStateRef.current.anim = 'kick';
    sound.playKick();

    // Kick physics objects directly in front
    const p = localPlayerStateRef.current;
    const kickFwdX = -Math.sin(p.rotY);
    const kickFwdZ = -Math.cos(p.rotY);

    for (const [, item] of physicsObjectsRef.current) {
      if (item.data.isStatic) continue;
      const dx = item.mesh.position.x - p.x;
      const dy = item.mesh.position.y - p.y;
      const dz = item.mesh.position.z - p.z;
      const dist = Math.hypot(dx, dz);

      const dot = (dx * kickFwdX + dz * kickFwdZ) / (dist || 1);
      if (dist < 3.2 && dy >= -0.5 && dy <= 2.2 && dot > 0.4) {
        const force = 35;
        sendWs({
          type: 'interact_object',
          objectId: item.data.id,
          impulse: [kickFwdX * force, 14, kickFwdZ * force],
        });
      }
    }

    setTimeout(() => {
      if (localPlayerStateRef.current.anim === 'kick') {
        localPlayerStateRef.current.anim = 'idle';
      }
    }, 350);
  }, [sendWs]);

  // Jump handler
  const triggerJump = useCallback(() => {
    const p = localPlayerStateRef.current;
    if (p.isGrounded) {
      p.vy = 8.5;
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
    const { size, halfHeight } = getObjectDimensions(selectedObjectType);

    let geom: THREE.BufferGeometry;
    if (selectedObjectType === 'sphere') {
      geom = new THREE.SphereGeometry(size[0], 16, 16);
    } else if (selectedObjectType === 'barrel') {
      geom = new THREE.CylinderGeometry(size[0], size[0], size[1], 16);
    } else {
      geom = new THREE.BoxGeometry(size[0], size[1], size[2]);
    }

    // Hologram translucent green body
    const mat = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
    });
    const fillMesh = new THREE.Mesh(geom, mat);
    group.add(fillMesh);

    // Floor placement ring / footprint
    const ringGeom = new THREE.RingGeometry(0.5, 0.7, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, side: THREE.DoubleSide });
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
  }, [isBuildMode, selectedObjectType]);

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
    scene.fog = new THREE.FogExp2('#ffffff', 0.02);

    // Camera (Orbit Perspective)
    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 1000);
    cameraRef.current = camera;

    // WebGL Renderer with pixelated graphics support
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
    dirLight.position.set(14, 28, 14);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 80;
    const d = 26;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0xe2e8f0, 0.45);
    fillLight.position.set(-14, 12, -14);
    scene.add(fillLight);

    // Tiled White Arena Floor (Infinite Grid)
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

    // Create Local Stickman Mesh
    const localParts = createStickmanMesh(playerColor, playerName);
    localStickmanRef.current = localParts;
    scene.add(localParts.root);

    // Resize & 2X Retro Pixelated Scaling Handler
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

      // 1.5X Retro Pixelated Scaling
      const scale = 2.5;
      const renderW = Math.max(120, Math.floor(w / scale));
      const renderH = Math.max(90, Math.floor(h / scale));
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
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      sendWs({
        type: 'join',
        name: playerName,
        color: playerColor,
        roomId: roomId || 'public',
        isPrivate: isPrivateRoom,
      });
    };

    // Ping loop
    const pingInterval = setInterval(() => {
      sendWs({ type: 'ping', t: performance.now() });
    }, 2500);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage;

        if (msg.type === 'init') {
          selfIdRef.current = msg.selfId;
          onRoomIdConfirmed(msg.roomId);

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

          onPlayerCountChange(remotePlayersRef.current.size + 1);
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
              onPlayerCountChange(remotePlayersRef.current.size + 1);
              onChatReceived('System', `${msg.player.name} joined room`);
            }
          }
        } else if (msg.type === 'player_left') {
          const item = remotePlayersRef.current.get(msg.id);
          if (item) {
            scene.remove(item.meshParts.root);
            remotePlayersRef.current.delete(msg.id);
            onPlayerCountChange(remotePlayersRef.current.size + 1);
            onChatReceived('System', `${item.state.name} left room`);
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
          onChatReceived('System', 'Room objects reset');
        } else if (msg.type === 'chat_broadcast') {
          onChatReceived(msg.name, msg.text);
          const remote = remotePlayersRef.current.get(msg.id);
          if (remote) {
            updateChatBubble(remote.meshParts, msg.text);
            setTimeout(() => {
              updateChatBubble(remote.meshParts, '');
            }, 5000);
          }
        } else if (msg.type === 'pong') {
          const rtt = Math.round(performance.now() - msg.t);
          onPingChange(Math.max(1, rtt));
        }
      } catch (err) {
        console.error('Error processing WS packet:', err);
      }
    };

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
        // BABFT Rotate block
        e.preventDefault();
        onRotateBuild();
      } else if (e.code === 'KeyQ') {
        // Toggle build mode
        e.preventDefault();
        onToggleBuildMode();
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
      if (!isMouseDownRef.current) return;
      isMouseDownRef.current = false;

      // Check if it was a quick click rather than a camera drag
      const dragDist = Math.hypot(
        e.clientX - mouseDownStartPosRef.current.x,
        e.clientY - mouseDownStartPosRef.current.y
      );

      // If clicked on canvas and build mode is active, place block like BABFT!
      if (dragDist < 6 && isBuildMode && (e.target as HTMLElement)?.tagName === 'CANVAS') {
        const rotRad = (buildRotationDeg * Math.PI) / 180;
        sendWs({
          type: 'spawn_object',
          objectType: selectedObjectType,
          position: ghostSnapPosRef.current,
          rotationY: rotRad,
        });
        sound.playPop();
      }
    };

    const handleWheel = (e: WheelEvent) => {
      cameraAngleRef.current.distance = Math.max(5, Math.min(32, cameraAngleRef.current.distance + e.deltaY * 0.015));
    };

    // Touch handlers for mobile orbit and tap-to-place
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
        const elapsed = performance.now() - touchStartTime;
        const dist = Math.hypot(lastTouchPos.x - touchStartPos.x, lastTouchPos.y - touchStartPos.y);

        // Tap detected (< 280ms and moved < 12px)
        if (elapsed < 280 && dist < 12 && isBuildMode) {
          handlePlaceBlock();
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

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      // 1. Process Local Movement
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
      const moveSpeed = isSprinting ? 9.5 : 5.8;

      if (inputLen > 0.01) {
        const nx = moveX / inputLen;
        const nz = moveZ / inputLen;

        const camAngle = cameraAngleRef.current.theta;
        const fwdX = -Math.sin(camAngle);
        const fwdZ = -Math.cos(camAngle);
        const rightX = Math.cos(camAngle);
        const rightZ = -Math.sin(camAngle);

        const targetVx = (rightX * nx + fwdX * (-nz)) * moveSpeed;
        const targetVz = (rightZ * nx + fwdZ * (-nz)) * moveSpeed;

        p.vx += (targetVx - p.vx) * Math.min(dt * 12, 1);
        p.vz += (targetVz - p.vz) * Math.min(dt * 12, 1);

        const targetRot = Math.atan2(-p.vx, -p.vz);
        let diff = targetRot - p.rotY;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        p.rotY += diff * Math.min(dt * 15, 1);

        if (p.isGrounded && p.anim !== 'kick' && p.anim !== 'slip') {
          p.anim = isSprinting ? 'run' : 'walk';
        }
      } else {
        p.vx += (0 - p.vx) * Math.min(dt * 12, 1);
        p.vz += (0 - p.vz) * Math.min(dt * 12, 1);
        if (p.isGrounded && p.anim !== 'kick' && p.anim !== 'slip' && p.anim !== 'wave' && p.anim !== 'dance') {
          p.anim = 'idle';
        }
      }

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

      // Trampoline check
      for (const [, item] of physicsObjectsRef.current) {
        if (item.data.type === 'trampoline') {
          const dx = Math.abs(p.x - item.mesh.position.x);
          const dz = Math.abs(p.z - item.mesh.position.z);
          const halfW = item.data.size[0] / 2;
          const halfD = item.data.size[2] / 2;

          if (dx < halfW && dz < halfD && p.y <= item.mesh.position.y + 0.35 && p.vy <= 0) {
            p.vy = 18.0;
            p.y = item.mesh.position.y + 0.4;
            p.isGrounded = false;
            p.anim = 'jump';
            sound.playBounce();
          }
        }
      }

      const BOUND = 19.2;
      p.x = Math.max(-BOUND, Math.min(BOUND, p.x));
      p.z = Math.max(-BOUND, Math.min(BOUND, p.z));

      // Update Local Stickman Mesh
      if (localStickmanRef.current) {
        localStickmanRef.current.root.position.set(p.x, p.y, p.z);
        localStickmanRef.current.root.rotation.y = p.rotY;
        const currentSpeed = Math.hypot(p.vx, p.vz);
        animateStickman(localStickmanRef.current, now * 0.001, p.anim, currentSpeed, dt);
      }

      // 2. BABFT Style Placement Raycasting & Snapping
      if (isBuildMode && ghostMeshRef.current && camera) {
        raycasterRef.current.setFromCamera(mouseCoordsRef.current, camera);

        // Raycast targets: ground mesh and all physics objects
        const targets: THREE.Object3D[] = [];
        if (groundMeshRef.current) targets.push(groundMeshRef.current);
        for (const [, item] of physicsObjectsRef.current) {
          targets.push(item.mesh);
        }

        const intersects = raycasterRef.current.intersectObjects(targets, true);
        const { halfHeight } = getObjectDimensions(selectedObjectType);

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
          ghostMeshRef.current.rotation.y = (buildRotationDeg * Math.PI) / 180;
          ghostSnapPosRef.current = [snapX, snapY, snapZ];
        } else {
          // Default in front of stickman
          const fwdX = -Math.sin(p.rotY);
          const fwdZ = -Math.cos(p.rotY);
          const fallbackX = Math.round((p.x + fwdX * 2.5) / 1.0) * 1.0;
          const fallbackZ = Math.round((p.z + fwdZ * 2.5) / 1.0) * 1.0;
          ghostMeshRef.current.position.set(fallbackX, halfHeight, fallbackZ);
          ghostMeshRef.current.rotation.y = (buildRotationDeg * Math.PI) / 180;
          ghostSnapPosRef.current = [fallbackX, halfHeight, fallbackZ];
        }
      }

      // 3. Interpolate Remote Players
      for (const [, remote] of remotePlayersRef.current) {
        remote.meshParts.root.position.lerp(remote.targetPos, Math.min(dt * 15, 1));
        let diff = remote.targetRotY - remote.meshParts.root.rotation.y;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        remote.meshParts.root.rotation.y += diff * Math.min(dt * 15, 1);

        animateStickman(remote.meshParts, now * 0.001, remote.state.anim, 5, dt);
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
          localStickmanRef.current.nameTagSprite.scale.set(1.6 * factor, 0.4 * factor, 1);
          localStickmanRef.current.chatBubbleSprite.scale.set(2.2 * factor, 0.7 * factor, 1);
          
          // Slightly raise them so they don't overlap as much when scaled up
          localStickmanRef.current.nameTagSprite.position.set(0, 2.42 + (factor - 1) * 0.5, 0);
          localStickmanRef.current.chatBubbleSprite.position.set(0, 2.92 + (factor - 1) * 0.7, 0);
        }

        // Scale remote player tags
        for (const [, remote] of remotePlayersRef.current) {
          const dist = Math.max(12, remote.meshParts.root.position.distanceTo(camPos));
          const factor = dist / 12;
          remote.meshParts.nameTagSprite.scale.set(1.6 * factor, 0.4 * factor, 1);
          remote.meshParts.chatBubbleSprite.scale.set(2.2 * factor, 0.7 * factor, 1);
          
          remote.meshParts.nameTagSprite.position.set(0, 2.42 + (factor - 1) * 0.5, 0);
          remote.meshParts.chatBubbleSprite.position.set(0, 2.92 + (factor - 1) * 0.7, 0);
        }
      }

      // 7. Send Network Update

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
  }, [buildRotationDeg, handlePlaceBlock, isBuildMode, isPrivateRoom, onChatReceived, onPingChange, onPlayerCountChange, onRoomIdConfirmed, onRotateBuild, onToggleBuildMode, playerColor, playerName, roomId, selectedObjectType, sendWs, triggerJump, triggerKick, triggerSlip]);

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
