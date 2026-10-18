// 功能卡 3D 翻面揭示（card-flip-reveal）——Apple bento 翻转段。
// 手法不变：一排功能卡逐张错峰沿 Y 轴翻 180°（perspective + 双面 backface hidden），正面是功能界面，
// 背面是它带来的大号结论数字（语义成对）；翻转末端过冲再回落，侧棱最薄处有一道随角度走的受光。
//
// 第二轮重设计（设计决定）
// - look = graphite（近单色暗场，白为强调、香槟金点缀）。正面是暗色功能卡，背面是亮瓷白结论卡：
//   翻面 = 从暗到亮的反相，"所以呢？"的答案被打亮，三张翻完画面从一排暗卡变成一排白色数字海报。
// - 卡片竖版 480×620（bento 比例），三卡 1536px 宽占画宽 80%；左上 84px 标题 + 金色眉题；
//   卡片立在一面暗色镜面地板上——每张卡在地板里有一份同步翻转的倒影（遮罩渐隐），空间一下就成立了。
// - 翻转动作：4f 预备（反向后仰 −10°）→ 16f 加速翻到 194°（bezier 0.55,0,0.3,1）→ 物理弹簧落回 180°；
//   翻转中卡片离地抬起（scale +6%）、面随偏离主光的角度变暗（|cos θ| 着色），侧棱 60–120° 有一道
//   随角度从左扫到右的窄受光（物理光照，不是额外的扫光特效）。背面数字在落定时由 1.08 收到 1，标签晚 4f。
//
// 时间表（30fps，150f）
//   0–16    暗卡一排已在画面，眉题 + 标题逐行升起，相机全程 1 → 1.03 极缓推近
//   22–48   卡 0：22 预备 → 26–42 翻转 → 42–52 弹簧落定，数字收拢、标签升起
//   34–60   卡 1（错峰 12f）
//   46–72   卡 2
//   72–150  全部落定后 hold ~78f（R1），尾帧是三张白色结论卡的海报
//
// [Agent Edit] o chu: kicker / title / names + descs (mat truoc) / values + labels (mat sau, con so + nhan) — 2..3 the.
// Mat truoc giu 3 hinh giao dien gia (go lenh / quy trinh / tim kiem) voi chu tieng Viet trung tinh. Bo thanh doi chieu
// "truoc / sau" cua ban goc (ti le co dinh se mau thuan voi con so that). Khung doc (native): cac the xep DOC, the nam ngang
// (giao dien ben phai, ten ben trai), con so to; chi the cuoi co mat san phan chieu.
import { useBackdrop, useCurrentFrame, useVideoConfig, useText, useList, useShotFonts, fitSize, wrapLines } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, FONT, bezier, mix, ramp } from '../../../fixtures/Polish';
import { LOOKS, Stage, TextReveal, alpha, springAt, type } from '../../../fixtures/Look';
import { BRAND } from '../../../fixtures/Brand';

export const CARD_FLIP_REVEAL_DURATION = 150;

const L = LOOKS.graphite;
const GOLD = L.accent2;
const FLIP0 = 22;
const STAGGER = 12;
const PRE = 4; // 预备帧
const FLIP = 16; // 翻转帧
const PEAK_DEG = 194;

const flipEase = bezier(0.55, 0, 0.3, 1);

// 卡 i 在帧 f 的翻转角：0 → −10（预备）→ 194（加速翻转）→ 180（弹簧落定）
const angleAt = (f: number, i: number) => {
  const s = FLIP0 + i * STAGGER;
  if (f < s + PRE) return -10 * ramp(f, s, PRE, EASE.out);
  if (f < s + PRE + FLIP) return mix(-10, PEAK_DEG, ramp(f, s + PRE, FLIP, flipEase));
  return PEAK_DEG - (PEAK_DEG - 180) * springAt(f, s + PRE + FLIP, { damping: 15, stiffness: 190 });
};

type Feature = { name: string; desc: string; value: string; label: string };

