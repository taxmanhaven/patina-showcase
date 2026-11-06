#!/usr/bin/env node
// The Copybook (v0.1, Nathan's name ask, 6 Nov 2026): does a draft's sentence profile sit among real books?
// A copybook was the book of model lines a student copied by hand to learn a master's style. Ours is a set of
// human chapters labelled by sentences.mjs. Established method: stylometry with Burrows's Delta (2002); feature set
// after Biber's multidimensional analysis (1988). Two outputs:
//   1. Copybook Delta: mean absolute z-score of the draft against the human texts, each z capped at 3 (one odd
//      measure cannot dominate), with the human texts' own leave-one-out Deltas as the yardstick.
//   2. Copybook tells: measures where the draft sits outside the full range of every human text.
// Axes whose coders disagreed (kappa under 0.6 on modern prose: st, role, what, how) are left out of the Delta.
//
//   node copybook.mjs --human <dir of labelled .jsonl> --draft <labelled.jsonl> [--draft ...] [--json]
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { profile, flat } from './sentences.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

export const VERSION = '0.2';
const WEAK = /^(?:[a-z]+\/)?(?:st|role|lastRole)\b|^ws\.(?:what|how)$/;
const readJsonl = (f) => readFileSync(f, 'utf8').trim().split(/\r?\n/).map((l) => JSON.parse(l));

const usable = (pool) => [...new Set(pool.flatMap((f) => Object.keys(f)))].filter((k) => !k.includes('/') && !WEAK.test(k));
const stats = (pool, k) => {
  const v = pool.map((p) => p[k] ?? 0);
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, v.length - 1));
  return { m, sd, lo: Math.min(...v), hi: Math.max(...v) };
};

export function delta(f, pool, cap = 3) {
  let s = 0, n = 0;
  const parts = [];
  for (const k of usable(pool)) {
    const { m, sd } = stats(pool, k);
    if (!(sd > 0.005)) continue;
    const z = Math.max(-cap, Math.min(cap, ((f[k] ?? 0) - m) / sd));
    s += Math.abs(z); n++; parts.push({ k, z: +z.toFixed(2), value: f[k] ?? 0, mean: +m.toFixed(3) });
  }
  return { delta: +(s / (n || 1)).toFixed(2), parts: parts.sort((a, b) => Math.abs(b.z) - Math.abs(a.z)) };
}

export function looRange(pool) {
  const ds = pool.map((f, i) => delta(f, pool.filter((_, j) => j !== i)).delta).sort((a, b) => a - b);
  return { min: ds[0], median: ds[Math.floor(ds.length / 2)], max: ds[ds.length - 1], all: ds };
}

export function tells(f, pool) {
  const out = [];
  for (const k of [...new Set([...pool.flatMap((p) => Object.keys(p)), ...Object.keys(f)])]) {
    if (k.includes('/')) continue;
    const { lo, hi } = stats(pool, k);
    const v = f[k] ?? 0;
    if (v > hi || v < lo) out.push({ k, value: +v.toFixed(3), lo: +lo.toFixed(3), hi: +hi.toFixed(3), dir: v > hi ? 'above' : 'below', indicative: WEAK.test(k) });
  }
  return out;
}

// Which sentences make a measure what it is (for --examples). Returns a filter over labelled rows.
export function rowsFor(key, rows) {
  const [ax, val] = key.split('.');
  if (key === 'aloneShare') return rows.filter((r) => r.pos === 'alone');
  if (ax === 'runs' && val === 'opening') {
    const out = [];
    for (let i = 2; i < rows.length; i++) if (rows[i].opening && rows[i].opening === rows[i - 1].opening && rows[i].opening === rows[i - 2].opening) out.push(rows[i - 2], rows[i - 1], rows[i]);
    return [...new Set(out)];
  }
  if (ax === 'opening') return rows.filter((r) => !r.quoted && r.opening === val);
  if (ax === 'band') return rows.filter((r) => r.band === val);
  if (ax === 'devicesPer1k') return rows.filter((r) => (r.ruleDevices || []).includes(val) || (r.devices || []).includes(val));
  if (ax === 'lastMode') return rows.filter((r) => r.pos === 'last' && r.mode === val);
  if (['form', 'shape', 'mode'].includes(ax)) return rows.filter((r) => r[ax] === val);
  return [];
}

// Local-only report: for each tell, the draft's sentences behind it and what the books do instead.
// Full sentences, never truncated (Nathan, 6 Nov 2026). Write it inside corpus/local-only/, never commit it.
export function examplesReport(draftName, draftRows, t, humanRows, n = 4) {
  const pick = (arr, k) => { const step = Math.max(1, Math.floor(arr.length / k)); return arr.filter((_, i) => i % step === 0).slice(0, k); };
  const out = [`## ${draftName}`, ''];
  for (const x of t.filter((y) => !y.indicative)) {
    out.push(`### ${x.k}: ${x.value} (every human text ${x.lo} to ${x.hi}; draft is ${x.dir})`, '');
    const mine = rowsFor(x.k, draftRows);
    if (x.dir === 'above' && mine.length) { out.push('Draft sentences behind it:', ...pick(mine, n).map((r) => `- ${r.text}`), ''); }
    const theirs = rowsFor(x.k, humanRows);
    if (x.dir === 'below' && theirs.length) { out.push('What the books do that the draft does not:', ...pick(theirs, n).map((r) => `- ${r.text}  [${r.src}]`), ''); }
    if (x.dir === 'above' && x.k.startsWith('opening.')) {
      const alt = humanRows.filter((r) => !r.quoted && ['adverbial', 'time-or-place', 'conjunction', 'participle'].includes(r.opening));
      if (alt.length) out.push('How the books open instead:', ...pick(alt, n).map((r) => `- ${r.text}  [${r.src}]`), '');
    }
    if (x.k === 'aloneShare') {
      const multi = humanRows.filter((r) => r.pos === 'first');
      const byPara = (src, para) => humanRows.filter((r) => r.src === src && r.para === para).map((r) => r.text).join(' ');
      if (multi.length) out.push('Paragraphs from the books that carry several sentences:', ...pick(multi, 2).map((r) => `- ${byPara(r.src, r.para)}  [${r.src}]`), '');
    }
  }
  return out.join('\n');
}

