// card-stack — 一组卡从屏幕下方逐张 spring 弹入叠成一摞，全员落位后整摞一次性展成扇面——
// 每张按序号偏转 6.5°、横移 138px、向后退一层 z；扇柄在卡片下缘之外（transform-origin 50% 130%）。
//
// 第二轮重设计（瓷白 · 模板库发布；品牌轮：video-shotcraft 镜头配方库）：
// - look = porcelain（冷白 + 墨 + 钴蓝，青绿只做点缀）。卡片放大到 320×440 原生像素（不再走 480×270 设计坐标），
//   每张是一张为镜头设计的"模板封面"：上 58% 生成式封面图（甘特 / 柱图 / 折线 / 圆环 / 表格 / 日历 / 看板 / 大数字），
//   下部 30px 标题 + mono 元信息（每张是一种镜头 / 模板）；只有中心那张「Launch film」用钴蓝实色封面——它是结尾被抽出来的主角。
// - 卡数 9（奇数）：中心卡独占中位，扇面左右对称；叠压次序 = 序号（像手里摊开的一手牌，左压右），
//   全程不换 zIndex，避免从"一摞"到"扇面"时顶牌跳变。
// - 重量感：入场按"越来越快"分布（EASE.exit 错峰，砰——砰—砰-砰砰），每张落座时整摞被压低 5px 再回弹；
//   展开前 6f 预备（整摞收紧 2%），展开用低阻尼弹簧（damping 20）带一点惯性落定；相机同段拉远到 0.88。
// - 结尾：中心卡沿自身轴抽出 72px + 钴蓝描边 + 一次扫光（Q4），标题与副句升起，形成发布会海报。
//
// 时间表（30fps，共 150f）：
//   0–3     瓷白舞台 + 地面接触影 + 左上眉题已在
//   2–42    9 张卡依次起跳（错峰 40f，越来越快），各自 spring（damping 13）≈20f 落座，落座时整摞下压 5px
//   62–72   预备：整摞收紧 2%
//   0–64    相机极缓推近 1→1.06
//   68–100  扇形展开（弹簧 damping 20，轻微过冲一次），相机 1.06→0.88 拉远（smooth 64–106）
//   102–122 中心卡抽出 72px（overshoot）+ 钴蓝描边 + 扫光；标题逐词升起（106–）、副句（116–）
//   122–150 hold（相机极缓推进 ×1.017）
//
// [Agent Edit] o chu: kicker (眉题 trai tren) / title (tieu de len khi rut the giua) / subtitle (cau phu) /
// featured (ten the chinh giua — nhan vat chinh bi rut ra) / items (ten cac the hai ben, 4–8 muc).
// So the N = so muc + 1 (the giua), luon LE (so muc le -> them 1 the trong khong ten) — giu the giua doc chiem trung vi.
// Chu dai: tieu de / cau phu tu xuong dong theo be ngang that; ten the tu thu nho / 2 dong trong be ngang the.
// Khung doc (portrait.mode = 'native'): ca chum the phong 1.3x, tieu de to o tren, cau phu duoi, khoi dat giua khung;
// diem xuat phat cua the dat duoi mep khung that (van "bay vao tu ngoai khung").
import { useBackdrop, useCurrentFrame, useVideoConfig, useText, useList, useShotFonts, useBrand, wrapLines, fitSize, BrandLogo } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, FONT, mix, ramp, softShadow } from '../../../fixtures/Polish';
import { LOOKS, Sheen, Stage, alpha, springAt, stagger } from '../../../fixtures/Look';
import { ShotcraftMark } from '../../../fixtures/Brand';

export const CARD_STACK_DURATION = 150; // 5000ms @30fps

const L = LOOKS.porcelain;
const CW = 320;
const CH = 440;
const CX = 960;
const ROT = 6.5; // 扇面每张偏转（°）
const TX = 138; // 扇面每张横移（px）

