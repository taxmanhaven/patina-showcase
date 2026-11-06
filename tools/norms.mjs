#!/usr/bin/env node
// Patina norms (Nathan, 6 Nov 2026: "These ratios are now the bread and butter for patina engine. Save them all for
// patina's growth."). Turns labelled human texts (sentences.mjs + anatomy.py) into committed numbers only: for every
// Copybook measure, the human range, median, mean, spread, n, sources, date and tool. Book text never leaves
// corpus/local-only/. copybook.mjs can then run from norms.json alone, so any agent can check a draft without the books.
//
//   node norms.mjs build --human <dir of labelled+anatomy .jsonl> --sources <sources.json> --out <norms.json>
//   node norms.mjs show <norms.json> [--grep <text>]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { profile, flat } from './sentences.mjs';
import { looRange } from './copybook.mjs';

export const NORMS_VERSION = '1.0';
const readJsonl = (f) => readFileSync(f, 'utf8').trim().split(/\r?\n/).map((l) => JSON.parse(l));

export function summarise(values) {
  const v = [...values].sort((a, b) => a - b);
  const q = (x) => v[Math.min(v.length - 1, Math.max(0, Math.round(x * (v.length - 1))))];
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, v.length - 1));
  const r = (x) => +x.toFixed(4);
  return { n: v.length, min: r(v[0]), p10: r(q(0.1)), median: r(q(0.5)), p90: r(q(0.9)), max: r(v[v.length - 1]), mean: r(mean), sd: r(sd) };
}

// Pooled introductory-comma rates (G1c), from anatomy rows' "intro" field.
export function introCommaRates(rows) {
  const bins = {};
  for (const r of rows) {
    const i = r.anat && r.anat.intro;
    if (!i) continue;
    const k = i.kind === 'clause' ? 'clause' : i.words === 1 ? 'phrase-1' : i.words === 2 ? 'phrase-2' : i.words <= 4 ? 'phrase-3-4' : 'phrase-5+';
    const b = (bins[k] = bins[k] || { n: 0, comma: 0 });
    b.n++; if (i.comma) b.comma++;
  }
  for (const b of Object.values(bins)) b.rate = +(b.comma / b.n).toFixed(3);
  return bins;
}

export function buildNorms(texts, sources, date) {
  const flats = texts.map((t) => flat(profile(t.rows)));
  const keys = [...new Set(flats.flatMap((f) => Object.keys(f)))].filter((k) => !k.includes('/')).sort();
  const measures = {};
  for (const k of keys) {
    const level = k.startsWith('L1.') ? 'L1 Anatomy' : /^(runs|lastRole|lastMode|aloneShare)/.test(k) ? 'L3 Sequence' : 'L2 Function';
    measures[k] = { level, ...summarise(flats.map((f) => f[k] ?? 0)) };
  }
  // per-scene measures, only over texts that have that scene
  for (const sk of [...new Set(flats.flatMap((f) => Object.keys(f)))].filter((k) => k.includes('/')).sort()) {
    const sc = sk.split('/')[0];
    const pool = flats.filter((f) => f[`${sc}/meanWords`] != null);
    if (pool.length >= 5) measures[sk] = { level: 'by scene', ...summarise(pool.map((f) => f[sk] ?? 0)) };
  }
  return {
    version: NORMS_VERSION,
    date,
    tools: { labeller: 'sentences.mjs label (DeepSeek V4.1 Flash, reasoning off, codebook v0.3)', anatomy: 'anatomy.py (spaCy en_core_web_md 3.8, wordfreq)' },
    sources,
    texts: texts.map((t) => ({ id: t.id, sentences: t.rows.length, words: t.rows.reduce((a, r) => a + (r.words || 0), 0) })),
    sentences: texts.reduce((a, t) => a + t.rows.length, 0),
    looDelta: (({ min, median, max }) => ({ min, median, max }))(looRange(flats)),
    introCommas: introCommaRates(texts.flatMap((t) => t.rows)),
    measures,
    // the raw per-text vectors, so Delta can be recomputed and ranges re-derived as texts are added (numbers only)
    vectors: Object.fromEntries(texts.map((t, i) => [t.id, Object.fromEntries(Object.entries(flats[i]).filter(([k]) => !k.includes('/')))])),
  };
}

async function main(argv) {
  const arg = (k) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : null; };
  if (argv[0] === 'build') {
    const dir = arg('human');
    const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort();
    const texts = files.map((f) => ({ id: f.replace(/\.jsonl$/, ''), rows: readJsonl(join(dir, f)) }));
    const sources = arg('sources') ? JSON.parse(readFileSync(arg('sources'), 'utf8')) : [];
    const n = buildNorms(texts, sources, new Date().toISOString().slice(0, 10));
    writeFileSync(arg('out'), JSON.stringify(n, null, 1) + '\n');
    console.log(`norms ${n.version}: ${n.texts.length} texts, ${n.sentences} sentences, ${Object.keys(n.measures).length} measures -> ${arg('out')}`);
    return 0;
  }
  if (argv[0] === 'show') {
    const n = JSON.parse(readFileSync(argv[1], 'utf8'));
    const g = arg('grep');
    for (const [k, m] of Object.entries(n.measures)) if (!g || k.includes(g)) console.log(`${m.level.padEnd(12)} ${k.padEnd(40)} ${m.min} to ${m.max} (median ${m.median}, n ${m.n})`);
    return 0;
  }
  throw new Error('commands: build, show');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error('norms: ' + e.message); process.exit(2); });
}
