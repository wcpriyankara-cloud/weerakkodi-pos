const fs = require('fs');
const path = require('path');

// PurchaseCommonForm.jsx එකේ Firestore sync එක try-catch වලින් wrap කරන්න
const pcfPath = path.join(__dirname, 'components/PurchaseCommonForm.jsx');
if (fs.existsSync(pcfPath)) {
  let content = fs.readFileSync(pcfPath, 'utf8');
  
  // Check if onSnapshot is used
  const hasOnSnapshot = content.includes('onSnapshot');
  const hasGetDocs = content.includes('getDocs');
  const hasGetDoc = content.includes('getDoc(');
  
  console.log('📄 PurchaseCommonForm.jsx analysis:');
  console.log(`  onSnapshot: ${hasOnSnapshot ? '✅ Found' : '❌ Not found'}`);
  console.log(`  getDocs: ${hasGetDocs ? '✅ Found' : '❌ Not found'}`);
  console.log(`  getDoc: ${hasGetDoc ? '✅ Found' : '❌ Not found'}`);
  
  // Find all Firestore method calls
  const firestoreCalls = [];
  const patterns = ['onSnapshot', 'getDocs', 'getDoc', 'addDoc', 'updateDoc', 'deleteDoc', 'setDoc', 'collection', 'query', 'where'];
  for (const p of patterns) {
    const regex = new RegExp('\\b' + p + '\\s*\\(', 'g');
    const matches = content.match(regex);
    if (matches) {
      firestoreCalls.push(`${p}: ${matches.length} calls`);
    }
  }
  console.log(`  Firestore calls: ${firestoreCalls.join(', ')}`);
  
  // Find useEffect blocks that contain Firestore calls
  const useEffectCount = (content.match(/useEffect\s*\(/g) || []).length;
  console.log(`  useEffect blocks: ${useEffectCount}`);
  
  // Check for error handling
  const hasTryCatch = content.includes('try {') || content.includes('try{');
  const hasCatch = content.includes('.catch(');
  console.log(`  try-catch: ${hasTryCatch ? '✅' : '❌'}`);
  console.log(`  .catch(): ${hasCatch ? '✅' : '❌'}`);
  
  // Check for localDb usage
  const localDbCalls = (content.match(/localDb\./g) || []).length;
  console.log(`  localDb calls: ${localDbCalls}`);
  
  // Show first 5 lines of each useEffect that has Firestore
  const lines = content.split('\n');
  let inUseEffect = false;
  let useEffectStart = -1;
  let braceDepth = 0;
  let useEffects = [];
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('useEffect(') || lines[i].includes('useEffect (')) {
      inUseEffect = true;
      useEffectStart = i;
      braceDepth = 0;
    }
    if (inUseEffect) {
      for (const ch of lines[i]) {
        if (ch === '{') braceDepth++;
        if (ch === '}') braceDepth--;
      }
      if (braceDepth <= 0 && i > useEffectStart) {
        const block = lines.slice(useEffectStart, i + 1).join('\n');
        if (block.includes('getDocs') || block.includes('onSnapshot') || block.includes('collection(')) {
          useEffects.push({ start: useEffectStart + 1, end: i + 1, hasFirestore: true });
        }
        inUseEffect = false;
      }
    }
  }
  
  console.log(`\n  Firestore useEffect blocks: ${useEffects.length}`);
  for (const ue of useEffects) {
    console.log(`    Lines ${ue.start}-${ue.end}:`);
    const preview = lines.slice(ue.start - 1, Math.min(ue.start + 4, ue.end)).join('\n      ');
    console.log(`      ${preview}`);
    console.log('      ...');
  }
} else {
  console.log('❌ PurchaseCommonForm.jsx not found');
}

// Also check Suppliers.jsx
const supPath = path.join(__dirname, 'components/Suppliers.jsx');
if (fs.existsSync(supPath)) {
  let content = fs.readFileSync(supPath, 'utf8');
  console.log('\n📄 Suppliers.jsx analysis:');
  console.log(`  onSnapshot: ${content.includes('onSnapshot') ? '✅' : '❌'}`);
  console.log(`  getDocs: ${content.includes('getDocs') ? '✅' : '❌'}`);
  console.log(`  localDb: ${(content.match(/localDb\./g) || []).length} calls`);
  console.log(`  try-catch: ${content.includes('try {') || content.includes('try{') ? '✅' : '❌'}`);
}
