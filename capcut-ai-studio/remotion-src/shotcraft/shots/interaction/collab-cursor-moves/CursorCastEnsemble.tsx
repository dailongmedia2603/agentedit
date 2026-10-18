// cursor-cast-ensemble —— figma 0:05 (cursor-badge-cast) + miro 全片 cursor-ensemble-ambience
// 五枚具名彩色光标错峰飞入一块白板画布，落位后持续漂移当"团队在场"的氛围层；其中一枚（Rita）
// 停在中央简报卡上打字补完标题（cameo），最后全员聚拢到卡片四周围观。
//
// 第二轮重设计（瓷白 · 无限画布的"开工会"）：
// - look = porcelain（冷白 + 钴蓝）。画面是 video-shotcraft 的一块分镜白板：左上标志 + 板名、右上在线头像组、
//   底部浮动工具条，点阵画布上 6 张便签（34px 正文，读得清）+ 中央一张大简报卡。不再是灰阶道具。
// - 身份编码贯穿全画面：五人五色（Ines 钴蓝 / Kofi 翠绿 / Mei 橘 / Tomás 紫 / Rita 洋红），
//   便签底色是作者色的淡彩、角落有作者色圆点；右上头像组随每个人入场同帧弹出——"人到了"三处同时成立。
// - Rita 的光标挂在打字光标上（行内锚点）：标题 "Ship a launch film by Friday." 88px 逐字出现，
//   她的箭头始终跟着插入点走、换行也跟着换；打完后卡片状态 Draft → Ready。
// - 空间：画布 / 便签 / 简报卡 / 光标四层，全程极缓推镜（1 → 1.045，焦点在卡片），远层便签视差更小、
//   轻微虚化降对比，近层清晰；光标投影 + 名牌带色辉光。
//
// 时间表（30fps，共 156f）：
//   0–4      画布、便签、空简报卡已在（开场即有画面），推镜开始
//   2–30     四枚光标从四边错峰 spring 飞入（stagger 先密后疏），名牌晚 10f 随减速淡入上浮；头像组同帧弹出
//   20–46    Rita 从顶部飞入，落到标题起点
//   48–104   打字：28 字 + 人手节奏抖动（1.6–2.4f/字），Rita 手稳（不漂移），箭头跟插入点
//   104–112  卡片状态 Draft → Ready（绿点）
//   98–126   其余四人 smooth 聚拢到卡片四周（漂移保留 25%，不归零），不压标题
//   126–156  hold：漂移继续、推镜继续（画面活着，但不抢）
//
// [Agent Edit] o chu: title (cau duoc go tren the giua), names (5 ten nguoi; nguoi thu 5 = nguoi go chu),
// notes (6 ghi chu dan quanh), board (ten bang tren cung). Chu giao dien khac = tieng Viet trung tinh.
// Tieu de dai: co chu tu thu nho (ngang toi da 2 dong, doc 3 dong); nhip go nen lai de go xong truoc ~104f.
// Khung doc (native): the giua rong gan het be ngang, ghi chu xep 2 hang tren / duoi the, con tro / ten to hon;
// vi tri bay vao / lang vang / tu lai tinh theo hinh chu nhat cua the (khong con so cung 1920x1080).
import { useBackdrop, useCurrentFrame, useList, useShotFonts, useText, useVideoConfig, fitSize, wrapLines, useShot } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, ramp, mix } from '../../../fixtures/Polish';
import { LOOKS, Stage, alpha, springAt, type, TYPE } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

// [Agent Edit] o chu TUY CHON: app da gui noi dung (co texts) ma bo trong o nay -> '' (an di), khong hien chu mau
const useOptText = (id: string, sample: string): string => {
  const d = useShot();
  const v = useText(id, sample);
  const t = d?.texts[id];
  const app = !!d && Object.keys(d.texts).length > 0;
  return app && (t === undefined || (typeof t === 'string' && !t.trim())) ? '' : v;
};


export const CURSOR_CAST_ENSEMBLE_DURATION = 156;

