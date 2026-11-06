#!/usr/bin/env node
// G4 critic of a different model family: sends a blind packet to DeepSeek via Prima Labs and writes picks.md.
// Usage: node critic.mjs [--mode cold] --packet <dir>/packet.md --out <dir>/picks.md [--key-file <path>] [--model primalabs-ai/DeepSeek-V4.1-Flash-1017]
// The key comes from PRIMALABS_API_KEY, or from --key-file (Nathan's key store). It is never printed, logged or written.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DASHES = new RegExp(`\\s*[${String.fromCharCode(0x2013, 0x2014)}]\\s*`, 'g'); // built in code: no literal dash in the repo
const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : dflt; };

export function readKey(keyFile) {
  if (process.env.PRIMALABS_API_KEY) return process.env.PRIMALABS_API_KEY.trim();
  if (!keyFile) throw new Error('no key: set PRIMALABS_API_KEY or pass --key-file');
  const raw = readFileSync(keyFile, 'utf8').trim();
  const line = raw.split(/\r?\n/).find((l) => l.trim()) || '';
  return (line.includes('=') ? line.slice(line.indexOf('=') + 1) : line).trim().replace(/^["']|["']$/g, '');
}

async function main() {
  const packet = arg('packet'), out = arg('out');
  if (!packet || !out) throw new Error('needs --packet and --out');
  const key = readKey(arg('key-file'));
  const body = {
    model: arg('model', 'primalabs-ai/DeepSeek-V4.1-Flash-1017'),
    temperature: 0.2,
    max_tokens: +arg('max-tokens', 20000), // DeepSeek reasons before it answers; a small budget returns nothing (luke de-ai-notes_harness.md)
    messages: [{ role: 'user', content: readFileSync(packet, 'utf8') + (arg('mode') === 'raw' ? '' : arg('mode') === 'cold'
      // S8 cold reader (Patina v0.7): one parseable row per line, nothing else.
      ? '\n\nAnswer in plain text, one row per numbered line and nothing else, exactly in this form:\nN | offered: ... | clarity: N | appeal: N | voice: N | why: ...'
      : '\n\nAnswer in plain text in the form asked for: one line per excerpt ("N: human" or "N: AI" and a reason), then a heading "Lines that read machine-written" with bullets, then a heading "Overall" with two or three sentences.') }],
  };
  const res = await fetch('https://api.primalabs.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Prima Labs answered ${res.status} ${res.statusText}`);
  const data = await res.json();
  // House rule: no em or en dashes in the repo, so the critic's dashes become colons on the way in.
  const text = (data.choices?.[0]?.message?.content || '').replace(DASHES, ': ');
  if (!text.trim()) throw new Error(`empty answer from the critic (finish ${data.choices?.[0]?.finish_reason}, tokens out ${data.usage?.completion_tokens ?? '?'})`);
  writeFileSync(out, `# Picks (critic: ${body.model} via Prima Labs, ${new Date().toISOString().slice(0, 10)})\n\n${text.trim()}\n`);
  const u = data.usage || {};
  console.log(`Critic ${body.model}: picks written to ${out} (tokens in ${u.prompt_tokens ?? '?'}, out ${u.completion_tokens ?? '?'})`);
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)).toLowerCase() === resolve(process.argv[1]).toLowerCase()) {
  main().catch((e) => { console.error(`critic: ${e.message}`); process.exitCode = 1; });
}
