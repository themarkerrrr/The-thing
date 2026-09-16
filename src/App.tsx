/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import { TitleScreen } from './components/TitleScreen.tsx';
import { SandboxGame } from './components/SandboxGame.tsx';
import { HUDOverlay } from './components/HUDOverlay.tsx';
import { useDeviceDetection } from './hooks/useDeviceDetection.ts';
import type { ActiveTool, ObjectType, PlayerState } from './types.ts';

interface ChatMessage {
  sender: string;
  text: string;
  id: string;
  time: string;
}

export default function App() {
  const deviceInfo = useDeviceDetection();
  const [inGame, setInGame] = useState(false);
  const [playerName, setPlayerName] = useState(() => {
    return `Stick_${Math.floor(100 + Math.random() * 900)}`;
  });
  const [playerColor, setPlayerColor] = useState('#383b42');
  const [roomId, setRoomId] = useState('public');
  const [isPrivateRoom, setIsPrivateRoom] = useState(false);

  // In-Game status
  const [playerCount, setPlayerCount] = useState(1);
  const [ping, setPing] = useState(12);
  const [playerCoords, setPlayerCoords] = useState<{ x: number; z: number }>({ x: 0, z: 0 });

  // Active Tool State (Build, Anchor, Unanchor, Scale, Delete, None)
  const [activeTool, setActiveTool] = useState<ActiveTool>('none');
  const [selectedObjectType, setSelectedObjectType] = useState<ObjectType>('box');
  const [buildRotationDeg, setBuildRotationDeg] = useState(0);
  const [autoAnchor, setAutoAnchor] = useState<boolean>(true); // Default true so all newly placed parts are anchored upon placed
  const [buildScale, setBuildScale] = useState<number>(1); // Scale multiplier: 0.5, 0.75, 1, 1.5, 2, 3, 4

  // Actions & Emotes
  const [activeEmote, setActiveEmote] = useState<PlayerState['anim'] | null>(null);
  const [chatMessageToSend, setChatMessageToSend] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome',
      sender: 'System',
      text: 'stickgrounds connected. Auto-Anchor is ON. Use Scale & Anchor tools to customize blocks.',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const handleJoinGame = useCallback((name: string, color: string, room: string, isPrivate: boolean) => {
    setPlayerName(name);
    setPlayerColor(color);
    setRoomId(room);
    setIsPrivateRoom(isPrivate);
    setActiveTool('none');
    setInGame(true);
  }, []);

  const handleLeaveGame = useCallback(() => {
    setActiveTool('none');
    setInGame(false);
  }, []);

  const handleTriggerEmote = useCallback((emote: PlayerState['anim']) => {
    setActiveEmote(emote);
  }, []);

  const handleSelectTool = useCallback((tool: ActiveTool) => {
    setActiveTool((prev) => (prev === tool ? 'none' : tool));
  }, []);

  const handleToggleBuildMode = useCallback(() => {
    setActiveTool((prev) => (prev === 'build' ? 'none' : 'build'));
  }, []);

  const handleToggleAutoAnchor = useCallback(() => {
    setAutoAnchor((prev) => !prev);
  }, []);

  const handleSetBuildScale = useCallback((scale: number) => {
    setBuildScale(scale);
  }, []);

  const handleRotateBuild = useCallback(() => {
    setBuildRotationDeg((prev) => (prev + 90) % 360);
  }, []);

  const handlePlayerCoordsChange = useCallback((x: number, z: number) => {
    setPlayerCoords({ x, z });
  }, []);

  const handleSendChat = useCallback((text: string) => {
    setChatMessageToSend(text);
  }, []);

  const handleChatReceived = useCallback((sender: string, text: string) => {
    setChatMessages((prev) => [
      ...prev.slice(-30),
      {
        id: `chat_${Date.now()}_${Math.random()}`,
        sender,
        text,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  }, []);

  const isBuildMode = activeTool === 'build';

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-neutral-900 select-none">
      {!inGame ? (
        <TitleScreen
          initialName={playerName}
          initialColor={playerColor}
          deviceInfo={deviceInfo}
          onJoin={handleJoinGame}
        />
      ) : (
        <>
          {/* 3D Physics & Stickman Canvas */}
          <SandboxGame
            playerName={playerName}
            playerColor={playerColor}
            roomId={roomId}
            isPrivateRoom={isPrivateRoom}
            isMobileDevice={deviceInfo.effectiveDevice === 'mobile' || deviceInfo.isTouch}
            onRoomIdConfirmed={setRoomId}
            onPlayerCountChange={setPlayerCount}
            onPingChange={setPing}
            onPlayerCoordsChange={handlePlayerCoordsChange}
            activeEmote={activeEmote}
            onEmoteConsumed={() => setActiveEmote(null)}
            activeTool={activeTool}
            onSelectTool={handleSelectTool}
            isBuildMode={isBuildMode}
            selectedObjectType={selectedObjectType}
            buildRotationDeg={buildRotationDeg}
            onRotateBuild={handleRotateBuild}
            onToggleBuildMode={handleToggleBuildMode}
            autoAnchor={autoAnchor}
            buildScale={buildScale}
            chatMessageToSend={chatMessageToSend}
            onChatConsumed={() => setChatMessageToSend(null)}
            onChatReceived={handleChatReceived}
          />

          {/* Simple In-Game HUD */}
          <HUDOverlay
            roomId={roomId}
            playerCount={playerCount}
            ping={ping}
            playerCoords={playerCoords}
            deviceInfo={deviceInfo}
            onLeave={handleLeaveGame}
            activeTool={activeTool}
            onSelectTool={handleSelectTool}
            isBuildMode={isBuildMode}
            selectedObjectType={selectedObjectType}
            onSelectObjectType={setSelectedObjectType}
            onToggleBuildMode={handleToggleBuildMode}
            buildRotationDeg={buildRotationDeg}
            onRotateBuild={handleRotateBuild}
            autoAnchor={autoAnchor}
            onToggleAutoAnchor={handleToggleAutoAnchor}
            buildScale={buildScale}
            onSetBuildScale={handleSetBuildScale}
            onTriggerEmote={handleTriggerEmote}
            chatMessages={chatMessages}
            onSendChat={handleSendChat}
          />
        </>
      )}
    </main>
  );
}
