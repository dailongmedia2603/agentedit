# Phase 6: Test E2E & Fallback

## Objective
Verify toàn bộ pipeline hoạt động: Engine plan → build draft → deploy → export. Verify fallback khi Engine unavailable. Test memory tích luỹ qua nhiều lần edit.

## Test Plan

### 6.1 Unit Tests

#### Test 1: EngineManager init/shutdown
```python
# tests/test_engine_manager.py
def test_engine_init_success():
    mgr = EngineManager()
    assert mgr.init("openai", "gpt-4o", "test-key") == True
    assert mgr.is_healthy() == True

def test_engine_init_failure_graceful():
    mgr = EngineManager()
    # Invalid provider → should return False, not crash
    assert mgr.init("invalid_provider", "model", "key") == False
    assert mgr.is_healthy() == False
```

#### Test 2: Fallback path
```python
def test_fallback_when_engine_unavailable():
    # Engine not initialized
    plan = plan_video("test prompt")  
    assert plan["_metadata"]["planner"] == "gpt_fallback"
    assert plan["_metadata"]["memory"] == False

def test_engine_plan_with_memory():
    # Engine initialized, memory has prior facts
    mgr.init("openai", "gpt-4o", "key")
    mgr._save_to_memory({"captions": [{"text": "test"}]}, "test")
    
    plan = plan_video("test prompt")
    assert plan["_metadata"]["planner"] == "engine"
    assert plan["_metadata"]["memory"] == True
```

#### Test 3: Skill loading
```python
def test_skill_loaded():
    mgr = EngineManager()
    ctx = mgr._load_skill_summary()
    assert "Hook First" in ctx
    assert "Pacing Rules" in ctx
    assert "Pitfalls" in ctx
```

#### Test 4: Memory read/write
```python
def test_memory_persistence():
    mgr = EngineManager()
    mgr.init("openai", "gpt-4o", "key")
    
    # Write
    mgr._save_to_memory({"captions": [{"text": "test"}], "scene_effects": [{"type": "Glitch"}]}, "test")
    
    # Read
    facts = mgr._query_memory("video editing")
    assert len(facts) > 0
    assert any("Glitch" in f for f in facts) or any("captions" in f for f in facts)
```

### 6.2 Integration Tests

#### Test 5: E2E with Engine (STUDIO_E2E existing pattern)
```bash
# Dùng E2E gate đã có, với ENGINE_ENABLED=1
STUDIO_E2E=1 \
STUDIO_E2E_VIDEO=/path/to/test_video.mp4 \
ENGINE_ENABLED=1 \
/path/to/CapCut\ AI\ Studio.app/Contents/MacOS/CapCut\ AI\ Studio

# Expected: [E2E] RESULT: PASS
# Plan should have _metadata.planner == "engine"
```

#### Test 6: E2E with fallback (simulate engine failure)
```bash
# Giả lập engine unavailable
STUDIO_E2E=1 \
STUDIO_E2E_VIDEO=/path/to/test_video.mp4 \
ENGINE_ENABLED=0 \
/path/to/CapCut\ AI\ Studio.app/Contents/MacOS/CapCut\ AI\ Studio

# Expected: [E2E] RESULT: PASS (via GPT fallback)
# Plan should have _metadata.planner == "gpt_fallback"
```

#### Test 7: Doctor check
```bash
STUDIO_DOCTOR=1 \
/path/to/CapCut\ AI\ Studio.app/Contents/MacOS/CapCut\ AI\ Studio

# Expected output includes:
# [Doctor] CapCut Engine: OK (v2.x.x-renamed)
# [Doctor] Memory: Holographic (N facts)
# [Doctor] Skill: capcut-video-editor (loaded)
# [Doctor] MCP: capcut-api (11 tools)
# [Doctor] Fallback: GPT direct (ready)
```

### 6.3 Memory Accumulation Test (Manual)

**Scenario:** Edit 5 videos liên tiếp, verify memory học style:

| Video | Prompt | Expected Memory |
|-------|--------|-----------------|
| 1 | "Làm video review iPhone, style fast" | Base facts: fast pacing, review template |
| 2 | "Review Samsung, giống video trước" | Add: Samsung template, same font |
| 3 | "Làm video tutorial, style documentary" | Add: documentary style, tutorial template |
| 4 | "Review laptop, style fast" | Memory suggests fast pacing (from video 1,2) |
| 5 | "Làm video TikTok bất kỳ" | Memory auto-suggests fast + review (dominant) |

**Verification:** Sau video 5, query memory:
```python
facts = _engine_mgr._query_memory("video style")
# Expected: facts về "fast pacing", "review format", specific effects
```

### 6.4 Performance Test

| Metric | Target | Measure |
|--------|--------|---------|
| Engine init time | <5s | Cold start đến health OK |
| Plan with Engine | <30s | Từ prompt → plan.json |
| Plan with fallback | <30s | Như hiện tại |
| Memory query | <500ms | Holographic search |
| Memory write | <200ms | Store facts after plan |
| Engine failure → fallback | <2s | Thời gian switch |

### 6.5 Error Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| capcut-engine not installed | Engine health = false, fallback GPT |
| Holographic DB corrupted | Memory empty, plan without context |
| MCP server timeout | Engine retry 1 lần, rồi skip MCP |
| AIAgent.run_conversation crash | Catch exception, fallback GPT |
| Plan JSON invalid | _safe_json repair attempt, then retry |
| Memory write fails | Log warning, continue (non-critical) |

## Success Criteria
- [ ] All unit tests pass
- [ ] E2E test with engine: PASS
- [ ] E2E test with fallback: PASS
- [ ] Doctor check shows all components
- [ ] Memory tích luỹ đúng qua 5 video manual test
- [ ] Engine failure không crash pipeline
- [ ] Performance targets met

## Files Changed
| File | Action | Description |
|------|--------|-------------|
| `tests/test_engine_manager.py` | NEW | Unit tests |
| `tests/test_e2e_engine.py` | NEW | E2E engine tests |
| Existing E2E gate | MODIFY | Add ENGINE_ENABLED flag |
| Doctor check | MODIFY | Add engine section |
