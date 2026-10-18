// quad-split-parallel-scenes — Quad Split 四宫并行蒙太奇
// 手法卡：画面硬切 2×2 四宫格，四个象限并行跑各自独立的微场景，关键节拍互相错开 3–6 帧、全程无转场，
// 靠并行密度制造信息轰炸（格内内容可整体替换，错拍表才是配方）。
//
// 第二轮重设计（余烬 · 发布日的四个现场）：
// - look = ember（暖黑 · 橙 · 琥珀点缀）。四格是 video-shotcraft 出一支宣传片时同时发生的四件事，按明度做棋盘交错：
//   TL 奶油色 · 浏览器打开本地预览页（Launch film.）｜ TR 暖黑 · 终端 npx remotion render + 急推到「promo.mp4 ready」
//   BL 橙色实底 · 「Prompt. Render. Ship.」三个巨大的词逐个砸下（瑞士海报）｜ BR 拿铁色 · 光标点 Approve → Publish → 上线通知弹出
//   四格之间 8px 暖黑缝 + 20px 圆角，像一块 bento 发布板；格内字全部按 1080p 可读字号重排（≥32px，主词 132px）。
// - 错拍表（帧，30fps）——任意相邻重事件间隔 ≥3f，从不齐动：
//     TL  tab 6 / 11 / 16 / 21 弹入 · 0–40 地址栏打字 · 44 页面载入（大标题滑入）· 全程 inQuad 慢推 1→1.1
//     TR  0–24 命令打字 · 27 / 33 两行输出 · 37 末行出现 + 37–47 whip 急推 1→1.85（sin 包络模糊）
//     BL  14「Write.」· 30「Ship.」· 49「Repeat.」（overshoot 下落）
//     BR  4–14 卡片滑入 · 14–25 光标飞向 Approve · 25 点击 · 27–33 按钮变 Approved · 38–50 飞向 Publish · 52 点击 · 56 通知弹出
//   两处打字光标闪烁周期错开（16f vs 14f + 5 相位）。
// - 原版 2.1s 无收尾，这一轮加到 90f：0–62 并行轰炸，62–90 四格都落在终态海报上 hold（只剩光标闪烁与慢推）。
//
// [Agent Edit] Noi dung that:
// - o anh media1..media4 (anh HOAC video, ti le bat ky): o nao co media -> o do thay canh gia bang anh/video that (cover),
//   anh "dap" vao dung nhip rieng cua o (lech 6f), keo nhe suot canh + nhan goc (labels). O khong co media -> canh gia goc.
// - o chu: labels (4 nhan goc) / title + subtitle (trang web o 1) / code + done (terminal o 2) / words (2-3 tu dap o 3) /
//   card + toast (the duyet + thong bao o 4). Moi chu tu thu nho vua be ngang o.
// - Khung doc (portrait.mode = 'native'): 4 o xep DOC 1 cot (moi o ~1904x843), noi dung moi o phong ~1.6 lan, can giua.
import { useCurrentFrame, useImage, useList, useShotFonts, useText, useVideoConfig, fitSize } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, Img, OffthreadVideo } from 'remotion';
import { EASE, FONT, Grain, mix, ramp } from '../../../fixtures/Polish';
import { LOOKS, Stage, alpha, type } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

export const QUAD_SPLIT_PARALLEL_SCENES_DURATION = 90;

const L = LOOKS.ember;
const CREAM = '#f7eee4';
const LATTE = '#e9d7c4';
const ORANGE = L.accent;
const DARK = '#160d09';

// 四格几何：外边距 = 缝宽 8px；格内设计坐标 948×528（portrait 时整体放大居中）
const G = 8;
const QW = (1920 - 3 * G) / 2; // 948
const QH = (1080 - 3 * G) / 2; // 528

const blink = (f: number, period: number, phase = 0) => (Math.floor((f + phase) / (period / 2)) % 2 === 0 ? 1 : 0);
const typed = (s: string, f: number, a: number, b: number) => s.slice(0, Math.floor(ramp(f, a, b - a, EASE.linear) * s.length));
const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// 四格通用：角标（纹理级小字）
const Corner: React.FC<{ n: string; label: string; color: string; bold?: boolean }> = ({ n, label, color, bold }) =>
  label ? (
    <div style={{ position: 'absolute', left: 34, top: 28, ...type(bold ? 26 : 20, 700, { caps: true }), letterSpacing: '0.2em', color, opacity: bold ? 0.95 : 0.7, lineHeight: 1.3, whiteSpace: 'nowrap' }}>
      {n} — {label}
    </div>
  ) : null;

