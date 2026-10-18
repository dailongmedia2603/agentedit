// glitch-cycle — 乱码轮播：同一行等宽槽位循环轮播 4 条状态短语，每条头尾按概率关键帧
// [1,0,0,0.1,0,0,1] 全乱码、中段偶发单字抖动，切换瞬间叠 RGB 分离、整行位移与水平撕裂；
// 末条概率收 0 保证收尾干净。
//
// 第二轮重设计（极光夜 · 渲染控制台）：
// - look = aurora（深紫黑 · 紫 · 粉）。原生 1920 作画：短语是 104px 等宽大写、固定 17 个槽位
//   （短语居中补空格，字符不增删、整行永不重排），四角细括号框住槽位，像一块广播级状态屏。
// - 噪声浓度 g 一个变量同时驱动：逐字换乱码（粉 / 暗紫）、整行横向抖动（±g·36px，纵向只 ±g·10）、
//   RGB 分离（粉左 / 冰蓝右各 g·10px）、g>0.25 的水平撕裂带（中段横移 ±g·80px）、g>0.45 的 3 块
//   像素块残影——所以几种故障永不打架。每 2f 重掷一次（1f 一换糊成灰带，4f 以上看得清是另一个词）。
// - 上方状态行（脉冲点 + RENDERING · shotcraft/launch-film · #4127）、下方 1100px 进度轨（线性走满，四拍刻度 +
//   发光头）+ STEP n/4 与百分比（tabular-nums）——给噪声一个稳定的"在推进"参照。
// - 收尾：末条 READY TO SHIP 收干净的那一刻给一次柔和泛光（Q4：只给主角一次），进度到 100% 后
//   状态行转 RENDERED、脉冲点转实心，下方升起一行强调色署名（镜刻标志 + video-shotcraft）；最后 ~28f 干净海报。
//
// 时间表（30fps，共 168f）：每条短语 38f（乱 → 定 → 0.1 抽字 → 定 → 乱熔进下一条）
//   0–38    STORYBOARDING（第 0 帧即满乱码 = 开场就有画面）
//   38–76   LOCKING BEAT GRID
//   76–114  RENDERING FRAMES
//   114–168 READY TO SHIP：按 38f 走 KF_LAST，~139f 起干净；进度 0→100% 线性走到 140f
//   140–168 RENDERED 状态 + 署名升起 + hold
// [Agent Edit] o chu: steps (3-5 buoc trang thai, in hoa, luan phien trong 1 o), label (nhan du an tren dong trang thai,
// tuy chon). So o ky tu (MAXCH) + co chu tinh tu buoc dai nhat (do vua be ngang that); nhip moi buoc chia deu theo so buoc
// (4 buoc = 38f nhu ban goc). Chu "do dac" (DANG XU LY / HOAN TAT / BUOC n/N) doi sang tieng Viet trung tinh.
// Dong ky ten cuoi = thuong hieu cua video (khong co -> an). Khung doc (native): chu to hon, ca khoi giua khung.
import { useCurrentFrame, useVideoConfig, useList, useText, useShotFonts, useBackdrop, fitSize } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, FONT, ramp } from '../../../fixtures/Polish';
import { LOOKS, Stage, alpha } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

export const GLITCH_CYCLE_DURATION = 168;

const L = LOOKS.aurora;
const POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&<>/\\ĐƯƠÂÊÔ';
const KF = [1, 0, 0, 0.1, 0, 0, 1];
const KF_LAST = [1, 0, 0, 0.1, 0, 0, 0];
const CELL = 0.64; // 槽宽（em）
const SPLIT_A = '#ff4fa3'; // RGB 分离：粉
const SPLIT_B = '#6fd8ff'; // RGB 分离：冰蓝

const rand = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const glitchAt = (kf: number[], p: number) => {
  const segs = kf.length - 1;
  const x = Math.min(segs - 1e-6, Math.max(0, p * segs));
  const i = Math.floor(x);
  return kf[i] + (kf[i + 1] - kf[i]) * (x - i);
};