// Xuong dong CAN DONG: giu so dong cua wrapLines nhung thu hep be ngang toi da de cac dong dai gan bang nhau (khong mo coi 1 tu)
const balanced = (text: string, family: string, size: number, maxW: number, weight: number, maxLines: number) => {
  const base = wrapLines(text, family, size, maxW, weight, maxLines);
  if (base.length < 2) return base;
  let lo = maxW * 0.4, hi = maxW;
  for (let k = 0; k < 14; k++) {
    const mid = (lo + hi) / 2;
    if (wrapLines(text, family, size, mid, weight, 99).length <= base.length) hi = mid; else lo = mid;
  }
  return wrapLines(text, family, size, hi, weight, maxLines);
};

// Chu troi len tung tu (mat na co dem tren 0.32em / duoi 0.26em: khong cat dau tieng Viet / chan chu g y)
const RiseLine: React.FC<{ text: string; frame: number; start: number; each: number; gap: number; style?: React.CSSProperties }> = ({ text, frame, start, each, gap, style }) => (
  <div style={{ whiteSpace: 'nowrap', ...style }}>
    {text.split(/\s+/).filter(Boolean).map((w, i) => {
      const p = ramp(frame, start + i * gap, each, EASE.snappy);
      return (
        <span key={i} style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', padding: '0.32em 0.04em 0.26em', margin: '-0.32em -0.04em -0.26em', marginRight: '0.22em' }}>
          <span style={{ display: 'inline-block', transform: `translateY(calc(${((1 - p) * 105).toFixed(2)}% + ${((1 - p) * 0.7).toFixed(3)}em))` }}>{w}</span>
        </span>
      );
    })}
  </div>
);

// ───────────── 正面 UI（暗色、大字） ─────────────
const FrontUI: React.FC<{ i: number; frame: number }> = ({ i, frame }) => {
  const ink = L.ink, ink2 = L.ink2, ink3 = L.ink3;
  if (i % 3 === 0) {
    const caret = Math.floor(frame / 9) % 2 === 0;
    return (
      <div style={{ fontSize: 30, lineHeight: 1.42, color: ink2, fontWeight: 450, whiteSpace: 'nowrap' }}>
        <div style={{ color: ink }}>Tóm tắt cuộc họp sáng nay,</div>
        <div style={{ color: ink }}>
          gửi cho cả nhóm<span style={{ display: 'inline-block', width: 3, height: 34, verticalAlign: -6, background: caret ? GOLD : 'transparent', marginLeft: 2 }} />
          <span style={{ color: alpha(ink, 0.32) }}> và</span>
        </div>
        <div style={{ color: alpha(ink, 0.32) }}>nhắc lịch vào thứ Hai.</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 26 }}>
          <div style={{ height: 40, padding: '0 14px', borderRadius: 10, boxShadow: `inset 0 0 0 2px ${alpha(ink, 0.22)}`, display: 'flex', alignItems: 'center', fontFamily: FONT.mono, fontSize: 22, fontWeight: 600, color: ink }}>Tab</div>
          <div style={{ fontSize: 24, color: ink3 }}>để chấp nhận</div>
        </div>
      </div>
    );
  }
  if (i % 3 === 1) {
    return (
      <div style={{ whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {['#8a8f99', '#c9b48a', '#6f7480', '#a8acb4'].map((c, k) => (
            <div key={k} style={{ width: 48, height: 48, borderRadius: 24, background: c, marginLeft: k ? -12 : 0, boxShadow: `0 0 0 3px ${L.surface}` }} />
          ))}
          <div style={{ marginLeft: 16, fontSize: 24, color: ink3 }}>Quy trình · tự động</div>
        </div>
        {['Nhận dữ liệu đầu vào', 'Xử lý trong vài giây', 'Gửi kết quả đúng hạn'].map((t, k) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: k ? 18 : 30 }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: k === 0 ? GOLD : alpha(ink, 0.4) }} />
            <div style={{ fontSize: 30, color: ink, fontWeight: 500 }}>{t}</div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ whiteSpace: 'nowrap' }}>
      <div style={{ height: 70, borderRadius: 18, background: L.surface2, boxShadow: `inset 0 0 0 1.5px ${alpha(ink, 0.12)}`, display: 'flex', alignItems: 'center', gap: 14, padding: '0 22px' }}>
        <svg width={26} height={26} viewBox="0 0 26 26"><circle cx={11} cy={11} r={8} fill="none" stroke={ink2} strokeWidth={2.6} /><path d="M17 17l6 6" stroke={ink2} strokeWidth={2.6} strokeLinecap="round" /></svg>
        <div style={{ fontSize: 30, color: ink, fontWeight: 500 }}>báo cáo tháng</div>
      </div>
      {[['Doanh thu', 'Tệp'], ['Nhân sự', 'Tệp'], ['Kế hoạch quý', 'Mẫu']].map(([t, k2], k) => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: k ? 14 : 26, padding: '0 6px' }}>
          <div style={{ width: 36, height: 44, borderRadius: 7, background: alpha(ink, k === 0 ? 0.9 : 0.16) }} />
          <div style={{ fontSize: 28, color: k === 0 ? ink : ink2, fontWeight: k === 0 ? 650 : 450 }}>{t}</div>
          <div style={{ marginLeft: 'auto', fontSize: 22, color: ink3 }}>{k2}</div>
        </div>
      ))}
    </div>
  );
};

