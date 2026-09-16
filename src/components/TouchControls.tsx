import React, { useRef, useState, useEffect } from 'react';
import { ArrowUp, Zap, RotateCw, PlusSquare } from 'lucide-react';

interface TouchControlsProps {
  visible: boolean;
  onMove: (dx: number, dy: number) => void;
  onJump: () => void;
  onKick: () => void;
  onSlip?: () => void;
  onSprintToggle: (sprinting: boolean) => void;
  isBuildMode?: boolean;
  buildRotationDeg?: number;
  onPlaceBlock?: () => void;
  onRotateBlock?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
}

export const TouchControls: React.FC<TouchControlsProps> = ({
  visible,
  onMove,
  onJump,
  onKick,
  onSlip,
  onSprintToggle,
  isBuildMode = false,
  buildRotationDeg = 0,
  onPlaceBlock,
  onRotateBlock,
  onZoomIn,
  onZoomOut,
}) => {
  const joystickBaseRef = useRef<HTMLDivElement>(null);
  const [stickPos, setStickPos] = useState({ x: 0, y: 0 });
  const [activeTouchId, setActiveTouchId] = useState<number | null>(null);
  const [isSprinting, setIsSprinting] = useState(false);

  

  if (!visible) return null;

  return (
    <div id="mobile-touch-controls" className="pointer-events-none fixed inset-0 z-30 flex select-none font-comic">
      {/* Virtual Joystick (Bottom Left) */}
      <div className="absolute bottom-5 left-5 pointer-events-auto">
        <div
          ref={joystickBaseRef}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            setActiveTouchId(e.pointerId);
            const rect = e.currentTarget.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const maxRadius = rect.width / 2;
            const dx = Math.max(-maxRadius, Math.min(maxRadius, e.clientX - centerX));
            const dy = Math.max(-maxRadius, Math.min(maxRadius, e.clientY - centerY));
            setStickPos({ x: dx, y: dy });
            onMove(dx / maxRadius, dy / maxRadius);
          }}
          onPointerMove={(e) => {
            if (activeTouchId !== e.pointerId) return;
            e.preventDefault();
            const rect = joystickBaseRef.current!.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const maxRadius = rect.width / 2;
            const dx = Math.max(-maxRadius, Math.min(maxRadius, e.clientX - centerX));
            const dy = Math.max(-maxRadius, Math.min(maxRadius, e.clientY - centerY));
            setStickPos({ x: dx, y: dy });
            onMove(dx / maxRadius, dy / maxRadius);
          }}
          onPointerUp={(e) => {
            if (activeTouchId === e.pointerId) {
              e.currentTarget.releasePointerCapture(e.pointerId);
              setActiveTouchId(null);
              setStickPos({ x: 0, y: 0 });
              onMove(0, 0);
            }
          }}
          onPointerCancel={(e) => {
            if (activeTouchId === e.pointerId) {
              e.currentTarget.releasePointerCapture(e.pointerId);
              setActiveTouchId(null);
              setStickPos({ x: 0, y: 0 });
              onMove(0, 0);
            }
          }}
          className="relative flex h-26 w-26 sm:h-28 sm:w-28 items-center justify-center rounded-full border-2 border-black bg-transparent touch-none"
        >
          {/* Inner thumb */}
          <div
            style={{
              transform: `translate(${stickPos.x}px, ${stickPos.y}px)`,
              transition: activeTouchId === null ? 'transform 0.12s ease-out' : 'none',
            }}
            className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full border-2 border-black bg-transparent"
          >
            <div className="h-3 w-3 rounded-full bg-black" />
          </div>
        </div>
      </div>

      
      {/* Zoom Controls (Top Right) */}
      <div className="absolute top-16 right-5 flex flex-col gap-2 pointer-events-auto">
        {onZoomIn && (
          <button
            type="button"
            onTouchStart={(e) => {
              e.preventDefault();
              onZoomIn();
            }}
            onClick={onZoomIn}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-black bg-transparent text-black font-comic font-bold text-lg leading-none"
            aria-label="Zoom In"
          >
            +
          </button>
        )}
        {onZoomOut && (
          <button
            type="button"
            onTouchStart={(e) => {
              e.preventDefault();
              onZoomOut();
            }}
            onClick={onZoomOut}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-black bg-transparent text-black font-comic font-bold text-lg leading-none"
            aria-label="Zoom Out"
          >
            -
          </button>
        )}
      </div>

      {/* Action Buttons Bottom Right */}
      <div className="absolute bottom-5 right-5 flex flex-col items-end gap-2.5 pointer-events-auto font-comic">
        {/* Build Mode Quick Touch Actions */}
        {isBuildMode && (
          <div className="flex items-center gap-2 mb-0.5">
            {onRotateBlock && (
              <button
                type="button"
                onTouchStart={(e) => {
                  e.preventDefault();
                  onRotateBlock();
                }}
                onClick={onRotateBlock}
                className="flex items-center gap-1 border border-black bg-transparent px-2.5 py-1.5 text-xs font-bold text-black font-comic"
              >
                <RotateCw className="h-3.5 w-3.5" />
                <span>ROT {buildRotationDeg}°</span>
              </button>
            )}

            {onPlaceBlock && (
              <button
                type="button"
                onTouchStart={(e) => {
                  e.preventDefault();
                  onPlaceBlock();
                }}
                onClick={onPlaceBlock}
                className="flex items-center gap-1 border border-black bg-transparent px-3 py-1.5 text-xs font-bold text-black font-comic"
              >
                <PlusSquare className="h-3.5 w-3.5" />
                <span>PLACE</span>
              </button>
            )}
          </div>
        )}

        {/* Button Row: Sprint, Slip Emote, Kick, Jump */}
        <div className="flex items-end gap-2">
          {/* Secondary Actions Column: Sprint & Slip */}
          <div className="flex flex-col gap-2">
            {/* Sprint Toggle */}
            <button
              type="button"
              id="btn-touch-sprint"
              onTouchStart={(e) => {
                e.preventDefault();
                const next = !isSprinting;
                setIsSprinting(next);
                onSprintToggle(next);
              }}
              onClick={() => {
                const next = !isSprinting;
                setIsSprinting(next);
                onSprintToggle(next);
              }}
              className={`flex h-11 w-11 items-center justify-center rounded-full border border-black bg-transparent font-comic font-bold text-black ${
                isSprinting ? 'ring-2 ring-black' : ''
              }`}
              aria-label="Sprint"
              title="Sprint"
            >
              <Zap className="h-5 w-5" />
            </button>
          </div>

          {/* Primary Kick Button */}
          <button
            type="button"
            id="btn-touch-kick"
            onTouchStart={(e) => {
              e.preventDefault();
              onKick();
            }}
            onClick={onKick}
            className="flex h-13 w-13 items-center justify-center rounded-full border border-black bg-transparent text-black font-comic font-bold text-xs uppercase"
            aria-label="Kick"
          >
            KICK
          </button>

          {/* Big Jump Button */}
          <button
            type="button"
            id="btn-touch-jump"
            onTouchStart={(e) => {
              e.preventDefault();
              onJump();
            }}
            onClick={onJump}
            className="flex h-15 w-15 items-center justify-center rounded-full border border-black bg-transparent text-black font-comic font-bold"
            aria-label="Jump"
          >
            <ArrowUp className="h-7 w-7 stroke-[3]" />
          </button>
        </div>
      </div>
    </div>
  );
};