// 格内容器：背景铺满整格（cw×ch，设计坐标），内容按 948×528 居中
const Cell: React.FC<{ cw: number; ch: number; bg: string; children: React.ReactNode; corner?: React.ReactNode }> = ({ cw, ch, bg, children, corner }) => (
  <div style={{ position: 'absolute', inset: 0, background: bg }}>
    <div style={{ position: 'absolute', left: (cw - QW) / 2, top: (ch - QH) / 2, width: QW, height: QH }}>{children}</div>
    {corner}
  </div>
);

type QP = { f: number; cw: number; ch: number; label: string };

// ───────────── TL：浏览器打开本地预览页（不编域名：localhost 预览）─────────────
const URL = 'localhost:3000/demo';
const QuadTL: React.FC<QP & { title: string; sub: string }> = ({ f, cw, ch, label, title, sub }) => {
  const fonts = useShotFonts();
  const TABS = ['Trang chủ', 'Sản phẩm', 'Tài liệu', 'Demo'];
  const push = mix(1, 1.1, Math.pow(Math.min(1, f / 90), 2)); // inQuad 慢推：底噪运动
  const load = ramp(f, 44, 14, EASE.snappy);
  const tSize = fitSize(title, { family: fonts.sans, size: 96, maxWidth: 650, weight: 850, minSize: 40 });
  const sSize = fitSize(sub, { family: fonts.sans, size: 32, maxWidth: 650, weight: 500, minSize: 20 });
  return (
    <Cell cw={cw} ch={ch} bg={`radial-gradient(ellipse 90% 90% at 30% 20%, #fffaf3 0%, ${CREAM} 55%, #efe2d3 100%)`} corner={<Corner n="01" label={label} color="#9b8a7a" />}>
      <div style={{
        position: 'absolute', left: 104, top: 112, width: 740, height: 390, borderRadius: 20, background: '#fffdf9', overflow: 'hidden',
        border: '1px solid rgba(60,30,10,0.10)', boxShadow: `inset 0 1px 0 #fff, 0 2px 4px rgba(60,30,10,0.08), 0 30px 60px -24px rgba(60,30,10,0.35)`,
        transform: `scale(${push})`, transformOrigin: '50% 90%',
      }}>
        {/* 标签栏 */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 58, padding: '0 18px', background: '#f3e9de' }}>
          <div style={{ display: 'flex', gap: 8, alignSelf: 'center', marginRight: 10 }}>
            {['#ff6a52', '#ffbd3d', '#5fcf6a'].map((c) => <i key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />)}
          </div>
          {TABS.map((t, i) => {
            const k = ramp(f, 6 + i * 5, 9, EASE.overshoot);
            const active = i === TABS.length - 1;
            if (k <= 0) return null;
            return (
              <div key={t} style={{
                padding: '9px 18px 11px', borderRadius: '12px 12px 0 0', ...type(22, active ? 650 : 500), lineHeight: 1.2, whiteSpace: 'nowrap',
                background: active ? '#fffdf9' : 'rgba(60,30,10,0.05)', color: active ? DARK : '#8c7867',
                transform: `scale(${k})`, transformOrigin: '50% 100%',
              }}>{t}</div>
            );
          })}
        </div>
        {/* 地址栏 */}
        <div style={{ margin: '16px 22px', height: 62, borderRadius: 31, background: '#f6eee5', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 14 }}>
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#a08c7a" strokeWidth={2.2}><rect x={5} y={10} width={14} height={10} rx={2} /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
          <span style={{ ...type(34, 550), color: DARK }}>{typed(URL, f, 0, 40)}</span>
          <span style={{ width: 3, height: 36, background: ORANGE, opacity: f < 44 ? blink(f, 16) : 0, marginLeft: -10 }} />
        </div>
        {/* 页面：44f 载入，大标题从下滑入 */}
        <div style={{ position: 'absolute', left: 44, top: 168, right: 44 }}>
          <div style={{ height: 6, borderRadius: 3, background: ORANGE, width: `${load * 100}%`, opacity: 1 - ramp(f, 56, 6, EASE.linear), marginBottom: 20 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: load, height: 32 }}>
            <ShotcraftMark size={30} tone="light" />
            {BRAND.name ? <span style={{ fontFamily: BRAND.font, fontSize: 24, fontWeight: 700, letterSpacing: '0.03em', lineHeight: 1, color: DARK }}>{BRAND.name}</span> : null}
          </div>
          {/* 遮罩留足越南语声调空间（上 0.3em / 下 0.25em） */}
          <div style={{ overflow: 'hidden', marginTop: -tSize * 0.22, padding: `${(tSize * 0.3).toFixed(0)}px 0 ${(tSize * 0.25).toFixed(0)}px` }}>
            <div style={{ ...type(tSize, 850), lineHeight: 1.05, whiteSpace: 'nowrap', color: DARK, transform: `translateY(${(1 - load) * 160}%)` }}>{title}</div>
          </div>
          <div style={{ ...type(sSize, 500), color: '#7a6555', marginTop: -tSize * 0.18, whiteSpace: 'nowrap', lineHeight: 1.3, opacity: ramp(f, 50, 10, EASE.out) }}>{sub}</div>
        </div>
      </div>
    </Cell>
  );
};

