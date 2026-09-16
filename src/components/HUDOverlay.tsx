import React, { useState } from 'react';
import { ObjectType, PlayerState } from '../types.ts';
import { DeviceInfo } from '../hooks/useDeviceDetection.ts';
import { MessageSquare, X, Wrench } from 'lucide-react';

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
  deviceInfo: DeviceInfo;
  onLeave: () => void;
  isBuildMode: boolean;
  selectedObjectType: ObjectType;
  onSelectObjectType: (type: ObjectType) => void;
  onToggleBuildMode: () => void;
  buildRotationDeg: number;
  onRotateBuild: () => void;
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

export const HUDOverlay: React.FC<HUDOverlayProps> = ({
  roomId,
  playerCount,
  ping,
  deviceInfo,
  onLeave,
  isBuildMode,
  selectedObjectType,
  onSelectObjectType,
  onToggleBuildMode,
  buildRotationDeg,
  onRotateBuild,
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

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] font-comic text-xs select-none">
      {/* Top Header Bar */}
      <div className="pointer-events-auto flex items-center justify-between gap-1.5 sm:gap-2 border-2 border-black bg-white/90 px-2 sm:px-3 py-1 sm:py-1.5 text-black font-comic">
        <div className="flex items-center gap-1.5 sm:gap-3">
          <span className="font-bold text-xs sm:text-sm uppercase tracking-wide">
            {deviceInfo.width < 360 ? 'SG' : 'stickgrounds'}
          </span>
          <span className="border-l border-black pl-1.5 sm:pl-2 text-[10px] sm:text-[11px]">
            #{roomId.replace(/^ROOM-/, '')}
          </span>
          <span className="border-l border-black pl-1.5 sm:pl-2 text-[10px] sm:text-[11px]">
            👥 <strong>{playerCount}</strong>
          </span>
          {!isMobile && (
            <span className="border-l border-black pl-2 sm:pl-3 text-[11px]">
              Ping: <strong>{ping}ms</strong>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5">
          {/* On Touch/Mobile: Chat and Tools directly in header */}
          {isMobile && (
            <>
              {/* Chat Toggle Button: Comic Neue, no color, no effects */}
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

              {/* Build Drawer Toggle Button: Comic Neue, no color, no effects */}
              <button
                type="button"
                onClick={() => setShowMobileToolDrawer(!showMobileToolDrawer)}
                className={`flex items-center gap-1 border border-black px-2 py-0.5 sm:py-1 text-xs font-bold font-comic text-black ${
                  isBuildMode ? 'underline' : ''
                }`}
                style={{ background: 'transparent' }}
                title="Toggle build mode"
              >
                <Wrench className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span className="text-[9px] sm:text-[10px] uppercase font-bold">{isBuildMode ? 'BUILD' : 'TOOLS'}</span>
              </button>
            </>
          )}

          {/* Leave Button: Comic Neue, no color, no effects */}
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

      {/* Build Tool Floating Banner */}
      {isBuildMode && (
        isMobile ? (
          <div className="pointer-events-auto self-center mt-1.5 flex items-center gap-1.5 border border-black bg-white px-2.5 py-0.5 text-xs font-bold text-black font-comic">
            <Wrench className="h-3 w-3" />
            <span>BUILD: {selectedObjectType.toUpperCase()} ({buildRotationDeg}°)</span>
          </div>
        ) : (
          <div className="pointer-events-auto mx-auto mt-2 max-w-lg border border-black bg-white px-4 py-2 text-center text-black font-comic">
            <div className="font-bold uppercase tracking-wide text-xs sm:text-sm">
              [BUILD MODE ACTIVE]
            </div>
            <div className="text-[11px] mt-0.5 text-black">
              Hover mouse on ground or objects. Click to place. Press <strong>R</strong> to rotate ({buildRotationDeg}°). Press <strong>Q</strong> to stop.
            </div>
          </div>
        )
      )}

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

          {/* Action & Placement Controls Bar */}
          <div className="pointer-events-auto flex flex-wrap items-center gap-2 border border-black bg-white p-2 text-black font-comic">
            {/* Object Selector */}
            <div className="flex items-center gap-1.5 font-comic">
                  <button
                    type="button"
                    onClick={() => setShowMobileToolDrawer(false)}
                    className="border border-black px-2 py-0.5 text-[10px] font-bold uppercase font-comic text-black"
                    style={{ background: 'transparent' }}
                  >
                    CLOSE
                  </button>
                </div>

            
            {/* Build Tools Actions */}
            {isBuildMode && (
              <>
                <button
                  type="button"
                  onClick={onRotateBuild}
                  className="border border-black px-2.5 py-1 font-bold text-xs uppercase font-comic text-black hover:bg-black hover:text-white transition-colors"
                  style={{ background: 'transparent' }}
                  title="Rotate 90 degrees (R)"
                >
                  ROTATE (R) [{buildRotationDeg}°]
                </button>
                <button
                  type="button"
                  onClick={onToggleBuildMode}
                  className="border border-black px-2 py-1 text-xs uppercase font-bold font-comic text-black hover:bg-black hover:text-white transition-colors"
                  style={{ background: 'transparent' }}
                >
                  UNEQUIP
                </button>
              </>
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
              <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-black font-comic">
                <span className="font-bold text-[11px] uppercase">BUILD TOOLS</span>
                <div className="flex items-center gap-1.5 font-comic">
                  <button
                    type="button"
                    onClick={onToggleBuildMode}
                    className={`border border-black px-2 py-0.5 text-[10px] font-bold uppercase font-comic text-black ${
                      isBuildMode ? 'underline' : ''
                    }`}
                    style={{ background: 'transparent' }}
                  >
                    {isBuildMode ? 'ACTIVE' : 'EQUIP'}
                  </button>
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
              </div>

              {/* Compact Item Picker */}
              <div className="grid grid-cols-3 gap-1 mb-2 font-comic">
                
                {OBJECT_TYPES.map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => {
                      onSelectObjectType(item.type);
                      if (!isBuildMode) onToggleBuildMode();
                    }}
                    className={`border border-black px-1.5 py-1 text-[10px] font-bold truncate text-center font-comic text-black ${
                      selectedObjectType === item.type ? 'underline' : ''
                    }`}
                    style={{ background: 'transparent' }}
                  >
                    {item.label}
                  </button>
                ))}
              
                <button
                  type="button"
                  onClick={onToggleBuildMode}
                  className={`border border-black px-1.5 py-1 text-[10px] font-bold truncate text-center font-comic text-black ${
                    !isBuildMode ? 'bg-black text-white' : ''
                  }`}
                  style={!isBuildMode ? { background: 'black', color: 'white' } : { background: 'transparent' }}
                >
                  UNEQUIP
                </button>
              </div>

              {/* Quick Emotes */}
              <div className="flex gap-1 border-t border-black pt-1.5 font-comic">
                <button
                  type="button"
                  onClick={() => onTriggerEmote('wave')}
                  className="flex-1 border border-black py-0.5 text-center font-bold text-[9px] font-comic text-black"
                  style={{ background: 'transparent' }}
                >
                  👋 WAVE
                </button>
                <button
                  type="button"
                  onClick={() => onTriggerEmote('dance')}
                  className="flex-1 border border-black py-0.5 text-center font-bold text-[9px] font-comic text-black"
                  style={{ background: 'transparent' }}
                >
                  🕺 DANCE
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
