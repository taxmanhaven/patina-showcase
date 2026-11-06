#!/usr/bin/env node
// Patina checker (G1 tells scan, G4 blind packet and score).
// Usage:
//   node patina.mjs check <file> --profile fiction|web|captions|email|ui [--json] [--protect <file>]
//   node patina.mjs packet --ours <file> --ours-era <year> --human <file> [--human-era <year>] --control <file> --out <dir> [--n 4] [--size 150] [--seed 7]
//   node patina.mjs score --key <dir>/SEALED-KEY.json --picks <file>
//   node patina.mjs batch <copy.mjs|strings.json|list.txt> [--report out.md] [--all] [--json] [--budgets <json>]
//   node patina.mjs corpus            (check every corpus file has source, licence, kind and era)
//   node patina.mjs anchors --kind fiction [--n 3]   (mentor passages for G3)
//   G3b (optional, off by default):
//   node patina.mjs lock <file> --out <lock.json>
//   node patina.mjs fidelity --original <file> --candidate <file> --lock <lock.json> --answers <json> --out <dir>
//   node patina.mjs pick --original <file> --gated <dir>/gated.md --key <dir>/SEALED-KEY.json --picks <file> --out <file>
// Exit codes: 0 pass, 1 gate fail, 2 usage error.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const TELLS = JSON.parse(readFileSync(join(HERE, 'tells.json'), 'utf8'));
export const VERSION = TELLS.version;

const UI_BUDGETS = { title: 8, button: 3, help: 20 };

