# Build tooling for the Civil Law-I study documents

Content is written in a light markup (`content/topicN/kb_*.md`, `qa_*.md`) with figure specs in
`kb_figures.json` / `qa_figures.json`. To rebuild a topic's two Word documents:

```bash
./build.sh topic1 "Topic 1 - CPC Part I and Civil Courts Ordinance"        # both documents
./build.sh topic1 "Topic 1 - CPC Part I and Civil Courts Ordinance" kb     # knowledge base only
```

- `figures.js` renders figures (answer maps, trees, flows, org charts, cards, decision charts) to PNG with headless Chromium.
- `build_docx.js` converts the markup to a styled .docx (cover, clickable contents, coloured boxes, tables, figures).
- `make.py` builds twice so the contents page carries real page numbers, then renumbers bookmark ids.

Output goes to `../Civil Law-I/<topic folder>/`; PDFs for checking go to `out/` (git-ignored).

Topic folder names used:

- `topic1` — "Topic 1 - CPC Part I and Civil Courts Ordinance"
- `topic2` — "Topic 2 - CPC Part II (Decree, Interim Relief, Execution and Remedies)"
- `topic3` — "Topic 3 - Contract Act (General Principles)"
- `topic4` — "Topic 4 - Specific Contracts and Sale of Goods"

Civil Law Paper II topics are built into `../Civil Law-II/` by passing the paper folder as the fourth argument:

```bash
./build.sh cl2topic1 "Topic 1 - Muslim Family Law" kb "Civil Law-II"
```
