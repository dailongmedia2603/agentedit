// brand-ink-open —— 墨线十字准星描画 → 字标逐字 letterpress → 打字机副标
// → 满一秒静止 → 上浮消散。品牌开场第一拍：任何产品画面出现前先立名号。
// 参考实现从 template SceneOpen 帧 0–83 段剥离，self-contained：
// 十字准星 SVG pathLength dashoffset 描画后淡出；字标逐字从大 scale 压到 1 +
// blur→0（入场三件套定式），字底强调色 glint 短划闪过；kicker mono 打字机
// 逐字符 + 强调色块光标周期闪；46–76f 整整 1s 静止 hold；退场 7f 上浮+缩+淡。
// 品牌名/副标/强调色可换成目标品牌。demo 立的是 video-shotcraft：字标全小写（保留纸墨 letterpress 的衬线字），副标打品牌短句。
//
// [Agent Edit] o chu: name (ten thuong hieu / san pham / kenh — khong co thi lay ten thuong hieu cua video) / kicker
// (dong phu go may chu). Ten dai: nhip ep tung chu nen lai de chu cuoi xong truoc khung 64; co chu vua be ngang, khung doc
// to hon va xuong toi da 2 dong. Kicker go theo ky tu (NFC, khong tach dau), in hoa chi khi ngan.
import { useBackdrop, useCurrentFrame, useVideoConfig, useText, useBrand, useShotFonts, fitSize, wrapLines } from '../../../runtime';
import { AbsoluteFill, interpolate, Easing } from 'remotion';
import { BRAND } from '../../../fixtures/Brand';

export const BRAND_INK_OPEN_DURATION = 104;

const INK = 'oklch(18% 0.006 82)';
const INK2 = 'oklch(50% 0.006 82)';