export function countWords(s) {
  return (s.match(/[A-Za-z0-9’'-]+/g) || []).length;
}

// Blank out markdown headings and table rows so indices still map to the right line.
function maskMarkdown(text) {
  return text.replace(/^(#.*|\|.*|-{3,}\s*)$/gm, (m) => ' '.repeat(m.length));
}

function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return starts;
}

function lineOf(starts, idx) {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= idx) lo = mid; else hi = mid - 1;
  }
  return lo + 1;
}

export function sentences(text) {
  const flat = text.replace(/\s*\n\s*/g, ' ');
  // Do not split before a dialogue tag ('"What list?" I said.').
  return flat.split(/(?<=[.!?]["”)*]?)\s+(?=["“(*]?[A-Z])(?![A-Z][a-z]*\s+(?:said|asked|says|asks)\b)/).map((s) => s.trim()).filter(Boolean);
}

const isDialogue = (s) => /["“”]/.test(s);

export function rhythm(text) {
  const narr = sentences(text).filter((s) => !isDialogue(s));
  const lens = narr.map(countWords).filter((n) => n > 0);
  if (lens.length < 5) return { sentences: lens.length, mean: 0, cv: null, staccatoRuns: [], sameOpenings: [] };
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length);
  const staccatoRuns = [];
  let run = [];
  for (const s of narr) {
    if (countWords(s) <= 4) run.push(s);
    else { if (run.length >= 3) staccatoRuns.push(run.join(' ')); run = []; }
  }
  if (run.length >= 3) staccatoRuns.push(run.join(' '));
  const sameOpenings = [];
  const first = (s) => (s.match(/[A-Za-z']+/) || [''])[0].toLowerCase();
  // One entry per run of 3 or more sentences with the same first word.
  let start = 0;
  for (let i = 1; i <= narr.length; i++) {
    if (i < narr.length && first(narr[i]) && first(narr[i]) === first(narr[start])) continue;
    if (i - start >= 3) sameOpenings.push(narr.slice(start, i).join(' '));
    start = i;
  }
  // Wikipedia's mid-2026 sign: sentences held in a strict 8 to 20 word band. Human and our texts measured 0.35 to 0.48 (2 Nov 2026).
  const bandShare = +(lens.filter((n) => n >= 8 && n <= 20).length / lens.length).toFixed(2);
  return { sentences: lens.length, mean: +mean.toFixed(1), cv: +(sd / mean).toFixed(2), bandShare, staccatoRuns, sameOpenings };
}

// Checkable specifics: digits, number words, money, quoted speech, capitalised words mid-sentence.
export function specifics(text) {
  const nums = (text.match(/\b\d[\d,.:]*\b|£\d|\$\d|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty|fifty|hundred|thousand)\b/gi) || []).length;
  const quotes = (text.match(/["“][^"”]{3,}["”]/g) || []).length;
  const proper = (text.match(/(?<=[a-z,;] )[A-Z][a-z]+/g) || []).length;
  return nums + quotes + proper;
}

function compile(rule) {
  return new RegExp(rule.re, rule.flags || 'g');
}

function applies(rule, profile) {
  return !rule.profiles || rule.profiles.includes(profile);
}

function scanText(text, profile, offsetLine = 0) {
  const masked = maskMarkdown(text);
  const starts = lineStarts(masked);
  const hits = [];
  for (const rule of TELLS.rules) {
    if (!applies(rule, profile)) continue;
    const re = compile(rule);
    if (!re.global) continue;
    let m;
    while ((m = re.exec(masked)) !== null) {
      if (m[0].length === 0) { re.lastIndex++; continue; }
      const lead = m[0].match(/^[.!?]?\s*/)[0].length;
      hits.push({
        line: lineOf(starts, m.index + lead) + offsetLine,
        rule: rule.id,
        family: rule.family,
        weight: rule.weight,
        excerpt: m[0].trim().slice(0, 120),
        hint: rule.hint,
      });
    }
  }
  return hits;
}

function readProtected(path) {
  if (!path) return [];
  return readFileSync(path, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

// Short profiles (captions, ui): each non-empty line is one unit (a card or a string).
function checkUnits(text, profile, cfg) {
  const lines = text.split(/\r?\n/);
  const units = [];
  const hits = [];
  lines.forEach((raw, i) => {
    let line = raw.trim();
    if (!line || line.startsWith('#')) return;
    let kind = null;
    const pre = line.match(/^(title|button|help|error):\s*/i);
    if (pre) { kind = pre[1].toLowerCase(); line = line.slice(pre[0].length); }
    const parts = cfg.linesPerCard ? line.split(/\s+\/\s+/) : [line];
    const unitHits = scanText(line, profile, i);
    const unit = { line: i + 1, text: line, parts, kind, hits: unitHits };
    // S3 bare negative: a short line that only says what did not happen ("It didn't guess").
    // v0.7 H2: only a pronoun subject plus a negated verb, one clause. Human litotes ("Never knowingly undersold"),
    // imperatives ("Don't leave home without it") and two-clause lines ("Once you pop, you can't stop") pass.
    if ((cfg.unitChecks || []).includes('bare-negative') && parts.length === 1 && countWords(line) <= 6
      && /^\s*(?:It|This|That|They|He|She|We)\s+(?:\w+n['’]t|never|did not|does not|do not|is not|was not)\b/.test(line)
      && !/,/.test(line) && sentences(line).length <= 1 && !/\bbut\b/i.test(line)) {
      unitHits.push({ line: i + 1, rule: 'bare-negative', family: 'bare-negative', weight: 3, excerpt: line, hint: 'Say what it does, not only what it did not do.' });
    }
    // Word budgets
    if (cfg.linesPerCard) {
      parts.forEach((p) => {
        if (countWords(p) > cfg.lineWords) unitHits.push({ line: i + 1, rule: 'budget-line', family: 'budget', weight: 2, excerpt: p, hint: `Over ${cfg.lineWords} words on one line.` });
      });
      if (parts.length > cfg.linesPerCard) unitHits.push({ line: i + 1, rule: 'budget-card', family: 'budget', weight: 2, excerpt: line, hint: `More than ${cfg.linesPerCard} lines on screen.` });
      if (parts.length === 2 && /,\s*$/.test(parts[0]) && countWords(parts[1]) <= 3) {
        unitHits.push({ line: i + 1, rule: 'drumroll-split', family: 'drumroll-split', weight: 1.5, excerpt: line, hint: 'The second line pays off the first like a slogan. Say it as one plain sentence, or let the picture say it.' });
      }
    } else {
      const budget = kind === 'error' ? null : (UI_BUDGETS[kind] || cfg.lineWords);
      if (budget && countWords(line) > budget) unitHits.push({ line: i + 1, rule: 'budget-' + (kind || 'line'), family: 'budget', weight: 2, excerpt: line, hint: `Over the ${budget}-word budget.` });
      if (kind === 'error' && sentences(line).length > 2) unitHits.push({ line: i + 1, rule: 'budget-error', family: 'budget', weight: 2, excerpt: line, hint: 'Errors: 2 sentences at most.' });
    }
    units.push(unit);
    hits.push(...unitHits);
  });
  // Same shape: 3 or more units in a row with one shape (line count, comma split, question mark, ending).
  const shape = (u) => `${u.parts.length}|${u.parts.map((p) => (/,\s*$/.test(p) ? ',' : /\?\s*$/.test(p) ? '?' : '.')).join('')}|${u.parts.length > 1 && countWords(u.parts[1]) <= 3 ? 'short2' : ''}`;
  for (let i = 2; i < units.length; i++) {
    const s = shape(units[i]);
    if (units[i].parts.length > 1 && s === shape(units[i - 1]) && s === shape(units[i - 2])) {
      hits.push({ line: units[i].line, rule: 'same-shape', family: 'same-shape', weight: 1.5, excerpt: units.slice(i - 2, i + 1).map((u) => u.text).join(' | '), hint: 'Three cards in a row share one shape. Vary them, or cut one.' });
    }
  }
  return { units, hits };
}

// S6 design-language leak: a project's own style words in copy a customer or narrator speaks.
export function readGlossary(path) {
  return readFileSync(path, 'utf8').split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim().toLowerCase()).filter(Boolean);
}

function glossaryHits(text, words) {
  const hits = [];
  const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const re = new RegExp(`\\b(?:${words.map(esc).join('|')})\\b`, 'gi');
  text.split(/\r?\n/).forEach((l, i) => {
    for (const m of l.matchAll(re)) hits.push({ line: i + 1, rule: 'design-leak', family: 'design-leak', weight: 3, excerpt: m[0], hint: 'Design-language word in spoken copy. Use the word the customer uses (files, price list, terms).' });
  });
  return hits;
}

// ---------- Afterthought aside (v0.7.2; Nathan via Luke Studio, 6 Nov 2026) ----------
// A 1 to 4 word adverbial slipped in after a comma in narration, as if remembered on the way: ", once,",
// ", left side,", ", firmly,", "The remote, one hand." (an afterthought or amplificatory tag: Quirk et al.,
// A Comprehensive Grammar of the English Language, 1985). One reads human; as a habit it is a cadence, "like
// saying btw every couple of sentences". The predictability map cannot see it (each one is a rare word), so it is
// counted by form. Dialogue is exempt. Noun descriptions, verb series, absolutes and lists are not asides.
// Calibrated 6 Nov 2026: Third Pot v0.6 before the fix 14 (Luke counted about 15), after 1; Cather 0; AI control 2.6 per 1,000.
const ASIDE_STOP = /^(?:and|or|but|nor|the|a|an|my|his|her|their|our|your|its|this|that|these|those|which|who|whom|whose|where|when|while|if|because|as|though|although|since|until|unless|like|with|without|for|from|to|in|on|at|by|of|after|before|i|he|she|they|we|you|it|there|just|too|however|perhaps|maybe|please|thanks|yes|no|oh|well|sir|mum|dad)\b/i;
const ASIDE_SAID = /\b(?:said|says|asked|asks|replied|told|called|shouted|whispered|added|went on)\b/i;
const ASIDE_ADV = /^(?:once|twice|again|ideally|left|right|one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty|half|both|each|every|more|less|very|almost|nearly|mostly|roughly|exactly|about|never|always|sometimes|apparently|unprompted|obviously|naturally|frankly|honestly|anyway|regardless|otherwise|instead|alone|together|first|last|later|earlier|today|tonight|yesterday|tomorrow|already)$/;
const LY_ADJ = /^(?:only|early|lovely|ugly|lonely|silly|holy|curly|crinkly|lively|likely|unlikely|friendly|family|daily|weekly|monthly|yearly|elderly|smelly|jolly|belly|bully|rally|ally|fly|reply|supply|apply|july|italy|wobbly|chilly|hilly|bubbly|cuddly|deadly|costly|kindly|orderly|surly|burly|gangly|portly|sickly|stately|unruly|ungainly|homely|comely|heavenly|worldly|ghostly|beastly|cowardly|scholarly|leisurely|motherly|fatherly|brotherly|sisterly|neighbourly|neighborly|manly|godly|saintly|timely|lowly|measly|prickly|bristly|grisly|holly|jelly|rely)$/;

export function afterthoughtAsides(text) {
  const out = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    if (/^\s*(?:#|\||>)/.test(raw)) return;
    const line = raw.replace(/"[^"\n]*"|“[^”\n]*”/g, '"Q"');
    const re = /,\s+([^,.;:!?"“”()\n]{1,40}?)(?=\s*(?:,|\.(?:\s|$)))/g;
    let m;
    while ((m = re.exec(line))) {
      const seg = m[1].trim();
      const w = seg.split(/\s+/);
      if (w.length > 4 || ASIDE_STOP.test(seg) || ASIDE_SAID.test(seg) || /^\w+ing\b/i.test(seg) || seg.includes('Q')) continue;
      const after = line.slice(m.index + m[0].length);
      if (/^\s*,\s*(?:and|or)\s+[^,.\s]+(?:\s+[^,.\s]+){0,2}\s*[.,]/i.test(after) && w.length <= 2) continue; // tail of a short list
      const first = w[0].toLowerCase();
      if (!((/^[a-z]+ly$/.test(first) && !LY_ADJ.test(first)) || ASIDE_ADV.test(first))) continue;
      out.push({ line: i + 1, excerpt: seg });
    }
  });
  return out;
}

export function check(text, profile, opts = {}) {
  const cfg = TELLS.profiles[profile];
  if (!cfg) throw new Error(`Unknown profile "${profile}". Use: ${Object.keys(TELLS.profiles).join(', ')}`);
  const protectedLines = opts.protect || [];
  const words = countWords(maskMarkdown(text));
  let hits;
  let units = null;
  if (cfg.perUnit) ({ units, hits } = checkUnits(text, profile, cfg));
  else hits = scanText(text, profile);
  if (cfg.glossary && opts.glossary && opts.glossary.length) hits.push(...glossaryHits(text, opts.glossary));
  const asides = cfg.asides ? afterthoughtAsides(text) : [];
  for (const a of asides) hits.push({ line: a.line, rule: 'afterthought-aside', family: 'afterthought-aside', weight: 0.5, excerpt: a.excerpt, hint: 'Afterthought aside. Fine once a page; as a habit it is a cadence ("btw every couple of sentences"). Fold it into the sentence, give it its own sentence, or cut it.' });

  const srcLines = text.split(/\r?\n/);
  for (const h of hits) h.lamp = TELLS.lamp.families[h.family] || 'House rule';
  for (const h of hits) h.protected =protectedLines.some((p) => srcLines[h.line - 1] && srcLines[h.line - 1].includes(p));
  const live = hits.filter((h) => !h.protected);

  const fails = [];
  // Hard fails
  for (const fam of cfg.hard) {
    const n = live.filter((h) => h.family === fam).length;
    if (n) fails.push(`hard: ${fam} x${n}`);
  }
  // Score
  let score;
  if (cfg.perUnit) {
    const per = {};
    for (const h of live) per[h.line] = (per[h.line] || 0) + h.weight;
    score = Math.max(0, ...Object.values(per));
  } else {
    const total = live.reduce((a, h) => a + h.weight, 0);
    score = (total * 100) / Math.max(words, 100);
  }
  score = +score.toFixed(2);
  if (score > cfg.ceiling) fails.push(`score ${score} over ceiling ${cfg.ceiling}`);
  // Never two afterthought asides in one paragraph (one surprise repeated becomes a cadence).
  const perLine = {};
  for (const h of live.filter((x) => x.family === 'afterthought-aside')) perLine[h.line] = (perLine[h.line] || 0) + 1;
  const pairs = Object.entries(perLine).filter(([, n]) => n >= 2).map(([l]) => 'L' + l);
  if (pairs.length) fails.push(`two afterthought asides in one paragraph: ${pairs.join(', ')}`);
  // Doses (per 1,000 words)
  const doses = {};
  for (const [fam, max] of Object.entries(cfg.doses || {})) {
    const n = live.filter((h) => h.family === fam).length;
    const per1k = +((n * 1000) / Math.max(words, 1000)).toFixed(2);
    doses[fam] = { count: n, per1k, max };
    if (per1k > max) fails.push(`dose: ${fam} ${per1k} per 1,000 words (max ${max})`);
  }
  // Measures
  const measures = {};
  if ((cfg.measure || []).includes('rhythm')) {
    const r = rhythm(text);
    measures.rhythm = r;
    if (r.cv !== null && r.cv < cfg.cvFloor) fails.push(`rhythm: sentence length variation ${r.cv} under ${cfg.cvFloor}`);
    if (r.sentences >= 15 && r.bandShare >= 0.75) fails.push(`band: ${Math.round(r.bandShare * 100)}% of sentences sit in the 8 to 20 word band (the mid-2026 accent); let some run long and some stop short`);
    if ((cfg.measure || []).includes('staccato') && r.staccatoRuns.length > Math.max(2, Math.floor(words / 1500))) fails.push(`staccato: ${r.staccatoRuns.length} runs of 3+ very short sentences`);
  }
  if ((cfg.measure || []).includes('specificity')) {
    const n = specifics(text);
    const need = Math.max(1, Math.floor(words / cfg.specificPerWords));
    measures.specificity = { found: n, need };
    if (n < need) fails.push(`specificity: ${n} checkable specifics, need ${need}`);
  }
  if (cfg.minWords && words < cfg.minWords) fails.push(`length: ${words} words, under ${cfg.minWords}`);
  if (cfg.maxWords && words > cfg.maxWords) fails.push(`length: ${words} words, over ${cfg.maxWords}`);

  hits.sort((a, b) => a.line - b.line || b.weight - a.weight);
  // G3 works by LAMP category (Chakrabarty, Laban and Wu, CHI 2025), so count live hits per category.
  const lamp = {};
  for (const h of live) lamp[h.lamp] = (lamp[h.lamp] || 0) + 1;
  return { version: VERSION, profile, words, score, ceiling: cfg.ceiling, pass: fails.length === 0, fails, doses, measures, lamp, hits, units: units ? units.length : undefined };
}

export function formatReport(file, r) {
  const out = [];
  out.push(`Patina ${r.version} G1 tells scan: ${file} (profile ${r.profile}, ${r.words} words${r.units ? `, ${r.units} units` : ''})`);
  out.push(`  score ${r.score} (ceiling ${r.ceiling})${r.measures.rhythm ? `; sentence length mean ${r.measures.rhythm.mean}, variation ${r.measures.rhythm.cv}, in the 8 to 20 word band ${r.measures.rhythm.bandShare}` : ''}${r.measures.specificity ? `; specifics ${r.measures.specificity.found} (need ${r.measures.specificity.need})` : ''}`);
  for (const [fam, d] of Object.entries(r.doses)) if (d.count) out.push(`  dose ${fam}: ${d.count} (${d.per1k} per 1,000, max ${d.max})`);
  const cats = Object.entries(r.lamp);
  if (cats.length) out.push(`  LAMP categories: ${cats.map(([c, n]) => `${c} ${n}`).join('; ')}`);
  for (const h of r.hits) out.push(`  L${String(h.line).padEnd(4)} ${h.rule.padEnd(18)} ${h.protected ? '[protected] ' : ''}"${h.excerpt}"  [${h.lamp}]  -> ${h.hint}`);
  if (r.measures.rhythm) {
    for (const s of r.measures.rhythm.staccatoRuns) out.push(`  staccato run: "${s.slice(0, 100)}"`);
    for (const s of r.measures.rhythm.sameOpenings) out.push(`  same opening x3: "${s.slice(0, 100)}"`);
  }
  out.push(r.pass ? '  G1 PASS (the floor only: known tells are gone; G2 to G5 decide whether it reads human)' : `  G1 FAIL: ${r.fails.join('; ')}`);
  return out.join('\n');
}

// ---------- G4 blind packet ----------
// Expert-like reader (Russell, Karpinska and Iyyer, ACL 2025: frequent AI users stay accurate on humanized text).
export const EXPERT_BRIEF = [
  'You use AI writing tools every day and you are good at spotting AI-written text, including text that has been paraphrased or "humanized". You are hunting for it here.',
  'Some of these excerpts were written by people and some by an AI. You are not told how many of each. For each excerpt, write "N: human" or "N: AI" and a one-line reason.',
  'Then list any single lines, in any excerpt, that read as machine-written, with the excerpt number, and name the fault with one of these categories (Chakrabarty, Laban and Wu, CHI 2025): Cliche; Unnecessary/Redundant Exposition; Purple Prose; Poor Sentence Structure; Lack of Specificity and Detail; Awkward Word Choice and Phrasing; Tense Inconsistency.',
].join('\n\n');
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function excerpts(text, size, n) {
  const paras = maskMarkdown(text).split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p && countWords(p) > 0);
  const chunks = [];
  let cur = [];
  for (const p of paras) {
    cur.push(p);
    if (countWords(cur.join(' ')) >= size) { chunks.push(cur.join('\n\n')); cur = []; }
  }
  if (cur.length && countWords(cur.join(' ')) >= size / 2) chunks.push(cur.join('\n\n'));
  if (chunks.length <= n) return chunks;
  const step = chunks.length / n;
  return Array.from({ length: n }, (_, i) => chunks[Math.floor(i * step)]);
}

// Eras more than this many years apart mean the critic can sort period, not authorship (Third Pot runs, 6 Nov 2026).
export const ERA_GAP = 25;

export function buildPacket({ ours, human, control, n = 4, size = 150, seed = 7, oursEra = null, humanEra = null }) {
  const items = [
    ...excerpts(ours, size, n).map((t) => ({ source: 'ours', t })),
    ...excerpts(human, size, n).map((t) => ({ source: 'human', t })),
    ...excerpts(control, size, n).map((t) => ({ source: 'control', t })),
  ];
  const rnd = mulberry32(seed);
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  const packet = ['# Blind reading packet', '', EXPERT_BRIEF, ''];
  const key = {};
  items.forEach((it, i) => {
    packet.push(`## Excerpt ${i + 1}`, '', it.t, '');
    key[i + 1] = it.source;
  });
  if (oursEra || humanEra) key._meta = { oursEra, humanEra };
  return { packet: packet.join('\n'), key };
}

export function score(key, picksText) {
  const ai = new Set();
  for (const m of picksText.matchAll(/(\d+)\s*[:.)-]\s*(human|ai)\b/gi)) if (m[2].toLowerCase() === 'ai') ai.add(+m[1]);
  const rate = {};
  for (const src of ['ours', 'human', 'control']) {
    const ids = Object.keys(key).filter((k) => k !== '_meta').filter((k) => key[k] === src).map(Number);
    rate[src] = { n: ids.length, markedAI: ids.filter((i) => ai.has(i)).length };
    rate[src].rate = ids.length ? +(rate[src].markedAI / ids.length).toFixed(2) : 0;
  }
  const n = rate.ours.n || 1;
  const voidRun = rate.control.rate < 0.5;
  const meta = key._meta || {};
  const eraGap = meta.oursEra && meta.humanEra ? Math.abs(meta.oursEra - meta.humanEra) : 0;
  const mismatched = rate.human.n > 0 && eraGap > ERA_GAP;
  const partial = rate.human.n === 0 || mismatched;
  // Without a human set of the same kind, G4 cannot pass the text (SPEC v0.2): report an indication only.
  const indicative = !voidRun && rate.ours.rate <= 0.5 && rate.ours.rate < rate.control.rate;
  const pass = !voidRun && !partial && rate.ours.rate <= rate.human.rate + 1 / n && rate.ours.rate < rate.control.rate;
  const verdict = voidRun ? 'VOID: the critic did not catch the control; use another critic'
    : mismatched ? `G4 PARTIAL (human set from another era, ${meta.humanEra} against ${meta.oursEra}: the critic can sort period, not authorship; cannot pass or fail)`
    : partial ? `G4 PARTIAL (no human set, cannot pass): ours ${indicative ? 'below' : 'not below'} the control`
    : `G4 ${pass ? 'PASS' : 'FAIL'}`;
  return { rate, void: voidRun, partial, mismatched, pass, verdict };
}

// ---------- Batch: many short, unrelated strings (app copy, menus) ----------
// Word budgets per kind: title, button, help and error from kitchen-table; the rest are Patina defaults (v0.4).
// legal: no budget and tells are advisory (kitchen-table: legal notices stay plain and keep every required fact).
export const BATCH_BUDGETS = { title: 8, button: 3, menu: 3, label: 6, status: 25, toast: 15, help: 20, error: 30, string: 30, paragraph: 80, legal: Infinity };
const SENTENCE_CAPS = { error: 2, toast: 2, string: 2, status: 3, paragraph: 5 };
const KIND_FROM_ID = [
  [/(button|btn|cta)$/i, 'button'], [/(title|heading|header)$/i, 'title'], [/(error|fail(ed)?)/i, 'error'],
  [/(help|hint|tooltip|why)$/i, 'help'], [/(toast|banner)$/i, 'toast'], [/status/i, 'status'],
  [/(label|tab)$/i, 'label'], [/(notice|privacy|retention|erasure|disclosure|terms|legal|consent)/i, 'legal'], [/\.p\d+$/i, 'paragraph'],
];
export function inferKind(id) {
  for (const [re, kind] of KIND_FROM_ID) if (re.test(id)) return kind;
  return 'string';
}

export function flatten(obj, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const id = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.push({ id, text: v });
    else if (v && typeof v === 'object') out.push(...flatten(v, id));
  }
  return out;
}

// Plain list: one string per line; "# Screen name" starts a group; "kind: text" sets the kind.
export function parseList(text) {
  const items = [];
  let screen = '';
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    if (line.startsWith('#')) { screen = line.replace(/^#+\s*/, ''); return; }
    const m = line.match(/^(title|button|menu|label|status|toast|help|error|string):\s*(.+)$/i);
    items.push({ id: `L${i + 1}`, text: m ? m[2] : line, kind: m ? m[1].toLowerCase() : null, screen });
  });
  return items;
}

export async function loadItems(path) {
  if (/\.(mjs|js)$/i.test(path)) {
    const { pathToFileURL } = await import('node:url');
    const mod = await import(pathToFileURL(resolve(path)).href);
    return flatten(Object.fromEntries(Object.entries(mod).filter(([, v]) => v && typeof v === 'object')));
  }
  const raw = readFileSync(path, 'utf8');
  if (/\.json$/i.test(path)) {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data.map((d, i) => ({ id: d.id || `item${i + 1}`, text: d.text, kind: d.kind || null, screen: d.screen || '' })) : flatten(data);
  }
  return parseList(raw);
}

export function checkBatch(items, opts = {}) {
  const budgets = { ...BATCH_BUDGETS, ...(opts.budgets || {}) };
  const cfg = TELLS.profiles.ui;
  const results = items.filter((it) => it.text && it.text.trim()).map((it) => {
    const kind = it.kind || inferKind(it.id);
    const text = it.text.replace(/\{[^}]+\}/g, '12'); // placeholders read as a number
    const hits = scanText(text, 'ui').map((h) => ({ ...h, lamp: TELLS.lamp.families[h.family] || 'House rule' }));
    const words = countWords(text);
    if (words > budgets[kind]) hits.push({ rule: `budget-${kind}`, family: 'budget', weight: 2, excerpt: it.text, hint: `${kind}: ${words} words, budget ${budgets[kind]}.`, lamp: 'House rule' });
    if (SENTENCE_CAPS[kind] && sentences(text).length > SENTENCE_CAPS[kind]) hits.push({ rule: `budget-${kind}-sentences`, family: 'budget', weight: 2, excerpt: it.text, hint: `${kind}: ${SENTENCE_CAPS[kind]} sentences at most.`, lamp: 'House rule' });
    const advisory = kind === 'legal' || (opts.protect || []).some((p) => it.id === p || it.text.includes(p));
    const hard = advisory ? [] : hits.filter((h) => cfg.hard.includes(h.family));
    const score = hits.reduce((a, h) => a + h.weight, 0);
    return { id: it.id, screen: it.screen || it.id.split('.')[0], kind, text: it.text, score, advisory, pass: advisory || (hard.length === 0 && score <= cfg.ceiling), hits };
  });
  // Set-level patterns: what a reader notices across screens, not on one.
  const set = [];
  const opener = {};
  for (const r of results) {
    const w = (r.text.match(/^[A-Za-z']+/) || [''])[0].toLowerCase();
    if (w && countWords(r.text) >= 4) (opener[w] = opener[w] || []).push(r.id);
  }
  const longOnes = results.filter((r) => countWords(r.text) >= 4).length;
  for (const [w, ids] of Object.entries(opener)) {
    if (ids.length >= 5 && ids.length / Math.max(longOnes, 1) >= 0.15 && !['the', 'a', 'your', 'you', 'it', 'this'].includes(w)) {
      set.push({ rule: 'set-same-opener', detail: `"${w}" opens ${ids.length} of ${longOnes} longer strings`, ids: ids.slice(0, 8) });
    }
  }
  const twoSentence = results.filter((r) => sentences(r.text).length === 2);
  const clipped = twoSentence.filter((r) => countWords(sentences(r.text)[0]) <= 4);
  if (clipped.length >= 5 && clipped.length / Math.max(twoSentence.length, 1) >= 0.4) {
    set.push({ rule: 'set-clipped-then-comfort', detail: `${clipped.length} of ${twoSentence.length} two-sentence strings open with a clipped line then explain (the Sheaf blind test: noticed when used screen after screen)`, ids: clipped.slice(0, 8).map((r) => r.id) });
  }
  const seen = {};
  for (const r of results) (seen[r.text] = seen[r.text] || []).push(r.id);
  for (const [t, ids] of Object.entries(seen)) if (ids.length > 1 && countWords(t) >= 4) set.push({ rule: 'set-duplicate', detail: `"${t.slice(0, 50)}" appears ${ids.length} times (check it means the same each time)`, ids });
  const failed = results.filter((r) => !r.pass);
  return { version: VERSION, strings: results.length, passed: results.length - failed.length, failed: failed.length, pass: failed.length === 0, set, results };
}

export function formatBatch(file, b, onlyFails = true) {
  const out = [`# Patina ${b.version} batch: ${file}`, '', `${b.strings} strings: ${b.passed} pass, ${b.failed} fail. G1 is the floor only: a pass means no known tells and within budget.`, ''];
  if (b.set.length) {
    out.push('## Across the set', '');
    for (const s of b.set) out.push(`- ${s.rule}: ${s.detail} (${s.ids.join(', ')})`);
    out.push('');
  }
  out.push('## Strings', '', '| Id | Kind | Text | Finding | LAMP | Fix |', '|---|---|---|---|---|---|');
  for (const r of b.results) {
    if (onlyFails && r.pass && !r.hits.length) continue;
    const cell = (s) => String(s).replace(/\|/g, '/').replace(/\n/g, ' ');
    if (!r.hits.length) continue;
    for (const h of r.hits) out.push(`| ${cell(r.id)} | ${r.kind} | ${cell(r.text.slice(0, 80))} | ${h.rule}${r.pass ? ' (advisory)' : ''} | ${h.lamp} | ${cell(h.hint)} |`);
  }
  return out.join('\n');
}

// ---------- Corpus: human text for G4 human sets and G3 anchors ----------
export const CORPUS_LICENCES = ['public-domain', 'CC0', 'CC-BY-4.0', 'CC-BY-3.0', 'OGL-3.0', 'MIT', 'Apache-2.0', 'BSD', 'owner'];
const CORPUS_KINDS = ['fiction', 'web', 'captions', 'email', 'pro-email', 'ui', 'technical', 'playful'];

export function parseCorpusHeader(text) {
  const head = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^#\s*([a-z-]+):\s*(.*)$/i);
    if (!m) break;
    head[m[1].toLowerCase()] = m[2].trim();
  }
  return head;
}

export function validateCorpusFile(text, { localOnly = false } = {}) {
  const h = parseCorpusHeader(text), problems = [];
  for (const k of ['source', 'author', 'licence', 'kind', 'era']) if (!h[k]) problems.push(`missing "# ${k}:"`);
  if (h.kind && !CORPUS_KINDS.includes(h.kind)) problems.push(`kind "${h.kind}" not one of ${CORPUS_KINDS.join(', ')}`);
  if (h.licence && !CORPUS_LICENCES.includes(h.licence) && !localOnly) problems.push(`licence "${h.licence}" cannot be committed (M034: copyleft, NC or unknown is study only); move it to corpus/local-only/`);
  const year = parseInt(h.era, 10);
  if (year >= 2023 && !h['human-proof']) problems.push(`written ${year}: add "# human-proof:" saying how we know a person wrote it`);
  const words = countWords(text.split(/\r?\n/).filter((l) => !l.startsWith('#')).join(' '));
  return { ok: problems.length === 0, problems, header: h, words };
}

export function corpusEra(dir, kind) {
  const eras = [];
  for (const sub of [join(dir, kind), join(dir, 'local-only', kind)]) {
    if (!existsSync(sub)) continue;
    for (const f of readdirSync(sub).filter((x) => x.endsWith('.txt'))) { const y = parseInt(parseCorpusHeader(readFileSync(join(sub, f), 'utf8')).era, 10); if (y) eras.push(y); }
  }
  return eras.length ? Math.min(...eras) : null;
}

export function corpusText(dir, kind) {
  const parts = [];
  for (const sub of [join(dir, kind), join(dir, 'local-only', kind)]) {
    if (!existsSync(sub)) continue;
    for (const f of readdirSync(sub).filter((x) => x.endsWith('.txt'))) parts.push(readFileSync(join(sub, f), 'utf8'));
  }
  return parts.join('\n\n');
}

// ---------- G3b locked-content voice pass (SPEC 4 G3b) ----------
export function paragraphs(text) {
  return text.split(/\r?\n\s*\r?\n/).map((p) => p.trim()).filter(Boolean);
}

const NUMBER_WORDS = /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand|first|second|third|half)(?:-\w+)?\b/gi;
// Named things: capitalised words not at a sentence start, digits, number words, italic spans.
export function namedThings(p) {
  const out = new Set();
  for (const m of p.matchAll(/(?<=[a-z,;:'’] )[A-Z][a-zA-Z'’]+(?: [A-Z][a-zA-Z'’]+)*/g)) out.add(m[0]);
  for (const m of p.matchAll(/\b\d[\d,.:]*\b/g)) out.add(m[0]);
  for (const m of p.matchAll(NUMBER_WORDS)) out.add(m[0].toLowerCase());
  for (const m of p.matchAll(/\*([^*\n]+)\*/g)) out.add(m[1]);
  return [...out];
}

// Draft a lock sheet: Claude then fills beat and turn and adds anything the script missed.
export function draftLock(text) {
  return { version: VERSION, paragraphs: paragraphs(text).map((p, i) => ({ id: i + 1, beat: '', turn: '', locked: namedThings(p), protected: [], sentences: sentences(p).length })) };
}

const norm = (s) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

// Gate one candidate against its lock. Any failed check keeps the original (never a partial).
export function fidelity(original, candidate, lock, answers = {}) {
  const orig = paragraphs(original);
  const cand = paragraphs(candidate);
  const results = [];
  if (orig.length !== cand.length || lock.paragraphs.length !== orig.length) {
    return { pass: false, reason: `paragraph count differs (original ${orig.length}, candidate ${cand.length}, lock ${lock.paragraphs.length}); whole candidate rejected`, results, merged: original.trim() };
  }
  lock.paragraphs.forEach((L, i) => {
    const o = orig[i], c = cand[i], fails = [];
    for (const item of L.locked) if (!norm(c).includes(norm(item))) fails.push(`locked item missing: "${item}"`);
    for (const line of L.protected) if (!c.includes(line)) fails.push(`protected line changed: "${line.slice(0, 60)}"`);
    const origNamed = new Set(namedThings(o).map(norm));
    for (const t of namedThings(c)) if (!origNamed.has(norm(t)) && !norm(o).includes(norm(t))) fails.push(`new named thing: "${t}"`);
    const dn = Math.abs(sentences(c).length - sentences(o).length);
    if (dn > 1) fails.push(`sentence count ${sentences(c).length} against ${sentences(o).length} (more than 1 apart)`);
    const a = answers[L.id] || {};
    if (a.beat !== true) fails.push('beat unchanged: not confirmed yes');
    if (a.turn !== true) fails.push('turn unchanged: not confirmed yes');
    results.push({ id: L.id, accept: fails.length === 0, fails });
  });
  const merged = results.map((r, i) => (r.accept ? cand[i] : orig[i])).join('\n\n');
  return { pass: results.every((r) => r.accept), accepted: results.filter((r) => r.accept).length, of: results.length, results, merged };
}

// Blind A/B per accepted paragraph: the critic picks the more human version of each pair.
export function buildPairs(original, candidate, results, seed = 7) {
  const orig = paragraphs(original), cand = paragraphs(candidate), rnd = mulberry32(seed);
  const out = ['# Blind pairs', '', EXPERT_BRIEF.split('\n\n')[0], '', 'Each pair says the same thing twice. For each pair, write "N: A" or "N: B" for the version a person more likely wrote, and a one-line reason naming the LAMP category of the fault you heard in the other one.', ''];
  const key = {};
  results.filter((r) => r.accept).forEach((r, k) => {
    const flip = rnd() < 0.5;
    const [a, b] = flip ? [cand[r.id - 1], orig[r.id - 1]] : [orig[r.id - 1], cand[r.id - 1]];
    out.push(`## Pair ${k + 1}`, '', `A: ${a}`, '', `B: ${b}`, '');
    key[k + 1] = { paragraph: r.id, A: flip ? 'voice' : 'original', B: flip ? 'original' : 'voice' };
  });
  return { packet: out.join('\n'), key };
}

// Merge by the critic's picks: the version marked more human wins, paragraph by paragraph; no pick keeps the original.
export function mergeByPicks(original, merged, key, picksText) {
  const orig = paragraphs(original), cur = paragraphs(merged);
  const picks = {};
  for (const m of picksText.matchAll(/(\d+)\s*[:.)-]\s*([AB])\b/g)) picks[+m[1]] = m[2];
  const out = orig.slice();
  let voiceWins = 0;
  for (const [pair, k] of Object.entries(key)) {
    if (picks[pair] && k[picks[pair]] === 'voice') { out[k.paragraph - 1] = cur[k.paragraph - 1]; voiceWins++; }
  }
  return { text: out.join('\n\n'), voiceWins, pairs: Object.keys(key).length };
}

// ---------- CLI ----------
// ---- Short lines: brief first, then candidates, filter, shortlist ----
const BRIEF_FIELDS = ['product', 'reader', 'place', 'speaker', 'one thing', 'tension', 'after', 'proof', 'next'];
const SPEAKERS = ['brand', 'owner', 'customer', 'narrator'];
const VAGUE = /\b(?:helps?|solutions?|better|smarter|streamlines?|empowers?|seamless(?:ly)?|really good|great|amazing|innovative|powerful|next-level)\b/i;
const STOP = new Set('your yours from with that this their them they have what when which into just also been were will about would could should there here then than very more most some such only even every other these those does doing done make makes made sure each like good'.split(' '));

export function checkBrief(text) {
  const fields = {};
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(/^\s*([a-z][a-z -]*?)\s*:\s*(.*)$/i);
    if (m && !raw.trim().startsWith('#')) fields[m[1].toLowerCase().replace(/-/g, ' ')] = m[2].trim();
  }
  const problems = [];
  for (const f of BRIEF_FIELDS) if (!fields[f]) problems.push(`${f}: missing`);
  for (const f of BRIEF_FIELDS) if (fields[f] && (/ \| /.test(fields[f]) || /in a stranger's words|a number, a page, a named object|the single fact the reader|this is where appeal lives|two things the reader wants that seem to fight/i.test(fields[f]))) problems.push(`${f}: still the template's wording`);
  if (fields.speaker && !SPEAKERS.includes(fields.speaker.toLowerCase().split(/[\s,]/)[0])) problems.push(`speaker: use one of ${SPEAKERS.join(', ')}`);
  if (fields['one thing'] && (countWords(fields['one thing']) < 5 || (VAGUE.test(fields['one thing']) && countWords(fields['one thing']) < 8))) problems.push('one thing: say the single fact the reader must leave with, in 5 or more plain words');
  // v0.6.1: appeal lives in the after-state (Jeff Walker's X to Y; Joanna Wiebe's 'life after'), not in the feature.
  // v0.6.2: the lines Nathan liked each resolved a tension the reader lives with (Saturday and the customer).
  if (fields.tension && countWords(fields.tension) < 5) problems.push('tension: name two things the reader wants that seem to fight, in their words');
  if (fields.after && countWords(fields.after) < 5) problems.push("after: say what is different in the reader's week once it works, in 5 or more of their words");
  if (fields.proof && !(/\d/.test(fields.proof) || /\b(?:page|minute|hour|second|day|week|price|receipt|invoice|warranty)s?\b/i.test(fields.proof) || /\s[A-Z][a-z]/.test(fields.proof))) problems.push('proof: needs a number, a page or a named object, not an adjective');
  const keywords = [...new Set(['product', 'one thing', 'after', 'proof'].flatMap((f) => (fields[f] || '').toLowerCase().match(/[a-z]{4,}/g) || []).filter((w) => !STOP.has(w)))];
  return { ok: problems.length === 0, problems, fields, keywords };
}

const stem = (w) => w.toLowerCase().slice(0, 5);

export function checkLines(text, brief, profile = 'headline', opts = {}) {
  const items = [];
  for (const raw of text.split(/\r?\n/)) {
    const t = raw.trim();
    if (!t || t.startsWith('#')) continue;
    const bar = t.indexOf(' | ');
    const technique = bar >= 0 ? t.slice(0, bar).trim() : 'unnamed';
    const line = bar >= 0 ? t.slice(bar + 3).trim() : t;
    const r = check(line, profile, opts);
    const reasons = [...r.fails, ...r.hits.filter((h) => !r.fails.some((f) => f.includes(h.family))).map((h) => `note: ${h.rule}`)];
    // S2 cold-reader proxy: the line (with its subline) must name something from the brief.
    if (brief && brief.keywords && brief.keywords.length) {
      const stems = new Set(brief.keywords.map(stem));
      const words = line.toLowerCase().match(/[a-z]{4,}/g) || [];
      if (!words.some((w) => stems.has(stem(w)))) reasons.unshift('brief: names nothing from the product, one thing or proof (a cold reader cannot tell what it is)');
    }
    const pass = r.pass && !reasons.some((x) => x.startsWith('brief:'));
    items.push({ technique, text: line, pass, score: r.score, reasons });
  }
  // Shortlist: fewest notes first, one per technique before any second from the same technique.
  // v0.6.2 (Nathan's picks, 6 Nov 2026): the reader holds the verb. Lines that open on something the reader does,
  // and talk to "you", rank above lines about the product, the rival or the world.
  const NOT_VERB = new Set('the a an your our we it this that how what why when not stop they he she there customers'.split(' '));
  const readerScore = (i) => { const w = (i.text.toLowerCase().match(/[a-z']+/g) || []); return (w.length && !NOT_VERB.has(w[0]) && !/\?\s*$/.test(i.text) ? 1 : 0) + Math.min(2, w.filter((x) => x === 'you' || x === 'your' || x === "you're").length); };
  for (const i of items) i.readerScore = readerScore(i);
  const passers = items.filter((i) => i.pass).sort((a, b) => a.reasons.length - b.reasons.length || b.readerScore - a.readerScore || a.score - b.score);
  // v0.6.1: never more than two shortlisted lines on one opening word (Nathan: the v0.6 shortlist all began "Your ...").
  const opener = (i) => (i.text.toLowerCase().match(/[a-z']+/) || [''])[0];
  const fits = (i) => shortlist.filter((s) => opener(s) === opener(i)).length < 2;
  const shortlist = [];
  for (const i of passers) if (shortlist.length < 5 && fits(i) && !shortlist.some((s) => s.technique === i.technique)) shortlist.push(i);
  for (const i of passers) if (shortlist.length < 5 && fits(i) && !shortlist.includes(i)) shortlist.push(i);
  const notes = [];
  const counts = {};
  for (const i of passers) counts[opener(i)] = (counts[opener(i)] || 0) + 1;
  for (const [w, n] of Object.entries(counts)) if (n >= 3) notes.push(`same opening: ${n} of ${passers.length} passing lines start with "${w}". One writer, one shape: write more from the reader's side.`);
  return { items, shortlist, notes };
}

export function formatLines(r) {
  const out = ['# Candidates', '', '| Technique | Line | Verdict |', '|---|---|---|'];
  for (const i of r.items) out.push(`| ${i.technique} | ${i.text} | ${i.pass ? 'pass' : 'FAIL: ' + i.reasons.filter((x) => !x.startsWith('note:')).join('; ')}${i.pass && i.reasons.length ? ' (' + i.reasons.join('; ') + ')' : ''} |`);
  if (r.notes && r.notes.length) out.push('', '# Across the set', '', ...r.notes.map((n) => '- ' + n));
  out.push('', `# Shortlist (${r.shortlist.length} of ${r.items.length}; next: blind cold-reader ranking, then the owner's ear)`, '');
  r.shortlist.forEach((i, n) => out.push(`${n + 1}. ${i.text}  (${i.technique})`));
  return out.join('\n');
}

// ---- S8 blind cold reader (v0.7.0): a different model family sees only the lines and the reader's shoes ----
// Clarity and appeal are scored apart (Nathan, 5 Nov 2026: clear is not the same as appealing).
export function buildColdPacket(lines, brief, seed = 7) {
  const rnd = mulberry32(seed);
  const order = lines.map((t) => ({ t, k: rnd() })).sort((a, b) => a.k - b.k).map((x) => x.t);
  const key = {};
  order.forEach((t, i) => { key[i + 1] = t; });
  const reader = (brief && brief.fields && brief.fields.reader) || 'a member of the public';
  const packet = [
    '# Cold read',
    '',
    `Be this person: ${reader}. You are scrolling past. You have never heard of any of these products and you know nothing else about them.`,
    'Each numbered line below is the first thing you see on a different website or advert. Judge each on its own, as you would in the wild.',
    '',
    'For each line give:',
    '- offered: what you think is being offered, in one plain sentence, or "unclear" if you cannot tell.',
    '- clarity: 0 to 5. Could you tell what it is from this line alone?',
    '- appeal: 0 to 5. As this person, would you want it? Would you read on?',
    '- voice: 0 to 5. Does it sound like a real person talking to you (5), or like marketing copy or a machine (0)?',
    '- why: a few words.',
    '',
    ...order.map((t, i) => `${i + 1}. ${t}`),
  ].join('\n');
  return { packet, key };
}

export function scoreCold(key, answersText, brief) {
  const stems = new Set(((brief && brief.keywords) || []).map(stem));
  const rows = [];
  for (const raw of answersText.split(/\r?\n/)) {
    const m = raw.match(/^\s*\**\s*(\d+)\s*\**\s*[|:.)]\s*(.*)$/);
    if (!m || !key[m[1]]) continue;
    const field = (name) => { const f = m[2].match(new RegExp(`${name}\\s*:\\s*([^|]*)`, 'i')); return f ? f[1].trim() : ''; };
    const num = (name) => { const n = parseFloat(field(name)); return Number.isFinite(n) ? n : 0; };
    const offered = field('offered');
    const words = offered.toLowerCase().match(/[a-z]{4,}/g) || [];
    const hits = new Set(words.filter((w) => stems.has(stem(w))).map(stem));
    const decoded = !/^unclear/i.test(offered) && hits.size >= 2;
    rows.push({ n: +m[1], text: key[m[1]], offered, clarity: num('clarity'), appeal: num('appeal'), voice: num('voice'), why: field('why'), decoded, total: num('clarity') + num('appeal') + num('voice') });
  }
  rows.sort((a, b) => b.total - a.total || b.appeal - a.appeal);
  return { answered: rows.length, of: Object.keys(key).length, rows };
}

export function formatCold(r) {
  const out = [`# S8 cold read (${r.answered} of ${r.of} lines answered)`, '', '| Rank | Line | Clarity | Appeal | Voice | Decoded the brief | What the reader thought it was |', '|---|---|---|---|---|---|---|'];
  r.rows.forEach((x, i) => out.push(`| ${i + 1} | ${x.text} | ${x.clarity} | ${x.appeal} | ${x.voice} | ${x.decoded ? 'yes' : 'no'} | ${x.offered} |`));
  out.push('', 'The critic is a different model family and saw no brief. It ranks; the owner judges (M028).');
  return out.join('\n');
}

function arg(argv, name, dflt) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
}

function main(argv) {
  const cmd = argv[0];
  try {
    if (cmd === 'check') {
      const file = argv[1];
      const profile = arg(argv, 'profile');
      if (!file || !profile) throw new Error('check needs <file> and --profile');
      const glossary = arg(argv, 'glossary') ? readGlossary(arg(argv, 'glossary')) : [];
      const r = check(readFileSync(file, 'utf8'), profile, { protect: readProtected(arg(argv, 'protect')), glossary });
      console.log(argv.includes('--json') ? JSON.stringify(r, null, 2) : formatReport(file, r));
      return r.pass ? 0 : 1;
    }
    if (cmd === 'packet') {
      const out = arg(argv, 'out');
      const [o, hFile, c] = ['ours', 'human', 'control'].map((k) => arg(argv, k));
      let h = hFile;
      let humanEra = arg(argv, 'human-era') ? +arg(argv, 'human-era') : null;
      const oursEra = arg(argv, 'ours-era') ? +arg(argv, 'ours-era') : null;
      if (!h && arg(argv, 'human-kind')) {
        const t = corpusText(join(HERE, '..', 'corpus'), arg(argv, 'human-kind'));
        if (t.trim()) { h = join(out, 'human-from-corpus.txt'); mkdirSync(out, { recursive: true }); writeFileSync(h, t); humanEra = humanEra || corpusEra(join(HERE, '..', 'corpus'), arg(argv, 'human-kind')); }
      }
      if (!out || !o || !c) throw new Error('packet needs --ours --control --out (and --human unless no same-register human set exists yet)');
      if (!h) console.error('patina: no --human set; G4 can only be PARTIAL (ours against the control).');
      if (h && !oursEra) console.error('patina: give --ours-era <year> (and --human-era for a --human file) so score can tell a same-era human set from a confounded one.');
      if (oursEra && humanEra && Math.abs(oursEra - humanEra) > ERA_GAP) console.error(`patina: human set is from ${humanEra}, ours from ${oursEra}; G4 will report PARTIAL (SPEC 4 G4 rule 3).`);
      const { packet, key } = buildPacket({ ours: readFileSync(o, 'utf8'), human: h ? readFileSync(h, 'utf8') : '', control: readFileSync(c, 'utf8'), n: +arg(argv, 'n', 4), size: +arg(argv, 'size', 150), seed: +arg(argv, 'seed', 7), oursEra, humanEra });
      mkdirSync(out, { recursive: true });
      writeFileSync(join(out, 'packet.md'), packet);
      writeFileSync(join(out, 'SEALED-KEY.json'), JSON.stringify(key, null, 2));
      console.log(`Packet: ${join(out, 'packet.md')} (${Object.keys(key).length} excerpts). Key sealed in SEALED-KEY.json; only "score" reads it.`);
      return 0;
    }
    if (cmd === 'score') {
      const keyPath = arg(argv, 'key');
      const picks = arg(argv, 'picks');
      if (!keyPath || !picks) throw new Error('score needs --key and --picks');
      const r = score(JSON.parse(readFileSync(keyPath, 'utf8')), readFileSync(picks, 'utf8'));
      console.log(JSON.stringify(r, null, 2));
      return r.pass ? 0 : 1;
    }
    if (cmd === 'batch') {
      const file = argv[1];
      if (!file) throw new Error('batch needs <file> (.mjs/.js module, .json object or list, or a plain list)');
      const budgets = arg(argv, 'budgets') ? JSON.parse(readFileSync(arg(argv, 'budgets'), 'utf8')) : {};
      return loadItems(file).then((items) => {
        const b = checkBatch(items, { budgets, protect: readProtected(arg(argv, 'protect')) });
        const report = formatBatch(file, b, !argv.includes('--all'));
        if (arg(argv, 'report')) writeFileSync(arg(argv, 'report'), report + '\n');
        console.log(argv.includes('--json') ? JSON.stringify(b, null, 2) : report);
        return b.pass ? 0 : 1;
      });
    }
    if (cmd === 'corpus') {
      const dir = arg(argv, 'dir', join(HERE, '..', 'corpus'));
      let bad = 0;
      const rows = [];
      for (const [sub, localOnly] of [[dir, false], [join(dir, 'local-only'), true]]) {
        if (!existsSync(sub)) continue;
        for (const kind of readdirSync(sub, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== 'local-only')) {
          for (const f of readdirSync(join(sub, kind.name)).filter((x) => x.endsWith('.txt'))) {
            const v = validateCorpusFile(readFileSync(join(sub, kind.name, f), 'utf8'), { localOnly });
            if (v.header.kind && v.header.kind !== kind.name) v.problems.push(`header kind "${v.header.kind}" but folder "${kind.name}"`);
            if (v.problems.length) bad++;
            rows.push(`${v.problems.length ? 'FIX ' : 'ok  '} ${localOnly ? 'local-only/' : ''}${kind.name}/${f}  ${v.words} words, ${v.header.licence || '?'}, ${v.header.era || '?'}${v.problems.length ? '  -> ' + v.problems.join('; ') : ''}`);
          }
        }
      }
      console.log(rows.length ? rows.join('\n') : 'Corpus is empty.');
      return bad ? 1 : 0;
    }
    if (cmd === 'anchors') {
      const kind = arg(argv, 'kind');
      if (!kind) throw new Error('anchors needs --kind <fiction|web|...> [--n 3] [--size 150] [--seed n]');
      const text = corpusText(arg(argv, 'dir', join(HERE, '..', 'corpus')), kind);
      if (!text.trim()) throw new Error(`no corpus text of kind "${kind}" yet`);
      const n = +arg(argv, 'n', 3), all = excerpts(text, +arg(argv, 'size', 150), 1000), rnd = mulberry32(+arg(argv, 'seed', Date.now() % 100000));
      const picks = [];
      while (picks.length < Math.min(n, all.length)) { const p = all[Math.floor(rnd() * all.length)]; if (!picks.includes(p)) picks.push(p); }
      console.log(picks.map((p, i) => `## Anchor ${i + 1}\n\n${p}`).join('\n\n'));
      return 0;
    }
    if (cmd === 'lock') {
      const file = argv[1], out = arg(argv, 'out');
      if (!file || !out) throw new Error('lock needs <file> and --out <lock.json>');
      writeFileSync(out, JSON.stringify(draftLock(readFileSync(file, 'utf8')), null, 2));
      console.log(`Draft lock sheet: ${out}. Fill "beat" and "turn" per paragraph and add protected lines before the voice pass.`);
      return 0;
    }
    if (cmd === 'fidelity') {
      const [o, c, l, out] = ['original', 'candidate', 'lock', 'out'].map((k) => arg(argv, k));
      if (!o || !c || !l || !out) throw new Error('fidelity needs --original --candidate --lock --out <dir> [--answers <json>] [--seed n]');
      const original = readFileSync(o, 'utf8'), candidate = readFileSync(c, 'utf8');
      const answers = arg(argv, 'answers') ? JSON.parse(readFileSync(arg(argv, 'answers'), 'utf8')) : {};
      const r = fidelity(original, candidate, JSON.parse(readFileSync(l, 'utf8')), answers);
      mkdirSync(out, { recursive: true });
      writeFileSync(join(out, 'gated.md'), r.merged + '\n');
      writeFileSync(join(out, 'fidelity.json'), JSON.stringify(r.results, null, 2));
      if (r.reason) { console.log(`G3b fidelity: ${r.reason}`); return 1; }
      const { packet, key } = buildPairs(original, candidate, r.results, +arg(argv, 'seed', 7));
      writeFileSync(join(out, 'pairs.md'), packet);
      writeFileSync(join(out, 'SEALED-KEY.json'), JSON.stringify(key, null, 2));
      for (const x of r.results) if (!x.accept) console.log(`  paragraph ${x.id}: kept original (${x.fails.join('; ')})`);
      console.log(`G3b fidelity: ${r.accepted} of ${r.of} paragraphs passed; the rest keep the original. Blind pairs: ${join(out, 'pairs.md')}`);
      return 0;
    }
    if (cmd === 'pick') {
      const [o, g, k, p, out] = ['original', 'gated', 'key', 'picks', 'out'].map((x) => arg(argv, x));
      if (!o || !g || !k || !p || !out) throw new Error('pick needs --original --gated --key --picks --out <file>');
      const r = mergeByPicks(readFileSync(o, 'utf8'), readFileSync(g, 'utf8'), JSON.parse(readFileSync(k, 'utf8')), readFileSync(p, 'utf8'));
      writeFileSync(out, r.text + '\n');
      console.log(`G3b picks: the voice pass won ${r.voiceWins} of ${r.pairs} pairs; result in ${out}`);
      return 0;
    }
    if (cmd === 'brief') {
      if (!argv[1]) throw new Error('brief needs <brief.txt> (template: patina/templates/headline-brief.txt)');
      const b = checkBrief(readFileSync(argv[1], 'utf8'));
      console.log(b.ok ? `Brief ok. Keywords a line can draw on: ${b.keywords.join(', ')}` : `Brief not ready:\n  ${b.problems.join('\n  ')}`);
      return b.ok ? 0 : 1;
    }
    if (cmd === 'lines') {
      const [bf, cf, out] = ['brief', 'candidates', 'out'].map((k) => arg(argv, k));
      if (!bf || !cf) throw new Error('lines needs --brief <brief.txt> --candidates <file: "technique | line / subline" per line> [--profile headline] [--glossary file] [--out dir]');
      const b = checkBrief(readFileSync(bf, 'utf8'));
      if (!b.ok) { console.log(`Brief not ready, so no lines:\n  ${b.problems.join('\n  ')}`); return 1; }
      const glossary = arg(argv, 'glossary') ? readGlossary(arg(argv, 'glossary')) : [];
      const r = checkLines(readFileSync(cf, 'utf8'), b, arg(argv, 'profile', 'headline'), { glossary });
      const report = formatLines(r);
      if (out) { mkdirSync(out, { recursive: true }); writeFileSync(join(out, 'lines.md'), report + '\n'); }
      console.log(report);
      return r.shortlist.length ? 0 : 1;
    }
    if (cmd === 'coldpacket') {
      const [bf, lf, out] = ['brief', 'lines', 'out'].map((k) => arg(argv, k));
      if (!bf || !lf || !out) throw new Error('coldpacket needs --brief <brief.txt> --lines <file: one line, or "technique | line", per row> --out <dir> [--seed n]');
      const rows = readFileSync(lf, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => (l.includes(' | ') ? l.slice(l.indexOf(' | ') + 3) : l));
      const { packet, key } = buildColdPacket(rows, checkBrief(readFileSync(bf, 'utf8')), +arg(argv, 'seed', 7));
      mkdirSync(out, { recursive: true });
      writeFileSync(join(out, 'packet.md'), packet + '\n');
      writeFileSync(join(out, 'SEALED-KEY.json'), JSON.stringify(key, null, 2));
      console.log(`Cold packet: ${join(out, 'packet.md')} (${rows.length} lines). Next: node patina/tools/critic.mjs --mode cold --packet ${join(out, 'packet.md')} --out ${join(out, 'answers.md')} --key-file <key file>`);
      return 0;
    }
    if (cmd === 'coldscore') {
      const [bf, kf, af, out] = ['brief', 'key', 'answers', 'out'].map((k) => arg(argv, k));
      if (!bf || !kf || !af) throw new Error('coldscore needs --brief --key <SEALED-KEY.json> --answers <answers.md> [--out <ranked.md>]');
      const r = scoreCold(JSON.parse(readFileSync(kf, 'utf8')), readFileSync(af, 'utf8'), checkBrief(readFileSync(bf, 'utf8')));
      const report = formatCold(r);
      if (out) writeFileSync(out, report + '\n');
      console.log(report);
      return r.answered === r.of ? 0 : 1;
    }
    throw new Error('commands: check, brief, lines, coldpacket, coldscore, packet, score, batch, corpus, anchors, lock, fidelity, pick');
  } catch (e) {
    console.error(`patina: ${e.message}`);
    return 2;
  }
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)).toLowerCase() === resolve(process.argv[1]).toLowerCase()) Promise.resolve(main(process.argv.slice(2))).then((code) => { process.exitCode = code; }, (e) => { console.error(`patina: ${e.message}`); process.exitCode = 2; });
