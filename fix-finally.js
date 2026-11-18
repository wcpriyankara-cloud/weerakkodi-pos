const fs = require('fs');
const f = 'components/POSInvoice.jsx';
let c = fs.readFileSync(f, 'utf8');

// Find the broken line and fix it
const bad1 = "} catch(e5) {}, [safeInvoiceItems,";
const bad2 = "} catch(e5) {}\n  }, [safeInvoiceItems,";

const good = `} catch(e5) {}
    finally { savingRef.current = false; if (isMountedRef.current) setSaving(false); }
  }, [safeInvoiceItems,`;

if (c.includes(bad1)) {
  c = c.replace(bad1, good);
  fs.writeFileSync(f, c, 'utf8');
  console.log('✅ Fixed (pattern 1)! Added finally block + closing brace.');
} else if (c.includes(bad2)) {
  c = c.replace(bad2, good);
  fs.writeFileSync(f, c, 'utf8');
  console.log('✅ Fixed (pattern 2)! Added finally block.');
} else {
  // Try line-based fix
  const lines = c.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('catch(e5)') && lines[i].includes('safeInvoiceItems')) {
      console.log('Found broken line at ' + (i+1));
      const indent = '    ';
      lines[i] = lines[i].replace(/} catch\(e5\) \{\}[^]*/, '} catch(e5) {}');
      lines.splice(i+1, 0, 
        indent + 'finally { savingRef.current = false; if (isMountedRef.current) setSaving(false); }',
        '  }, [safeInvoiceItems,' + lines[i].split('[safeInvoiceItems,')[1]
      );
      // Remove the old dependency part from line i if still there
      c = lines.join('\n');
      fs.writeFileSync(f, c, 'utf8');
      console.log('✅ Fixed (line-based)!');
      break;
    }
  }
}