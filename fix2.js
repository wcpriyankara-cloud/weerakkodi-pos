const fs=require('fs');
let f=fs.readFileSync('firebase-config.js','utf8');
if(!f.includes('Startup disableNetwork')){
  f=f.replace('const auth = getAuth(app);',
    '// Startup disableNetwork - offline PC\nif(db) disableNetwork(db).catch(()=>{});\n\nconst auth = getAuth(app);');
  fs.writeFileSync('firebase-config.js',f,'utf8');
  console.log('OK - disableNetwork added');
} else { console.log('Already present'); }