// type-and-filter —— 真实 UI 上打字搜索、网格自己收敛成一张卡、点击穿透进详情页
// 功能演示的"操作叙事"段：让观众"跟着做一遍"。节奏必须像人手，不能像脚本。
// 参考实现从 template SceneFlyIn 118–190 段剥离（self-contained）：
// 相机移到搜索框，逐字符打字（3f/字符，光标常亮→闪烁），打完留一口气（11f），
// 25 张非目标卡按阅读序错峰淡出+下沉，目标卡滑到首行槽位（途中浮起+阴影变宽），
// 双圈强调色 ripple 点击确认 + 3px 描边 + 辉光，相机 16f 推进 zoom 2.2 交棒。
// 网格卡用真实纹理裁片（复用 projects-empty.png 里已有的卡），nano-lab 目标卡
// 过滤后滑到首行槽位。缺的 float-* 小块用纯色占位，不影响动效读感。
// 质感升级：相机跟着动作走——打字段贴近搜索框（zoom 2.0，输入字有效字高 ≈30px，读得清），
// 打完的那口气里拉开到满幅全景（zoom 1.0，页面铺满画框，不再露出页面外的空白带与页眉断边），
// 再推进点击点；搜索框打字时有强调色聚焦环；补一只 macOS 指针在全景里滑到目标卡再点击
// （"点了哪里"看得见，屏幕尺寸恒定、推进前淡出）；退场卡加轻微缩小与虚化，目标卡快速
// 滑位带纵向速度拖影；选中描边与卡片同心圆角、辉光收敛。
//
// [Agent Edit] Trang mau la anh chup (projects-empty.png + live-layout.json) -> VIET LAI thanh trang thu vien dung bang code
// (thanh tren + o tim kiem + luoi the anh), nen nhan noi dung that va dung o ca khung doc:
// o chu: title (ten trang) / query (chu go vao o tim) / target (ten the ket qua) / target_meta / items (ten cac the khac).
// o anh: cover (anh bia the ket qua, tuy chon) + shot1..shot7 (anh bia cac the khac, tuy chon; khong co -> bia mau dung bang code).
// Nhip goc giu nguyen: go chu 3f/ky tu (chu dai -> nen nhip de go xong truoc khung 34), nghi 8f, loc 42f (the khac mo +
// chim lan luot 0.4f), the dich truot ve o dau 10f bezier(.35,0,.2,1) noi + bong rong, con tro truot toi, click 58f (2 vong
// ripple + vien + quang sang), may day vao zoom 2.2 tai 72f. Camera = cung cong thuc PageCam2D (translate + scale).
// Khung doc (native): trang cao theo khung, luoi 2 cot x 4 hang the lon, chu to hon; zoom go chu 1.6.
import { useCurrentFrame, useImage, useList, useShotFonts, useText, useVideoConfig, useBackdrop, fitSize, wrapLines } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, Img, interpolate, Easing } from 'remotion';
import { SpeedBlur, velocity } from '../../../fixtures/Polish';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

export const TYPE_AND_FILTER_DURATION = 73; // 118–190f 落在 shot 内 offset 0

const PAPER = '#f9f6f1';
const FIELD = '#fefcf9';
const INK = '#2a2622';
const INK2 = '#7a7168';
const AMBER = 'oklch(58% 0.13 65)';
const AMBER_RGB = '176,116,40'; // AMBER 的近似 sRGB，用于半透明辉光
const TYPE_START = 10;
const FILTER_START = 42; // 160 - 118
const CLICK = 58; // 176 - 118
const CAM_EASE = Easing.bezier(0.33, 0, 0.15, 1);

type CamKey = { frame: number; cx: number; cy: number; zoom: number };
const camAt = (keys: CamKey[], f: number) => {
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (f >= a.frame && f <= b.frame) {
      const t = interpolate(f, [a.frame, b.frame], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: CAM_EASE });
      return { cx: a.cx + (b.cx - a.cx) * t, cy: a.cy + (b.cy - a.cy) * t, zoom: a.zoom + (b.zoom - a.zoom) * t };
    }
  }
  const k = f < keys[0].frame ? keys[0] : keys[keys.length - 1];
  return { cx: k.cx, cy: k.cy, zoom: k.zoom };
};

