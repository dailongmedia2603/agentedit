// logo-shrink-wordmark-lockup — Shrink & Lockup 图标收束落位（motion-lab 定稿转原生 Remotion）
// 霓虹切口大环 easeInOut 快速缩成中央实心小白 O，末尾过冲刹车的那一下换成 video-shotcraft「镜刻」标志，
// 随后图标左移让位，字标 video-shotcraft 的字母从左到右逐个 opacity+8px 滑入完成 lockup，
// 强调色标语延迟整行淡入收尾。设计坐标 480×270（DesignStage 等比放大，zoom 栅格化保字边锐利）。
// 质感升级：背景换带色相的深场 + 随大环收束一起坍缩的紫色能量光晕；收束途中双弧边转边缩
// （减速旋转 150°），高速段拖两层缩放残影当运动模糊；落位刹车瞬间放一圈细冲击波（只一次）；
// 字母滑入带 2.5px→0 的对焦模糊；标语改成与霓虹同族的冷紫，不再是撞色的红。
//
// [Agent Edit] Thuong hieu la TRUNG TAM: o chu `name` (ten kenh / san pham trong loi noi; khong co -> ten thuong hieu
// cua video) + `tagline` (khau hieu). Dau hieu: logo that cua video (ShotcraftMark) hoac khung bo goc + chu viet tat
// cua ten. Ten dai ngan bat ky: do be ngang that -> SHIFT / ROW_LEFT / nhip chu tinh lai theo ten; qua dai -> thu nho chu.
// Khau hieu ngan (<= 28 ky tu) in hoa gian rong nhu goc; dai hon -> chu thuong, tu xuong 2 dong.
// Khung doc (portrait.mode = 'native'): toa do thiet ke phong to 1.6 lan (lockup to hon), ca khoi can giua chieu cao that.
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { useBrand, useShotFonts, useText, useVideoConfig, fitSize, measureText, wrapLines } from '../../../runtime';
import { E, lerp, seg, useT } from '../../../fixtures/Motion';
import { Grain, Vignette } from '../../../fixtures/Polish';
import { ShotcraftMark } from '../../../fixtures/Brand';

export const LOGO_SHRINK_WORDMARK_LOCKUP_DURATION = 132; // 4400ms @30fps

const ACCENT = '#9d94ff'; // 标语强调色：与霓虹晕同色相、提亮降饱和
const ICON = 30; // 图标基准尺寸(px)
const MARK = 32; // 标志尺寸：取景框实体 ≈ 0.81×MARK ≈ 26px，正好盖住愈合后的环
const GAP = 9; // 图标与字标间距
const DT = 1 / 131; // 一帧对应的 t 增量（132f）

// [Agent Edit] dau hieu khi KHONG co logo anh: khung bo goc trang + chu viet tat cua ten (cung kich thuoc ShotcraftMark)
const InitialsMark: React.FC<{ size: number; name: string; family: string; style?: React.CSSProperties }> = ({ size, name, family, style }) => {
  const initials = name.trim() ? Array.from(name.trim().split(/\s+/).slice(0, 2).map((w) => Array.from(w)[0]).join('').toUpperCase()).join('') : '';
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" style={{ display: 'block', overflow: 'visible', ...style }}>
      <rect x={14} y={14} width={100} height={100} rx={26} fill="none" stroke="#F5F3EE" strokeWidth={12} />
      {initials ? (
        <text x={64} y={66} textAnchor="middle" dominantBaseline="central" style={{ fontFamily: family, fontWeight: 800, fontSize: Array.from(initials).length > 1 ? 46 : 58 }} fill={ACCENT}>{initials}</text>
      ) : (
        <circle cx={64} cy={64} r={18} fill={ACCENT} />
      )}
    </svg>
  );
};

// 圆弧 path（角度制，顺时针 sweep）
const arcPath = (cx: number, cy: number, r: number, a0: number, a1: number) => {
  const p = (a: number) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
};

