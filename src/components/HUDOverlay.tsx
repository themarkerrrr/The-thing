import React, { useState } from 'react';
import { ActiveTool, ObjectType, PlayerState } from '../types.ts';
import { DeviceInfo } from '../hooks/useDeviceDetection.ts';
import { MessageSquare, X, Wrench, Anchor, Unlock, Trash2, Maximize2, ShieldCheck, ShieldAlert } from 'lucide-react';

interface ChatMessageItem {
  id: string;
  sender: string;
  text: string;
  time: string;
}

interface HUDOverlayProps {
  roomId: string;
  playerCount: number;
  ping: number;
  playerCoords?: { x: number; z: number };
  deviceInfo: DeviceInfo;
  onLeave: () => void;
  activeTool?: ActiveTool;
  onSelectTool?: (tool: ActiveTool) => void;
  isBuildMode: boolean;
  selectedObjectType: ObjectType;
  onSelectObjectType: (type: ObjectType) => void;
  onToggleBuildMode: () => void;
  buildRotationDeg: number;
  onRotateBuild: () => void;
  autoAnchor?: boolean;
  onToggleAutoAnchor?: () => void;
  buildScale?: number;
  onSetBuildScale?: (scale: number) => void;
  onTriggerEmote: (anim: PlayerState['anim']) => void;
  chatMessages: ChatMessageItem[];
  onSendChat: (text: string) => void;
}

const OBJECT_TYPES: { type: ObjectType; label: string }[] = [
  { type: 'box', label: 'WOODEN BOX' },
  { type: 'sphere', label: 'BOUNCY BALL' },
  { type: 'barrel', label: 'BARREL' },
  { type: 'domino', label: 'DOMINO PLANK' },
  { type: 'ramp', label: 'SLOPE RAMP' },
  { type: 'trampoline', label: 'TRAMPOLINE' },
  { type: 'dice', label: 'BIG DICE' },
];

const SCALE_PRESETS = [0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0];

