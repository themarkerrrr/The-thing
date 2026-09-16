const fs = require('fs');

let code = fs.readFileSync('src/components/TouchControls.tsx', 'utf8');

// Remove the Slip button block
code = code.replace(/\{\/\* Slip Emote Button \*\/\}[\s\S]*?\{\/\* Sprint Toggle \*\/\}/m, '{/* Sprint Toggle */}');
fs.writeFileSync('src/components/TouchControls.tsx', code);
