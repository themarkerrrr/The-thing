const fs = require('fs');
let code = fs.readFileSync('src/game/StickmanModel.ts', 'utf8');

// There are duplicate animateStickman functions because my regex append didn't cleanly remove the old one.
// Let's strip out the second block.

const dupStart = code.lastIndexOf('export function animateStickman');
if (dupStart > code.indexOf('export function animateStickman') + 100) {
  code = code.substring(0, dupStart);
}

fs.writeFileSync('src/game/StickmanModel.ts', code);
