// GitHub Pages용 정적 묶음 만들기: dist/  (폰 앱 + 시연 페이지 + 목업 키오스크 + 공용 엔진)
// 사용: node scripts/build-pages.mjs [출력 폴더]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'dist'));
const SHARED = ['engine.js', 'guide.js', 'layout.js', 'plain.js', 'screen.js', 'goal-rules.js'];

// fs.cpSync는 일부 마운트 폴더에서 권한 오류가 나서 직접 복사
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const a = path.join(src, e.name), b = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(a, b); else fs.writeFileSync(b, fs.readFileSync(a));
  }
}
fs.rmSync(OUT, { recursive: true, force: true });
copyDir(path.join(ROOT, 'public'), OUT);
copyDir(path.join(ROOT, 'kiosk'), path.join(OUT, 'kiosk'));
fs.mkdirSync(path.join(OUT, 'lib'), { recursive: true });
for (const f of SHARED) fs.writeFileSync(path.join(OUT, 'lib', f), fs.readFileSync(path.join(ROOT, 'server', 'lib', f)));
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
const count = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(path.join(d, e.name)) : 1), 0);
console.log(`dist 완료: ${OUT} (${count(OUT)}개 파일)`);
