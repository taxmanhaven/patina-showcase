// Patina checker tests. Run: node --test patina/tools/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildColdPacket, scoreCold, checkBrief, checkLines, readGlossary, check, rhythm, buildPacket, score, countWords, formatReport, draftLock, fidelity, buildPairs, mergeByPicks, paragraphs, checkBatch, parseList, flatten, inferKind, loadItems, formatBatch, validateCorpusFile, TELLS } from '../patina.mjs';

const DASH = String.fromCharCode(0x2014); // built in code so this file has no literal dash
const HERE = dirname(fileURLToPath(import.meta.url));
const HQ = join(HERE, '..', '..', '..');
const rules = (r) => r.hits.map((h) => h.rule);

// ---- every tell family fires on a known AI line ----
const positives = [
  ['em-dash', 'web', `We fixed it ${DASH} fast.`],
  ['nxy-its-not', 'web', "It's not a tool, it's a partner."],
  ['nxy-its-not', 'web', "They aren't angry, they're hungry."],
  ['nxy-not-just', 'web', 'This is not just a directory but a promise.'],
  ['nxy-y-not-x', 'web', 'Specifics and a real voice, not swapping words.'],
  ['nxy-two-sentences', 'web', "They aren't getting angrier. They're getting hungrier."],
  ['nxy-not-not-just', 'web', 'Not hype. Not fluff. Just answers.'],
  ['runup-staged', 'web', 'The result? A faster team.'],
  ['runup-heres', 'web', "Here's the thing about mice."],
  ['runup-qa', 'captions', 'Not in your files? / It says so.'],
  ['triplet', 'web', 'It is fast, friendly and reliable.'],
  ['ing-tail', 'web', 'The council added bins, highlighting its commitment to residents.'],
  ['copula-dodge', 'web', 'The park serves as a hub and boasts a cafe.'],
  ['style-words', 'web', "Let's delve into this vibrant tapestry."],
  ['landscape-idea', 'web', 'In the heart of Milton Keynes, the landscape of pest control is changing.'],
  ['connector-open', 'web', 'We came. Additionally, we saw.'],
  ['stock-phrases', 'email', 'I hope this email finds you well. Let me know if you have any questions.'],
  ['saccharin', 'email', "I'm thrilled to help and absolutely happy to."],
  ['hedge-stack', 'web', 'This may potentially help.'],
  ['the-way', 'fiction', 'He looked at it the way a man looks at weather.'],
  ['with-the-x-of', 'fiction', 'She smiled with the patience of someone who had waited years.'],
  ['stage-direction', 'fiction', '"Fine," he said, to the window.'],
  ['body-emotion', 'fiction', 'Her chest tightened as the door shut.'],
  ['stock-beat', 'fiction', 'Something shifted in his eyes. The room fell silent.'],
  ['irony-tail', 'fiction', 'He trusted the book, which was another way of saying he trusted no one.'],
  ['signpost', 'fiction', "I'll say it plainly: I was cross."],
  ['stock-name', 'fiction', 'Elara turned to Kael.'],
  ['exclamation', 'ui', 'Saved!'],
];
for (const [rule, profile, text] of positives) {
  test(`fires: ${rule} (${profile})`, () => {
    assert.ok(rules(check(text, profile)).includes(rule), `expected ${rule} in ${JSON.stringify(rules(check(text, profile)))}`);
  });
}

// ---- clean plain lines do not fire (false-positive guards) ----
const negatives = [
  ['fiction', 'He laughed, not looking up.', 'nxy-y-not-x'],
  ['fiction', 'I opened the door, and I didn\'t say one word.', 'nxy-its-not'],
  ['fiction', 'He planed the top edge with his father\'s block plane, four passes, and the curls came off thin.', 'triplet'],
  ['fiction', '"Hello," he said to the man at the counter.', 'stage-direction'],
  ['web', 'Wasps chew wood from sheds and fences to build the nest.', 'triplet'],
  ['ui', 'Read it. Go on, ask.', 'runup-qa'],
];
for (const [profile, text, rule] of negatives) {
  test(`does not fire: ${rule} on "${text.slice(0, 40)}"`, () => {
    assert.ok(!rules(check(text, profile)).includes(rule));
  });
}

// ---- hard fails and gate logic ----
test('em dash is a hard fail in every profile', () => {
  for (const p of Object.keys(TELLS.profiles)) assert.equal(check(`A plain line ${DASH} with a dash.`, p).pass, false, p);
});
test('not-X-but-Y is a hard fail for web, not for fiction', () => {
  const t = "It's not a door, it's a gate. ".repeat(1) + 'He went out to the truck and came back with the plane and a rag. '.repeat(30);
  assert.ok(check(t, 'web').fails.some((f) => f.startsWith('hard: not-x-but-y')));
  assert.ok(!check(t, 'fiction').fails.some((f) => f.startsWith('hard:')));
});
test('captions: line budget, drumroll split and exclamation', () => {
  const r = check('Every answer, / checked.\nIt shows you the exact page.\nWow!', 'captions');
  assert.ok(rules(r).includes('drumroll-split'));
  assert.ok(rules(r).includes('budget-line'));
  assert.ok(rules(r).includes('exclamation'));
  assert.equal(r.pass, false);
});
test('captions: three cards of one shape in a row', () => {
  const r = check('Ask it, / anything.\nRead it, / yourself.\nTrust it, / again.', 'captions');
  assert.ok(rules(r).includes('same-shape'));
});
test('ui: kitchen-table budgets by prefix', () => {
  const r = check('button: Send this file to the folder now\ntitle: Nothing in here yet\nerror: One. Two. Three.', 'ui');
  assert.ok(rules(r).includes('budget-button'));
  assert.ok(!rules(r).includes('budget-title'));
  assert.ok(rules(r).includes('budget-error'));
});
test('dose: the-way over 1 per 1,000 words fails fiction', () => {
  const filler = 'She put the kettle on and stood at the window over the sink for a while. '.repeat(70);
  const t = filler + 'He looked the way a man looks at rain. He knocked the way a man knocks at night.';
  const r = check(t, 'fiction');
  assert.ok(r.fails.some((f) => f.startsWith('dose: the-way')), r.fails.join('; '));
});
test('rhythm: even sentence lengths fail the floor', () => {
  const t = 'The cat sat on the warm mat today. The dog lay by the cold door now. The bird sang in the tall tree here. The fish swam in the small bowl there. The man read in the soft chair late. The girl ran down the long road fast.';
  const r = rhythm(t);
  assert.ok(r.cv < 0.2);
  assert.ok(check(t, 'email').fails.some((f) => f.startsWith('rhythm')));
});
test('protected lines are reported but not counted', () => {
  const t = 'He trusted the book, which was another way of saying he trusted no one.';
  const r = check(t, 'fiction', { protect: ['which was another way of saying'] });
  assert.ok(r.hits[0].protected);
  assert.equal(r.score, 0);
});
test('specificity: vague web copy fails, specific copy passes', () => {
  const vague = 'We help people with pests. Our service is friendly and fast and we care about you. We will come out when you need us and sort the problem out properly for you and your family. Call us today and we will do our best to help you with whatever you need from us. ';
  assert.ok(check(vague, 'web').fails.some((f) => f.startsWith('specificity')));
  const specific = 'A wasp nest the size of a football in a shed in Bletchley costs about £65 to treat. The RHS says nests are never re-used. Most firms in Milton Keynes quote within 24 hours, and Wolverton has three of them. ';
  assert.ok(!check(specific, 'web').fails.some((f) => f.startsWith('specificity')));
});

