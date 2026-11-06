"""Introductory commas (Copybook L1; Nathan via Luke Studio, 6 Nov 2026: "On a Sunday our kitchen is mostly steam.
I feel like the comma should go after Sunday.").

For each sentence, find the introductory element: everything before the subject of the main clause, when the
sentence opens on an adverbial clause or phrase. Report whether a comma follows it, by kind and length. This measures
what published authors actually do, beside the style guides (Chicago Manual of Style 6.24 and 6.36: a comma after an
introductory dependent clause; optional after a short introductory phrase).

Usage:
  python intro_commas.py stats <labels.jsonl> [...]        rates by kind and length
  python intro_commas.py check <text file>                  lines that open on a clause or 3+ word phrase with no comma
"""
import json
import sys

import spacy

NLP = None


def nlp():
    global NLP
    if NLP is None:
        NLP = spacy.load("en_core_web_md", disable=["ner"])
    return NLP


def intro(doc):
    """Return (kind, length, has_comma, text) for an introductory adverbial, or None.
    kind: clause (contains a verb), phrase (no verb). Inversions ("In the pocket was a ring") are skipped."""
    roots = [t for t in doc if t.dep_ == "ROOT"]
    if not roots:
        return None
    root = roots[0]
    if doc[0].text in {'"', "“", "'", "‘"} or doc[0].is_punct:
        return None
    subj = [t for t in root.children if t.dep_ in ("nsubj", "nsubjpass", "expl", "csubj")]
    if not subj:
        return None
    s = min(t.left_edge.i for t in subj)
    if s == 0 or s > root.i:
        return None  # opens on the subject, or an inversion
    head_kids = [t for t in root.children if t.i < s and t.dep_ in ("advcl", "prep", "advmod", "npadvmod", "obl", "mark", "intj", "pcomp")]
    if not head_kids:
        return None
    if doc[0].pos_ in ("CCONJ",):
        return None  # "And then..." is a conjunction opener, not an introductory element
    if doc[-1].text == "?" or any(t.tag_ in ("WDT", "WP", "WRB") and t.i < s and t.dep_ != "advmod" for t in doc):
        return None  # questions
    if any(t.text == "," for t in doc[0:s - 1]) and doc[s - 1].text != ",":
        return None  # already cut by a comma inside the opener
    span = doc[0:s]
    words = [t for t in span if not t.is_punct]
    has_comma = any(t.text == "," for t in span) and span[-1].text == ","
    kind = "clause" if any(t.pos_ in ("VERB", "AUX") for t in span) else "phrase"
    return kind, len(words), has_comma, span.text.strip()


def band(n):
    return "1" if n == 1 else "2" if n == 2 else "3-4" if n <= 4 else "5+"


def stats(files):
    c = {}
    for f in files:
        rows = [json.loads(l) for l in open(f, encoding="utf-8") if l.strip()]
        for doc in nlp().pipe((r["text"] for r in rows), batch_size=64):
            r = intro(doc)
            if not r:
                continue
            k = (r[0], band(r[1]) if r[0] == "phrase" else "any")
            a = c.setdefault(k, [0, 0])
            a[0] += 1
            a[1] += 1 if r[2] else 0
    for (kind, b), (n, wc) in sorted(c.items()):
        print(f"{kind:6} {b:4} n {n:5}  comma {wc / n:.0%}")


def check(path):
    text = open(path, encoding="utf-8").read()
    lines = text.splitlines()
    for ln, line in enumerate(lines, 1):
        if not line.strip() or line.startswith("#"):
            continue
        for sent in nlp()(line).sents:
            r = intro(sent.as_doc())
            if r and not r[2] and (r[0] == "clause" or r[1] >= 3):
                print(f"L{ln}: no comma after introductory {r[0]} ({r[1]} words): \"{r[3]}\" in: {sent.text.strip()}")


if __name__ == "__main__":
    if sys.argv[1] == "stats":
        stats(sys.argv[2:])
    else:
        check(sys.argv[2])
