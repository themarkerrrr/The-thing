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
  dominoMaterial: CANNON.Material;
  bouncyMaterial: CANNON.Material;
  groundMaterial: CANNON.Material;

  constructor(id: string, isPrivate: boolean = false) {
    this.id = id;
    this.isPrivate = isPrivate;

    this.world = new CANNON.World();
    this.world.gravity.set(0, -9.81, 0);
    this.world.allowSleep = true;
    if (this.world.solver instanceof CANNON.GSSolver) {
      this.world.solver.iterations = 50;
      this.world.solver.tolerance = 0.0001;
    }

    this.defaultMaterial = new CANNON.Material('default');
    this.dominoMaterial = new CANNON.Material('domino');
    this.bouncyMaterial = new CANNON.Material('bouncy');
    this.groundMaterial = new CANNON.Material('ground');

    const contactDefaultGround = new CANNON.ContactMaterial(this.defaultMaterial, this.groundMaterial, {
      friction: 0.45,
      restitution: 0.2,
    });
    const contactDominoGround = new CANNON.ContactMaterial(this.dominoMaterial, this.groundMaterial, {
      friction: 0.75,
      restitution: 0.05,
    });
    const contactDominoDomino = new CANNON.ContactMaterial(this.dominoMaterial, this.dominoMaterial, {
      friction: 0.4,
      restitution: 0.1,
    });
    const contactBouncyGround = new CANNON.ContactMaterial(this.bouncyMaterial, this.groundMaterial, {
      friction: 0.35,
      restitution: 0.85,
    });
    const contactDefaultDefault = new CANNON.ContactMaterial(this.defaultMaterial, this.defaultMaterial, {
      friction: 0.4,
      restitution: 0.25,
    });

    this.world.addContactMaterial(contactDefaultGround);
    this.world.addContactMaterial(contactDominoGround);
    this.world.addContactMaterial(contactDominoDomino);
    this.world.addContactMaterial(contactBouncyGround);
    this.world.addContactMaterial(contactDefaultDefault);

    // Ground
    const groundBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Plane(),
      material: this.groundMaterial,
    });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(groundBody);

    // Arena bounds
    const wallThickness = 1;
    const createWall = (x: number, z: number, width: number, depth: number) => {
      const wall = new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: new CANNON.Box(new CANNON.Vec3(width / 2, WALL_HEIGHT / 2, depth / 2)),
        position: new CANNON.Vec3(x, WALL_HEIGHT / 2, z),
        material: this.defaultMaterial,
      });
      this.world.addBody(wall);
    };

    createWall(0, ARENA_SIZE / 2, ARENA_SIZE, wallThickness);
    createWall(0, -ARENA_SIZE / 2, ARENA_SIZE, wallThickness);
    createWall(ARENA_SIZE / 2, 0, wallThickness, ARENA_SIZE);
    createWall(-ARENA_SIZE / 2, 0, wallThickness, ARENA_SIZE);

    this.initDefaultSandbox();
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
    let shape: CANNON.Shape;
    let mat = restitution > 0.6 ? this.bouncyMaterial : this.defaultMaterial;
    if (type === 'domino') {
      mat = this.dominoMaterial;
    }

    if (type === 'sphere') {
      shape = new CANNON.Sphere(size[0]);
    } else if (type === 'barrel') {
      shape = new CANNON.Cylinder(size[0], size[0], size[1], 16);
    } else {
      shape = new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2));
    }

    const body = new CANNON.Body({
      mass: isStatic ? 0 : mass,
      shape,
      material: mat,
      position: new CANNON.Vec3(pos[0], pos[1], pos[2]),
      type: isStatic ? CANNON.Body.STATIC : CANNON.Body.DYNAMIC,
      linearDamping: type === 'sphere' ? 0.08 : 0.15,
      angularDamping: type === 'sphere' ? 0.22 : 0.25,
    });

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

  initDefaultSandbox() {
    for (const [, item] of this.objectsMap) {
      this.world.removeBody(item.body);
    }
    this.objectsMap.clear();

    // 1. Pyramid of Crates
    const crateColors = ['#f59e0b', '#d97706', '#b45309', '#f97316', '#ea580c'];
    const crateSize: [number, number, number] = [1.2, 1.2, 1.2];
    const rows = 3;
    let crateIdx = 0;
    for (let row = 0; row < rows; row++) {
      const count = rows - row;
      const startX = -((count - 1) * 1.35) / 2;
      const y = 0.6 + row * 1.25;
      for (let i = 0; i < count; i++) {
        const x = startX + i * 1.35;
        const col = crateColors[crateIdx % crateColors.length];
        crateIdx++;
        this.createPhysicsBody('box', [x, y, -8], crateSize, col, 4);
      }
    }

    // 2. Domino chain
    const dominoColors = ['#ef4444', '#f43f5e', '#ec4899', '#d946ef', '#a855f7', '#8b5cf6', '#6366f1', '#3b82f6'];
    const dominoSize: [number, number, number] = [1.0, 1.8, 0.25];
    for (let i = 0; i < 8; i++) {
      this.createPhysicsBody('domino', [7, 0.9, -4 + i * 1.4], dominoSize, dominoColors[i % dominoColors.length], 2);
    }

    // 3. Giant Bouncy Balls
    this.createPhysicsBody('sphere', [-6, 1.2, -4], [1.2, 1.2, 1.2], '#10b981', 3, 0.85);
    this.createPhysicsBody('sphere', [-8, 0.9, -6], [0.9, 0.9, 0.9], '#06b6d4', 2.5, 0.9);
    this.createPhysicsBody('sphere', [-5, 1.5, -8], [1.5, 1.5, 1.5], '#8b5cf6', 6, 0.75);

    // 4. Barrels
    this.createPhysicsBody('barrel', [3, 1.0, 4], [0.8, 1.6, 0.8], '#dc2626', 8, 0.2);
    this.createPhysicsBody('barrel', [-3, 1.0, 4], [0.8, 1.6, 0.8], '#f59e0b', 8, 0.2);

    // 5. Dice
    this.createPhysicsBody('dice', [0, 0.9, 6], [1.5, 1.5, 1.5], '#ffffff', 5, 0.4);

    // 6. Trampoline
    this.createPhysicsBody('trampoline', [0, 0.25, -2], [3.2, 0.5, 3.2], '#0ea5e9', 0, 1.5, true);

    // 7. Ramps
    this.createPhysicsBody('ramp', [-9, 0.5, 3], [3, 0.8, 3], '#64748b', 0, 0.1, true);
    this.createPhysicsBody('ramp', [9, 0.5, 3], [3, 0.8, 3], '#64748b', 0, 0.1, true);
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
    this.world.step(dt);

    for (const [, item] of this.objectsMap) {
      if (
        item.body.position.y < -10 ||
        Math.abs(item.body.position.x) > ARENA_SIZE ||
        Math.abs(item.body.position.z) > ARENA_SIZE
      ) {
        item.body.position.set(0, 5, -5);
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

        // Check interaction / push with objects in current room
        const playerRadius = 0.55;
        for (const [, item] of currentRoom.objectsMap) {
          if (item.meta.isStatic) continue;
          const dx = item.body.position.x - playerState.x;
          const dz = item.body.position.z - playerState.z;
          const distSq = dx * dx + dz * dz;
          const minDist = playerRadius + (item.meta.type === 'sphere' ? item.meta.size[0] : item.meta.size[0] / 2);

          if (distSq < minDist * minDist && Math.abs(item.body.position.y - playerState.y) < 2) {
            const dist = Math.sqrt(distSq) || 0.001;
            const nx = dx / dist;
            const nz = dz / dist;
            const pushSpeed = Math.sqrt(playerState.vx * playerState.vx + playerState.vz * playerState.vz) || 2.5;
            const pushForce = Math.min(pushSpeed * 0.4, 2.5);
            item.body.wakeUp();
            item.body.applyImpulse(
              new CANNON.Vec3(nx * pushForce, 0.2, nz * pushForce),
              new CANNON.Vec3(item.body.position.x, item.body.position.y, item.body.position.z)
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
        const size = sizeMap[msg.objectType] || [1, 1, 1];
        const color = msg.color || '#38bdf8';
        const isStatic = msg.objectType === 'ramp' || msg.objectType === 'trampoline';
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