// 双弧组：a0-a1 与其对角（+180°）两段圆弧 —— 带缺口的切口环
const Arcs: React.FC<{ a0: number; a1: number; col: string; w: number; blur: number; opacity: number; stroke?: string }> = ({
  a0,
  a1,
  col,
  w,
  blur,
  opacity,
  stroke,
}) => (
  <g opacity={opacity}>
    {[
      [a0, a1],
      [a0 + 180, a1 + 180],
    ].map(([b0, b1], i) => (
      <path
        key={i}
        d={arcPath(15, 15, 10.5, b0, b1)}
        fill="none"
        stroke={stroke ?? col}
        strokeWidth={w}
        strokeLinecap="round"
        style={blur ? { filter: `blur(${blur}px)` } : undefined}
      />
    ))}
  </g>
);

// 收束主曲线：scale 5.4→1（easeInOut），末尾轻微 1.06 过冲刹车
const scaleAt = (t: number) => {
  const k = seg(t, 0.02, 0.28, E.inOutCubic);
  const brake = Math.sin(seg(t, 0.26, 0.37) * Math.PI) * 0.06;
  return lerp(k, 5.4, 1) * (1 + brake);
};
// 收束途中的自转：减速转 150°（缺口在缩小中"拧紧"），愈合后肉眼不可见
const spinAt = (t: number) => -150 * seg(t, 0.0, 0.3, E.outCubic);

