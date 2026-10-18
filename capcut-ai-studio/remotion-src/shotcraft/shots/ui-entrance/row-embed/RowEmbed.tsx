// row-embed —— 内容行从空中降下、rotateX 收平、嵌入瞬间底边亮强调色缝
// "结构化数据长进页面"的详情页/列表镜头。参考实现从 template SceneDetail 剥离：
// 行按节拍逐条从上空飞入（perspective translateY(−120·air) + rotateX(16°·air) +
// scale 略过冲后 press 回弹），行位先盖页面底色补丁占位、落地后消失让内容透出，
// 嵌入瞬间行底边 2px 强调色缝从中心向两侧展开后淡出，相机同时缓缓下摇。
// 节拍（质感改版）：cue = 12/22/31/39/46（间隔 10→7 递减，行雨越落越快），飞行 12f，
// 末行 58f 落地、强调色缝 66f 收尾 ≤ 镜头 68f 预算。
// 质感改版要点：
// - 空槽补丁取页面真实底色 #f9f6f1 + 一道极淡的槽位虚线框——观众看得见"这里有个空位在等"，落地就是"扣进去"（Q9）；
// - 下落改为"加速砸进槽位"（末段仍有速度）+ press 回弹，飞行段按速度加纵向运动模糊；
// - 槽位接触影随行接近而收紧变实（近地小而实），离地时是大而虚的环境影；
// - 相机取景全程被页面铺满。
//
// [Agent Edit] Anh chup trang mau + live-layout.json -> hai che do:
//   - CHU (mac dinh): trang chi tiet ve bang CSS (kicker + title + dong phu), 3..6 hang chu tu o `rows`
//     ("Nhãn: giá trị" -> nhan trai / gia tri phai dam; khong co dau ':' -> mot dong co so thu tu) bay xuong cai vao trang.
//   - ANH (khi co o `screen`, ti le bat ky — doc ti le that truoc khi ve): anh la "trang", 5 dai ngang deu nhau cua
//     chinh anh la cac hang bay xuong (cat bang background-position theo ti le that), camera lia doc neu anh dai.
//   - Khung doc (native): trang phu kin chieu cao, hang cao hon + chu to hon; nhip cue tinh theo so hang (hang cuoi van cham dat f58).
import { useBackdrop, useCurrentFrame, useVideoConfig, useText, useList, useImage, useShotFonts, fitSize, measureText, wrapLines } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, interpolate, Easing, continueRender, delayRender } from 'remotion';
import { Grain, Vignette } from '../../../fixtures/Polish';

export const ROW_EMBED_DURATION = 68;

const PAGE_BG = '#f9f6f1'; // 页面底色（槽位补丁同色）
const INK = '#2a241c';
const MUTED = '#8a7f70';
const LINE = 'rgba(120,96,64,0.14)';
const FLY = 12;
// 下落：起步慢、末段仍带速度砸进槽位（终点斜率≈1.25），由 press 回弹吸收冲击
const FLY_EASE = Easing.bezier(0.5, 0, 0.8, 0.75);
const CAM_EASE = Easing.bezier(0.33, 0, 0.15, 1);
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

const airOf = (frame: number, cue: number) => 1 - interpolate(frame, [cue, cue + FLY], [0, 1], { ...clamp, easing: FLY_EASE });

// 节拍：首行 12f、末行 46f 起飞（58f 落地），间隔按 10→7 递减权重分配（行雨越落越快）
const cuesFor = (n: number) => {
  if (n <= 1) return [12];
  const w = Array.from({ length: n - 1 }, (_, i) => 10 - (3 * i) / Math.max(1, n - 2));
  const sum = w.reduce((a, b) => a + b, 0);
  const out = [12];
  for (let i = 0; i < n - 1; i++) out.push(out[i] + (w[i] / sum) * 34);
  return out;
};

