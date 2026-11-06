#!/usr/bin/env node
// Patina sentence matrix (codebook: craft/sentence-codebook.md).
// Dissect fiction sentence by sentence on several axes, then profile and compare against human ranges.
//
//   node sentences.mjs split <text> [--out <file.jsonl>]                 rule axes only, no network
//   node sentences.mjs label <text> --out <file.jsonl> [--key-file <k>]  rule axes + DeepSeek-judged axes (cached)
//   node sentences.mjs profile <file.jsonl> [--json]                     the matrix for one text
//   node sentences.mjs reference <a.jsonl> <b.jsonl> ... --out <ref.json> pool human profiles into ranges
//   node sentences.mjs compare <draft.jsonl> --reference <ref.json>      the draft's shares against human ranges
// Keys come from PRIMALABS_API_KEY or --key-file, read in-process, never printed or written.
// Copyrighted text stays in corpus/local-only/. Labelled JSONL holds sentence text: keep it beside its source.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterthoughtAsides } from './patina.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const AXES = {
  form: ['fragment', 'simple', 'compound', 'complex', 'compound-complex'],
  shape: ['plain', 'cumulative', 'periodic', 'balanced', 'list', 'question', 'command'],
  mode: ['event', 'description', 'speech', 'thought', 'summary', 'exposition', 'commentary', 'sensory'],
  st: ['narration', 'speech-act', 'indirect-speech', 'free-indirect-speech', 'direct-speech', 'thought-act', 'indirect-thought', 'free-indirect-thought', 'direct-thought'],
  role: ['opener', 'build', 'turn', 'button', 'beat', 'bridge'],
  scene: ['dialogue', 'action', 'description', 'reflection', 'summary'],
};
export const BANDS = [[1, 3], [4, 8], [9, 15], [16, 25], [26, 40], [41, Infinity]];

