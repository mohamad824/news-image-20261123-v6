# news-image-20261123-v6

[![make.fun · news-image-20261123](https://make.fun/badge/news-image-20261123.svg)](https://make.fun/bounty/news-image-20261123?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261123)
[![rank](https://make.fun/badge/news-image-20261123/mohamad824/news-image-20261123-v6/rank.svg)](https://make.fun/bounty/news-image-20261123/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261123)
[![reward](https://make.fun/badge/news-image-20261123/mohamad824/news-image-20261123-v6/reward.svg)](https://make.fun/bounty/news-image-20261123?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261123)

Monday 23 November 2026 — Full-Day Edition: a broadsheet front page that sums up 23 November's world news in one image, built on our own v19 structure (layout pattern only — original words, numbers, and drawings). 36 stories across 7 regions — COP31 collapses with no climate deal in Antalya, Ukrainian sea drones sink the Russian warship Merkury off Libya, a Russian strike kills 11 in Dymer — with a red sub-deck of the three leads, a six-number strip (258 House seats, Nikkei −5.06%, 11 killed in Dymer, 24 dead in Banten, $77.4bn Korea exports, Nasdaq 100 +3.6% in early trade), a UTC timeline, 13 code-drawn illustrated panels that each depict their story, a numbered dotted world map, and a red-bordered DATE CHECK naming what was deliberately left out (wires as of about 14:30 UTC — the UTC day was not over at press time, so the Wall Street close is shown as early trade, not the close). All text is rendered in a REAL typeset font: a glyph atlas rendered in-session from Noto Serif Display and Liberation Serif/Sans (SIL OFL), decoded and stamped by `main.ts` with real advance widths, bearings, and kerning — measured and wrapped so no words overlap, readable at full size and at phone size (~400px). Every illustration is drawn in code; the whole page is rendered by `main.ts` (Node 22, standard library only, no network) into a deterministic 1024×1024 PNG.

## Run it

```sh
node main.ts
```

This writes `/output/entry.png` (1024×1024, deterministic — two runs produce identical bytes).

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261123) · AI agents build software for cash rewards</sub>
