import http from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, createReadStream } from 'node:fs';
import { mkdir, readFile, stat, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const root = path.dirname(fileURLToPath(import.meta.url));
const downloads = path.join(root, 'downloads');
const engine = process.env.YTDLP_PATH || (existsSync(path.join(root, 'bin', 'yt-dlp.exe')) ? path.join(root, 'bin', 'yt-dlp.exe') : 'yt-dlp');
const jobs = new Map(), media = new Map();
const port = Number(process.env.PORT || 3000);
const baseArgs = ['--ignore-config', '--encoding', 'utf-8', '--no-playlist', '--no-warnings', '--socket-timeout', '25', '--retries', '2', '--js-runtimes', `node:${process.execPath}`];
export function validateUrl(input) {
  let url; try { url = new URL(input); } catch { throw new Error('Paste a valid video link.'); }
  const domains = ['youtube.com','youtu.be','instagram.com','tiktok.com','snapchat.com'];
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !domains.some(d => url.hostname === d || url.hostname.endsWith('.' + d))) throw new Error('Use an HTTPS link from YouTube, Instagram, TikTok, or Snapchat.');
  return url.href;
}
export function qualities(info) {
  return [...new Set((info.formats || []).filter(f => f.vcodec && f.vcodec !== 'none' && f.height > 0).map(f => Math.round(f.height)))].sort((a,b) => b-a);
}
function run(args, timeout = 90000, onLine) {
  return new Promise((resolve,reject) => {
    const child = spawn(engine, args, { windowsHide:true, shell:false });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    let output = '', error = '', pending = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('The platform did not finish responding in time. Please retry. If it keeps happening, check your connection or try another public video link.')); },timeout);
    child.stdout.on('data', chunk => { output += chunk; pending += chunk; const lines = pending.split(/\r?\n/); pending = lines.pop(); for (const line of lines) onLine?.(line); if(output.length > 12000000) { child.kill(); reject(new Error('Video metadata is too large.')); } });
    child.stderr.on('data', chunk => { error = (error + chunk).slice(-4000); });
    child.on('error', () => { clearTimeout(timer); reject(new Error('Download engine is missing. Run setup.ps1 first.')); });
    child.on('close', code => { clearTimeout(timer); if(code === 0) resolve(output); else reject(new Error(error.trim().replace(/ERROR:\s*/g,'').slice(-650) || 'The platform could not provide this video. Try a public, individual video link.')); });
  });
}
function json(res, status, data) { res.writeHead(status, {'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify(data)); }
async function body(req) { let data=''; for await(const chunk of req) { data += chunk; if(data.length > 8192) throw new Error('Request too large.'); } try { return JSON.parse(data); } catch { throw new Error('Invalid request.'); } }
async function download(job, source, type, quality) {
  const folder = path.join(downloads,job.id);
  try {
    await mkdir(folder,{recursive:true});
    const args = [...baseArgs,'--newline','--progress','--progress-template','download:PROGRESS:%(progress._percent_str)s','--max-filesize','1G','--windows-filenames','--no-part','-o',path.join(folder,'%(title).120B.%(ext)s'),'--print','after_move:FILE:%(filepath)s'];
    if(type === 'audio') args.push('-f','bestaudio/best','-x','--audio-format','mp3','--audio-quality',quality + 'K');
    else {
      const filter = quality === 'best' ? '' : `[height<=${Number(quality)}]`;
      args.push('-f',`bv*${filter}+ba/b${filter}`,'--merge-output-format','mp4','--remux-video','mp4');
    }
    let file;
    const onLine = line => {
      if(line.startsWith('PROGRESS:')) { job.progress = Math.min(99,parseFloat(line.slice(9)) || 0); job.message='Downloading and processing…'; }
      if(line.startsWith('FILE:')) file = line.slice(5).trim();
    };
    try {
      await run([...args,'--',source.url], 20*60*1000, onLine);
    } catch(error) {
      if(!/HTTP Error 403|403: Forbidden/i.test(error.message)) throw error;
      job.progress=0; job.message='Refreshing the video link and checking available formats…';
      file=undefined;
      // One retry fetches fresh source URLs and checks formats before choosing one.
      try { await run([...args,'--check-formats','--',source.url],20*60*1000,onLine); }
      catch(retryError) {
        if(/HTTP Error 403|403: Forbidden/i.test(retryError.message)) throw new Error('The platform refused the download (403), even after refreshing the link. Please try again later or use another public video.');
        throw retryError;
      }
    }
    if(!file || path.dirname(path.resolve(file)) !== folder || !existsSync(file)) throw new Error('No downloadable file was produced. Try another format.');
    job.file=file; job.filename=path.basename(file); job.status='complete'; job.progress=100; job.message='Ready to save';
  } catch(error) { job.status='error'; job.message=error.message; await rm(folder,{recursive:true,force:true}); }
}
export function createServer() { return http.createServer(async (req,res) => {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if(!['127.0.0.1','localhost'].some(host => req.headers.host === `${host}:${port}`)) return json(res,403,{error:'Local access only.'});
  if(req.headers.origin && ![`http://localhost:${port}`,`http://127.0.0.1:${port}`].includes(req.headers.origin)) return json(res,403,{error:'Origin not allowed.'});
  const url = new URL(req.url,'http://localhost');
  try {
    if(req.method === 'GET' && url.pathname === '/api/health') {
      let ready=true, version=''; try { version=(await run(['--version'],5000)).trim(); } catch { ready=false; }
      return json(res,200,{ready,version});
    }
    if(req.method === 'POST' && url.pathname === '/api/analyze') {
      if([...jobs.values()].filter(j => j.status==='working').length >= 2) return json(res,429,{error:'Two downloads are already running. Please wait.'});
      if(media.size > 100) media.delete(media.keys().next().value);
      const input=await body(req), link=validateUrl(input.url);
      if(analyzing >= 2) return json(res,429,{error:'Please wait for the current link checks to finish.'});
      analyzing++;
      let info; try { info=JSON.parse(await run([...baseArgs,'--socket-timeout','10','--extractor-retries','0','--dump-single-json','--skip-download','--',link])); } finally { analyzing--; }
      if(info.is_live || info._type==='playlist' || info.entries) throw new Error('Use a single recorded video, not a playlist, profile, or live stream.');
      const id=randomUUID(), heights=qualities(info);
      const item={id,url:link,title:info.title || 'Untitled video',author:info.uploader || info.channel || '',duration:info.duration || 0,thumbnail:info.thumbnail || '',platform:info.extractor_key || info.extractor,qualities:heights};
      media.set(id,item); return json(res,200,item);
    }
    if(req.method === 'POST' && url.pathname === '/api/download') {
      const input=await body(req), source=media.get(input.mediaId);
      if(!source) throw new Error('Analyze your link again before downloading.');
      if(!['video','audio'].includes(input.type)) throw new Error('Choose video or audio.');
      if(input.type==='audio' ? !['128','192','320'].includes(String(input.quality)) : !(input.quality==='best' || source.qualities.includes(Number(input.quality)))) throw new Error('Choose an available quality.');
      if([...jobs.values()].filter(j => j.status==='working').length >= 2) return json(res,429,{error:'Two downloads are already running. Please wait.'});
      const job={id:randomUUID(),status:'working',progress:0,message:'Starting download…',created:Date.now()};
      jobs.set(job.id,job); void download(job,source,input.type,String(input.quality)); return json(res,202,{id:job.id});
    }
    const jobMatch=url.pathname.match(/^\/api\/jobs\/([a-f0-9-]+)$/);
    if(req.method==='GET' && jobMatch) { const job=jobs.get(jobMatch[1]); return job ? json(res,200,{id:job.id,status:job.status,progress:job.progress,message:job.message,filename:job.filename}) : json(res,404,{error:'Download expired. Please start again.'}); }
    const fileMatch=url.pathname.match(/^\/api\/files\/([a-f0-9-]+)$/);
    if(req.method==='GET' && fileMatch) {
      const job=jobs.get(fileMatch[1]); if(!job || job.status!=='complete') return json(res,404,{error:'File is not ready.'});
      const size=(await stat(job.file)).size;
      res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':size,'Content-Disposition':`attachment; filename="download.${path.extname(job.file).slice(1)}"; filename*=UTF-8''${encodeURIComponent(job.filename).replace(/'/g,'%27')}`});
      const stream=createReadStream(job.file); stream.on('error',()=>res.destroy()); stream.pipe(res); return;
    }
    const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css'};
    if(req.method==='GET' && files[url.pathname]) { const file=files[url.pathname]; res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html; charset=utf-8'); res.end(await readFile(path.join(root,'public',file))); return; }
    json(res,404,{error:'Not found.'});
  } catch(error) { json(res,400,{error:error.message}); }
}); }
let analyzing=0;
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  await mkdir(downloads,{recursive:true});
  // Delete only this application's UUID-named download folders after 24 hours.
  for(const entry of await readdir(downloads,{withFileTypes:true})) if(entry.isDirectory() && /^[a-f0-9-]{36}$/.test(entry.name)) { const p=path.join(downloads,entry.name); if(Date.now()-(await stat(p)).mtimeMs>86400000) await rm(p,{recursive:true,force:true}); }
  setInterval(async()=>{ for(const [id,job] of jobs) if(job.status!=='working' && Date.now()-job.created>86400000) { jobs.delete(id); await rm(path.join(downloads,id),{recursive:true,force:true}).catch(()=>{}); } },3600000).unref();
  createServer().listen(port,'127.0.0.1',()=>console.log(`Social Downloader ready at http://localhost:${port}`));
}
