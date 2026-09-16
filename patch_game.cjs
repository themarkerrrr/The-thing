const fs = require('fs');
let code = fs.readFileSync('src/components/SandboxGame.tsx', 'utf8');

// 1. Player jump height adjustments (due to realistic gravity)
// triggerJump: p.vy = 12.5 -> p.vy = 5;
code = code.replace(/p\.vy = 12\.5;/, 'p.vy = 5.0;');

// trampoline: p.vy = 18 -> p.vy = 10;
code = code.replace(/p\.vy = 18;/, 'p.vy = 10.0;');

// player gravity: p.vy -= 25 * dt -> p.vy -= 9.81 * dt;
code = code.replace(/p\.vy -= 25 \* dt;/, 'p.vy -= 9.81 * dt;');

// 2. Add zoom handlers
const zoomHandlers = `
  const handleZoomIn = useCallback(() => {
    cameraAngleRef.current.distance = Math.max(5, cameraAngleRef.current.distance - 2);
  }, []);

  const handleZoomOut = useCallback(() => {
    cameraAngleRef.current.distance = Math.min(32, cameraAngleRef.current.distance + 2);
  }, []);
`;
code = code.replace(
  /const handlePlaceBlock = useCallback/,
  zoomHandlers + '\n  const handlePlaceBlock = useCallback'
);

// 3. Pass props to TouchControls
code = code.replace(
  /onRotateBlock=\{onRotateBuild\}/,
  'onRotateBlock={onRotateBuild}\n        onZoomIn={handleZoomIn}\n        onZoomOut={handleZoomOut}'
);

fs.writeFileSync('src/components/SandboxGame.tsx', code);
