import fs from 'fs';
import path from 'path';

const patches = [
  {
    file: 'node_modules/face-api.js/build/commonjs/classes/Box.js',
    target: 'if (!isRect && !isBbox) {\n            throw new Error("Box.constructor - expected box to be IBoundingBox | IRect, instead have " + JSON.stringify(box));\n        }',
    replacement: 'if (!isRect && !isBbox) {\n            console.warn("[face-api.js] Box.constructor - invalid box coordinates, falling back to default dimensions:", JSON.stringify(box));\n            box = { left: 0, top: 0, right: 100, bottom: 100, x: 0, y: 0, width: 100, height: 100 };\n            isBbox = true;\n            isRect = true;\n        }'
  },
  {
    file: 'node_modules/face-api.js/build/es6/classes/Box.js',
    target: 'if (!isRect && !isBbox) {\n            throw new Error("Box.constructor - expected box to be IBoundingBox | IRect, instead have " + JSON.stringify(box));\n        }',
    replacement: 'if (!isRect && !isBbox) {\n            console.warn("[face-api.js] Box.constructor - invalid box coordinates, falling back to default dimensions:", JSON.stringify(box));\n            box = { left: 0, top: 0, right: 100, bottom: 100, x: 0, y: 0, width: 100, height: 100 };\n            isBbox = true;\n            isRect = true;\n        }'
  },
  {
    file: 'node_modules/face-api.js/dist/face-api.js',
    target: 'if (!isRect && !isBbox) {\n              throw new Error("Box.constructor - expected box to be IBoundingBox | IRect, instead have " + JSON.stringify(box));\n          }',
    replacement: 'if (!isRect && !isBbox) {\n              console.warn("[face-api.js] Box.constructor - invalid box coordinates, falling back to default dimensions:", JSON.stringify(box));\n              box = { left: 0, top: 0, right: 100, bottom: 100, x: 0, y: 0, width: 100, height: 100 };\n              isBbox = true;\n              isRect = true;\n          }'
  },
  {
    file: 'node_modules/face-api.js/dist/face-api.min.js',
    target: 'if(!o&&!r)throw new Error("Box.constructor - expected box to be IBoundingBox | IRect, instead have "+JSON.stringify(n));',
    replacement: 'if(!o&&!r){console.warn("[face-api.js] Box.constructor - invalid box coordinates, falling back to default dimensions:",JSON.stringify(n));n={left:0,top:0,right:100,bottom:100,x:0,y:0,width:100,height:100};r=!0;o=!0}'
  }
];

patches.forEach((patch) => {
  const fullPath = path.resolve(process.cwd(), patch.file);
  if (!fs.existsSync(fullPath)) {
    console.log(`[Patch System] Skipping patch for ${patch.file} (File not found).`);
    return;
  }

  let content = fs.readFileSync(fullPath, 'utf8');
  
  // Try matching with both LF and CRLF line endings
  let patched = false;
  const targets = [
    patch.target,
    patch.target.replace(/\n/g, '\r\n')
  ];

  for (const t of targets) {
    if (content.includes(t)) {
      content = content.replace(t, patch.replacement);
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`[Patch System] Successfully applied patch to: ${patch.file}`);
      patched = true;
      break;
    }
  }

  if (!patched) {
    if (content.includes(patch.replacement) || content.includes(patch.replacement.replace(/\n/g, '\r\n'))) {
      console.log(`[Patch System] Patch already applied to: ${patch.file}`);
    } else {
      console.warn(`[Patch System] WARNING: Target content not found in: ${patch.file}`);
    }
  }
});

// Ensure whatsapp-rust-bridge exports include require and main for Node/tsx CJS compatibility
const rustBridgePkg = path.resolve(process.cwd(), 'node_modules/whatsapp-rust-bridge/package.json');
if (fs.existsSync(rustBridgePkg)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(rustBridgePkg, 'utf8'));
    let changed = false;
    if (!pkg.main) {
      pkg.main = './dist/index.js';
      changed = true;
    }
    if (pkg.exports && pkg.exports['.'] && !pkg.exports['.'].require) {
      pkg.exports['.'].require = './dist/index.js';
      pkg.exports['.'].default = './dist/index.js';
      changed = true;
    }
    if (changed) {
      fs.writeFileSync(rustBridgePkg, JSON.stringify(pkg, null, 2), 'utf8');
      console.log('[Patch System] Successfully patched whatsapp-rust-bridge exports.');
    }
  } catch (err) {
    console.warn('[Patch System] Could not patch whatsapp-rust-bridge:', err.message);
  }
}

// Cleanup any corrupted or nested node_modules under @whiskeysockets/baileys to prevent ESM resolution breakage
const baileysNestedModules = path.resolve(process.cwd(), 'node_modules/@whiskeysockets/baileys/node_modules');
if (fs.existsSync(baileysNestedModules)) {
  try {
    fs.rmSync(baileysNestedModules, { recursive: true, force: true });
    console.log('[Patch System] Cleaned up orphaned nested node_modules in @whiskeysockets/baileys.');
  } catch (err) {
    console.warn('[Patch System] Could not remove nested node_modules in baileys:', err.message);
  }
}