export const GlitchCycle: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const u = portrait ? 1.5 : 1; // 竖屏 chrome 放大
  // [Agent Edit] DOT 2: co nen anh AI -> bo dai sang + vach quet phu nen (Stage tu bo gradient); chu tren nen -> bong toi nhe
  const bd = useBackdrop();
  const halo = '0 2px 18px rgba(0,0,0,0.55)';
  const raw = useList('steps', ['LÊN KỊCH BẢN', 'KHỚP NHỊP NHẠC', 'DỰNG KHUNG HÌNH', 'SẴN SÀNG ĐĂNG']);
  const PHRASES = raw.map((x) => x.trim().toUpperCase()).filter(Boolean).slice(0, 5);
  if (!PHRASES.length) PHRASES.push('SẴN SÀNG');
  const label = useText('label', 'du-an/video-ra-mat');
  const MAXCH = Math.max(...PHRASES.map((x) => Array.from(x).length));
  // 字号：槽位总宽 = MAXCH · CELL · SIZE 必须落在安全宽内（原版 17 字符 · 104px）
  const SIZE = Math.min(portrait ? 180 : 104, (portrait ? 1740 : 1620) / (MAXCH * CELL));
  const padCenter = (x: string) => {
    const a = Array.from(x);
    const left = Math.floor((MAXCH - a.length) / 2);
    return [...Array(left).fill(' '), ...a, ...Array(MAXCH - a.length - left).fill(' ')];
  };

  const N = PHRASES.length;
  // 每条短语帧数：4 条 = 38f（原版）；条数变了按同一形状等分，末条之后延续到片尾
  const SLOT = Math.min(46, 152 / N);
  const DONE = Math.round((N - 1) * SLOT + SLOT * 0.68); // 进度走满帧（4 条 = 140）
  const slot = Math.min(N - 1, Math.floor(frame / SLOT));
  const p = Math.min(1, (frame - slot * SLOT) / SLOT);
  const text = padCenter(PHRASES[slot]);
  const g = glitchAt(slot === N - 1 ? KF_LAST : KF, p);
  const bucket = Math.floor(frame / 2);

  const k = SIZE / 104; // 噪声位移随字号等比
  const jx = (rand(bucket * 5 + slot) - 0.5) * g * 36 * k;
  const jy = (rand(bucket * 9 + slot + 40) - 0.5) * g * 10 * k;
  const tear = g > 0.25;
  const bandTop = 12 + rand(bucket * 3 + 7) * 50;
  const bandH = 16 + rand(bucket * 11 + 3) * 24;
  const tearX = (rand(bucket * 13 + 5) - 0.5) * g * 160 * k;
  const split = g * 10 * k;

  const prog = Math.min(1, frame / DONE);
  const done = frame >= DONE;
  const landed = slot === N - 1 && p > 0.66;
  const bloom = landed ? Math.max(0, 1 - (frame - (slot * SLOT + SLOT * 0.66)) / 26) : 0;
  const link = ramp(frame, DONE + 2, 16, EASE.snappy);
  const pulse = 0.55 + 0.45 * Math.sin(frame / 4);
  const intro = ramp(frame, 0, 14, EASE.out);

  const row = (dx: number, clip?: string, key?: string) => (
    <div key={key} style={{
      position: clip ? 'absolute' : 'relative', left: 0, top: 0, display: 'flex',
      transform: `translateX(${dx.toFixed(1)}px)`, clipPath: clip,
      textShadow: g > 0.04
        ? `${split.toFixed(1)}px 0 ${alpha(SPLIT_A, 0.8 * Math.min(1, g * 1.4))}, ${(-split).toFixed(1)}px 0 ${alpha(SPLIT_B, 0.8 * Math.min(1, g * 1.4))}`
        : `0 0 ${(20 + 40 * bloom).toFixed(0)}px ${alpha(L.accent, 0.25 + 0.45 * bloom)}${bd ? `, ${halo}` : ''}`,
    }}>
      {Array.from({ length: MAXCH }, (_, i) => {
        const ch = text[i];
        let content = ch;
        let color: string = L.ink;
        if (ch !== ' ') {
          const hit = rand(i * 31 + bucket * 17 + slot * 97) < g;
          if (hit) {
            content = POOL[Math.floor(rand(i * 131 + bucket * 7 + slot * 13) * POOL.length)];
            color = rand(i + bucket) > 0.5 ? L.accent2 : L.ink3;
          }
        }
        return <span key={i} style={{ width: `${CELL}em`, textAlign: 'center', color, display: 'inline-block' }}>{content}</span>;
      })}
    </div>
  );

  const blocks = g > 0.45
    ? Array.from({ length: 3 }, (_, kk) => ({
      x: rand(bucket * 19 + kk * 7) * 100, y: rand(bucket * 23 + kk * 5) * 90,
      w: 4 + rand(bucket * 29 + kk) * 14, h: 6 + rand(bucket * 31 + kk) * 14, c: kk % 2 ? SPLIT_B : SPLIT_A,
    }))
    : [];

  const slotW = MAXCH * CELL * SIZE;
  const BAR_W = portrait ? 1600 : 1100;
  const boxW = Math.max(slotW, BAR_W);
  const statusFs = 30 * u;
  const busy = done ? 'HOÀN TẤT' : 'ĐANG XỬ LÝ';
  const labelFs = label.trim() ? fitSize(label, { family: fonts.mono, size: statusFs, maxWidth: boxW - statusFs * 0.74 * 18, minSize: statusFs * 0.6, letterSpacingEm: 0.14 }) : statusFs;
  const brandName = BRAND.name;
  const signFs = 40 * u;

  return (
    <AbsoluteFill>
      <Stage look={L} keyLight={{ x: 0.5, y: 0.45 }} fill={{ x: 0.82, y: 0.12 }} breathe={0.4} vignette={0.65}>
        {!bd && (<>
        {/* 信号带：短语背后一条横向柔光 */}
        <div style={{
          position: 'absolute', left: 0, right: 0, top: SH / 2 - 160 * u, height: 300 * u,
          background: `radial-gradient(ellipse 45% 50% at 50% 50%, ${alpha(L.accent, 0.16 + 0.1 * g)} 0%, ${alpha(L.accent, 0)} 70%)`,
        }} />
        {/* 扫描线（静态、极淡；竖屏铺满整个高度） */}
        <div style={{
          position: 'absolute', left: 0, top: 0, width: 1920, height: SH, opacity: 0.5,
          background: `repeating-linear-gradient(180deg, ${alpha('#000000', 0)} 0px, ${alpha('#000000', 0)} 3px, ${alpha('#000000', 0.22)} 4px)`,
        }} />
        </>)}
      </Stage>

      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', textShadow: bd ? halo : undefined }}>
        <div style={{ position: 'relative', width: boxW, opacity: intro }}>
          {/* 状态行 */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 18 * u, marginBottom: 54 * u, fontFamily: FONT.mono, fontSize: statusFs,
            letterSpacing: '0.14em', color: L.ink2, whiteSpace: 'nowrap', lineHeight: 1.4,
          }}>
            <span style={{
              width: 14 * u, height: 14 * u, borderRadius: 7 * u, boxSizing: 'border-box', border: `${2 * u}px solid ${L.accent2}`, flex: 'none',
              background: done ? L.accent2 : alpha(L.accent2, pulse * 0.8),
              boxShadow: `0 0 ${done ? 16 : 10 * pulse}px ${alpha(L.accent2, 0.7)}`,
            }} />
            <span style={{ color: done ? L.ink : L.ink2, fontWeight: 600 }}>{busy}</span>
            {label.trim() ? <span style={{ color: L.ink3 }}>·</span> : null}
            {label.trim() ? <span style={{ fontSize: labelFs }}>{label}</span> : null}
            <span style={{ marginLeft: 'auto', color: L.ink3 }}>#4127</span>
          </div>

          {/* 槽位：四角括号 + 短语 */}
          <div style={{ position: 'relative', padding: `${30 * u}px 0`, width: slotW, marginLeft: (boxW - slotW) / 2 }}>
            {[[0, 0], [1, 0], [0, 1], [1, 1]].map(([rx, ry], kk) => (
              <div key={kk} style={{
                position: 'absolute', width: 30 * u, height: 30 * u, left: rx ? undefined : -36 * u, right: rx ? -36 * u : undefined,
                top: ry ? undefined : 0, bottom: ry ? 0 : undefined,
                borderLeft: rx ? undefined : `${2 * u}px solid ${alpha(L.ink, 0.35)}`, borderRight: rx ? `${2 * u}px solid ${alpha(L.ink, 0.35)}` : undefined,
                borderTop: ry ? undefined : `${2 * u}px solid ${alpha(L.ink, 0.35)}`, borderBottom: ry ? `${2 * u}px solid ${alpha(L.ink, 0.35)}` : undefined,
              }} />
            ))}
            {/* 行高 1.45：越南语大写叠加声调（Ấ Ễ Ự）在字顶上方 ~0.3em，不能被撕裂带 clip 切掉 */}
            <div style={{
              position: 'relative', fontFamily: FONT.mono, fontSize: SIZE, fontWeight: 600, lineHeight: 1.45,
              transform: `translate(${jx.toFixed(1)}px,${jy.toFixed(1)}px)`, whiteSpace: 'pre',
            }}>
              {tear ? (
                <>
                  <div style={{ visibility: 'hidden' }}>{row(0)}</div>
                  {row(0, `inset(-40% -200px ${100 - bandTop}% -200px)`, 'a')}
                  {row(tearX, `inset(${bandTop}% -200px ${Math.max(0, 100 - bandTop - bandH)}% -200px)`, 'b')}
                  {row(0, `inset(${Math.min(100, bandTop + bandH)}% -200px -40% -200px)`, 'c')}
                </>
              ) : row(0)}
              {blocks.map((b, kk) => (
                <div key={kk} style={{
                  position: 'absolute', left: `${b.x}%`, top: `${b.y}%`, width: b.w * 4 * k, height: b.h * 2 * k,
                  background: alpha(b.c, 0.55), mixBlendMode: 'screen',
                }} />
              ))}
            </div>
          </div>

          {/* 进度轨：线性走满（全片唯一线性元素），分拍刻度 + 发光头 */}
          <div style={{ position: 'relative', marginTop: 56 * u, width: BAR_W, marginLeft: (boxW - BAR_W) / 2, height: 4 * u, borderRadius: 2 * u, background: alpha(L.ink, 0.1) }}>
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: `${prog * 100}%`, borderRadius: 2 * u,
              background: `linear-gradient(90deg, ${alpha(L.accent, 0.3)} 0%, ${L.accent} 70%, ${L.accent2} 100%)`,
              boxShadow: `0 0 14px ${alpha(L.accent, 0.6)}`,
            }} />
            {Array.from({ length: N - 1 }, (_, i) => i + 1).map((kk) => {
              const x = (kk * SLOT) / DONE;
              return (
                <div key={kk} style={{
                  position: 'absolute', left: `${x * 100}%`, top: -7 * u, width: 2 * u, height: 18 * u, marginLeft: -u,
                  background: prog >= x ? L.accent : alpha(L.ink, 0.25),
                }} />
              );
            })}
            <div style={{
              display: 'flex', justifyContent: 'space-between', position: 'absolute', left: 0, right: 0, top: 30 * u,
              fontFamily: FONT.mono, fontSize: 32 * u, letterSpacing: '0.1em', color: L.ink2, fontVariantNumeric: 'tabular-nums', lineHeight: 1.4,
            }}>
              <span>BƯỚC {slot + 1}/{N}</span>
              <span style={{ color: done ? L.ink : L.ink2 }}>{String(Math.round(prog * 100)).padStart(3, ' ')}%</span>
            </div>
          </div>

          {/* 收尾署名：视频品牌（没有品牌 → 不显示） */}
          {brandName ? (
            <div style={{
              position: 'absolute', left: 0, right: 0, bottom: -170 * u, display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 16 * u, fontFamily: FONT.sans, fontSize: signFs,
              fontWeight: 600, letterSpacing: '-0.01em', color: L.accent, opacity: link, transform: `translateY(${(1 - link) * 24}px)`,
            }}>
              <ShotcraftMark size={48 * u} tone="dark" />
              <span>{brandName}</span>
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
