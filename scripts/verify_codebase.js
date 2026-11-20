const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('====================================================');
console.log('🔍 INSTATWEAKS PRE-HANDOVER CODE AUDIT & SYNTAX CHECK');
console.log('====================================================\n');

let hasError = false;

// 1. Kiểm tra manifest.json
try {
  const manifestRaw = fs.readFileSync('manifest.json', 'utf8');
  const manifest = JSON.parse(manifestRaw);
  console.log('✅ manifest.json: Cú pháp JSON hợp lệ!');

  const checkFile = (filePath) => {
    if (!fs.existsSync(filePath)) {
      console.error(`❌ LỖI: Tệp khai báo trong manifest không tồn tại: ${filePath}`);
      hasError = true;
    }
  };

  if (manifest.background && manifest.background.service_worker) {
    checkFile(manifest.background.service_worker);
  }
  if (manifest.content_scripts) {
    manifest.content_scripts.forEach(cs => {
      if (cs.js) cs.js.forEach(checkFile);
      if (cs.css) cs.css.forEach(checkFile);
    });
  }
} catch (e) {
  console.error('❌ LỖI: manifest.json không hợp lệ hoặc bị lỗi cú pháp:', e.message);
  hasError = true;
}

// 2. Kiểm tra cú pháp VM trên toàn bộ file JavaScript trong scripts/
const scriptsDir = 'scripts';
const jsFiles = fs.readdirSync(scriptsDir).filter(f => f.endsWith('.js'));

console.log(`\n🔍 Đang kiểm tra cú pháp ${jsFiles.length} tệp JavaScript trong ${scriptsDir}/:`);

const truncatedMarker = '...' + '[truncated';

for (const f of jsFiles) {
  const fullPath = path.join(scriptsDir, f);
  const code = fs.readFileSync(fullPath, 'utf8');

  // Chỉ kiểm tra chuỗi cắt diff trên các tệp runtime chính của extension
  const isRuntimeFile = ['studio_core.js', 'content.js', 'v3_core.js', 'background.js', 'injected.js'].includes(f);
  if (isRuntimeFile && code.includes(truncatedMarker)) {
    console.error(`❌ LỖI NGHIÊM TRỌNG: ${fullPath} chứa chuỗi cắt file diff ("...[truncated")!`);
    hasError = true;
    continue;
  }

  try {
    new vm.Script(code, { filename: fullPath });
    console.log(`  ✅ [PASS] ${f} (Kích thước: ${(code.length / 1024).toFixed(1)} KB)`);
  } catch (err) {
    console.error(`  ❌ [FAIL] ${fullPath} BỊ LỖI CÚ PHÁP:`);
    console.error(`     Thông báo: ${err.message}`);
    const lineMatch = err.stack && err.stack.match(new RegExp(f.replace('.', '\\.') + ':(\\d+)'));
    if (lineMatch) {
      const lineNo = parseInt(lineMatch[1], 10);
      const lines = code.split('\n');
      console.error(`     Vị trí dòng ${lineNo}:`);
      console.error('     ---------------------------------------------');
      for (let l = Math.max(0, lineNo - 4); l < Math.min(lines.length, lineNo + 3); l++) {
        const marker = (l + 1 === lineNo) ? ' >> ' : '    ';
        console.error(`${marker}${l + 1}: ${lines[l]}`);
      }
      console.error('     ---------------------------------------------');
    }
    hasError = true;
  }
}

console.log('\n====================================================');
if (hasError) {
  console.error('❌ KẾT QUẢ: PHÁT HIỆN LỖI TRƯỚC BÀN GIAO! VUI LÒNG KHẮC PHỤC NGAY.');
  process.exit(1);
} else {
  console.log('✅ KẾT QUẢ: 100% CÁC FILE ĐỀU ĐẠT CHUẨN CÚ PHÁP & SẴN SÀNG BÀN GIAO!');
  console.log('====================================================');
  process.exit(0);
}
