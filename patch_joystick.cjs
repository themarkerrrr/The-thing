const fs = require('fs');
let code = fs.readFileSync('src/components/TouchControls.tsx', 'utf8');

const regex = /<div\s+ref=\{joystickBaseRef\}[\s\S]*?className="relative flex h-26 w-26 sm:h-28 sm:w-28 items-center justify-center rounded-full border-2 border-black bg-transparent"\s*>/m;

const newJoystick = `<div
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
        >`;

code = code.replace(regex, newJoystick);

// We can also completely remove the window global touchmove/touchend since pointer capture handles it cleanly!
const useEffectRegex = /useEffect\(\(\) => \{[\s\S]*?window\.removeEventListener\('touchcancel', handleTouchEnd\);\n\s*\};\n\s*\}, \[activeTouchId, onMove\]\);/m;
code = code.replace(useEffectRegex, '');

fs.writeFileSync('src/components/TouchControls.tsx', code);
