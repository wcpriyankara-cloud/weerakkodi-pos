const fs = require('fs');
const filePath = 'C:/Users/chandana/StudioProjects/weerakkodi_pos_app/lib/localDb.js';
let content = fs.readFileSync(filePath, 'utf8');

// Fix: add closing }} before export default localDb
content = content.replace(
  /console\.error\(`\[localDb\] markQueueProcessed error:`, err\);\nexport default localDb;/,
  'console.error(`[localDb] markQueueProcessed error:`, err);\n  }\n}\n\nexport default localDb;'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed!');

const lines = content.split('\n');
console.log('\nLast 12 lines:');
for (let k = Math.max(0, lines.length - 12); k < lines.length; k++) {
  console.log('  ' + (k+1) + ': ' + lines[k]);
}
