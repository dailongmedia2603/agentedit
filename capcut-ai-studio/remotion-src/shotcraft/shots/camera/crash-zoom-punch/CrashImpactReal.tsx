// crash-impact 急推撞停（第二轮重设计）——同 crash-zoom 的急推，到位瞬间不回弹而是撞停震屏：
// 高频抖 + 指数衰减 6f，然后真静止。对比点：重量感（"就是它"）vs 回弹款的弹性感（"看这个"）。
//
// 设计决定
// - look：lime（石墨暗场 + 荧光黄绿）。和同卡的回弹款（ember · 后仰浏览器窗口 · 编辑式读数）拉开：
//   这一款是"战术 HUD"语言——真实 projects 页做成一块正视的监视屏，舞台铺淡网格；
//   一只荧光取景框在全景里扫描（card1 → card5 → card4，snappy 跳格），锁定 card4 后才急推。
// - 撞停的重量：到位帧一记"冲击帧"——卡外整片先被荧光黄绿占满（1f），3f 内压成近黑（重物砸地扬起的
//   一闪，而不是暖色曝光）；两道荧光冲击波环从卡缘向外扩散；震屏 14px·e^(−t/1.8)，首拍沿冲击方向下沉。
//   目标卡不浮起、不发光晕——是"砸实"不是"弹起"。全片只这一处作用于整画面（R4）。
// - 落定后：一道扫描线自上而下扫过卡面一次（Q4：唯一一次光效，裁进圆角），左右两栏 HUD 读数错峰落位：
//   左栏 TARGET / OWNER / STATE 等宽读数，右栏 240px 荧光「P0」+ 说明。尾帧是一张完整海报。
//
// 时间表（30fps，126f）
//   0–4    全景：监视屏已在画面、网格与角标显影，舞台 zoom 极缓推近 2%
//   4–30   扫描：取景框落第 1 格（4f）→ 10f 跳第 2 格 → 20f 跳目标（各 8f snappy），28f 收紧锁定 + 锁定标签
//   32–40  预备：zoom 回退 ~3%（smooth），取景框外扩一呼吸
//   40–46  急推 6f：log 空间强 ease-in，目标屏幕位置单调收向落点；只这段做时间采样运动模糊
//   46     撞停：冲击帧（46 荧光 / 47 余辉 / 48 起近黑）+ 冲击波环；46–52 震屏收干（清晰抖动，不加模糊）
//   52–68  扫描线扫过目标（16f）；54–90 HUD 读数错峰落位（标签 → 数值，按字数压密）
//   ~90–125 hold：极缓推近 1→1.012，尾帧干净落定
//
// [Agent Edit] o anh `screen` (anh THAT, ti le bat ky: anh chup man hinh doc/ngang, anh dien thoai, anh chup):
//   - "man hinh giam sat" = TOAN BO anh (ti le that do bang delayRender, objectFit cover; anh qua dai -> neo mep tren),
//     thay cho manh cat CROP cua trang projects; toa do live-layout.json bo het.
//   - muc tieu = vung GIUA anh (~15% dien tich, tam doc 46%, ti le theo khung can canh); khung ngam quet 2 diem
//     trong anh (trai-tren -> phai-duoi) roi khoa vao muc tieu. Zoom chot tinh tu kich thuoc muc tieu.
//   - HUD: so lon "P0" -> o `number`; kicker / title / subtitle (cot phai); TARGET/OWNER/STATE -> o list `readouts`
//     ("NHÃN: giá trị", 0-3 dong); nhan tren man hinh -> o `screen_label` (khong co -> ten thuong hieu). Chu HUD
//     trung tinh tieng Viet (TRỰC TIẾP / ĐANG QUÉT / ĐÃ KHOÁ).
//   - Khung doc (native): muc tieu dap vao nua tren, khoi so lieu (kicker -> so lon -> tieu de -> cau phu -> hang
//     readouts 3 cot) xep DUOI, chu to.
//   - LOOKS do theme doi tai cho -> look tinh TRONG component (khong chep o muc module).
import { useBrand, useCurrentFrame, useImage, useList, useShotFonts, useText, useVideoConfig, fitSize, measureText, wrapLines } from '../../../runtime';
import React, { useEffect, useState } from 'react';
import { AbsoluteFill, Img, continueRender, delayRender } from 'remotion';
import { EASE, Grain, Vignette, mix, ramp } from '../../../fixtures/Polish';
import { LOOKS, Stage, TextReveal, alpha, rgbOf, type, type Look } from '../../../fixtures/Look';

export const CRASHIMPACT_DUR = 126;

const PUSH = 40;
const HIT = 46;
const SCREEN_R = 20; // 监视屏圆角（世界 px）
const CARD_R = 10; // 目标框圆角（世界 px）