// ───────────── TR：终端渲染 + whip 急推 ─────────────
const QuadTR: React.FC<QP & { cmd: string; done: string }> = ({ f, cw, ch, label, cmd, done }) => {
  const fonts = useShotFonts();
  const zip = ramp(f, 37, 10, EASE.smooth);
  const zoom = mix(1, 1.85, zip);
  const blur = 5 * Math.sin(Math.PI * zip);
  const old = 1 - 0.92 * zip; // 急推时前几行退成背景
  const line = (at: number) => ramp(f, at, 5, EASE.out);
  const mono = (s: number, w = 500): React.CSSProperties => ({ ...type(s, w, { mono: true }), whiteSpace: 'pre', lineHeight: 1.3 });
  // 末行急推 1.85 倍后仍要在格内：宽度上限 ≈ (948-80)/1.85
  const doneSize = fitSize(`● ${done}`, { family: fonts.mono, size: 40, maxWidth: 440, weight: 700, minSize: 22 });
  const cmdSize = fitSize(`$ ${cmd}`, { family: fonts.mono, size: 36, maxWidth: 780, weight: 500, minSize: 20 });
  return (
    <Cell cw={cw} ch={ch} bg={`radial-gradient(ellipse 80% 90% at 70% 10%, #2a1810 0%, ${DARK} 60%, #0d0705 100%)`} corner={<Corner n="02" label={label} color={L.ink3} />}>
      <div style={{
        position: 'absolute', left: 80, top: 100, width: 800,
        transform: `translateY(${(-40 * zip).toFixed(2)}px) scale(${zoom})`, transformOrigin: '0px 225px', filter: blur > 0.2 ? `blur(${blur.toFixed(2)}px)` : undefined,
      }}>
        <div style={{ ...mono(cmdSize), color: L.ink, opacity: old }}>
          <span style={{ color: ORANGE }}>$ </span>{typed(cmd, f, 0, 24)}
          <span style={{ display: 'inline-block', width: 20, height: 38, verticalAlign: '-6px', background: L.ink, opacity: f < 27 ? blink(f, 14, 5) : 0 }} />
        </div>
        <div style={{ ...mono(32), color: L.ink2, marginTop: 24, opacity: line(27) * old, transform: `translateX(${(1 - line(27)) * -16}px)` }}>
          <span style={{ color: L.accent2 }}>✓</span> đóng gói    1.8s
        </div>
        <div style={{ ...mono(32), color: L.ink2, marginTop: 8, opacity: line(33) * old, transform: `translateX(${(1 - line(33)) * -16}px)` }}>
          <span style={{ color: L.accent2 }}>✓</span> khung hình  900/900
        </div>
        <div style={{ ...mono(doneSize, 700), color: L.ink, marginTop: 30, opacity: line(37) }}>
          <span style={{ color: ORANGE, textShadow: `0 0 18px ${alpha(ORANGE, 0.8)}` }}>●</span> {done}
        </div>
      </div>
    </Cell>
  );
};

