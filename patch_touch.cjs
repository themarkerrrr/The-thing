const fs = require('fs');

let code = fs.readFileSync('src/components/TouchControls.tsx', 'utf8');

// Add props
code = code.replace(
  /onRotateBlock\?: \(\) => void;/,
  'onRotateBlock?: () => void;\n  onZoomIn?: () => void;\n  onZoomOut?: () => void;'
);

code = code.replace(
  /onRotateBlock,/,
  'onRotateBlock,\n  onZoomIn,\n  onZoomOut,'
);

const zoomButtons = `
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
`;

code = code.replace(
  /\{\/\* Action Buttons Bottom Right \*\/\}/,
  zoomButtons + '\n      {/* Action Buttons Bottom Right */}'
);

fs.writeFileSync('src/components/TouchControls.tsx', code);