// 读取图片真实宽高比 + 像素高（确定性：delayRender 等图片解码完再渲染）
type ImgSize = { ar: number; h: number };
const useImageSize = (src: string | undefined, fallback: ImgSize): ImgSize => {
  const [ar, setAr] = useState<ImgSize | null>(null);
  const [handle] = useState(() => (src ? delayRender('crash-impact: kich thuoc anh') : null));
  useEffect(() => {
    if (!src || handle === null) return;
    let done = false;
    const finish = (v: ImgSize) => {
      if (done) return;
      done = true;
      setAr(v);
      continueRender(handle);
    };
    const img = new Image();
    img.onload = () => finish(img.naturalWidth > 0 && img.naturalHeight > 0 ? { ar: img.naturalWidth / img.naturalHeight, h: img.naturalHeight } : fallback);
    img.onerror = () => finish(fallback);
    img.src = src;
    return () => finish(fallback);
  }, [src, handle, fallback]);
  return ar ?? fallback;
};

type Box = { x: number; y: number; w: number; h: number }; // 中心 + 尺寸（世界 px）
type Geo = {
  portrait: boolean;
  SH: number;
  FW: number; FH: number;
  target: Box;
  hops: Box[];
  zWide: number; zHit: number;
  endX: number; endY: number;
};

const makeGeo = (aspect: number, natH: number, portrait: boolean, SH: number, calloutH: number): Geo => {
  const a = Math.max(0.46, Math.min(2.4, aspect));
  const FH = 1000;
  const FW = FH * a;
  const wide = portrait ? { w: 1640, h: Math.min(2500, SH - 700) } : { w: 1180, h: 860 };
  const zWide = Math.min(wide.w / FW, wide.h / FH);
  const gap = 120;
  // 特写取景盒：竖屏按图片比例收高（横图不会被裁成细长条再放大成糊）
  const box = portrait
    ? { w: 1640, h: Math.max(900, Math.min(SH - 2 * 170 - gap - calloutH, 1640 / Math.max(0.62, Math.min(1.5, a * 0.8)))) }
    : { w: 860, h: 740 };
  const r = box.w / box.h;
  const area = 0.15 * FW * FH;
  let tw = Math.sqrt(area * r), th = Math.sqrt(area / r);
  if (tw > FW * 0.7) { tw = FW * 0.7; th = Math.min(FH * 0.7, tw / r); }
  if (th > FH * 0.7) { th = FH * 0.7; tw = Math.min(FW * 0.7, th * r); }
  const target = { x: FW * 0.5, y: FH * 0.46, w: tw, h: th };
  let zHit = Math.min(box.w / tw, box.h / th);
  // 放大上限：成片里 1 个源像素最多 ~1.6 个输出像素（竖屏舞台 → 1080 宽成片 ×0.5625），宁可目标小一点也不糊
  const zRes = ((natH / FH) * 1.6) / (portrait ? 1080 / 1920 : 1);
  zHit = Math.max(zWide * 1.8, Math.min(zWide * 3.6, zRes, zHit));
  // 扫描两格：左上 → 右下（框比目标略小，钳在图片内）
  const hop = (fx: number, fy: number): Box => {
    const w = tw * 0.78, h = th * 0.78, m = 24;
    return { x: Math.max(w / 2 + m, Math.min(FW - w / 2 - m, FW * fx)), y: Math.max(h / 2 + m, Math.min(FH - h / 2 - m, FH * fy)), w, h };
  };
  const blockTop = portrait ? Math.max(170, (SH - (th * zHit + gap + calloutH)) / 2) : 0;
  return {
    portrait, SH, FW, FH, target, hops: [hop(0.28, 0.24), hop(0.74, 0.7), target], zWide, zHit,
    endX: 960, endY: portrait ? blockTop + (th * zHit) / 2 : 540,
  };
};

// 相机：zoom + 目标中心的屏幕位置（插值"目标位置"而不是相机中心：急推时目标单调收向落点）
const camAt = (g: Geo, f: number) => {
  const midY = g.SH / 2;
  const creep = mix(g.zWide, g.zWide * 1.02, ramp(f, 0, 32, EASE.smooth));
  const wind = creep * mix(1, 0.97, ramp(f, 32, 8, EASE.smooth));
  const wideSx = 960 + (g.target.x - g.FW / 2) * wind;
  const wideSy = midY + (g.target.y - g.FH / 2) * wind;
  if (f < PUSH) return { zoom: wind, sx: wideSx, sy: wideSy };
  const p = ramp(f, PUSH, HIT - PUSH, EASE.exit); // 到位即停：没有回弹段
  const zoom = Math.exp(mix(Math.log(wind), Math.log(g.zHit), p)) * (1 + 0.012 * ramp(f, 84, 41, EASE.smooth));
  return { zoom, sx: mix(wideSx, g.endX, p), sy: mix(wideSy, g.endY, p) };
};

