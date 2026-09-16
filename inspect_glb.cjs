const fs = require('fs');
const buffer = fs.readFileSync('public/2003.glb');

const magic = buffer.toString('utf8', 0, 4);
if (magic !== 'glTF') {
  console.log('Not a valid GLB');
  process.exit(1);
}

const jsonChunkLength = buffer.readUInt32LE(12);
const jsonChunkType = buffer.toString('utf8', 16, 20);

if (jsonChunkType === 'JSON') {
  const jsonStr = buffer.toString('utf8', 20, 20 + jsonChunkLength);
  const json = JSON.parse(jsonStr);
  console.log("Nodes:", JSON.stringify(json.nodes, null, 2));
  console.log("Meshes:", JSON.stringify(json.meshes, null, 2));
  console.log("Animations:", json.animations ? json.animations.length : 0);
  console.log("Skins:", json.skins ? json.skins.length : 0);
}
