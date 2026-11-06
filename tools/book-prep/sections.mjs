import { readFileSync, writeFileSync } from 'node:fs';
const dir = process.argv[2];
const ps = readFileSync(dir + '/chapters2/rpo-all.txt', 'utf8').split(/\n\n+/);
const s = ps.findIndex((p) => p.includes('Everyone my age remembers'));
const e = ps.findIndex((p) => /^Acknowledgments$/.test(p));
console.log('start', s, JSON.stringify(ps[s].slice(0, 60)), 'end', e);
const body = ps.slice(s, e > 0 ? e : ps.length);
if (!body[0].startsWith('Everyone')) body[0] = body[0].slice(body[0].indexOf('Everyone my age'));
let ch0 = null, cur = [];
for (const p of body) {
  if (/^--\S/.test(p)) { cur.pop(); if (ch0 === null) { ch0 = cur; cur = []; } continue; }
  cur.push(p);
}
writeFileSync(dir + '/chapters2/rpo-ch00.txt', ch0.join('\n\n'));
let w = 0, k = 1, c = [];
for (const p of cur) {
  c.push(p); w += p.split(/\s+/).length;
  if (w >= 3000) { writeFileSync(dir + '/chapters2/rpo-s' + String(k).padStart(2, '0') + '.txt', c.join('\n\n')); k++; c = []; w = 0; }
}
if (c.length) writeFileSync(dir + '/chapters2/rpo-s' + String(k).padStart(2, '0') + '.txt', c.join('\n\n'));
console.log('rpo sections', k, 'prologue paragraphs', ch0.length);