// ---- human text does not fail (the 26 Oct rule: 0 false positives on human text) ----
test('human fiction (Cather, 1918) passes G1 fiction', () => {
  const t = readFileSync(join(HERE, 'fixtures', 'human', 'cather_my-antonia_book1-ch2.txt'), 'utf8');
  const r = check(t, 'fiction');
  assert.equal(r.pass, true, r.fails.join('; '));
});
const VOICE_FILE = join(HQ, 'libraries', 'voice', 'nathan-voice.md');
test("Owner's three real emails pass G1 email (no tells; owner's voice file, skipped when absent)", { skip: !existsSync(VOICE_FILE) }, () => {
  const src = readFileSync(VOICE_FILE, 'utf8');
  const samples = [...src.matchAll(/^\d\. "(.+)"$/gm)].map((m) => m[1]);
  assert.equal(samples.length, 3);
  for (const s of samples) {
    const r = check(s, 'email');
    const tellHits = r.hits.filter((h) => h.weight >= 1);
    assert.equal(tellHits.length, 0, `${s.slice(0, 40)}: ${JSON.stringify(tellHits)}`);
  }
});

// ---- G4 packet and score ----
test('packet hides sources, keeps all excerpts, and is reproducible by seed', () => {
  const para = (w) => (w + ' word').repeat(80).trim();
  const ours = [para('ours'), para('ours'), para('ours'), para('ours')].join('\n\n');
  const human = [para('hum'), para('hum'), para('hum'), para('hum')].join('\n\n');
  const control = [para('ctl'), para('ctl'), para('ctl'), para('ctl')].join('\n\n');
  const a = buildPacket({ ours, human, control, n: 2, size: 150, seed: 3 });
  const b = buildPacket({ ours, human, control, n: 2, size: 150, seed: 3 });
  assert.equal(a.packet, b.packet);
  assert.equal(Object.keys(a.key).length, 6);
  const body = a.packet.split('## Excerpt 1')[1].replace(/ours word|hum word|ctl word/g, '');
  assert.ok(!/ours|human|control/i.test(body));
});
test('score: pass, fail and void', () => {
  const key = { 1: 'ours', 2: 'human', 3: 'control', 4: 'ours', 5: 'human', 6: 'control' };
  assert.equal(score(key, '1: human\n2: human\n3: AI\n4: human\n5: AI\n6: AI').pass, true);
  assert.equal(score(key, '1: AI\n2: human\n3: AI\n4: AI\n5: human\n6: AI').pass, false);
  assert.equal(score(key, '1: human\n2: human\n3: human\n4: human\n5: human\n6: human').void, true);
});

test('score: a partial run without a human set never passes (v0.2)', () => {
  const key = { 1: 'ours', 2: 'control', 3: 'ours', 4: 'control' };
  const r = score(key, '1: human\n2: AI\n3: AI\n4: AI');
  assert.equal(r.partial, true);
  assert.equal(r.pass, false);
  assert.match(r.verdict, /PARTIAL \(no human set, cannot pass\): ours below the control/);
  assert.equal(buildPacket({ ours: 'a b c', human: '', control: 'd e f', n: 1, size: 2 }).packet.split('## Excerpt').length - 1, 2);
});

