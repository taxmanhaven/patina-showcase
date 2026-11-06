# Patina corpus: real human text

Human-written text Patina measures against. It makes Patina stronger in two ways, and only these two:
1. **G4 human sets.** The blind critic needs real human text of the same kind as ours, or G4 cannot pass anything (SPEC 4 G4). Every good sample here makes a G4 verdict possible for that kind of writing.
2. **G3 anchors.** When an owner rewrites, 2 or 3 passages of strong human writing sit beside the draft as the style anchor (`node patina/tools/patina.mjs anchors --kind fiction`). Writers improve by imitating models (Franklin; Stevenson's "sedulous ape"); few-shot examples help a model a little (Wang et al., EMNLP Findings 2025), and 15 to 20 varied examples work better than 3 (r/WritingWithAI, Luke's checklist).

It does not train a model. That would be G3c (a fine-tune on Nathan's own writing), which needs his yes.

## Adding a text (Nathan: just paste it in chat with the link)
The agent saves it as `corpus/<kind>/<author>_<title>.txt` with this header, then runs `node patina/tools/patina.mjs corpus` to check it:
```
# source: https://...
# author: Name
# title: What it is
# licence: public-domain | CC0 | CC-BY-4.0 | CC-BY-3.0 | OGL-3.0 | MIT | Apache-2.0 | BSD | owner
# kind: fiction | web | captions | email | pro-email | ui | technical | playful
# era: 1918
# use: human-set, anchor
# read: 2026-11-02
```
- **Licence** (M034): only the licences above are committed. Copyleft (GPL, CC BY-SA, MPL), non-commercial (CC BY-NC) or unknown licences are study only: they go in `corpus/local-only/<kind>/`, which git ignores, and they never leave this laptop. "Free to read online" is not a licence.
- **Era:** text written before 2023 is very likely human. Anything from 2023 on needs a `# human-proof:` line saying how we know a person wrote it.
- **Same kind matters more than prestige.** A modern plain help page beats a classic novel as a human set for app strings. For anchors, the strongest creative writing of the kind wins.
- Never brands' copy as an anchor to imitate (M034); as a G4 human set it is fine, kept in local-only.

## What we have
Run `node patina/tools/patina.mjs corpus`. Seed (2 Nov 2026): Willa Cather, *My Antonia* (1918, public domain), fiction, anchor only (too old to be a human set for a modern novel).

## What we need first
Modern first-person domestic fiction, human product-film end cards, real app strings, UK trade web copy and professional emails.