// ---------- split ----------
const ABBR = /\b(?:Mr|Mrs|Ms|Dr|St|Mt|Jr|Sr|vs|etc|No|Prof|Rev)\.$/;
export function paragraphsOf(text) {
  return text.replace(/\r\n/g, '\n').split(/\n/).map((p) => p.trim())
    .filter((p) => p && !/^(?:#|---|\*\*\*|\* \* \*|>|\|)/.test(p));
}
export function splitSentences(p) {
  const out = [];
  let start = 0;
  const re = /[.!?…]+["'’”)]*(?=\s+["'‘“(]?[A-Z0-9])/g;
  let m;
  while ((m = re.exec(p))) {
    const end = m.index + m[0].length;
    const piece = p.slice(start, end);
    if (ABBR.test(piece.trim())) continue;
    out.push(piece.trim());
    start = end;
  }
  const rest = p.slice(start).trim();
  if (rest) out.push(rest);
  return out.filter(Boolean);
}
const words = (s) => (s.match(/[A-Za-z0-9’']+/g) || []).length;
export function band(n) { const b = BANDS.find(([lo, hi]) => n >= lo && n <= hi); return b ? (b[1] === Infinity ? `${b[0]}+` : `${b[0]}-${b[1]}`) : '0'; }

export function opening(s) {
  const t = s.replace(/^["'‘“(]+/, '');
  if (/^["“]/.test(s)) return 'dialogue';
  if (/^(?:And|But|So|Or|Yet|Nor)\b/.test(t)) return 'conjunction';
  if (/^(?:There|It)(?:'s|’s)?\s+(?:is|was|were|are|had|has|seemed|'s|’s)\b/.test(t)) return 'dummy';
  if (/^I\b/.test(t)) return 'I';
  if (/^(?:When|After|Before|Once|Then|Now|Later|Earlier|Today|Tonight|Yesterday|Tomorrow|That (?:night|morning|day|evening)|On \w+day|In the (?:morning|evening|night|afternoon)|At (?:night|dawn|noon|last)|By the time|Every|Each|For (?:years|a moment|a while)|Twenty|Ten|\d+)\b/.test(t)) return 'time-or-place';
  if (/^(?:In|On|At|Inside|Outside|Under|Over|Behind|Across|Beyond|Up|Down|Through|Along|Beside|Between)\b/.test(t)) return 'time-or-place';
  if (/^[A-Z][a-z]+ing\b|^[A-Z][a-z]+ed,/.test(t)) return 'participle';
  if (/^(?:If|Because|Although|Though|While|Since|As|Unless|Until|With|Without|Like|Even|Only|Still|Maybe|Perhaps|Of course|Somehow|Suddenly|Slowly|Finally)\b/.test(t)) return 'adverbial';
  if (/^(?:He|She|They|We|You|His|Her|Their|Our|My|The|A|An|This|That|These|Those|Everyone|Nobody|Somebody|Nothing|Something)\b/.test(t)) return 'subject';
  if (/^[A-Z][a-z]+\b/.test(t)) return 'name-or-other';
  return 'other';
}

// "when" by rule (codebook v0.3): a named time, part of day, date, duration or frequency. Linking words do not count.
const WHEN_RE = /\b(?:morning|afternoon|evening|night|tonight|today|yesterday|tomorrow|daybreak|dawn|dusk|noon|midnight|sunrise|sunset|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|june|july|august|september|october|november|december|spring|summer|autumn|winter|christmas|easter|weekend|week|weeks|month|months|year|years|decade|hour|hours|minute|minutes|moment|o'clock|always|never|often|sometimes|usually|once|twice|again|already|soon|later|earlier|ago|since|until|before (?:pudding|dinner|lunch|supper|breakfast|dark|daylight)|after (?:pudding|dinner|lunch|supper|breakfast|dark)|in (?:his|her|my|their|our) (?:life|lives|youth)|(?:19|20)\d\d|\d{1,2}(?::\d\d)?\s?(?:am|pm))\b/i;
export const whenByRule = (s) => (WHEN_RE.test(s.replace(/["“][^"”]*["”]/g, ' ')) ? 1 : 0);

export function ruleFeatures(s) {
  const n = words(s);
  const quoted = /["“][^"”]*["”]/.test(s);
  const narr = s.replace(/["“][^"”]*["”]/g, ' ');
  const devices = [];
  if (/\b(?:like a|like an|like the|like someone|as if|as though)\b/i.test(narr)) devices.push('simile');
  if (afterthoughtAsides(s).length) devices.push('aside');
  if ((narr.match(/,/g) || []).length >= 3 && /,\s*(?:and|or)\s/.test(narr)) devices.push('list');
  if (n <= 2 && /^[A-Z][a-z]*[.!]$/.test(s.trim()) && !quoted) devices.push('one-word');
  const tag = quoted ? (/["”],?\s+(?:he|she|I|they|we|[A-Z][a-z]+)\s+said\b|\bsaid\s+(?:he|she|I|[A-Z][a-z]+)\b/.test(s) ? 'said'
    : /["”],?\s+(?:he|she|I|they|we|[A-Z][a-z]+)\s+[a-z]+ed\b/.test(s) ? 'other-verb' : 'none') : null;
  return { words: n, band: band(n), opening: opening(s), quoted, tag, ruleDevices: devices, when: whenByRule(s) };
}

export function split(text) {
  const rows = [];
  paragraphsOf(text).forEach((p, pi) => {
    const ss = splitSentences(p);
    ss.forEach((s, si) => rows.push({
      id: rows.length + 1, para: pi + 1, pos: ss.length === 1 ? 'alone' : si === 0 ? 'first' : si === ss.length - 1 ? 'last' : 'middle',
      text: s, ...ruleFeatures(s),
    }));
  });
  return rows;
}

// ---------- label (DeepSeek) ----------
export function labelPrompt(batch, codebook) {
  const paras = [];
  let cur = null;
  for (const r of batch) {
    if (!cur || cur.para !== r.para) { cur = { para: r.para, lines: [] }; paras.push(cur); }
    cur.lines.push(`[${r.id}] ${r.text}`);
  }
  return [
    'You are a careful annotator for a corpus stylistics study of fiction. Label every numbered sentence on every axis, using the codebook below and the paragraph as context. Use only the values listed.',
    '', codebook, '',
    'Also give "tense": past or present; and "person": first, second or third (of the narration).',
    '', 'Answer with one JSON object per line and nothing else, exactly these keys:',
    '{"id":N,"form":"","shape":"","mode":"","st":"","role":"","tense":"","person":"","who":0,"what":0,"when":0,"where":0,"why":0,"how":0,"senses":[],"devices":[]}',
    '', 'Sentences:', '',
    ...paras.map((p) => `Paragraph ${p.para}:\n${p.lines.join('\n')}`),
  ].join('\n');
}

export function parseLabels(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/\{.*\}/);
    if (!m) continue;
    try { const o = JSON.parse(m[0]); if (o.id) out[o.id] = o; } catch { /* skip a bad line */ }
  }
  return out;
}

// Reasoning off by default: with it on, 50 sentences cost 165,000 output tokens and batches overran (6 Nov 2026).
// Set PATINA_THINK=1 to turn it back on.
async function callDeepSeek(prompt, key) {
  const res = await fetch('https://api.primalabs.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
    body: JSON.stringify({ model: 'primalabs-ai/DeepSeek-V4.1-Flash-1017', messages: [{ role: 'user', content: prompt }], max_tokens: 8000, temperature: 0, ...(process.env.PATINA_THINK ? {} : { chat_template_kwargs: { thinking: false } }) }),
  });
  if (!res.ok) throw new Error(`Prima Labs ${res.status}`);
  const j = await res.json();
  return { text: j.choices?.[0]?.message?.content || '', usage: j.usage || {} };
}

// ---------- profile ----------
const share = (rows, f) => { const c = {}; for (const r of rows) { const v = f(r); if (v != null) c[v] = (c[v] || 0) + 1; } const n = rows.length || 1; for (const k in c) c[k] = +(c[k] / n).toFixed(3); return c; };
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

const SCENE_OF = { speech: 'dialogue', event: 'action', description: 'description', sensory: 'description', thought: 'reflection', commentary: 'reflection', summary: 'summary', exposition: 'summary' };
// Scene by rule (codebook v0.3): the most common mode among the paragraph's sentences.
export function deriveScenes(rows) {
  const byPara = {};
  for (const r of rows) if (r.mode) (byPara[r.para] = byPara[r.para] || []).push(SCENE_OF[r.mode]);
  for (const r of rows) {
    const c = {};
    for (const s of byPara[r.para] || []) if (s) c[s] = (c[s] || 0) + 1;
    const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
    if (top) r.scene = top[0];
  }
  return rows;
}

export function profile(rows) {
  rows = deriveScenes(rows.map((r) => ({ ...r })));
  const p = { sentences: rows.length, words: rows.reduce((a, r) => a + r.words, 0) };
  p.meanWords = +(p.words / (rows.length || 1)).toFixed(1);
  p.medianWords = median(rows.map((r) => r.words));
  p.band = share(rows, (r) => r.band);
  p.opening = share(rows.filter((r) => !r.quoted), (r) => r.opening);
  for (const ax of ['form', 'shape', 'mode', 'st', 'role', 'scene']) if (rows.some((r) => r[ax])) p[ax] = share(rows, (r) => r[ax] || null);
  p.lengthBy = {};
  for (const ax of ['form', 'shape', 'mode']) if (p[ax]) { p.lengthBy[ax] = {}; for (const v of Object.keys(p[ax])) p.lengthBy[ax][v] = median(rows.filter((r) => r[ax] === v).map((r) => r.words)); }
  const ws = ['who', 'what', 'when', 'where', 'why', 'how'];
  if (rows.some((r) => r.who != null)) p.ws = Object.fromEntries(ws.map((w) => [w, +(rows.filter((r) => r[w] === 1).length / rows.length).toFixed(3)]));
  const dev = {};
  for (const r of rows) for (const d of new Set([...(r.ruleDevices || []), ...(r.devices || [])])) dev[d] = (dev[d] || 0) + 1;
  p.devicesPer1k = Object.fromEntries(Object.entries(dev).map(([k, v]) => [k, +(v * 1000 / Math.max(p.words, 1)).toFixed(2)]));
  // paragraph closers and openers (the button cadence lives here)
  const multi = rows.filter((r) => r.pos !== 'alone');
  p.lastRole = share(multi.filter((r) => r.pos === 'last'), (r) => r.role || null);
  p.lastMode = share(multi.filter((r) => r.pos === 'last'), (r) => r.mode || null);
  p.aloneShare = +(rows.filter((r) => r.pos === 'alone').length / (rows.length || 1)).toFixed(3);
  // transitions and runs
  p.transitions = {}; p.runs = {};
  for (const ax of ['shape', 'mode', 'st', 'role', 'band', 'opening']) {
    if (!rows.some((r) => r[ax])) continue;
    const t = {};
    for (let i = 1; i < rows.length; i++) { const a = rows[i - 1][ax], b = rows[i][ax]; if (a && b) { t[a] = t[a] || {}; t[a][b] = (t[a][b] || 0) + 1; } }
    for (const a in t) { const tot = Object.values(t[a]).reduce((x, y) => x + y, 0); for (const b in t[a]) t[a][b] = +(t[a][b] / tot).toFixed(2); }
    p.transitions[ax] = t;
    let run = 1, runs3 = 0;
    for (let i = 1; i < rows.length; i++) { if (rows[i][ax] && rows[i][ax] === rows[i - 1][ax]) { run++; if (run === 3) runs3++; } else run = 1; }
    p.runs[ax] = +(runs3 * 100 / (rows.length || 1)).toFixed(2); // runs of 3+ per 100 sentences
  }
  // per scene mode
  if (p.scene) {
    p.byScene = {};
    for (const sc of Object.keys(p.scene)) {
      const rs = rows.filter((r) => r.scene === sc);
      if (rs.length < 8) continue;
      p.byScene[sc] = { sentences: rs.length, meanWords: +(rs.reduce((a, r) => a + r.words, 0) / rs.length).toFixed(1), mode: share(rs, (r) => r.mode || null), shape: share(rs, (r) => r.shape || null), st: share(rs, (r) => r.st || null), form: share(rs, (r) => r.form || null) };
    }
  }
  if (rows.some((r) => r.anat)) p.L1 = anatomyProfile(rows.filter((r) => r.anat).map((r) => r.anat));
  return p;
}

// ---------- Copybook L1 Anatomy: grammar, vocabulary position, lexis, splits ----------
// Template repetition after Shaib et al. (EMNLP 2024): compression ratio of the part-of-speech sequence. Higher means
// the same tag patterns repeat. Measured in windows of 100 sentences so chapter length does not drive it.
export function templateRepetition(posSeqs, win = 100) {
  const out = [];
  for (let i = 0; i + win <= posSeqs.length || (i === 0 && posSeqs.length); i += win) {
    const s = posSeqs.slice(i, i + win).join(' | ');
    const z = deflateRawSync(Buffer.from(s));
    out.push(s.length / z.length);
    if (i + win > posSeqs.length) break;
  }
  return out.length ? +(out.reduce((a, b) => a + b, 0) / out.length).toFixed(3) : null;
}

export function anatomyProfile(as) {
  const n = as.length || 1;
  const mean = (f) => { const v = as.map(f).filter((x) => x != null && !Number.isNaN(x)); return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(3) : null; };
  const med = (f) => { const v = as.map(f).filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
  const sh = (f) => +(as.filter(f).length / n).toFixed(3);
  const cat = (f) => { const c = {}; for (const a of as) { const v = f(a); if (v != null) c[v] = (c[v] || 0) + 1; } for (const k in c) c[k] = +(c[k] / n).toFixed(3); return c; };
  const L = {};
  // 1. clause architecture
  for (const k of ['nClauses', 'subordinate', 'coordinate', 'participial', 'nominal', 'rare', 'verbs']) L[`mean.${k}`] = mean((a) => a[k]);
  for (const t of ['adverbial', 'relative', 'adnominal', 'complement', 'open-complement', 'coordinated', 'parataxis']) L[`has.${t}`] = sh((a) => (a.clauses || {})[t] > 0);
  L['share.subordinateOverCoordinate'] = (() => { const s = as.reduce((x, a) => x + a.subordinate, 0), c = as.reduce((x, a) => x + a.coordinate, 0); return +((s + 1) / (c + 1)).toFixed(3); })();
  // 2. branching and the verb
  for (const k of ['beforeVerb', 'verbAt', 'depth', 'depLen']) L[`mean.${k}`] = mean((a) => a[k]);
  L['share.verbInFirstThird'] = sh((a) => a.verbAt < 0.34);
  // 3. Theme
  for (const [k, v] of Object.entries(cat((a) => a.theme))) L[`theme.${k}`] = v;
  // 4. end-weight and where the vocabulary sits
  L['median.endWeight'] = med((a) => a.endWeight);
  for (const [k, v] of Object.entries(cat((a) => a.rarestAt))) L[`rarestAt.${k}`] = v;
  // 5. phrases
  for (const k of ['npMax', 'adjStack', 'prepChain']) L[`mean.${k}`] = mean((a) => a[k]);
  L['share.adjStack2'] = sh((a) => a.adjStack >= 2);
  L['share.prepChain2'] = sh((a) => a.prepChain >= 2);
  // 6. verbs
  for (const [k, v] of Object.entries(cat((a) => a.process))) L[`process.${k}`] = v;
  for (const k of ['passive', 'progressive', 'perfect', 'modal']) L[`share.${k}`] = sh((a) => a[k]);
  // 7. lexis
  for (const k of ['density', 'zipf', 'latinate', 'wordLen']) L[`mean.${k}`] = mean((a) => a[k]);
  L['share.hasRareWord'] = sh((a) => a.rare > 0);
  // 8. splits
  L['mean.segments'] = mean((a) => a.segments);
  for (const [k, v] of Object.entries(cat((a) => (a.segments >= 4 ? '4+' : String(a.segments))))) L[`segments.${k}`] = v;
  L['mean.segLen'] = mean((a) => (a.segLens && a.segLens.length ? a.segLens.reduce((x, y) => x + y, 0) / a.segLens.length : null));
  for (const k of ['semicolon', 'colon', 'dash']) L[`share.${k}`] = sh((a) => a[k] > 0);
  L['share.modInitial'] = sh((a) => (a.modifiers || []).includes('initial'));
  L['share.modFinal'] = sh((a) => (a.modifiers || []).includes('final'));
  // 8b. introductory commas (Nathan, 6 Nov 2026; books: clause 77%, phrase of 2+ words 81% to 94%, one word 29%)
  const intro = (f) => { const v = as.filter((a) => a.intro && f(a.intro)); return v.length >= 3 ? +(v.filter((a) => a.intro.comma).length / v.length).toFixed(3) : null; };
  L['introComma.clause'] = intro((i) => i.kind === 'clause');
  L['introComma.phrase2plus'] = intro((i) => i.kind === 'phrase' && i.words >= 2);
  L['introComma.oneWord'] = intro((i) => i.kind === 'phrase' && i.words === 1);
  // 9. templates
  L['templates.compression'] = templateRepetition(as.map((a) => a.pos));
  // 10. cohesion
  L['cohesion.pronounStart'] = sh((a) => a.cohesion && a.cohesion.pronounStart);
  L['cohesion.marker'] = sh((a) => a.cohesion && a.cohesion.marker);
  L['cohesion.conjStart'] = sh((a) => a.cohesion && a.cohesion.conjStart);
  L['cohesion.overlap'] = sh((a) => a.cohesion && a.cohesion.overlap > 0);
  return L;
}

// Flatten a profile into "axis.value" -> number for ranges and comparison.
export function flat(p) {
  const out = { meanWords: p.meanWords, aloneShare: p.aloneShare };
  for (const ax of ['band', 'opening', 'form', 'shape', 'mode', 'st', 'role', 'lastRole', 'lastMode', 'ws', 'devicesPer1k', 'runs']) for (const [k, v] of Object.entries(p[ax] || {})) out[`${ax}.${k}`] = v;
  for (const [k, v] of Object.entries(p.L1 || {})) if (v != null) out[`L1.${k}`] = v;
  // Per scene mode (Nathan: scenes lean on different sentences), e.g. "dialogue/form.fragment".
  for (const [sc, s] of Object.entries(p.byScene || {})) {
    out[`${sc}/meanWords`] = s.meanWords;
    for (const ax of ['mode', 'form', 'st', 'shape']) for (const [k, v] of Object.entries(s[ax] || {})) out[`${sc}/${ax}.${k}`] = v;
  }
  return out;
}

export function reference(profiles) {
  const flats = profiles.map(flat);
  const keys = [...new Set(flats.flatMap((f) => Object.keys(f)))];
  const ref = { n: profiles.length, ranges: {} };
  for (const k of keys) {
    // Per-scene keys only count texts that have that scene (absent is not zero).
    const sceneOf = k.includes('/') ? k.split('/')[0] : null;
    const pool = sceneOf ? flats.filter((f) => f[`${sceneOf}/meanWords`] != null) : flats;
    if (sceneOf && pool.length < 3) continue;
    const vals = pool.map((f) => f[k] ?? 0).sort((a, b) => a - b);
    const q = (x) => vals[Math.min(vals.length - 1, Math.max(0, Math.round(x * (vals.length - 1))))];
    ref.ranges[k] = pool.length >= 5 ? { lo: q(0.1), hi: q(0.9), median: q(0.5) } : { lo: vals[0], hi: vals[vals.length - 1], median: q(0.5) };
  }
  return ref;
}

export function compare(draftProfile, ref, { slack = 0.25 } = {}) {
  const f = flat(draftProfile);
  const out = [];
  // A value the human texts never use still counts: its range is zero to zero.
  const has = (k) => !k.includes('/') || f[`${k.split('/')[0]}/meanWords`] != null;
  const keys = [...new Set([...Object.keys(ref.ranges), ...Object.keys(f).filter((k) => f[k] > 0)])].filter((k) => has(k) && (ref.ranges[k] || !k.includes('/') || ref.ranges[`${k.split('/')[0]}/meanWords`]));
  for (const k of keys) {
    const r = ref.ranges[k] || { lo: 0, hi: 0, median: 0 };
    const v = f[k] ?? 0;
    const width = Math.max(r.hi - r.lo, Math.abs(r.median) * slack, k.startsWith('meanWords') ? 1.5 : 0.02);
    const lo = r.lo - width * slack, hi = r.hi + width * slack;
    if (v < lo || v > hi) out.push({ key: k, value: v, lo: r.lo, hi: r.hi, median: r.median, dir: v > hi ? 'high' : 'low', off: +(v > hi ? (v - r.hi) / (width || 1) : (r.lo - v) / (width || 1)).toFixed(2) });
  }
  return out.sort((a, b) => b.off - a.off);
}

// ---------- agreement (Cohen's kappa, 1960) between two coders, per axis ----------
export function kappa(a, b) {
  const n = a.length;
  if (!n) return null;
  const cats = [...new Set([...a, ...b])];
  const po = a.filter((x, i) => x === b[i]).length / n;
  const pe = cats.reduce((s, c) => s + (a.filter((x) => x === c).length / n) * (b.filter((x) => x === c).length / n), 0);
  return pe === 1 ? 1 : +((po - pe) / (1 - pe)).toFixed(2);
}
export function agreement(rowsA, rowsB) {
  const byId = Object.fromEntries(rowsB.map((r) => [r.id, r]));
  const out = {};
  for (const ax of ['form', 'shape', 'mode', 'st', 'role', 'scene', 'who', 'what', 'when', 'where', 'why', 'how']) {
    const pairs = rowsA.filter((r) => r[ax] != null && byId[r.id] && byId[r.id][ax] != null).map((r) => [String(r[ax]), String(byId[r.id][ax])]);
    if (pairs.length) out[ax] = { n: pairs.length, agree: +(pairs.filter(([x, y]) => x === y).length / pairs.length).toFixed(2), kappa: kappa(pairs.map((p) => p[0]), pairs.map((p) => p[1])) };
  }
  return out;
}

// ---------- CLI ----------
function readKey(argv) {
  if (process.env.PRIMALABS_API_KEY) return process.env.PRIMALABS_API_KEY.trim();
  const i = argv.indexOf('--key-file');
  if (i < 0) throw new Error('set PRIMALABS_API_KEY or pass --key-file <path>');
  return readFileSync(argv[i + 1], 'utf8').trim();
}
const readJsonl = (f) => readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));

async function main(argv) {
  const [cmd, file] = argv;
  const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
  if (cmd === 'split') {
    const rows = split(readFileSync(file, 'utf8'));
    const txt = rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
    if (arg('out')) writeFileSync(arg('out'), txt); else process.stdout.write(txt);
    console.error(`split: ${rows.length} sentences in ${new Set(rows.map((r) => r.para)).size} paragraphs`);
    return 0;
  }
  if (cmd === 'label') {
    const out = arg('out');
    if (!out) throw new Error('label needs --out <file.jsonl>');
    const key = readKey(argv);
    const codebook = readFileSync(join(HERE, '..', 'craft', 'sentence-codebook.md'), 'utf8').replace(/^# .*\n\n.*\n/, '');
    let rows = split(readFileSync(file, 'utf8'));
    const cached = existsSync(out) ? Object.fromEntries(readJsonl(out).filter((r) => r.mode).map((r) => [r.text + '|' + r.para, r])) : {};
    rows = rows.map((r) => cached[r.text + '|' + r.para] || r);
    const size = +arg('batch', 30);
    let tin = 0, tout = 0;
    for (let i = 0; i < rows.length; i += size) {
      const batch = rows.slice(i, i + size);
      if (batch.every((r) => r.mode)) continue;
      for (let attempt = 0; attempt < 2; attempt++) {
        let reply;
        for (let tries = 0; tries < 4 && !reply; tries++) {
          try { reply = await callDeepSeek(labelPrompt(batch, codebook), key); }
          catch (e) { console.error(`label: ${e.message}; retrying`); await new Promise((r) => setTimeout(r, 5000 * (tries + 1))); }
        }
        if (!reply) throw new Error('Prima Labs failed 4 times; rerun to resume (labels so far are cached)');
        const { text, usage } = reply;
        tin += usage.prompt_tokens || 0; tout += usage.completion_tokens || 0;
        const labels = parseLabels(text);
        for (const r of batch) if (labels[r.id]) Object.assign(r, labels[r.id], { id: r.id, when: whenByRule(r.text) });
        if (batch.filter((r) => r.mode).length >= batch.length * 0.9) break;
      }
      writeFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
      console.error(`label: ${Math.min(i + size, rows.length)}/${rows.length} sentences`);
    }
    console.error(`label: done, ${rows.filter((r) => r.mode).length}/${rows.length} labelled; tokens in ${tin}, out ${tout}`);
    return 0;
  }
  if (cmd === 'profile') {
    const p = profile(readJsonl(file));
    console.log(JSON.stringify(p, null, 2));
    return 0;
  }
  if (cmd === 'reference') {
    const files = argv.slice(1).filter((a, i, all) => !a.startsWith('--') && !(all[i - 1] || '').startsWith('--'));
    const ref = reference(files.map((f) => profile(readJsonl(f))));
    if (arg('agreement')) ref.agreement = JSON.parse(readFileSync(arg('agreement'), 'utf8'));
    ref.sources = files.map((f) => f.split(/[\\/]/).pop());
    writeFileSync(arg('out'), JSON.stringify(ref, null, 2));
    console.log(`reference: ${ref.n} texts, ${Object.keys(ref.ranges).length} measures -> ${arg('out')}${ref.n < 8 ? ' (INDICATIVE: fewer than 8 human chapters)' : ''}`);
    return 0;
  }
  if (cmd === 'compare') {
    const rows = readJsonl(file);
    const ref = JSON.parse(readFileSync(arg('reference'), 'utf8'));
    const weak = new Set(Object.entries(ref.agreement || {}).filter(([, v]) => v.kappa < 0.6).map(([k]) => k));
    const all = compare(profile(rows), ref);
    const axisOf = (k) => k.replace(/^[a-z]+\//, '').split('.')[0].replace(/^last(Role|Mode)$/, (m, x) => x.toLowerCase());
    const diffs = all.filter((d) => !weak.has(axisOf(d.key)) && !(d.key.startsWith('ws.') && weak.has(d.key.slice(3))));
    const soft = all.filter((d) => !diffs.includes(d));
    console.log(`Sentence matrix: ${file} against ${ref.n} human texts${ref.n < 8 ? ' (indicative only)' : ''}. ${diffs.length} measures outside the human range.`);
    for (const d of diffs.slice(0, +arg('top', 20))) {
      const [ax, val] = d.key.split('.');
      const ex = val && rows.filter((r) => String(r[ax === 'lastRole' ? 'role' : ax === 'lastMode' ? 'mode' : ax]) === val).slice(0, 2).map((r) => r.text.slice(0, 90));
      console.log(`  ${d.key.padEnd(30)} ${String(d.value).padEnd(7)} human ${d.lo} to ${d.hi} (${d.dir})${ex && ex.length && d.dir === 'high' ? '  e.g. ' + ex.join(' | ') : ''}`);
    }
    if (soft.length) console.log(`Indicative only (coders agree under kappa 0.6 on ${[...weak].join(', ')}): ${soft.map((d) => `${d.key} ${d.value} (human ${d.lo} to ${d.hi})`).join('; ')}`);
    return 0;
  }
  if (cmd === 'agree') {
    const A = readJsonl(file);
    const paraOf = Object.fromEntries(A.map((r) => [r.id, r.para]));
    const B = readJsonl(argv[2]).map((r) => ({ ...r, para: r.para ?? paraOf[r.id] }));
    const r = agreement(deriveScenes(A), deriveScenes(B));
    if (arg('save')) writeFileSync(arg('save'), JSON.stringify(r, null, 2));
    for (const [ax, v] of Object.entries(r)) console.log(`${ax.padEnd(6)} n ${v.n}  agree ${v.agree}  kappa ${v.kappa}${v.kappa < 0.6 ? '  BELOW 0.6: merge or sharpen the categories' : ''}`);
    return 0;
  }
  throw new Error('commands: split, label, profile, reference, compare, agree');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error('sentences: ' + e.message); process.exit(2); });
}
