# Phase 5: Tích hợp EngineManager vào Sidecar

## Objective
Sửa sidecar server.py để gọi CapCut Engine (Hermes) thay vì gọi GPT trực tiếp khi generate plan. Giữ fallback path. Đây là phase quan trọng nhất.

## Current Flow (trước khi tích hợp)

```
server.py /autoplan
  → engine.py plan_video()
    → providers.py _openai_chat() → GPT API
    → return plan.json
```

## Target Flow (sau khi tích hợp)

```
server.py /autoplan
  → engine.py plan_video()
    → engine_manager.py plan_with_memory()
      ├─ Try: CapCut Engine (AIAgent + skill + memory)
      │   → Load skill "capcut-video-editor"
      │   → Query Holographic memory
      │   → AIAgent.run_conversation(prompt_with_context)
      │   → Memory auto-extract facts from result
      │   → Return plan.json
      │
      └─ Except: Fallback
          → providers.py _openai_chat() → GPT API
          → Return plan.json (như hiện tại)
    → return plan.json
```

## Implementation

### 5.1 Hoàn thiện EngineManager class

```python
# sidecar/engine_manager.py
import os
import json
import logging
from pathlib import Path
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

class EngineManager:
    """Manages CapCut Engine (Hermes fork) lifecycle & planning."""
    
    def __init__(self, engine_path: str = None):
        self.engine_home = Path.home() / ".capcut-studio" / "engine"
        self.engine_src = Path(engine_path) if engine_path else None
        self._agent = None
        self._initialized = False
        self._health = False
    
    def init(self, provider: str, model: str, api_key: str) -> bool:
        """Initialize engine. Returns True if ready."""
        try:
            # Thêm capcut-engine vào sys.path
            if self.engine_src and str(self.engine_src) not in sys.path:
                sys.path.insert(0, str(self.engine_src))
            
            from capcut_engine.run_agent import AIAgent
            
            os.environ["CAPCUT_ENGINE_HOME"] = str(self.engine_home)
            
            self._agent = AIAgent(
                provider=provider,
                model=model,
                api_key=api_key,
                quiet_mode=True,
                skip_context_files=True,
                max_iterations=15,
                enabled_toolsets=[],
            )
            self._initialized = True
            self._health = True
            logger.info("Engine initialized successfully")
            return True
        except Exception as e:
            logger.warning(f"Engine init failed: {e}")
            self._health = False
            return False
    
    def is_healthy(self) -> bool:
        return self._health and self._agent is not None
    
    def plan_video(
        self,
        prompt: str,
        video_path: str = None,
        style: str = "fast",
        duration_target: int = 60,
    ) -> Dict[str, Any]:
        """Generate video editing plan. Falls back if engine fails."""
        
        if not self.is_healthy():
            raise EngineUnavailableError("Engine not initialized")
        
        # Build context-rich prompt
        full_prompt = self._build_plan_prompt(
            prompt, video_path, style, duration_target
        )
        
        # Load skill context (optional - Hermes auto-loads if skill installed)
        skill_context = self._load_skill_summary()
        
        # Query memory for user preferences
        memory_context = self._query_memory(prompt)
        
        # Construct final prompt
        system_extra = f"""
You have access to:
- Video editing skill: {skill_context}
- User preferences from memory: {memory_context}

Generate plan.json following the schema exactly.
"""
        
        try:
            result = self._agent.chat(full_prompt)
            plan = self._parse_plan(result)
            
            # Auto-save to memory
            self._save_to_memory(plan, prompt)
            
            return plan
        except Exception as e:
            logger.error(f"Engine plan failed: {e}")
            raise EnginePlanError(str(e))
    
    def _build_plan_prompt(self, prompt, video_path, style, duration):
        """Build structured planning prompt."""
        parts = [f"Create a CapCut video editing plan for: {prompt}"]
        if video_path:
            parts.append(f"Source video: {video_path}")
        parts.append(f"Style: {style}")
        parts.append(f"Target duration: {duration_target}s")
        parts.append("Output valid JSON following plan schema.")
        return "\n".join(parts)
    
    def _load_skill_summary(self) -> str:
        """Load capcut-video-editor skill summary."""
        skill_path = self.engine_home / "skills" / "capcut-video-editor" / "SKILL.md"
        if skill_path.exists():
            # Đọc 200 dòng đầu (principles + procedure)
            with open(skill_path) as f:
                lines = f.readlines()[:200]
            return "".join(lines)
        return "Skill not loaded"
    
    def _query_memory(self, prompt: str) -> str:
        """Query Holographic memory for user preferences."""
        try:
            # Holographic search via Hermes memory API
            from capcut_engine.memory import search_memory
            facts = search_memory(prompt, limit=10)
            if facts:
                return "\n".join(f"- {f['content']} (confidence: {f.get('trust', 0)})" for f in facts)
        except Exception:
            pass
        return "No prior preferences"
    
    def _parse_plan(self, result: str) -> Dict[str, Any]:
        """Extract JSON plan from agent response."""
        # Reuse _safe_json from sidecar hiện tại
        from engine import _safe_json
        return _safe_json(result)
    
    def _save_to_memory(self, plan: Dict, prompt: str):
        """Extract facts from plan and save to memory."""
        try:
            facts = []
            # Extract style facts
            if plan.get("captions"):
                facts.append(f"User uses captions with {len(plan['captions'])} lines")
            if plan.get("scene_effects"):
                effects = [e["type"] for e in plan["scene_effects"]]
                facts.append(f"User prefers effects: {', '.join(effects[:5])}")
            if plan.get("segments"):
                avg_dur = sum(s["end"] - s["start"] for s in plan["segments"]) / len(plan["segments"])
                facts.append(f"Average clip duration: {avg_dur:.1f}s")
            
            # Write to Holographic
            from capcut_engine.memory import store_facts
            for fact in facts:
                store_facts([{"content": fact, "source": "plan_generation"}])
        except Exception:
            pass  # Memory write failure is non-critical

class EngineUnavailableError(Exception):
    pass

class EnginePlanError(Exception):
    pass
```