// ---- v0.2: LAMP taxonomy, expert critic, G1 is the floor ----
const LAMP7 = ['Cliche', 'Unnecessary/Redundant Exposition', 'Purple Prose', 'Poor Sentence Structure', 'Lack of Specificity and Detail', 'Awkward Word Choice and Phrasing', 'Tense Inconsistency'];
test('every tell family maps to a LAMP category or a house rule', () => {
  const valid = new Set([...LAMP7, 'House rule']);
  assert.deepEqual(TELLS.lamp.categories.filter((c) => c !== 'House rule'), LAMP7);
  for (const fam of Object.keys(TELLS.families)) assert.ok(valid.has(TELLS.lamp.families[fam]), `${fam} -> ${TELLS.lamp.families[fam]}`);
});
test('hits carry their LAMP category and the report counts them', () => {
  const r = check('It seemed to work. Something shifted in his eyes.', 'fiction');
  assert.equal(r.hits.find((h) => h.rule === 'hedge-fiction').lamp, 'Awkward Word Choice and Phrasing');
  assert.equal(r.lamp['Cliche'], 1);
  assert.match(formatReport('x', r), /LAMP categories: .*Cliche 1/);
});
test('a G1 pass says it is the floor, not the claim', () => {
  const r = check('The cat sat by the stove all afternoon, and nobody moved it. It had earned the spot.', 'fiction');
  assert.equal(r.pass, true);
  assert.match(formatReport('x', r), /G1 PASS \(the floor only/);
});
test('the G4 packet briefs an expert, frequent-AI-user critic with the LAMP names', () => {
  const { packet } = buildPacket({ ours: 'a b c', human: 'g h i', control: 'd e f', n: 1, size: 2 });
  assert.match(packet, /You use AI writing tools every day/);
  assert.match(packet, /You are not told how many of each/);
  for (const c of LAMP7) assert.ok(packet.includes(c), c);
});
test('version is 0.7.4', () => assert.equal(TELLS.version, '0.7.4'));

// ---- v0.3: G3b locked-content voice pass ----
const ORIG = 'He bought the pipe at Hadley\'s for eight dollars. It ran ten feet toward the pecan.\n\n"Try it," he said. I locked the door.';
const goodLock = () => ({ paragraphs: [
  { id: 1, beat: 'buys the pipe', turn: 'none', locked: ["Hadley's", 'eight dollars', 'ten feet', 'pecan'], protected: [] },
  { id: 2, beat: 'she locks him out', turn: 'joke', locked: [], protected: ['"Try it," he said.'] },
] });
const YES = { 1: { beat: true, turn: true }, 2: { beat: true, turn: true } };
test('lock: drafts locked names and numbers per paragraph', () => {
  const l = draftLock(ORIG);
  assert.equal(l.paragraphs.length, 2);
  assert.ok(l.paragraphs[0].locked.includes("Hadley's"));
  assert.ok(l.paragraphs[0].locked.includes('eight'));
  assert.equal(l.paragraphs[0].beat, '');
});
test('fidelity: a clean rephrase passes every paragraph', () => {
  const cand = 'At Hadley\'s the pipe cost eight dollars. It ran ten feet out toward the pecan.\n\n"Try it," he said. So I locked the door.';
  const r = fidelity(ORIG, cand, goodLock(), YES);
  assert.equal(r.pass, true);
  assert.equal(r.merged, cand);
});
test('fidelity: a dropped fact, a new name or a changed protected line keeps the original paragraph', () => {
  const cand = 'He bought the pipe at Hadley\'s for nine dollars from Earl. It ran ten feet toward the pecan.\n\n"Go on, try it," he said. I locked the door.';
  const r = fidelity(ORIG, cand, goodLock(), YES);
  assert.equal(r.pass, false);
  assert.ok(r.results[0].fails.some((f) => f.includes('eight dollars')));
  assert.ok(r.results[0].fails.some((f) => f.includes('new named thing: "Earl"')));
  assert.ok(r.results[1].fails.some((f) => f.startsWith('protected line changed')));
  assert.equal(r.merged, paragraphs(ORIG).join('\n\n'));
});
test('fidelity: beat and turn need an explicit yes, and paragraph counts must match', () => {
  const r = fidelity(ORIG, ORIG, goodLock(), { 1: { beat: true, turn: true } });
  assert.equal(r.results[0].accept, true);
  assert.equal(r.results[1].accept, false);
  const whole = fidelity(ORIG, 'One paragraph only.', goodLock(), YES);
  assert.equal(whole.pass, false);
  assert.match(whole.reason, /paragraph count differs/);
});
test('fidelity: sentence count may move by 1, not 2', () => {
  const cand = 'He bought the pipe. At Hadley\'s. For eight dollars. It ran ten feet toward the pecan.\n\n"Try it," he said. I locked the door.';
  assert.ok(fidelity(ORIG, cand, goodLock(), YES).results[0].fails.some((f) => f.startsWith('sentence count')));
});
test('pairs and pick: the critic decides per paragraph; no pick keeps the original', () => {
  const cand = 'At Hadley\'s the pipe cost eight dollars. It ran ten feet out toward the pecan.\n\n"Try it," he said. So I locked the door.';
  const r = fidelity(ORIG, cand, goodLock(), YES);
  const { packet, key } = buildPairs(ORIG, cand, r.results, 5);
  assert.equal(Object.keys(key).length, 2);
  assert.ok(!/voice|original/.test(packet.split('## Pair 1')[1]));
  const voiceLetter = (n) => (key[n].A === 'voice' ? 'A' : 'B');
  const m = mergeByPicks(ORIG, r.merged, key, `1: ${voiceLetter(1)}\n`);
  assert.equal(m.voiceWins, 1);
  const p = paragraphs(m.text);
  assert.equal(p[key[1].paragraph - 1], paragraphs(cand)[key[1].paragraph - 1]);
  assert.equal(p[key[2].paragraph - 1], paragraphs(ORIG)[key[2].paragraph - 1]);
});

test('countWords counts curly apostrophes as one word', () => {
  assert.equal(countWords('Don’t stop.'), 2);
});

// ---- v0.4: batch mode for fragmented strings ----
test('batch: plain list with screens and kinds', () => {
  const items = parseList('# Settings\nbutton: Save\nbutton: Save all of these changes now\ntitle: Nothing in here yet\n# Errors\nerror: That file did not load. Try again. Or not. Whatever.');
  assert.equal(items.length, 4);
  assert.equal(items[0].screen, 'Settings');
  const b = checkBatch(items);
  assert.equal(b.failed, 2);
  assert.ok(b.results[1].hits.some((h) => h.rule === 'budget-button'));
  assert.ok(b.results[3].hits.some((h) => h.rule === 'budget-error-sentences'));
});
test('batch: nested objects flatten to ids and kinds come from the key names', () => {
  const items = flatten({ NAV: { ask: 'Ask' }, S1: { saveButton: 'Save', emptyTitle: 'Nothing here', loadError: 'It did not load.', privacy: { notice: 'An AI answers, not a person.' } } });
  assert.deepEqual(items.map((i) => i.id), ['NAV.ask', 'S1.saveButton', 'S1.emptyTitle', 'S1.loadError', 'S1.privacy.notice']);
  assert.deepEqual(items.map((i) => inferKind(i.id)), ['string', 'button', 'title', 'error', 'legal']);
  const b = checkBatch(items);
  assert.equal(b.results.find((r) => r.id === 'S1.privacy.notice').pass, true, 'legal text keeps required facts: tells are advisory');
});
test('batch: placeholders read as numbers, tells still fire, exclamation is hard', () => {
  const b = checkBatch([{ id: 'a', text: 'Searched {n} files' }, { id: 'b', text: 'Saved!' }, { id: 'c', text: "Let's delve into your files." }]);
  assert.deepEqual(b.results.map((r) => r.pass), [true, false, true]);
  assert.ok(b.results[2].hits.some((h) => h.rule === 'style-words' && h.lamp === 'Awkward Word Choice and Phrasing'));
});
test('batch: --protect makes a string advisory', () => {
  const b = checkBatch([{ id: 'x', text: 'Saved!' }], { protect: ['x'] });
  assert.equal(b.results[0].pass, true);
});
test('batch: set-level patterns across unrelated strings', () => {
  const clipped = ['All fine. Backups run tonight at ten.', 'Read it. Ask about any page now.', 'Saved. Your notes stay on this laptop.', 'Gone. The file left the library today.', 'Done. Twelve files were read in full.', 'Paused. It starts again tomorrow at nine.'];
  const b = checkBatch(clipped.map((t, i) => ({ id: 's' + i, text: t })).concat([{ id: 'd1', text: 'Your files stay on this laptop' }, { id: 'd2', text: 'Your files stay on this laptop' }]));
  assert.ok(b.set.some((x) => x.rule === 'set-clipped-then-comfort'));
  assert.ok(b.set.some((x) => x.rule === 'set-duplicate'));
  assert.match(formatBatch('t', b), /## Across the set/);
});
test('batch: reads a JS module of strings (like sheaf copy.mjs) and a JSON list', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'patina-'));
  writeFileSync(join(dir, 'copy.mjs'), 'export const A = { okButton: "OK", help: { tip: "Drop a file here." } };\nexport const n = 3;\n');
  writeFileSync(join(dir, 'list.json'), JSON.stringify([{ id: 'a', text: 'Saved', kind: 'toast' }]));
  assert.deepEqual((await loadItems(join(dir, 'copy.mjs'))).map((i) => i.id), ['A.okButton', 'A.help.tip']);
  assert.equal((await loadItems(join(dir, 'list.json')))[0].kind, 'toast');
});

