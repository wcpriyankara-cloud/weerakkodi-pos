// dev.js
const { spawn } = require('child_process');
const http = require('http');

console.log('🚀 Next.js Development Server එක ආරම්භ වේ...');

let isElectronStarted = false;

// 1. Next.js Server එක Run කිරීම
const nextProcess = spawn('npx', ['next', 'dev'], { 
  shell: true, 
  stdio: 'inherit' 
});

// 2. Next.js Server එක ready වූ පසු එක් වරක් පමණක් Electron Launch කිරීම
function checkServerAndLaunchElectron() {
  if (isElectronStarted) return;

  const req = http.get('http://localhost:3000', (res) => {
    if (!isElectronStarted) {
      isElectronStarted = true;
      console.log('✅ Next.js Server එක සූදානම්! Electron App එක විවෘත වේ...');
      
      const electronProcess = spawn('npx', ['electron', '.'], { 
        shell: true, 
        stdio: 'inherit' 
      });

      electronProcess.on('close', () => {
        try { nextProcess.kill(); } catch (e) {}
        process.exit();
      });
    }
  });

  req.on('error', () => {
    if (!isElectronStarted) {
      setTimeout(checkServerAndLaunchElectron, 1500);
    }
  });
}

setTimeout(checkServerAndLaunchElectron, 3000);

process.on('SIGINT', () => {
  try { nextProcess.kill(); } catch (e) {}
  process.exit();
});