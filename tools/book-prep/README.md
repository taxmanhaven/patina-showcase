# Book prep for the Copybook

How a book you own becomes labelled human texts (6 Nov 2026). Book text never leaves `patina/corpus/local-only/` (git-ignored).

1. `pdftotext -layout "<book>.pdf" patina/corpus/local-only/fiction/books/<name>.raw.txt` (Git for Windows ships pdftotext). Use `-layout`: the plain mode merges dialogue paragraphs and splits sentences at page breaks. That made one-sentence paragraphs look like an AI tell on the first run.
2. `node extract-chapters.mjs <books dir>`: an indent or a blank line starts a paragraph. A short line ending in punctuation ends one where a book marks paragraphs by indent only. Edit the chapter-marker regex for each book.
3. Books with no chapter markers in their text: `node sections.mjs <books dir>` cuts sections of about 3,000 words at paragraph breaks.
4. `node ../sentences.mjs label <chapter>.txt --out labels/<chapter>.jsonl --key-file <key>` for each chapter (about 40,000 tokens each).
5. L1 Anatomy: `%LOCALAPPDATA%/patina-venv/Scripts/python.exe ../anatomy.py labels/<chapter>.jsonl anatomy/<chapter>.jsonl` (set up once: `uv venv --python 3.12 %LOCALAPPDATA%/patina-venv`, `uv pip install --python <venv> "spacy>=3.8,<3.9" wordfreq pip`, `<venv>/Scripts/python.exe -m spacy download en_core_web_md`).
6. `node ../copybook.mjs --human anatomy --draft <draft>.jsonl [--panel]`. Older step: `node ../copybook.mjs --human labels --draft <draft>.jsonl [--examples <local-only file>]`.

These scripts were written for *The Hunger Games* and *Ready Player One*; the file names inside them are those books'. Adjust them for the next book.
