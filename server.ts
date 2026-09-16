import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import * as CANNON from 'cannon-es';
import { createServer as createViteServer } from 'vite';
import type { ClientMessage, ObjectType, PhysicsObject, PlayerState, ServerMessage } from './src/types.ts';

const app = express();
const PORT = 3000;
const server = http.createServer(app);

const ARENA_SIZE = 40;
const WALL_HEIGHT = 4;

interface InternalObject {
  meta: PhysicsObject;
  body: CANNON.Body;
}

interface ConnectedPlayer {
  ws: WebSocket;
  state: PlayerState;
  roomId: string;
}

class GameRoom {
  id: string;
  isPrivate: boolean;
  world: CANNON.World;
  objectsMap = new Map<string, InternalObject>();
  players = new Map<string, ConnectedPlayer>();
  objectCounter = 0;
  defaultMaterial: CANNON.Material;
  woodMaterial: CANNON.Material;
  dominoMaterial: CANNON.Material;
  rubberMaterial: CANNON.Material;
  barrelMaterial: CANNON.Material;
  diceMaterial: CANNON.Material;
  trampolineMaterial: CANNON.Material;
  groundMaterial: CANNON.Material;

  constructor(id: string, isPrivate: boolean = false) {
    this.id = id;
    this.isPrivate = isPrivate;

    this.world = new CANNON.World();
    this.world.gravity.set(0, -9.82, 0);
    this.world.allowSleep = true;
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);

    if (this.world.solver instanceof CANNON.GSSolver) {
      this.world.solver.iterations = 30;
      this.world.solver.tolerance = 0.0001;
    }

    this.world.defaultContactMaterial.contactEquationStiffness = 1e7;
    this.world.defaultContactMaterial.contactEquationRelaxation = 3;
    this.world.defaultContactMaterial.frictionEquationStiffness = 1e7;
    this.world.defaultContactMaterial.frictionEquationRelaxation = 3;

    this.defaultMaterial = new CANNON.Material('default');
    this.woodMaterial = new CANNON.Material('wood');
    this.dominoMaterial = new CANNON.Material('domino');
    this.rubberMaterial = new CANNON.Material('rubber');
    this.barrelMaterial = new CANNON.Material('barrel');
    this.diceMaterial = new CANNON.Material('dice');
    this.trampolineMaterial = new CANNON.Material('trampoline');
    this.groundMaterial = new CANNON.Material('ground');