// 撞停震屏（屏幕空间，确定性）
const shakeAt = (f: number) => {
  const t = f - HIT;
  if (t < 0) return { sx: 0, sy: 0, rot: 0 };
  const env = 14 * Math.exp(-t / 1.8);
  if (env < 0.15) return { sx: 0, sy: 0, rot: 0 };
  return { sx: env * 0.55 * Math.sin(t * 2.4 + 0.6), sy: env * Math.cos(t * 2.9), rot: env * 0.025 * Math.sin(t * 3.7 + 1.9) };
};

const HOP_AT = [4, 10, 20];
const reticleAt = (g: Geo, f: number): Box => {
  let r = g.hops[0];
  for (let i = 1; i < g.hops.length; i++) {
    const u = ramp(f, HOP_AT[i], 8, EASE.snappy);
    const b = g.hops[i];
    r = { x: mix(r.x, b.x, u), y: mix(r.y, b.y, u), w: mix(r.w, b.w, u), h: mix(r.h, b.h, u) };
  }
  return r;
};

// 一个相机姿态下的整个世界（监视屏 + 图片 + 取景框 + 冲击波），给运动模糊子帧复用
const World: React.FC<{ g: Geo; L: Look; src?: string; f: number; frame: number }> = ({ g, L, src, f, frame }) => {
  const LIME = L.accent;
  const { zoom, sx, sy } = camAt(g, f);
  const T = g.target;
  const tx = sx - T.x * zoom;
  const ty = sy - T.y * zoom;
  const px = (n: number) => n / zoom; // 屏幕 px → 世界 px（线宽恒定）
  const r = reticleAt(g, frame);
  const show = ramp(frame, 3, 6, EASE.out);
  const lock = ramp(frame, 28, 8, EASE.snappy);
  const breath = ramp(frame, 32, 8, EASE.smooth) * (1 - ramp(frame, PUSH, 5, EASE.exit));
  const pad = px(mix(22, 9, lock) + 13 * breath);
  const arm = px(30);
  const bx = r.x - r.w / 2 - pad, by = r.y - r.h / 2 - pad, bw = r.w + pad * 2, bh = r.h + pad * 2;
  const cx0 = T.x - T.w / 2, cy0 = T.y - T.h / 2;
  // 撞停：卡外先冲击帧（荧光）→ 压成近黑
  const t = frame - HIT;
  const crush = t >= 0;
  const impact = t < 0 ? 0 : t < 1 ? 0.8 : t < 2 ? 0.22 : 0;
  const [ar, ag, ab] = rgbOf(LIME).split(',').map(Number);
  const scrimColor = `rgb(${Math.round(mix(11, ar, impact))},${Math.round(mix(12, ag, impact))},${Math.round(mix(9, ab, impact))})`;
  const tall = g.FW / g.FH < 0.5;
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: 10, height: 10, transformOrigin: '0 0', transform: `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${zoom.toFixed(5)})` }}>
      {/* 监视屏 = 整张图 */}
      <div style={{
        position: 'absolute', left: 0, top: 0, width: g.FW, height: g.FH, borderRadius: SCREEN_R, overflow: 'hidden', background: '#1a1d16',
        boxShadow: `0 0 0 ${px(1.5)}px ${alpha(LIME, 0.35)}, 0 ${px(40)}px ${px(110)}px ${px(-10)}px rgba(0,0,0,0.85)`,
      }}>
        {src ? <Img src={src} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: tall ? '50% 0%' : '50% 50%' }} /> : null}
        {/* 全景时画面略压一档，和暗场舞台不打架 */}
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(12,14,10,0.12)' }} />
        {/* 扫描十字线：贯穿监视屏，跟着取景框中心走 */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: r.y, height: px(1.5), background: alpha(LIME, 0.4 * show * (1 - lock * 0.7)) }} />
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: r.x, width: px(1.5), background: alpha(LIME, 0.4 * show * (1 - lock * 0.7)) }} />
      </div>
      {/* 撞停压暗：目标外一圈极大 spread 影子当遮罩（冲击帧先荧光后近黑） */}
      {crush && (
        <div style={{ position: 'absolute', left: cx0, top: cy0, width: T.w, height: T.h, borderRadius: CARD_R, boxShadow: `0 0 0 ${px(9000).toFixed(1)}px ${scrimColor}` }} />
      )}
      {/* 压暗后的"桌面"：目标后一片极淡的冷灰光池（不是光晕——目标本身不发光） */}
      {crush && (
        <div style={{
          position: 'absolute', left: cx0 - T.w * 1.6, top: cy0 - T.h * 1.3, width: T.w * 4.2, height: T.h * 3.6, pointerEvents: 'none',
          background: `radial-gradient(ellipse 50% 50% at 50% 46%, ${alpha('#c9d4b8', 0.09 * (1 - impact))}, ${alpha('#c9d4b8', 0)} 70%)`,
        }} />
      )}
      {/* 目标：撞停后重画一次图片的这一块（盖在光池上，圆角裁切） */}
      {crush && (
        <div style={{ position: 'absolute', left: cx0, top: cy0, width: T.w, height: T.h, borderRadius: CARD_R, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: -cx0, top: -cy0, width: g.FW, height: g.FH }}>
            {src ? <Img src={src} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: tall ? '50% 0%' : '50% 50%' }} /> : null}
          </div>
        </div>
      )}
      {/* 扫描线：落定后自上而下扫过目标一次，裁进圆角（Q4） */}
      {frame >= 52 && frame <= 70 && (
        <div style={{ position: 'absolute', left: cx0, top: cy0, width: T.w, height: T.h, borderRadius: CARD_R, overflow: 'hidden', pointerEvents: 'none' }}>
          {(() => {
            const y = mix(-0.12, 1.08, ramp(frame, 52, 16, EASE.swift)) * T.h;
            return (
              <>
                <div style={{ position: 'absolute', left: 0, right: 0, top: y - px(60), height: px(60), background: `linear-gradient(180deg, ${alpha(LIME, 0)}, ${alpha(LIME, 0.18)})` }} />
                <div style={{ position: 'absolute', left: 0, right: 0, top: y - px(1.5), height: px(3), background: alpha(LIME, 0.95), boxShadow: `0 0 ${px(14)}px ${alpha(LIME, 0.8)}` }} />
              </>
            );
          })()}
        </div>
      )}
      {/* 冲击波：两道圆角环从目标边缘向外扩散（线宽屏幕恒定） */}
      {t >= 0 && t < 20 && [0, 3].map((d, k) => {
        const u = ramp(frame, HIT + d, 16, EASE.snappy);
        const grow = px(mix(0, k ? 140 : 260, u));
        const op = (1 - u) * (k ? 0.6 : 1) * (frame >= HIT + d ? 1 : 0);
        return (
          <div key={k} style={{
            position: 'absolute', left: cx0 - grow, top: cy0 - grow, width: T.w + grow * 2, height: T.h + grow * 2,
            borderRadius: CARD_R + grow * 0.5, border: `${px(k ? 2 : 4)}px solid ${alpha(LIME, op)}`, boxSizing: 'border-box',
            boxShadow: `0 0 ${px(20)}px ${alpha(LIME, op * 0.5)}`,
          }} />
        );
      })}
      {/* 目标边缘：落定后一圈荧光发丝线（"已锁定"） */}
      {t >= 0 && (
        <div style={{ position: 'absolute', left: cx0, top: cy0, width: T.w, height: T.h, borderRadius: CARD_R, boxShadow: `0 0 0 ${px(2)}px ${alpha(LIME, 0.9)}`, pointerEvents: 'none' }} />
      )}
      {/* 取景框角标（线宽按 zoom 反算，屏幕恒定 4px） */}
      {show > 0 && (
        <svg width={bw + px(80)} height={bh + px(80)} viewBox={`${bx - px(40)} ${by - px(40)} ${bw + px(80)} ${bh + px(80)}`}
          style={{ position: 'absolute', left: bx - px(40), top: by - px(40), overflow: 'visible', opacity: show }}>
          <g fill="none" stroke={LIME} strokeWidth={px(4)} strokeLinecap="square">
            <path d={`M${bx} ${by + arm} V${by} H${bx + arm}`} />
            <path d={`M${bx + bw - arm} ${by} H${bx + bw} V${by + arm}`} />
            <path d={`M${bx + bw} ${by + bh - arm} V${by + bh} H${bx + bw - arm}`} />
            <path d={`M${bx + arm} ${by + bh} H${bx} V${by + bh - arm}`} />
          </g>
          <g stroke={LIME} strokeWidth={px(2)} opacity={1 - lock}>
            <path d={`M${r.x - px(14)} ${r.y} H${r.x + px(14)} M${r.x} ${r.y - px(14)} V${r.y + px(14)}`} />
          </g>
        </svg>
      )}
    </div>
  );
};

