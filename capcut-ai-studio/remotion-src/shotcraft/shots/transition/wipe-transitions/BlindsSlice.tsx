// blinds-slice｜百叶窗切条错峰翻换
// 12 根 160px 竖条从左到右错峰翻面，波扫过后整页由 A 换成 B。
//
// 第二轮重设计（纸 · 瑞士网格杂志的翻页）：
// - look = paper。两页是 video-shotcraft 刊物的连续两页（刊头是 video-shotcraft 字标）：A 页暖白纸 + 墨色巨字「Frame.」，
//   B 页整版朱红 + 奶白巨字「Craft.」（合起来是品牌短句 Frame motion. Craft the shot.）。明暗与色相反差让波的每一叶都读得清。
//   版面用 12 栏网格（每栏 160px，发丝线可见）——**栏 = 叶片**，百叶窗就是沿着版式网格翻页，形式与手法同构。
// - 真 3D 叶片：每叶是 preserve-3d 的双面板（正面 A 切片、背面 B 切片，backface hidden），绕自身竖轴
//   rotateY 0→180°，共享 1900px 透视——翻到 90° 时叶片侧立、露出叶后的暗槽，暗带随波扫过。
//   受光：转离主光的一面按 sin(θ) 变暗，转向主光的一面在 ~35° 掠过一道高光（裁在叶片内，Q4）；叶缘受光细线。
// - 节奏：每叶用物理弹簧翻面（damping 13 / stiffness 75：~13f 到 180°、≈5° 过冲回落，像真的叶片拍到位）；
//   起跳按 t^0.78 错峰（间隔 3.4f → 2.1f，前疏后密，波越翻越快，同时有 4–5 叶在转）；波期间相机极轻前推 1→1.02 再回 1。
// - 波完成后摘罩（3D 结构全部卸载，B 整页直出、文字锐利），随后 B 页顶部一根奶白细线从左画到右、页码跳到 02。
//
// 时间表（30fps，共 132f）：
//   0–24    A 页 hold（相机 1→1.006 极缓推进，画面不死）
//   24–52   起跳：叶 i 在 24 + stagger(i, 12, 28, t^0.78) 帧起翻（前疏后密）
//   24–~76  翻面：每叶弹簧 ~13f 到位、≈5° 过冲回落；暗槽随波扫过
//   ~80     摘罩：最后一叶弹簧收敛（|θ−180°|<0.3° 连续 4 帧）后，B 整页直出
//   82–102  余波：刊头细线重新画出（snappy），相机 60–94f 落回 1
//   102–132 hold
//
// [Agent Edit] o chu: wordA / wordB (chu khong lo trang A / trang B — vd Trước → Sau, Vấn đề → Giải pháp),
// chapterA / chapterB (nhan chuong nho), bodyA / bodyB (cau mo ta 1-3 dong), label (ten chuyen muc tren dau trang).
// Trang B = mau nhan cua video (L.accent), chu tren do = L.onAccent. Chu that dai ngan bat ky: chu khong lo tu thu nho
// (khung doc: toi da 2 dong), cau mo ta tu xuong dong. Khung doc (native): la chop cao het khung, bo cuc trang xep doc
// (dau trang tren cung, cau mo ta giua, chu khong lo sat day). Nhip song / lo xo / thao mat na giu nguyen.
import { useCurrentFrame, useShotFonts, useText, useVideoConfig, fitSize, wrapLines, useShot } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, FONT, Grain, Vignette, ramp } from '../../../fixtures/Polish';
import { LOOKS, alpha, springAt, stagger, type } from '../../../fixtures/Look';
import { ShotcraftWordmark } from '../../../fixtures/Brand';

// [Agent Edit] o chu TUY CHON: app da gui noi dung (co texts) ma bo trong o nay -> '' (an di), khong hien chu mau
const useOptText = (id: string, sample: string): string => {
  const d = useShot();
  const v = useText(id, sample);
  const t = d?.texts[id];
  const app = !!d && Object.keys(d.texts).length > 0;
  return app && (t === undefined || (typeof t === 'string' && !t.trim())) ? '' : v;
};


