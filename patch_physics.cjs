const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

// Update gravity
code = code.replace(
  /this\.world\.gravity\.set\(0, -24, 0\);/,
  'this.world.gravity.set(0, -9.81, 0);'
);

// Update physics solver for more realism
code = code.replace(
  /this\.world\.solver\.iterations = 25;/,
  'this.world.solver.iterations = 50;'
);
code = code.replace(
  /this\.world\.solver\.tolerance = 0\.001;/,
  'this.world.solver.tolerance = 0.0001;'
);

fs.writeFileSync('server.ts', code);