### 5.2 Sửa sidecar/server.py — thêm engine endpoints

```python
# sidecar/server.py (thêm vào existing file)

from engine_manager import EngineManager, EngineUnavailableError, EnginePlanError

# Global engine instance
_engine = None

def get_engine():
    global _engine
    if _engine is None:
        _engine = EngineManager(
            engine_path=os.environ.get("ENGINE_SRC_PATH", 
                str(Path(__file__).parent.parent.parent / "capcut-engine"))
        )
    return _engine

# Thêm route mới
@app.route("/engine/health", methods=["GET"])
def engine_health():
    engine = get_engine()
    return jsonify({
        "available": engine.is_healthy(),
        "engine_home": str(engine.engine_home),
    })

@app.route("/engine/init", methods=["POST"])
def engine_init():
    """Called by Electron after sidecar starts."""
    data = request.json
    engine = get_engine()
    success = engine.init(
        provider=data.get("provider", "openai"),
        model=data.get("model", "gpt-4o"),
        api_key=data.get("api_key", ""),
    )
    return jsonify({"success": success, "message": "Engine initialized" if success else "Engine unavailable"})

@app.route("/engine/memory/stats", methods=["GET"])
def engine_memory_stats():
    """Return memory stats for UI display."""
    engine = get_engine()
    # ... query Holographic stats
    return jsonify({"facts_count": 0, "last_updated": None})
```

### 5.3 Sửa sidecar/engine.py — tích hợp EngineManager

