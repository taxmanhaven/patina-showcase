# Headline craft: short lines that a stranger understands and a person would say

Patina v0.6.0, 5 Nov 2026. Covers taglines, hero lines, page titles, title cards, ad headlines, hooks and testimonials.

The techniques below are named and credited. Every example line is ours, written for Sheaf or Pest Guide; no source wording is copied (M034).

## 0. The first rule: speak to people (Nathan, 6 Nov 2026)
The lines Nathan liked were "Answer the 9pm customer without picking up your phone." and "Keep your Saturday. Keep the customer too." Every line we write follows the same five moves:
1. The reader holds the verb. Start with what they do; never start with the product.
2. Resolve a tension they live with: give both things they want (the brief's `tension` field).
3. Keep, not lose; offer, never scold.
4. Their week (a time, a day, an object), not our features.
5. Say it the way a person says it across a table, and read it aloud.
6. Then add a subline that names the thing. A blind stranger could not decode "Keep your Saturday. Keep the customer too." alone, and understood it at once with "/ Your website answers them from your own price list." (audits/RESULTS_v0.7_2026-11-06.md).

Rejected shapes, kept as tests: "Your website answers..." (the product acts), "Not answering your phone?" (scolding), "How many jobs went to..." (guilt), "The 9pm customer books whoever replies first." (a lecture about the world).

## 1. The order of work
1. **Brief first.** Fill in `patina/templates/headline-brief.txt`, then run `patina.mjs brief <file>`. No options until it passes.
2. **Pick the awareness level** (section 3). It decides which techniques fit.
3. **Go wide.** Write 20 or more lines across at least 6 techniques. Tag each line `technique | line / subline`. Keep a few from the tails, the ones you would not write first (Verbalized Sampling).
4. **Filter.** Run `patina.mjs lines --brief <b> --candidates <c> --glossary patina/glossaries/<project>.txt`. It drops lines with orphan pronouns, bare negatives, faux-plain explanations, design-word leaks, landing verbs, lines over budget and lines that name nothing from the brief.
5. **Cold read (S8, clarity only).** `patina.mjs coldpacket --brief <b> --lines <shortlist> --out <dir> --seed 7`, then `node patina/tools/critic.mjs --mode cold --packet <dir>/packet.md --out <dir>/answers.md --key-file <key>`, then `coldscore`. Run three seeds and read the median. Use its clarity and what it thought was offered; ignore its appeal score (it rewards fear and flat product claims).
6. **Shortlist.** Five lines with their techniques named go to the owner. A blind cold-reader ranking by a different model family comes in v0.7. The writer never ranks its own lines (M029).

## 2. The four anchors (why a short line reads human)
Every human line comes from someone, goes to someone and is about something (Karl Bühler's organon model, 1934). When a person speaks, it also carries their stake (William Labov's evaluation, 1967 and 1972).

| Anchor | Question | Headline | Testimonial |
|---|---|---|---|
| Speaker | Who says it? | may be the brand, unspoken | must be there ("I") |
| Listener | Who is it for? | must be there ("your") | may be dropped |
| Thing | What is it about? | must be concrete | must be concrete |
| Stake | Why did it matter to them? | optional | one small proud beat |

AI drafts tend to keep only the thing, and in overview form. Check each line against the table before anything else.

**Cold-reader test.** From Harry Dry's three rules for copy (credited by Vikki Ross, Think with Google; Video Intel `persuasive-writing`): can you **see** it, can you **prove** it false, and could only **you** say it? A stranger who sees only the line and its subline must be able to say what the product is and why it matters.

## 3. Match the line to the reader (Eugene Schwartz, *Breakthrough Advertising*, 1966)
Taught well by Alex Cattoni (Video Intel `persuasive-writing`).

| Level | The reader... | The line answers | Sheaf example (ours) |
|---|---|---|---|
| Unaware | does not know they have the problem | What do you want them to notice? | "How many customers messaged you last Sunday?" |
| Problem aware | feels the pain | What is the problem, and what fixes it? | "Customers ask at midnight. Your website can answer from your own price list." |
| Solution aware | knows chatbots exist | How are you different? | "Answers from your own files. / Every answer shows its page." |
| Product aware | knows Sheaf | Why act now? | "Set-up is free until Friday." |
| Most aware | is ready | What do they do next? | "Book your set-up call." |

Sheaf's cold reader on Upwork and its landing page is usually problem aware. Lead with the problem and the fix, not the product name.

## 4. Techniques (tag your candidates with these names)
Each technique is studied by What, Why, How, Where and When, and also where and when it does **not** apply (M069, 6 Nov 2026). A technique without its why and its limits is not ready to use. The "not" column is as binding as the "use" column.

| Tag | What (source) | Why it works | How | Where and when | Not where or when | Example (ours) |
|---|---|---|---|---|---|---|
| self-interest | Lead with what the reader gets (Caples, *Tested Advertising Methods*, 1932) | Attention goes to what affects me; Caples's split tests found it beat cleverness | Name the gain in their words, with a time or object | Problem-aware readers; hero lines, ad headlines | When the product acts as the subject ("Your website answers..."): the reader must hold the verb (section 0) | "Answer the 9pm customer without picking up your phone." |
| news | Something they did not know was possible (Caples) | Novelty earns a second look, but only while it is new to them | State the new possibility plainly, once | Unaware to solution-aware readers; launches | Solution-aware readers who have seen ten chatbots; it reads as a claim and goes flat (Nathan: "not natural") | "Your price list can answer your customers now." |
| curiosity | An open loop with self-interest attached (Caples; Aprilynne Alter, Video Intel) | An unfinished thought pulls the reader forward (the Zeigarnik effect) | Open one question the next line or frame closes | Video titles, hooks, email subjects | Hero lines for an unknown product: alone it decodes as nothing (S8: "unclear"); never curiosity with no payoff | "What your customers asked while you slept" |
| proof | Specifics beat adjectives (Ogilvy, *Ogilvy on Advertising*, 1983) | A checkable detail is believed; an adjective is discounted | Use the number, page or named object, never "smart" or "seamless" | Solution-aware readers; sublines; title cards inside a film | Cold hero lines: "Your terms, page 3." is cryptic without the film around it | "Your terms, page 3. / Word for word." |
| concrete | Something you can see (Heath and Heath, *Made to Stick*, 2007) | Images are remembered; abstractions are not | Put one object or moment from the reader's week in the line | Any line; strongest in sublines and openers | When the object is our design language ("papers", "margin note"): that is a design leak, S6 | "A plumber's price list, answering at 11pm" |
| problem | PAS: name a specific, recent problem (Joanna Wiebe, Video Intel) | Readers recognise their own week and lean in | A count, a day and a lost thing, then the fix | Problem-aware readers; ads; email openers | Never as blame or a scold ("Not answering your phone?"): Nathan passed over it; the S8 reader liked it, which is why S8 does not judge appeal | "Missed three quotes over the weekend? Your website can reply." |
| tension | Give both things the reader wants (Speak to People, Nathan, 6 Nov 2026) | It removes a trade-off they already feel; "keep" uses loss aversion without scolding | "X without Y", or "Keep X. Keep Y too." Then a subline naming the thing | Hero lines, end cards; the strongest shape we have tested | Without a subline, cold readers cannot decode it (rank 11 of 14 alone, 2nd with one) | "Keep your Saturday. Keep the customer too. / Your website answers them from your own price list." |
| customer words | Use the phrasing real people use (voice-of-customer copywriting) | Their words sound like them because they are theirs | Mine public posts (Reddit reader, usernames stripped) and support messages | Any line; testimonials and problem lines first | Customer-review text as a style model (Nathan, 6 Nov: "not high quality"); never invented quotes | lifted phrasing, never invented |
| contrast | The honest edge over the default, said as what we do | It answers "why you and not the default?" | One sentence about our behaviour; no rival named | Solution-aware readers; comparison pages | "Not X. It's Y." shapes (not-x-but-y), or claiming a rival fails | "Says when it doesn't know. Shows the page when it does." |
| verb-first | One verb, one object, the brand keyword (Vikki Ross on short taglines) | Short imperatives are how people talk and are easy to repeat | Reader's verb plus their object | End cards and buttons, for readers who already know the product | Cold hero lines: too little to decode alone | "Ask your own files." |
| testimonial | I, a concrete thing, one proud beat (Claim the Line, Nathan, 5 Nov 2026; Labov's evaluation) | A person with a stake is believed; a dropped "I" sounds like nobody | Keep the "I", name the thing, add a small proud beat | Social proof, quotes on pages and in films | The customer explaining how it works ("It knows because I..."): faux-plain, S5 | "I put my terms in once. That's all I did." |
| noticing | Humour from noticing the ordinary (Cheri Steinkellner, TED-Ed, Video Intel) | Recognition makes people smile: "that's me" | One specific, true detail from their day | Playful Shorts, social posts | Stressed or angry readers, disputes, anything about money owed (use nathan-plain, no jokes) | "Every plumber has been asked 'do you do Sundays?' at 11pm on a Saturday." |

**Who** only matters for two techniques. Testimonial needs a real, named customer who agreed to it. Customer words must come from public posts, never private messages.

## 5. Never (each one is a Patina check or a hard-won lesson)
- A line that opens on "It", "This" or "They" with nothing before it. (orphan-pronoun; "It didn't guess")
- A line that only says what did not happen. (bare-negative)
- A customer explaining how the product works: "It knows because I...". (faux-plain)
- The project's design words in a customer's mouth: "my papers". (design-leak)
- Borrowed motion verbs: "the strip she lands on". (landing)
- A dropped speaker in a testimonial: "Found my...". (dropped-speaker; Claim the Line)
- A question answered at once ("Not in your files? It says so."). (runup-qa, the drumroll)
- "Not X. It's Y." (not-x-but-y)
- Adjectives in place of proof ("smarter", "seamless", "powerful"). The brief check refuses them in the proof field.
- Three lines in a row with one shape. (same-shape)

## 6. Hooks for video (first seconds)
From the Video Intel retention-hooks playbook (Kallaway; heyDominik): the topic is clear in the first line, matches the title, and leaves one open question. Avoid the four mistakes: delay, confusion, irrelevance and disinterest. For Shorts, the first frame alone should raise a question. Check the spoken hook with the `spoken` profile; check the on-screen card with `headline`.
