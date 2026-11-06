// Rebuild chapters from pdftotext -layout: a line that starts indented begins a new paragraph.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const dir = process.argv[2];
function paras(file) {
  const lines = readFileSync(join(dir, file), 'utf8').replace(/\r/g, '').split('\n');
  const out = [];
  let lastLen = 99, lastEnd = false;
  for (let raw of lines) {
    const pageBreak = raw.includes('\f');
    raw = raw.replace(/\f/g, '');
    if (!raw.trim()) { if (out.length && out[out.length - 1] !== '') out.push(''); continue; }
    if (/^\s*\d{1,3}\s*$/.test(raw)) continue; // page number
    const indented = /^\s{2,}\S/.test(raw);
    const t = raw.trim();
    const shortEnd = file.startsWith('rpo') && lastLen < 55 && lastEnd;
    lastLen = raw.replace(/\s+$/, '').length; lastEnd = /[.!?"”:]$/.test(t) || /^--\S/.test(t);
    const prev = out.length ? out[out.length - 1] : '';
    if (prev && !indented && !shortEnd && !(pageBreak && /^[A-Z"“]/.test(t) && /[.!?"”]$/.test(prev))) { out[out.length - 1] = prev + ' ' + t; continue; }
    if (prev === '' && out.length) out.pop();
    out.push(t);
  }
  return out.filter((p) => p !== '');
}
mkdirSync(join(dir, 'chapters2'), { recursive: true });
const hg = paras('hunger-games.raw.txt');
let cur = null; const ch = {};
for (const p of hg) { const m = p.match(/^Chapter (\d+)\.?$/); if (m && p.length < 14) { cur = +m[1]; ch[cur] = []; continue; } if (/^PART [IVX]+/.test(p) || /^End of Chapter$/.test(p)) continue; if (cur) ch[cur].push(p); }
for (const [k, v] of Object.entries(ch)) writeFileSync(join(dir, 'chapters2', `hg-ch${String(k).padStart(2, '0')}.txt`), v.join('\n\n'));
const rpo = paras('rpo.raw.txt');
writeFileSync(join(dir, 'chapters2', 'rpo-all.txt'), rpo.join('\n\n'));
console.log('hg chapters', Object.keys(ch).length, 'rpo paragraphs', rpo.length);
