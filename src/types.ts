export interface PlayerState {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rotY: number;
  anim: 'idle' | 'walk' | 'run' | 'jump' | 'kick' | 'wave' | 'dance' | 'slip';
  isGrounded: boolean;
  score?: number;
  chatMessage?: {
    text: string;
    timestamp: number;
  };
  lastUpdate?: number;
}

export type ObjectType = 'box' | 'sphere' | 'barrel' | 'domino' | 'ramp' | 'trampoline' | 'dice';

export interface PhysicsObject {
  id: string;
  type: ObjectType;
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  vx: number;
  vy: number;
  vz: number;
  size: [number, number, number]; // [width, height, depth] or [radius, radius, radius]
  color: string;
  mass: number;
  restitution?: number;
  isStatic?: boolean;
}

export type ActiveTool = 'none' | 'build' | 'anchor' | 'unanchor' | 'delete' | 'scale';

// Client -> Server messages
export type ClientMessage =
  | { type: 'join'; name: string; color: string; roomId?: string; isPrivate?: boolean }
  | {
      type: 'player_update';
      x: number;
      y: number;
      z: number;
      vx: number;
      vy: number;
      vz: number;
      rotY: number;
      anim: PlayerState['anim'];
      isGrounded: boolean;
    }
  | {
      type: 'spawn_object';
      objectType: ObjectType;
      position: [number, number, number];
      rotationY?: number;
      color?: string;
      isStatic?: boolean;
      scale?: number;
      size?: [number, number, number];
    }
  | {
      type: 'set_anchor';
      objectId: string;
      isStatic: boolean;
    }
  | {
      type: 'scale_object';
      objectId: string;
      scale?: number;
      size?: [number, number, number];
    }
  | {
      type: 'delete_object';
      objectId: string;
    }
  | {
      type: 'interact_object';
      objectId: string;
      impulse: [number, number, number];
      point?: [number, number, number];
    }
  | { type: 'reset_sandbox' }
  | { type: 'chat'; text: string }
  | { type: 'emote'; anim: PlayerState['anim'] }
  | { type: 'ping'; t: number };

// Server -> Client messages
export type ServerMessage =
  | {
      type: 'init';
      selfId: string;
      roomId: string;
      players: PlayerState[];
      objects: PhysicsObject[];
      serverTime: number;
    }
  | { type: 'player_joined'; player: PlayerState }
  | { type: 'player_left'; id: string }
  | {
      type: 'world_tick';
      players: Array<Pick<PlayerState, 'id' | 'x' | 'y' | 'z' | 'vx' | 'vy' | 'vz' | 'rotY' | 'anim' | 'isGrounded'>>;
      objects: Array<Pick<PhysicsObject, 'id' | 'x' | 'y' | 'z' | 'qx' | 'qy' | 'qz' | 'qw' | 'vx' | 'vy' | 'vz'>>;
      serverTime: number;
    }
  | { type: 'object_spawned'; object: PhysicsObject }
  | { type: 'object_updated'; object: PhysicsObject }
  | { type: 'object_removed'; id: string }
  | { type: 'objects_reset'; objects: PhysicsObject[] }
  | { type: 'chat_broadcast'; id: string; name: string; text: string }
  | { type: 'pong'; t: number; serverTime: number };
