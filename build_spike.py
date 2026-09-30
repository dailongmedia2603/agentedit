import os, sys, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "CapCutAPI"))
os.chdir(os.path.join(os.path.dirname(__file__), "CapCutAPI"))

from create_draft import get_or_create_draft
from add_video_track import add_video_track
from add_text_impl import add_text_impl
from save_draft_impl import save_draft_impl

CAPCUT = os.path.expanduser("~/Movies/CapCut/User Data/Projects/com.lveditor.draft")
SRC = "/Users/macbook/Documents/Antigravity/Tool-Edit-Capcut/tiktok_video.mp4"

# 1) create draft 1080x1920
draft_id, script = get_or_create_draft(width=1080, height=1920)
print("draft_id =", draft_id)

# 2) add full source video (scale 1 first to inspect fit behavior)
r = add_video_track(video_url=SRC, draft_id=draft_id, width=1080, height=1920,
                    start=0, end=10, scale_x=1, scale_y=1)
print("add_video ok")

# 3) one hook text upper area
add_text_impl(text="SPIKE TEST", start=0, end=3, draft_id=draft_id,
              transform_y=0.2, font_size=20, font_color="#FFE400")

# 4) save WITH draft_folder so assets bundle + paths point to CapCut
res = save_draft_impl(draft_id, draft_folder=CAPCUT)
print("save ->", res.get("success"))

# inspect generated draft
dfd = os.path.join(os.getcwd(), draft_id)
info = json.load(open(os.path.join(dfd, "draft_info.json")))
print("\n--- assets bundled ---")
for root,_,files in os.walk(os.path.join(dfd,"assets")):
    for f in files: print("  ", os.path.join(root,f).replace(dfd+"/",""), os.path.getsize(os.path.join(root,f)), "bytes")
print("\n--- video material ---")
for m in info.get("materials",{}).get("videos",[]):
    print("  path=", m.get("path"))
    print("  width/height=", m.get("width"), m.get("height"), "duration(us)=", m.get("duration"))
print("\n--- segment clip transform (fit check) ---")
for t in info.get("tracks",[]):
    if t.get("type")=="video":
        for s in t.get("segments",[]):
            c=s.get("clip",{})
            print("  scale=",c.get("scale"),"transform=",c.get("transform"),"flip=",c.get("flip"))
            print("  source_timerange=",s.get("source_timerange"),"target_timerange=",s.get("target_timerange"))
print("\nDFD_PATH:", dfd)