    // Realistic Contact Material Pairings
    // 1. Ground interactions
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.woodMaterial, this.groundMaterial, {
      friction: 0.52,
      restitution: 0.18,
    }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.dominoMaterial, this.groundMaterial, {
      friction: 0.76, // High friction so dominos stand firm and topple cleanly
      restitution: 0.05,
    }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.rubberMaterial, this.groundMaterial, {
      friction: 0.58,
      restitution: 0.84, // Bouncy elastic spheres
    }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.barrelMaterial, this.groundMaterial, {
      friction: 0.46,
      restitution: 0.22,
    }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.diceMaterial, this.groundMaterial, {
      friction: 0.54,
      restitution: 0.35,
    }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.trampolineMaterial, this.groundMaterial, {
      friction: 0.70,
      restitution: 1.65,
    }));

    // 2. Inter-object interactions
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.woodMaterial, this.woodMaterial, {
      friction: 0.50,
      restitution: 0.15,
    }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.dominoMaterial, this.dominoMaterial, {
      friction: 0.48,
      restitution: 0.12,
    }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.rubberMaterial, this.woodMaterial, {
      friction: 0.52,
      restitution: 0.75,
    }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.barrelMaterial, this.woodMaterial, {
      friction: 0.44,
      restitution: 0.20,
    }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.rubberMaterial, this.rubberMaterial, {
      friction: 0.60,
      restitution: 0.88,
    }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.defaultMaterial, this.groundMaterial, {
      friction: 0.50,
      restitution: 0.20,
    }));

    // Truly Infinite Ground plane (Cannon Plane extends to infinity)
    const groundBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Plane(),
      material: this.groundMaterial,
    });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(groundBody);

    this.initDefaultSandbox();
  }

  getBaseMassForType(type: ObjectType, size: [number, number, number]): number {
    if (type === 'domino') return Math.max(0.4, Math.round(size[0] * size[1] * size[2] * 2.4 * 10) / 10);
    if (type === 'sphere') return Math.max(0.8, Math.round(Math.pow(size[0], 3) * 2.6 * 10) / 10);
    if (type === 'barrel') return Math.max(2.0, Math.round(size[0] * size[0] * size[1] * 12.0 * 10) / 10);
    if (type === 'dice') return Math.max(0.6, Math.round(size[0] * size[1] * size[2] * 1.0 * 10) / 10);
    if (type === 'box') return Math.max(1.0, Math.round(size[0] * size[1] * size[2] * 2.8 * 10) / 10);
    return 4.0;
  }

  setObjectAnchor(objectId: string, isStatic: boolean): InternalObject | null {
    const item = this.objectsMap.get(objectId);
    if (!item) return null;

    item.meta.isStatic = isStatic;
    if (isStatic) {
      item.body.type = CANNON.Body.STATIC;
      item.body.mass = 0;
      item.body.collisionResponse = true;
      item.body.velocity.set(0, 0, 0);
      item.body.angularVelocity.set(0, 0, 0);
      item.body.updateMassProperties();
      item.body.updateAABB();
      item.body.wakeUp();
      item.meta.vx = 0;
      item.meta.vy = 0;
      item.meta.vz = 0;
    } else {
      const mass = this.getBaseMassForType(item.meta.type, item.meta.size);
      item.body.type = CANNON.Body.DYNAMIC;
      item.body.mass = mass;
      item.body.collisionResponse = true;
      item.body.updateMassProperties();
      item.body.updateAABB();
      item.body.wakeUp();
    }

    // Wake up all dynamic bodies so they immediately collide and settle against the newly anchored/unanchored body
    for (const [, other] of this.objectsMap) {
      if (!other.meta.isStatic) {
        other.body.wakeUp();
      }
    }

    return item;
  }

  scalePhysicsObject(objectId: string, targetScale?: number, explicitSize?: [number, number, number]): InternalObject | null {
    const item = this.objectsMap.get(objectId);
    if (!item) return null;

    const baseSizes: Record<ObjectType, [number, number, number]> = {
      box: [1.2, 1.2, 1.2],
      sphere: [0.9, 0.9, 0.9],
      barrel: [0.75, 1.5, 0.75],
      domino: [1.0, 1.8, 0.25],
      ramp: [3, 0.8, 3],
      trampoline: [3, 0.4, 3],
      dice: [1.3, 1.3, 1.3],
    };

    const baseSize = baseSizes[item.meta.type] || [1, 1, 1];
    let newSize: [number, number, number];

    if (explicitSize) {
      newSize = [
        Math.max(0.3, explicitSize[0]),
        Math.max(0.3, explicitSize[1]),
        Math.max(0.3, explicitSize[2]),
      ];
    } else if (typeof targetScale === 'number' && targetScale > 0) {
      newSize = [
        Math.round(baseSize[0] * targetScale * 100) / 100,
        Math.round(baseSize[1] * targetScale * 100) / 100,
        Math.round(baseSize[2] * targetScale * 100) / 100,
      ];
    } else {
      // Cycle through scale presets: 0.5x, 1x, 1.5x, 2x, 3x, 4x
      const currentScale = Math.round((item.meta.size[0] / baseSize[0]) * 10) / 10;
      const presets = [0.5, 1.0, 1.5, 2.0, 3.0, 4.0];
      let nextScale = presets[0];
      for (let i = 0; i < presets.length; i++) {
        if (presets[i] > currentScale + 0.1) {
          nextScale = presets[i];
          break;
        }
      }
      newSize = [
        Math.round(baseSize[0] * nextScale * 100) / 100,
        Math.round(baseSize[1] * nextScale * 100) / 100,
        Math.round(baseSize[2] * nextScale * 100) / 100,
      ];
    }

    const prevPos = item.body.position.clone();
    const prevQuat = item.body.quaternion.clone();
    const prevVel = item.body.velocity.clone();
    const prevAngVel = item.body.angularVelocity.clone();
    const isStatic = Boolean(item.meta.isStatic || item.body.type === CANNON.Body.STATIC);

    // Remove previous body
    this.world.removeBody(item.body);

    // Create fresh body with new size
    const tempItem = this.createPhysicsBody(
      item.meta.type,
      [prevPos.x, prevPos.y, prevPos.z],
      newSize,
      item.meta.color,
      item.meta.mass,
      item.meta.restitution || 0.3,
      isStatic,
      0
    );

    // Unregister temp item ID and reuse original item body
    this.world.removeBody(tempItem.body);
    this.objectsMap.delete(tempItem.meta.id);

    tempItem.body.position.copy(prevPos);
    tempItem.body.quaternion.copy(prevQuat);
    tempItem.body.velocity.copy(prevVel);
    tempItem.body.angularVelocity.copy(prevAngVel);
    this.world.addBody(tempItem.body);

    item.body = tempItem.body;
    item.meta.size = newSize;
    item.meta.mass = tempItem.meta.mass;
    item.body.wakeUp();

    for (const [, other] of this.objectsMap) {
      if (!other.meta.isStatic) {
        other.body.wakeUp();
      }
    }

    return item;
  }

  generateObjectId(): string {
    return `obj_${Date.now()}_${++this.objectCounter}`;
  }

  createPhysicsBody(
    type: ObjectType,
    pos: [number, number, number],
    size: [number, number, number],
    color: string,
    mass: number = 5,
    restitution: number = 0.3,
    isStatic: boolean = false,
    rotationY: number = 0
  ): InternalObject {
    const id = this.generateObjectId();
    let shape: CANNON.Shape | null = null;
    let mat = this.defaultMaterial;
    let linearDamping = 0.1;
    let angularDamping = 0.2;

    if (type === 'domino') {
      mat = this.dominoMaterial;
      shape = new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2));
      linearDamping = 0.08;
      angularDamping = 0.35;
      mass = 1.2; // Lightweight domino tile (effortless to topple and cascade)
    } else if (type === 'sphere') {
      mat = this.rubberMaterial;
      shape = new CANNON.Sphere(size[0]);
      linearDamping = 0.02;
      angularDamping = 0.08; // Natural rolling
      // Scaled rubber sphere mass by volume (r=0.9 -> ~2.4kg, r=1.5 -> ~7.5kg)
      mass = Math.max(1.8, Math.round(Math.pow(size[0], 3) * 2.6 * 10) / 10);
    } else if (type === 'barrel') {
      mat = this.barrelMaterial;
      linearDamping = 0.05;
      angularDamping = 0.15;
      mass = 11.0; // Heavy industrial metal drum (high inertia and momentum)
    } else if (type === 'dice') {
      mat = this.diceMaterial;
      shape = new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2));
      linearDamping = 0.06;
      angularDamping = 0.18;
      mass = 2.2; // Compact wooden/plastic dice
    } else if (type === 'ramp') {
      mat = this.woodMaterial;
      const hw = size[0] / 2, hh = size[1] / 2, hd = size[2] / 2;
      const vertices = [
        new CANNON.Vec3(-hw, -hh, -hd), // 0: bottom back left
        new CANNON.Vec3( hw, -hh, -hd), // 1: bottom back right
        new CANNON.Vec3(-hw, -hh,  hd), // 2: bottom front left
        new CANNON.Vec3( hw, -hh,  hd), // 3: bottom front right
        new CANNON.Vec3(-hw,  hh, -hd), // 4: top back left
        new CANNON.Vec3( hw,  hh, -hd), // 5: top back right
      ];
      const faces = [
        [0, 1, 3, 2], // bottom
        [0, 4, 5, 1], // back
        [2, 3, 5, 4], // slope
        [0, 2, 4],    // left
        [1, 5, 3],    // right
      ];
      shape = new CANNON.ConvexPolyhedron({ vertices, faces });
      isStatic = true;
      mass = 0;
    } else if (type === 'trampoline') {
      mat = this.trampolineMaterial;
      shape = new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2));
      isStatic = true;
      mass = 0;
    } else {
      // Default Box (Crate)
      mat = this.woodMaterial;
      shape = new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2));
      linearDamping = 0.10;
      angularDamping = 0.22;
      mass = 4.8; // Sturdy wooden cargo crate
    }

    const body = new CANNON.Body({
      mass: isStatic ? 0 : mass,
      material: mat,
      position: new CANNON.Vec3(pos[0], pos[1], pos[2]),
      type: isStatic ? CANNON.Body.STATIC : CANNON.Body.DYNAMIC,
      linearDamping,
      angularDamping,
    });

    if (type === 'barrel') {
      // Rotate Cannon cylinder shape 90 deg along X so its height aligns with Three.js Y axis
      const cylinderShape = new CANNON.Cylinder(size[0], size[0], size[1], 16);
      const quat = new CANNON.Quaternion();
      quat.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);
      body.addShape(cylinderShape, new CANNON.Vec3(0, 0, 0), quat);
    } else if (shape) {
      body.addShape(shape);
    }

    if (rotationY) {
      body.quaternion.setFromEuler(0, rotationY, 0);
    }

    this.world.addBody(body);

    const meta: PhysicsObject = {
      id,
      type,
      x: pos[0],
      y: pos[1],
      z: pos[2],
      qx: body.quaternion.x,
      qy: body.quaternion.y,
      qz: body.quaternion.z,
      qw: body.quaternion.w,
      vx: 0,
      vy: 0,
      vz: 0,
      size,
      color,
      mass,
      restitution,
      isStatic,
    };

    const item: InternalObject = { meta, body };
    this.objectsMap.set(id, item);
    return item;
  }

  removePhysicsObject(id: string): boolean {
    const item = this.objectsMap.get(id);
    if (!item) return false;
    this.world.removeBody(item.body);
    this.objectsMap.delete(id);
    // Wake up remaining dynamic bodies so any blocks resting on the deleted block fall naturally
    for (const [, other] of this.objectsMap) {
      if (!other.meta.isStatic) {
        other.body.wakeUp();
      }
    }
    return true;
  }

  initDefaultSandbox() {
    for (const [, item] of this.objectsMap) {
      this.world.removeBody(item.body);
    }
    this.objectsMap.clear();
  }

  broadcast(msg: ServerMessage, excludeId?: string) {
    const data = JSON.stringify(msg);
    for (const [id, player] of this.players) {
      if (excludeId && id === excludeId) continue;
      if (player.ws.readyState === WebSocket.OPEN) {
        player.ws.send(data);
      }
    }
  }

  step(dt: number) {
    // Substepping at 60Hz fixed physics step for smooth, jitter-free simulation
    this.world.step(1 / 60, dt, 4);

    for (const [, item] of this.objectsMap) {
      // If an object falls into the abyss below y = -50, recover it to ground height
      if (item.body.position.y < -50) {
        item.body.position.set(item.body.position.x, 2, item.body.position.z);
        item.body.velocity.set(0, 0, 0);
        item.body.angularVelocity.set(0, 0, 0);
        item.body.quaternion.set(0, 0, 0, 1);
      }

      item.meta.x = item.body.position.x;
      item.meta.y = item.body.position.y;
      item.meta.z = item.body.position.z;
      item.meta.qx = item.body.quaternion.x;
      item.meta.qy = item.body.quaternion.y;
      item.meta.qz = item.body.quaternion.z;
      item.meta.qw = item.body.quaternion.w;
      item.meta.vx = item.body.velocity.x;
      item.meta.vy = item.body.velocity.y;
      item.meta.vz = item.body.velocity.z;
    }
  }
}