// bia mau (khong co anh): gradient am + hinh khoi don gian, tat dinh theo chi so
const THUMBS = [
  ['#f3c9a5', '#e08e6d'], ['#c9dcc4', '#7fae8e'], ['#cfd5ee', '#8b98d4'], ['#f1dfa8', '#d6aa4f'],
  ['#e4c9e2', '#b07db0'], ['#c6e2ea', '#6eaec2'], ['#e9d3c0', '#b98b67'], ['#d8d8d2', '#9a9a90'],
];
const Thumb: React.FC<{ i: number; src?: string }> = ({ i, src }) => {
  if (src) return <Img src={src} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />;
  const [a, b] = THUMBS[i % THUMBS.length];
  return (
    <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)` }}>
      <svg viewBox="0 0 100 60" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        {i % 3 === 0 && <circle cx={72} cy={34} r={18} fill="rgba(255,255,255,0.32)" />}
        {i % 3 === 1 && [0, 1, 2, 3, 4].map((k) => <rect key={k} x={52 + k * 8} y={46 - ((k * 7 + i * 5) % 22) - 10} width={5} height={((k * 7 + i * 5) % 22) + 10} rx={1} fill="rgba(255,255,255,0.38)" />)}
        {i % 3 === 2 && <path d="M0 48 Q25 30 50 42 T100 34 L100 60 L0 60 Z" fill="rgba(255,255,255,0.3)" />}
      </svg>
    </div>
  );
};

type Slot = { x: number; y: number; w: number; h: number };

export const TypeAndFilter: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: H } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = H > 1080 * 1.2;
  const title = useText('title', 'Thư viện dự án');
  const query = useText('query', 'tự động');
  const targetName = useText('target', 'Trợ lý trả lời tự động');
  const targetMeta = useText('target_meta', 'Cập nhật hôm qua · 12 mục');
  const items = useList('items', ['Kịch bản quay sản phẩm', 'Bảng màu thương hiệu', 'Lịch đăng bài tháng 11', 'Ảnh hậu trường', 'Mẫu phụ đề nhanh', 'Báo cáo doanh thu quý', 'Ý tưởng video ngắn']);
  const targetImg = useImage('cover');
  const thumbs = [1, 2, 3, 4, 5, 6, 7].map((i) => useImage(`shot${i}`));
  const brandName = BRAND.name;

  // ── bo cuc trang (toa do trang = toa do man hinh khi zoom 1) ──
  const K = portrait ? 1.9 : 1; // he so chu
  const PAD = portrait ? 120 : 168;
  const COLS = portrait ? 2 : 4;
  const ROWS = portrait ? 4 : 2;
  const N = COLS * ROWS;
  const TARGET_I = portrait ? 5 : 6; // vi tri ban dau cua the dich (hang 3 cot 2 / hang 2 cot 3)
  const TOP_H = Math.round(84 * K);
  const SEARCH = { x: PAD, y: TOP_H + Math.round(40 * K), w: 1920 - PAD * 2, h: Math.round(64 * K) };
  const GRID_Y = SEARCH.y + SEARCH.h + Math.round(44 * K);
  const GAP = Math.round(32 * K * (portrait ? 0.8 : 1));
  const cardW = (1920 - PAD * 2 - (COLS - 1) * GAP) / COLS;
  const cardH = Math.min(portrait ? 760 : 380, (H - GRID_Y - (portrait ? 140 : 44) - (ROWS - 1) * GAP) / ROWS);
  const slotOf = (i: number): Slot => ({ x: PAD + (i % COLS) * (cardW + GAP), y: GRID_Y + Math.floor(i / COLS) * (cardH + GAP), w: cardW, h: cardH });
  const thumbH = Math.round(cardH * 0.6);
  const titleFs0 = 26 * K;
  const metaFs = 19 * K;
  const fitTitle = (t: string) => {
    const ls = wrapLines(t, fonts.sans, titleFs0, cardW - 44 * K, 650, 2);
    const fs = Math.min(...ls.map((l) => fitSize(l, { family: fonts.sans, size: titleFs0, maxWidth: cardW - 44 * K, weight: 650, minSize: 15 * K })));
    return { ls, fs };
  };
  const METAS = ['Cập nhật 2 ngày trước', '8 mục · tuần này', 'Chia sẻ với 3 người', 'Cập nhật hôm nay', '24 ảnh', 'Bản nháp', '5 mục · tháng trước'];
  const others = Array.from({ length: N - 1 }, (_, j) => ({ name: items[j % Math.max(1, items.length)] ?? '', meta: METAS[j % METAS.length], src: thumbs[j % 7] ? thumbs[j % 7] : undefined }));
  const cards = Array.from({ length: N }, (_, i) => (i === TARGET_I ? { name: targetName, meta: targetMeta, src: targetImg } : others[i < TARGET_I ? i : i - 1]));
  const leaveRank = new Map<number, number>();
  cards.forEach((_, i) => {
    if (i !== TARGET_I) leaveRank.set(i, leaveRank.size);
  });
  const from = slotOf(TARGET_I);
  const to = slotOf(0); // first-row slot
  const CLICK_C = { x: to.x + to.w * 0.48, y: to.y + to.h * 0.4 };

  // camera: 打字段贴近搜索框 → 打完的呼吸位拉开到满幅全景（过滤/滑位全程可见）→ 推进点击卡
  const ZT = portrait ? 1.6 : 2.0;
  const typeCam = { cx: SEARCH.x - 68 + 960 / ZT, cy: SEARCH.y + SEARCH.h / 2 + (0.3 * H) / ZT };
  const KEYS: CamKey[] = [
    { frame: 0, ...typeCam, zoom: ZT },
    { frame: 34, ...typeCam, zoom: ZT },
    { frame: 46, cx: 960, cy: H / 2, zoom: 1.0 },
    { frame: 56, cx: 960, cy: H / 2, zoom: 1.0 },
    { frame: 72, cx: CLICK_C.x, cy: CLICK_C.y, zoom: 2.2 },
  ];
  const cam = camAt(KEYS, frame);

  // typed chars: 3f/ky tu (chu dai -> nen nhip de go xong truoc ~34f)
  const q = Array.from(query.normalize('NFC'));
  const per = Math.min(3, 24 / Math.max(1, q.length));
  const typedCount = frame < TYPE_START ? 0 : Math.min(q.length, Math.floor((frame - TYPE_START) / per) + 1);
  const typeEnd = TYPE_START + per * q.length;
  // caret: solid while typing, blinks on an 8f cycle after, until the click
  const caretOn = frame >= TYPE_START - 2 && frame <= 67 && (frame <= typeEnd + 2 || Math.floor((frame - (typeEnd + 2)) / 8) % 2 === 0);
  // 搜索框聚焦环：打字前 4f 亮起，点击后退去
  const focus = interpolate(frame, [TYPE_START - 6, TYPE_START - 2, CLICK, CLICK + 6], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const qFs = fitSize(query, { family: fonts.sans, size: 26 * K, maxWidth: SEARCH.w - 120 * K, weight: 500, minSize: 14 * K });

  // 指针路径（页面坐标）：全景落定时停在搜索框右下，46–57f 带弧线滑到点击点
  const PTR_FROM = { x: SEARCH.x + SEARCH.w * 0.78, y: SEARCH.y + SEARCH.h + 40 * K };
  const pt = interpolate(frame, [46, 57], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.45, 0, 0.2, 1) });
  const ptr = { x: PTR_FROM.x + (CLICK_C.x - PTR_FROM.x) * pt, y: PTR_FROM.y + (CLICK_C.y - PTR_FROM.y) * pt + Math.sin(pt * Math.PI) * 60 * K };
  const ptrO = interpolate(frame, [42, 47, 62, 67], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const ptrPress = interpolate(frame, [CLICK - 1, CLICK + 1, CLICK + 5], [1, 0.86, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const ptrScale = (1 / cam.zoom) * ptrPress * (portrait ? 1.7 : 1);

  // 目标卡滑位
  const slideAt = (f: number) => interpolate(f, [FILTER_START, FILTER_START + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.35, 0, 0.2, 1) });
  const slideT = slideAt(frame);
  const slideVy = velocity((f) => (to.y - from.y) * slideAt(f), frame);

  const cardBody = (c: { name: string; meta: string; src?: string }, i: number) => {
    const t = fitTitle(c.name);
    return (
      <>
        <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: thumbH, overflow: 'hidden' }}>
          <Thumb i={i} src={c.src} />
        </div>
        <div style={{ position: 'absolute', left: 22 * K, right: 22 * K, top: thumbH + 16 * K, fontFamily: fonts.sans, color: INK }}>
          {t.ls.map((l, k) => <div key={k} style={{ fontSize: t.fs, fontWeight: 650, lineHeight: 1.25, whiteSpace: 'nowrap' }}>{l}</div>)}
          <div style={{ marginTop: 6 * K, fontSize: metaFs, color: INK2, whiteSpace: 'nowrap', lineHeight: 1.3 }}>{c.meta}</div>
        </div>
      </>
    );
  };
  // [Agent Edit] DOT 2: co nen anh AI -> bo nen giay phu kin man hinh (thanh tren, o tim kiem, the giu nguyen)
  const bd = useBackdrop();
  const cardShell: React.CSSProperties = { position: 'absolute', borderRadius: 16 * K, overflow: 'hidden', background: '#fffdf9', border: '1px solid rgba(60,45,30,0.08)' };

  return (
    <AbsoluteFill style={{ backgroundColor: bd ? 'transparent' : PAPER, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: H, transform: `translate(${(960 - cam.cx * cam.zoom).toFixed(2)}px, ${(H / 2 - cam.cy * cam.zoom).toFixed(2)}px) scale(${cam.zoom.toFixed(4)})`, transformOrigin: '0 0' }}>
        {/* ---- thanh tren ---- */}
        <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: TOP_H, borderBottom: '1px solid rgba(60,45,30,0.09)', background: '#fbf8f3', display: 'flex', alignItems: 'center', padding: `0 ${PAD}px`, boxSizing: 'border-box', gap: 16 * K, fontFamily: fonts.sans }}>
          {brandName ? <ShotcraftMark size={34 * K} tone="light" /> : null}
          {brandName ? <span style={{ fontSize: 22 * K, fontWeight: 700, color: INK, whiteSpace: 'nowrap' }}>{brandName}</span> : null}
          {brandName ? <span style={{ width: 1.5, height: 24 * K, background: 'rgba(60,45,30,0.15)' }} /> : null}
          <span style={{ fontSize: fitSize(title, { family: fonts.sans, size: 22 * K, maxWidth: 900, weight: 600, minSize: 14 * K }), fontWeight: 600, color: INK, whiteSpace: 'nowrap' }}>{title}</span>
          <span style={{ marginLeft: 'auto', width: 38 * K, height: 38 * K, borderRadius: 19 * K, background: 'linear-gradient(135deg, #e7c9a8, #c79a74)' }} />
        </div>

        {/* ---- 非目标卡：过滤时按阅读序错峰淡出 + 下沉 ---- */}
        {cards.map((c, i) => {
          if (i === TARGET_I) return null;
          const sl = slotOf(i);
          const outCue = FILTER_START + leaveRank.get(i)! * 0.4;
          if (frame >= outCue + 5) return null;
          const outT = interpolate(frame, [outCue, outCue + 5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.quad) });
          return (
            <div
              key={i}
              style={{
                ...cardShell, left: sl.x, top: sl.y, width: sl.w, height: sl.h,
                transform: `translate3d(0px, ${8 * K * outT}px, 0px) scale(${1 - 0.015 * outT})`,
                opacity: 1 - outT, filter: outT > 0.02 ? `blur(${(1.5 * outT).toFixed(2)}px)` : undefined,
                boxShadow: '0 1px 2px rgba(60,45,30,.06), 0 4px 12px -4px rgba(60,45,30,.08)',
              }}
            >
              {cardBody(c, i)}
            </div>
          );
        })}

        {/* ---- 目标卡：滑到首行槽位，途中浮起（快段纵向拖影）---- */}
        {(() => {
          const slideDy = (to.y - from.y) * slideT;
          const slideDx = (to.x - from.x) * slideT;
          const float = Math.sin(slideT * Math.PI);
          return (
            <SpeedBlur vx={0} vy={slideVy} amount={0.04} max={7} style={{ zIndex: 2 }}>
              <div
                style={{
                  ...cardShell, left: from.x, top: from.y, width: from.w, height: from.h,
                  transform: `translate3d(${slideDx}px, ${slideDy}px, ${18 * float}px) scale(${1 + 0.02 * float})`,
                  transformOrigin: 'center center',
                  boxShadow: `0 ${1 + 2 * float}px ${2 + 4 * float}px rgba(60,45,30,${0.07 + 0.03 * float}), 0 ${4 + 18 * float}px ${12 + 30 * float}px -${4 + 6 * float}px rgba(60,45,30,${0.09 + 0.12 * float})`,
                }}
              >
                {cardBody(cards[TARGET_I], TARGET_I)}
              </div>
            </SpeedBlur>
          );
        })()}

        {/* ---- o tim kiem: kinh lup + chu go + con tro nhay ---- */}
        <div style={{ position: 'absolute', left: SEARCH.x, top: SEARCH.y, width: SEARCH.w, height: SEARCH.h, borderRadius: 10 * K, background: FIELD, border: '1px solid rgba(60,45,30,0.14)', boxSizing: 'border-box', display: 'flex', alignItems: 'center', paddingLeft: 22 * K, gap: 14 * K, fontFamily: fonts.sans }}>
          <svg width={24 * K} height={24 * K} viewBox="0 0 24 24" style={{ flex: 'none' }}><circle cx={10.5} cy={10.5} r={6.5} fill="none" stroke={INK2} strokeWidth={2} /><path d="M15.5 15.5 L20 20" stroke={INK2} strokeWidth={2} strokeLinecap="round" /></svg>
          {typedCount === 0 && !caretOn ? <span style={{ fontSize: qFs, color: 'rgba(122,113,104,0.6)', whiteSpace: 'nowrap' }}>Tìm kiếm…</span> : null}
          <span style={{ display: 'flex', alignItems: 'center', fontSize: qFs, fontWeight: 500, letterSpacing: 0.2, color: 'oklch(25% 0.006 82)', whiteSpace: 'pre', lineHeight: 1.3 }}>
            {q.slice(0, typedCount).join('')}
            {caretOn ? <span style={{ display: 'inline-block', width: 1.5 * K, height: qFs * 1.25, marginLeft: 1.5 * K, borderRadius: 1, background: AMBER }} /> : null}
          </span>
        </div>
        {/* 聚焦环：1px 强调色描边 + 3px 浅色外环 */}
        <div
          style={{
            position: 'absolute', left: SEARCH.x - 1, top: SEARCH.y - 1, width: SEARCH.w + 2, height: SEARCH.h + 2,
            borderRadius: 10 * K + 1, boxSizing: 'border-box', pointerEvents: 'none', opacity: focus,
            border: `${portrait ? 2 : 1}px solid rgba(${AMBER_RGB},0.55)`, boxShadow: `0 0 0 ${3 * K}px rgba(${AMBER_RGB},0.14)`,
          }}
        />

        {/* ---- click ripple: two concentric amber rings ---- */}
        {[0, 1].map((r) => {
          const start = CLICK + r * 3;
          if (frame < start || frame > start + 10) return null;
          const t = interpolate(frame, [start, start + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
          const rad = interpolate(t, [0, 1], [14, r === 0 ? 54 : 78]) * K;
          return (
            <div
              key={`ripple-${r}`}
              style={{
                position: 'absolute', left: CLICK_C.x - rad, top: CLICK_C.y - rad, width: rad * 2, height: rad * 2, borderRadius: '50%', boxSizing: 'border-box',
                border: `${(r === 0 ? 2 : 1.5) * K}px solid ${AMBER}`,
                background: r === 0 ? `radial-gradient(circle, rgba(${AMBER_RGB},0) 55%, rgba(${AMBER_RGB},0.10) 100%)` : undefined,
                opacity: 1 - t, pointerEvents: 'none', zIndex: 5,
              }}
            />
          );
        })}

        {/* ---- selected-card amber outline, lit from the click ---- */}
        {frame >= CLICK + 2 ? (
          <div
            style={{
              position: 'absolute', left: to.x - 6 * K, top: to.y - 6 * K, width: to.w + 12 * K, height: to.h + 12 * K, borderRadius: 22 * K, boxSizing: 'border-box',
              border: `${3 * K}px solid ${AMBER}`,
              boxShadow: `0 0 0 ${4 * K}px rgba(${AMBER_RGB},0.10), 0 8px 34px -6px rgba(${AMBER_RGB},0.45)`,
              opacity: interpolate(frame, [CLICK + 2, CLICK + 5], [0.5, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
              transform: `scale(${interpolate(frame, [CLICK + 2, CLICK + 7], [1.015, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) })})`,
              pointerEvents: 'none', zIndex: 4,
            }}
          />
        ) : null}

        {/* ---- macOS 指针（页面坐标定位、按相机 zoom 反向缩放 → 屏幕上恒定）---- */}
        {ptrO > 0.001 ? (
          <svg
            width={28}
            height={28}
            viewBox="0 0 28 28"
            style={{
              position: 'absolute', left: ptr.x - 2, top: ptr.y - 1, zIndex: 6, opacity: ptrO, overflow: 'visible', transformOrigin: '2px 1px',
              transform: `scale(${(ptrScale * 1.6).toFixed(4)})`,
              filter: 'drop-shadow(0 0.6px 0.6px rgba(20,14,8,0.35)) drop-shadow(0 3px 5px rgba(20,14,8,0.25))',
            }}
          >
            <path d="M2 1 L2 23 L8 17.5 L11.5 25 L15.5 23.2 L12 15.8 L20 15 Z" fill="#17181c" stroke="#ffffff" strokeWidth={1.6} strokeLinejoin="round" />
          </svg>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