// 快门窗口内等权叠加：第 i 层不透明度 1/(i+1)，逐层 over 合成后恰为算术平均；子帧间距 ≤8px，封顶 36
const SHUTTER = 0.55;
const edgeAt = (g: Geo, f: number) => {
  const a = camAt(g, f), b = camAt(g, f - SHUTTER);
  return (Math.abs(a.zoom - b.zoom) / g.zWide) * 0.78 * (g.portrait ? 1600 : 1100) + Math.hypot(a.sx - b.sx, a.sy - b.sy);
};

// HUD 读数（屏幕空间）：标签 → 数值，错峰落位
const Readout: React.FC<{ L: Look; frame: number; at: number; label: string; labelSize: number; mb: number; children: React.ReactNode }> = ({ L, frame, at, label, labelSize, mb, children }) => {
  const a = ramp(frame, at, 12, EASE.snappy);
  return (
    <div style={{ marginBottom: mb }}>
      {label ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: labelSize * 0.55, ...type(labelSize, 700, { mono: true }), lineHeight: 1.4, letterSpacing: '0.16em', color: L.accent, opacity: a, whiteSpace: 'nowrap' }}>
          <span style={{ height: 2, width: mix(0, labelSize * 1.3, a), background: L.accent, flex: 'none' }} />
          {label}
        </div>
      ) : null}
      <div style={{ marginTop: label ? labelSize * 0.5 : 0, opacity: ramp(frame, at + 3, 10, EASE.out), transform: `translateX(${((1 - ramp(frame, at + 3, 14, EASE.snappy)) * -24).toFixed(1)}px)` }}>{children}</div>
    </div>
  );
};

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

