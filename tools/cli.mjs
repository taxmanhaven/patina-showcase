#!/usr/bin/env node
// Patina command line. `npx github:taxmanhaven/patina-showcase check draft.md`
//   patina check <file...|-> [--profile p] [--format text|json|github] [--disable a,b] [--fail-on gate|any|never] [--config f]
//   patina explain <rule|family|measure>
//   patina rules [--profile p]
//   patina profiles
//   patina init            write a starter .patinarc.json here
//   patina mcp             run the MCP server on stdio (for Claude, Cursor and other MCP clients)
//   anything else          passed to tools/patina.mjs (packet, score, batch, brief, lines ...)
// Exit codes: 0 pass, 1 marks failed the gate, 2 usage error.
import { readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readGlossary } from './patina.mjs';
import { VERSION, PROFILES, lint, explain, rules, profiles, findConfig, loadConfig, profileFor, formatText, formatGithub } from './lint.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

function arg(argv, name, dflt) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
}
const VALUED = new Set(['--profile', '--format', '--disable', '--fail-on', '--config', '--protect', '--glossary']);
function positional(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    if (VALUED.has(argv[i])) { i++; continue; }
    if (argv[i].startsWith('--')) continue;
    out.push(argv[i]);
  }
  return out;
}
const list = (s) => (s ? String(s).split(',').map((x) => x.trim()).filter(Boolean) : []);

const HELP = `Patina ${VERSION}: marks the lines in your draft that read as machine-written, and says why.

  patina check <file...>        check files (use - for stdin)
      --profile <name>          ${PROFILES.join(', ')}
      --format text|json|github github prints inline pull request notes
      --disable a,b             switch off rules, families or measures
      --fail-on gate|any|never  when to exit 1 (default gate)
  patina explain <rule>         what a mark means and how to fix it
  patina rules [--profile p]    every rule
  patina profiles               every profile
  patina init                   write a starter .patinarc.json
  patina mcp                    run as an MCP server for AI apps

Settings: .patinarc.json in this folder or any folder above it.`;

function readStdin() {
  return readFileSync(0, 'utf8');
}

function runCheck(argv) {
  const files = positional(argv).slice(1);
  if (!files.length) throw new Error('check needs a file (or - for stdin)');
  const format = arg(argv, 'format', 'text');
  if (!['text', 'json', 'github'].includes(format)) throw new Error(`unknown --format "${format}"`);
  const results = [];
  let failed = false;
  for (const file of files) {
    const cfgPath = arg(argv, 'config') || findConfig(file === '-' ? process.cwd() : dirname(resolve(file)));
    const cfg = loadConfig(cfgPath);
    const profile = arg(argv, 'profile') || profileFor(file === '-' ? '' : file, cfg);
    if (!PROFILES.includes(profile)) throw new Error(`unknown profile "${profile}". Use: ${PROFILES.join(', ')}`);
    const disable = [...list(cfg.disable && cfg.disable.join(',')), ...list(arg(argv, 'disable'))];
    const glossaryPath = arg(argv, 'glossary') || cfg.glossaryPath;
    const protect = [...(cfg.protect || []), ...(arg(argv, 'protect') ? readFileSync(arg(argv, 'protect'), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : [])];
    const text = file === '-' ? readStdin() : readFileSync(file, 'utf8');
    const res = lint(text, { profile, disable, protect, glossary: glossaryPath ? readGlossary(glossaryPath) : [] });
    const failOn = arg(argv, 'fail-on') || cfg.failOn || 'gate';
    if (!['gate', 'any', 'never'].includes(failOn)) throw new Error(`unknown --fail-on "${failOn}"`);
    if ((failOn === 'gate' && !res.pass) || (failOn === 'any' && res.findings.length)) failed = true;
    const name = file === '-' ? 'stdin' : file;
    results.push({ file: name, ...res });
    if (format === 'text') console.log(formatText(name, res));
    if (format === 'github') { const g = formatGithub(name, res); if (g) console.log(g); }
  }
  if (format === 'json') console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
  return failed ? 1 : 0;
}

const STARTER = {
  profile: 'web',
  profiles: { '.md': 'web', '.txt': 'web' },
  disable: [],
  protect: [],
  failOn: 'gate',
};

export async function main(argv) {
  const cmd = argv[0];
  try {
    if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') { console.log(HELP); return cmd ? 0 : 2; }
    if (cmd === '--version' || cmd === '-v') { console.log(VERSION); return 0; }
    if (cmd === 'check') return runCheck(argv);
    if (cmd === 'explain') {
      const id = argv[1];
      const e = id && explain(id);
      if (!e) throw new Error(id ? `no rule, family or measure called "${id}". Try: patina rules` : 'explain needs a rule id');
      console.log(argv.includes('--json') ? JSON.stringify(e, null, 2) : Object.entries(e).map(([k, v]) => `${k.padEnd(9)} ${Array.isArray(v) ? v.join(', ') : v}`).join('\n'));
      return 0;
    }
    if (cmd === 'rules') {
      const p = arg(argv, 'profile');
      if (p && !PROFILES.includes(p)) throw new Error(`unknown profile "${p}"`);
      const r = rules(p);
      console.log(argv.includes('--json') ? JSON.stringify(r, null, 2) : r.map((x) => `${x.id.padEnd(22)} ${x.family}`).join('\n'));
      return 0;
    }
    if (cmd === 'profiles') {
      const p = profiles();
      console.log(argv.includes('--json') ? JSON.stringify(p, null, 2) : p.map((x) => `${x.name.padEnd(12)} hard fails: ${x.hard.join(', ') || 'none'}`).join('\n'));
      return 0;
    }
    if (cmd === 'init') {
      if (existsSync('.patinarc.json')) throw new Error('.patinarc.json already exists here');
      writeFileSync('.patinarc.json', JSON.stringify(STARTER, null, 2) + '\n');
      console.log('Wrote .patinarc.json');
      return 0;
    }
    if (cmd === 'mcp') {
      const { serve } = await import('./mcp.mjs');
      serve();
      return null;
    }
    const r = spawnSync(process.execPath, [join(HERE, 'patina.mjs'), ...argv], { stdio: 'inherit' });
    return r.status ?? 2;
  } catch (e) {
    console.error(`patina: ${e.message}`);
    return 2;
  }
}

// realpath: npm links the bin through a symlink on macOS and Linux.
const isMain = () => { try { return realpathSync(fileURLToPath(import.meta.url)).toLowerCase() === realpathSync(process.argv[1]).toLowerCase(); } catch { return false; } };
if (process.argv[1] && isMain()) {
  main(process.argv.slice(2)).then((code) => { if (code !== null) process.exitCode = code; });
}