export const BLINDS_SLICE_DURATION = 132;

const L = LOOKS.paper;
const STRIPS = 12;
const W = 160; // 12 × 160 = 1920（= 版面 12 栏）
const WAVE0 = 24;
const SPAN = 28; // 起跳错峰总跨度
// t^0.78：间隔从 ~3.4f 渐缩到 ~2.1f——波越翻越快，但第一叶之后不会空等（EASE.out 首间隔 9f 太拖）
const startOf = (i: number) => WAVE0 + stagger(i, STRIPS, SPAN, (t) => Math.pow(t, 0.78));
const angleOf = (f: number, i: number) => {
  const s = startOf(i);
  return f < s ? 0 : 180 * springAt(f, s, { damping: 13, stiffness: 75 });
};
// 摘罩帧：最后一叶弹簧收敛（|θ-180| < 0.3°）之后
const UNMASK = (() => {
  for (let f = startOf(STRIPS - 1); f < 200; f++) {
    let ok = true;
    for (let k = 0; k < 4; k++) if (Math.abs(angleOf(f + k, STRIPS - 1) - 180) > 0.3) ok = false;
    if (ok) return f;
  }
  return 80;
})();

// ───────────── 两页版面 ─────────────
type Spec = { portrait: boolean; H: number; label: string; num: string; chapter: string; body: string[]; bodySize: number; word: string[]; wordSize: number };
type PageProps = { spec: Spec; mark: 'dark' | 'light'; bg: string; ink: string; sub: string; accent: string; line: string; dot: string; page: string; rule?: number };

