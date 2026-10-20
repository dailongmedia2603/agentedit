# ElevenLabs API — SFX generation

## Default route and boundaries
Generate new SFX through ElevenLabs' Sound Effects API. Use local tools for reference analysis, candidate selection, editing, synchronization, procedural supporting layers and mixing. No Stable Audio/local generative audio model is included or required. Preserve optional local CLAP, PANNs, CoNeTTE and librosa + NumPy/SciPy analysis workflows; these are separate from hosted SFX generation. CoNeTTE remains experimental/manual, not a tested bundled adapter.

Do not generate blindly for every frame. Derive meaningful contacts, hovers, file landings, card pops, text groups, velocity envelopes and intentional silence from the shared visual cue table. Reuse good variants across suitable events. A provider does not guarantee expert taste or correct Foley; audition against the actual narration and refine locally.

## Credentials, cost and privacy
Each buyer supplies their own ElevenLabs account and API key. Read `ELEVENLABS_API_KEY` from a securely configured local environment. A private project `.env` may be used through a reviewed loader; the bundled helper does not automatically source arbitrary files. Never put keys in chat, CLI arguments, cue files, logs, screenshots, Git or the plugin archive. No author's key, customer sounds, personal paths or model weights belong in the package.

Before generation, approve the prompt, duration, number of variants/requests and credit budget. Check the current account pricing and output/usage rights; do not invent a universal per-second cost or assume plugin ownership grants commercial ElevenLabs rights. Send only approved descriptive text. Never upload private reference recordings or narration merely to create a similar sound. Authorization for SFX generation does not authorize voice cloning, music generation or unrelated paid calls.

## Commands
The bundled stdlib helper needs no SDK, GPU, Torch or local model download. Run with an available Python 3.10+ from the project:
```text
python "<skill>/scripts/gen_sfx_elevenlabs.py"
```
This prints an offline plan and whether a key is configured, never its value. It sends no request.

After explicit cost/privacy approval and secure key setup:
```text
python "<skill>/scripts/gen_sfx_elevenlabs.py" --generate --allow-paid-request --prompt "One soft dry rounded interface click, isolated, minimal high frequencies, no ambience, no music, no speech" --duration 0.5 --output "assets/sfx/generated/ui-click-01.mp3"
```
One invocation sends **one** generation request. No automatic retries: timeout/failure can leave billing uncertain, so inspect the account first. Existing outputs are not overwritten. Auth/access/credit failures must be resolved, not silently routed to another paid service. Actual billable generation was not run for package validation; mocked requests and offline guards were tested.

The helper uses `POST https://api.elevenlabs.io/v1/sound-generation`, `model_id=eleven_text_to_sound_v2`, `loop=false`, `output_format=mp3_44100_128`. Current documented duration is 0.5–30 s and prompt influence is 0–1 (default 0.3). Recheck official docs if the service changes; do not migrate models/endpoints automatically. For a 40–150 ms contact, generate the minimum supported duration then locate/trim the useful transient locally. Shorter final cue length does not imply a cheaper API request.

The MP3 route is lossy. Higher-bitrate/PCM formats can require different account tiers. If a project needs a different supported format, confirm current entitlement and implement/test that format explicitly; do not merely give MP3 bytes a WAV extension. Save originals and preserve the provenance sidecar.

## Motion-design direction
- **Hover:** a restrained 40–80 ms soft tick, one per target entry, quieter than click. Avoid ringing tails.
- **Click / selection:** a dry rounded contact at actual press, optionally a small confirmation pop when the checkmark appears.
- **File drop:** a short airy drag/movement layer plus a soft material-matched landing and settle. Request papery Foley only if motivated; align contact, not file start.
- **Dropdown / card:** compact body/pop plus a short movement envelope; no cinematic trailer boom by default.
- **Typography:** grouped dry ticks for reveal/decoding; a slightly stronger body for a hero word. Use project fonts/visual taste, not generic kinetic presets.
- **Camera push:** filtered short swish following acceleration; taper at settle. Calm moves may be deliberately silent.
- **Cooking / physical actions:** describe actual source/action (knife against food/board, hot pan sizzle). Verify plausibility; do not substitute an airy knife swish for chopping contacts.

Describe one sound layer with source, action, material, energy, dryness, tail and exclusions. Start with a small approved candidate set; generate new variants only within budget. The API does not provide a seed control in this helper: save returned bytes and hashes rather than promising deterministic regeneration.

## Local finish and cue coverage
Use FFmpeg, NumPy/SciPy and librosa to inspect/trim/filter/fade; optional CLAP can rank candidate suitability, PANNs can provide coarse class hints and separately configured CoNeTTE can caption. None proves that a sound is the exact reference sample or that it sounds good under narration. Keep analysis local unless the user separately authorizes otherwise.

Place actual perceived contact on the beat-map frame. Match movement envelopes and tail ends to animation duration. Record `animation_id / event / frame / source_anchor / asset / gain / pan / tail_end / evidence` and document intentional silence. Keep VO, UI/text, camera and Foley buses separate; mute recording/monitor audio when requested. Test range mixes for audible clicks without harshness or masked consonants. A +20% request is ×1.2 amplitude; a -20% request is ×0.8 on the specified bus/range, not an arbitrary global loudness change. Prevent clipping; follow project loudness/true-peak targets.

If credentials or credit approval are absent, explain that generation is unavailable and offer existing licensed sounds/procedural candidates. Never silently install a local audio generator. Do not add generated assets or private review decisions to the distributable skill.

Official API reference: https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert
