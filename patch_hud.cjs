const fs = require('fs');
let code = fs.readFileSync('src/components/HUDOverlay.tsx', 'utf8');

// Replace the build mode toggle button with a seamless unequip flow.
// We remove the explicit "Build Toggle" button and instead add an "Unequip" option to the toolbar.

// Desktop replacement
const desktopToggleRegex = /\{\/\* Build Mode Toggle Button \*\/\}[\s\S]*?\{\/\* Emotes \*\/\}/m;
const newDesktopToggle = `
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

            {/* Emotes */}`;

code = code.replace(desktopToggleRegex, newDesktopToggle);

// Mobile replacements
// In compact item picker
const mobilePickerRegex = /\{\/\* Compact Item Picker \*\/\}\s*<div className="grid grid-cols-3 gap-1 mb-2 font-comic">([\s\S]*?)<\/div>/m;
const mobilePickerMatch = code.match(mobilePickerRegex);
if (mobilePickerMatch) {
  const newMobilePicker = `{/* Compact Item Picker */}
              <div className="grid grid-cols-3 gap-1 mb-2 font-comic">
                ${mobilePickerMatch[1]}
                <button
                  type="button"
                  onClick={onToggleBuildMode}
                  className={\`border border-black px-1.5 py-1 text-[10px] font-bold truncate text-center font-comic text-black \${
                    !isBuildMode ? 'bg-black text-white' : ''
                  }\`}
                  style={!isBuildMode ? { background: 'black', color: 'white' } : { background: 'transparent' }}
                >
                  UNEQUIP
                </button>
              </div>`;
  code = code.replace(mobilePickerRegex, newMobilePicker);
}

// Mobile top drawer buttons
const mobileDrawerBtnsRegex = /<div className="flex items-center gap-1\.5 font-comic">[\s\S]*?<\/div>/m;
const newMobileDrawerBtns = `<div className="flex items-center gap-1.5 font-comic">
                  <button
                    type="button"
                    onClick={() => setShowMobileToolDrawer(false)}
                    className="border border-black px-2 py-0.5 text-[10px] font-bold uppercase font-comic text-black"
                    style={{ background: 'transparent' }}
                  >
                    CLOSE
                  </button>
                </div>`;
code = code.replace(mobileDrawerBtnsRegex, newMobileDrawerBtns);

fs.writeFileSync('src/components/HUDOverlay.tsx', code);