export const HUDOverlay: React.FC<HUDOverlayProps> = ({
  roomId,
  playerCount,
  ping,
  playerCoords,
  deviceInfo,
  onLeave,
  activeTool = 'none',
  onSelectTool,
  isBuildMode,
  selectedObjectType,
  onSelectObjectType,
  onToggleBuildMode,
  buildRotationDeg,
  onRotateBuild,
  autoAnchor = true,
  onToggleAutoAnchor,
  buildScale = 1,
  onSetBuildScale,
  onTriggerEmote,
  chatMessages,
  onSendChat,
}) => {
  const [chatInput, setChatInput] = useState('');
  const [showChat, setShowChat] = useState(!deviceInfo.isMobile);
  const [showMobileToolDrawer, setShowMobileToolDrawer] = useState(false);

  const isTouchDevice = deviceInfo.isTouch || deviceInfo.effectiveDevice === 'mobile' || deviceInfo.isTablet;
  const isMobile = isTouchDevice;

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatInput.trim()) {
      onSendChat(chatInput.trim());
      setChatInput('');
    }
  };

  const handleToolClick = (tool: ActiveTool) => {
    if (onSelectTool) {
      onSelectTool(tool);
    } else if (tool === 'build') {
      onToggleBuildMode();
    }
  };

  const handleStepScale = (delta: number) => {
    if (!onSetBuildScale) return;
    const currentIndex = SCALE_PRESETS.findIndex((s) => Math.abs(s - buildScale) < 0.05);
    if (currentIndex === -1) {
      onSetBuildScale(1);
    } else {
      const nextIndex = Math.max(0, Math.min(SCALE_PRESETS.length - 1, currentIndex + delta));
      onSetBuildScale(SCALE_PRESETS[nextIndex]);
    }
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] font-comic text-xs select-none">
      {/* Top Area */}
      <div className="flex flex-col items-center gap-1.5 w-full">
        {/* Top Header Bar */}
        <div className="pointer-events-auto w-full flex items-center justify-between gap-1.5 sm:gap-2 border-2 border-black bg-white/90 px-2 sm:px-3 py-1 sm:py-1.5 text-black font-comic">
          <div className="flex items-center gap-1.5 sm:gap-3">
            <span className="font-bold text-xs sm:text-sm uppercase tracking-wide">
              {deviceInfo.width < 360 ? 'SG' : 'stickgrounds'}
            </span>
            <span className="border-l border-black pl-1.5 sm:pl-2 text-[10px] sm:text-[11px]">
              #{roomId.replace(/^ROOM-/, '')}
            </span>
            <span className="border-l border-black pl-1.5 sm:pl-2 text-[10px] sm:text-[11px]">
              PLAYERS: <strong>{playerCount}</strong>
            </span>
            {!isMobile && (
              <span className="border-l border-black pl-2 sm:pl-3 text-[11px]">
                Ping: <strong>{ping}ms</strong>
              </span>
            )}

            {/* Auto-Anchor Status Pill in Header */}
            {onToggleAutoAnchor && (
              <button
                type="button"
                onClick={onToggleAutoAnchor}
                className={`flex items-center gap-1 border border-black px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-bold uppercase transition-colors ${
                  autoAnchor ? 'bg-amber-100 text-amber-950' : 'bg-neutral-100 text-neutral-700'
                }`}
                title="Toggle Auto-Anchor on block placement"
              >
                {autoAnchor ? <ShieldCheck className="h-3 w-3 text-amber-700" /> : <ShieldAlert className="h-3 w-3 text-neutral-500" />}
                <span className="hidden sm:inline">AUTO-ANCHOR:</span>
                <span className={autoAnchor ? 'font-black text-amber-900' : 'text-neutral-600'}>
                  {autoAnchor ? 'ON' : 'OFF'}
                </span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5">
            {/* On Touch/Mobile: Chat and Tools directly in header */}
            {isMobile && (
              <>
                {/* Chat Toggle Button */}
                <button
                  type="button"
                  onClick={() => setShowChat(!showChat)}
                  className={`relative flex items-center gap-1 border border-black px-2 py-0.5 sm:py-1 text-xs font-bold font-comic text-black ${
                    showChat ? 'underline' : ''
                  }`}
                  style={{ background: 'transparent' }}
                  title="Toggle chat"
                >
                  <MessageSquare className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  {chatMessages.length > 0 && !showChat && (
                    <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-black bg-white text-[8px] font-bold text-black font-comic">
                      {chatMessages.length}
                    </span>
                  )}
                </button>

                {/* Build & Anchor & Scale & Delete Tools Drawer Toggle Button */}
                <button
                  type="button"
                  onClick={() => setShowMobileToolDrawer(!showMobileToolDrawer)}
                  className={`flex items-center gap-1 border border-black px-2 py-0.5 sm:py-1 text-xs font-bold font-comic text-black ${
                    activeTool !== 'none' ? 'bg-black text-white' : ''
                  }`}
                  style={
                    activeTool === 'anchor'
                      ? { background: '#d97706', color: 'white' }
                      : activeTool === 'unanchor'
                      ? { background: '#0284c7', color: 'white' }
                      : activeTool === 'scale'
                      ? { background: '#9333ea', color: 'white' }
                      : activeTool === 'delete'
                      ? { background: '#dc2626', color: 'white' }
                      : activeTool === 'build'
                      ? { background: 'black', color: 'white' }
                      : { background: 'transparent' }
                  }
                  title="Toggle tools & building"
                >
                  {activeTool === 'anchor' ? (
                    <Anchor className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  ) : activeTool === 'unanchor' ? (
                    <Unlock className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  ) : activeTool === 'scale' ? (
                    <Maximize2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  ) : activeTool === 'delete' ? (
                    <Trash2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  ) : (
                    <Wrench className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  )}
                  <span className="text-[9px] sm:text-[10px] uppercase font-bold">
                    {activeTool === 'anchor'
                      ? 'ANCHOR'
                      : activeTool === 'unanchor'
                      ? 'UNANCHOR'
                      : activeTool === 'scale'
                      ? 'SCALE'
                      : activeTool === 'delete'
                      ? 'DELETE'
                      : activeTool === 'build'
                      ? 'BUILD'
                      : 'TOOLS'}
                  </span>
                </button>
              </>
            )}

            {/* Leave Button */}
            <button
              type="button"
              onClick={onLeave}
              className="border border-black px-2 sm:px-2.5 py-0.5 sm:py-1 font-bold font-comic text-[11px] sm:text-xs uppercase text-black"
              style={{ background: 'transparent' }}
            >
              LEAVE
            </button>
          </div>
        </div>

        {/* Floating Tool Status Banners */}
        {activeTool === 'build' && (
          isMobile ? (
            <div className="pointer-events-auto self-center flex items-center gap-1.5 border border-black bg-white/95 px-3 py-0.5 text-xs font-bold text-black font-comic shadow-sm">
              <Wrench className="h-3.5 w-3.5" />
              <span>BUILD: {selectedObjectType.toUpperCase()} ({buildRotationDeg}° • {buildScale}x • {autoAnchor ? 'ANCHORED' : 'PHYSICS'})</span>
            </div>
          ) : (
            <div className="pointer-events-auto self-center flex items-center gap-3 border border-black bg-white/95 px-4 py-1.5 text-xs text-black font-comic shadow-sm">
              <span className="font-bold uppercase bg-black text-white px-1.5 py-0.5 text-[10px] tracking-wider">[BUILD MODE ACTIVE]</span>
              <span className="text-[11px]">Placing: <strong>{selectedObjectType.toUpperCase()}</strong> ({buildRotationDeg}° • {buildScale}x • {autoAnchor ? 'Anchored' : 'Dynamic'})</span>
              <span className="text-[11px] border-l border-black pl-2 text-slate-700">Click to place • <strong>R</strong> Rotate • <strong>B / Q</strong> Exit</span>
            </div>
          )
        )}

        {activeTool === 'anchor' && (
          <div className="pointer-events-auto self-center flex items-center gap-2 border-2 border-amber-600 bg-amber-50 px-3.5 py-1 text-xs text-black font-comic shadow-sm">
            <Anchor className="h-4 w-4 text-amber-700" />
            <span className="font-bold uppercase bg-amber-600 text-white px-1.5 py-0.5 text-[10px] tracking-wider">[ANCHOR TOOL]</span>
            <span className="text-[11px]">
              {isMobile ? 'Tap any block to lock it permanently in place' : 'Click any block to LOCK it in place (cannot be pushed or moved) • Press 1 / L or ESC to exit'}
            </span>
          </div>
        )}

        {activeTool === 'unanchor' && (
          <div className="pointer-events-auto self-center flex items-center gap-2 border-2 border-sky-600 bg-sky-50 px-3.5 py-1 text-xs text-black font-comic shadow-sm">
            <Unlock className="h-4 w-4 text-sky-700" />
            <span className="font-bold uppercase bg-sky-600 text-white px-1.5 py-0.5 text-[10px] tracking-wider">[UNANCHOR TOOL]</span>
            <span className="text-[11px]">
              {isMobile ? 'Tap any locked block to restore physics movement' : 'Click any block to UNLOCK physics movement • Press 2 / U or ESC to exit'}
            </span>
          </div>
        )}

        {activeTool === 'scale' && (
          <div className="pointer-events-auto self-center flex items-center gap-2 border-2 border-purple-600 bg-purple-50 px-3.5 py-1 text-xs text-black font-comic shadow-sm">
            <Maximize2 className="h-4 w-4 text-purple-700" />
            <span className="font-bold uppercase bg-purple-600 text-white px-1.5 py-0.5 text-[10px] tracking-wider">[SCALE TOOL - {buildScale}x]</span>
            <span className="text-[11px]">
              {isMobile ? `Tap any block to resize it to ${buildScale}x` : `Click any block to scale it to ${buildScale}x • Press 4 / Z or ESC to exit`}
            </span>
          </div>
        )}

        {activeTool === 'delete' && (
          <div className="pointer-events-auto self-center flex items-center gap-2 border-2 border-red-600 bg-red-50 px-3.5 py-1 text-xs text-black font-comic shadow-sm">
            <Trash2 className="h-4 w-4 text-red-700" />
            <span className="font-bold uppercase bg-red-600 text-white px-1.5 py-0.5 text-[10px] tracking-wider">[DELETE TOOL]</span>
            <span className="text-[11px]">
              {isMobile ? 'Tap any block to delete and remove it from the world' : 'Click any block to DELETE it • Press 3 / X / Delete or ESC to exit'}
            </span>
          </div>
        )}
      </div>

      {/* DESKTOP BOTTOM AREA (PC MODE) */}
      {!isMobile && (
        <div className="flex items-end justify-between gap-3 font-comic">
          {/* Chat Box */}
          <div className="pointer-events-auto flex w-72 flex-col border border-black bg-white p-2 text-black font-comic">
            <div className="flex items-center justify-between border-b border-black pb-1 mb-1 font-bold">
              <span>CHAT</span>
              <button
                type="button"
                onClick={() => setShowChat(!showChat)}
                className="text-[10px] underline font-comic text-black"
                style={{ background: 'transparent' }}
              >
                {showChat ? 'MINIMIZE' : 'EXPAND'}
              </button>
            </div>

            {showChat && (
              <>
                <div className="h-28 overflow-y-auto border border-black bg-white p-1 text-[11px] space-y-1 mb-1.5 flex flex-col-reverse font-comic">
                  {[...chatMessages].reverse().map((msg) => (
                    <div key={msg.id} className="leading-tight break-words">
                      <span className="font-bold text-black">[{msg.sender}]: </span>
                      <span>{msg.text}</span>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleChatSubmit} className="flex gap-1">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Press Enter to send..."
                    maxLength={100}
                    className="flex-1 border border-black bg-white px-1.5 py-0.5 text-xs outline-none font-comic text-black"
                  />
                  <button
                    type="submit"
                    className="border border-black px-2 font-bold font-comic text-black"
                    style={{ background: 'transparent' }}
                  >
                    SEND
                  </button>
                </form>
              </>
            )}
          </div>

          {/* Action & Tools Bar */}
          <div className="pointer-events-auto flex flex-wrap items-center gap-2 border border-black bg-white p-2 text-black font-comic">
            {/* Tool Selection Buttons */}
            <div className="flex items-center gap-1 border-r border-black pr-2">
              <button
                type="button"
                onClick={() => handleToolClick('build')}
                className={`flex items-center gap-1 border border-black px-2.5 py-1 font-bold text-xs uppercase font-comic transition-colors ${
                  activeTool === 'build' ? 'bg-black text-white' : 'text-black hover:bg-neutral-100'
                }`}
                style={activeTool === 'build' ? { background: 'black', color: 'white' } : { background: 'transparent' }}
                title="Toggle Build Mode (B)"
              >
                <Wrench className="h-3.5 w-3.5" />
                BUILD (B)
              </button>

              <button
                type="button"
                onClick={() => handleToolClick('anchor')}
                className={`flex items-center gap-1 border border-black px-2.5 py-1 font-bold text-xs uppercase font-comic transition-colors ${
                  activeTool === 'anchor' ? 'bg-amber-600 text-white' : 'text-black hover:bg-amber-50'
                }`}
                style={activeTool === 'anchor' ? { background: '#d97706', color: 'white' } : { background: 'transparent' }}
                title="Anchor Tool: Lock block in place so it cannot be pushed (1 / L)"
              >
                <Anchor className="h-3.5 w-3.5" />
                ANCHOR (1)
              </button>

              <button
                type="button"
                onClick={() => handleToolClick('unanchor')}
                className={`flex items-center gap-1 border border-black px-2.5 py-1 font-bold text-xs uppercase font-comic transition-colors ${
                  activeTool === 'unanchor' ? 'bg-sky-600 text-white' : 'text-black hover:bg-sky-50'
                }`}
                style={activeTool === 'unanchor' ? { background: '#0284c7', color: 'white' } : { background: 'transparent' }}
                title="Unanchor Tool: Unlock block physics (2 / U)"
              >
                <Unlock className="h-3.5 w-3.5" />
                UNANCHOR (2)
              </button>

              <button
                type="button"
                onClick={() => handleToolClick('scale')}
                className={`flex items-center gap-1 border border-black px-2.5 py-1 font-bold text-xs uppercase font-comic transition-colors ${
                  activeTool === 'scale' ? 'bg-purple-600 text-white' : 'text-black hover:bg-purple-50'
                }`}
                style={activeTool === 'scale' ? { background: '#9333ea', color: 'white' } : { background: 'transparent' }}
                title="Scale Tool: Resize blocks to different sizes (4 / Z)"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                SCALE (4)
              </button>

              <button
                type="button"
                onClick={() => handleToolClick('delete')}
                className={`flex items-center gap-1 border border-black px-2.5 py-1 font-bold text-xs uppercase font-comic transition-colors ${
                  activeTool === 'delete' ? 'bg-red-600 text-white' : 'text-black hover:bg-red-50'
                }`}
                style={activeTool === 'delete' ? { background: '#dc2626', color: 'white' } : { background: 'transparent' }}
                title="Delete Tool: Click block to remove it (3 / X / Delete)"
              >
                <Trash2 className="h-3.5 w-3.5" />
                DELETE (3)
              </button>
            </div>

            {/* Scale Selector Presets (Always accessible or active during build/scale) */}
            <div className="flex items-center gap-1 border-r border-black pr-2 font-comic">
              <span className="text-[10px] font-bold text-neutral-600">SIZE:</span>
              <button
                type="button"
                onClick={() => handleStepScale(-1)}
                className="border border-black px-1.5 py-0.5 text-[10px] font-black hover:bg-neutral-100"
                style={{ background: 'transparent' }}
                title="Decrease size"
              >
                -
              </button>
              <div className="flex gap-0.5">
                {SCALE_PRESETS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onSetBuildScale?.(s)}
                    className={`border border-black px-1.5 py-0.5 text-[9px] font-bold font-comic ${
                      Math.abs(buildScale - s) < 0.05 ? 'bg-purple-600 text-white font-black' : 'text-black hover:bg-neutral-100'
                    }`}
                    style={Math.abs(buildScale - s) < 0.05 ? { background: '#9333ea', color: 'white' } : { background: 'transparent' }}
                  >
                    {s}x
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => handleStepScale(1)}
                className="border border-black px-1.5 py-0.5 text-[10px] font-black hover:bg-neutral-100"
                style={{ background: 'transparent' }}
                title="Increase size"
              >
                +
              </button>
            </div>

            {/* Object Selector (Active when Build mode is on) */}
            {activeTool === 'build' && (
              <div className="flex items-center gap-1 font-comic">
                <select
                  value={selectedObjectType}
                  onChange={(e) => onSelectObjectType(e.target.value as ObjectType)}
                  className="border border-black bg-white px-2 py-1 text-xs font-bold font-comic text-black outline-none"
                >
                  {OBJECT_TYPES.map((item) => (
                    <option key={item.type} value={item.type}>
                      {item.label}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={onRotateBuild}
                  className="border border-black px-2.5 py-1 font-bold text-xs uppercase font-comic text-black hover:bg-black hover:text-white transition-colors"
                  style={{ background: 'transparent' }}
                  title="Rotate 90 degrees (R)"
                >
                  ROTATE (R) [{buildRotationDeg}°]
                </button>
              </div>
            )}

            {/* Emotes */}
            <div className="border-l border-black pl-2 flex items-center gap-1 font-comic">
              <button
                type="button"
                onClick={() => onTriggerEmote('kick')}
                className="border border-black px-2 py-1 font-bold font-comic text-black"
                style={{ background: 'transparent' }}
              >
                KICK (E)
              </button>
              <button
                type="button"
                onClick={() => onTriggerEmote('wave')}
                className="border border-black px-2 py-1 font-bold font-comic text-black"
                style={{ background: 'transparent' }}
              >
                WAVE
              </button>
              <button
                type="button"
                onClick={() => onTriggerEmote('dance')}
                className="border border-black px-2 py-1 font-bold font-comic text-black"
                style={{ background: 'transparent' }}
              >
                DANCE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MOBILE ADAPTIVE CONTROLS & HUD (MOBILE MODE) */}
      {isMobile && (
        <div className="pointer-events-none flex flex-col items-center justify-end w-full font-comic">
          {/* Mobile Tool Drawer */}
          {showMobileToolDrawer && (
            <div className="pointer-events-auto max-w-xs w-[92%] max-h-[60vh] overflow-y-auto border border-black bg-white p-2.5 text-black mb-16 sm:mb-24 font-comic">
              <div className="flex items-center justify-between mb-2 pb-1 border-b border-black font-comic">
                <span className="font-bold text-[11px] uppercase">TOOLS & BUILDING</span>
                <button
                  type="button"
                  onClick={() => setShowMobileToolDrawer(false)}
                  className="border border-black p-0.5 text-black font-comic"
                  style={{ background: 'transparent' }}
                  aria-label="Close tools"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Tool Mode Tabs */}
              <div className="grid grid-cols-5 gap-1 mb-2 font-comic">
                <button
                  type="button"
                  onClick={() => handleToolClick('build')}
                  className={`border border-black px-0.5 py-1 text-[8px] sm:text-[9px] font-bold uppercase text-center font-comic ${
                    activeTool === 'build' ? 'bg-black text-white' : 'text-black'
                  }`}
                  style={activeTool === 'build' ? { background: 'black', color: 'white' } : { background: 'transparent' }}
                >
                  BUILD
                </button>
                <button
                  type="button"
                  onClick={() => handleToolClick('anchor')}
                  className={`border border-black px-0.5 py-1 text-[8px] sm:text-[9px] font-bold uppercase text-center font-comic ${
                    activeTool === 'anchor' ? 'bg-amber-600 text-white' : 'text-black'
                  }`}
                  style={activeTool === 'anchor' ? { background: '#d97706', color: 'white' } : { background: 'transparent' }}
                >
                  ANCHOR
                </button>
                <button
                  type="button"
                  onClick={() => handleToolClick('unanchor')}
                  className={`border border-black px-0.5 py-1 text-[8px] sm:text-[9px] font-bold uppercase text-center font-comic ${
                    activeTool === 'unanchor' ? 'bg-sky-600 text-white' : 'text-black'
                  }`}
                  style={activeTool === 'unanchor' ? { background: '#0284c7', color: 'white' } : { background: 'transparent' }}
                >
                  UNLOCK
                </button>
                <button
                  type="button"
                  onClick={() => handleToolClick('scale')}
                  className={`border border-black px-0.5 py-1 text-[8px] sm:text-[9px] font-bold uppercase text-center font-comic ${
                    activeTool === 'scale' ? 'bg-purple-600 text-white' : 'text-black'
                  }`}
                  style={activeTool === 'scale' ? { background: '#9333ea', color: 'white' } : { background: 'transparent' }}
                >
                  SCALE
                </button>
                <button
                  type="button"
                  onClick={() => handleToolClick('delete')}
                  className={`border border-black px-0.5 py-1 text-[8px] sm:text-[9px] font-bold uppercase text-center font-comic ${
                    activeTool === 'delete' ? 'bg-red-600 text-white' : 'text-black'
                  }`}
                  style={activeTool === 'delete' ? { background: '#dc2626', color: 'white' } : { background: 'transparent' }}
                >
                  DELETE
                </button>
              </div>

              {/* Auto Anchor & Scale Selectors in Mobile Drawer */}
              <div className="border border-black bg-neutral-50 p-1.5 mb-2 font-comic space-y-1.5">
                {onToggleAutoAnchor && (
                  <div className="flex items-center justify-between text-[9px] font-bold">
                    <span>AUTO-ANCHOR PLACED BLOCKS:</span>
                    <button
                      type="button"
                      onClick={onToggleAutoAnchor}
                      className={`border border-black px-2 py-0.5 text-[9px] font-bold uppercase ${
                        autoAnchor ? 'bg-amber-600 text-white' : 'bg-neutral-200 text-neutral-800'
                      }`}
                      style={autoAnchor ? { background: '#d97706', color: 'white' } : { background: '#e5e5e5', color: '#171717' }}
                    >
                      {autoAnchor ? 'ON (LOCKED)' : 'OFF (PHYSICS)'}
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-between text-[9px] font-bold">
                  <span>SCALE SIZE:</span>
                  <div className="flex gap-1">
                    {SCALE_PRESETS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => onSetBuildScale?.(s)}
                        className={`border border-black px-1.5 py-0.5 text-[8px] font-bold ${
                          Math.abs(buildScale - s) < 0.05 ? 'bg-purple-600 text-white font-black' : 'text-black'
                        }`}
                        style={Math.abs(buildScale - s) < 0.05 ? { background: '#9333ea', color: 'white' } : { background: 'transparent' }}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Contextual Drawer Content */}
              {activeTool === 'build' && (
                <>
                  <div className="flex items-center justify-between mb-1 text-[10px] font-bold">
                    <span>SELECT BLOCK:</span>
                    <button
                      type="button"
                      onClick={onRotateBuild}
                      className="border border-black px-1.5 py-0.5 text-[9px] uppercase font-comic text-black"
                      style={{ background: 'transparent' }}
                    >
                      ROT [{buildRotationDeg}°]
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1 mb-2 font-comic">
                    {OBJECT_TYPES.map((item) => (
                      <button
                        key={item.type}
                        type="button"
                        onClick={() => onSelectObjectType(item.type)}
                        className={`border border-black px-1 py-1 text-[9px] font-bold truncate text-center font-comic text-black ${
                          selectedObjectType === item.type ? 'underline bg-neutral-100 font-black' : ''
                        }`}
                        style={{ background: 'transparent' }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {activeTool === 'anchor' && (
                <div className="border border-amber-400 bg-amber-50 p-2 mb-2 text-[10px] text-amber-950 font-comic">
                  <strong>Anchor Mode Active:</strong> Tap any block in the 3D world to lock it in place. Anchored blocks stay firmly in position and cannot be pushed off or moved by anything.
                </div>
              )}

              {activeTool === 'unanchor' && (
                <div className="border border-sky-400 bg-sky-50 p-2 mb-2 text-[10px] text-sky-950 font-comic">
                  <strong>Unanchor Mode Active:</strong> Tap any anchored block in the 3D world to unlock its physics so it can move and react dynamically again.
                </div>
              )}

              {activeTool === 'scale' && (
                <div className="border border-purple-400 bg-purple-50 p-2 mb-2 text-[10px] text-purple-950 font-comic">
                  <strong>Scale Mode Active:</strong> Tap any block in the 3D world to resize it to <strong>{buildScale}x</strong>.
                </div>
              )}

              {activeTool === 'delete' && (
                <div className="border border-red-400 bg-red-50 p-2 mb-2 text-[10px] text-red-950 font-comic">
                  <strong>Delete Mode Active:</strong> Tap any block in the 3D world to permanently remove and delete it from the room.
                </div>
              )}

              {/* Quick Emotes */}
              <div className="flex gap-1 border-t border-black pt-1.5 font-comic">
                <button
                  type="button"
                  onClick={() => onTriggerEmote('wave')}
                  className="flex-1 border border-black py-0.5 text-center font-bold text-[9px] font-comic text-black"
                  style={{ background: 'transparent' }}
                >
                  WAVE
                </button>
                <button
                  type="button"
                  onClick={() => onTriggerEmote('dance')}
                  className="flex-1 border border-black py-0.5 text-center font-bold text-[9px] font-comic text-black"
                  style={{ background: 'transparent' }}
                >
                  DANCE
                </button>
                <button
                  type="button"
                  onClick={() => handleToolClick('none')}
                  className="flex-1 border border-black py-0.5 text-center font-bold text-[9px] font-comic text-black"
                  style={{ background: 'transparent' }}
                >
                  UNEQUIP
                </button>
              </div>
            </div>
          )}

          {/* Mobile Chat Window */}
          {showChat && (
            <div className="pointer-events-auto max-w-xs w-[92%] max-h-[60vh] overflow-y-auto border border-black bg-white p-2 text-black mb-16 sm:mb-24 font-comic">
              <div className="flex items-center justify-between border-b border-black pb-1 mb-1 font-bold font-comic">
                <span className="font-bold text-[11px] uppercase">CHAT</span>
                <button
                  type="button"
                  onClick={() => setShowChat(false)}
                  className="border border-black px-1.5 py-0.5 text-[9px] font-bold font-comic text-black"
                  style={{ background: 'transparent' }}
                >
                  CLOSE
                </button>
              </div>

              <div className="h-24 overflow-y-auto border border-black bg-white p-1 text-[10px] space-y-1 mb-1.5 flex flex-col-reverse font-comic">
                {[...chatMessages].reverse().map((msg) => (
                  <div key={msg.id} className="leading-tight break-words">
                    <span className="font-bold text-black">[{msg.sender}]: </span>
                    <span>{msg.text}</span>
                  </div>
                ))}
              </div>

              <form onSubmit={handleChatSubmit} className="flex gap-1 font-comic">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Message..."
                  maxLength={100}
                  className="flex-1 border border-black bg-white px-1.5 py-0.5 text-[11px] outline-none font-comic text-black"
                />
                <button
                  type="submit"
                  className="border border-black px-2.5 font-bold text-[11px] font-comic text-black"
                  style={{ background: 'transparent' }}
                >
                  SEND
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
