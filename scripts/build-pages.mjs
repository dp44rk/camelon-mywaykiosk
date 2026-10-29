// GitHub Pages용 정적 묶음 만들기: dist/  (폰 앱 + 시연 페이지 + 목업 키오스크 + 공용 엔진)
// 사용: node scripts/build-pages.mjs [출력 폴더]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'dist'));
const SHARED = ['engine.js', 'guide.js', 'layout.js', 'plain.js', 'screen.js', 'goal-rules.js'];

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'public'), OUT, { recursive: true });
fs.cpSync(path.join(ROOT, 'kiosk'), path.join(OUT, 'kiosk'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'lib'), { recursive: true });
for (const f of SHARED) fs.copyFileSync(path.join(ROOT, 'server', 'lib', f), path.join(OUT, 'lib', f));
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
const count = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(path.join(d, e.name)) : 1), 0);
console.log(`dist 완료: ${OUT} (${count(OUT)}개 파일)`);
