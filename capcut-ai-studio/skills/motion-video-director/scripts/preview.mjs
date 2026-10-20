#!/usr/bin/env node
// Fast preview loop: render a time range small + choppy, tile it into one contact sheet.
// Usage: node scripts/preview.mjs <from> <to> [--fps 8] [--scale 0.25] [--cols 6] [--mp4] [--audio path] [--name "Part 3"] [--version 1]
// Needs src/render.js with: --from --to --fps --scale --out --jpg  (frames named 00000.jpg, 00001.jpg, …)
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname, isAbsolute } from 'node:path';

const a = process.argv.slice(2);
const opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const from = Number(a[0]), to = Number(a[1]);
if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || !(to > from)) { console.error('usage: node scripts/preview.mjs <from> <to> [--fps 8] [--scale 0.25] [--cols 6] [--mp4] [--audio file]'); process.exit(1); }
const fps = +opt('fps', 8), scale = +opt('scale', 0.25), cols = +opt('cols', 6);
if (!Number.isFinite(fps) || fps <= 0 || !Number.isFinite(scale) || scale <= 0 || scale > 1 || !Number.isInteger(cols) || cols <= 0) { console.error('Invalid fps, scale or cols'); process.exit(1); }
const audio = opt('audio');
if (a.includes('--audio') && (!audio || !existsSync(audio))) { console.error('Audio file not found'); process.exit(1); }
if (a.includes('--overwrite')) { console.error('Increment --version; preview overwrite is not supported.'); process.exit(1); }
let cfg = {}, configPath = resolve(process.env.MVD_CONFIG || '.mvd/config.json');
try { if (existsSync(configPath)) cfg = JSON.parse(readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '')); }
catch { console.error('Invalid preview configuration'); process.exit(1); }
const configuredFFmpeg = process.env.MVD_FFMPEG || cfg.ffmpeg;
const ffmpeg = configuredFFmpeg ? (isAbsolute(configuredFFmpeg) ? configuredFFmpeg : (/[\\/]/.test(configuredFFmpeg) ? resolve(dirname(dirname(configPath)), configuredFFmpeg) : configuredFFmpeg)) : 'ffmpeg';
const render = opt('render', 'src/render.js'), tag = `${from}-${to}`;
const name = String(opt('name','Video')).trim().replace(/[\\/:*?"<>|]/g,'-'), version = String(opt('version',1));
if(!name || !/^[1-9][0-9]*$/.test(version)){console.error('Use a descriptive --name and positive integer --version');process.exit(1);}
const reviewName = `${name} - Preview v${version}.mp4`;
const outDir = join('renders', 'previews');
if (a.includes('--mp4') && existsSync(join(outDir, reviewName))) { console.error('Review already exists; increment --version.'); process.exit(1); }
const cacheParent = join('cache', 'preview', `${name}-v${version}`, tag);
mkdirSync(cacheParent, {recursive:true});
const frames = mkdtempSync(join(cacheParent, 'run-'));
if (a.includes('--mp4')) mkdirSync(outDir, {recursive:true});

const run = (cmd, args, quiet) => spawnSync(cmd, args, { stdio: quiet ? 'pipe' : 'inherit', shell: false });
const t0 = Date.now();
let r = run('node', [render, '--from', from, '--to', to, '--fps', fps, '--scale', scale, '--out', frames, '--jpg'].map(String));
if (r.status !== 0) { console.error('render failed'); process.exit(1); }
const n = readdirSync(frames).filter(f => /^\d{5}\.jpg$/.test(f)).length;
if (!n) { console.error(`no frames in ${frames} (expected 00000.jpg …)`); process.exit(1); }

const rows = Math.ceil(n / cols), sheet = join(frames, 'Contact sheet.jpg');
const font = process.platform === 'win32' ? "C\\:/Windows/Fonts/arial.ttf"
  : ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/System/Library/Fonts/Helvetica.ttc', '/usr/share/fonts/liberation-sans/LiberationSans-Regular.ttf'].find(existsSync);
// Millisecond timebase preserves non-frame-aligned range starts.
const label = `settb=1/1000,setpts=PTS+${from}/TB,drawtext=fontfile='${font}':text='%{pts\\:hms}':x=6:y=h-th-6:fontsize=16:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=4,`;
const tile = `tile=${cols}x${rows}:padding=4:margin=4:color=0x202020`;
const sheetArgs = vf => ['-v', 'error', '-y', '-framerate', String(fps), '-i', join(frames, '%05d.jpg'), '-vf', vf, '-frames:v', '1', '-update', '1', '-q:v', '3', sheet];
r = run(ffmpeg, sheetArgs(label + tile), true);
if (r.status !== 0) { // ffmpeg without drawtext/font → ImageMagick montage with labels → plain sheet
  const files = readdirSync(frames).filter(f => /^\d{5}\.jpg$/.test(f)).sort();
  const lab = files.flatMap((f, i) => ['-label', (from + i / fps).toFixed(2) + 's', join(frames, f)]);
  const m = ['-tile', `${cols}x`, '-geometry', '+4+4', '-background', '#202020', '-fill', 'white', '-pointsize', '14', ...lab, sheet];
  r = run('magick', ['montage', ...m], true);
  if (r.status !== 0) r = run('montage', m, true);
  if (r.status !== 0) { console.warn('no timestamp labels (ffmpeg drawtext / ImageMagick unavailable)'); r = run(ffmpeg, sheetArgs(tile)); }
}
if (r.status !== 0) { console.error('contact sheet failed'); process.exit(1); }
console.log(`sheet: ${sheet}  (${n} frames, ${cols}x${rows}, ${(1 / fps).toFixed(3)} s apart, ${from}s → ${to}s)`);

if (a.includes('--mp4')) {
  const mp4 = join(outDir, reviewName);
  if (!audio) console.warn('Silent preview: add --audio <mix.wav> to include sound.');
  const args = ['-v', 'error', '-n', '-framerate', String(fps), '-i', join(frames, '%05d.jpg')];
  if (audio) args.push('-ss', String(from), '-t', String(to - from), '-i', audio);
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p', '-r', '30');
  if (audio) args.push('-c:a', 'aac', '-b:a', '128k', '-shortest');
  r = run(ffmpeg, [...args, mp4]);
  if (r.status !== 0) { console.error('mp4 failed'); process.exit(1); }
  console.log(`clip:  ${mp4}`);
}
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