```python
# sidecar/engine.py (modify existing plan_video function)

from engine_manager import EngineManager, EngineUnavailableError, EnginePlanError

# Đầu file, global engine instance (shared với server.py)
_engine_mgr = None

def set_engine_manager(mgr: EngineManager):
    global _engine_mgr
    _engine_mgr = mgr

def plan_video(prompt, video_path=None, style="fast", duration=60):
    """Generate plan. Try Engine first, fallback to GPT."""
    
    # Try CapCut Engine (with memory)
    if _engine_mgr and _engine_mgr.is_healthy():
        try:
            logger.info("Planning with CapCut Engine...")
            plan = _engine_mgr.plan_video(
                prompt=prompt,
                video_path=video_path,
                style=style,
                duration_target=duration,
            )
            plan["_metadata"] = {"planner": "engine", "memory": True}
            return plan
        except (EngineUnavailableError, EnginePlanError) as e:
            logger.warning(f"Engine failed, falling back to direct GPT: {e}")
    
    # Fallback: GPT plan trực tiếp (code hiện tại)
    logger.info("Planning with GPT (fallback)...")
    plan = _plan_with_gpt(prompt, video_path, style, duration)
    plan["_metadata"] = {"planner": "gpt_fallback", "memory": False}
    return plan


def _plan_with_gpt(prompt, video_path, style, duration):
    """Existing GPT plan logic — giữ nguyên."""
    # ... code hiện tại của plan_video() cũ
    pass
```

### 5.4 Sửa Electron IPC — thêm engine flow

```typescript
// electron/ipc.ts (add new handlers)

ipcMain.handle("engine:health", async () => {
  const resp = await sidecarFetch("/engine/health");
  return resp.json();
});

ipcMain.handle("engine:init", async (_event, config: { provider: string; model: string; api_key: string }) => {
  const resp = await sidecarFetch("/engine/init", {
    method: "POST",
    body: JSON.stringify(config),
  });
  return resp.json();
});

ipcMain.handle("engine:memory:stats", async () => {
  const resp = await sidecarFetch("/engine/memory/stats");
  return resp.json();
});
```

### 5.5 Sửa sidecar.ts — init engine sau sidecar start

```typescript
// electron/services/sidecar.ts (modify startSidecar)

// Sau khi sidecar health OK:
const engineConfig = {
  provider: settings.modelProvider,  // "openai" | "anthropic" | "gemini"
  model: settings.modelName,         // "gpt-4o" | "claude-opus-4-8" | ...
  api_key: await getApiKey(settings.modelProvider),
};

try {
  const resp = await sidecarFetch("/engine/init", {
    method: "POST",
    body: JSON.stringify(engineConfig),
  });
  const { success } = await resp.json();
  log(`Engine init: ${success ? "OK" : "UNAVAILABLE (will fallback)"}`, success ? "info" : "warn");
} catch (err) {
  log(`Engine init failed (will use direct GPT): ${err}`, "warn");
  // Non-critical — pipeline still works with fallback
}
```

### 5.6 Fallback guarantee

**Critical design principle:** Engine failure MUST NOT break existing pipeline.

```python
# Bất kỳ Exception nào từ Engine đều được catch và fallback
try:
    plan = _engine_mgr.plan_video(...)
except Exception:
    plan = _plan_with_gpt(...)  # existing code, verified
```

Fallback trigger conditions:
- Engine not installed (`import capcut_engine` fails)
- Engine init fails (provider/model config error)
- Engine plan timeout (>90s, configurable)
- Engine returns invalid JSON
- Any unhandled exception

## Success Criteria
- [ ] EngineManager init thành công khi có capcut-engine installed
- [ ] plan_video() dùng Engine nếu available
- [ ] plan_video() fallback GPT nếu Engine unavailable
- [ ] Engine failure không crash sidecar
- [ ] UI hiển thị badge "🧠 Memory" nếu plan từ Engine
- [ ] Doctor check: `/engine/health` endpoint
- [ ] Memory facts được lưu sau mỗi plan thành công

## Files Changed
| File | Action | Description |
|------|--------|-------------|
| `sidecar/engine_manager.py` | NEW | EngineManager class |
| `sidecar/server.py` | MODIFY | Add /engine/* routes |
| `sidecar/engine.py` | MODIFY | plan_video() with Engine + fallback |
| `electron/ipc.ts` | MODIFY | Add engine:* IPC handlers |
| `electron/services/sidecar.ts` | MODIFY | Init engine after sidecar start |
| `src/` (React) | MODIFY | Show engine status in UI |