// Multi-room registry
const rooms = new Map<string, GameRoom>();
const publicRoom = new GameRoom('public', false);
rooms.set('public', publicRoom);

function getOrCreateRoom(roomId: string, isPrivate: boolean = false): GameRoom {
  const cleanId = (roomId || 'public').trim().substring(0, 32);
  let room = rooms.get(cleanId);
  if (!room) {
    room = new GameRoom(cleanId, isPrivate);
    rooms.set(cleanId, room);
  }
  return room;
}

const STICKMAN_COLORS = [
  '#2a2c30', // Gunmetal Chrome
  '#e2e8f0', // Silver
  '#eab308', // Gold
  '#3b82f6', // Cobalt
  '#ef4444', // Crimson
  '#10b981', // Emerald
  '#a855f7', // Purple
];

// WebSocket Server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  const playerId = `p_${Math.random().toString(36).substring(2, 8)}`;
  let currentRoom: GameRoom = publicRoom;

  const defaultColor = STICKMAN_COLORS[Math.floor(Math.random() * STICKMAN_COLORS.length)];
  const angle = Math.random() * Math.PI * 2;
  const radius = 2 + Math.random() * 3;

  const playerState: PlayerState = {
    id: playerId,
    name: `Stick_${Math.floor(100 + Math.random() * 900)}`,
    color: defaultColor,
    x: Math.cos(angle) * radius,
    y: 0,
    z: Math.sin(angle) * radius + 2,
    vx: 0,
    vy: 0,
    vz: 0,
    rotY: 0,
    anim: 'idle',
    isGrounded: true,
  };

  const connectedPlayer: ConnectedPlayer = {
    ws,
    state: playerState,
    roomId: 'public',
  };

  const sendRoomInit = (room: GameRoom) => {
    const currentObjects: PhysicsObject[] = [];
    for (const [, item] of room.objectsMap) {
      currentObjects.push(item.meta);
    }
    const otherPlayers: PlayerState[] = [];
    for (const [id, p] of room.players) {
      if (id !== playerId) {
        otherPlayers.push(p.state);
      }
    }

    const initMsg: ServerMessage = {
      type: 'init',
      selfId: playerId,
      roomId: room.id,
      players: otherPlayers,
      objects: currentObjects,
      serverTime: Date.now(),
    };
    ws.send(JSON.stringify(initMsg));
  };

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as ClientMessage;

      if (msg.type === 'join') {
        const targetRoomId = msg.roomId?.trim() || 'public';
        const isPrivate = Boolean(msg.isPrivate);

        // Leave previous room if switching
        if (currentRoom.players.has(playerId)) {
          currentRoom.players.delete(playerId);
          currentRoom.broadcast({ type: 'player_left', id: playerId });
        }

        currentRoom = getOrCreateRoom(targetRoomId, isPrivate);
        connectedPlayer.roomId = currentRoom.id;

        if (msg.name?.trim()) playerState.name = msg.name.trim().substring(0, 20);
        if (msg.color) playerState.color = msg.color;

        currentRoom.players.set(playerId, connectedPlayer);

        sendRoomInit(currentRoom);

        currentRoom.broadcast({ type: 'player_joined', player: playerState }, playerId);
      } else if (msg.type === 'player_update') {
        playerState.x = msg.x;
        playerState.y = msg.y;
        playerState.z = msg.z;
        playerState.vx = msg.vx;
        playerState.vy = msg.vy;
        playerState.vz = msg.vz;
        playerState.rotY = msg.rotY;
        playerState.anim = msg.anim;
        playerState.isGrounded = msg.isGrounded;
        playerState.lastUpdate = Date.now();

        // Realistic player-to-object contact physics with torque & momentum transfer
        const playerRadius = 0.50;
        for (const [, item] of currentRoom.objectsMap) {
          if (item.meta.isStatic) continue;
          const dx = item.body.position.x - playerState.x;
          const dz = item.body.position.z - playerState.z;
          const distSq = dx * dx + dz * dz;
          const objRadius = item.meta.type === 'sphere' ? item.meta.size[0] : Math.hypot(item.meta.size[0], item.meta.size[2]) * 0.45;
          const minDist = playerRadius + objRadius;

          if (distSq < minDist * minDist && Math.abs(item.body.position.y - playerState.y) < 2.2) {
            const dist = Math.sqrt(distSq) || 0.001;
            const nx = dx / dist;
            const nz = dz / dist;
            const speed = Math.hypot(playerState.vx, playerState.vz) || 2.2;
            const impulseMag = Math.min(speed * 2.2, 8.0);

            // Contact point calculation for natural rotational torque (tipping over dominos, crates, barrels)
            const contactY = Math.max(item.body.position.y - 0.5, Math.min(item.body.position.y + 0.7, playerState.y + 0.9));
            const contactPos = new CANNON.Vec3(
              item.body.position.x - nx * (objRadius * 0.6),
              contactY,
              item.body.position.z - nz * (objRadius * 0.6)
            );

            item.body.wakeUp();
            item.body.applyImpulse(
              new CANNON.Vec3(nx * impulseMag, 0.4, nz * impulseMag),
              contactPos
            );
          }
        }
      } else if (msg.type === 'spawn_object') {
        const sizeMap: Record<ObjectType, [number, number, number]> = {
          box: [1.2, 1.2, 1.2],
          sphere: [0.9, 0.9, 0.9],
          barrel: [0.75, 1.5, 0.75],
          domino: [1.0, 1.8, 0.25],
          ramp: [3, 0.8, 3],
          trampoline: [3, 0.4, 3],
          dice: [1.3, 1.3, 1.3],
        };
        const base = sizeMap[msg.objectType] || [1, 1, 1];
        const scale = typeof msg.scale === 'number' && msg.scale > 0 ? msg.scale : 1;
        const size: [number, number, number] = msg.size || [
          Math.round(base[0] * scale * 100) / 100,
          Math.round(base[1] * scale * 100) / 100,
          Math.round(base[2] * scale * 100) / 100,
        ];
        const color = msg.color || '#38bdf8';
        const isStatic = typeof msg.isStatic === 'boolean'
          ? msg.isStatic
          : (msg.objectType === 'ramp' || msg.objectType === 'trampoline');
        const restitution = msg.objectType === 'trampoline' ? 1.5 : msg.objectType === 'sphere' ? 0.85 : 0.3;

        const newObj = currentRoom.createPhysicsBody(
          msg.objectType,
          msg.position,
          size,
          color,
          5,
          restitution,
          isStatic,
          msg.rotationY || 0
        );

        currentRoom.broadcast({
          type: 'object_spawned',
          object: newObj.meta,
        });
      } else if (msg.type === 'set_anchor') {
        const updated = currentRoom.setObjectAnchor(msg.objectId, msg.isStatic);
        if (updated) {
          currentRoom.broadcast({
            type: 'object_updated',
            object: updated.meta,
          });
        }
      } else if (msg.type === 'scale_object') {
        const updated = currentRoom.scalePhysicsObject(msg.objectId, msg.scale, msg.size);
        if (updated) {
          currentRoom.broadcast({
            type: 'object_updated',
            object: updated.meta,
          });
        }
      } else if (msg.type === 'delete_object') {
        if (currentRoom.removePhysicsObject(msg.objectId)) {
          currentRoom.broadcast({
            type: 'object_removed',
            id: msg.objectId,
          });
        }
      } else if (msg.type === 'interact_object') {
        const item = currentRoom.objectsMap.get(msg.objectId);
        if (item && !item.meta.isStatic) {
          item.body.wakeUp();
          const [ix, iy, iz] = msg.impulse;
          const px = msg.point ? msg.point[0] : item.body.position.x;
          const py = msg.point ? msg.point[1] : item.body.position.y;
          const pz = msg.point ? msg.point[2] : item.body.position.z;
          item.body.applyImpulse(
            new CANNON.Vec3(ix, iy, iz),
            new CANNON.Vec3(px, py, pz)
          );
        }
      } else if (msg.type === 'reset_sandbox') {
        currentRoom.initDefaultSandbox();
        const freshObjects: PhysicsObject[] = [];
        for (const [, item] of currentRoom.objectsMap) {
          freshObjects.push(item.meta);
        }
        currentRoom.broadcast({ type: 'objects_reset', objects: freshObjects });
      } else if (msg.type === 'chat') {
        if (msg.text && msg.text.trim()) {
          const sanitized = msg.text.trim().substring(0, 120);
          playerState.chatMessage = {
            text: sanitized,
            timestamp: Date.now(),
          };
          currentRoom.broadcast({
            type: 'chat_broadcast',
            id: playerId,
            name: playerState.name,
            text: sanitized,
          });
        }
      } else if (msg.type === 'emote') {
        playerState.anim = msg.anim;
        currentRoom.broadcast({
          type: 'world_tick',
          players: [{
            id: playerId,
            x: playerState.x,
            y: playerState.y,
            z: playerState.z,
            vx: playerState.vx,
            vy: playerState.vy,
            vz: playerState.vz,
            rotY: playerState.rotY,
            anim: msg.anim,
            isGrounded: playerState.isGrounded,
          }],
          objects: [],
          serverTime: Date.now(),
        });
      } else if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', t: msg.t, serverTime: Date.now() }));
      }
    } catch (err) {
      console.error('Error handling WS message:', err);
    }
  });

  ws.on('close', () => {
    if (currentRoom.players.has(playerId)) {
      currentRoom.players.delete(playerId);
      currentRoom.broadcast({ type: 'player_left', id: playerId });

      // Clean up empty private room
      if (currentRoom.isPrivate && currentRoom.players.size === 0 && currentRoom.id !== 'public') {
        rooms.delete(currentRoom.id);
      }
    }
  });
});