export const CrashImpactReal: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const brand = useBrand();
  const portrait = SH > 1080 * 1.2;
  // lime 的主光换成偏冷的灰绿：舞台光不抢荧光强调色（LOOKS 由 theme 原地改色 → 每次渲染取）
  const L: Look = { ...LOOKS.lime, light: '#9aa58a' };
  const LIME = L.accent;
  const src = useImage('screen', 'textures/live/projects-full.png');
  const img = useImageSize(src, { ar: 16 / 10, h: 2000 });
  const screenLabel = useText('screen_label', 'BẢNG ĐIỀU KHIỂN');
  const kicker = useText('kicker', 'QUAN TRỌNG NHẤT');
  const number = useText('number', '1 chạm');
  const title = useText('title', 'là xuất xong hoá đơn');
  const sub = useText('subtitle', 'Không cần mở thêm phần mềm nào khác.');
  const rows = useList('readouts', ['MỤC TIÊU: Nút xuất hoá đơn', 'VỊ TRÍ: Màn hình chính', 'TRẠNG THÁI: Đã kích hoạt'])
    .slice(0, 3)
    .map((s) => {
      const i = s.indexOf(':');
      return i > 0 && i < 24 ? { label: s.slice(0, i).trim().toUpperCase(), value: s.slice(i + 1).trim() } : { label: '', value: s.trim() };
    })
    .filter((x) => x.value);

  // ── 读数排版（先排，竖屏用它的高度给特写让位）──
  const colW = portrait ? 1640 : 400;
  const kSize = fitSize(kicker.toUpperCase(), { family: fonts.mono, size: portrait ? 40 : 22, maxWidth: colW, weight: 700, letterSpacingEm: 0.2, minSize: portrait ? 26 : 16 });
  const nSize = fitSize(number, { family: fonts.mono, size: portrait ? 340 : 250, maxWidth: colW + 10, weight: 700, letterSpacingEm: -0.04, minSize: portrait ? 130 : 90 });
  const tBase = portrait ? 96 : 40;
  const tLines = title ? wrapLines(title, fonts.sans, tBase, colW, 600, portrait ? 2 : 3) : [];
  const tSize = Math.min(tBase, ...tLines.map((l) => fitSize(l, { family: fonts.sans, size: tBase, maxWidth: colW, weight: 600, minSize: tBase * 0.6 })));
  const sBase = portrait ? 62 : 30;
  const sLines = sub ? wrapLines(sub, fonts.sans, sBase, colW, 400, portrait ? 2 : 3) : [];
  const sSize = Math.min(sBase, ...sLines.map((l) => fitSize(l, { family: fonts.sans, size: sBase, maxWidth: colW, weight: 400, minSize: sBase * 0.6 })));
  const kH = kicker ? kSize * 1.4 + (portrait ? 18 : 14) : 0;
  const nH = nSize * 1.12;
  const ruleM = portrait ? 34 : 24;
  const tH = tLines.length * tSize * 1.2;
  const sH = sLines.length * sSize * 1.35;
  const rightH = kH + nH + ruleM * 2 + 2 + tH + (sLines.length ? (portrait ? 16 : 10) + sH : 0);
  // 读数：横屏左栏（竖排）；竖屏一行三列
  // 竖屏：读数排成一张 HUD 表（左标签 / 右数值，发丝线分隔），字够大；横屏：左栏竖排
  const rLabelW = 580;
  const rLabel = portrait
    ? Math.min(36, ...rows.filter((r) => r.label).map((r) => fitSize(r.label, { family: fonts.mono, size: 36, maxWidth: rLabelW - 140, weight: 700, letterSpacingEm: 0.16, minSize: 22 })))
    : 22;
  const rcW = portrait ? colW - rLabelW : 380;
  // 读数同一字号（取最小），每条最多 2 行
  // 字号从大往小试，直到每条都能排进 2 行；仍排不下才在 2 行内缩字
  const rBase = portrait ? 62 : 46;
  const rMaxW = rcW - 40;
  let rSize = rBase;
  while (rSize > rBase * 0.62 && rows.some((r) => wrapLines(r.value, fonts.sans, rSize, rMaxW, 600, 99).length > 2)) rSize = Math.round(rSize * 0.93);
  const rWrapped = rows.map((r) => wrapLines(r.value, fonts.sans, rSize, rMaxW, 600, 2));
  rSize = Math.min(rSize, ...rWrapped.flat().map((l) => fitSize(l, { family: fonts.sans, size: rSize, maxWidth: rMaxW, weight: 600, minSize: rBase * 0.5 })));
  const rVals = rWrapped.map((lines) => ({ lines, size: rSize }));
  const rowPad = 26;
  const rowHs = rVals.map((v) => Math.max(rLabel * 1.4, v.lines.length * v.size * 1.2) + rowPad * 2);
  const rowsH = portrait && rows.length ? 60 + rowHs.reduce((a, b) => a + b, 0) : 0;
  const calloutH = rightH + rowsH;

  const g = makeGeo(img.ar, img.h, portrait, SH, calloutH);
  const { sx, sy, rot } = shakeAt(frame);
  const edge = frame >= PUSH && frame <= HIT ? edgeAt(g, frame) : 0;
  const n = edge > 0 ? Math.max(1, Math.min(36, Math.ceil(edge / 8))) : 1;
  const smear = n > 1 ? Math.min(4, (edge / n) * 0.5 * Math.min(1, Math.max(0, (edge - 60) / 200))) : 0;
  const wide = 1 - ramp(frame, PUSH, HIT - PUSH, EASE.exit);
  const vig = frame < HIT ? 0.35 + 0.25 * ramp(frame, PUSH, HIT - PUSH, EASE.exit) : mix(0.75, 0.4, ramp(frame, HIT, 16, EASE.out));
  // 取景框标签（屏幕空间，跟着全景里的取景框走；急推开始即收起）
  const cam = camAt(g, frame);
  const r = reticleAt(g, frame);
  const lock = ramp(frame, 28, 8, EASE.snappy);
  const tagS = portrait ? 34 : 22;
  const tagX = cam.sx + (r.x - r.w / 2 - g.target.x) * cam.zoom - 12;
  const tagY = cam.sy + (r.y + r.h / 2 - g.target.y) * cam.zoom + 22;
  const hop = frame < 10 ? '01' : '02';
  // 监视屏上沿（全景）
  const hudHalf = portrait ? 820 : 560; // 竖图在横屏里很窄：标签行至少这么宽，两端不打架
  const scrL = Math.min(cam.sx - g.target.x * cam.zoom, 960 - hudHalf);
  const scrR = Math.max(cam.sx + (g.FW - g.target.x) * cam.zoom, 960 + hudHalf);
  const scrT = cam.sy - g.target.y * cam.zoom;
  const hudS = portrait ? 34 : 22;
  const live = `TRỰC TIẾP${(screenLabel || brand?.name) ? ' · ' + (screenLabel || brand?.name || '').toUpperCase() : ''}`;
  const stateW = measureText('ĐANG QUÉT', fonts.mono, hudS, 600) + 9 * 0.18 * hudS;
  const liveSize = fitSize(live, { family: fonts.mono, size: hudS, maxWidth: scrR - scrL - stateW - hudS * 3, weight: 600, letterSpacingEm: 0.18, minSize: hudS * 0.6 });

  // 落定 HUD 位置
  const tgtW = g.target.w * g.zHit, tgtH = g.target.h * g.zHit;
  const rightX = portrait ? 140 : Math.min(1920 - 60 - colW, 960 + tgtW / 2 + 70);
  const rightY = portrait ? g.endY + tgtH / 2 + 120 : Math.max(70, 540 - rightH / 2);
  const leftX = 104;
  const leftW = Math.max(240, 960 - tgtW / 2 - 70 - leftX);
  // 节拍：数值按字数压密，~90f 前全部落定
  const tWords = tLines.reduce((s, l) => s + words(l), 0);
  const sWords = sLines.reduce((s, l) => s + words(l), 0);
  const tGap = Math.min(3, 10 / Math.max(1, tWords));
  const sGap = Math.min(2.5, 10 / Math.max(1, sWords));
  const nGap = Math.min(3, 10 / Math.max(1, Array.from(number).length));
  let wi = 0;
  let si = 0;

  const valueEl = (i: number) => {
    const v = rVals[i];
    const last = i === rows.length - 1 && rows.length > 1;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: v.size * 0.32 }}>
        {last && <span style={{ width: v.size * 0.32, height: v.size * 0.32, borderRadius: v.size, background: LIME, boxShadow: `0 0 ${v.size * 0.35}px ${alpha(LIME, 0.9)}`, flex: 'none' }} />}
        <div>
          {v.lines.map((l, k) => (
            <div key={k} style={{ ...type(v.size, 600), lineHeight: 1.2, color: L.ink, whiteSpace: 'nowrap' }}>{l}</div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <AbsoluteFill style={{ background: L.bg[2], overflow: 'hidden' }}>
      <Stage look={L} keyLight={{ x: 0.5, y: -0.1 }} fill={{ x: 0.5, y: 1.1 }} intensity={0.6} breathe={0.4} vignette={0.2}>
        {/* 舞台网格：跟随相机 30% 的缩放做视差，急推后隐入暗场 */}
        <div style={{
          position: 'absolute', inset: -400, opacity: 0.55 * wide + 0.1,
          transform: `scale(${(1 + (cam.zoom / g.zWide - 1) * 0.3).toFixed(4)})`,
          backgroundImage: `linear-gradient(${alpha(LIME, 0.07)} 1.5px, transparent 1.5px), linear-gradient(90deg, ${alpha(LIME, 0.07)} 1.5px, transparent 1.5px)`,
          backgroundSize: '64px 64px', backgroundPosition: '400px 400px',
          WebkitMaskImage: 'radial-gradient(ellipse 60% 60% at 50% 50%, #000 30%, transparent 80%)',
        }} />
      </Stage>

      {/* 震屏层：整图 + 遮罩 + 冲击波一起抖 */}
      <AbsoluteFill style={{ transform: `translate(${sx.toFixed(2)}px, ${sy.toFixed(2)}px) rotate(${rot.toFixed(4)}deg)` }}>
        {n > 1 ? (
          Array.from({ length: n }, (_, i) => (
            <AbsoluteFill key={i} style={{ opacity: 1 / (i + 1), filter: smear > 0.3 ? `blur(${smear.toFixed(2)}px)` : undefined }}>
              <World g={g} L={L} src={src} f={frame - (SHUTTER * i) / (n - 1)} frame={frame} />
            </AbsoluteFill>
          ))
        ) : (
          <World g={g} L={L} src={src} f={frame} frame={frame} />
        )}
      </AbsoluteFill>

      {/* 全景 HUD：监视屏上沿两角的等宽标签 + 取景框标签 */}
      <AbsoluteFill style={{ opacity: wide, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', left: scrL, top: scrT - hudS * 2.3, display: 'flex', gap: liveSize * 0.6, alignItems: 'center', ...type(liveSize, 600, { mono: true }), lineHeight: 1.4, letterSpacing: '0.18em', color: L.ink2, whiteSpace: 'nowrap', opacity: ramp(frame, 0, 8, EASE.out) }}>
          <span style={{ width: liveSize * 0.45, height: liveSize * 0.45, borderRadius: liveSize, background: LIME, boxShadow: `0 0 12px ${alpha(LIME, 0.8)}`, flex: 'none' }} />
          {live}
        </div>
        <div style={{ position: 'absolute', right: 1920 - scrR, top: scrT - hudS * 2.3, ...type(hudS, 600, { mono: true }), lineHeight: 1.4, letterSpacing: '0.18em', color: L.ink3, whiteSpace: 'nowrap' }}>
          {lock > 0.5 ? 'ĐÃ KHOÁ' : 'ĐANG QUÉT'}
        </div>
        {frame >= 4 && (
          <div style={{
            position: 'absolute', left: tagX, top: tagY, height: tagS * 1.6, padding: `0 ${tagS * 0.55}px`, display: 'flex', alignItems: 'center', borderRadius: 4,
            background: lock > 0.5 ? LIME : alpha('#0b0d06', 0.85), color: lock > 0.5 ? L.onAccent : LIME,
            border: `1.5px solid ${LIME}`, ...type(tagS, 700, { mono: true }), lineHeight: 1, letterSpacing: '0.14em', whiteSpace: 'nowrap',
            opacity: ramp(frame, 4, 4, EASE.out), transform: `scale(${mix(1.25, 1, ramp(frame, 28, 6, EASE.snappy)).toFixed(3)})`, transformOrigin: '0 0',
          }}>
            {lock > 0.5 ? 'ĐÃ KHOÁ' : `QUÉT ${hop}`}
          </div>
        )}
      </AbsoluteFill>

      {/* 落定 HUD：读数栏 + 大数字 */}
      {frame >= 52 && (
        <AbsoluteFill style={{ pointerEvents: 'none', transform: `translate(${(sx * 0.4).toFixed(2)}px, ${(sy * 0.4).toFixed(2)}px)` }}>
          {!portrait && rows.length > 0 && (
            <div style={{ position: 'absolute', left: leftX, top: Math.max(70, 540 - rows.length * 75), width: leftW }}>
              {rows.map((row, i) => (
                <Readout key={i} L={L} frame={frame} at={54 + i * 4} label={row.label} labelSize={rLabel} mb={44}>
                  {valueEl(i)}
                </Readout>
              ))}
            </div>
          )}
          <div style={{ position: 'absolute', left: rightX, top: rightY, width: colW, color: L.ink }}>
            {kicker ? (
              <div style={{ ...type(kSize, 700, { mono: true }), lineHeight: 1.4, letterSpacing: '0.2em', color: LIME, whiteSpace: 'nowrap', marginBottom: portrait ? 18 : 14, opacity: ramp(frame, 58, 10, EASE.out) }}>
                {kicker.toUpperCase()}
              </div>
            ) : null}
            <div style={{ ...type(nSize, 700, { mono: true }), lineHeight: 1.12, letterSpacing: '-0.04em', color: LIME, marginLeft: -nSize * 0.04, whiteSpace: 'nowrap', textShadow: `0 0 60px ${alpha(LIME, 0.35)}` }}>
              <TextReveal text={number} by="char" variant="rise" start={60} each={16} gap={nGap} />
            </div>
            <div style={{ height: 2, width: Math.min(colW, portrait ? 900 : 360), marginTop: ruleM, marginBottom: ruleM, background: alpha(L.ink, 0.2), transform: `scaleX(${ramp(frame, 68, 18, EASE.snappy).toFixed(4)})`, transformOrigin: '0 50%' }} />
            {tLines.map((l, i) => {
              const start = 72 + wi * tGap;
              wi += words(l);
              return (
                <div key={i} style={{ ...type(tSize, 600), lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                  <TextReveal text={l} by="word" variant="blur" start={start} each={14} gap={tGap} ease={EASE.out} />
                </div>
              );
            })}
            {sLines.length ? <div style={{ height: portrait ? 16 : 10 }} /> : null}
            {sLines.map((l, i) => {
              const start = 77 + si * sGap;
              si += words(l);
              return (
                <div key={i} style={{ ...type(sSize, 400), lineHeight: 1.35, color: L.ink2, whiteSpace: 'nowrap' }}>
                  <TextReveal text={l} by="word" variant="blur" start={start} each={13} gap={sGap} ease={EASE.out} />
                </div>
              );
            })}
            {portrait && rows.length > 0 && (
              <div style={{ marginTop: 60 }}>
                {rows.map((row, i) => {
                  const at = 56 + i * 4;
                  const a = ramp(frame, at, 12, EASE.snappy);
                  return (
                    <div key={i} style={{ position: 'relative', height: rowHs[i], display: 'flex', alignItems: 'center' }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, height: 2, width: colW, background: alpha(L.ink, 0.14), transform: `scaleX(${a.toFixed(4)})`, transformOrigin: '0 50%' }} />
                      <div style={{ width: rLabelW, flex: 'none', display: 'flex', alignItems: 'center', gap: rLabel * 0.55, ...type(rLabel, 700, { mono: true }), lineHeight: 1.4, letterSpacing: '0.16em', color: LIME, opacity: a, whiteSpace: 'nowrap' }}>
                        <span style={{ height: 3, width: mix(0, rLabel * 1.3, a), background: LIME, flex: 'none' }} />
                        {row.label}
                      </div>
                      <div style={{ opacity: ramp(frame, at + 3, 10, EASE.out), transform: `translateX(${((1 - ramp(frame, at + 3, 14, EASE.snappy)) * -24).toFixed(1)}px)` }}>{valueEl(i)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </AbsoluteFill>
      )}
      <Vignette strength={vig} inner={0.4} color={L.shadow} cy={0.5} />
      <Grain opacity={0.07} blend="soft-light" />
    </AbsoluteFill>
  );
};
