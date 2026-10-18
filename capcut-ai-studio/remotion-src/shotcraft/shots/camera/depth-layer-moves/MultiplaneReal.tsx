// multiplane parallax（第二轮重设计）——真实页面拆 3 层深度横移：同一条 drive 位移乘各层系数
// （远 0.35x / 中 0.7x / 近 1.4x），速度梯度把一次横移变成"在空间里滑过"。
//
// 设计决定
// - look：sand（米色 + 赤陶，温暖、纸感）。这一镜像一组产品静物在暖光桌面上被滑轨相机掠过，而不是网页平移。
// - 三层各给齐深度锚：
//   远景：整张背景图放大、退焦 5px、降饱和、上浓下淡的暖色空气薄雾（退成环境）；
//   中景：一排卡片（主阅读层，绝对清晰，两层暖色软影落在"桌面"上）；
//   近景：几枚放大的赤陶 / 墨色标签胶囊掠过镜头，景深虚化 + 按速度横向拖影。
// - 固定在画框上的字（0x 层）：左上眉题 + 120px 标题 + 副句，是全片的静止参照——字不动、世界在动，视差反而更好读。
// - 滑轨有终点：drive 落定时主角卡恰好停在画面中央，随后浮起（elevation 6→26、1.035x）+ 赤陶描边 + 角标，尾帧是一张完整海报。
//
// 时间表（30fps，165f）
//   0–6     起手：三层已在画面、标题开始逐词升起（第 1 帧不是空画面）
//   6–136   滑轨 130f：不对称 in-out（起步柔、中段匀、落位很软）
//   4–40    标题：眉题字距收拢（4）→ 标题逐词升起（8）→ 副句（26）
//   122–144 主角浮起：抬升 + 描边 + 角标（out 曲线，晚于位置收敛 ~8f）
//   144–164 hold 20f：远景极缓漂移，画面活着
//
// [Agent Edit] Anh THAT ti le bat ky thay anh chup trang mau + live-layout.json:
//   - o anh `hero` (anh chinh, dung giua khi dung) + `img1..img5` (cac the khac trong hang, tuy chon; thieu -> lap lai /
//     the giao dien gia trung tinh) + `bg` (lop xa, tuy chon; thieu -> dung chinh anh hero lam nen mo).
//   - moi the: anh `contain` tren nen la chinh anh do phong to + mo (khong cat anh doc / ngang / vuong).
//   - o chu: kicker / title / subtitle / badge (nhan the chinh) / tags (chu tren cac vien lop gan).
//   - Khung doc (native): tieu de to o tren, the to (4:5) giua khung, cac vien lop gan tren / duoi hang the.
import { staticFile, useCurrentFrame, useVideoConfig, useText, useList, useImage, useShot, useShotFonts, useBrand, fitSize, wrapLines } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, Img, continueRender, delayRender } from 'remotion';
import { EASE, SpeedBlur, bezier, mix, ramp, softShadow, velocity } from '../../../fixtures/Polish';
import { LOOKS, Stage, alpha, type } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

export const MULTIPLANE_DUR = 165;

const L = LOOKS.sand;
const DRIVE_EASE = bezier(0.45, 0, 0.18, 1);

// Chu troi len tung tu (mat na co dem tren 0.32em / duoi 0.26em: giu dau tieng Viet)
const RiseLine: React.FC<{ text: string; frame: number; start: number; each: number; gap: number; style?: React.CSSProperties }> = ({ text, frame, start, each, gap, style }) => (
  <div style={{ whiteSpace: 'nowrap', ...style }}>
    {text.split(/\s+/).filter(Boolean).map((w, i) => {
      const p = ramp(frame, start + i * gap, each, EASE.snappy);
      return (
        <span key={i} style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', padding: '0.32em 0.04em 0.26em', margin: '-0.32em -0.04em -0.26em', marginRight: '0.24em' }}>
          <span style={{ display: 'inline-block', transform: `translateY(calc(${((1 - p) * 105).toFixed(2)}% + ${((1 - p) * 0.7).toFixed(3)}em))` }}>{w}</span>
        </span>
      );
    })}
  </div>
);

