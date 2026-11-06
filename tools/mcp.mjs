// Patina MCP server (Model Context Protocol, stdio transport). No dependencies, no key, no network.
// It runs on the user's own machine, started by their AI app: `npx -y github:taxmanhaven/patina-showcase mcp`.
// Tools: patina_check, patina_explain, patina_rules, patina_profiles. Prompt: rewrite_with_patina.
import { createInterface } from 'node:readline';
import { VERSION, PROFILES, lint, explain, rules, profiles } from './lint.mjs';

const SUPPORTED = ['2025-06-18', '2025-03-26', '2024-11-05'];
const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export const TOOLS = [
  {
    name: 'patina_check',
    title: 'Check a draft',
    description: 'Mark the lines in a draft that read as machine-written and say why. Returns each mark with line, column, severity, rule and a plain reason, plus pass or fail for the chosen profile. Use it on your own draft before handing it over, then rewrite only the marked lines in the writer\'s voice. Never swap words to dodge a rule: fix the sentence.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The draft to check (plain text or Markdown).' },
        profile: { type: 'string', enum: PROFILES, description: 'Who reads it. fiction, web (default), email, pro-email, technical, playful, captions, spoken, headline, testimonial, ui.' },
        disable: { type: 'array', items: { type: 'string' }, description: 'Rule ids, families or measures to switch off.' },
      },
      required: ['text'],
    },
    annotations: { title: 'Check a draft', ...RO },
  },
  {
    name: 'patina_explain',
    title: 'Explain a mark',
    description: 'What a Patina rule, family or measure means and how to fix it.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'A rule id from patina_check, such as nxy-its-not, or a family such as triplet.' } }, required: ['id'] },
    annotations: { title: 'Explain a mark', ...RO },
  },
  {
    name: 'patina_rules',
    title: 'List rules',
    description: 'Every rule Patina checks, optionally for one profile.',
    inputSchema: { type: 'object', properties: { profile: { type: 'string', enum: PROFILES } } },
    annotations: { title: 'List rules', ...RO },
  },
  {
    name: 'patina_profiles',
    title: 'List profiles',
    description: 'The reader profiles and what fails each one outright.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { title: 'List profiles', ...RO },
  },
];

export const PROMPTS = [
  {
    name: 'rewrite_with_patina',
    title: 'Rewrite with Patina',
    description: 'Check a draft, rewrite only the marked lines in the writer\'s own voice, and check again.',
    arguments: [
      { name: 'text', description: 'The draft', required: true },
      { name: 'profile', description: `One of: ${PROFILES.join(', ')}`, required: false },
    ],
  },
];

function summary(res) {
  const head = `Patina ${res.version}, profile ${res.profile}: ${res.pass ? 'pass' : 'fail'} (${res.findings.length} marks, ${res.words} words)`;
  const fails = res.pass ? [] : [`Fails: ${res.fails.join('; ')}`];
  const marks = res.findings.map((f) => `L${f.line}:${f.column} ${f.severity} ${f.rule}: "${f.excerpt.replace(/\s+/g, ' ').slice(0, 80)}". ${f.reason}`);
  return [head, ...fails, ...marks].join('\n');
}

const ok = (data, text) => ({ content: [{ type: 'text', text: text ?? JSON.stringify(data, null, 2) }], structuredContent: data });
const bad = (msg) => ({ content: [{ type: 'text', text: msg }], isError: true });

export function callTool(name, args = {}) {
  if (name === 'patina_check') {
    if (typeof args.text !== 'string' || !args.text.trim()) return bad('patina_check needs some text.');
    const profile = args.profile || 'web';
    if (!PROFILES.includes(profile)) return bad(`Unknown profile "${profile}". Use: ${PROFILES.join(', ')}`);
    const res = lint(args.text, { profile, disable: Array.isArray(args.disable) ? args.disable : [] });
    return ok(res, summary(res));
  }
  if (name === 'patina_explain') {
    const e = explain(String(args.id || ''));
    return e ? ok(e) : bad(`No rule, family or measure called "${args.id}". Call patina_rules for the list.`);
  }
  if (name === 'patina_rules') {
    if (args.profile && !PROFILES.includes(args.profile)) return bad(`Unknown profile "${args.profile}".`);
    return ok({ rules: rules(args.profile) });
  }
  if (name === 'patina_profiles') return ok({ profiles: profiles() });
  return null;
}

export function getPrompt(name, args = {}) {
  if (name !== 'rewrite_with_patina') return null;
  const profile = args.profile || 'web';
  return {
    description: 'Check, rewrite the marked lines, check again.',
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: [
          `Run patina_check on the draft below with profile "${profile}".`,
          'Rewrite only the lines it marks. Keep the writer\'s voice, facts and meaning; change the sentence, not just a word. Leave unmarked lines alone.',
          'Run patina_check again on your rewrite. Stop when it passes or when the remaining marks are deliberate, and say which you kept and why.',
          '',
          'Draft:',
          String(args.text || ''),
        ].join('\n'),
      },
    }],
  };
}

export function handle(msg) {
  const { id, method, params = {} } = msg;
  const reply = (result) => ({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
  if (id === undefined || id === null) return null; // notifications need no answer
  switch (method) {
    case 'initialize':
      return reply({
        protocolVersion: SUPPORTED.includes(params.protocolVersion) ? params.protocolVersion : SUPPORTED[0],
        capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
        serverInfo: { name: 'patina', title: 'Patina', version: VERSION },
        instructions: 'Patina marks the lines in a draft that read as machine-written and says why. Call patina_check on your draft before you hand it over, then rewrite only the marked lines in the writer\'s voice. It works offline and never changes the text itself.',
      });
    case 'ping': return reply({});
    case 'tools/list': return reply({ tools: TOOLS });
    case 'tools/call': {
      try {
        const r = callTool(params.name, params.arguments || {});
        return r ? reply(r) : fail(-32602, `Unknown tool: ${params.name}`);
      } catch (e) {
        return reply(bad(`Patina error: ${e.message}`));
      }
    }
    case 'prompts/list': return reply({ prompts: PROMPTS });
    case 'prompts/get': {
      const p = getPrompt(params.name, params.arguments || {});
      return p ? reply(p) : fail(-32602, `Unknown prompt: ${params.name}`);
    }
    default: return fail(-32601, `Method not found: ${method}`);
  }
}

export function serve(input = process.stdin, output = process.stdout) {
  const rl = createInterface({ input, crlfDelay: Infinity });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { output.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n'); return; }
    const batch = Array.isArray(msg) ? msg : [msg];
    for (const m of batch) {
      const r = handle(m);
      if (r) output.write(JSON.stringify(r) + '\n');
    }
  });
  process.stderr.write(`patina ${VERSION} MCP server ready on stdio\n`);
}
