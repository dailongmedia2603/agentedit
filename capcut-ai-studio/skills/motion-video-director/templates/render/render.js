#!/usr/bin/env node
// Copy this directory to <project>/src; package.json must contain "type":"module".
// node src/render.js --from 0 --to 3 --fps 30 --scale 1 --out cache/smoke --jpg
// Without --jpg: --out renders/previews --name "Smoke v1" [--audio mix.wav]. Silent if no --audio.
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {once} from 'node:events';
import {readFile,stat,mkdir,writeFile,readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=process.cwd(),src=path.dirname(fileURLToPath(import.meta.url)),a=process.argv.slice(2);
const opt=(k,d)=>{const i=a.indexOf('--'+k);return i<0?d:a[i+1];};
const {DURATION}=await import('./data.js');
const from=Number(opt('from',0)),to=Number(opt('to',DURATION)),fps=Number(opt('fps',30)),scale=Number(opt('scale',1));
if(![from,to,fps,scale].every(Number.isFinite)||from<0||to<=from||fps<=0||scale<=0||scale>1)throw Error('Invalid range, fps or scale');
const count=Math.ceil((to-from)*fps-1e-8),out=path.resolve(opt('out','cache/smoke')),jpg=a.includes('--jpg');
const name=String(opt('name','Smoke v1'));
if(!name||/[\\/:*?"<>|]/.test(name))throw Error('Use a plain output name without path separators');
const dest=path.join(out,name+'.mp4'),audio=opt('audio');
if(audio&&!existsSync(path.resolve(audio)))throw Error('Audio file not found');
if(!jpg&&existsSync(dest))throw Error('Output exists; use a new version name');
await mkdir(out,{recursive:true});
if(jpg&&(await readdir(out)).some(f=>/^\d{5}\.(jpg|png)$/.test(f)))throw Error('Frame output already exists; choose a fresh cache directory');
let cfg={};const cfgPath=process.env.MVD_CONFIG||path.join(root,'.mvd/config.json');
if(existsSync(cfgPath))cfg=JSON.parse(await readFile(cfgPath,'utf8'));
const configBase=path.dirname(path.dirname(path.resolve(cfgPath)));
const configPath=v=>path.isAbsolute(v)?v:path.resolve(configBase,v);
const toolkit=process.env.MVD_TOOLKIT||cfg.toolkit_dir;
const req=createRequire(path.join(toolkit?configPath(toolkit):root,'package.json'));
const {chromium}=req('playwright');
const ffmpeg=process.env.MVD_FFMPEG||(cfg.ffmpeg?configPath(cfg.ffmpeg):'ffmpeg');
const browserPath=process.env.MVD_CHROMIUM;
// Serve only render resources on loopback; never expose project .env/config or arbitrary files.
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp4':'video/mp4'};
const srcUrl='/'+path.relative(root,src).split(path.sep).join('/');
if(srcUrl.includes('..'))throw Error('Renderer must live inside the selected project');
const server=http.createServer(async (request,response)=>{
  try{
    const u=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    if(u.split('/').some(s=>s.startsWith('.'))||![srcUrl+'/', '/assets/','/node_modules/'].some(s=>u.startsWith(s)))throw Error('Forbidden');
    const f=path.resolve(root,'.'+u);
    if(!f.startsWith(root+path.sep)||(await stat(f)).isDirectory())throw Error('Forbidden');
    response.writeHead(200,{'Content-Type':mime[path.extname(f)]||'application/octet-stream'});response.end(await readFile(f));
  }catch{response.writeHead(404);response.end('Not found');}
});
let browser,encoder;let encodeResult;
try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  browser=await chromium.launch({headless:true,...(browserPath?{executablePath:browserPath}:{})});
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}${srcUrl}/index.html?scale=${scale}`);
  await page.waitForFunction(()=>window.__ready===true,{},{timeout:30000});
  if(!jpg){
    const args=['-hide_banner','-n','-f','image2pipe','-framerate',String(fps),'-i','pipe:0'];
    if(audio)args.push('-ss',String(from),'-t',String(to-from),'-i',path.resolve(audio));
    args.push('-map','0:v:0');if(audio)args.push('-map','1:a:0','-af','apad','-c:a','aac','-b:a','192k','-ar','48000');
    args.push('-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-frames:v',String(count),'-t',String(count/fps),'-movflags','+faststart',dest);
    encoder=spawn(ffmpeg,args,{stdio:['pipe','inherit','inherit']});
    encodeResult=new Promise((resolve,reject)=>{encoder.once('error',reject);encoder.once('close',code=>code===0?resolve():reject(Error('FFmpeg exited '+code)));});
    // Attach a handler immediately to avoid an unhandled rejection during frame capture.
    encodeResult.catch(()=>{});encoder.stdin.on('error',()=>{});
  }
  for(let i=0;i<count;i++){
    await page.evaluate(t=>window.renderFrame(t),from+i/fps);
    if(errors.length)throw Error(errors.join('\n'));
    const data=await page.evaluate(type=>window.grab(type),jpg?'image/jpeg':'image/png');
    const bytes=Buffer.from(data.slice(data.indexOf(',')+1),'base64');
    if(jpg)await writeFile(path.join(out,String(i).padStart(5,'0')+'.jpg'),bytes);
    else if(!encoder.stdin.write(bytes))await Promise.race([once(encoder.stdin,'drain'),encodeResult.then(()=>{throw Error('Encoder ended early');})]);
  }
  if(encoder){encoder.stdin.end();await encodeResult;}
  console.log(`Rendered ${count} frames at ${fps} fps${jpg?'':audio?' with audio':' (silent; supply --audio for sound)'}`);
}finally{
  if(encoder&&encoder.exitCode===null)encoder.kill();
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
