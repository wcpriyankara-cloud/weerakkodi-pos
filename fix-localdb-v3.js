const fs = require('fs');
const filePath = 'C:/Users/chandana/StudioProjects/weerakkodi_pos_app/lib/localDb.js';
let content = fs.readFileSync(filePath, 'utf8');

// Problem 1: getBackupStats function එකේ closing }; නෑ
// "return stats;" ට පස්සේ "}; " එකක් add කරන්න ඕනේ
// "return stats;\n\n// " pattern එක හොයලා fix කරනවා
content = content.replace(
  /return stats;\s*\n(\s*\/\/ .?Version 7)/,
  'return stats;\n};\n\n$1'
);

// Problem 2: db.getBackupStats → localDb.getBackupStats (variable name fix)
content = content.replace(/db\.getBackupStats/g, 'localDb.getBackupStats');
content = content.replace(/await db\[/g, 'await localDb[');

// Problem 3: Broken comment block before saveToLocal
// "╕╕╕..." line එක සහ "* synced" line එක fix කරනවා
content = content.replace(
  /\/\/ [^\n]*\n \* synced = false/,
  '/**\n * Local DB එකට record එකක් save කරනවා\n * synced = false'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed localDb.js!');

// Verify
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('return stats;')) {
    console.log(`\nLines around return stats (line ${i+1}):`);
    for (let k = Math.max(0,i-2); k <= Math.min(lines.length-1,i+4); k++) {
      console.log(`  ${k+1}: ${lines[k]}`);
    }
  }
}