async function main(argv) {
  const arg = (k) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : null; };
  const dir = arg('human');
  const normsFile = arg('norms') || (!dir ? join(HERE, '..', 'norms', 'norms.json') : null);
  const drafts = argv.map((a, i) => (argv[i - 1] === '--draft' ? a : null)).filter(Boolean);
  if (!drafts.length) throw new Error('usage: copybook.mjs [--human <dir> | --norms <norms.json>] --draft <labelled.jsonl> [--draft ...]  (default: patina/norms/norms.json)');
  // From committed norms (numbers only, any machine) or from local labelled human texts (needs the books).
  const norms = normsFile ? JSON.parse(readFileSync(normsFile, 'utf8')) : null;
  const files = norms ? Object.keys(norms.vectors) : readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
  const pool = norms ? Object.values(norms.vectors) : files.map((f) => flat(profile(readJsonl(join(dir, f)))));
  if (norms) console.error(`copybook: using norms ${norms.version} (${norms.date}, ${norms.texts.length} human texts, ${norms.sentences} sentences)`);
  if (norms && arg('examples')) throw new Error('--examples needs the books: use --human <dir>');
  const loo = looRange(pool);
  const res = drafts.map((d) => { const f = flat(profile(readJsonl(d))); return { draft: d, ...delta(f, pool), tells: tells(f, pool) }; });
  if (arg('examples')) {
    const humanRows = files.flatMap((f) => readJsonl(join(dir, f)).map((r) => ({ ...r, src: f.replace(/\.jsonl$/, '') })));
    const { writeFileSync } = await import('node:fs');
    const report = [`# Copybook v${VERSION} examples (local only: contains book text; never commit)`, '', ...res.map((r) => examplesReport(r.draft.split(/[\\/]/).pop(), readJsonl(r.draft), r.tells, humanRows))].join('\n');
    writeFileSync(arg('examples'), report);
    console.error(`examples written to ${arg('examples')}`);
  }
  if (argv.includes('--json')) { console.log(JSON.stringify({ version: VERSION, human: files.length, loo, res }, null, 2)); return 0; }
  if (argv.includes('--panel')) {
    // Every gauge at once (Luke Studio, 6 Nov 2026: pushing one gauge overshot the next). Bar: | human range |, * = draft.
    for (const r of res) {
      const f = flat(profile(readJsonl(r.draft)));
      console.log(`\nPanel: ${r.draft.split(/[\\/]/).pop()} (Copybook Delta ${r.delta}; human ${loo.min} to ${loo.max})`);
      for (const level of ['L2 Function', 'L1 Anatomy']) {
        console.log(`  ${level}`);
        const keys = usable(pool).filter((k) => (level.startsWith('L1') ? k.startsWith('L1.') : !k.startsWith('L1.')));
        for (const k of keys) {
          const { lo, hi } = stats(pool, k);
          const v = f[k] ?? 0, w = hi - lo || 1;
          const pos = Math.round(((v - lo) / w) * 20);
          const bar = Array.from({ length: 21 }, (_, i) => (v >= lo && v <= hi && i === pos ? '*' : '-')).join('');
          const flag = v < lo ? 'LOW ' : v > hi ? 'HIGH' : (pos <= 2 || pos >= 18) && !(v === 0 && lo === 0) ? 'edge' : '    ';
          console.log(`  ${flag} ${k.padEnd(40)} ${(v < lo ? '*' : ' ')}|${bar}|${v > hi ? '*' : ' '} ${+v.toFixed(3)}  (${+lo.toFixed(3)} to ${+hi.toFixed(3)})`);
        }
      }
    }
    return 0;
  }
  console.log(`Copybook v${VERSION}: ${files.length} human texts. Human Deltas against each other: ${loo.min} to ${loo.max} (median ${loo.median}).${files.length < 30 ? ' Few authors: read the tells, not the single number.' : ''}`);
  for (const r of res) {
    console.log(`\n${r.draft.split(/[\\/]/).pop()}: Copybook Delta ${r.delta}${r.delta > loo.max ? ' (outside the human range)' : ''}`);
    for (const t of r.tells.filter((x) => !x.indicative)) console.log(`  ${t.dir.padEnd(5)} ${t.k.padEnd(28)} ${t.value}  (every human text ${t.lo} to ${t.hi})`);
  }
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error('copybook: ' + e.message); process.exit(2); });
}
