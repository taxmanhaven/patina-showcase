// Tests for the lint layer, the command line and the MCP server (v0.7.4 packaging).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lint, explain, rules, profiles } from '../lint.mjs';
import { handle, callTool, TOOLS } from '../mcp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, '..', 'cli.mjs');
const DASH = '—';
const BAD = `It is not just a tool, it is a journey. Moreover, we delve into it ${DASH} fast.\n`;
const run = (args, opts = {}) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', ...opts });

test('lint gives line, column and severity for each mark', () => {
  const r = lint(BAD, { profile: 'web' });
  assert.equal(r.pass, false);
  const dash = r.findings.find((f) => f.rule === 'em-dash');
  assert.equal(dash.line, 1);
  assert.equal(BAD.slice(dash.column - 1, dash.endColumn - 1), DASH);
  assert.equal(dash.severity, 'error');
  const delve = r.findings.find((f) => f.excerpt === 'delve');
  assert.equal(BAD.slice(delve.column - 1, delve.endColumn - 1), 'delve');
  assert.ok(r.findings.every((f) => f.reason && f.category));
});

test('disable switches off a rule, a family and a measure, and the gate follows', () => {
  const r = lint(BAD, { profile: 'web', disable: ['em-dash', 'not-x-but-y', 'score', 'specificity'] });
  assert.ok(!r.findings.some((f) => f.rule === 'em-dash' || f.family === 'not-x-but-y'));
  assert.deepEqual(r.fails, []);
  assert.equal(r.pass, true);
});

test('clean human text passes', () => {
  const r = lint('We open at 9 on Saturday. Bring the blue form and £5 for parking.\n', { profile: 'web' });
  assert.equal(r.pass, true, r.fails.join('; '));
});

test('explain covers rules, families, built-in rules and measures; unknown is null', () => {
  assert.equal(explain('nxy-its-not').family, 'not-x-but-y');
  assert.equal(explain('stock-phrase').kind, 'family');
  assert.equal(explain('afterthought-aside').kind, 'rule');
  assert.equal(explain('rhythm').kind, 'measure');
  assert.equal(explain('no-such-rule'), null);
  assert.ok(rules('fiction').length > 10);
  assert.ok(profiles().some((p) => p.name === 'ui'));
});

test('cli: exit 1 on a failed gate, 0 with --fail-on never, 2 on bad usage', () => {
  const dir = mkdtempSync(join(tmpdir(), 'patina-'));
  const f = join(dir, 'draft.md');
  writeFileSync(f, BAD);
  assert.equal(run(['check', f]).status, 1);
  assert.equal(run(['check', f, '--fail-on', 'never']).status, 0);
  assert.equal(run(['check', f, '--profile', 'nope']).status, 2);
  assert.equal(run(['check']).status, 2);
  const j = JSON.parse(run(['check', f, '--format', 'json']).stdout);
  assert.equal(j.profile, 'web');
  assert.match(run(['check', f, '--format', 'github']).stdout, /^::error file=.*line=1,col=\d+/m);
});

test('cli: .patinarc.json sets the profile and switches rules off', () => {
  const dir = mkdtempSync(join(tmpdir(), 'patina-'));
  writeFileSync(join(dir, '.patinarc.json'), JSON.stringify({ profiles: { '.txt': 'email' }, disable: ['em-dash', 'not-x-but-y', 'score', 'specificity', 'connector', 'style-word'] }));
  writeFileSync(join(dir, 'note.txt'), BAD);
  const j = JSON.parse(run(['check', join(dir, 'note.txt'), '--format', 'json']).stdout);
  assert.equal(j.profile, 'email');
  assert.ok(!j.findings.some((f) => f.rule === 'em-dash'));
});

test('cli: reads stdin with -', () => {
  const r = run(['check', '-', '--format', 'json'], { input: BAD });
  assert.equal(JSON.parse(r.stdout).file, 'stdin');
});

test('mcp: initialize, list and call', () => {
  const init = handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
  assert.equal(init.result.protocolVersion, '2025-03-26');
  assert.equal(init.result.serverInfo.name, 'patina');
  assert.equal(handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  assert.deepEqual(handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' }).result.tools.map((t) => t.name), TOOLS.map((t) => t.name));
  const c = callTool('patina_check', { text: BAD, profile: 'web' });
  assert.equal(c.structuredContent.pass, false);
  assert.match(c.content[0].text, /em-dash/);
  assert.equal(callTool('patina_check', { text: '' }).isError, true);
  assert.equal(callTool('patina_explain', { id: 'nope' }).isError, true);
  assert.equal(handle({ jsonrpc: '2.0', id: 3, method: 'nope' }).error.code, -32601);
  assert.match(handle({ jsonrpc: '2.0', id: 4, method: 'prompts/get', params: { name: 'rewrite_with_patina', arguments: { text: 'x' } } }).result.messages[0].content.text, /patina_check/);
});

test('mcp: stdio server answers over newline-delimited JSON', async () => {
  const p = spawn(process.execPath, [CLI, 'mcp'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = [];
  let buf = '';
  const got = new Promise((res) => p.stdout.on('data', (d) => { buf += d; const parts = buf.split('\n'); buf = parts.pop(); lines.push(...parts); if (lines.length >= 2) res(); }));
  p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } }) + '\n');
  p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'patina_check', arguments: { text: BAD } } }) + '\n');
  await got;
  p.kill();
  assert.equal(JSON.parse(lines[0]).result.protocolVersion, '2025-06-18');
  assert.equal(JSON.parse(lines[1]).result.structuredContent.pass, false);
});

test('code blocks, inline code and image marks are not prose', () => {
  const md = 'Run this:\n\n```bash\nnpx patina check -- draft.md\n```\n\nUse `delve` as an example. ![A picture](x.png)\n';
  const r = lint(md, { profile: 'technical' });
  assert.ok(!r.findings.some((f) => ['em-dash', 'exclamation', 'style-words'].includes(f.rule)), JSON.stringify(r.findings));
  assert.ok(lint(md, { profile: 'technical', code: true }).findings.some((f) => f.rule === 'style-words'));
});