const L = LOOKS.porcelain;
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

const mulberry32 = (a: number) => () => {
  let t = (a += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

type Actor = {
  name: string; initial: string; color: string; tint: string;
  from: [number, number]; home: [number, number]; gather: [number, number];
  delay: number; phase: number;
};

// 名牌颜色 = 身份编码：五人五色，便签 / 头像 / 光标三处一致（位置在组件内按卡片矩形换算）
const CAST = [
  { color: '#2f5bff', tint: '#e3eaff', delay: 2, phase: 0.0 },
  { color: '#0e9f6e', tint: '#dcf4e8', delay: 7, phase: 1.7 },
  { color: '#f26a1b', tint: '#ffe9d8', delay: 11, phase: 3.1 },
  { color: '#7b4dff', tint: '#ece4ff', delay: 16, phase: 4.4 },
  { color: '#ec2f7c', tint: '#ffe2ee', delay: 22, phase: 5.6 },
];
const RITA = 4;
const TYPE0 = 48;
const TYPE_LAST = 102; // 最后一字最晚出现帧（与原片收尾一致）
const READY = 106;

// 人手打字节奏：每字 1.6–2.4f（确定性抖动），空格后略停；长句整体压缩到 TYPE_LAST 前打完
const typeTimes = (title: string[]): number[] => {
  const r = mulberry32(41);
  const at: number[] = [];
  let f = 0;
  for (let i = 0; i < title.length; i++) {
    at.push(f);
    f += 1.6 + r() * 0.8 + (title[i] === ' ' ? 0.9 : 0);
  }
  const last = at[at.length - 1] || 0;
  const k = last > TYPE_LAST - TYPE0 ? (TYPE_LAST - TYPE0) / last : 1;
  return at.map((t) => TYPE0 + t * k);
};

// 便签：作者 = 下标；depth 0 近 / 1 远（远层小一点、虚一点、视差小）。横版位置 = 原片
const NOTE_META = [
  { x: 96, y: 156, rot: -3.2, owner: 0, depth: 1, meta: '4 lượt thích' },
  { x: 1540, y: 150, rot: 2.6, owner: 1, depth: 1, meta: 'Đang duyệt' },
  { x: 60, y: 560, rot: 2.2, owner: 2, depth: 0, meta: '2 bình luận' },
  { x: 1580, y: 560, rot: -2.4, owner: 3, depth: 0, meta: 'Hạn thứ Tư' },
  { x: 560, y: 812, rot: -1.6, owner: 4, depth: 1, meta: 'Đang chạy' },
  { x: 1090, y: 820, rot: 1.8, owner: 0, depth: 1, meta: 'Cần sửa' },
];

const ARROW = 'M0.5 0.5 L0.5 17.2 L4.7 13.4 L7.3 19.5 L10 18.3 L7.4 12.3 L13 12.3 Z';


const Cursor: React.FC<{ a: Actor; badge: number; ck?: number; style?: React.CSSProperties }> = ({ a, badge, ck = 4.2, style }) => {
  const CK = ck; // 光标每单位像素（横版 4.2 ≈ 84px 高）
  const k = CK / 4.2;
  return (
  <div style={{ position: 'absolute', ...style }}>
    <svg width={14 * CK} height={21 * CK} viewBox="0 0 14 21" style={{ display: 'block', overflow: 'visible', filter: `drop-shadow(0 3px 4px ${alpha(L.shadow, 0.28)})` }}>
      <path d={ARROW} fill={a.color} stroke="#ffffff" strokeWidth={1.1} strokeLinejoin="round" />
    </svg>
    <div style={{
      position: 'absolute', left: 9.4 * CK, top: 17.6 * CK, whiteSpace: 'nowrap',
      background: `linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0) 50%), ${a.color}`,
      color: '#fff', borderRadius: `${6 * k}px ${18 * k}px ${18 * k}px ${18 * k}px`, padding: `${7 * k}px ${16 * k}px ${8 * k}px`,
      ...type(26 * k, 680), lineHeight: 1.25, letterSpacing: '-0.005em',
      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.3), 0 2px 4px ${alpha(L.shadow, 0.14)}, 0 8px 22px -6px ${alpha(a.color, 0.55)}`,
      opacity: badge, transform: `translateY(${(1 - badge) * 12}px)`,
    }}>
      {a.name}
    </div>
  </div>
  );
};

export const CursorCastEnsemble: React.FC = () => {
  const f = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const P = SH > 1080 * 1.2;
  const K = P ? 1.55 : 1; // 竖版 UI 放大系数
  const titleText = useText('title', 'Ra mắt khoá học trước thứ Sáu.');
  const names = useList('names', ['Lan', 'Minh', 'Hà', 'Tuấn', 'Vy']);
  const noteTexts = useList('notes', ['Mở đầu bằng câu hỏi', 'Thiết kế ảnh bìa', 'Kịch bản 5 tập', 'Quay ở studio', 'Đăng ký: 214', 'Lồng tiếng']);
  const board = useOptText('board', 'Kế hoạch ra mắt');
  const TITLE = Array.from(titleText);

  // ── 卡片矩形 + 标题字号 ──
  const CW = P ? 1720 : 1056;
  const PADC = P ? 80 : 56;
  const TS0 = P ? 140 : 88;
  const maxL = P ? 3 : 2;
  let TITLE_FS = TS0;
  for (let i = 0; i < 12; i++) {
    const ls = wrapLines(titleText, fonts.sans, TITLE_FS, CW - PADC * 2 - 40, 760, 9);
    if (ls.length <= maxL && ls.every((l) => fitSize(l, { family: fonts.sans, size: TITLE_FS, maxWidth: CW - PADC * 2 - 40, weight: 760 }) >= TITLE_FS)) break;
    TITLE_FS *= 0.9;
  }
  const nLines = Math.min(maxL, wrapLines(titleText, fonts.sans, TITLE_FS, CW - PADC * 2 - 40, 760, 9).length);
  const TLH = 1.12;
  const CH = P ? PADC * 2 + 60 * K + 30 + Math.max(2, nLines) * TITLE_FS * TLH + 70 + 60 * K : 432;
  const CARD = { x: (1920 - CW) / 2, y: P ? Math.round(SH / 2 - CH / 2) : 318, w: CW, h: CH, pad: PADC };
  const CK = P ? 6.2 : 4.2;

  // ── 演员：横版 = 原片坐标（按卡片换算），竖版 = 便签行里 / 卡片四周 ──
  const { x: X, y: Y, w: W, h: H } = CARD;
  const geo: { from: [number, number]; home: [number, number]; gather: [number, number] }[] = P
    ? [
      { from: [-200, Y - 700], home: [X + 180, Y - 300], gather: [X + 30, Y - 70] },
      { from: [2120, Y - 760], home: [X + W - 430, Y - 380], gather: [X + W - 440, Y - 50] },
      { from: [-200, Y + H + 520], home: [X + 160, Y + H + 300], gather: [X + W * 0.42, Y + H + 40] },
      { from: [2120, Y + H + 560], home: [X + W - 420, Y + H + 340], gather: [X + W - 400, Y + H + 60] },
      { from: [X + 548, Y - 900], home: [0, 0], gather: [0, 0] },
    ]
    : [
      { from: [-160, 260], home: [X - 102, Y + 152], gather: [X - 114, Y + 54] },
      { from: [2080, 220], home: [X + W + 112, Y + 152], gather: [X + W + 24, Y + 12] },
      { from: [-160, 980], home: [X - 52, Y + H + 110], gather: [X + 468, Y + H + 34] },
      { from: [2080, 1000], home: [X + W + 52, Y + H + 130], gather: [X + W - 18, Y + H + 50] },
      { from: [980, -200], home: [0, 0], gather: [0, 0] },
    ];
  const ACTORS: Actor[] = CAST.map((c, i) => {
    const name = (names[i] || '').trim() || ['Lan', 'Minh', 'Hà', 'Tuấn', 'Vy'][i];
    return { ...c, ...geo[i], name, initial: Array.from(name)[0].toUpperCase() };
  });
  // 便签：竖版两行在卡片上方、一行在下方（3 + 3）
  const NK = P ? 1.7 : 1; // 便签放大
  const NW = 288 * NK;
  const NH = 232 * NK;
  const NOTES = NOTE_META.map((n, i) => {
    let x = n.x, y = n.y;
    if (P) {
      const row = i < 3 ? 0 : 1;
      const col = i % 3;
      x = 90 + col * ((1920 - 180 - NW) / 2) + (row ? 30 : -10);
      y = row === 0 ? Y - 230 - NH + (col === 1 ? -70 : 0) : Y + H + 200 + (col === 1 ? 80 : 0);
    }
    return { ...n, x, y, title: noteTexts[i] || '' };
  }).filter((n) => n.title);
  const noteFs = (t: string) => {
    const ls = wrapLines(t, fonts.sans, 36 * NK, NW - 52 * NK, 700, 3);
    return Math.min(36 * NK, ...ls.map((l) => fitSize(l, { family: fonts.sans, size: 36 * NK, maxWidth: NW - 52 * NK, weight: 700, minSize: 18 })));
  };
  const TYPE_AT = typeTimes(TITLE);
  const TYPE_END = TYPE_AT[TYPE_AT.length - 1] ?? TYPE0;
  const TITLE_TOP = CARD.y + CARD.pad + 66 * K;
  const boardFs = fitSize(board, { family: fonts.sans, size: 32 * K, maxWidth: P ? 900 : 760, weight: 700, minSize: 20 });

  // 推镜：全程极缓，焦点在卡片中心偏上
  const cam = mix(1, 1.045, ramp(f, 0, 156, EASE.swift));

  const gatherT = ramp(f, 98, 28, EASE.smooth);
  const typed = TYPE_AT.filter((t) => f >= t).length;
  const ready = ramp(f, READY, 8, EASE.out);
  const typingHold = clamp01((f - 40) / 8); // Rita 手稳

  // 光标位置（画布坐标）
  const posOf = (i: number): [number, number] => {
    const a = ACTORS[i];
    const s = springAt(f, a.delay, { damping: 15, stiffness: 80, mass: 0.9 });
    let x = mix(a.from[0], a.home[0], s);
    let y = mix(a.from[1], a.home[1], s);
    const settled = clamp01((f - a.delay - 20) / 12);
    const dX = Math.sin(f * 0.055 + a.phase) * 40 + Math.sin(f * 0.021 + a.phase * 2) * 26;
    const dY = Math.cos(f * 0.047 + a.phase * 1.3) * 32 + Math.cos(f * 0.017 + a.phase) * 20;
    x += dX * settled * (1 - gatherT);
    y += dY * settled * (1 - gatherT);
    x = mix(x, a.gather[0] + dX * 0.25, gatherT);
    y = mix(y, a.gather[1] + dY * 0.25, gatherT);
    return [x, y];
  };

  // Rita：飞入段的偏移（相对插入点锚点），落定后锚在插入点
  const rita = ACTORS[RITA];
  const rs = springAt(f, rita.delay, { damping: 16, stiffness: 70, mass: 1 });
  const anchor0: [number, number] = [CARD.x + CARD.pad, TITLE_TOP];
  const rDrift = 1 - typingHold * (f < TYPE_END + 6 ? 1 : 1 - clamp01((f - TYPE_END - 6) / 14) * 0.75);
  const ritaOff: [number, number] = [
    // 落定偏移 (12, -8)：箭头尖停在插入点右上，身体和名牌落在"还没打出来"的空位里，不压已打的字
    (rita.from[0] - anchor0[0]) * (1 - rs) + 12 * K + Math.sin(f * 0.06 + 1) * 18 * rDrift,
    (rita.from[1] - anchor0[1]) * (1 - rs) - 8 * K + Math.cos(f * 0.05) * 14 * rDrift,
  ];
  const caretOn = typed < TITLE.length || Math.floor(f / 9) % 2 === 0;

  // [Agent Edit] NEN ANH AI: bo nen sang (Stage tu bo gradient); ten bang nam truc tiep tren nen co bong sang
  const bd = useBackdrop();
  const ts = bd ? '0 1px 12px rgba(255,255,255,0.7)' : undefined;
  const avatarPop = (i: number) => springAt(f, ACTORS[i].delay + 8, { damping: 15, stiffness: 190 });

  return (
    <AbsoluteFill style={{ background: bd ? 'transparent' : L.bg[1], overflow: 'hidden' }}>
      <Stage look={L} keyLight={{ x: 0.5, y: 0.36 }} fill={{ x: 0.9, y: 0.95 }} vignette={0.2} />
      {/* [Agent Edit] bo luoi cham (点阵画布) trang tri theo yeu cau: khong luoi ke o / luoi cham */}

      {/* 画布层（便签 + 简报卡 + 光标）随推镜缩放 */}
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${cam})`, transformOrigin: '50% 48%' }}>
        {NOTES.map((n, i) => {
          const o = ACTORS[n.owner];
          const far = n.depth === 1;
          return (
            <div key={i} style={{
              position: 'absolute', left: n.x, top: n.y, width: NW, height: NH, borderRadius: 10 * NK,
              background: `linear-gradient(180deg, rgba(255,255,255,0.5), rgba(255,255,255,0) 30%), ${o.tint}`,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 2px ${alpha(L.shadow, 0.08)}, 0 18px 34px -16px ${alpha(L.shadow, 0.3)}`,
              transform: `rotate(${n.rot}deg) scale(${far ? 0.94 : 1})`,
              filter: far ? 'blur(1.4px) saturate(0.85)' : undefined, opacity: far ? 0.78 : 1,
              padding: P ? '44px 44px 36px' : '26px 26px 22px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ ...type(noteFs(n.title), 700), color: alpha(L.ink, 0.86), lineHeight: 1.18 }}>{n.title}</div>
              <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 14 * NK, height: 14 * NK, borderRadius: 12, background: o.color, flex: 'none' }} />
                <span style={{ ...type(24 * NK, 560), lineHeight: 1.3, color: alpha(L.ink, 0.5), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.name} · {n.meta}</span>
              </div>
            </div>
          );
        })}

        {/* 中央简报卡：Rita 打字的舞台 */}
        <div style={{
          position: 'absolute', left: CARD.x, top: CARD.y, width: CARD.w, height: CARD.h, borderRadius: 28 * K,
          background: 'linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%)', border: `1px solid ${L.line}`,
          boxShadow: `inset 0 1px 0 #fff, 0 2px 4px ${alpha(L.shadow, 0.06)}, 0 40px 80px -30px ${alpha(L.shadow, 0.35)}`,
          padding: CARD.pad, boxSizing: 'border-box',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 * K, height: 40 * K }}>
            <span style={{ ...type((TYPE.label + 2) * K, 700), lineHeight: 1.3, letterSpacing: '0.16em', color: L.ink3, whiteSpace: 'nowrap' }}>TÓM TẮT DỰ ÁN</span>
            <span style={{ width: 5 * K, height: 5 * K, borderRadius: 4, background: L.ink3 }} />
            <span style={{ ...type(28 * K, 520), lineHeight: 1.3, color: L.ink2, whiteSpace: 'nowrap' }}>Hạn: thứ Năm</span>
            {/* 状态：Draft → Ready */}
            <span style={{
              marginLeft: 'auto', position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 10 * K, height: 44 * K, padding: `0 ${18 * K}px`,
              borderRadius: 22 * K, whiteSpace: 'nowrap', background: ready > 0.5 ? alpha('#0e9f6e', 0.1) : L.surface2,
              border: `1px solid ${ready > 0.5 ? alpha('#0e9f6e', 0.3) : L.line}`,
              transform: `scale(${1 + 0.06 * Math.sin(Math.PI * ready)})`,
            }}>
              <span style={{ width: 12 * K, height: 12 * K, borderRadius: 10, background: ready > 0.5 ? '#0e9f6e' : L.ink3 }} />
              <span style={{ ...type(26 * K, 650), lineHeight: 1.3, color: ready > 0.5 ? '#0b7a55' : L.ink2 }}>{ready > 0.5 ? 'Sẵn sàng' : 'Bản nháp'}</span>
            </span>
          </div>
          {/* 标题：逐字 + Rita 的插入点（行内锚点，箭头挂在上面） */}
          <div style={{ marginTop: 26 * K, ...type(TITLE_FS, 760), color: L.ink, lineHeight: TLH, minHeight: TITLE_FS * TLH * 2, paddingRight: 40 }}>
            {TITLE.slice(0, typed).join('')}
            <span style={{ position: 'relative', display: 'inline-block', width: 0, height: TITLE_FS * 0.8, verticalAlign: '-0.06em' }}>
              <span style={{
                position: 'absolute', left: 3, top: -4, width: 6, height: TITLE_FS * 0.92, borderRadius: 3, background: rita.color,
                opacity: f >= TYPE0 - 6 && caretOn ? 1 : 0,
              }} />
              <Cursor a={rita} ck={CK} badge={ramp(f, rita.delay + 12, 12, EASE.out)} style={{ left: ritaOff[0], top: ritaOff[1], zIndex: 5 }} />
            </span>
          </div>
          {/* 卡片底部：负责人 + 进度（辅助信息，32px 档） */}
          <div style={{ position: 'absolute', left: CARD.pad, right: CARD.pad, bottom: CARD.pad - 6, display: 'flex', alignItems: 'center', gap: 28 * K }}>
            <span style={{ display: 'flex' }}>
              {[4, 0, 1].map((k, j) => (
                <span key={k} style={{
                  width: 44 * K, height: 44 * K, borderRadius: 40, background: ACTORS[k].color, marginLeft: j ? -12 * K : 0, border: '3px solid #fff',
                  display: 'grid', placeItems: 'center', color: '#fff', ...type(20 * K, 760), lineHeight: 1,
                }}>{ACTORS[k].initial}</span>
              ))}
            </span>
            <span style={{ ...type(30 * K, 540), lineHeight: 1.3, color: L.ink2, whiteSpace: 'nowrap' }}>3 người · 12 việc</span>
            <span style={{ marginLeft: 'auto', width: 260 * K, height: 10 * K, borderRadius: 8, background: L.surface2, overflow: 'hidden', border: `1px solid ${L.line}` }}>
              <span style={{ display: 'block', height: '100%', width: `${mix(38, 72, ready)}%`, borderRadius: 5, background: L.accent }} />
            </span>
            <span style={{ ...type(30 * K, 650), lineHeight: 1.3, color: L.ink, width: 70 * K, textAlign: 'right' }}>{Math.round(mix(38, 72, ready))}%</span>
          </div>
        </div>

        {/* 其余四枚光标 */}
        {ACTORS.slice(0, 4).map((a, i) => {
          const [x, y] = posOf(i);
          return <Cursor key={i} a={a} ck={CK} badge={ramp(f, a.delay + 10, 12, EASE.out)} style={{ left: x, top: y, zIndex: 10 }} />;
        })}
      </div>

      {/* 界面 chrome（不随推镜）：左上板名、右上在线头像组、底部工具条 */}
      <div style={{ position: 'absolute', left: 64, top: P ? 110 : 48, display: 'flex', alignItems: 'center', gap: 18 * K, maxWidth: P ? 1100 : 1100 }}>
        <span style={{ width: 48 * K, height: 48 * K, borderRadius: 14 * K, background: L.ink, display: 'grid', placeItems: 'center', flex: 'none' }}>
          <ShotcraftMark size={34 * K} tone="dark" />
        </span>
        <span style={{ ...type(boardFs, 700), lineHeight: 1.3, color: L.ink, whiteSpace: 'nowrap', textShadow: ts }}>{board}</span>
        {!P && BRAND.name ? <span style={{ ...type(26, 500), lineHeight: 1.3, color: L.ink3, whiteSpace: 'nowrap', textShadow: ts }}>{BRAND.name}</span> : null}
      </div>
      <div style={{ position: 'absolute', right: 64, top: P ? 106 : 46, display: 'flex', alignItems: 'center', gap: 18 * K, transform: `scale(${K})`, transformOrigin: '100% 0' }}>
        <span style={{ display: 'flex' }}>
          {ACTORS.map((a, i) => {
            const p = avatarPop(i);
            return (
              // 槽宽随弹出长出来：头像组从右往左"挤进"新来的人，不留空位
              <span key={a.name} style={{ position: 'relative', width: (i ? 42 : 56) * clamp01(p), height: 56 }}>
                <span style={{
                  position: 'absolute', right: 0, top: 0, width: 56, height: 56, borderRadius: 28, background: a.color, border: '3px solid #fff',
                  boxSizing: 'border-box', display: 'grid', placeItems: 'center', color: '#fff', ...type(24, 760),
                  transform: `scale(${p})`, opacity: clamp01(p * 3), boxShadow: `0 4px 12px -4px ${alpha(a.color, 0.6)}`,
                }}>{a.initial}</span>
              </span>
            );
          })}
        </span>
        <span style={{
          height: 52, padding: '0 22px', borderRadius: 26, background: L.accent, color: L.onAccent, display: 'grid', placeItems: 'center', ...type(26, 680), lineHeight: 1,
          boxShadow: `0 8px 20px -8px ${alpha(L.accent, 0.7)}`, whiteSpace: 'nowrap',
        }}>Chia sẻ</span>
      </div>
      <div style={{
        position: 'absolute', left: '50%', bottom: P ? 120 : 40, transform: `translateX(-50%) scale(${K})`, transformOrigin: '50% 100%', height: 72, padding: '0 14px', borderRadius: 22,
        background: alpha('#ffffff', 0.92), border: `1px solid ${L.line}`, display: 'flex', alignItems: 'center', gap: 6,
        boxShadow: `inset 0 1px 0 #fff, 0 16px 36px -14px ${alpha(L.shadow, 0.3)}`,
      }}>
        {['select', 'hand', 'note', 'text', 'shape', 'pen'].map((k, i) => (
          <span key={k} style={{
            width: 52, height: 52, borderRadius: 14, display: 'grid', placeItems: 'center',
            background: i === 2 ? alpha(L.accent, 0.1) : 'transparent',
          }}>
            <svg width={26} height={26} viewBox="0 0 26 26" fill="none" stroke={i === 2 ? L.accent : L.ink2} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              {k === 'select' && <path d="M7 5v15l4-4 3 6 3-1.4-3-5.8h6z" />}
              {k === 'hand' && <path d="M9 13V7.5a1.5 1.5 0 0 1 3 0V12M12 11V6a1.5 1.5 0 0 1 3 0v5M15 11V7a1.5 1.5 0 0 1 3 0v7c0 4-2.5 6.5-6 6.5S7 18 6 15l-1.5-3a1.5 1.5 0 0 1 2.6-1.5L9 13" />}
              {k === 'note' && <path d="M6 5h14v10l-5 5H6zM15 20v-5h5" />}
              {k === 'text' && <path d="M6 7V5h14v2M13 5v16M10 21h6" />}
              {k === 'shape' && <><rect x={5} y={5} width={9} height={9} rx={2} /><circle cx={17} cy={17} r={4.5} /></>}
              {k === 'pen' && <path d="M5 21l1.2-4.6L17 5.6a2 2 0 0 1 2.8 2.8L9 19.2zM15 7.6l3.4 3.4" />}
            </svg>
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
};