// Ti le that cua anh (rong/cao) — doc truoc khi ve (delayRender) de chon khung the hop anh chinh
const useAspect = (src?: string): number | null => {
  const [a, setA] = React.useState<number | null>(null);
  const [h] = React.useState(() => (src ? delayRender('multiplane: ti le anh') : null));
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

// The anh: anh contain tren nen la chinh no phong to + mo (moi ti le deu vua the, khong cat)
const PhotoCard: React.FC<{ src?: string; k: number }> = ({ src, k }) => {
  if (!src) {
    // the giao dien gia trung tinh (khi khong co du anh)
    return (
      <div style={{ position: 'absolute', inset: 0, background: L.surface, padding: '9%', boxSizing: 'border-box' }}>
        <div style={{ height: '34%', borderRadius: 10, background: `linear-gradient(135deg, ${alpha(k % 2 ? L.accent2 : L.accent, 0.22)}, ${alpha(L.ink, 0.06)})` }} />
        {[0.82, 0.6, 0.72, 0.45].map((w, j) => (
          <div key={j} style={{ marginTop: j ? '5%' : '9%', height: j ? '5%' : '8%', width: `${w * 100}%`, borderRadius: 6, background: alpha(L.ink, j ? 0.1 : 0.2) }} />
        ))}
      </div>
    );
  }
  return (
    <>
      <Img src={src} style={{ position: 'absolute', inset: '-12%', width: '124%', height: '124%', objectFit: 'cover', filter: 'blur(22px) saturate(0.9)', opacity: 0.85 }} />
      <div style={{ position: 'absolute', inset: 0, background: alpha(L.bg[1], 0.25) }} />
      <Img src={src} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
    </>
  );
};

export const MultiplaneReal: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const brand = useBrand();
  const shot = useShot();
  const portrait = SH > 1080 * 1.2;
  const kicker = useText('kicker', 'Góc nhìn chiều sâu');
  const title = useText('title', 'Mọi dự án, một không gian.');
  const subtitle = useText('subtitle', 'Lướt qua từng sản phẩm như máy quay thật.');
  const badge = useText('badge', 'Tâm điểm');
  const tags = useList('tags', ['Thiết kế', 'Dữ liệu', 'Trí tuệ nhân tạo', 'Báo cáo', 'Tự động']);

  // —— anh: preview (khong co anh nao) -> anh mau; co anh that -> chi dung o duoc gui
  const preview = !shot || (!!shot.preview && Object.keys(shot.images).length === 0); // [Agent Edit] chi xem thu kho moi dung anh mau
  const hero = useImage('hero', 'samples/photo1.jpg');
  const ex = [useImage('img1'), useImage('img2'), useImage('img3'), useImage('img4'), useImage('img5')].filter(Boolean) as string[];
  const extras = ex.length ? ex : preview ? [staticFile('samples/wide1.jpg'), staticFile('samples/square1.jpg'), staticFile('samples/photo2.jpg')] : [];
  const bgOwn = useImage('bg');
  const hasBg = !!bgOwn;
  const bg = bgOwn ?? hero;

  // —— hinh hoc theo huong khung
  // khung the theo ti le anh chinh (kep trong khoang dep cho tung huong khung) -> anh chinh hien to nhat co the
  const heroAsp = useAspect(hero) ?? (portrait ? 0.6 : 1.33);
  const asp = portrait ? Math.max(0.6, Math.min(1.05, heroAsp)) : Math.max(0.75, Math.min(1.6, heroAsp));
  const boxW = portrait ? 1150 : 600;
  const boxH = portrait ? 1250 : 375;
  const CW = Math.round(Math.min(boxW, boxH * asp));
  const CH = Math.round(CW / asp);
  const GAP = CW + (portrait ? 100 : 60); // buoc giua cac the (lop giua)
  const ROW_X = portrait ? 160 : 230;
  // so the truoc anh chinh: giu quang truot cua lop giua ~1300px (ban goc ~1020-1300)
  const HERO = Math.max(1, Math.min(8, Math.round((1300 + 960 - ROW_X - CW / 2) / GAP)));
  const N = HERO + Math.ceil(1920 / GAP) + 1;
  // tieu de (lop 0x)
  const TX = portrait ? 120 : 120;
  const tW = portrait ? 1680 : 1120;
  const tSize0 = portrait ? 150 : 120;
  // khung ngang: 1 dong 120px; khong vua -> 2 dong 92px
  const tSz = !portrait && wrapLines(title, fonts.sans, tSize0, tW, 760, 9).length > 1 ? 92 : tSize0;
  const tLines = wrapLines(title, fonts.sans, tSz, tW, 760, portrait ? 3 : 2);
  const tSize = Math.min(...tLines.map((l) => fitSize(l, { family: fonts.sans, size: tSz, maxWidth: tW, weight: 760, minSize: tSize0 * 0.45 })));
  const tLH = tSize * 1.12;
  const subFs = portrait ? 56 : 34;
  const subLines = subtitle ? wrapLines(subtitle, fonts.sans, subFs, portrait ? 1600 : 520, 450, 3) : [];
  const kickFs = portrait ? 34 : 22;
  // khung doc: khoi (tieu de + cau phu + hang the) can giua theo chieu doc
  const headH = kickFs * 1.5 + 18 + tLines.length * tLH + (subLines.length ? 40 + subLines.length * subFs * 1.35 : 0);
  const titleTop = portrait ? Math.max(220, Math.round((SH - (headH + 240 + CH)) / 2 - 60)) : 96;
  const titleBottom = titleTop + kickFs * 1.5 + 18 + tLines.length * tLH;
  const ROW_Y = portrait ? Math.round(titleTop + headH + 240) : Math.max(410, Math.round(titleBottom + 60));
  const rowCH = portrait ? Math.min(CH, SH - ROW_Y - 420) : Math.min(CH, 1080 - ROW_Y - 150);
  // drive 总量：中景（0.7x）落定时主角中心恰在屏心
  const MID_END = 960 - (ROW_X + HERO * GAP + CW / 2);
  const DRIVE = -MID_END / 0.7;
  const driveAt = (f: number) => DRIVE * ramp(f, 6, 130, DRIVE_EASE) + 4 * ramp(f, 136, 29, EASE.smooth);
  const drive = driveAt(frame);
  const vFg = -1.4 * velocity(driveAt, frame); // 近景屏幕速度（px/帧）
  const lift = ramp(frame, 122, 22, EASE.out);
  const ring = ramp(frame, 128, 16, EASE.snappy);
  const kick = ramp(frame, 4, 20, EASE.snappy);
  const sub = ramp(frame, 26, 18, EASE.out);

  // 近景胶囊：x 为近景层坐标。落定时只剩两枚压在画框边做前景框边，其余已滑出画外（按 drive 重新换算）
  const nearEnd = DRIVE * 1.4;
  const pillTop = portrait ? ROW_Y - 150 : 296;
  const pillBot = portrait ? ROW_Y + rowCH + 70 : 880;
  const PILLS = [
    { x: 1200, y: pillBot, tone: 'accent' },
    { x: 1640, y: pillTop, tone: 'ink' },
    { x: nearEnd + Math.max(620, 1200 - nearEnd + 560), y: pillBot + (portrait ? 30 : 25), tone: 'paper' },
    { x: nearEnd + 2260, y: pillTop + 4, tone: 'ink' },
    { x: nearEnd + 1680, y: pillBot - (portrait ? 30 : 20), tone: 'accent' },
  ].slice(0, Math.max(0, Math.min(5, tags.length))).map((p, i) => ({ ...p, t: tags[i] }));
  const pillH = portrait ? 170 : 128;
  const pillFs = portrait ? 80 : 60;

  // the trong hang: hero o HERO, cac o khac lay lan luot tu extras
  let ei = 0;
  const cards = Array.from({ length: N }, (_, k) => (k === HERO ? hero : extras.length ? extras[ei++ % extras.length] : undefined));
  const badgeFs = portrait ? 34 : 22;
  const farW = 1920 + DRIVE * 0.35 + 240;

  return (
    <AbsoluteFill style={{ background: L.bg[1], overflow: 'hidden' }}>
      <Stage look={L} keyLight={{ x: 0.3, y: 0.0 }} fill={{ x: 0.85, y: 1 }} grain={0.06} />
      {/* 远景 0.35x：整张背景放大、退焦、降饱和 */}
      <div style={{ position: 'absolute', left: -120, top: -80, width: farW, height: SH + 160, transform: `translateX(${(-drive * 0.35).toFixed(2)}px)`, filter: `blur(${hasBg ? 5 : 12}px) saturate(0.7)`, opacity: 0.75 }}>
        {bg ? <Img src={bg} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
      </div>
      {/* 空气透视：远景之上一层暖色薄雾，上部更浓 */}
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${alpha(L.bg[0], 0.86)} 0%, ${alpha(L.bg[1], 0.66)} 50%, ${alpha(L.bg[2], 0.58)} 100%)` }} />
      {/* 桌面：中景卡落影的承托面，一条极淡的地平线光 */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: ROW_Y + rowCH - 40, height: 340, background: `linear-gradient(180deg, ${alpha(L.shadow, 0)}, ${alpha(L.shadow, 0.06)} 40%, ${alpha(L.shadow, 0.02)})` }} />

      {/* 中景 0.7x：卡组横排（主阅读层，无 blur） */}
      <div style={{ position: 'absolute', left: 0, top: ROW_Y, transform: `translateX(${(-drive * 0.7).toFixed(2)}px)` }}>
        {cards.map((src, k) => {
          const isHero = k === HERO;
          const e = isHero ? mix(6, 26, lift) : 6;
          return (
            <div key={k} style={{
              position: 'absolute', left: ROW_X + k * GAP, top: 0, width: CW, height: rowCH, borderRadius: portrait ? 22 : 14, overflow: 'hidden', background: L.surface,
              transform: isHero ? `translateY(${(-14 * lift).toFixed(2)}px) scale(${(1 + 0.035 * lift).toFixed(4)})` : undefined,
              boxShadow: `0 0 0 ${isHero ? ((portrait ? 4 : 2.5) * ring).toFixed(2) : 0}px ${alpha(L.accent, 0.9)}, ${softShadow(e, { color: L.shadow, strength: 1.2 })}`,
            }}>
              <PhotoCard src={src} k={k} />
            </div>
          );
        })}
        {/* 主角角标：浮起后从卡上沿落下 */}
        {badge ? (
          <div style={{
            position: 'absolute', left: ROW_X + HERO * GAP + 2, top: -badgeFs * 2.9, height: badgeFs * 2, padding: `0 ${badgeFs * 0.8}px`, borderRadius: badgeFs, display: 'flex', alignItems: 'center', gap: badgeFs * 0.45,
            background: L.accent, color: L.onAccent, ...type(badgeFs, 700, { caps: true }), fontFamily: fonts.sans, letterSpacing: '0.14em', whiteSpace: 'nowrap',
            opacity: ring, transform: `translateY(${((1 - ring) * 14 - 14 * lift).toFixed(2)}px)`,
            boxShadow: softShadow(8, { color: L.shadow }),
          }}>
            <span style={{ width: badgeFs * 0.36, height: badgeFs * 0.36, borderRadius: badgeFs, background: L.onAccent }} />
            {badge}
          </div>
        ) : null}
      </div>

      {/* 近景 1.4x：放大的标签胶囊掠过镜头（景深虚化、落影更深更远），只在快段带横向拖影 */}
      <SpeedBlur vx={vFg} amount={0.2} max={10}>
        <div style={{ position: 'absolute', inset: 0, transform: `translateX(${(-drive * 1.4).toFixed(2)}px)` }}>
          {PILLS.map((p, i) => {
            const bgc = p.tone === 'accent' ? L.accent : p.tone === 'ink' ? L.ink : L.surface;
            const fg = p.tone === 'paper' ? L.ink : L.onAccent;
            return (
              <div key={i} style={{
                position: 'absolute', left: p.x, top: p.y, height: pillH, padding: `0 ${pillH * 0.44}px`, borderRadius: pillH / 2, display: 'flex', alignItems: 'center',
                background: bgc, color: fg, ...type(pillFs, 650), fontFamily: fonts.sans, whiteSpace: 'nowrap', filter: 'blur(7px)', opacity: 0.92,
                boxShadow: `0 40px 70px -10px ${alpha(L.shadow, 0.35)}`,
              }}>{p.t}</div>
            );
          })}
        </div>
      </SpeedBlur>

      {/* 0x 层：固定在画框上的标题 */}
      <div style={{ position: 'absolute', left: TX, top: titleTop }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: kickFs * 1.5, ...type(kickFs, 700, { caps: true }), fontFamily: fonts.sans, whiteSpace: 'nowrap', letterSpacing: `${mix(0.5, 0.18, kick).toFixed(3)}em`, color: L.accent, opacity: kick }}>
          {brand ? <ShotcraftMark size={kickFs * 1.55} tone="light" /> : null}
          {brand?.name ? <span style={{ textTransform: 'none', fontFamily: BRAND.font, fontSize: kickFs * 1.18, fontWeight: 700, letterSpacing: '0.03em', color: L.ink }}>{BRAND.name}</span> : null}
          {brand && kicker ? <span style={{ width: 28, height: 2, background: L.accent }} /> : null}
          {kicker}
        </div>
        <div style={{ marginTop: 18, fontFamily: fonts.sans, fontSize: tSize, fontWeight: 760, letterSpacing: '-0.035em', lineHeight: 1.12, color: L.ink }}>
          {tLines.map((l, li) => {
            const before = tLines.slice(0, li).join(' ').split(/\s+/).filter(Boolean).length;
            const g = Math.min(4, 20 / Math.max(1, title.split(/\s+/).length));
            return <RiseLine key={li} text={l} frame={frame} start={8 + before * g} each={20} gap={g} />;
          })}
        </div>
      </div>
      {subLines.length ? (
        <div style={portrait
          ? { position: 'absolute', left: TX, top: titleBottom + 40, width: 1680, fontFamily: fonts.sans, fontSize: subFs, fontWeight: 450, lineHeight: 1.35, color: L.ink2, opacity: sub, transform: `translateY(${((1 - sub) * 14).toFixed(1)}px)` }
          : { position: 'absolute', right: 120, top: tLines.length > 1 ? titleBottom - subLines.length * subFs * 1.35 : 196, width: 520, textAlign: 'right', fontFamily: fonts.sans, fontSize: subFs, fontWeight: 450, lineHeight: 1.35, color: L.ink2, opacity: sub, transform: `translateY(${((1 - sub) * 14).toFixed(1)}px)` }}>
          {subLines.map((l, j) => <div key={j} style={{ whiteSpace: 'nowrap' }}>{l}</div>)}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