// 受光着色：面偏离正面越多越暗；60–120° 区间一道随角度从左扫到右的窄受光（只在侧棱最薄附近）
const FaceLight: React.FC<{ angle: number; dark: boolean }> = ({ angle, dark }) => {
  const c = Math.abs(Math.cos((angle * Math.PI) / 180));
  const shade = (1 - c) * (dark ? 0.55 : 0.4);
  const band = Math.max(0, 1 - Math.abs(angle - 90) / 34);
  const pos = mix(-20, 120, Math.min(1, Math.max(0, (angle - 56) / 68)));
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: shade }} />
      {band > 0.01 && (
        <div style={{
          position: 'absolute', inset: 0, opacity: band * (dark ? 0.5 : 0.35),
          background: `linear-gradient(100deg, rgba(255,255,255,0) ${pos - 12}%, rgba(255,255,255,0.9) ${pos}%, rgba(255,255,255,0) ${pos + 12}%)`,
        }} />
      )}
    </>
  );
};

type CardGeo = { w: number; h: number; wide: boolean };

const FlipCard: React.FC<{ i: number; frame: number; f: Feature; geo: CardGeo }> = ({ i, frame, f, geo }) => {
  const fonts = useShotFonts();
  const angle = angleAt(frame, i);
  const s = FLIP0 + i * STAGGER;
  const lift = Math.max(0, Math.sin((Math.min(180, Math.max(0, angle)) * Math.PI) / 180));
  const land = s + PRE + FLIP;
  const num = springAt(frame, land - 2, { damping: 18, stiffness: 160 });
  const lab = ramp(frame, land + 2, 14, EASE.snappy);
  const { w: CW, h: CH, wide } = geo;
  const k = CW / 480; // he so phoi canh / do nang theo be ngang the (giu dung ti le cua ban goc)
  const pad = wide ? 60 : 40;
  // —— chu mat truoc
  const nameMax = wide ? 820 : CW - pad * 2;
  const nameSize = fitSize(f.name, { family: fonts.sans, size: wide ? 104 : 52, maxWidth: nameMax, weight: 750, minSize: wide ? 56 : 30 });
  const descSize = wide ? 50 : 28;
  const descLines = f.desc ? balanced(f.desc, fonts.sans, descSize, nameMax, 450, 2) : [];
  // —— chu mat sau
  const valSize = fitSize(f.value, { family: fonts.sans, size: wide ? 300 : 158, maxWidth: CW - pad * 2 - 10, weight: 800, minSize: 60, letterSpacingEm: -0.06 });
  const labSize = wide ? 62 : 34;
  const labLines = balanced(f.label, fonts.sans, labSize, CW - pad * 2, 550, wide ? 2 : 3);
  const labFit = Math.min(...labLines.map((l) => fitSize(l, { family: fonts.sans, size: labSize, maxWidth: CW - pad * 2, weight: 550, minSize: labSize * 0.6 })));
  const capSize = wide ? 34 : 22;
  return (
    <div style={{ position: 'absolute', inset: 0, perspective: 1600 * k }}>
      <div style={{
        position: 'absolute', inset: 0, transformStyle: 'preserve-3d',
        transform: `translateZ(${(lift * 60 * k).toFixed(2)}px) rotateY(${angle.toFixed(3)}deg)`,
      }}>
        {/* 正面：暗色功能卡 */}
        <div style={{
          position: 'absolute', inset: 0, backfaceVisibility: 'hidden', borderRadius: wide ? 48 : 34, overflow: 'hidden',
          background: `linear-gradient(180deg, #1d1e22 0%, ${L.surface} 48%, #111214 100%)`,
          boxShadow: `inset 0 0 0 1.5px ${alpha('#ffffff', 0.09)}, inset 0 2px 0 ${alpha('#ffffff', 0.08)}`,
          fontFamily: FONT.sans,
        }}>
          <div style={{ position: 'absolute', left: pad, top: pad, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontFamily: FONT.mono, fontSize: capSize, fontWeight: 600, color: L.ink3 }}>0{i + 1}</div>
            <div style={{ ...type(capSize, 700, { caps: true }), color: L.ink2, letterSpacing: '0.16em' }}>Tính năng</div>
          </div>
          {wide ? (
            <div style={{ position: 'absolute', right: pad, top: pad, bottom: pad, width: CW - 980, borderRadius: 32, background: alpha('#ffffff', 0.025), boxShadow: `inset 0 0 0 1.5px ${alpha('#ffffff', 0.06)}`, overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: 40, top: 36, transform: `scale(${Math.min(1.5, (CH - pad * 2 - 72) / 280).toFixed(3)})`, transformOrigin: '0 0' }}>
                <FrontUI i={i} frame={frame} />
              </div>
            </div>
          ) : (
            <div style={{ position: 'absolute', left: 40, right: 40, top: 112, overflow: 'hidden', paddingBottom: 8 }}>
              <FrontUI i={i} frame={frame} />
            </div>
          )}
          <div style={{ position: 'absolute', left: pad, width: nameMax, bottom: pad }}>
            <div style={{ fontFamily: fonts.sans, fontSize: nameSize, fontWeight: 750, letterSpacing: '-0.03em', lineHeight: 1.12, color: L.ink, whiteSpace: 'nowrap' }}>{f.name}</div>
            {descLines.map((l, j) => (
              <div key={j} style={{ fontFamily: fonts.sans, fontSize: descSize, fontWeight: 450, lineHeight: 1.25, color: L.ink2, marginTop: j ? 0 : wide ? 14 : 10, whiteSpace: 'nowrap' }}>{l}</div>
            ))}
          </div>
          <FaceLight angle={angle} dark />
        </div>
        {/* 背面：瓷白结论卡 */}
        <div style={{
          position: 'absolute', inset: 0, backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', borderRadius: wide ? 48 : 34, overflow: 'hidden',
          background: 'linear-gradient(180deg, #fbfaf7 0%, #f1f0ec 100%)',
          boxShadow: `inset 0 0 0 1.5px rgba(0,0,0,0.06), inset 0 2px 0 rgba(255,255,255,0.9)`,
          fontFamily: FONT.sans, color: '#0d0d0f',
        }}>
          <div style={{ position: 'absolute', left: pad, right: pad, top: pad, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: capSize * 0.55, height: capSize * 0.55, borderRadius: capSize, background: '#b8925a', flex: 'none' }} />
            <div style={{ fontFamily: fonts.sans, fontSize: fitSize(f.name.toUpperCase(), { family: fonts.sans, size: capSize, maxWidth: CW - pad * 2 - 40, weight: 700, letterSpacingEm: 0.16, minSize: 16 }), fontWeight: 700, letterSpacing: '0.16em', color: '#6b6a66', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>{f.name}</div>
          </div>
          {/* 后景：金色细线从左画出（落定时） */}
          <div style={{ position: 'absolute', left: pad, top: pad + capSize * 1.9, width: (CW - pad * 2) * 0.22, height: 3, background: '#b8925a', transform: `scaleX(${lab.toFixed(4)})`, transformOrigin: '0 50%', opacity: 0.8 }} />
          <div style={{ position: 'absolute', left: pad - 4, right: pad - 10, bottom: pad + labLines.length * labFit * 1.22 + (wide ? 34 : 20) }}>
            <div style={{
              fontFamily: fonts.sans, fontSize: valSize, fontWeight: 800, letterSpacing: '-0.06em', lineHeight: 1, color: '#0d0d0f', whiteSpace: 'nowrap',
              fontVariantNumeric: 'tabular-nums', transform: `scale(${mix(1.08, 1, num).toFixed(4)})`, transformOrigin: 'left bottom',
            }}>{f.value}</div>
          </div>
          <div style={{
            position: 'absolute', left: pad, right: pad, bottom: pad, fontFamily: fonts.sans, fontSize: labFit, fontWeight: 550, lineHeight: 1.22, color: '#3d3c39',
            opacity: lab, transform: `translateY(${((1 - lab) * 14).toFixed(2)}px)`,
          }}>{labLines.map((l, j) => <div key={j} style={{ whiteSpace: 'nowrap' }}>{l}</div>)}</div>
          <FaceLight angle={180 - angle} dark={false} />
        </div>
      </div>
    </div>
  );
};

export const CardFlipReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const kicker = useText('kicker', 'KẾT QUẢ SAU BA THÁNG');
  const title = useText('title', 'Ba tính năng. Ba kết quả.');
  const names = useList('names', ['Trợ lý AI', 'Quy trình tự động', 'Tìm kiếm nhanh']);
  const descs = useList('descs', ['Gõ một câu, ra ngay bản nháp.', 'Việc lặp lại, máy tự làm.', 'Mọi tài liệu, tìm là thấy.']);
  const values = useList('values', ['3,2×', '−41%', '0,2s']);
  const labels = useList('labels', ['nhanh hơn ở bản đầu tiên', 'thời gian làm thủ công', 'để tìm đúng thứ cần']);
  const n = Math.max(2, Math.min(3, Math.max(values.length, names.length)));
  const feats: Feature[] = Array.from({ length: n }, (_, i) => ({
    name: names[i] ?? names[names.length - 1] ?? '',
    desc: descs[i] ?? '',
    value: values[i] ?? values[values.length - 1] ?? '',
    label: labels[i] ?? '',
  }));
  const push = 1 + 0.03 * ramp(frame, 0, 150, EASE.smooth);
  const kickText = `${BRAND.name ? `${BRAND.name} · ` : ''}${kicker}`.trim();

  // —— bo cuc
  const M = portrait ? 140 : 192; // le trai
  const titleW = 1920 - M * 2;
  // khung ngang: 1 dong 84px; dai hon -> 2 dong 68px (hang the tu ha xuong)
  const titleSize0 = portrait ? 150 : wrapLines(title, fonts.sans, 84, titleW, 760, 9).length > 1 ? 68 : 84;
  const tLines = balanced(title, fonts.sans, titleSize0, titleW, 760, portrait ? 3 : 2);
  const titleSize = Math.min(...tLines.map((l) => fitSize(l, { family: fonts.sans, size: titleSize0, maxWidth: titleW, weight: 760, minSize: titleSize0 * 0.5 })));
  const kickSize0 = portrait ? 40 : 26;
  const kickSize = kickText ? fitSize(kickText.toUpperCase(), { family: fonts.sans, size: kickSize0, maxWidth: titleW, weight: 700, letterSpacingEm: 0.18, minSize: kickSize0 * 0.6 }) : 0;
  const lineH = titleSize * 1.14;
  let geo: CardGeo, xs: number[], ys: number[], titleTop: number;
  if (portrait) {
    const cw = 1920 - M * 2;
    const gap = 70;
    const headH = (kickText ? kickSize * 1.6 + 26 : 0) + tLines.length * lineH;
    const avail = SH - 260 - 300; // vung giua (tren: an toan khung doc, duoi: mat san phan chieu)
    const ch = Math.min(900, Math.floor((avail - headH - 110 - gap * (n - 1)) / n));
    const blockH = headH + 110 + n * ch + (n - 1) * gap;
    titleTop = Math.round(260 + Math.max(0, (avail - blockH) / 2));
    const y0 = titleTop + headH + 110;
    geo = { w: cw, h: ch, wide: true };
    xs = feats.map(() => M);
    ys = feats.map((_, i) => y0 + i * (ch + gap));
  } else {
    const CW = 480, GAP = 48;
    const X0 = (1920 - (CW * n + GAP * (n - 1))) / 2;
    titleTop = tLines.length > 1 ? 96 : 118;
    const headBottom = titleTop + (kickText ? kickSize * 1.3 + 18 : 0) + tLines.length * lineH;
    const Y = Math.max(330, Math.round(headBottom + 44));
    geo = { w: CW, h: 620 - Math.round((Y - 330) * 0.7), wide: false };
    xs = feats.map((_, i) => X0 + i * (CW + GAP));
    ys = feats.map(() => Y);
  }
  const titleX = portrait ? M : xs[0];
  const lastY = ys[n - 1] + geo.h;
  // [Agent Edit] nen anh AI: Stage tu bo nen; bo them dai mat san phan chieu; tieu de co bong nhe
  const bd = useBackdrop();
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Stage look={L} keyLight={{ x: 0.5, y: -0.05 }} fill={{ x: 0.5, y: 1.1 }} horizon={portrait ? lastY / SH : 0.88} intensity={0.9} />
      {/* 镜面地板：地平线以下略亮的反射面 */}
      {!bd && <div style={{
        position: 'absolute', left: 0, right: 0, top: lastY, height: SH - lastY,
        background: `linear-gradient(180deg, ${alpha('#ffffff', 0.035)} 0%, ${alpha('#ffffff', 0)} 60%)`,
        borderTop: `1px solid ${alpha('#ffffff', 0.06)}`,
      }} />}
      <AbsoluteFill style={{ transform: `scale(${push.toFixed(4)})`, transformOrigin: '50% 60%' }}>
        {/* 标题 */}
        <div style={{ position: 'absolute', left: titleX, top: titleTop, fontFamily: FONT.sans, textShadow: bd ? (bd.dark ? '0 2px 18px rgba(0,0,0,0.55)' : '0 1px 12px rgba(255,255,255,0.7)') : undefined }}>
          {kickText ? (
            <div style={{ fontFamily: fonts.sans, fontSize: kickSize, fontWeight: 700, color: GOLD, letterSpacing: '0.18em', textTransform: 'uppercase', lineHeight: 1.3 }}>
              <TextReveal text={kickText} by="word" variant="blur" start={0} each={14} gap={2} />
            </div>
          ) : null}
          <div style={{ fontFamily: fonts.sans, fontSize: titleSize, fontWeight: 760, letterSpacing: '-0.03em', lineHeight: 1.14, color: L.ink, marginTop: kickText ? (portrait ? 26 : 18) : 0 }}>
            {tLines.map((l, li) => {
              const before = tLines.slice(0, li).join(' ').split(/\s+/).filter(Boolean).length;
              const nw = Math.max(1, title.split(/\s+/).filter(Boolean).length);
              const g = Math.min(2.5, 14 / nw);
              return <RiseLine key={li} text={l} frame={frame} start={2 + before * g} each={18} gap={g} />;
            })}
          </div>
        </div>
        {feats.map((f, i) => (
          <React.Fragment key={i}>
            {/* 倒影：同一张卡竖直镜像，遮罩渐隐（khung doc: chi the cuoi dung tren mat san） */}
            {(!portrait || i === n - 1) && (
              <div style={{
                position: 'absolute', left: xs[i], top: ys[i] + geo.h + 6, width: geo.w, height: geo.h,
                transform: 'scaleY(-1)', transformOrigin: 'center', opacity: 0.22,
                WebkitMaskImage: 'linear-gradient(0deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 26%)',
                maskImage: 'linear-gradient(0deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 26%)',
              }}>
                <FlipCard i={i} frame={frame} f={f} geo={geo} />
              </div>
            )}
            {/* 接地影 */}
            <div style={{
              position: 'absolute', left: xs[i] + 30, width: geo.w - 60, top: ys[i] + geo.h - 18, height: portrait ? 44 : 36, borderRadius: '50%',
              background: 'radial-gradient(ellipse 50% 50% at 50% 50%, rgba(0,0,0,0.7), rgba(0,0,0,0) 70%)',
              transform: `scaleX(${Math.max(0.12, Math.abs(Math.cos((angleAt(frame, i) * Math.PI) / 180))).toFixed(3)})`,
            }} />
            <div style={{ position: 'absolute', left: xs[i], top: ys[i], width: geo.w, height: geo.h }}>
              <FlipCard i={i} frame={frame} f={f} geo={geo} />
            </div>
          </React.Fragment>
        ))}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
