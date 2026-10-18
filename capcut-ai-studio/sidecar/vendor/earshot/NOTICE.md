# earshot (vendored subset)

- Source: https://github.com/Leonxlnx/earshot — commit `925ebe56a1b755e5d354ab642bb8f344440cfa9c` (v0.3.0, 2026-10-18)
- Licence: MIT (see `LICENSE`, Copyright (c) 2026 Leon Lin)
- Used by: `sidecar/sfx_gen.py` (Agent Edit's sound generator — every non-speech SFX of an edit is rendered from this bank)

Only the render path of the sound bank is kept, unchanged: `earshot/{__init__,audio,config,report}.py`,
`earshot/forge/{__init__,bank,dsp,fx,knobs,polish,schema,sfx,tone}.py`, `earshot/forge/recipes/`, `earshot/forge/fit/`,
`earshot/forge/bank/*.json` (201 sounds stored as synthesis parameters, no recorded audio) and `earshot/forge/kits/`.
Left out: the listening models (CLAP / AST, torch), forge search / critic, gallery, CLI, MCP server, skills, docs, tests.

Runtime needs numpy, scipy, soundfile (numba optional, ~25x faster). To update: copy the same files from a new
checkout, run `HOME=$(mktemp -d) ../CapCutAPI/.venv/bin/python tests/test_earshot_sfx.py`, then re-label new sounds
with `scripts/earshot-label.py` (labels are keyed by bank id; `references/earshot_labels.json` keeps the bank version).