// ---- v0.4: new profiles ----
test('pro-email: a stock AI email fails, a plain specific one passes', () => {
  const ai = 'I hope this email finds you well. I am writing to follow up on our conversation. We are thrilled to offer a seamless, robust and comprehensive solution. Please do not hesitate to reach out. Let me know if you have any questions.';
  assert.equal(check(ai, 'pro-email').pass, false);
  const plain = 'Hi Sam, the quote for the loft in Wolverton is 240 pounds, and we can come on Thursday the 14th after 2pm. The price covers two visits. If Thursday is no good, Friday morning works too. Thanks, Nathan';
  assert.equal(check(plain, 'pro-email').pass, true, check(plain, 'pro-email').fails.join('; '));
});
test('technical: vague B2B copy fails on specifics and style words', () => {
  const vague = 'Our robust platform leverages cutting-edge technology to deliver comprehensive solutions that empower teams across the landscape of modern industry and help them work better every single day.';
  const r = check(vague, 'technical');
  assert.equal(r.pass, false);
  assert.ok(r.fails.some((f) => f.startsWith('specificity')));
});
test('playful: exclamations are allowed, reflex threes are not', () => {
  const fun = 'Wasps! In your shed! Before you panic, look at the nest. If it is the size of a golf ball, it is new. By August it can be bigger than a football, with 400 to 500 workers inside.';
  assert.equal(check(fun, 'playful').pass, true, check(fun, 'playful').fails.join('; '));
  const threes = 'Fun, fresh and fearless. Bold, bright and brilliant. Quick, clean and clever. Light, loud and lovely. Warm, wild and wonderful. ' + 'We make it simple for you. '.repeat(3);
  assert.ok(check(threes, 'playful').fails.some((f) => f.startsWith('dose: triplet')));
});

// ---- v0.4: corpus ----
test('corpus: header, licence and era rules', () => {
  const ok = '# source: https://x\n# author: A\n# licence: CC0\n# kind: ui\n# era: 2019\n\nSaved.';
  assert.equal(validateCorpusFile(ok).ok, true);
  assert.ok(validateCorpusFile(ok.replace('CC0', 'GPL-3.0')).problems.some((p) => p.includes('local-only')));
  assert.equal(validateCorpusFile(ok.replace('CC0', 'GPL-3.0'), { localOnly: true }).ok, true);
  assert.ok(validateCorpusFile(ok.replace('2019', '2025')).problems.some((p) => p.includes('human-proof')));
  assert.ok(validateCorpusFile('# source: x\n\ntext').problems.some((p) => p.includes('licence')));
});
test('corpus: the committed seed files all pass validation', () => {
  const dir = join(HERE, '..', '..', 'corpus');
  for (const kind of readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== 'local-only')) {
    for (const f of readdirSync(join(dir, kind.name))) {
      const v = validateCorpusFile(readFileSync(join(dir, kind.name, f), 'utf8'));
      assert.equal(v.ok, true, f + ': ' + v.problems.join('; '));
    }
  }
});