// ───────────── BL：三词砸下 ─────────────
const WORD_AT = [14, 30, 49];
const QuadBL: React.FC<QP & { words: string[] }> = ({ f, cw, ch, label, words }) => {
  const fonts = useShotFonts();
  const ws = words.slice(0, 3);
  const at = ws.length === 2 ? [14, 36] : WORD_AT;
  const size = Math.min(...ws.map((w) => fitSize(w, { family: fonts.sans, size: ws.length === 2 ? 150 : 124, maxWidth: 820, weight: 900, minSize: 48 })));
  const lh = size * 1.14;
  return (
    <Cell cw={cw} ch={ch} bg={`linear-gradient(150deg, #ff8340 0%, ${ORANGE} 45%, #e8541c 100%)`} corner={<Corner n="03" label={label} color={DARK} />}>
      <div style={{ position: 'absolute', left: 64, top: Math.max(70, (QH + 50 - ws.length * lh) / 2) }}>
        {ws.map((w, i) => {
          const s = Math.min(1, Math.max(0, (f - at[i]) / 8));
          if (s <= 0) return <div key={i} style={{ height: lh }} />;
          const y = (1 - EASE.overshoot(s)) * -70;
          const last = i === ws.length - 1;
          return (
            <div key={i} style={{
              ...type(size, 900), lineHeight: 1.14, whiteSpace: 'nowrap', color: last ? CREAM : DARK, opacity: Math.min(1, s * 3),
              transform: `translateY(${y.toFixed(2)}px) scale(${mix(1.12, 1, EASE.snappy(s)).toFixed(4)})`, transformOrigin: '0% 100%',
            }}>{w}</div>
          );
        })}
      </div>
    </Cell>
  );
};

