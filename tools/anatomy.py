"""Sentence anatomy for the Copybook (v0.2).

Reads a sentences.mjs .jsonl (one sentence per line, with id and text) and writes the same rows with an
"anat" object: clause architecture, branching, Theme, end-weight, phrase and verb anatomy, lexis, punctuation
splits, the part-of-speech template and cohesion with the previous sentence. Parser: spaCy en_core_web_md
(MIT licence). Word frequency: wordfreq (Zipf scale). Deterministic: no model judgement.

Usage: python anatomy.py <in.jsonl> <out.jsonl>
Run with the local venv: %LOCALAPPDATA%\\patina-venv\\Scripts\\python.exe (see tools/book-prep/README.md).
"""
import json
import re
import sys

import spacy
from wordfreq import zipf_frequency

from intro_commas import intro

CONTENT = {"NOUN", "VERB", "ADJ", "ADV", "PROPN"}
CLAUSAL = {"advcl": "adverbial", "relcl": "relative", "acl": "adnominal", "ccomp": "complement", "xcomp": "open-complement", "csubj": "subject-clause", "parataxis": "parataxis"}
MENTAL = set("think know feel want wish hope remember forget believe wonder realise realize notice understand hate love like fear doubt guess suppose imagine decide mean need prefer worry recognise recognize".split())
VERBAL = set("say tell ask reply answer shout whisper call add explain repeat mutter yell scream announce mention promise admit insist agree argue".split())
RELATIONAL = set("be have seem become look appear remain stay sound smell taste get own belong contain".split())
LATINATE = re.compile(r"(tion|sion|ment|ance|ence|ancy|ency|ity|ive|ous|ious|ate|ize|ise|ible|able|ure|ude|al)$", re.I)
NOMINAL = re.compile(r"(tion|sion|ment|ness|ity|ance|ence|ancy|ency|ism)$", re.I)
MARKERS = set("however still then so anyway besides meanwhile instead though yet now later afterward afterwards also too again otherwise".split())


def depth(tok):
    d = 0
    while tok.head.i != tok.i:
        tok = tok.head
        d += 1
    return d


def third(i, n):
    return "first" if i < n / 3 else ("middle" if i < 2 * n / 3 else "last")


def theme_type(doc, root):
    before = [t for t in doc if t.i < root.i and not t.is_punct]
    if not before:
        return "verb-first"
    first = before[0]
    if first.text in {'"', "“"} or doc[0].text in {'"', "“"}:
        return "dialogue"
    # the constituent of the first word: climb to the child of root that contains it
    t = first
    while t.head.i != root.i and t.head.i != t.i:
        t = t.head
    if first.dep_ in ("cc",) or (first.pos_ == "CCONJ"):
        return "conjunction"
    if t.dep_ in ("nsubj", "nsubjpass", "expl", "csubj"):
        return "subject"
    if t.dep_ in ("advcl", "mark") or first.dep_ == "mark":
        return "adverbial-clause"
    if t.dep_ in ("advmod", "npadvmod", "prep", "obl", "intj", "discourse"):
        return "adverbial"
    if t.dep_ in ("aux", "auxpass") and doc[-1].text == "?":
        return "question"
    return "other"


