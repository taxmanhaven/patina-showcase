# Patina

**Write with AI. Still sound like you.**
Patina marks the lines in your draft that read as machine-written, and tells you why.

An AI draft saves time. It also tends to leave a few sentences behind that nobody you know would say. Patina finds those lines and explains what gives each one away. It never touches your file, so the rewriting, and the voice, stay yours.

It works on writing you did yourself too. If people keep telling you your work sounds like ChatGPT, Patina shows which habits they are hearing, and you decide which to keep.

## What it checks

- Tells: the stock phrases and sentence shapes readers have learned to spot.
- Predictability: the sentences a language model would have written first, ranked, so you know where to start.
- The Copybook: each sentence measured against two published novels for its grammar, its words, how it opens and where its commas fall. Lines outside the human range get marked.
- Short lines: a brief, a filter and a cold read for headlines and taglines, so you can see if a stranger understands a line before it goes live.

## Before and after

The opening of a short story: the first AI draft, and the same scene after rewriting with Patina.

![The same story opening, first AI draft on the left and the Patina rewrite on the right](examples/before-after.png)

Every draft is different, so the best test is your own. It's free: run it on something you wrote.

## Quick start

You need Node 18 or later. The tells scan has no other installs.

```bash
node tools/patina.mjs check my-draft.md --profile web
```

Pick the profile that fits the reader: `fiction`, `web`, `email`, `pro-email`, `technical`, `playful`, `captions`, `spoken`, `headline`, `testimonial` or `ui`. For lots of short app strings, use `batch`:

```bash
node tools/patina.mjs batch strings.json --report report.md
```

For a headline or tagline, fill in `templates/headline-brief.txt`, then:

```bash
node tools/patina.mjs brief brief.txt
node tools/patina.mjs lines --brief brief.txt --candidates candidates.txt
```

Write each candidate as `technique | line / subline`. The techniques are in `craft/headlines.md`.

### Optional extras

- The predictability map and the cold reader call a language model through an OpenAI-compatible API (Prima Labs by default). Put your key in the `PRIMALABS_API_KEY` environment variable. Patina reads it in the process and never prints it.
  `node tools/predict.mjs my-draft.md --out predict.md`
- The Copybook's grammar layer needs Python 3.12 with spaCy and wordfreq, which you install yourself:
  ```bash
  pip install "spacy>=3.8,<3.9" wordfreq
  python -m spacy download en_core_web_md
  python tools/intro_commas.py check my-draft.md
  ```
  To place a whole draft against the human ranges: `node tools/sentences.mjs label my-draft.md --out draft.lab.jsonl` (needs the key), then `python tools/anatomy.py draft.lab.jsonl draft.an.jsonl`, then `node tools/copybook.mjs --draft draft.an.jsonl --panel`.

The Copybook ships with `norms/norms.json`, the human ranges, so it works without the books. The norms are numbers only. No book text is included.

## What is in here

| Folder | What |
|---|---|
| `tools/` | the checker, the predictability map, the Copybook and the tests (`node --test tools/test/patina.test.mjs`) |
| `craft/` | the headline craft guide and the sentence codebook |
| `norms/` | human ranges measured on two published novels, with their sources |
| `templates/` | the headline brief |
| `glossaries/` | an example list of a product's design words, for the design-leak check |
| `examples/` | the before and after picture above |
| `corpus/` | one public-domain chapter (Willa Cather, *My Antonia*) used as a human anchor |

## Honest limits

- Patina points; it does not promise that any detector will pass your text. Expert readers see through word swaps, so the fix is your own rewrite.
- The norms come from fiction. On a README or a sales page, read them as a guide.
- The scan is the floor. Your own ear, and a reader you trust, decide.

## Licence

MIT. Use it, change it, build on it. The story excerpt in `examples/before-after.png` is the exception: it stays the author's. Details in `LICENSE` and `NOTICE`.
