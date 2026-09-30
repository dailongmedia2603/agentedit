# Phase 3: Viết Skill "capcut-video-editor"

## Objective
Tạo SKILL.md chứa toàn bộ knowledge về edit video bằng CapCut: nguyên lý, schema plan, catalog effects, template. Skill này được Hermes load khi cần generate plan.

## Implementation

### 3.1 Cấu trúc thư mục skill

```
~/.capcut-studio/engine/skills/capcut-video-editor/
├── SKILL.md                    # Main skill document
├── references/
│   ├── plan-schema.md          # JSON schema cho plan.json
│   ├── effects-catalog.md      # Top 100 effects phổ biến (từ 1767)
│   ├── sfx-catalog.md          # SFX library rút gọn
│   ├── edit-principles.md      # Nguyên lý edit video
│   └── templates/              # Template plans
│       ├── tiktok-hook-fast.md
│       ├── review-product.md
│       ├── documentary-slow.md
│       └── tutorial-howto.md
└── assets/
    └── (trống, để mở rộng sau)
```

### 3.2 SKILL.md content

```markdown
---
name: capcut-video-editor
description: "Generate professional CapCut video editing plans with structured JSON output."
version: 1.0.0
author: CapCut AI Studio
license: MIT
platforms: [macos]
metadata:
  hermes:
    tags: [video-editing, capcut, tiktok, content-creation]
    category: creative
    requires_toolsets: [mcp_capcut_api]
    config:
      - key: video.default_style
        description: "Default editing style (fast, cinematic, documentary)"
        default: "fast"
      - key: video.default_font
        description: "Default text font"
        default: "Arial Bold"
      - key: video.default_font_color
        description: "Default text color (hex)"
        default: "#FFFFFF"
      - key: video.default_font_border
        description: "Default text border color (hex)"
        default: "#000000"
---

# CapCut Video Editor

## When to Use
- User requests a video editing plan for TikTok, Reels, YouTube Shorts
- User uploads a source video and asks to create content from it
- User specifies style, duration, or content type for video creation

## Core Principles

### 1. Hook First (0-3s)
- First 3 seconds MUST grab attention
- Use: bold text overlay, fast zoom, glitch effect, or controversial statement
- Card image with large text recommended for hook segment

### 2. Pacing Rules
- TikTok/Reels (<60s): 2-3s per clip average, fast cuts
- Review/Product (60-120s): 3-5s per clip, mixed pace
- Documentary/Tutorial: 5-8s per clip, slower transitions

### 3. Text Placement
- Never center text over face
- Preferred: top-left (hook), bottom-center (captions), top-right (labels)
- Captions: 1 line max, <5 words, large font (size 14-18)

### 4. Effect Selection by Emotion
| Emotion | Effects | Use Case |
|---------|---------|----------|
| Excitement/Hype | Glitch, Flash, Speed Ramp | Product reveal, hook |
| Curiosity | Vignette, Blur Focus, Zoom | Mystery, tease |
| Trust/Professional | Soft Light, Fade, Dissolve | Tutorial, review |
| Urgency | Shake, Pulse, Red Flash | CTA, limited offer |
| Humor | Distortion, Freeze Frame, Reverse | Funny moment |

### 5. Transition Rules
- Between similar scenes: Dissolve (0.3-0.5s)
- Hook → Content: White Flash or Hard Cut
- Content → CTA: Zoom Out + Fade
- Never use same transition twice in a row

### 6. CTA (Call to Action)
- Last 5-7 seconds of video
- Clear text: "Follow for more" / "Link in bio"
- Audio ducking: lower BGM, boost voice
- Visual: arrow, button graphic, or text animation

## Plan Generation Procedure

### Step 1: Understand Source (if video provided)
- Call MCP capcut-api `get_video_duration`
- Analyze content: identify hook moments, key scenes, emotional beats
- Note audio: background music, voice segments, silence gaps

### Step 2: Select Template
- Match user request against template library in references/templates/
- If no match, construct custom plan from principles

### Step 3: Generate Plan JSON
Output MUST follow schema in references/plan-schema.md.

Key rules:
- `segments[]`: Cut source video into scenes with start/end times
- `scene_effects[]`: Max 5 effects total, no character/Pro effects
- `cards[]`: Text overlay cards for hook, titles, CTA
- `captions[]`: Full transcript captions if subtitles enabled
- `audio[]`: SFX references from references/sfx-catalog.md

### Step 4: Validate Against Memory
Check Holographic memory for user preferences:
- Font choices from past videos
- Effect patterns user approved
- Pacing preferences (fast/slow)
- CTA styles that performed well

Apply learned preferences unless user explicitly overrides.

### Step 5: Output
Return plan JSON with `plan` key, plus `metadata` with:
- `template_used`: which template was selected
- `memory_facts_applied`: which learned preferences were used
- `confidence`: 0-1 how confident in this plan

## Pitfalls
- **Character effects (Lightning, etc.)** cause CapCut export hang → NEVER use
- **Overlapping text tracks** → auto-assign tracks to prevent collision
- **Too many effects** → max 5, focus on impact moments
- **Font missing diacritics** → Arial Bold for Vietnamese text
- **Long intro** → max 3s hook, then content immediately

## Verification
1. Plan JSON validates against schema
2. Segment timestamps cover full source duration
3. No character/Pro effects in scene_effects
4. Text colors have proper contrast (white on dark, black on light)
5. CTA segment exists at end with clear text
```

