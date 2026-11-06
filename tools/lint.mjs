// Patina lint layer: the tells scan as findings with line, column, severity and a plain reason.
// Shared by the command line (cli.mjs) and the MCP server (mcp.mjs). Offline: no key, no network, no Python.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';
import { TELLS, VERSION, check } from './patina.mjs';

export { VERSION };
export const CONFIG_NAMES = ['.patinarc.json', 'patina.config.json'];
export const PROFILES = Object.keys(TELLS.profiles);

// Rules that live in code, not in tells.json.
const BUILTIN = {
  'afterthought-aside': { family: 'afterthought-aside', profiles: ['fiction'] },
  'bare-negative': { family: 'bare-negative', hint: 'A short line that only says what did not happen. Say what it does.', profiles: ['headline', 'captions', 'testimonial', 'ui'] },
  'drumroll-split': { family: 'drumroll-split', hint: 'The second line pays off the first like a slogan. Say it as one plain sentence.' },
  'same-shape': { family: 'same-shape', hint: 'Three cards in a row share one shape. Vary them, or cut one.' },
  'design-leak': { family: 'design-leak', hint: "A project's own design words in copy a customer reads. Use the customer's word." },
  'budget-line': { family: 'budget', hint: 'Over the word budget for one line.' },
  'budget-card': { family: 'budget', hint: 'More lines on screen than the profile allows.' },
};
const MEASURES = {
  rhythm: 'Sentence lengths vary too little. People let some sentences run long and stop others short.',
  band: 'Three in four sentences or more sit in the 8 to 20 word band, a 2026 model habit.',
  staccato: 'Runs of three or more very short sentences, used as a habit.',
  specificity: 'Too few checkable specifics: numbers, names, quoted words.',
  length: 'The text is outside the word range for this profile.',
  score: 'Too many weighted marks per 100 words for this profile.',
};

// Settings, nearest config file first, walking up from the checked file.
export function findConfig(from) {
  let dir = resolve(from);
  for (;;) {
    for (const n of CONFIG_NAMES) if (existsSync(join(dir, n))) return join(dir, n);
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

export function loadConfig(path) {
  if (!path) return {};
  const c = JSON.parse(readFileSync(path, 'utf8'));
  const base = dirname(path);
  const out = { ...c, path };
  if (c.glossary) out.glossaryPath = resolve(base, c.glossary);
  return out;
}

// A per-extension profile from config ("profiles": {".md": "web"}), else the config default, else web.
export function profileFor(file, cfg = {}) {
  const ext = file ? extname(file).toLowerCase() : '';
  return (cfg.profiles && cfg.profiles[ext]) || cfg.profile || 'web';
}

function severity(h, profile) {
  const cfg = TELLS.profiles[profile];
  if (cfg.hard.includes(h.family) || cfg.hard.includes(h.rule)) return 'error';
  return h.weight >= 2 ? 'warning' : 'info';
}

// Find the excerpt on its line so editors can underline it.
function columns(src, excerpt) {
  if (!src) return [1, 1];
  let at = src.indexOf(excerpt);
  if (at < 0) at = src.toLowerCase().indexOf(excerpt.toLowerCase().split('\n')[0].slice(0, 24));
  if (at < 0) return [1, src.length + 1];
  return [at + 1, Math.min(src.length, at + excerpt.length) + 1];
}

// Code is not prose: blank out fenced blocks, inline code, link targets and image marks, keeping every
// line and column where it was. Off with { code: true }.
export function maskCode(text) {
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  return text
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, blank)
    .replace(/`[^`\n]+`/g, blank)
    .replace(/\]\([^)\s]+\)/g, (m) => ']' + blank(m.slice(1)))
    .replace(/!\[/g, ' [');
}

export function lint(text, opts = {}) {
  const profile = opts.profile || 'web';
  const prose = opts.code ? text : maskCode(text);
  const r = check(prose, profile, { disable: opts.disable, protect: opts.protect, glossary: opts.glossary });
  const lines = text.split(/\r?\n/);
  const findings = r.hits.filter((h) => !h.protected).map((h) => {
    const [column, endColumn] = columns(lines[h.line - 1], h.excerpt);
    return { line: h.line, column, endColumn, severity: severity(h, profile), rule: h.rule, family: h.family, category: h.lamp, excerpt: h.excerpt, reason: h.hint };
  }).sort((a, b) => a.line - b.line || a.column - b.column);
  return {
    version: VERSION,
    profile,
    words: r.words,
    pass: r.pass,
    score: r.score,
    ceiling: r.ceiling,
    fails: r.fails,
    findings,
    measures: r.measures,
  };
}

export function explain(id) {
  const rule = TELLS.rules.find((x) => x.id === id);
  if (rule) return { id, kind: 'rule', family: rule.family, weight: rule.weight, category: TELLS.lamp.families[rule.family] || 'House rule', what: TELLS.families[rule.family] || '', fix: rule.hint, profiles: rule.profiles || 'all' };
  if (BUILTIN[id]) { const b = BUILTIN[id]; return { id, kind: 'rule', family: b.family, category: TELLS.lamp.families[b.family] || 'House rule', what: TELLS.families[b.family] || b.hint, fix: b.hint || 'Fold it into the sentence, give it its own sentence, or cut it.', profiles: b.profiles || 'per profile' }; }
  if (MEASURES[id]) return { id, kind: 'measure', what: MEASURES[id] };
  if (TELLS.families[id]) {
    const rules = TELLS.rules.filter((x) => x.family === id).map((x) => x.id);
    return { id, kind: 'family', category: TELLS.lamp.families[id] || 'House rule', what: TELLS.families[id], rules };
  }
  return null;
}

export function rules(profile) {
  const list = TELLS.rules.filter((x) => !profile || !x.profiles || x.profiles.includes(profile)).map((x) => ({ id: x.id, family: x.family, weight: x.weight }));
  for (const [id, b] of Object.entries(BUILTIN)) if (!profile || !b.profiles || b.profiles.includes(profile)) list.push({ id, family: b.family, weight: null });
  return list;
}

export function profiles() {
  return PROFILES.map((name) => {
    const p = TELLS.profiles[name];
    return { name, ceiling: p.ceiling, hard: p.hard, measures: p.measure || [], perLine: !!p.perUnit };
  });
}

// ---- Output formats ----
const pad = (s, n) => String(s).padEnd(n);

export function formatText(file, res) {
  const out = [];
  for (const f of res.findings) out.push(`${file}:${f.line}:${f.column}  ${pad(f.severity, 7)} ${pad(f.rule, 20)} "${f.excerpt.replace(/\s+/g, ' ').slice(0, 60)}"  ${f.reason}`);
  const verdict = res.pass ? 'pass' : `fail (${res.fails.join('; ')})`;
  out.push(`${file}: ${res.findings.length} mark${res.findings.length === 1 ? '' : 's'}, ${res.words} words, profile ${res.profile}: ${verdict}`);
  return out.join('\n');
}

// GitHub Actions workflow commands: marks show inline on the pull request.
export function formatGithub(file, res) {
  const esc = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  const lvl = { error: 'error', warning: 'warning', info: 'notice' };
  const out = res.findings.map((f) => `::${lvl[f.severity]} file=${file},line=${f.line},col=${f.column},endColumn=${f.endColumn},title=patina ${f.rule}::${esc(`"${f.excerpt}" ${f.reason}`)}`);
  if (!res.pass) out.push(`::error file=${file},title=patina::${esc(res.fails.join('; '))}`);
  return out.join('\n');
}
