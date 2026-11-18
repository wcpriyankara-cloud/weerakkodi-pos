const fs = require('fs');
const f = 'lib/localDb.js';
let c = fs.readFileSync(f, 'utf8');

// Fix: add return stats and closing brace before export
const broken = "  } catch(e) {}\n\nexport default localDb;";
const fixed = "  } catch(e) {}\n  return stats;\n};\n\nexport default localDb;";

if (c.includes(broken)) {
  c = c.replace(broken, fixed);
  fs.writeFileSync(f, c, 'utf8');
  console.log('OK - Function closed properly!');
} else {
  // Try with \r\n
  const broken2 = "  } catch(e) {}\r\n\r\nexport default localDb;";
  const fixed2 = "  } catch(e) {}\r\n  return stats;\r\n};\r\n\r\nexport default localDb;";
  if (c.includes(broken2)) {
    c = c.replace(broken2, fixed2);
    fs.writeFileSync(f, c, 'utf8');
    console.log('OK - Function closed (CRLF)!');
  } else {
    console.log('Pattern not found. Showing end of file:');
    const lines = c.split(/\r?\n/);
    for (let i = Math.max(0, lines.length - 10); i < lines.length; i++) {
      console.log((i+1) + ': ' + JSON.stringify(lines[i]));
    }
  }
}
