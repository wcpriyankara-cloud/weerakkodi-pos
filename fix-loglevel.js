const fs = require('fs');
let fc = fs.readFileSync('firebase-config.js', 'utf8');

// Add setLogLevel back to import
fc = fc.replace(
  '  disableNetwork,',
  '  setLogLevel,\n  disableNetwork,'
);

// Add setLogLevel call before app init
if (!fc.includes('setLogLevel(')) {
  fc = fc.replace(
    'const app = getApps()',
    'setLogLevel("silent");\n\nconst app = getApps()'
  );
}

fs.writeFileSync('firebase-config.js', fc, 'utf8');
console.log('✅ setLogLevel restored');
