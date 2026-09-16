import React, { useState, useEffect, useRef } from 'react';
import { sound } from '../game/SoundEffects.ts';
import { DeviceInfo } from '../hooks/useDeviceDetection.ts';
import { AvatarPreview3D } from './AvatarPreview3D.tsx';

interface TitleScreenProps {
  onJoin: (name: string, color: string, roomCode?: string, isCreate?: boolean) => void;
  deviceInfo: DeviceInfo;
  initialName?: string;
  initialColor?: string;
}

const COLORS = [
  '#ff0000', '#00ff00', '#0000ff', '#ffff00',
  '#ff00ff', '#00ffff', '#ffa500', '#800080',
  '#ffffff', '#000000', '#808080', '#a52a2a',
  '#ffc0cb', '#ffd700', '#4b0082', '#008080'
];

const TitleCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const render = () => {
      try {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        const text = "stickgrounds !";
        const fontSize = 32;
        ctx.font = `900 ${fontSize}px "Comic Neue", cursive`;
        const metrics = ctx.measureText(text);
        const w = Math.max(16, Math.ceil(metrics.width) + 16);
        const h = Math.max(16, fontSize + 20);
        
        canvas.width = w;
        canvas.height = h;

        ctx.font = `900 ${fontSize}px "Comic Neue", cursive`;
        ctx.textBaseline = 'top';
        ctx.fillStyle = 'black';
        ctx.fillText(text, 8, 10);

        // Hard thresholding alpha to create a pure 1-bit aliased (pixelated) edge
        if (w > 0 && h > 0) {
          const imgData = ctx.getImageData(0, 0, w, h);
          const data = imgData.data;
          for (let i = 3; i < data.length; i += 4) {
            data[i] = data[i] > 128 ? 255 : 0;
          }
          ctx.putImageData(imgData, 0, 0);
        }
      } catch (err) {
        console.warn('TitleCanvas render safe fallback:', err);
      }
    };

    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(render).catch(() => {});
    }
    render();
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full max-w-[320px] sm:max-w-[450px] object-contain mb-8 sm:mb-12"
      style={{ imageRendering: 'pixelated' }}
    />
  );
};

export const TitleScreen: React.FC<TitleScreenProps> = ({ onJoin, deviceInfo, initialName = '', initialColor = '#808080' }) => {
  const [name, setName] = useState(initialName);
  const [roomCode, setRoomCode] = useState('');
  const [color, setColor] = useState(initialColor);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);

  useEffect(() => {
    const storedName = localStorage.getItem('stickgrounds_name');
    const storedColor = localStorage.getItem('stickgrounds_color');
    if (storedName) setName(storedName);
    if (storedColor) setColor(storedColor);
  }, []);

  const handleJoin = () => {
    sound.playPop();
    const trimmedName = name.trim() || 'guest';
    localStorage.setItem('stickgrounds_name', trimmedName);
    localStorage.setItem('stickgrounds_color', color);
    onJoin(trimmedName, color, roomCode.trim().toUpperCase());
  };

  const handleCreateRoom = () => {
    sound.playPop();
    const trimmedName = name.trim() || 'host';
    localStorage.setItem('stickgrounds_name', trimmedName);
    localStorage.setItem('stickgrounds_color', color);
    const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    onJoin(trimmedName, color, newCode, true);
  };

  return (
    <div className="min-h-screen w-screen bg-white select-none flex flex-col items-center justify-center p-6 font-comic text-black overflow-y-auto">
      <TitleCanvas />

      <div className="w-full max-w-sm flex flex-col gap-5 sm:gap-6">
        {/* Nametag Group */}
        <div className="flex flex-col gap-2">
          <label className="font-bold text-xs sm:text-sm uppercase tracking-wider text-neutral-600">Nametag</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={18}
              placeholder="enter name..."
              className="flex-1 border-2 border-black bg-white px-3 py-2 sm:py-3 font-bold outline-none placeholder-neutral-400"
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            />
            <button
              type="button"
              onClick={() => { sound.playPop(); setIsCustomizeOpen(true); }}
              className="border-2 border-black bg-white px-4 py-2 sm:py-3 font-bold hover:bg-neutral-100 active:bg-neutral-200 transition-colors"
            >
              CUSTOMIZE
            </button>
          </div>
        </div>

        {/* Room Code Group */}
        <div className="flex flex-col gap-2">
          <label className="font-bold text-xs sm:text-sm uppercase tracking-wider text-neutral-600">Room Code</label>
          <input
            type="text"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            maxLength={14}
            placeholder="leave empty for public..."
            className="w-full border-2 border-black bg-white px-3 py-2 sm:py-3 font-bold outline-none placeholder-neutral-400 uppercase tracking-widest"
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          />
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 mt-2 sm:mt-4">
          <button
            type="button"
            onClick={handleJoin}
            className="w-full border-2 border-black bg-white py-3 sm:py-4 text-xl sm:text-2xl font-bold uppercase hover:bg-neutral-100 active:bg-neutral-200 transition-colors"
          >
            JOIN!
          </button>
          <div className="flex items-center gap-4 py-1">
            <div className="h-[2px] flex-1 bg-black"></div>
            <span className="font-bold uppercase text-xs sm:text-sm text-neutral-500 tracking-widest">or</span>
            <div className="h-[2px] flex-1 bg-black"></div>
          </div>
          <button
            type="button"
            onClick={handleCreateRoom}
            className="w-full border-2 border-black bg-white py-2 sm:py-3 text-base sm:text-lg font-bold uppercase hover:bg-neutral-100 active:bg-neutral-200 transition-colors text-neutral-800"
          >
            CREATE ROOM
          </button>
        </div>
      </div>

      {/* Customize Modal */}
      {isCustomizeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative w-full max-w-sm bg-white border-2 border-black p-5 sm:p-6 shadow-xl flex flex-col">
            <div className="flex items-center justify-between border-b border-black pb-3 mb-4">
              <h2 className="text-xl font-bold tracking-wide uppercase">Customize</h2>
              <button
                type="button"
                onClick={() => { sound.playPop(); setIsCustomizeOpen(false); }}
                className="text-2xl font-bold leading-none hover:text-neutral-500"
              >
                ✕
              </button>
            </div>

            {/* Avatar Preview */}
            <div className="flex flex-col items-center justify-center mb-5">
              <div className="h-44 w-full border-2 border-black bg-neutral-100 relative overflow-hidden shadow-inner">
                <AvatarPreview3D
                  color={color}
                  name={name.trim() || 'YOU'}
                  className="w-full h-full"
                />
              </div>
            </div>

            {/* Color Palette */}
            <div className="mb-6">
              <label className="block text-sm font-bold uppercase mb-2 text-neutral-600 tracking-wider">
                Color
              </label>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {COLORS.map((hex) => {
                  const isSelected = color === hex;
                  return (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => { sound.playPop(); setColor(hex); }}
                      className={`h-8 sm:h-10 w-full border-2 flex items-center justify-center transition-transform hover:scale-110 active:scale-95 ${
                        isSelected ? 'border-black scale-110 ring-2 ring-black ring-offset-1' : 'border-neutral-300'
                      }`}
                      style={{ backgroundColor: hex }}
                      aria-label={`Color ${hex}`}
                    />
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={() => { sound.playPop(); setIsCustomizeOpen(false); }}
              className="w-full py-3 text-lg font-bold uppercase border-2 border-black bg-white hover:bg-neutral-100 active:bg-neutral-200 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
