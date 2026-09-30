---
title: "Tích hợp Hermes Agent vào CapCut AI Studio (Hybrid - Core)"
description: "Fork Hermes Agent → CapCut Engine, tích hợp memory + skill + MCP vào sidecar hiện tại, che giấu branding, fallback an toàn."
status: pending
priority: P1
effort: 16h
branch: main
tags: [backend, integration, ai, capcut, hermes, memory]
blockedBy: []
blocks: []
created: 2025-06-17
---

# Plan: Hermes Hybrid Integration (Core)

## Overview

Tích hợp Hermes Agent làm "bộ não dài hạn" cho CapCut AI Studio. Hermes cung cấp memory system (học style user), skill system (đóng gói knowledge edit video), và MCP bridge tới CapCut pipeline. Giữ nguyên UI Electron + sidecar hiện tại, thêm Hermes như 1 module Python trong sidecar. Toàn bộ branding Hermes được rename thành "CapCut Engine". Fallback về GPT plan trực tiếp nếu Hermes unavailable.

## Scope Decision

**REDUCTION** — Chỉ làm core integration:
- ✅ Fork + rename Hermes Agent → "CapCut Engine"
- ✅ Memory provider (Holographic local)
- ✅ Skill `capcut-video-editor`
- ✅ MCP config nối Hermes → capcut-api
- ✅ Sidecar gọi Hermes API (port 8642)
- ✅ Fallback path
- ✅ Doctor check Hermes health
- ❌ Nuitka compile → binary (defer)
- ❌ Cron scheduler (defer)
- ❌ Telegram/Discord gateway (defer)
- ❌ Honcho dialectic reasoning (defer, dùng Holographic local)
- ❌ Bundle .dmg tích hợp (defer)

## Architecture

```
┌─────────────────────────────────────────────────────┐
│           CapCut AI Studio (Electron)                │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │     Python Sidecar (Flask :5123)              │   │
│  │                                               │   │
│  │  ┌─────────────────┐  ┌───────────────────┐  │   │
│  │  │ CapCut Engine   │  │ CapCut Pipeline   │  │   │
│  │  │ (Hermes fork)   │  │ (hiện tại)        │  │   │
│  │  │                 │  │                   │  │   │
│  │  │ • Memory        │  │ • build_draft.py  │  │   │
│  │  │ • Skills        │  │ • deploy_draft.py │  │   │
│  │  │ • MCP Client    │  │ • find_effect.py  │  │   │
│  │  │ • AIAgent       │  │ • auto_export.py  │  │   │
│  │  └────────┬────────┘  └───────────────────┘  │   │
│  │           │                                    │   │
│  │           │ MCP stdio                          │   │
│  │           ▼                                    │   │
│  │  ┌─────────────────┐                          │   │
│  │  │ MCP capcut-api  │                          │   │
│  │  │ (mcp_server.py) │                          │   │
│  │  └─────────────────┘                          │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### Data Flow

```
User prompt "Làm video TikTok 60s..."
  │
  ▼
Electron IPC → Sidecar /autoplan
  │
  ▼
EngineManager.plan(prompt, video_path)
  │
  ├─ 1. Nạp skill "capcut-video-editor" (SKILL.md)
  ├─ 2. Query memory: Holographic search(user style)
  ├─ 3. Construct system prompt = skill + memory + prompt
  ├─ 4. AIAgent.run_conversation() → generate plan.json
  ├─ 5. Memory auto-extract facts từ plan đã tạo
  └─ 6. Return plan.json
  │
  ▼
Sidecar build_draft.py(plan.json) → CapCut draft
  │
  ▼
Sidecar deploy + auto-export → MP4
```

## Key Design Decisions

### 1. Embedded module, not separate process
Hermes Agent import trực tiếp vào sidecar Python process (không spawn subprocess riêng). Lý do:
- Tránh 2 process Python chạy song song
- Dùng chung venv (sau khi test Hermes trên Python 3.12)
- Khởi tạo AIAgent instance, không cần HTTP loopback

### 2. Holographic memory (local SQLite)
Chọn Holographic thay vì Mem0/Honcho vì:
- Zero external dependencies, no API keys
- Hoàn toàn offline, không lộ network call
- Trust scoring giúp lọc fact nhiễu
- Không cần user đăng ký dịch vụ nào

### 3. Hermes chạy ở 2 chế độ
- **Embedded mode** (default): AIAgent import thẳng, gọi qua Python API
- **Fallback mode**: Nếu engine lỗi → dùng GPT plan trực tiếp như hiện tại

### 4. Rename strategy
- Fork repo → `capcut-engine`
- Environment variable: `HERMES_HOME` → `~/.capcut-studio/engine/`
- Search-replace: `hermes` → `capcut_engine`, `Hermes` → `CapCutEngine`
- Strip all log branding

## Phases

| Phase | Nội dung | Files | Time |
|-------|----------|-------|------|
| 1 | Fork & Rename Hermes Agent | Forked repo | 2h |
| 2 | Cài đặt + test trong sidecar venv | sidecar/ | 2h |
| 3 | Viết skill capcut-video-editor | SKILL.md + references | 3h |
| 4 | Cấu hình MCP capcut-api | config | 1h |
| 5 | Tích hợp EngineManager vào sidecar | sidecar/engine*.py | 4h |
| 6 | Test E2E + fallback | tests/ | 4h |

## NOT In Scope (v2+)
- Nuitka compile Python → binary
- Cron scheduler
- Telegram/Discord/Slack gateways
- Honcho dialectic reasoning
- Mem0 cloud sync
- .dmg bundle Hermes (giữ nguyên extraResources sidecar)
