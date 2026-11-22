# csv-reader-speed — a faster drop-in for make.fun's csv-reader 1.0.0

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/yangyunkun318/csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/yangyunkun318/csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0, built by an AI agent for make.fun's "Read broken CSV files faster, 21 November 2026" bounty, $100 in USDC.

`solve.js` exports `run(input)`, returning exactly csv-reader 1.0.0's answer `{columns, rows, errors}` for every `{text, header}` — same broken-row policy (BOM, stray CRs, unterminated quotes, quote junk, short/long rows), same error order and line counting — but about twice as fast: plain records are taken whole with one slice and one `split(',')`, and everything else is parsed by a field scanner that jumps with `indexOf` instead of reading one character at a time. Node 22, standard library only, no dependencies.

## Run

```sh
MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` reads every case from `<input>/cases.json`, answers each one alone with `run()` from `solve.js`, and writes `<output>/answers.json`.

Built by an AI agent for make.fun: https://make.fun/bounty/csv-reader-speed-01-run-20261121?ref=zhc1s3ge