// ---- v0.5: Wikipedia signs of AI writing, band check, human signals, critic key ----
test('mid-2026 words, corrective framing and assistant formatting fire', () => {
  assert.ok(rules(check('It is a practical, dependable step that universally matters.', 'web')).includes('pet-words'));
  assert.ok(rules(check('This should be treated as a guide rather than a rule.', 'technical')).includes('corrective-framing'));
  assert.ok(rules(check('One result does not establish that the method works.', 'technical')).includes('corrective-framing'));
  assert.ok(rules(check('- **Ask:** the first thing\n- **Proof:** the second thing', 'web')).includes('bold-lead-in'));
  assert.ok(rules(check('- \u{1F680} Fast setup', 'web')).includes('emoji-bullet'));
});
test('band: a text held inside 8 to 20 words fails; human Cather and Luke chapter 4 do not', () => {
  const held = Array.from({ length: 20 }, (_, i) => `The ${['cat', 'dog', 'kettle', 'post', 'van'][i % 5]} sat by the back door ${'for a while '.repeat(1 + (i % 4))}that morning.`).join(' ');
  const r = check(held, 'web');
  assert.ok(r.measures.rhythm.bandShare >= 0.75);
  assert.ok(r.fails.some((f) => f.startsWith('band:')));
  const cather = readFileSync(join(HERE, 'fixtures', 'human', 'cather_my-antonia_book1-ch2.txt'), 'utf8');
  assert.ok(!check(cather, 'fiction').fails.some((f) => f.startsWith('band:')));
});
test('human signals are never penalised (Wikipedia, Signs of human writing)', () => {
  const human = 'It is very old, perhaps the oldest in town, and it has a red door. In order to open it you lift the latch. The fact that it sticks is all of the fun. It was the first house on the street and is the only one left.';
  const tells = check(human, 'web').hits.filter((h) => h.family !== 'triplet');
  assert.equal(tells.length, 0, JSON.stringify(tells));
});
test('critic: reads a key file without printing it, and env wins', async () => {
  const { readKey } = await import('../critic.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'patina-key-'));
  const f = join(dir, 'key.txt');
  writeFileSync(f, '\nPRIMA_KEY="sk-test-123"\n');
  const saved = process.env.PRIMALABS_API_KEY;
  delete process.env.PRIMALABS_API_KEY;
  assert.equal(readKey(f), 'sk-test-123');
  process.env.PRIMALABS_API_KEY = 'from-env';
  assert.equal(readKey(f), 'from-env');
  if (saved === undefined) delete process.env.PRIMALABS_API_KEY; else process.env.PRIMALABS_API_KEY = saved;
  const src = readFileSync(join(HERE, '..', 'critic.mjs'), 'utf8');
  assert.ok(!/console\.(log|error)\([^)]*\bkey\b/.test(src), 'critic must never log the key');
});

// ---- v0.5.1: cross-sentence rules stop at a paragraph break ----
test('cross-sentence rules do not reach across a blank line, but do across a wrapped line', () => {
  const across = 'If the answer is not there, it tells you your files don’t say.\n\nIt’s called Sheaf, and it reads the files you give it.';
  assert.ok(!rules(check(across, 'web')).includes('nxy-two-sentences'));
  const wrapped = "They aren't getting angrier.\nThey're getting hungrier.";
  assert.ok(rules(check(wrapped, 'web')).includes('nxy-two-sentences'));
  assert.ok(!rules(check('Not hype.\n\nNot a word of it was true, he said.', 'web')).includes('nxy-not-not-just'));
  assert.ok(!rules(check('What is in the loft?\n\nMice. Usually.', 'web')).includes('runup-qa'));
  assert.ok(rules(check('Not in your files? It says so.', 'web')).includes('runup-qa'));
});

// ---- v0.5.2: mind-reading simile (Luke Studio, Nathan's flag, 3 Nov 2026) ----
test('mind-read: "like it\'s a word he\'s been saving" fails fiction; soft "as if" is a dose', () => {
  const hard = 'Somebody at the end whispers, "Momentum," like it\'s a word he\'s been saving.';
  assert.ok(rules(check(hard, 'fiction')).includes('mind-read'));
  assert.ok(check(hard, 'fiction').fails.some((f) => f.includes('mind-read')));
  const soft = 'He kept nodding, as if it explains a lot.';
  assert.ok(rules(check(soft, 'fiction')).includes('mind-read-soft'));
  const filler = 'She put the kettle on and stood at the window over the sink for a while. '.repeat(70);
  const many = filler + 'He nodded, as if it explains a lot. She smiled, as if it was nothing. He shrugged, as though he knew. She laughed, as if they had won.';
  assert.ok(check(many, 'fiction').fails.some((f) => f.startsWith('dose: mind-read-soft')));
  assert.ok(!check(filler + soft, 'fiction').fails.some((f) => f.includes('mind-read')));
});

// ---- v0.5.3: the landing verb (Nathan, Lantern Studio Ruth 2 script, 5 Nov 2026) ----
test('landing verb: "The strip she lands on happens to be Boaz\'s" fails fiction and captions', () => {
  const line = "The strip she lands on happens to be Boaz's.";
  for (const p of ['fiction', 'captions', 'web']) {
    const r = check(line, p);
    assert.ok(rules(r).includes('landing-verb'), p);
    assert.ok(rules(r).includes('landing-reveal'), p);
  }
  assert.ok(check(line, 'fiction').fails.some((f) => f.includes('landing')));
  // people who really land, and falls, stay clean
  assert.ok(!rules(check('The plane landed at six. She landed on her back in the snow.', 'fiction')).includes('landing-verb'));
  assert.ok(!rules(check('The crow lands on the fence post.', 'fiction')).includes('landing-verb'));
  // the plain fixes pass
  assert.ok(!rules(check("Of all the fields in Bethlehem, she walks into Boaz's.", 'fiction')).some((r) => r.startsWith('landing')));
  assert.ok(!rules(check("As it happens, the field she gleans is Boaz's.", 'fiction')).some((r) => r.startsWith('landing')));
});
test('landing verb soft cousins are a dose: ends up, stumbles upon', () => {
  const filler = 'She put the kettle on and stood at the window over the sink for a while. '.repeat(70);
  const many = filler + 'She ends up in the barn. He stumbles upon a key. They end up at the well. She stumbled into the yard.';
  assert.ok(check(many, 'fiction').fails.some((f) => f.startsWith('dose: landing-verb')));
  assert.ok(!check(filler + 'She ends up in the barn.', 'fiction').fails.some((f) => f.includes('landing')));
});

// ---- v0.6.0: the speaker comes back ----
const SHEAF_GLOSSARY = () => readGlossary(join(HERE, '..', '..', 'glossaries', 'example.txt'));

test('S1 + S3: "It didn\'t guess" fails the headline profile (orphan pronoun, bare negative)', () => {
  const r = check("It didn't guess", 'headline');
  assert.ok(rules(r).includes('orphan-pronoun'));
  assert.ok(rules(r).includes('bare-negative'));
  assert.equal(r.pass, false);
});
test('S5 + S6: "It knows because I gave it my papers." fails testimonial (faux-plain, design leak)', () => {
  const r = check('It knows because I gave it my papers.', 'testimonial', { glossary: SHEAF_GLOSSARY() });
  assert.ok(rules(r).includes('faux-plain'));
  assert.ok(rules(r).includes('design-leak'));
  assert.equal(r.pass, false);
});
test('S4: a dropped "I" is flagged in testimonial; putting the speaker back clears it', () => {
  assert.ok(rules(check('Found my boiler warranty in ten seconds.', 'testimonial')).includes('dropped-speaker'));
  assert.ok(!rules(check('I found my boiler warranty in ten seconds. It was in a drawer for six years.', 'testimonial')).includes('dropped-speaker'));
  // dose, not hard, until H1 is measured
  assert.ok(check('Found my boiler warranty in ten seconds.', 'testimonial').pass);
});
test('good headlines pass: concrete thing, reader named, subline allowed', () => {
  for (const l of ['Answers from your own files. / Every answer shows its page.', 'Your terms, page 3. / Word for word.', 'Your website answers customers at midnight.']) {
    const r = check(l, 'headline');
    assert.ok(r.pass, l + ': ' + r.fails.join('; '));
  }
});
test('headline: a negative with a positive half is fine; a pronoun after a name is fine', () => {
  assert.ok(!rules(check("Sheaf doesn't guess. It shows you the page.", 'headline')).includes('bare-negative'));
  assert.ok(!rules(check('Sheaf reads your files. It shows the page.', 'headline')).includes('orphan-pronoun'));
});
test('spoken profile: the launch film voiceover passes (short spoken lines are naturally even)', () => {
  const vo = "Saturday night, I'm on the sofa. Someone's asking about Sunday call-outs.\nThat's from my own terms. Page three, word for word.\nI put my price list and my terms in once. That's all I did.\nSomeone asked about gift cards. That's not in my files, so it said it didn't know.\nNext morning I had a look through what everyone asked.";
  const r = check(vo, 'spoken');
  assert.ok(r.pass, r.fails.join('; '));
});
test('S6 design leak only fires in spoken and testimonial copy, not in docs', () => {
  const g = SHEAF_GLOSSARY();
  assert.ok(g.includes('papers'));
  assert.ok(rules(check('I dropped my papers in and it answered.', 'spoken', { glossary: g })).includes('design-leak'));
  assert.ok(!rules(check('The margin notes sit beside the page.', 'web', { glossary: g })).includes('design-leak'));
});
test('S7: recap closers and empty signposting are flagged in web copy', () => {
  const r = check('In this section we look at pricing. The key takeaway is simple: you pay for answers.', 'web');
  assert.ok(rules(r).includes('metadiscourse'));
});
test('brief: missing or mushy fields are refused; a full brief passes', () => {
  assert.equal(checkBrief('product: Sheaf\nreader: shop owners').ok, false);
  const mush = 'product: Sheaf, a tool\nreader: small business owners\nplace: hero\nspeaker: brand\none thing: it helps businesses\nproof: it is really good\nnext: try it';
  const m = checkBrief(mush);
  assert.equal(m.ok, false);
  assert.ok(m.problems.some((p) => p.startsWith('proof')));
  const good = 'product: Sheaf, a box on your website that answers customer questions from your own price list and terms\nreader: a sole trader (plumber, cleaner) who has never heard of Sheaf; problem-aware: misses messages out of hours\nplace: hero line on the landing page\nspeaker: brand\none thing: customers get answers from your own files, even at midnight\nproof: every answer shows the page it came from, e.g. page 3 of your terms\ntension: you want your evenings back and you want every customer who messages\nafter: Saturday is yours again, and Monday starts with jobs already booked\nnext: book a free set-up call';
  const g = checkBrief(good);
  assert.ok(g.ok, g.problems.join('; '));
});
test('lines: candidates are filtered by brief, profile and cold-reader proxies; shortlist keeps techniques varied', () => {
  const brief = checkBrief('product: Sheaf, a box on your website that answers customer questions from your own price list and terms\nreader: sole trader, never heard of Sheaf\nplace: hero\nspeaker: brand\none thing: customers get answers from your own files at midnight\nproof: every answer shows the page, e.g. page 3 of your terms\nafter: Saturday is yours again, jobs still get booked\nnext: book a set-up call');
  const cands = "curiosity | It didn't guess\nproof | Your terms, page 3. / Word for word.\nself-interest | Your website answers customers at midnight. / From your own price list.\nvague | Smarter support for modern teams.";
  const r = checkLines(cands, brief, 'headline');
  const byText = Object.fromEntries(r.items.map((i) => [i.text, i]));
  assert.equal(byText["It didn't guess"].pass, false);
  assert.equal(byText['Smarter support for modern teams.'].pass, false);
  assert.ok(byText['Smarter support for modern teams.'].reasons.some((x) => x.includes('brief')));
  assert.ok(byText['Your terms, page 3. / Word for word.'].pass);
  assert.ok(r.shortlist.length >= 2 && r.shortlist.length <= 5);
});
test('brief: the unfilled template is refused', () => {
  const t = readFileSync(join(HERE, '..', '..', 'templates', 'headline-brief.txt'), 'utf8');
  const b = checkBrief(t);
  assert.equal(b.ok, false);
  assert.ok(b.problems.some((p) => p.includes("template's wording")));
});

// ---- v0.6.1: Nathan judged the v0.6 shortlist "none natural or appealing" (5 Nov 2026) ----
const BRIEF_NO_AFTER = 'product: Sheaf, a box on your website that answers customer questions from your own price list and terms\nreader: sole trader, never heard of Sheaf\nplace: hero\nspeaker: brand\none thing: customers get answers from your own files at midnight\nproof: every answer shows the page, e.g. page 3 of your terms\nnext: book a set-up call';
test('brief: the after-state is required (what changes in the reader\'s week, not what the product does)', () => {
  const b = checkBrief(BRIEF_NO_AFTER);
  assert.equal(b.ok, false);
  assert.ok(b.problems.some((p) => p.startsWith('after')));
  assert.ok(checkBrief(BRIEF_NO_AFTER + '\ntension: you want your evenings back and every customer who messages\nafter: Saturday is yours again, and Monday starts with jobs already booked').ok);
});
test('lines: the shortlist never repeats one opening shape (v0.6 shortlist: four of five began "Your ...")', () => {
  const brief = checkBrief(BRIEF_NO_AFTER + '\nafter: Saturday is yours again');
  const cands = ['a | Your website answers customers at midnight.', 'b | Your price list answers customers now.', 'c | Your terms answer customers on Sunday.', 'd | Your files answer customers while you sleep.', 'e | Saturday off. Customers still get answers from your price list.', 'f | Customers ask at midnight. Your price list answers.'].join('\n');
  const r = checkLines(cands, brief, 'headline');
  const openers = r.shortlist.map((i) => i.text.split(/\s+/)[0].toLowerCase());
  assert.ok(openers.filter((o) => o === 'your').length <= 2, openers.join(','));
  assert.ok(r.notes.some((n) => n.includes('same opening')));
});

// ---- v0.6.2: why lines 3 and 4 spoke to people (Nathan, 6 Nov 2026) ----
// Nathan: round two lines 3 and 4 "much much better"; round one "none natural or appealing".
const R2 = ['customer words | Not answering your phone? They\'re already ringing the next plumber.', 'problem | The 9pm customer books whoever replies first.', 'concrete | Answer the 9pm customer without picking up your phone.', 'after | Keep your Saturday. Keep the customer too.', 'curiosity | How many jobs went to the plumber who picked up?'].join('\n');
const BRIEF_R2 = 'product: a box on a small firm\'s website that answers customer questions from the owner\'s own price list and terms\nreader: a sole trader plumber, problem aware\nplace: hero\nspeaker: brand\none thing: when you cannot pick up, your website answers the customer from your own price list\ntension: you want your evenings and Saturdays, and you want every customer who rings\nafter: you keep your Saturday and the customer who would have rung round books you\nproof: every answer shows the page it came from, page 3 of your terms\nnext: book a set-up call';
test('brief: the tension (two wants that seem to fight) is required', () => {
  const noTension = BRIEF_R2.split('\n').filter((l) => !l.startsWith('tension')).join('\n');
  assert.ok(checkBrief(noTension).problems.some((p) => p.startsWith('tension')));
  assert.ok(checkBrief(BRIEF_R2).ok, checkBrief(BRIEF_R2).problems.join('; '));
});
test('headline notes: product as the subject, and the reader cast as failing', () => {
  assert.ok(rules(check("Your website answers customers while you're off.", 'headline')).includes('product-subject'));
  assert.ok(rules(check('Your price list can answer customers now.', 'headline')).includes('product-subject'));
  assert.ok(rules(check("Not answering your phone? They're already ringing the next plumber.", 'headline')).includes('blame'));
  assert.ok(rules(check('How many jobs went to the plumber who picked up?', 'headline')).includes('blame'));
  for (const good of ['Answer the 9pm customer without picking up your phone.', 'Keep your Saturday. Keep the customer too.']) {
    const r = rules(check(good, 'headline'));
    assert.ok(!r.includes('product-subject') && !r.includes('blame'), good);
  }
});
test('lines: Nathan\'s two picks rank first on the round two set', () => {
  const r = checkLines(R2, checkBrief(BRIEF_R2), 'headline');
  const top2 = r.shortlist.slice(0, 2).map((i) => i.text).sort();
  assert.deepEqual(top2, ['Answer the 9pm customer without picking up your phone.', 'Keep your Saturday. Keep the customer too.']);
});

// ---- v0.7.0: S8 blind cold reader (scores clarity and appeal apart; must agree with Nathan) ----
test('S8 packet: the reader persona goes in, the product and brief stay out, lines are shuffled', () => {
  const brief = checkBrief(BRIEF_R2);
  const lines = ['Answer the 9pm customer without picking up your phone.', 'Keep your Saturday. Keep the customer too.', 'The 9pm customer books whoever replies first.'];
  const { packet, key } = buildColdPacket(lines, brief, 3);
  assert.ok(packet.includes('sole trader plumber'));
  assert.ok(!/price list and terms|Sheaf|page 3/i.test(packet));
  assert.equal(Object.keys(key).length, 3);
  assert.deepEqual(Object.values(key).sort(), [...lines].sort());
});
test('S8 score: parses answers, checks the decode against the brief, ranks by clarity plus appeal', () => {
  const brief = checkBrief(BRIEF_R2);
  const key = { 1: 'Keep your Saturday. Keep the customer too.', 2: 'The 9pm customer books whoever replies first.' };
  const answers = '1 | offered: a service that answers your customers from your price list so you keep weekends | clarity: 3 | appeal: 5 | voice: 5 | why: talks to me\n2 | offered: unclear | clarity: 1 | appeal: 1 | voice: 2 | why: a statement';
  const r = scoreCold(key, answers, brief);
  assert.equal(r.rows[0].text, key[1]);
  assert.equal(r.rows[0].decoded, true);
  assert.equal(r.rows[1].decoded, false);
  assert.equal(r.answered, 2);
});

// ---- v0.7.0 H2: human slogans that wrongly tripped the clarity checks (6 Nov 2026) ----
test('H2: bare negative spares litotes, imperatives and two-clause lines; still catches "It didn\'t guess"', () => {
  for (const human of ['Never knowingly undersold.', "Don't leave home without it.", "Once you pop, you can't stop."]) {
    assert.ok(!rules(check(human, 'headline')).includes('bare-negative'), human);
  }
  assert.ok(rules(check("It didn't guess", 'headline')).includes('bare-negative'));
  assert.ok(rules(check('They never sleep.', 'headline')).includes('bare-negative'));
});
test('H2: orphan pronoun spares the dummy "it" ("It\'s good to talk")', () => {
  assert.ok(!rules(check("It's good to talk.", 'headline')).includes('orphan-pronoun'));
  assert.ok(!rules(check('It is easy to start.', 'headline')).includes('orphan-pronoun'));
  assert.ok(rules(check("It didn't guess", 'headline')).includes('orphan-pronoun'));
});

// ---------- v0.7.1: predictability, not sanitising (Luke Studio, Nathan's ear, 6 Nov 2026) ----------
const THIRD_POT_A = "I switched the engine off. Tick. We were parked two doors away from my parents' house, because that space belonged, by a neighbourly law predating me, to a Corsa which has not moved since 2019.";

test('protected voice devices: a sound for a fact, posh register for a small thing, the still-true present slip', () => {
  const r = check(THIRD_POT_A, 'fiction');
  assert.equal(r.hits.length, 0, JSON.stringify(r.hits.map((h) => h.rule)));
  assert.equal(r.pass, true);
  for (const p of ['captions', 'playful', 'web']) assert.equal(check(THIRD_POT_A, p).hits.filter((h) => h.hard).length, 0, p);
});

test('G4: a human set from another era makes the run PARTIAL, never FAIL', () => {
  const key = { 1: 'ours', 2: 'human', 3: 'control', 4: 'ours', 5: 'human', 6: 'control', _meta: { oursEra: 2026, humanEra: 1918 } };
  const r = score(key, '1: AI\n2: human\n3: AI\n4: AI\n5: human\n6: AI');
  assert.equal(r.pass, false);
  assert.equal(r.partial, true);
  assert.match(r.verdict, /PARTIAL/);
  assert.match(r.verdict, /era/);
  const same = score({ ...key, _meta: { oursEra: 2026, humanEra: 2015 } }, '1: AI\n2: human\n3: AI\n4: AI\n5: human\n6: AI');
  assert.match(same.verdict, /FAIL/);
});

test('G4 packet: eras are recorded in the sealed key', () => {
  const { key } = buildPacket({ ours: 'a b c', human: 'g h i', control: 'd e f', n: 1, size: 2, oursEra: 2026, humanEra: 1918 });
  assert.deepEqual(key._meta, { oursEra: 2026, humanEra: 1918 });
  assert.equal(Object.keys(key).filter((k) => k !== '_meta').length, 3);
});

test('predict: aligns tokens by text even when token-id keys are reordered', async () => {
  const { align, stats, bySentence } = await import('../predict.mjs');
  const text = 'I turned it off. Tick.';
  // keys are token ids; JavaScript will order them numerically, so the actual token is not first
  const pl = [null,
    { 900: { decoded_token: ' turned', rank: 40, logprob: -6 }, 5: { decoded_token: ' was', rank: 1, logprob: -0.5 } },
    { 7: { decoded_token: ' it', rank: 1, logprob: -0.1 } },
    { 8: { decoded_token: ' off', rank: 1, logprob: -0.2 } },
    { 9: { decoded_token: '.', rank: 1, logprob: -0.1 } },
    { 3000: { decoded_token: ' Tick', rank: 3000, logprob: -12 }, 2: { decoded_token: ' The', rank: 1, logprob: -1 } },
    { 9: { decoded_token: '.', rank: 1, logprob: -0.3 } }];
  const a = align(text, pl);
  assert.equal(a.aligned, true);
  assert.deepEqual(a.rows.map((r) => r.t), [' turned', ' it', ' off', '.', ' Tick', '.']);
  assert.equal(a.rows[0].top, ' was');
  const s = stats(a.rows);
  assert.equal(s.surprise, +(2 / 6).toFixed(2));
  assert.ok(bySentence(text, a.rows).length >= 1);
});

// ---------- v0.7.2: the afterthought aside (Nathan via Luke Studio, 6 Nov 2026) ----------
test('afterthought aside: counted in narration, as Nathan heard it in The Third Pot v0.6', async () => {
  const { afterthoughtAsides } = await import('../patina.mjs');
  const hits = (t) => afterthoughtAsides(t).map((h) => h.excerpt);
  assert.deepEqual(hits('In the inside pocket of my coat, left side, was a ring.'), ['left side']);
  assert.deepEqual(hits('I had said "twelve pounds" in a voice, once, and she held it against me.'), ['once']);
  assert.deepEqual(hits('The remote, one hand. The collection plate, one hand.'), ['one hand', 'one hand']);
  assert.deepEqual(hits('He shook my hand, firmly, as if I had come about the boiler.'), ['firmly']);
});

test('afterthought aside: dialogue, lists, verb series, descriptions and names are not asides', async () => {
  const { afterthoughtAsides } = await import('../patina.mjs');
  for (const t of [
    '"Before pudding, ideally," she said.',
    '"Yes," he said, "probably, if it rains."',
    'He hung it, looked at it, took it down, and hung it again.',
    'She bought pears, rice, and a pot.',
    'Grandmother was a spry, tall woman, with a crinkly face.',
    'I looked at Hana, Tolu, and my mother.',
    'They sat, back straight, head bowed, until grace was done.',
  ]) assert.deepEqual(afterthoughtAsides(t), [], t);
});

test('afterthought aside: fiction doses it at 1 per 1,000 words and fails two in one paragraph', () => {
  const filler = 'We drove home past the shops and the park and the old cinema that shows nothing now. '.repeat(70);
  const one = check(filler + '\n\nHe shook my hand, firmly, at the door.', 'fiction');
  assert.equal(one.doses['afterthought-aside'].count, 1);
  assert.ok(!one.fails.some((f) => /afterthought/.test(f)), one.fails.join('; '));
  const pair = check(filler + '\n\nHe shook my hand, firmly, at the door. The remote, one hand.', 'fiction');
  assert.ok(pair.fails.some((f) => /two afterthought asides in one paragraph/.test(f)), pair.fails.join('; '));
  const many = check('He shook my hand, firmly, at the door.\n\nIn my coat, left side, was a ring.\n\nI said it once in a voice, once, and stopped.', 'fiction');
  assert.ok(many.fails.some((f) => /dose: afterthought-aside/.test(f)), many.fails.join('; '));
});

// ---------- sentence matrix ----------
test('sentences: split keeps dialogue tags with their line and respects Mr. and Mrs.', async () => {
  const { split } = await import('../sentences.mjs');
  const rows = split('"Is it?" she asked. Mr. Adeyemi nodded.\n\nTick. He laughed, and he could not stop.');
  assert.deepEqual(rows.map((r) => r.text), ['"Is it?" she asked.', 'Mr. Adeyemi nodded.', 'Tick.', 'He laughed, and he could not stop.']);
  assert.deepEqual(rows.map((r) => r.pos), ['first', 'last', 'first', 'last']);
  assert.equal(rows[0].opening, 'dialogue');
  assert.ok(rows[2].ruleDevices.includes('one-word'));
});

test('sentences: profile counts shares, closers and runs; compare flags what is outside the human range', async () => {
  const { profile, reference, compare } = await import('../sentences.mjs');
  const mk = (modes, roles) => modes.map((m, i) => ({ text: 's', words: 10, band: '9-15', opening: 'subject', quoted: false, para: Math.floor(i / 3) + 1, pos: ['first', 'middle', 'last'][i % 3], mode: m, role: roles[i % 3] }));
  const human = [
    mk(['event', 'description', 'event', 'thought', 'event', 'description'], ['opener', 'build', 'build']),
    mk(['event', 'event', 'description', 'event', 'thought', 'event'], ['opener', 'build', 'beat']),
  ];
  const draft = mk(['commentary', 'commentary', 'commentary', 'commentary', 'event', 'commentary'], ['opener', 'build', 'button']);
  const p = profile(draft);
  assert.equal(p.mode.commentary, 0.833);
  assert.equal(p.lastRole.button, 1);
  assert.ok(p.runs.mode > 0);
  const diffs = compare(p, reference(human.map(profile)));
  assert.ok(diffs.some((d) => d.key === 'mode.commentary' && d.dir === 'high'));
  assert.ok(diffs.some((d) => d.key === 'lastRole.button' && d.dir === 'high'));
});

test('sentences: "when" by rule counts named times, not linking words', async () => {
  const { whenByRule } = await import('../sentences.mjs');
  assert.equal(whenByRule('When I awoke, it was afternoon.'), 1);
  assert.equal(whenByRule('She often spoke with an anxious inflection.'), 1);
  assert.equal(whenByRule('a Corsa which has not moved since 2019'), 1);
  assert.equal(whenByRule('While my grandmother was busy, I sat on the bench.'), 0);
  assert.equal(whenByRule('Then she came laughing.'), 0);
});

test('copybook: Delta is capped per measure, and tells name measures outside every human text', async () => {
  const { delta, tells, looRange } = await import('../copybook.mjs');
  const pool = [{ aloneShare: 0.04, 'band.9-15': 0.30 }, { aloneShare: 0.06, 'band.9-15': 0.25 }, { aloneShare: 0.05, 'band.9-15': 0.33 }];
  const draft = { aloneShare: 0.9, 'band.9-15': 0.29 };
  const d = delta(draft, pool);
  assert.ok(d.delta <= 3, 'capped');
  assert.equal(d.parts[0].k, 'aloneShare');
  const t = tells(draft, pool);
  assert.deepEqual(t.map((x) => [x.k, x.dir]), [['aloneShare', 'above']]);
  assert.equal(looRange(pool).all.length, 3);
});

test('copybook L1: anatomy profile measures clause mix, splits, lexis and template repetition', async () => {
  const { anatomyProfile, templateRepetition } = await import('../sentences.mjs');
  const a = (o) => ({ nClauses: 1, subordinate: 0, coordinate: 0, participial: 0, nominal: 0, rare: 0, verbs: 1, clauses: {}, beforeVerb: 1, verbAt: 0.2, depth: 2, depLen: 1.5, theme: 'subject', endWeight: 1, rarestAt: 'last', npMax: 2, adjStack: 0, prepChain: 0, process: 'material', passive: false, progressive: false, perfect: false, modal: false, density: 0.5, zipf: 5, latinate: 0, wordLen: 4, segments: 1, segLens: [6], semicolon: 0, colon: 0, dash: 0, modifiers: [], cohesion: { pronounStart: true, marker: false, conjStart: false, overlap: 0 }, pos: 'PRON VERB DET NOUN PUNCT', ...o });
  const L = anatomyProfile([a({}), a({ subordinate: 1, clauses: { adverbial: 1 }, theme: 'adverbial-clause', segments: 2, rare: 1 })]);
  assert.equal(L['theme.adverbial-clause'], 0.5);
  assert.equal(L['segments.2'], 0.5);
  assert.equal(L['share.hasRareWord'], 0.5);
  assert.equal(L['cohesion.pronounStart'], 1);
  const same = templateRepetition(Array(100).fill('PRON VERB DET NOUN PUNCT'));
  const varied = templateRepetition(Array.from({ length: 100 }, (_, i) => ['PRON VERB DET NOUN PUNCT', 'SCONJ PRON VERB PUNCT PRON AUX ADJ PUNCT', 'DET ADJ NOUN VERB ADP DET NOUN PUNCT', 'INTJ PUNCT PROPN PUNCT'][i % 4] + ' X'.repeat(i % 7)));
  assert.ok(same > varied, `${same} > ${varied}`);
});

test('norms: summaries, intro-comma pooling, and committed norms.json holds numbers only', async () => {
  const { summarise, introCommaRates } = await import('../norms.mjs');
  assert.deepEqual(summarise([1, 2, 3, 4, 5]).median, 3);
  const r = introCommaRates([{ anat: { intro: { kind: 'clause', words: 4, comma: true } } }, { anat: { intro: { kind: 'phrase', words: 3, comma: false } } }, { anat: { intro: null } }]);
  assert.equal(r.clause.rate, 1);
  assert.equal(r['phrase-3-4'].rate, 0);
  const n = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'norms', 'norms.json'), 'utf8'));
  assert.ok(n.texts.length >= 20 && Object.keys(n.measures).length > 100);
  for (const v of Object.values(n.vectors)) for (const x of Object.values(v)) assert.equal(typeof x, 'number');
  assert.ok(!/"text"\s*:/.test(JSON.stringify(n)), 'no sentence text in norms');
});