### 3.3 plan-schema.md (reference)

```markdown
# Plan JSON Schema

## Required fields
- source_video: string (path to source MP4)
- canvas: { w: 1080, h: 1920 }
- duration: float (total video duration in seconds)
- segments: array of Segment
- audio: array of AudioItem (can be empty)

## Optional fields
- scene_effects: array of Effect
- cards: array of Card
- captions: array of Caption

## Segment
{
  "start": float,       // start time in source (seconds)
  "end": float,         // end time in source (seconds)
  "scale": float,       // 1.0 = normal, >1 = zoom in
  "transition": string, // transition type name
  "transition_duration": float  // default 0.5s
}

## Effect
{
  "type": string,       // effect name from catalog
  "start": float,
  "end": float,
  "intensity": float    // 0-1, default 0.5
}

## Card
{
  "file": string,       // path to PNG image
  "start": float,
  "end": float,
  "scale": float,       // default 1.0
  "position": "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right"
}

## Caption
{
  "text": string,
  "start": float,
  "end": float,
  "color": string,      // hex color
  "size": int,          // font size
  "position": string    // default "bottom-center"
}

## AudioItem
{
  "type": "sfx" | "bgm",
  "id": string,         // SFX ID from catalog or file path
  "start": float,
  "volume": float,      // 0-1
  "speed": float        // default 1.0
}
```

### 3.4 effects-catalog.md (rút gọn từ 1767 → top 100)

Trích từ `effects_index.json`, chọn top 100 effect phổ biến nhất, nhóm theo category:

```
CATEGORY: Glitch/Distortion
- Color_Glitch, RGB_Glitch, Digital_Distortion, Screen_Tear, VHS_Glitch

CATEGORY: Light/Glow  
- Soft_Light, Spotlight, Lens_Flare, Golden_Hour, Neon_Glow

CATEGORY: Motion/Zoom
- Smooth_Zoom, Speed_Ramp, Shake, Pulse, Push_Zoom

CATEGORY: Transition
- White_Flash, Fade_Black, Dissolve, Slide_Left, Wipe_Right

CATEGORY: Vintage/Retro
- Film_Burn, Dust_Scratches, Vignette, Grain, Old_Film

... (đủ 100 effects)
```

### 3.5 sfx-catalog.md

Từ `sfx_library.json`, tạo catalog rút gọn với emotion mapping:

```json
[
  {"id": "vine-boom", "name": "Vine Boom", "emotion": "surprise", "duration": 0.5},
  {"id": "click", "name": "UI Click", "emotion": "transition", "duration": 0.2},
  ...
]
```

## Success Criteria
- [ ] SKILL.md có đủ 6 section: When to Use, Core Principles, Procedure, Pitfalls, Verification
- [ ] plan-schema.md mô tả đầy đủ tất cả field của plan.json hiện tại
- [ ] effects-catalog.md có top 100 effects, nhóm theo category, có emotion mapping
- [ ] sfx-catalog.md có đủ SFX với emotion + use_when
- [ ] 4 templates: tiktok-hook-fast, review-product, documentary-slow, tutorial-howto

## Files Changed
- `~/.capcut-studio/engine/skills/capcut-video-editor/SKILL.md` — NEW
- `~/.capcut-studio/engine/skills/capcut-video-editor/references/*.md` — NEW
- `~/.capcut-studio/engine/skills/capcut-video-editor/references/templates/*.md` — NEW