// Fixed Physics Simulation Loop (30 FPS) for all active rooms
const TICK_RATE = 30;
const FIXED_DELTA = 1 / TICK_RATE;

setInterval(() => {
  for (const [, room] of rooms) {
    if (room.players.size === 0 && room.id !== 'public') continue;

    room.step(FIXED_DELTA);

    const objectUpdates: Array<Pick<PhysicsObject, 'id' | 'x' | 'y' | 'z' | 'qx' | 'qy' | 'qz' | 'qw' | 'vx' | 'vy' | 'vz'>> = [];

    for (const [id, item] of room.objectsMap) {
      if (!item.meta.isStatic) {
        objectUpdates.push({
          id,
          x: Number(item.meta.x.toFixed(3)),
          y: Number(item.meta.y.toFixed(3)),
          z: Number(item.meta.z.toFixed(3)),
          qx: Number(item.meta.qx.toFixed(3)),
          qy: Number(item.meta.qy.toFixed(3)),
          qz: Number(item.meta.qz.toFixed(3)),
          qw: Number(item.meta.qw.toFixed(3)),
          vx: Number(item.meta.vx.toFixed(2)),
          vy: Number(item.meta.vy.toFixed(2)),
          vz: Number(item.meta.vz.toFixed(2)),
        });
      }
    }

    const playerUpdates: Array<Pick<PlayerState, 'id' | 'x' | 'y' | 'z' | 'vx' | 'vy' | 'vz' | 'rotY' | 'anim' | 'isGrounded'>> = [];
    for (const [id, p] of room.players) {
      playerUpdates.push({
        id,
        x: Number(p.state.x.toFixed(3)),
        y: Number(p.state.y.toFixed(3)),
        z: Number(p.state.z.toFixed(3)),
        vx: Number(p.state.vx.toFixed(2)),
        vy: Number(p.state.vy.toFixed(2)),
        vz: Number(p.state.vz.toFixed(2)),
        rotY: Number(p.state.rotY.toFixed(3)),
        anim: p.state.anim,
        isGrounded: p.state.isGrounded,
      });
    }

    if (room.players.size > 0) {
      const tickMsg: ServerMessage = {
        type: 'world_tick',
        players: playerUpdates,
        objects: objectUpdates,
        serverTime: Date.now(),
      };
      room.broadcast(tickMsg);
    }
  }
}, 1000 / TICK_RATE);

// Express and Vite Setup
app.use(express.json());

app.get('/api/health', (req, res) => {
  let totalPlayers = 0;
  for (const [, room] of rooms) {
    totalPlayers += room.players.size;
  }
  res.json({
    status: 'ok',
    game: 'stickgrounds',
    roomsCount: rooms.size,
    playersCount: totalPlayers,
    uptime: process.uptime(),
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`stickgrounds server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
