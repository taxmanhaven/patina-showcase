#!/usr/bin/env node
// Patina predictability map (G1p, v0.7.1). The AI accent is the most probable choice made again and again
// (Nathan, 6 Nov 2026). This scores every token of a text by its rank in a language model's guesses
// (the GLTR method: Gehrmann, Strobelt and Rush, ACL 2019 demo) and by perplexity, then names the most
// predictable sentences and the runs of first-guess words inside them, so the owner rewrites those with
// surprise inside the voice, never by sanitising.
//
// Usage:
//   node predict.mjs <file> [--out <file.md>] [--key-file <path>] [--worst 5] [--json]
//   node predict.mjs --compare <a.txt> <b.txt> [--key-file <path>]
// The key is read from PRIMALABS_API_KEY or --key-file inside this process; it is never printed or written.
// Cost: input tokens only (about 1.3 tokens a word). A 3,000-word chapter is about 4,000 tokens.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const MODEL = 'primalabs-ai/DeepSeek-V4.1-Flash-1017';
export const TOP = 10; // a token outside the model's top 10 guesses counts as a surprise (GLTR's green band is top 10)

// Align the API's prompt_logprobs with the text. Each entry is an object keyed by token id (JavaScript reorders
// numeric keys, so the actual token is found by matching its text at the current offset, never by position).
export function align(text, promptLogprobs) {
  const rows = [];
  let off = 0;
  const first = promptLogprobs[0];
  const entries = promptLogprobs.slice(first == null ? 1 : 0).map((d) => Object.values(d || {}));
  // Tokenizers split words unpredictably (" s|ills", not " sill|s"), so a candidate is kept only if the next
  // few entries can still be matched after it (a short lookahead, not greedy longest match).
  const fits = (i, at, depth) => {
    if (i >= entries.length || depth === 0) return true;
    return entries[i].some((x) => x.decoded_token && text.startsWith(x.decoded_token, at) && fits(i + 1, at + x.decoded_token.length, depth - 1));
  };
  if (first == null) {
    // The first token has no logprob: its text ends at the first offset where the rest can be matched.
    off = 1;
    while (off < Math.min(text.length, 40) && !fits(0, off, 6)) off++;
  }
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const act = e.filter((x) => x.decoded_token && text.startsWith(x.decoded_token, off))
      .sort((p, q) => q.decoded_token.length - p.decoded_token.length || p.rank - q.rank)
      .find((x) => fits(i + 1, off + x.decoded_token.length, 4));
    if (!act) return { rows, aligned: false, at: off };
    const top = e.find((x) => x.rank === 1);
    rows.push({ start: off, t: act.decoded_token, rank: act.rank, lp: act.logprob, top: top ? top.decoded_token : act.decoded_token });
    off += act.decoded_token.length;
  }
  return { rows, aligned: true, at: off };
}

export function stats(rows) {
  const n = rows.length || 1;
  const meanLp = rows.reduce((s, x) => s + x.lp, 0) / n;
  return {
    tokens: rows.length,
    perplexity: +Math.exp(-meanLp).toFixed(1),
    rank1: +(rows.filter((x) => x.rank === 1).length / n).toFixed(2),
    surprise: +(rows.filter((x) => x.rank > TOP).length / n).toFixed(2),
  };
}