// ───────────── BR：审批 → 发布 → 上线通知 ─────────────
// 光标锚点（格内坐标，tip）
const P_START: [number, number] = [860, 470];
const P_APPROVE: [number, number] = [270, 318];
const P_PUBLISH: [number, number] = [560, 318];
const qBez = (a: number[], b: number[], c: number[], t: number): [number, number] => {
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]];
};
const QuadBR: React.FC<QP & { card: string; toast: string }> = ({ f, cw, ch, label, card, toast: toastText }) => {
  const fonts = useShotFonts();
  const slide = ramp(f, 4, 10, EASE.snappy);
  const m1 = ramp(f, 14, 11, EASE.swift);
  const m2 = ramp(f, 38, 12, EASE.swift);
  const p = m2 > 0 ? qBez(P_APPROVE, [470, 250], P_PUBLISH, m2) : qBez(P_START, [620, 520], P_APPROVE, m1);
  const press = (at: number) => Math.sin(Math.PI * Math.min(1, Math.max(0, (f - at) / 5)));
  const approved = ramp(f, 27, 6, EASE.snappy);
  const published = f >= 54;
  const toast = ramp(f, 56, 10, EASE.overshoot);
  const cardSize = fitSize(card, { family: fonts.sans, size: 40, maxWidth: 410, weight: 750, minSize: 22 });
  const toastSize = fitSize(`${toastText} · 3.214 lượt xem`, { family: fonts.sans, size: 32, maxWidth: 700, weight: 650, minSize: 20 });
  return (
    <Cell cw={cw} ch={ch} bg={`radial-gradient(ellipse 90% 90% at 70% 20%, #f4e6d6 0%, ${LATTE} 60%, #dcc5ae 100%)`} corner={<Corner n="04" label={label} color="#8f735c" />}>
      {/* 发布审批卡 */}
      <div style={{
        position: 'absolute', left: 120, top: 120, width: 620, padding: '30px 34px', borderRadius: 22, background: '#fffaf4',
        border: '1px solid rgba(60,30,10,0.10)', boxShadow: '0 2px 4px rgba(60,30,10,0.08), 0 26px 50px -22px rgba(60,30,10,0.4)',
        transform: `translateX(${(1 - slide) * -60}px)`, opacity: slide,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: 52 }}>
          <div style={{ ...type(cardSize, 750), color: DARK, whiteSpace: 'nowrap', lineHeight: 1.3 }}>{card}</div>
          <div style={{ marginLeft: 'auto', display: 'flex' }}>
            {['#e8541c', '#3d5a80', '#c4552d'].map((c, i) => (
              <div key={c} style={{ width: 40, height: 40, borderRadius: 20, background: c, border: '3px solid #fffaf4', marginLeft: i ? -12 : 0, ...type(18, 700), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{'MLT'[i]}</div>
            ))}
          </div>
        </div>
        <div style={{ ...type(30, 500), color: '#7a6555', marginTop: 6, lineHeight: 1.3 }}>12 cảnh · 2 người duyệt</div>
        <div style={{ display: 'flex', gap: 16, marginTop: 26 }}>
          <div style={{
            width: 260, height: 70, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            border: `2px solid ${approved > 0.5 ? '#2f9e5b' : 'rgba(60,30,10,0.22)'}`, background: approved > 0.5 ? 'rgba(47,158,91,0.12)' : 'transparent',
            ...type(32, 650), lineHeight: 1.2, color: approved > 0.5 ? '#237a46' : DARK, transform: `scale(${1 - 0.06 * press(25)})`,
          }}>{approved > 0.5 ? 'Đã duyệt ✓' : 'Duyệt'}</div>
          <div style={{
            width: 280, height: 70, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: published ? ORANGE : DARK, ...type(32, 700), lineHeight: 1.2, color: published ? L.onAccent : CREAM,
            opacity: mix(0.45, 1, approved), transform: `scale(${1 - 0.06 * press(52)})`,
          }}>{published ? 'Đã đăng' : 'Đăng ngay'}</div>
        </div>
      </div>
      {/* 上线通知：链尾重音 */}
      {toast > 0 && (
        <div style={{
          position: 'absolute', right: 56, bottom: 44, padding: '18px 26px', borderRadius: 18, background: DARK, display: 'flex', alignItems: 'center', gap: 16,
          boxShadow: '0 24px 50px -18px rgba(30,12,4,0.7)', transform: `translateY(${(1 - toast) * 40}px) scale(${mix(0.85, 1, toast)})`, opacity: Math.min(1, toast * 2),
        }}>
          <span style={{ width: 16, height: 16, borderRadius: 8, background: ORANGE, boxShadow: `0 0 14px ${ORANGE}` }} />
          <span style={{ ...type(toastSize, 650), lineHeight: 1.3, whiteSpace: 'nowrap', color: CREAM }}>{toastText} · <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(Math.round(3214 * ramp(f, 56, 30, EASE.snappy)))}</span> lượt xem</span>
        </div>
      )}
      {/* 光标 */}
      {f >= 10 && f < 76 && (
        <svg width={34} height={46} viewBox="-1 -1 18 26" style={{
          position: 'absolute', left: p[0], top: p[1], overflow: 'visible', opacity: ramp(f, 10, 4, EASE.out) * (1 - ramp(f, 68, 8, EASE.exit)),
          transform: `scale(${1 - 0.18 * Math.max(press(25), press(52))})`, transformOrigin: '0 0', filter: 'drop-shadow(0 3px 5px rgba(40,20,8,0.4))',
        }}>
          <path d="M0 0 L0 20.5 L4.9 15.9 L8.1 23.4 L11.4 22 L8.3 14.7 L14.8 14.7 Z" fill={DARK} stroke="#fff" strokeWidth={1.6} strokeLinejoin="round" />
        </svg>
      )}
    </Cell>
  );
};

// ───────────── 实拍格：图片 / 视频（任意比例，cover），在本格的错拍点「砸」进来 ─────────────
const MEDIA_AT = [4, 10, 16, 22]; // 四格入场错开 6f
const isVideo = (u: string) => /\.(mp4|mov|webm|m4v|mkv)(\?|#|$)/i.test(u);
const QuadMedia: React.FC<QP & { src: string; i: number }> = ({ f, src, i, label }) => {
  const at = MEDIA_AT[i];
  const k = ramp(f, at, 9, EASE.snappy);
  const flash = Math.max(0, 1 - Math.abs(f - at - 1) / 4) * 0.35;
  const push = mix(1, 1.08, Math.pow(Math.min(1, Math.max(0, f - at) / (90 - at)), 2)); // inQuad 慢推（底噪运动）
  const scale = mix(1.18, 1, k) * push;
  const media: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${scale.toFixed(4)})` };
  return (
    <div style={{ position: 'absolute', inset: 0, background: i % 3 === 0 ? '#2a1a12' : DARK }}>
      {f >= at ? (
        <div style={{ position: 'absolute', inset: 0, opacity: Math.min(1, k * 2.5) }}>
          {isVideo(src) ? <OffthreadVideo src={src} muted style={media} /> : <Img src={src} style={media} />}
        </div>
      ) : null}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(10,5,3,0.55) 0%, rgba(10,5,3,0) 28%)' }} />
      <div style={{ position: 'absolute', inset: 0, background: '#fff', opacity: flash }} />
      <Corner n={`0${i + 1}`} label={label} color={CREAM} bold />
    </div>
  );
};

export const QuadSplitParallelScenes: React.FC = () => {
  const f = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const portrait = SH > 1080 * 1.2;
  const labels = useList('labels', ['Trang web', 'Xuất bản', 'Thông điệp', 'Duyệt']);
  const title = useText('title', 'Ra mắt hôm nay.');
  const sub = useText('subtitle', 'Mọi thứ sẵn sàng chỉ trong một buổi chiều.');
  const cmd = useText('code', 'npm run build');
  const done = useText('done', 'video.mp4 xong');
  const words = useList('words', ['Ý tưởng.', 'Thực hiện.', 'Ra mắt.']);
  const card = useText('card', 'Video ra mắt · bản 3');
  const toast = useText('toast', 'Đã lên sóng');
  const media = [useImage('media1'), useImage('media2'), useImage('media3'), useImage('media4')];

  // 几何：landscape 2×2（原版）；portrait 4×1 竖排，格内内容按 s 放大
  const cells = portrait
    ? [0, 1, 2, 3].map((i) => {
        const h = (SH - 5 * G) / 4;
        return { x: G, y: G + i * (h + G), w: 1920 - 2 * G, h };
      })
    : [0, 1, 2, 3].map((i) => ({ x: G + (i % 2) * (QW + G), y: G + Math.floor(i / 2) * (QH + G), w: QW, h: QH }));
  const s = portrait ? Math.min(cells[0].w / QW, cells[0].h / QH) : 1;

  return (
    <AbsoluteFill style={{ fontFamily: FONT.sans, overflow: 'hidden' }}>
      <Stage look={L} keyLight={{ x: 0.5, y: 0.5 }} fill={null} grain={0} vignette={0.3} />
      {cells.map((c, i) => {
        const cw = c.w / s;
        const ch = c.h / s;
        const qp: QP = { f, cw, ch, label: labels[i] ?? '' };
        const src = media[i];
        const scene = src ? <QuadMedia {...qp} src={src} i={i} /> : i === 0 ? <QuadTL {...qp} title={title} sub={sub} /> : i === 1 ? <QuadTR {...qp} cmd={cmd} done={done} /> : i === 2 ? <QuadBL {...qp} words={words} /> : <QuadBR {...qp} card={card} toast={toast} />;
        return (
          <div key={i} style={{
            position: 'absolute', left: c.x, top: c.y, width: c.w, height: c.h, borderRadius: 20, overflow: 'hidden',
            boxShadow: `inset 0 1px 0 ${alpha('#ffffff', i === 1 ? 0.06 : 0.35)}`,
          }}>
            {/* 格内设计坐标：cw×ch，按 s 放大（landscape s = 1） */}
            <div style={{ position: 'absolute', left: 0, top: 0, width: cw, height: ch, transform: s !== 1 ? `scale(${s.toFixed(5)})` : undefined, transformOrigin: '0 0' }}>
              {scene}
            </div>
          </div>
        );
      })}
      <Grain opacity={0.06} blend="overlay" />
    </AbsoluteFill>
  );
};
