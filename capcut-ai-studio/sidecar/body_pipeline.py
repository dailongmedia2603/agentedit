# -*- coding: utf-8 -*-
"""THAN VIDEO SAU HOOK — chuoi buoc chay SAU luat hook (server autoplan, 2026-10-20). Moi buoc theo hook_fx.LUAT_Y_NGHIA.

1. Hinh minh hoa (body_visual): AI tom tat the gioi cau chuyen + chon diem CO MUC DICH -> bien tap phan bien -> dao dien sua
   1 luot theo nhan xet -> duyet lai -> code kiem (sac thai, trung chu, CHO TRONG that: vat >= W_MIN, khong bi nguoi che).
2. Khung chat cho canh chia doi (split_visual): noi dung tin nhan that, theo mau video, xep vao cho trong cua panel.
3. Cong kiem duyet y nghia (effect_review): bo moi muc chen khong dat (khong sua).
4. Nhip than video (body_rhythm): khoang dung im qua lau -> chu nhan co muc dich hoac giu lang co chu dich.
Moi buoc AI qua `step` (cache theo van tay dau vao). Buoc nao loi -> bo qua buoc do, ghi canh bao, plan van dung duoc.
"""
import body_rhythm
import body_visual
import effect_review
import hook_rule
import providers
import split_visual

VERSION = 1


def run(plan, spec, build, step, moments, story, style=None, transcript=None, log=None, emit=None, canvas=(1080, 1920)):
    """Tra (plan, spec, report | None, ghi_chu[])."""
    say = emit or (lambda m, lvl="info": None)
    notes = []
    hk = plan.get("hook") if isinstance(plan.get("hook"), dict) else {}
    hook_range = (float(hk["src_start"]), float(hk["src_end"])) if hk.get("src_start") is not None else None
    key = {"m": moments, "story": story, "hr": list(hook_range or []), "v": VERSION}
    changed = False

    # 1. hinh minh hoa
    try:
        res = step("Body-visual", dict(key, a=[a.get("id") for a in plan.get("assets") or []]),
                   lambda: body_visual.design(moments, story, style, plan.get("assets"), log, hook_range)) or {}
        rv = step("Body-visual-review", dict(key, d=res), lambda: body_visual.review(res, moments, story, log)) or {}
        rev = step("Body-visual-revise", dict(key, d=res, r=rv),
                   lambda: body_visual.revise(res, rv, moments, story, log)) or {}
        rv2 = (step("Body-visual-review2", dict(key, d=rev),
                    lambda: body_visual.review({"the_gioi": res.get("the_gioi"), "diem": rev.get("diem") or []},
                                               moments, story, log)) or {}) if rev.get("diem") else {}
        fixed = {d.get("moment") for d in rev.get("diem") or [] if isinstance(d, dict)}
        merged = {"the_gioi": res.get("the_gioi"),
                  "diem": [d for d in res.get("diem") or [] if isinstance(d, dict) and d.get("moment") not in fixed]
                  + [d for d in rev.get("diem") or [] if isinstance(d, dict)]}
        specs = body_visual.clean(merged, moments, plan.get("assets"), reviews=dict(rv, **rv2), hook_range=hook_range,
                                  log=lambda m: notes.append(m))
        if specs:
            body_visual.make_images(specs, style=(style or {}).get("image_style") or "", log=log)
            n = body_visual.apply(plan, specs, canvas)
            for s in specs:
                if s.get("_bo"):
                    notes.append("BO %s: %s" % (s["moment"], s["_bo"]))
            if n:
                changed = True
                say("Hình minh hoạ thân video: %d điểm có mục đích" % n, "ok")
        the_gioi = res.get("the_gioi")
    except Exception as ex:
        the_gioi = None
        say("Hình minh hoạ thân video lỗi (bỏ qua): %s" % str(ex)[:160], "warn")

    # 2. khung chat cho canh chia doi
    try:
        if split_visual.existing_splits(plan, plan.get("assets")):
            sres = step("Split-visual", dict(key, s=split_visual.existing_splits(plan, plan.get("assets"))),
                        lambda: split_visual.design(plan, moments, story, the_gioi, hook_range, log)) or {}
            props = split_visual.proposals(sres, plan)
            srv = step("Split-visual-review", dict(key, p=props),
                       lambda: split_visual.review(props, story, the_gioi, log)) or {}
            n = split_visual.apply(plan, props, srv, moments, hook_range, log=lambda m: notes.append(m))
            if n:
                changed = True
                say("Cảnh chia đôi: %d khung chat nội dung thật" % n, "ok")
    except Exception as ex:
        say("Khung chat cảnh chia đôi lỗi (bỏ qua): %s" % str(ex)[:160], "warn")

    # 3. cong kiem duyet y nghia
    try:
        items = effect_review.collect(plan, transcript)
        if items:
            er = step("Kiem-duyet-y-nghia", dict(key, it=[{k: v for k, v in x.items() if k != "_k"} for x in items]),
                      lambda: effect_review.review(items, story, log)) or {}
            kept, dropped = effect_review.apply(plan, items, er)
            for it, r in dropped:
                notes.append("Bỏ %s %s — %s" % (it["loai"], it["mo_ta"][:60], str((r or {}).get("ly_do"))[:140]))
            if dropped:
                changed = True
            say("Kiểm duyệt ý nghĩa: giữ %d, bỏ %d mục không có mục đích" % (len(kept), len(dropped)), "ok")
    except Exception as ex:
        say("Kiểm duyệt ý nghĩa lỗi (bỏ qua): %s" % str(ex)[:160], "warn")

    report = None
    if changed:
        sp, rep = build(plan)
        if sp:
            spec, report = sp, rep

    # 4. nhip than video
    try:
        level = hook_rule.muc_do(plan, story)[0]
        gs = body_rhythm.gaps(spec, body_rhythm.GAP.get(level, 6.0))
        if gs:
            out = step("Nhip-than", dict(key, g=gs, l=[L.get("id") for L in plan.get("layers") or []], rv=body_rhythm.VERSION),
                       lambda: list(body_rhythm.design(spec, plan, gs, story, log))) or [{}, []]
            res, rows = (out[0], out[1]) if isinstance(out, (list, tuple)) and len(out) == 2 else ({}, [])
            n = body_rhythm.apply(plan, res, rows, log=lambda m: notes.append(m))
            say("Nhịp thân video: %d khoảng đứng im > %.0fs -> thêm %d chữ nhấn có mục đích" % (
                len(gs), body_rhythm.GAP.get(level, 6.0), n), "ok")
            if n:
                sp, rep = build(plan)
                if sp:
                    spec, report = sp, rep
    except Exception as ex:
        say("Nhịp thân video lỗi (bỏ qua): %s" % str(ex)[:160], "warn")
    return plan, spec, report, notes