type Kind = 'gantt' | 'bars' | 'line' | 'rings' | 'hero' | 'table' | 'calendar' | 'kanban' | 'metric';
const KINDS: Kind[] = ['gantt', 'bars', 'line', 'rings', 'table', 'calendar', 'kanban', 'metric'];
const TINTS = ['#e9eeff', '#eef1f6', '#e3f5f1'];
type CardData = { title: string; meta: string; kind: Kind; tint: string };

const rand = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
// xuong dong CAN DOI: giu so dong cua cach tach tham lam nhung thu hep be ngang toi da (khong de 1 tu mo coi o dong cuoi)
const wrapBalanced = (text: string, family: string, size: number, maxWidth: number, weight: number, maxLines: number) => {
  const base = wrapLines(text, family, size, maxWidth, weight, maxLines);
  if (base.length < 2) return base;
  let lo = maxWidth * 0.4, hi = maxWidth;
  for (let k = 0; k < 12; k++) {
    const mid = (lo + hi) / 2;
    if (wrapLines(text, family, size, mid, weight, 99).length > base.length) lo = mid; else hi = mid;
  }
  return wrapLines(text, family, size, hi, weight, maxLines);
};
const DROP = 820; // 起点在画框下方（khung ngang）

// Chu "troi len" tu sau mat na — padding tren 0.5em (chu HOA dau chong: Ắ Ấ) / duoi 0.26em giu dau tieng Viet (ỗ ầ ắ) va chan chu g y.
const RiseLine: React.FC<{ text: string; start: number; each: number; gap: number; style: React.CSSProperties }> = ({ text, start, each, gap, style }) => {
  const f = useCurrentFrame();
  const ws = text.split(/\s+/).filter(Boolean);
  return (
    <div style={{ whiteSpace: 'nowrap', ...style }}>
      {ws.map((w, i) => {
        const p = EASE.snappy(clamp01((f - start - i * gap) / each));
        return (
          <React.Fragment key={i}>
            {i ? ' ' : ''}
            <span style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', padding: '0.5em 0.04em 0.26em', margin: '-0.5em -0.04em -0.26em' }}>
              <span style={{ display: 'inline-block', transform: `translateY(calc(${((1 - p) * 105).toFixed(2)}% + ${((1 - p) * 0.62).toFixed(3)}em))` }}>{w}</span>
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export const CardStack: React.FC = () => {
  const f = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const brand = useBrand();
  const portrait = SH > 1080 * 1.2;
  const kicker = useText('kicker', 'THƯ VIỆN MẪU');
  const title = useText('title', 'Bắt đầu từ một mẫu có sẵn.');
  const sub = useText('subtitle', 'Tám mẫu dựng sẵn, chọn là dùng ngay.');
  const featured = useText('featured', 'Mẫu nổi bật');
  const items = useList('items', ['Lộ trình dự án', 'Báo cáo doanh thu', 'Tăng trưởng kênh', 'Mục tiêu tuần', 'Danh sách việc', 'Lịch đăng bài', 'Bảng công việc', 'Doanh thu quý']).slice(0, 8);

  // the: muc chia doi hai ben the giua; so muc le -> them 1 the trong (khong ten) de N luon le
  const side: CardData[] = items.map((t, i) => ({ title: t, meta: '', kind: KINDS[i % KINDS.length], tint: TINTS[i % 3] }));
  if (side.length % 2) side.push({ title: '', meta: '', kind: KINDS[side.length % KINDS.length], tint: TINTS[side.length % 3] });
  const half = side.length / 2;
  const CARDS: CardData[] = [...side.slice(0, half), { title: featured, meta: 'NỔI BẬT', kind: 'hero', tint: L.accent }, ...side.slice(half)];
  const N = CARDS.length;
  const FEATURED = (N - 1) / 2;
  CARDS.forEach((c, i) => { if (!c.meta) c.meta = `MẪU ${String(i + 1).padStart(2, '0')}`; });
  // 入场：起跳帧按"越来越快"分布（EASE.out 映射 = 前面间隔大、后面间隔小）；spring 0→1（damping 13 = 一次可见回弹）
  const START = Array.from({ length: N }, (_, i) => 2 + stagger(i, N, 40, EASE.out));
  const inAt = (fr: number, i: number) => (fr < START[i] ? 0 : springAt(fr, START[i], { damping: 13, stiffness: 150 }));

  // ── bo cuc chu ──
  const W = portrait ? 1640 : 1680;
  let TS = portrait ? 164 : 88;
  let tLines = wrapBalanced(title, fonts.sans, TS, W, 700, portrait ? 3 : 2);
  if (!portrait && tLines.length > 1) { TS = 66; tLines = wrapBalanced(title, fonts.sans, TS, W, 700, 2); }
  TS = Math.min(...tLines.map((l) => fitSize(l, { family: fonts.sans, size: TS, maxWidth: W, weight: 700, minSize: portrait ? 84 : 44 })));
  const tLH = TS * 1.16;
  const SS = portrait ? 62 : 34;
  const sLines = sub ? wrapBalanced(sub, fonts.sans, SS, 1600, 450, portrait ? 3 : 1) : [];
  const SSz = sLines.length ? Math.min(...sLines.map((l) => fitSize(l, { family: fonts.sans, size: SS, maxWidth: 1600, weight: 450, minSize: portrait ? 40 : 22 }))) : SS;
  const sLH = SSz * 1.3;
  const PS = portrait ? 1.3 : 1; // khung doc: phong ca chum the
  // khung doc: be ngang chi 1920 -> goc xoe / buoc ngang giam CUNG TI LE (6.5°/138px -> 5.2°/110px) de hai the ngoai khong ra khoi khung
  const rotK = portrait ? 5.2 : ROT;
  const txK = portrait ? 110 : TX;
  const FAN_H = 700 * PS; // be cao vung chum the (gom the rut len + do xoe)
  let titleTop: number, subTop: number, CY: number, headTop: number;
  if (portrait) {
    const total = tLines.length * tLH + 120 + FAN_H + 80 + sLines.length * sLH;
    const y0 = Math.round(SH / 2 - total / 2);
    titleTop = y0;
    CY = y0 + tLines.length * tLH + 120 + FAN_H * 0.48;
    subTop = y0 + tLines.length * tLH + 120 + FAN_H + 80;
    headTop = Math.max(110, y0 - 210);
  } else {
    titleTop = tLines.length > 1 ? 138 : 150;
    subTop = tLines.length > 1 ? titleTop + 2 * tLH + 8 : 268;
    CY = 610;
    headTop = 96;
  }
  const drop = portrait ? Math.max(DROP, (SH - CY + CH) / PS) : DROP;
  const tWords = tLines.reduce((a, l) => a + l.split(/\s+/).filter(Boolean).length, 0);
  const tGap = Math.min(3, 26 / Math.max(1, tWords));

  // 落座下压：每张卡落座（≈起跳后 7f 越过终点）时整摞被压低 5px，sin 包络 9f
  const dip = START.reduce((d, s) => d + Math.sin(clamp01((f - s - 6) / 9) * Math.PI) * 5, 0);
  const squeeze = 1 - 0.02 * Math.sin(clamp01((f - 62) / 10) * Math.PI);
  const fan = f < 68 ? 0 : springAt(f, 68, { damping: 20, stiffness: 95 });
  // 相机：成摞段极缓推近 1→1.06（给"一摞"分量），展开同段拉远到 0.88，hold 段再极缓推进
  const camPush = mix(1, 1.06, ramp(f, 0, 64, EASE.smooth));
  const cam = PS * mix(camPush, 0.88, ramp(f, 64, 42, EASE.smooth)) * mix(1, 1.017, ramp(f, 122, 28, EASE.smooth));
  const lift = ramp(f, 102, 18, EASE.overshoot);
  const ring = ramp(f, 104, 12, EASE.out);
  const sheen = ramp(f, 108, 22, EASE.smooth);
  const headSize = portrait ? 38 : 22;
  let wi = 0;
  // [Agent Edit] NEN ANH AI: bo nen sang (Stage tu bo) + dai phan quang mat ban; chu nam truc tiep tren nen co bong sang
  const bd = useBackdrop();
  const ts = bd ? '0 1px 12px rgba(255,255,255,0.7)' : undefined;

  return (
    <AbsoluteFill style={{ background: bd ? 'transparent' : L.bg[1] }}>
      <Stage look={L} keyLight={{ x: 0.5, y: 0.12 }} fill={null} />
      {/* 地面：一道极淡的桌面反光带（theo vi tri chum the） */}
      {!bd && <div style={{ position: 'absolute', left: 0, right: 0, top: CY + 250 * PS, height: 220 * PS, background: `linear-gradient(180deg, ${alpha('#ffffff', 0)} 0%, ${alpha('#ffffff', 0.5)} 40%, ${alpha('#ffffff', 0)} 100%)` }} />}

      {/* 眉题（画框装饰，不随相机） */}
      <div style={{ position: 'absolute', left: 120, right: 420, top: headTop, display: 'flex', alignItems: 'center', gap: 14, opacity: ramp(f, 0, 12, EASE.out), textShadow: ts }}>
        {brand ? <ShotcraftMark size={headSize * 1.4} tone="light" /> : null}
        <div style={{ fontFamily: FONT.mono, fontSize: headSize, letterSpacing: '0.1em', color: L.ink2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {[brand?.name, kicker].filter(Boolean).join(' · ')}
        </div>
      </div>
      <div style={{ position: 'absolute', right: 120, top: headTop, fontFamily: FONT.mono, fontSize: headSize, letterSpacing: '0.16em', color: L.ink3, opacity: ramp(f, 4, 12, EASE.out), textShadow: ts }}>
        {`${String(START.filter((s) => f >= s + 6).length).padStart(2, '0')} / ${String(N).padStart(2, '0')}`}
      </div>

      {/* 标题：中心卡抽出时升起 */}
      {tLines.map((l, i) => {
        const st = 106 + wi * tGap;
        wi += l.split(/\s+/).filter(Boolean).length;
        return (
          <RiseLine key={i} text={l} start={st} each={18} gap={tGap}
            style={{ position: 'absolute', left: 0, right: 0, top: titleTop + i * tLH, textAlign: 'center', fontFamily: fonts.sans, fontSize: TS, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.16, color: L.ink, textShadow: ts }} />
        );
      })}

      <AbsoluteFill style={{ transform: `scale(${cam.toFixed(4)})`, transformOrigin: `${CX}px ${CY + 120}px` }}>
        {/* 地面接触影：成摞时集中、展开后随扇面变宽 */}
        <div style={{
          position: 'absolute', left: CX - mix(220, 760, fan) / 2, top: CY + CH / 2 - 30 + dip, width: mix(220, 760, fan), height: 70,
          borderRadius: '50%', background: `radial-gradient(ellipse at center, ${alpha(L.shadow, 0.28)} 0%, ${alpha(L.shadow, 0)} 70%)`,
          opacity: ramp(f, 6, 20, EASE.out),
        }} />
        <div style={{ position: 'absolute', inset: 0, perspective: '1800px' }}>
          {CARDS.map((c, i) => {
            const p = inAt(f, i);
            const y = (1 - p) * drop;
            const vy = ((1 - inAt(f + 0.5, i)) - (1 - inAt(f - 0.5, i))) * drop;
            const blurY = Math.min(10, Math.abs(vy) * 0.18);
            const k = i - (N - 1) / 2;
            // 成摞错位：确定性 ±3.2° / ±11px，像随手码齐的一摞；展开时理顺
            const jitR = (rand(i * 3 + 1) - 0.5) * 6.4;
            const jitX = (rand(i * 5 + 2) - 0.5) * 22;
            const tilt = (i % 2 ? 1 : -1) * 9 * (y / drop); // 飞行中带交替倾角，随落座收敛
            const rot = mix(jitR + tilt, k * rotK, fan);
            const tx = mix(jitX, k * txK, fan);
            const tz = i * 2;
            const feat = i === FEATURED;
            const ly = feat ? -72 * lift : 0;
            const elev = 6 + (y / drop) * 50 + (feat ? 26 * lift : 0);
            const visible = f >= START[i];
            if (!visible) return null;
            return (
              <div key={i} style={{
                position: 'absolute', left: CX - CW / 2, top: CY - CH / 2, width: CW, height: CH,
                transformOrigin: '50% 130%',
                transform: `translate3d(${tx.toFixed(2)}px, ${(y + dip + ly).toFixed(2)}px, ${tz}px) rotate(${rot.toFixed(3)}deg) scale(${squeeze.toFixed(4)})`,
                // the chinh duoc rut ra -> noi len tren the ben canh (ten the phai doc tron); truoc do giu thu tu de xep
                zIndex: feat && f >= 102 ? N + 1 : i,
              }}>
                {blurY > 0.4 && (
                  <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
                    <filter id={`cs-vb-${i}`} x="-10%" y="-30%" width="120%" height="160%">
                      <feGaussianBlur stdDeviation={`0 ${blurY.toFixed(2)}`} />
                    </filter>
                  </svg>
                )}
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: 22, overflow: 'hidden', background: L.surface,
                  border: `1px solid ${L.line}`, boxSizing: 'border-box',
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.9), ${softShadow(elev, { color: L.shadow, strength: 1.15 })}` +
                    (feat && ring > 0 ? `, 0 0 0 ${(3 * ring).toFixed(2)}px ${alpha(L.accent, 0.9 * ring)}` : ''),
                  filter: blurY > 0.4 ? `url(#cs-vb-${i})` : undefined,
                }}>
                  <CardFace c={c} i={i} brandLogo={!!brand} />
                  {feat && <Sheen progress={sheen} strength={0.7} width={0.18} />}
                </div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>

      {sLines.map((l, i) => (
        <div key={i} style={{
          position: 'absolute', left: 0, right: 0, top: subTop + i * sLH, textAlign: 'center', fontFamily: fonts.sans, fontSize: SSz, fontWeight: 450,
          letterSpacing: '-0.015em', lineHeight: 1.3, color: L.ink2, whiteSpace: 'nowrap', textShadow: ts,
          opacity: ramp(f, 116 + i * 3, 14, EASE.out), transform: `translateY(${(1 - ramp(f, 116 + i * 3, 18, EASE.snappy)) * 16}px)`,
        }}>
          {l}
        </div>
      ))}
    </AbsoluteFill>
  );
};

// ───────────── 卡面：封面图 + 标题 + 元信息 ─────────────
const COVER_H = 256;
const CardFace: React.FC<{ c: CardData; i: number; brandLogo: boolean }> = ({ c, i, brandLogo }) => {
  const hero = c.kind === 'hero';
  const fonts = useShotFonts();
  // ten the: 1 dong 30px, dai -> 2 dong, van dai -> thu nho vua be ngang the (264px)
  const TW = CW - 56;
  let ts = 30;
  let tl = c.title ? wrapLines(c.title, fonts.sans, ts, TW, 650, 2) : [];
  ts = tl.length ? Math.min(...tl.map((l) => fitSize(l, { family: fonts.sans, size: ts, maxWidth: TW, weight: 650, minSize: 18 }))) : ts;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', left: 12, right: 12, top: 12, height: COVER_H, borderRadius: 14, overflow: 'hidden', background: c.tint }}>
        {hero ? <HeroCover brandLogo={brandLogo} /> : <Cover kind={c.kind} seed={i} />}
      </div>
      <div style={{ position: 'absolute', left: 28, right: 28, top: COVER_H + (tl.length > 1 ? 30 : 40) }}>
        <div style={{ fontFamily: FONT.mono, fontSize: 15, letterSpacing: '0.14em', color: hero ? L.accent : L.ink3 }}>{c.meta}</div>
        {tl.length ? (
          <div style={{ fontFamily: fonts.sans, fontSize: ts, fontWeight: 650, letterSpacing: '-0.02em', lineHeight: 1.18, color: L.ink, marginTop: 8 }}>
            {tl.map((l, k) => <div key={k} style={{ whiteSpace: 'nowrap' }}>{l}</div>)}
          </div>
        ) : (
          <div style={{ marginTop: 14, height: 14, width: 150, borderRadius: 7, background: alpha(L.ink, 0.1) }} />
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: tl.length > 1 ? 10 : 16 }}>
          {[0, 1, 2].map((k) => (
            <div key={k} style={{ width: 26, height: 26, borderRadius: 13, marginLeft: k ? -14 : 0, border: `2px solid ${L.surface}`, background: ['#c9d3ea', '#b8e3d9', '#dfe3ec'][(k + i) % 3] }} />
          ))}
          <div style={{ fontFamily: fonts.sans, fontSize: 17, color: L.ink3, marginLeft: 4 }}>{`★ ${(4.2 + rand(i) * 0.7).toFixed(1).replace('.', ',')}`}</div>
        </div>
      </div>
    </div>
  );
};

// the chinh (giua): nen coban dac + vong tron + logo cua video (khong co -> huy hieu ngoi sao trang); ten nam o phan chu ben duoi
const HeroCover: React.FC<{ brandLogo: boolean }> = ({ brandLogo }) => {
  const W = 296;
  return (
    <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at 80% 10%, #7d9bff 0%, ${L.accent} 100%)` }}>
      <svg width={W} height={COVER_H} style={{ position: 'absolute', inset: 0 }}>
        {[0, 1, 2, 3, 4].map((k) => (
          <circle key={k} cx={250} cy={40} r={60 + k * 44} fill="none" stroke="#ffffff" strokeOpacity={0.22 - k * 0.035} strokeWidth={2} />
        ))}
        {!brandLogo && (
          <g transform="translate(28 150)">
            <rect width={76} height={76} rx={20} fill="#ffffff" fillOpacity={0.95} />
            <path d="M38 16l6.5 13.2 14.5 2.1-10.5 10.2 2.5 14.5L38 49.2 25 56l2.5-14.5L17 31.3l14.5-2.1z" fill={L.accent} />
          </g>
        )}
      </svg>
      {brandLogo ? (
        <div style={{ position: 'absolute', left: 28, top: 150 }}>
          <BrandLogo size={76} bg="#ffffff" color={L.accent} />
        </div>
      ) : null}
    </div>
  );
};

const Cover: React.FC<{ kind: Kind; seed: number }> = ({ kind, seed }) => {
  const W = 296, H = COVER_H;
  const A = L.accent, T = L.accent2, INK = L.ink;
  const soft = alpha(INK, 0.1);
  switch (kind) {
    case 'gantt':
      return (
        <svg width={W} height={H}>
          {[0, 1, 2, 3, 4, 5].map((r) => {
            const x = 24 + rand(seed * 9 + r) * 110;
            const w = 60 + rand(seed * 5 + r) * 110;
            return <rect key={r} x={x} y={36 + r * 32} width={w} height={18} rx={9} fill={r === 2 ? A : r === 4 ? T : alpha(INK, 0.16)} />;
          })}
          <line x1={168} x2={168} y1={20} y2={236} stroke={A} strokeWidth={2} strokeDasharray="4 5" />
        </svg>
      );
    case 'bars':
      return (
        <svg width={W} height={H}>
          {Array.from({ length: 7 }, (_, k) => {
            const h = 50 + rand(seed * 11 + k) * 130;
            return <rect key={k} x={28 + k * 36} y={214 - h} width={22} height={h} rx={5} fill={k === 5 ? A : alpha(INK, 0.14)} />;
          })}
          <line x1={20} x2={276} y1={214.5} y2={214.5} stroke={soft} />
        </svg>
      );
    case 'line': {
      const pts = Array.from({ length: 9 }, (_, k) => [24 + k * 31, 190 - k * 15 - rand(seed * 7 + k) * 40]);
      const d = pts.map((p, k) => `${k ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
      return (
        <svg width={W} height={H}>
          <path d={`${d} L272,230 L24,230 Z`} fill={alpha(T, 0.18)} />
          <path d={d} fill="none" stroke={T} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={pts[8][0]} cy={pts[8][1]} r={8} fill={L.surface} stroke={T} strokeWidth={4} />
          <text x={24} y={52} fontFamily={FONT.sans} fontSize={40} fontWeight={700} fill={INK} letterSpacing="-0.03em">+38%</text>
        </svg>
      );
    }
    case 'rings':
      return (
        <svg width={W} height={H}>
          {[0.82, 0.64, 0.46].map((v, k) => {
            const r = 86 - k * 22;
            const C = 2 * Math.PI * r;
            return (
              <g key={k} transform={`rotate(-90 148 128)`}>
                <circle cx={148} cy={128} r={r} fill="none" stroke={alpha(INK, 0.08)} strokeWidth={14} />
                <circle cx={148} cy={128} r={r} fill="none" stroke={k === 0 ? A : k === 1 ? T : alpha(INK, 0.45)} strokeWidth={14} strokeLinecap="round" strokeDasharray={`${C * v} ${C}`} />
              </g>
            );
          })}
        </svg>
      );
    case 'table':
      return (
        <div style={{ padding: '26px 22px', display: 'flex', flexDirection: 'column', gap: 0 }}>
          {Array.from({ length: 6 }, (_, r) => (
            <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 12, height: 34, borderBottom: `1px solid ${soft}` }}>
              <div style={{ width: 18, height: 18, borderRadius: 9, background: r === 1 ? A : alpha(INK, 0.14) }} />
              <div style={{ height: 8, width: 70 + rand(seed * 3 + r) * 70, borderRadius: 4, background: alpha(INK, r === 0 ? 0.32 : 0.16) }} />
              <div style={{ flex: 1 }} />
              <div style={{ height: 16, width: 44, borderRadius: 8, background: r === 1 ? alpha(T, 0.3) : alpha(INK, 0.07) }} />
            </div>
          ))}
        </div>
      );
    case 'calendar':
      return (
        <div style={{ padding: 24, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 7 }}>
          {Array.from({ length: 35 }, (_, k) => {
            const on = rand(seed * 13 + k) > 0.66;
            return <div key={k} style={{ aspectRatio: '1', borderRadius: 6, background: k === 17 ? A : on ? alpha(T, 0.35) : alpha(INK, 0.07) }} />;
          })}
        </div>
      );
    case 'kanban':
      return (
        <div style={{ padding: 22, display: 'flex', gap: 10 }}>
          {[4, 3, 2].map((n, col) => (
            <div key={col} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ height: 8, width: 40, borderRadius: 4, background: alpha(INK, 0.3) }} />
              {Array.from({ length: n }, (_, r) => (
                <div key={r} style={{ height: 40, borderRadius: 8, background: col === 1 && r === 0 ? A : L.surface, boxShadow: `0 1px 2px ${alpha(INK, 0.1)}`, padding: 9 }}>
                  <div style={{ height: 6, width: 30 + rand(seed + col * 5 + r) * 30, borderRadius: 3, background: col === 1 && r === 0 ? alpha('#ffffff', 0.7) : alpha(INK, 0.18) }} />
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    case 'metric':
    default:
      return (
        <svg width={W} height={H}>
          <text x={24} y={96} fontFamily={FONT.sans} fontSize={66} fontWeight={800} fill={INK} letterSpacing="-0.04em">2,4 tỷ</text>
          <rect x={24} y={116} width={92} height={30} rx={15} fill={alpha(T, 0.22)} />
          <text x={38} y={137} fontFamily={FONT.sans} fontSize={17} fontWeight={700} fill="#007a69">+12,4%</text>
          <path d={Array.from({ length: 12 }, (_, k) => `${k ? 'L' : 'M'}${(24 + k * 22.5).toFixed(1)},${(230 - k * 4 - rand(k + 40) * 26).toFixed(1)}`).join(' ')}
            fill="none" stroke={A} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
};