// Ti le that cua anh (rong/cao) — doc truoc khi ve (delayRender)
const useAspect = (src?: string): number | null => {
  const [a, setA] = React.useState<number | null>(null);
  const [h] = React.useState(() => (src ? delayRender('row-embed: ti le anh') : null));
  React.useEffect(() => {
    if (!src || h === null) return;
    const im = new Image();
    const done = (v: number | null) => {
      setA(v);
      continueRender(h);
    };
    im.onload = () => done(im.naturalWidth && im.naturalHeight ? im.naturalWidth / im.naturalHeight : null);
    im.onerror = () => done(null);
    im.src = src;
  }, [src, h]);
  return a;
};

type Row = { x: number; y: number; w: number; h: number };

export const RowEmbed: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const kicker = useText('kicker', 'HỒ SƠ DỰ ÁN');
  const title = useText('title', 'Thông tin dự án');
  const sub = useText('subtitle', 'Cập nhật tự động · vừa xong');
  const items = useList('rows', ['Khách hàng: Công ty Minh An', 'Ngân sách: 450 triệu đồng', 'Thời gian: 12 tuần', 'Phụ trách: Nhóm Sáng tạo', 'Trạng thái: Đang triển khai']).slice(0, 6);
  const screen = useImage('screen');
  const asp = useAspect(screen);
  const imgMode = !!screen && !!asp;

  // ───── 页面几何（页面坐标 = 舞台坐标，宽 1920）─────
  let pageH: number;
  let rows: Row[];
  let camFrom: { cy: number; zoom: number }, camTo: { cy: number; zoom: number };
  const n = imgMode ? 5 : Math.max(1, items.length);
  // che do chu
  const PX = portrait ? 120 : 408; // le trai noi dung
  const PW = 1920 - PX * 2;
  const kickFs = portrait ? 38 : 22;
  const tSize0 = portrait ? 140 : 72;
  const tLines = wrapLines(title, fonts.sans, tSize0, PW, 700, 2);
  const tSize = Math.min(...tLines.map((l) => fitSize(l, { family: fonts.sans, size: tSize0, maxWidth: PW, weight: 700, minSize: tSize0 * 0.5 })));
  const subFs = portrait ? 46 : 26;
  const rowH = portrait ? Math.min(300, Math.max(170, (SH - 1150) / n - 26)) : Math.min(150, (1080 - 400) / n - 14);
  const rowGap = portrait ? 26 : 14;
  const headH = (kicker ? kickFs * 1.5 + 14 : 0) + tLines.length * tSize * 1.14 + (sub ? 16 + subFs * 1.4 : 0);
  if (imgMode) {
    const ih = 1920 / asp!;
    pageH = Math.max(ih, SH);
    const top = (pageH - ih) / 2;
    // 5 dai ngang deu nhau trong vung 16%–94% chieu cao anh
    const y0 = top + ih * 0.16, span = ih * 0.78, bh = (span - ih * 0.02 * 4) / 5;
    rows = Array.from({ length: 5 }, (_, i) => ({ x: 120, y: y0 + i * (bh + ih * 0.02), w: 1680, h: bh }));
    const tall = ih > SH * 1.15;
    // anh ngang trong khung doc: phong to de anh chiem ~55% chieu cao (cat bot hai mep)
    const zf = portrait && !tall ? Math.max(1, Math.min(1.8, (SH * 0.55) / ih)) : 1;
    camFrom = tall ? { cy: SH / 2 / 1.12 + 10, zoom: 1.12 } : { cy: pageH / 2 - 30, zoom: 1.04 * zf };
    camTo = tall ? { cy: pageH - SH / 2 / 1.25 - 10, zoom: 1.25 } : { cy: pageH / 2 + 30, zoom: 1.1 * zf };
  } else {
    const blockH = headH + (portrait ? 80 : 46) + n * rowH + (n - 1) * rowGap;
    pageH = SH;
    const top = Math.max(portrait ? 200 : 70, (SH - blockH) / 2);
    const ry = top + headH + (portrait ? 80 : 46);
    rows = Array.from({ length: n }, (_, i) => ({ x: PX - (portrait ? 0 : 0), y: ry + i * (rowH + rowGap), w: PW, h: rowH }));
    // 相机：边看边长——缓缓下摇 + 微推（页面始终铺满画框）
    // zoom gioi han de ca khoi (tieu de + cac hang) luon nam tron trong khung
    const zFit = SH / (blockH + (portrait ? 260 : 90));
    const mid = top + blockH / 2;
    const pan = portrait ? 60 : 24;
    camFrom = { cy: mid - pan, zoom: Math.min(1.04, Math.max(0.96, zFit)) };
    camTo = { cy: mid + pan, zoom: Math.min(1.1, Math.max(0.98, zFit)) };
  }
  const textTop = rows[0].y - headH - (portrait ? 80 : 46);
  const CUES = cuesFor(n);

  const ct = interpolate(frame, [0, 68], [0, 1], { ...clamp, easing: CAM_EASE });
  const cy = camFrom.cy + (camTo.cy - camFrom.cy) * ct;
  const zoom = camFrom.zoom + (camTo.zoom - camFrom.zoom) * ct;

  // —— noi dung 1 hang (che do chu)
  const valFs = portrait ? Math.min(78, rowH * 0.3) : 38;
  const labFs = portrait ? Math.min(52, rowH * 0.2) : 26;
  const RowContent: React.FC<{ i: number }> = ({ i }) => {
    const t = items[i] ?? '';
    const k = t.indexOf(':');
    const pad = portrait ? 48 : 34;
    const inner = PW - pad * 2;
    if (k > 0 && k < t.length - 1) {
      const lab = t.slice(0, k).trim();
      const val = t.slice(k + 1).trim();
      const lf = fitSize(lab, { family: fonts.sans, size: labFs, maxWidth: inner * 0.4, weight: 500, minSize: labFs * 0.6 });
      const vf = fitSize(val, { family: fonts.sans, size: valFs, maxWidth: inner - Math.min(inner * 0.4, measureText(lab, fonts.sans, lf, 500)) - 40, weight: 650, minSize: valFs * 0.5 });
      return (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', padding: `0 ${pad}px`, gap: 40, fontFamily: fonts.sans, whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: lf, fontWeight: 500, color: MUTED, lineHeight: 1.3 }}>{lab}</span>
          <span style={{ marginLeft: 'auto', fontSize: vf, fontWeight: 650, color: INK, letterSpacing: '-0.02em', lineHeight: 1.3 }}>{val}</span>
        </div>
      );
    }
    const vf = fitSize(t, { family: fonts.sans, size: valFs, maxWidth: inner - valFs * 1.6, weight: 600, minSize: valFs * 0.5 });
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', padding: `0 ${pad}px`, gap: valFs * 0.6, fontFamily: fonts.sans, whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: labFs, fontWeight: 600, color: 'oklch(60% 0.14 62)', fontVariantNumeric: 'tabular-nums' }}>{String(i + 1).padStart(2, '0')}</span>
        <span style={{ fontSize: vf, fontWeight: 600, color: INK, letterSpacing: '-0.015em', lineHeight: 1.3 }}>{t}</span>
      </div>
    );
  };
  const rowSkin: React.CSSProperties = imgMode ? {} : { background: '#fffdf9', boxShadow: `inset 0 0 0 1px ${LINE}` };
  const radius = portrait ? 18 : 10;
  // [Agent Edit] nen anh AI (che do chu): trang khong to nen -> anh nen hien ra; mieng va o trong chi con khung net dut
  // (hang nen chi hien khi da cai xong); chu tren nen co bong nhe; bo toi goc + hat
  const bd = useBackdrop();
  const tsh = bd ? (bd.dark ? '0 2px 18px rgba(0,0,0,0.55)' : '0 1px 12px rgba(255,255,255,0.7)') : undefined;

  return (
    <AbsoluteFill style={{ background: bd ? 'transparent' : PAGE_BG, overflow: 'hidden' }}>
      {/* 页面相机：页面空间 (960, cy) 对准画面中心，zoom 放大 */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: pageH, transformOrigin: '0 0', transform: `translate(${960 - 960 * zoom}px, ${SH / 2 - cy * zoom}px) scale(${zoom})` }}>
        {/* trang: anh that / trang chi tiet ve CSS */}
        {imgMode ? (
          <div style={{ position: 'absolute', left: 0, top: (pageH - 1920 / asp!) / 2, width: 1920, height: 1920 / asp!, backgroundImage: `url(${screen})`, backgroundSize: '100% 100%' }} />
        ) : (
          <>
            <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: portrait ? 120 : 64, borderBottom: `1px solid ${LINE}`, background: '#fbf8f3' }}>
              <div style={{ position: 'absolute', left: PX, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: portrait ? 44 : 30, fontFamily: fonts.sans, fontSize: portrait ? 36 : 20, color: MUTED, whiteSpace: 'nowrap' }}>
                <span style={{ color: INK, fontWeight: 650 }}>Tổng quan</span><span>Tài liệu</span><span>Lịch sử</span>
              </div>
            </div>
            <div style={{ position: 'absolute', left: PX, top: textTop, width: PW, fontFamily: fonts.sans, textShadow: tsh }}>
              {kicker ? <div style={{ fontSize: kickFs, fontWeight: 650, letterSpacing: '0.16em', color: 'oklch(60% 0.14 62)', lineHeight: 1.5, whiteSpace: 'nowrap' }}>{kicker}</div> : null}
              <div style={{ marginTop: kicker ? 14 : 0, fontSize: tSize, fontWeight: 700, lineHeight: 1.14, letterSpacing: '-0.035em', color: INK }}>
                {tLines.map((l, i) => <div key={i} style={{ whiteSpace: 'nowrap' }}>{l}</div>)}
              </div>
              {sub ? <div style={{ marginTop: 16, fontSize: subFs, color: bd ? '#4a4136' : MUTED, lineHeight: 1.4, whiteSpace: 'nowrap' }}>{sub}</div> : null}
            </div>
            {/* hang da cai (nam san trong trang — lo ra khi mieng va bien mat) */}
            {rows.map((r, i) => (
              <div key={`base-${i}`} style={{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, borderRadius: radius, overflow: 'hidden', ...rowSkin, opacity: bd ? interpolate(frame, [CUES[i] + FLY, CUES[i] + FLY + 2], [0, 1], clamp) : undefined }}>
                <RowContent i={i} />
              </div>
            ))}
          </>
        )}

        {rows.map((r, i) => {
          const cue = CUES[i];
          const land = cue + FLY;
          // 空槽补丁（页面底色）+ 虚线槽位框，落地后 2f 消失
          const patchOpacity = interpolate(frame, [land, land + 2], [1, 0], clamp);
          const slotHint = interpolate(frame, [cue - 6, cue + 4], [0.55, 1], clamp);

          let flyer: React.ReactNode = null;
          let contact: React.ReactNode = null;
          if (frame >= cue && frame < land + 4) {
            const air = airOf(frame, cue);
            const p = 1 - air;
            const appear = interpolate(frame, [cue, cue + 3], [0, 1], clamp);
            const scale = frame < land ? 1.06 - 0.065 * p : interpolate(frame, [land, land + 4], [0.995, 1], { ...clamp, easing: Easing.out(Easing.quad) });
            // 纵向速度（页面 px/帧）→ 运动模糊，落地为 0
            const vy = 120 * (airOf(frame - 0.5, cue) - airOf(frame + 0.5, cue));
            const mb = frame < land ? Math.min(3.2, vy * 0.22) : 0;
            const lift = portrait ? 180 : 120;
            flyer = (
              <div key={`row-${i}`} style={{
                position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, opacity: appear, zIndex: 3, pointerEvents: 'none',
                transform: `perspective(${portrait ? 1400 : 900}px) translateY(${(-lift * air).toFixed(2)}px) rotateX(${(16 * air).toFixed(3)}deg) scale(${scale.toFixed(4)})`,
                filter: mb > 0.25 ? `url(#row-mb-${i})` : undefined,
              }}>
                {mb > 0.25 && (
                  <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
                    <filter id={`row-mb-${i}`} x="-5%" y="-30%" width="110%" height="160%">
                      <feGaussianBlur stdDeviation={`0 ${mb.toFixed(2)}`} />
                    </filter>
                  </svg>
                )}
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: radius, overflow: 'hidden', backgroundColor: '#fff', ...rowSkin,
                  ...(imgMode ? { backgroundImage: `url(${screen})`, backgroundSize: `1920px ${1920 / asp!}px`, backgroundPosition: `-${r.x}px -${(r.y - (pageH - 1920 / asp!) / 2).toFixed(1)}px` } : {}),
                  // 两层影：离地时大而虚的环境影 + 随高度变淡的近地影；顶部 1px 受光
                  boxShadow:
                    `inset 0 1px 0 rgba(255,255,255,${(0.9 * air).toFixed(3)}), ` +
                    `0 0 0 1px rgba(60,45,25,${(0.07 * air + (imgMode ? 0 : 0.06)).toFixed(3)}), ` +
                    `0 ${(34 * air).toFixed(1)}px ${(64 * air).toFixed(1)}px -${(10 * air).toFixed(1)}px rgba(40,30,18,${(0.24 * air).toFixed(3)}), ` +
                    `0 ${(6 * air).toFixed(1)}px ${(14 * air).toFixed(1)}px rgba(40,30,18,${(0.1 * air).toFixed(3)})`,
                }}>
                  {imgMode ? null : <RowContent i={i} />}
                </div>
              </div>
            );
            // 槽位接触影：行越近越实越小（落地前 4f 最浓），落地后 3f 淡掉
            const near = interpolate(air, [0, 0.5], [1, 0], clamp);
            const contactOp = frame < land ? near * 0.5 : interpolate(frame, [land, land + 3], [0.5, 0], clamp);
            contact = (
              <div key={`contact-${i}`} style={{
                position: 'absolute', left: r.x + 10, top: r.y + 6, width: r.w - 20, height: r.h - 6, borderRadius: radius + 2,
                boxShadow: `0 ${(2 + 6 * air).toFixed(1)}px ${(6 + 18 * air).toFixed(1)}px rgba(60,42,20,${(0.22 * contactOp).toFixed(3)})`, zIndex: 2, pointerEvents: 'none',
              }} />
            );
          }

          // embed flash: 2px amber seam at the row's bottom edge, expanding from the center on touchdown, then fading out
          let seam: React.ReactNode = null;
          if (frame >= land && frame < land + 8) {
            const spread = interpolate(frame, [land, land + 5], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
            const seamOpacity = interpolate(frame, [land, land + 2, land + 8], [1, 1, 0], clamp);
            const seamW = (r.w - radius * 2) * spread;
            const sh = portrait ? 3 : 2;
            seam = (
              <div key={`seam-${i}`} style={{
                position: 'absolute', left: r.x + (r.w - seamW) / 2, top: r.y + r.h - sh, width: seamW, height: sh, borderRadius: 1,
                background: 'linear-gradient(90deg, rgba(196,120,40,0) 0%, oklch(60% 0.14 62) 18%, oklch(66% 0.15 66) 50%, oklch(60% 0.14 62) 82%, rgba(196,120,40,0) 100%)',
                boxShadow: '0 0 7px rgba(200,128,52,0.38)', opacity: seamOpacity, zIndex: 4, pointerEvents: 'none',
              }} />
            );
          }

          return (
            <React.Fragment key={i}>
              {patchOpacity > 0 ? (
                <div key={`patch-${i}`} style={{
                  position: 'absolute', left: r.x - 8, top: r.y - 4, width: r.w + 24, height: r.h + 8, background: bd && !imgMode ? 'transparent' : imgMode ? 'rgba(249,246,241,0.94)' : PAGE_BG,
                  opacity: patchOpacity, zIndex: 1, pointerEvents: 'none',
                }}>
                  <div style={{
                    position: 'absolute', left: 8, top: 10, width: r.w, height: r.h - 12, borderRadius: radius, border: `${portrait ? 2 : 1}px dashed rgba(120,96,64,0.20)`, boxSizing: 'border-box',
                    opacity: slotHint, background: 'rgba(120,96,64,0.018)',
                  }} />
                </div>
              ) : null}
              {contact}
              {flyer}
              {seam}
            </React.Fragment>
          );
        })}
      </div>
      {!bd && <Vignette strength={0.1} color="#3a2c1c" inner={0.55} />}
      {!bd && <Grain opacity={0.035} />}
    </AbsoluteFill>
  );
};