const Page: React.FC<PageProps> = ({ spec, mark, bg, ink, sub, accent, line, dot, page, rule = 1 }) => {
  const P = spec.portrait;
  const H = spec.H;
  const headTop = P ? 170 : 92;
  const ruleTop = P ? 262 : 152;
  const wl = spec.word.length;
  const wLH = wl > 1 ? 1.08 : 0.8;
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: H, background: bg, overflow: 'hidden' }}>
      {/* 12 栏网格发丝线 */}
      {Array.from({ length: STRIPS - 1 }, (_, i) => (
        <div key={i} style={{ position: 'absolute', left: (i + 1) * W, top: 0, bottom: 0, width: 1, background: line }} />
      ))}
      {/* 刊头：视频品牌字标（可无）+ 栏目名 + 期号 */}
      <div style={{ position: 'absolute', left: 96, right: 96, top: headTop, display: 'flex', alignItems: 'center', gap: 32, color: ink }}>
        <ShotcraftWordmark size={P ? 44 : 30} markScale={1.6} gap={14} tone={mark} color={ink} />
        <div style={{ ...type(P ? 44 : 28, 500), lineHeight: 1.3, color: sub, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{spec.label}</div>
        <div style={{ ...type(P ? 40 : 26, 500, { mono: true }), lineHeight: 1.3, color: sub, whiteSpace: 'nowrap' }}>{spec.num}</div>
      </div>
      <div style={{ position: 'absolute', left: 96, right: 96, top: ruleTop, height: P ? 3 : 2, background: ink, transform: `scaleX(${rule})`, transformOrigin: '0 50%' }} />
      {/* 章节 + 正文：横版落在第 8–12 栏；竖版在刊头下方通栏 */}
      <div style={{ position: 'absolute', left: P ? 96 : 7 * W, top: P ? Math.round(H * 0.25) : 250, width: P ? 1728 : 4 * W + 40, color: ink }}>
        {spec.chapter ? <div style={{ ...type(P ? 52 : 28, 800), lineHeight: 1.3, letterSpacing: '0.2em', color: accent }}>{spec.chapter.toUpperCase()}</div> : null}
        <div style={{ ...type(spec.bodySize, 560), lineHeight: 1.2, letterSpacing: '-0.025em', marginTop: P ? 40 : 26 }}>
          {spec.body.map((l, i) => (
            <div key={i} style={{ whiteSpace: 'nowrap' }}>{l}</div>
          ))}
        </div>
      </div>
      {/* 巨字：第 1 栏起（底边距留足下伸部） */}
      <div style={{
        position: 'absolute', left: 84, bottom: P ? 330 : 156, color: ink, fontFamily: FONT.sans, fontSize: spec.wordSize, fontWeight: 850,
        letterSpacing: '-0.055em', lineHeight: wLH, whiteSpace: 'nowrap',
      }}>
        {spec.word.map((l, i) => (
          <div key={i}>
            {l}
            {i === wl - 1 ? <span style={{ color: dot }}>.</span> : null}
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', right: 96, bottom: P ? 220 : 168, color: sub, ...type(P ? 40 : 28, 500, { mono: true }) }}>{page}</div>
    </div>
  );
};

// 一叶的切片：外层 160 宽裁剪，内层整页负偏移对位
const Slice: React.FC<{ x: number; children: React.ReactNode }> = ({ x, children }) => (
  <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
    <div style={{ position: 'absolute', left: -x, top: 0, width: 1920, height: '100%' }}>{children}</div>
  </div>
);

// 叶面受光：背光变暗 + 转向主光时掠过一道高光（θf = 该面相对正视的转角，0–90°）
const FaceLight: React.FC<{ th: number; lead: 'left' | 'right' }> = ({ th, lead }) => {
  const r = (th * Math.PI) / 180;
  const shade = 0.5 * Math.sin(r);
  const spec = 0.22 * Math.max(0, Math.cos((th - 35) * (Math.PI / 70))) * Math.sin(r * 2 > Math.PI ? Math.PI : r * 2);
  return (
    <>
      <div style={{
        position: 'absolute', inset: 0,
        background: `linear-gradient(${lead === 'left' ? 90 : 270}deg, rgba(20,12,6,${(shade * 0.7).toFixed(3)}) 0%, rgba(20,12,6,${shade.toFixed(3)}) 100%)`,
      }} />
      {spec > 0.005 && <div style={{ position: 'absolute', inset: 0, background: `rgba(255,248,236,${spec.toFixed(3)})`, mixBlendMode: 'screen' }} />}
      {/* 叶缘受光细线 */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, [lead]: 0, width: 2, background: `rgba(255,250,240,${(0.7 * Math.sin(r)).toFixed(3)})` } as React.CSSProperties} />
    </>
  );
};

export const BlindsSlice: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const label = useOptText('label', 'Sổ tay khởi nghiệp');
  const tA = { chapter: useOptText('chapterA', 'Phần 01'), body: useOptText('bodyA', 'Làm mọi thứ thủ công, mất cả ngày cho một việc nhỏ.'), word: useText('wordA', 'Trước') };
  const tB = { chapter: useOptText('chapterB', 'Phần 02'), body: useOptText('bodyB', 'Tự động hoá quy trình, chỉ còn vài phút mỗi ngày.'), word: useText('wordB', 'Sau') };
  const RED = L.accent;
  const CREAM = L.onAccent;
  // 排版：正文按栏宽折行；巨字横版 1 行缩到可用宽，竖版最多 2 行
  const specOf = (t: { chapter: string; body: string; word: string }, num: string): Spec => {
    const bw = portrait ? 1728 : 4 * W + 40;
    const b0 = portrait ? 108 : 52;
    const bl = wrapLines(t.body, fonts.sans, b0, bw, 560, portrait ? 4 : 4);
    const bs = Math.min(b0, ...bl.map((l) => fitSize(l, { family: fonts.sans, size: b0, maxWidth: bw, weight: 560, minSize: b0 * 0.55 })));
    const ww = portrait ? 1752 : 1536;
    const w0 = portrait ? 520 : 400;
    const wt = t.word.replace(/[.。]+$/, '');
    let wlines = [wt];
    let ws = fitSize(wt + '.', { family: fonts.sans, size: w0, maxWidth: ww, weight: 850, letterSpacingEm: -0.055, minSize: 120 });
    if (portrait && ws < w0 * 0.72 && wt.includes(' ')) {
      const two = wrapLines(wt, fonts.sans, w0 * 0.78, ww, 850, 2);
      const s2 = Math.min(...two.map((l, i) => fitSize(l + (i === two.length - 1 ? '.' : ''), { family: fonts.sans, size: w0 * 0.78, maxWidth: ww, weight: 850, letterSpacingEm: -0.055, minSize: 120 })));
      if (s2 > ws) { wlines = two; ws = s2; }
    }
    return { portrait, H: SH, label, num, chapter: t.chapter, body: bl, bodySize: bs, word: wlines, wordSize: ws };
  };
  const specA = specOf(tA, 'SỐ 07');
  const specB = specOf(tB, 'SỐ 07');
  const pageA = (
    <Page spec={specA} mark="light" bg="#f3eee4" ink={L.ink} sub={L.ink2} accent={RED} line={alpha(L.ink, 0.07)} dot={RED} page="01 / 02" />
  );
  const pageB = (rule?: number) => (
    <Page spec={specB} mark="dark" bg={RED} ink={CREAM} sub={alpha(CREAM, 0.72)} accent={L.ink} line={alpha(CREAM, 0.13)} dot={L.ink} page="02 / 02" rule={rule} />
  );
  const cam = 1 + 0.006 * ramp(frame, 0, WAVE0, EASE.smooth)
    + 0.014 * ramp(frame, WAVE0, 26, EASE.smooth) * (1 - ramp(frame, 60, 34, EASE.smooth));
  const rule = frame < UNMASK ? 1 : ramp(frame, UNMASK + 2, 20, EASE.snappy);

  let body: React.ReactNode;
  if (frame < startOf(0)) {
    body = pageA;
  } else if (frame >= UNMASK) {
    // 摘罩：B 整页直出，刊头细线重新画一遍（翻页后的"落定"一拍）
    body = pageB(rule);
  } else {
    body = (
      <>
        {/* 叶后暗槽：叶片侧立时露出的墙体 */}
        <AbsoluteFill style={{ background: 'linear-gradient(180deg, #1d1712 0%, #120d0a 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, perspective: 1900, perspectiveOrigin: '50% 50%' }}>
          {Array.from({ length: STRIPS }, (_, i) => {
            const x = i * W;
            const th = angleOf(frame, i);
            const front = th < 90;
            return (
              <div key={i} style={{
                position: 'absolute', left: x, top: 0, width: W, height: SH, transformStyle: 'preserve-3d',
                transform: `rotateY(${(-th).toFixed(3)}deg)`, transformOrigin: '50% 50%',
              }}>
                {/* 正面：A 切片 */}
                <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', overflow: 'hidden' }}>
                  <Slice x={x}>{pageA}</Slice>
                  {front && th > 0.05 && <FaceLight th={th} lead="left" />}
                </div>
                {/* 背面：B 切片（预转 180°，叶片转满后正好朝前、不镜像） */}
                <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', overflow: 'hidden', transform: 'rotateY(180deg)' }}>
                  <Slice x={x}>{pageB()}</Slice>
                  {!front && Math.abs(180 - th) > 0.05 && <FaceLight th={Math.min(90, Math.abs(180 - th))} lead="right" />}
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  return (
    <AbsoluteFill style={{ background: L.bg[1], overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${cam.toFixed(5)})`, transformOrigin: '50% 50%' }}>
        {body}
      </div>
      {/* 共享暗角与纸面颗粒：只画一层，两页共用（转场接缝不叠暗角） */}
      <Vignette strength={0.2} inner={0.5} color={L.shadow} />
      <Grain opacity={0.06} />
    </AbsoluteFill>
  );
};