export const BrandInkOpen: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const portrait = SH > 1080 * 1.2;
  const fonts = useShotFonts();
  const bd = useBackdrop(); // [Agent Edit] nen anh AI: bo nen giay tu ve, chu co bong sang nhe
  const SERIF = fonts.serif;
  const MONO = fonts.mono;
  const AMBER = BRAND.amber;
  const brand = useBrand();
  const WORDMARK = useText('name', brand?.name || 'Góc Sáng Tạo').normalize('NFC').trim();
  const kickRaw = useText('kicker', 'Kể chuyện bằng hình ảnh').normalize('NFC').trim();
  const kickCaps = Array.from(kickRaw).length <= 28;
  const KICKER = kickCaps ? kickRaw.toUpperCase() : kickRaw;

  // --- 字标排版：横版 132px 一行；竖版放大到 230px、最多两行；每行缩到画面安全宽内 ---
  const W = portrait ? 1640 : 1680;
  const base = portrait ? 230 : 132;
  const markLines = portrait ? wrapLines(WORDMARK, SERIF, base, W, 600, 2) : [WORDMARK];
  const markSize = Math.min(...markLines.map((l) => fitSize(l, { family: SERIF, size: base, maxWidth: W, weight: 600, minSize: base * 0.4, letterSpacingEm: -0.01 })));
  const glyphCount = markLines.reduce((a, l) => a + Array.from(l).length, 0);
  // 原版 3f/字（15 字 → 末字 64f 落定）；长名字压缩字距节奏，保证末字仍在 64f 前落定
  const step = Math.min(3, 42 / Math.max(1, glyphCount - 1));
  // kicker：横版 26px 一行（缩到宽内），竖版 58px、可折两行
  const kBase = portrait ? 58 : 26;
  const kW = portrait ? 1600 : 1640;
  const kWrap = portrait ? wrapLines(KICKER, MONO, kBase, kW / (1 + 0.14 * (kickCaps ? 1 : 0.4)), 400, 2) : [KICKER];
  // hai dong: chia can theo so ky tu (tranh mot tu mo coi o dong 2)
  const kLines = kWrap.length < 2 ? kWrap : (() => {
    const ws = KICKER.split(/\s+/);
    let best = 1, bd = 1e9;
    for (let j = 1; j < ws.length; j++) {
      const d = Math.abs(ws.slice(0, j).join(' ').length - ws.slice(j).join(' ').length);
      if (d < bd) { bd = d; best = j; }
    }
    return [ws.slice(0, best).join(' '), ws.slice(best).join(' ')];
  })();
  const kSize = Math.min(...kLines.map((l) => fitSize(l, { family: MONO, size: kBase, maxWidth: kW, weight: 400, minSize: kBase * 0.55, letterSpacingEm: kickCaps ? 0.14 : 0.05 })));

  // --- crosshair draw-on (SVG pathLength = 100): vertical 0→9f, horizontal
  // 8→18f, then fades 24→34f so it doesn't fight the wordmark ---
  const vDraw = interpolate(frame, [0, 9], [100, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.3, 0, 0.2, 1),
  });
  const hDraw = interpolate(frame, [8, 18], [100, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.linear,
  });
  const crossFade = interpolate(frame, [24, 34], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // --- kicker typewriter (28 → ~43), 0.7 frames per char (decorative small
  // text only — real interaction typing should be 3f/char, see type-and-filter) ---
  const kickLen = kLines.reduce((a, l) => a + Array.from(l).length, 0);
  const perChar = Math.min(0.7, 30 / Math.max(1, kickLen)); // 长副标也在 ~58f 前打完
  const kickStart = 28;
  const kickChars = Math.floor(Math.max(0, frame - kickStart) / perChar);
  const kickDone = kickStart + kickLen * perChar;
  const cursorOn = (() => {
    if (frame < kickStart) return false;
    if (frame < kickDone) return true;
    if (frame > 95) return false;
    const b = frame - kickDone;
    return Math.floor(b / 2) % 2 === 0;
  })();

  // --- brand group rests fully-on for ~1s (wordmark completes ≤64f), then dissolves out (97 → 104): lift +
  // shrink + fade. ---
  const brandOut = interpolate(frame, [97, 104], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.4, 0, 0.5, 1),
  });
  const brandOpacity = 1 - brandOut;
  const groupY = -brandOut * (portrait ? 64 : 40);
  const groupScale = 1 - brandOut * 0.12;
  const k = portrait ? 1.7 : 1; // 准星 / 间距随竖版放大

  let gi = 0;
  let ci = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: bd ? 'transparent' : '#faf7f2', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ textAlign: 'center', opacity: brandOpacity, transform: `translateY(${groupY}px) scale(${groupScale})`, textShadow: bd ? '0 1px 12px rgba(255,255,255,0.7)' : undefined }}>
        {/* crosshair drawn by an invisible amber pen */}
        <svg width={64 * k} height={64 * k} viewBox="0 0 64 64" style={{ display: 'block', margin: `0 auto ${34 * k}px`, opacity: crossFade }}>
          <line
            x1={32} y1={2} x2={32} y2={62}
            stroke={AMBER} strokeWidth={5} strokeLinecap="round"
            pathLength={100} strokeDasharray={100} strokeDashoffset={vDraw}
          />
          <line
            x1={2} y1={32} x2={62} y2={32}
            stroke={AMBER} strokeWidth={5} strokeLinecap="round"
            pathLength={100} strokeDasharray={100} strokeDashoffset={hDraw}
          />
        </svg>

        {/* wordmark: glyph-by-glyph letterpress with amber under-glint */}
        {markLines.map((line, li) => (
          <div
            key={li}
            style={{
              fontFamily: SERIF, fontSize: markSize, fontWeight: 600, color: INK,
              letterSpacing: '-0.01em', lineHeight: 1, whiteSpace: 'pre',
              display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
              // dau tieng Viet chong tang: chua khoang tren moi dong
              paddingTop: markSize * (li === 0 ? 0.3 : 0.18), paddingBottom: markSize * 0.08,
            }}
          >
            {Array.from(line).map((ch, i) => {
              const delay = 10 + (gi++) * step;
              const t = interpolate(frame, [delay, delay + 12], [0, 1], {
                extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.2, 0.7, 0.25, 1),
              });
              const glintCenter = delay + 12;
              const glint = interpolate(frame, [glintCenter - 4, glintCenter, glintCenter + 4], [0, 1, 0], {
                extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
              });
              return (
                <span
                  key={i}
                  style={{
                    position: 'relative', display: 'inline-block', opacity: t,
                    transform: `scale(${1.6 - 0.6 * t})`, transformOrigin: 'center bottom',
                    filter: t >= 0.999 ? undefined : `blur(${(1 - t) * 6}px)`,
                  }}
                >
                  {ch === ' ' ? ' ' : ch}
                  <span
                    style={{
                      position: 'absolute', left: '50%', bottom: -6 * (markSize / 132), transform: 'translateX(-50%)',
                      width: `${glint * 100}%`, height: 2 * Math.max(1, markSize / 132), background: AMBER, opacity: glint, borderRadius: 2,
                    }}
                  />
                </span>
              );
            })}
          </div>
        ))}

        {/* mono kicker typewriter + amber block cursor */}
        {KICKER ? (
          <div style={{ marginTop: 30 * k }}>
            {kLines.map((line, li) => {
              const chars = Array.from(line);
              const shown = Math.max(0, Math.min(chars.length, kickChars - ci));
              const isCursorLine = kickChars - ci >= 0 && (kickChars - ci < chars.length || li === kLines.length - 1);
              ci += chars.length;
              return (
                <div
                  key={li}
                  style={{
                    fontFamily: MONO, fontSize: kSize, letterSpacing: kickCaps ? '0.14em' : '0.05em', color: INK2,
                    height: kSize * 1.5, display: 'flex', justifyContent: 'center', alignItems: 'center',
                  }}
                >
                  <span style={{ whiteSpace: 'pre', visibility: 'hidden', width: 0, overflow: 'hidden' }}>{line}</span>
                  <span style={{ whiteSpace: 'pre' }}>{chars.slice(0, shown).join('')}</span>
                  <span
                    style={{
                      display: 'inline-block', width: kSize * 0.54, height: kSize * 0.92, marginLeft: 4,
                      background: AMBER, opacity: cursorOn && isCursorLine ? 0.85 : 0,
                    }}
                  />
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