export const LogoShrinkWordmarkLockup: React.FC = () => {
  const t = useT();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const brand = useBrand();
  const portrait = SH > 1080 * 1.2;
  // ten: o chu `name` > ten thuong hieu cua video > chu mau
  const nameSlot = useText('name', '');
  const WORDMARK = (nameSlot.trim() || brand?.name?.trim() || 'Góc Công Nghệ').normalize('NFC');
  const tagline = useText('tagline', 'Mỗi ngày một mẹo hay').trim();
  // toa do thiet ke: ngang 480 x 270 (x4); doc: be ngang thiet ke 480/1.6 (lockup to hon 1.6 lan), cao theo khung that
  const DW = portrait ? 480 / 1.6 : 480;
  const Z = 1920 / DW;
  const DH = SH / Z;
  // do be ngang that cua ten (22px / 700, gian +0.03em) — qua rong thi thu nho chu
  const maxWord = DW - 36 - ICON - GAP;
  const WSIZE = fitSize(WORDMARK, { family: fonts.sans, size: 22, maxWidth: maxWord, weight: 700, minSize: 11, letterSpacingEm: 0.03 });
  const WORD_W = measureText(WORDMARK, fonts.sans, WSIZE, 700) + Array.from(WORDMARK).length * WSIZE * 0.03;
  // 图标 lockup 左位偏移与字母行左缘耦合：整组（图标 + 间距 + 字标）在画面居中
  const SHIFT = -(ICON + GAP + WORD_W) / 2 + ICON / 2;
  const ROW_LEFT = SHIFT + ICON / 2 + GAP; // 字母行左缘相对画面中线
  const chars = Array.from(WORDMARK);
  const STAGGER = (0.7 - 0.46) / Math.max(1, chars.length); // 字多：按 (0.7-0.46)/n 反算间隔，保证 0.7 前全部起跑
  // khau hieu: ngan -> in hoa gian rong (nhu goc); dai -> chu thuong, <= 2 dong
  const capsTag = Array.from(tagline).length <= 28;
  const tagText = capsTag ? tagline.toUpperCase() : tagline;
  const tagTrack = capsTag ? 2.6 : 0.3;
  const tagMaxW = DW - 40;
  const TAG0 = capsTag ? 12.5 : 14;
  const tagLines = capsTag ? [tagText] : wrapLines(tagText, fonts.sans, TAG0, tagMaxW, 600, 2);
  const tagSize = Math.min(...tagLines.map((l) => fitSize(l, { family: fonts.sans, size: TAG0, maxWidth: tagMaxW, weight: 600, minSize: 8, letterSpacingEm: tagTrack / TAG0 })));
  const s = scaleAt(t);
  const spin = spinAt(t);
  // 左移让位：落位后 t 0.34-0.47
  const shift = seg(t, 0.34, 0.47, E.inOutCubic) * SHIFT;
  // 霓虹缺口态 → 实心白 O 交叉淡化（随收束进行）
  const heal = seg(t, 0.10, 0.28, E.inOutQuad);
  // 白 O → video-shotcraft 标志：落位刹车那一下（与冲击波同拍）交叉换成标志，换标时已缩到最终尺寸
  const markIn = seg(t, 0.24, 0.32, E.inOutQuad);
  // 缩放残影：按每帧缩放量给强度，静止时为 0
  const ds = Math.abs(scaleAt(t) - scaleAt(t - DT));
  const trail = Math.min(1, ds / 0.35);
  // 冲击波：刹车回弹的那一下（t≈0.28）放一圈细环，扩散并消散
  const wave = seg(t, 0.28, 0.46, E.outCubic);
  // 能量光晕：开场罩住大环，随收束一起坍缩变小、落位后回落成图标背后的微光
  const haloR = lerp(seg(t, 0.02, 0.3, E.inOutCubic), 150, 34);
  const haloA = 0.5 - 0.32 * seg(t, 0.3, 0.5, E.outCubic);

  // 外层只负责位移 + 缩放；环在内层旋转——标志本身始终不旋转（品牌规范：斜切角度不变）
  const icon = (sc: number, rot: number, opacity: number, ghost = false) => (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: ICON,
        height: ICON,
        margin: `${-ICON / 2}px 0 0 ${-ICON / 2}px`,
        transform: `translateX(${shift}px) scale(${sc})`,
        opacity,
      }}
    >
      <svg viewBox="0 0 30 30" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', transform: `rotate(${rot}deg)` }}>
        {/* 霓虹晕（带缺口） */}
        <Arcs a0={-32} a1={122} col="rgba(118,96,255,.62)" w={6.5} blur={2.5} opacity={1 - heal} />
        {/* 霓虹芯：heal 过半后转纯白 */}
        {!ghost && (
          <Arcs a0={-32} a1={122} col="#dfe9ff" w={3.4} blur={0} opacity={(1 - heal * 0.75) * (1 - markIn)} stroke={heal > 0.5 ? '#fff' : '#dfe9ff'} />
        )}
        {/* 愈合后的实心白 O（过渡态，刹车时让给标志） */}
        {!ghost && <circle cx={15} cy={15} r={10.5} fill="none" stroke="#fff" strokeWidth={5.5} opacity={heal * (1 - markIn)} />}
      </svg>
      {/* 愈合后的标准态：品牌标志（logo 实图 / 首字母框，反白版，无发光） */}
      {!ghost && markIn > 0 && (brand?.logo ? (
        <ShotcraftMark size={MARK} tone="dark" style={{ position: 'absolute', left: (ICON - MARK) / 2, top: (ICON - MARK) / 2, opacity: markIn }} />
      ) : (
        <InitialsMark size={MARK} name={WORDMARK} family={fonts.sans} style={{ position: 'absolute', left: (ICON - MARK) / 2, top: (ICON - MARK) / 2, opacity: markIn }} />
      ))}
    </div>
  );

  // 底色标定：原样片 mp4（yuv420p，无色彩元数据）把 #05060a 解码回 rgb(3,5,9)；此处改用带色相的深场
  return (
    <AbsoluteFill style={{ background: '#06070c' }}>
    <div style={{ position: 'absolute', left: 0, top: 0, width: DW, height: DH, overflow: 'hidden', zoom: Z }}>
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        {/* 深场：顶部略亮的冷色纵向渐变 */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, #0d0f17 0%, #07080d 60%, #05060a 100%)' }} />
        {/* 能量光晕（随大环坍缩） */}
        <div
          style={{
            position: 'absolute',
            left: `calc(50% + ${shift}px - ${haloR}px)`,
            top: `calc(50% - ${haloR}px)`,
            width: haloR * 2,
            height: haloR * 2,
            borderRadius: '50%',
            opacity: haloA,
            background: 'radial-gradient(circle, rgba(110,92,255,0.42) 0%, rgba(110,92,255,0.12) 38%, rgba(110,92,255,0) 70%)',
          }}
        />
        {/* 冲击波：细亮环 + 外圈柔光，扩散时变细变淡 */}
        {wave > 0 && wave < 1 && (
          <div
            style={{
              position: 'absolute',
              left: `calc(50% - ${lerp(wave, 16, 70)}px)`,
              top: `calc(50% - ${lerp(wave, 16, 70)}px)`,
              width: lerp(wave, 32, 140),
              height: lerp(wave, 32, 140),
              borderRadius: '50%',
              boxSizing: 'border-box',
              border: `${lerp(wave, 0.9, 0.25)}px solid rgba(214,220,255,${(0.55 * (1 - wave)).toFixed(3)})`,
              boxShadow: `0 0 ${lerp(wave, 4, 10)}px rgba(130,112,255,${(0.45 * (1 - wave)).toFixed(3)})`,
            }}
          />
        )}
        {/* 缩放残影（只在高速段出现）：上 1f、上 2f 的尺度与角度 */}
        {trail > 0.02 && icon(scaleAt(t - 2 * DT), spinAt(t - 2 * DT), 0.16 * trail, true)}
        {trail > 0.02 && icon(scaleAt(t - DT), spinAt(t - DT), 0.3 * trail, true)}
        {/* 图标：SVG 双弧切口环（演出态）→ 收束时缺口愈合、交叉淡入 video-shotcraft 标志（标准态） */}
        {icon(s, spin, 1)}
        {/* 字母行（图标右侧）：从左到右 stagger，opacity 0→1 + translateX 8px→0 + 对焦模糊 */}
        <div
          style={{
            position: 'absolute',
            left: `calc(50% + ${ROW_LEFT}px)`,
            top: '50%',
            height: ICON,
            marginTop: -ICON / 2,
            display: 'flex',
            alignItems: 'center',
            gap: 0,
          }}
        >
          {chars.map((ch, i) => {
            const lk = seg(t, 0.46 + i * STAGGER, 0.46 + i * STAGGER + 0.10, E.outCubic);
            return (
              <span
                key={i}
                style={{
                  color: '#f3f5fb',
                  font: `700 ${WSIZE}px/1.3 ${fonts.sans}`,
                  letterSpacing: WSIZE * 0.03, // 字标 +0.03em
                  whiteSpace: 'pre',
                  opacity: lk,
                  transform: `translateX(${lerp(lk, 8, 0)}px)`,
                  filter: lk < 0.999 ? `blur(${lerp(lk, 2.5, 0).toFixed(2)}px)` : undefined,
                  textShadow: '0 0 12px rgba(150,140,255,0.18)',
                }}
              >
                {ch}
              </span>
            );
          })}
        </div>
        {/* 强调色标语（品牌短句 motto）：延迟整行淡入，同时上移 3px 落座 */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 'calc(50% + 32px)',
            textAlign: 'center',
            color: ACCENT,
            font: `600 ${tagSize}px/1.35 ${fonts.sans}`,
            letterSpacing: tagTrack, // 29 字符：字距 4.6→2.6，宽度与 lockup 相称
            padding: '0 20px',
            opacity: seg(t, 0.72, 0.84, E.outQuad),
            transform: `translateY(${lerp(seg(t, 0.72, 0.86, E.outCubic), 3, 0)}px)`,
          }}
        >
          {tagLines.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      </div>
    </div>
    {/* 暗角与颗粒放在设计坐标外，按 1920 原生像素铺，颗粒不被 zoom 放大成色块 */}
    <Vignette strength={0.55} inner={0.4} color="#000000" />
    <Grain opacity={0.07} blend="soft-light" />
    </AbsoluteFill>
  );
};
