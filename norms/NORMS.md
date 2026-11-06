# Patina norms (v1.0, 6 Nov 2026)

Nathan, 6 Nov 2026: "These ratios are now the bread and butter for patina engine. Save them all for patina's growth."

Every human-text ratio Patina has measured, in one place. Each entry gives the range, the source texts, n, the date and the tool. `norms.json` holds the full set for machines: 306 measures, with the per-text numbers so ranges can be re-derived as texts are added. Book text never leaves `corpus/local-only/`; only numbers are here.

**How it grows:** label a new human text (`tools/book-prep/README.md`), then rebuild:
`node patina/tools/norms.mjs build --human patina/corpus/local-only/fiction/books/anatomy --sources patina/norms/sources.json --out patina/norms/norms.json`
Then bump the version here and in `norms.json`. With 30 or more texts from 6 or more authors, switch the Copybook from min-to-max ranges to 10th-to-90th percentiles.

**How to use it:** `node patina/tools/copybook.mjs --draft <labelled.jsonl> [--panel]` reads `norms.json` by default, so it needs no books.

## 1. Copybook norms (norms.json v1.0)
- **Sources:** *The Hunger Games* (Suzanne Collins, 2008), 10 chapters; *Ready Player One* (Ernest Cline, 2011), the prologue and 9 sections. 20 texts, 5,945 sentences. Nathan's own copies (`sources.json`).
- **Tools:** `sentences.mjs label` (DeepSeek V4.1 Flash, reasoning off, codebook v0.3) for L2; `anatomy.py` (spaCy en_core_web_md 3.8, wordfreq) for L1; rules for L3.
- **Labelling reliability (Cohen's kappa, blind Claude coder, 60 sentences):**
  - **Reliable:** form 0.88, shape 0.75, mode 0.69, scene 0.64, who 0.91, when 0.73, where 0.86, why 0.73.
  - **Indicative only:** speech and thought 0.17, paragraph role 0.53, what 0.59, how 0.56.
- **Copybook Delta between human texts** (leave one out): 0.55 to 1.66, median 0.70.

Headline gauges (human min to max, median). The full list is in `norms.json`.

| Level | Measure | Range (median) |
|---|---|---|
| L2 | Mean words per sentence | 6.9 to 18 (11.9) |
| L2 | Sentences of 1 to 3 words | 4% to 31% (12.5%) |
| L2 | Sentences of 9 to 15 words | 19.6% to 37.3% (29.1%) |
| L2 | Opening on the bare subject | 12.1% to 32.3% (24.8%) |
| L2 | Opening on a condition or qualifier | 2.1% to 10.6% (5%) |
| L2 | Opening on a conjunction | 1.8% to 10.2% (7.8%) |
| L2 | Fragments | 8% to 33.7% (14.1%) |
| L2 | Simple / compound / complex / compound-complex | 37 to 54% / 4.6 to 17.6% / 15.7 to 29.7% / 1.4 to 9.8% |
| L2 | Description / speech / thought / commentary (mode) | 2.8 to 21% / 4.6 to 74% / 0.6 to 44% / 0.7 to 31.5% |
| L2 | Says where | 5.9% to 37.9% (18.3%) |
| L2 | Per 1,000 words: asides / lists / repetition / similes / jokes | 0 to 1.97 / 2.07 to 6.23 / 0.5 to 5.63 / 0.54 to 4.26 / 0 to 0.99 |
| L3 | One-sentence paragraphs | 1.7% to 23.7% (5.2%). No cap: judge by flow (Nathan) |
| L3 | Runs of 3 same openings, per 100 sentences | 2.0 to 6.1 (4.0) |
| L1 | Sentences with a rare word (Zipf under 3, names excluded) | 11.4% to 31.3% (19.9%) |
| L1 | Mean word frequency (Zipf, content words) | 4.73 to 5.11 (4.93) |
| L1 | Latinate share of content words | 1.6% to 11.5% (3.9%) |
| L1 | Nominalisations per sentence | 0.075 to 0.233 (0.13) |
| L1 | Two or more stacked adjectives | 1.2% to 10.8% (4%) |
| L1 | Subordinate per coordinate clause | 2.77 to 6.63 (4.39) |
| L1 | Led by an adverbial clause | 2.6% to 8.4% (5.7%) |
| L1 | No comma cut / one comma cut | 37 to 61% (50.5%) / 24.7 to 39.6% (29.6%) |
| L1 | Opening on a pronoun subject | 19.1% to 40.8% (36.1%) |
| L1 | Part-of-speech template repetition (compression, Shaib et al. 2024) | 6.14 to 6.80 (6.59) |

## 2. Introductory commas (G1c; pooled over the 20 texts; intro_commas.py, 6 Nov 2026)
| Introductory element | n | Comma follows |
|---|---|---|
| Clause | 304 | 95% |
| 1 word | 288 | 30% |
| 2 words | 110 | 83% |
| 3 to 4 words | 111 | 95% |
| 5+ words | 62 | 95% |

Per chapter, phrases of 2+ words: 71% to 100% (median 90%). An earlier, looser count (before questions and openers already cut by a comma were excluded) gave 77% for clauses; this table supersedes it.

## 3. Afterthought aside (G1, fiction dose; patina.mjs, 6 Nov 2026)
- **Rule count per 1,000 words of narration:**
  - The Third Pot v0.6 before Nathan's note: 5.0; after the fix: 0.3.
  - Cather, *My Antonia* chapter 2: 0.
  - The cold AI control: 2.6.
  - Fable v0.1: 1.4.
- **Dose:** 1 per 1,000 words, never two in a paragraph.
- **Copybook device count on the books:** 0 to 1.97 per 1,000 (median 0.75). This is a looser model-labelled measure, so the rule dose stays at 1.

## 4. Predictability (G1p; predict.mjs, DeepSeek V4.1 Flash logprobs, 6 Nov 2026)
- **Nathan's sentence pair:** his pick has perplexity 51.9 and 39% surprises (outside the top 10); Fable's has 24.8 and 22%.
- **First 400 words of each text** (perplexity, surprises):
  - Cather 1.7, 3% (memorised, so never a baseline);
  - the cold AI control 7.6, 14%;
  - Fable v0.1 7.5, 13%;
  - Luke v0.3 8.7, 13%;
  - Luke v0.5 9.3, 16%.
- **Rule:** compare versions of one piece; never score human against AI on one number. Published classics are memorised.

## 5. G1 rhythm and band (patina.mjs, 2 Nov 2026)
- **Sentence-length variation (coefficient of variation):** Cather 0.47, so the fiction floor is 0.45. Luke's own lint uses 0.55.
- **Share of sentences in the 8 to 20 word band:** Cather 0.44; Luke chapter 4 0.45; the AI control 0.38; Patina's SPEC 0.45. The band does not separate human from AI, so G1 fails only at 75% or more.

## 6. Short lines (v0.6 and v0.7, 5 to 6 Nov 2026)
- **H2, human slogans flagged by the clarity checks:** 5 of 30 before the fix, 1 of 30 after; holdout 3 of 15, all leaning on their packaging.
- **H1, AI-written testimonials that drop the speaker:** 18 of 40 (45%). The human half was not run (Nathan: review data is not high quality).
- **S8 cold reader:** a clarity gate only. A model's appeal score rewards fear and flat product claims. A feeling line plus a subline that names the thing moved "Keep your Saturday..." from 11th to 2nd.

## 7. Benchmark drafts (pinned)
- **The Third Pot v0.7** (Luke, luke a41d73b, then commas in 13ea4b3), approved by Nathan on 6 Nov 2026: "very very good! so much better than before!"
  - Copybook Delta 0.89 (v0.6 was 1.05). Clears every L2 tell.
  - Still below the books on L1 vocabulary: rare words 6.5%, Latinate 1.1%, nominalisations 0.03 per sentence. Subordination 2.3.
  - Template repetition 6.87, just above the books' 6.80.
  - Use it as the reference "approved by Nathan's ear" profile when judging later drafts.

## Change log
| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-11-06 | Created: Copybook norms from 2 books (20 texts), intro commas, aside, predictability, rhythm and band, short lines, benchmark draft |