def anatomy(doc, prev_lemmas):
    toks = [t for t in doc if not t.is_space]
    words = [t for t in toks if not t.is_punct]
    n = len(words) or 1
    roots = [t for t in doc if t.dep_ == "ROOT"]
    root = roots[0] if roots else doc[0]
    widx = {t.i: k for k, t in enumerate(words)}
    root_w = widx.get(root.i, 0)
    clauses = {}
    for t in doc:
        if t.dep_ in CLAUSAL:
            clauses[CLAUSAL[t.dep_]] = clauses.get(CLAUSAL[t.dep_], 0) + 1
        if t.dep_ == "conj" and t.pos_ in ("VERB", "AUX") and t.head.pos_ in ("VERB", "AUX"):
            clauses["coordinated"] = clauses.get("coordinated", 0) + 1
    sub = sum(v for k, v in clauses.items() if k != "coordinated" and k != "parataxis")
    coord = clauses.get("coordinated", 0) + clauses.get("parataxis", 0)
    dep_lens = [abs(t.i - t.head.i) for t in words if t.head.i != t.i]
    # root's children as constituents, for end-weight
    kids = [c for c in root.children if not c.is_punct]
    first_len = len([w for w in kids[0].subtree if not w.is_punct]) if kids else 0
    last_len = len([w for w in kids[-1].subtree if not w.is_punct]) if kids else 0
    content = [t for t in words if t.pos_ in CONTENT and t.dep_ not in ("aux", "auxpass")]
    zipfs = [(zipf_frequency(t.text.lower(), "en"), t) for t in content if t.is_alpha and t.pos_ != "PROPN"]
    rarest = min(zipfs, key=lambda x: x[0]) if zipfs else None
    chunks = list(doc.noun_chunks)
    amod_stack = max([sum(1 for c in t.children if c.dep_ == "amod") for t in doc if t.pos_ in ("NOUN", "PROPN")] or [0])
    # prepositional chain: prep -> pobj -> prep ...
    def chain(t):
        best = 0
        for c in t.children:
            if c.dep_ == "prep":
                for o in c.children:
                    if o.dep_ == "pobj":
                        best = max(best, 1 + chain(o))
        return best
    prep_chain = max([chain(t) for t in doc] or [0])
    verbs = [t for t in doc if t.pos_ == "VERB"]
    lemma = root.lemma_.lower()
    process = "verbal" if lemma in VERBAL else "mental" if lemma in MENTAL else "relational" if lemma in RELATIONAL else ("material" if root.pos_ in ("VERB", "AUX") else "none")
    passive = any(t.dep_ in ("nsubjpass", "auxpass") for t in doc)
    progressive = any(t.tag_ == "VBG" and any(a.lemma_ == "be" and a.dep_ == "aux" for a in t.children) for t in doc)
    perfect = any(t.tag_ == "VBN" and any(a.lemma_ == "have" and a.dep_ == "aux" for a in t.children) for t in doc)
    modal = any(t.tag_ == "MD" for t in doc)
    participial = sum(1 for t in doc if t.dep_ in ("advcl", "acl") and t.tag_ in ("VBG", "VBN") and not any(c.dep_.startswith("nsubj") for c in t.children))
    # punctuation splits
    text = doc.text
    segs = [s for s in re.split(r"[,;:—–]|\s-\s", text) if s.strip()]
    seg_lens = [len(s.split()) for s in segs]
    comma_pos = [widx.get(t.i - 1, 0) for t in doc if t.text == "," and t.i > 0]
    mod_where = sorted({("initial" if p < root_w else "final") for p in comma_pos}) if comma_pos else []
    lemmas = {t.lemma_.lower() for t in content if t.pos_ in ("NOUN", "PROPN", "VERB")}
    first_word = words[0] if words else None
    return {
        "words": len(words),
        "pos": " ".join(t.pos_ for t in toks),
        "clauses": clauses,
        "nClauses": 1 + sub + coord,
        "subordinate": sub,
        "coordinate": coord,
        "beforeVerb": root_w,
        "verbAt": round(root_w / n, 2),
        "depth": max([depth(t) for t in doc] or [0]),
        "depLen": round(sum(dep_lens) / len(dep_lens), 2) if dep_lens else 0,
        "theme": theme_type(doc, root),
        "endWeight": round(last_len / first_len, 2) if first_len else None,
        "rarestAt": third(widx.get(rarest[1].i, 0), n) if rarest else None,
        "rarestZipf": round(rarest[0], 2) if rarest else None,
        "npMax": max([len(c) for c in chunks] or [0]),
        "adjStack": amod_stack,
        "prepChain": prep_chain,
        "nominal": sum(1 for t in content if t.pos_ == "NOUN" and NOMINAL.search(t.text)),
        "process": process,
        "passive": passive,
        "progressive": progressive,
        "perfect": perfect,
        "modal": modal,
        "participial": participial,
        "verbs": len(verbs),
        "density": round(len(content) / n, 2),
        "zipf": round(sum(z for z, _ in zipfs) / len(zipfs), 2) if zipfs else None,
        "rare": sum(1 for z, _ in zipfs if z < 3),
        "latinate": round(sum(1 for t in content if len(t.text) > 6 and LATINATE.search(t.text)) / (len(content) or 1), 2),
        "wordLen": round(sum(len(t.text) for t in words) / n, 2),
        "segments": len(segs),
        "segLens": seg_lens,
        "semicolon": text.count(";"),
        "colon": text.count(":"),
        "dash": len(re.findall(r"—|–|\s-\s|--", text)),
        "modifiers": mod_where,
        "intro": (lambda r: {"kind": r[0], "words": r[1], "comma": r[2]} if r else None)(intro(doc)),
        "cohesion": {
            "pronounStart": bool(first_word is not None and first_word.pos_ == "PRON" and first_word.dep_.startswith("nsubj")),
            "marker": bool(first_word is not None and first_word.text.lower() in MARKERS),
            "conjStart": bool(first_word is not None and first_word.pos_ == "CCONJ"),
            "overlap": len(lemmas & prev_lemmas),
        },
    }, lemmas


def main():
    src, out = sys.argv[1], sys.argv[2]
    rows = [json.loads(l) for l in open(src, encoding="utf-8") if l.strip()]
    nlp = spacy.load("en_core_web_md", disable=["ner"])
    prev = set()
    last_para = None
    with open(out, "w", encoding="utf-8") as f:
        for row, doc in zip(rows, nlp.pipe((r["text"] for r in rows), batch_size=64)):
            if row.get("para") != last_para and last_para is not None:
                pass  # cohesion still counts across paragraphs; keep prev
            a, lemmas = anatomy(doc, prev)
            prev, last_para = lemmas, row.get("para")
            row["anat"] = a
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(f"anatomy: {len(rows)} sentences -> {out}")


if __name__ == "__main__":
    main()
