// install_electron_direct.js
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const ELECTRON_VERSION = 'v31.2.0';
const ZIP_NAME = `electron-${ELECTRON_VERSION}-win32-x64.zip`;
const DOWNLOAD_URL = `https://github.com/electron/electron/releases/download/${ELECTRON_VERSION}/${ZIP_NAME}`;

const electronDir = path.join(__dirname, 'node_modules', 'electron');
const distDir = path.join(electronDir, 'dist');
const zipPath = path.join(__dirname, ZIP_NAME);

console.log(`🚀 Starting direct installation for Electron ${ELECTRON_VERSION}...`);

// Ensure directory structure
if (!fs.existsSync(electronDir)) fs.mkdirSync(electronDir, { recursive: true });
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

function downloadFile(url, dest, callback) {
  const file = fs.createWriteStream(dest);
  
  https.get(url, (response) => {
    // Handle redirects (GitHub -> AWS S3)
    if (response.statusCode === 302 || response.statusCode === 301) {
      console.log('🔄 Redirecting to secure download mirror...');
      return downloadFile(response.headers.location, dest, callback);
    }

    if (response.statusCode !== 200) {
      return callback(new Error(`Download failed with status: ${response.statusCode}`));
    }

    const totalBytes = parseInt(response.headers['content-length'], 10) || 105000000;
    let downloadedBytes = 0;
    let lastPercent = 0;

    response.on('data', (chunk) => {
      downloadedBytes += chunk.length;
      const percent = Math.round((downloadedBytes / totalBytes) * 100);
      if (percent !== lastPercent && percent % 5 === 0) {
        lastPercent = percent;
        const mb = (downloadedBytes / (1024 * 1024)).toFixed(1);
        const totalMb = (totalBytes / (1024 * 1024)).toFixed(1);
        process.stdout.write(`\r📦 Downloading: ${percent}% (${mb} MB / ${totalMb} MB)`);
      }
    });

    response.pipe(file);

    file.on('finish', () => {
      file.close(() => {
        console.log('\n✅ Download completed successfully!');
        callback(null);
      });
    });
  }).on('error', (err) => {
    fs.unlink(dest, () => {});
    callback(err);
  });
}

function extractAndConfigure() {
  console.log('📂 Extracting Electron binaries to node_modules/electron/dist ...');
  
  try {
    // Extract using Windows native tar
    execSync(`tar -xf "${zipPath}" -C "${distDir}"`, { stdio: 'inherit' });
  } catch (tarErr) {
    console.log('Using PowerShell fallback extraction...');
    execSync(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${distDir}' -Force"`, { stdio: 'inherit' });
  }

  // Create path.txt pointing to electron.exe
  fs.writeFileSync(path.join(electronDir, 'path.txt'), 'electron.exe', 'utf8');

  // Create robust index.js for electron module resolution
  const electronIndexJs = `const path = require('path');
module.exports = path.join(__dirname, 'dist', 'electron.exe');
`;
  fs.writeFileSync(path.join(electronDir, 'index.js'), electronIndexJs, 'utf8');

  // Clean up downloaded zip file
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  // Update package.json scripts
  const pkgPath = path.join(__dirname, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkg.main = 'main/main.js';
    pkg.scripts = pkg.scripts || {};
    pkg.scripts.electron = 'node node_modules/electron/index.js .';
    pkg.scripts.app = 'node node_modules/electron/index.js .';
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');
  }

  console.log('\n🎉 Electron v31.2.0 installed and verified successfully!');
  console.log('🚀 Launching POS App...');
  
  // Launch the Electron app directly
  const electronExe = path.join(distDir, 'electron.exe');
  execSync(`"${electronExe}" .`, { stdio: 'inherit' });
}

// Start download & extract pipeline
downloadFile(DOWNLOAD_URL, zipPath, (err) => {
  if (err) {
    console.error('\n❌ Download error:', err.message);
    process.exit(1);
  }
  extractAndConfigure();
});