// Sentences by character span, each with its own stats and its longest run of first-guess words.
export function bySentence(text, rows) {
  const spans = [];
  const re = /[^.!?\n]+(?:[.!?]+["'’”)]*|\n|$)/g;
  let m;
  while ((m = re.exec(text))) { if (m[0].trim()) spans.push({ start: m.index, end: m.index + m[0].length, text: m[0].trim() }); if (m[0] === '') re.lastIndex++; }
  return spans.map((s) => {
    const r = rows.filter((x) => x.start >= s.start && x.start < s.end);
    let run = [], best = [];
    for (const x of r) {
      if (x.rank <= 2 && /\w/.test(x.t)) run.push(x); else if (/\w/.test(x.t)) run = [];
      if (run.length > best.length) best = run.slice();
    }
    const words = s.text.split(/\s+/).length;
    return { ...s, words, ...stats(r), run: best.map((x) => x.t).join('').trim(), runLen: best.length };
  }).filter((s) => s.tokens >= 4);
}

export function report(file, text, rows, { worst = 5 } = {}) {
  const all = stats(rows);
  const sents = bySentence(text, rows);
  const ranked = [...sents].filter((x) => x.words >= 8).sort((a, b) => a.perplexity - b.perplexity);
  const out = [
    `# Predictability map: ${file}`,
    '',
    `Model ${MODEL} (scores only; never writes). ${all.tokens} tokens. Perplexity ${all.perplexity}; first-guess tokens ${Math.round(all.rank1 * 100)}%; surprises (outside the top ${TOP}) ${Math.round(all.surprise * 100)}%.`,
    'Higher perplexity and more surprises mean less predictable. These numbers only compare like with like (same kind, same length band); they are not a human-or-AI verdict, and nonsense also scores high. The ear decides.',
    '',
    `## The ${Math.min(worst, ranked.length)} most predictable sentences of 8 words or more (rewrite these first, with surprise inside the voice)`,
    '',
    'Short beats ("Hana said.") are always predictable and are usually the most human lines: leave them alone (SPEC 4 G3 rule 2).',
    '',
    '| # | Perplexity | Surprises | Sentence | Longest first-guess run |',
    '|---|---|---|---|---|',
    ...ranked.slice(0, worst).map((s, i) => `| ${i + 1} | ${s.perplexity} | ${Math.round(s.surprise * 100)}% | ${s.text.replace(/\|/g, '/')} | ${s.runLen >= 3 ? s.run.replace(/\|/g, '/') : ''} |`),
    '',
    'How to rewrite (luke `craft/predictability.md`; Patina SPEC 4 G3 rule 7): the less expected word that is still right; a sound for a fact; posh phrasing for a small thing; the slip speech makes; a broken rhythm; a detail left unpaid. Never sanitise, never fake an error, no thesaurus swaps. Then run this again and compare.',
  ];
  return { text: out.join('\n'), all, sentences: sents };
}

async function score(text, key) {
  const res = await fetch('https://api.primalabs.ai/v1/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
    body: JSON.stringify({ model: MODEL, prompt: text, max_tokens: 1, echo: true, logprobs: 3 }),
  });
  if (!res.ok) throw new Error(`Prima Labs ${res.status}`);
  const j = await res.json();
  const pl = j.choices?.[0]?.prompt_logprobs;
  if (!pl) throw new Error('no prompt_logprobs in the reply; the endpoint may have changed');
  const a = align(text, pl);
  if (!a.aligned) console.error(`predict: alignment stopped at character ${a.at}; scoring what aligned (${a.rows.length} tokens).`);
  return a.rows;
}

function readKey(argv) {
  if (process.env.PRIMALABS_API_KEY) return process.env.PRIMALABS_API_KEY.trim();
  const i = argv.indexOf('--key-file');
  if (i < 0) throw new Error('set PRIMALABS_API_KEY or pass --key-file <path>');
  return readFileSync(argv[i + 1], 'utf8').trim();
}

async function main(argv) {
  const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
  const key = readKey(argv);
  if (argv.includes('--compare')) {
    const i = argv.indexOf('--compare');
    const files = [argv[i + 1], argv[i + 2]];
    for (const f of files) {
      const t = readFileSync(f, 'utf8').replace(/\r\n/g, '\n').trim();
      const s = stats(await score(t, key));
      console.log(`${f}: perplexity ${s.perplexity}, surprises ${Math.round(s.surprise * 100)}%, first-guess ${Math.round(s.rank1 * 100)}% (${s.tokens} tokens)`);
    }
    return 0;
  }
  const file = argv[0];
  if (!file) throw new Error('usage: predict.mjs <file> [--out <md>] [--key-file <path>]');
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const rows = await score(text, key);
  const r = report(file, text, rows, { worst: +arg('worst', 5) });
  if (argv.includes('--json')) console.log(JSON.stringify({ all: r.all, sentences: r.sentences }, null, 2));
  else console.log(r.text);
  if (arg('out')) writeFileSync(arg('out'), r.text + '\n');
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error('predict: ' + e.message); process.exit(2); });
}
