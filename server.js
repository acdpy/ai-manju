/* AI 漫剧工作台 本地服务
 * 职责：1) 以 http://127.0.0.1:8765 托管 index.html（自动打开浏览器）
 *       2) 提供文件读写 API，把页面生成的剧本/配置等写入本目录
 * 仅监听 127.0.0.1，路径强制限制在本目录内，不对外网开放。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec, spawnSync } = require('child_process');

const ROOT = __dirname;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
  '.srt': 'application/x-subrip'
};

function safeRel(rel) {
  if (typeof rel !== 'string' || !rel) return null;
  rel = rel.replace(/\\/g, '/').replace(/^\/+/, '');
  if (rel.includes('..')) return null;
  const abs = path.normalize(path.join(ROOT, rel));
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return null;
  return abs;
}
/* 删除/建目录仅允许 projects/ 下的路径 */
function safeProjectRel(rel) {
  if (typeof rel !== 'string') return null;
  rel = rel.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!rel.startsWith('projects/') && rel !== 'projects') return null;
  if (rel === 'projects' || rel === 'projects/') return null;
  if (rel.includes('..')) return null;
  const abs = path.normalize(path.join(ROOT, rel));
  if (!abs.startsWith(ROOT + path.sep + 'projects')) return null;
  return abs;
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', c => { b += c; if (b.length > 200 * 1024 * 1024) req.destroy(); });
    req.on('end', () => resolve(b));
    req.on('error', reject);
  });
}
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  try {
    /* CORS：允许任意本地来源调用（仅监听 127.0.0.1，无外网风险） */
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    const u = new URL(req.url, 'http://127.0.0.1');
    const pth = decodeURIComponent(u.pathname);

    if (req.method === 'GET' && pth === '/api/ping') return json(res, 200, { ok: true });

    if (req.method === 'POST' && pth === '/api/shutdown') {
      console.log('[AI漫剧工作台] 收到停止请求，正在退出…');
      json(res, 200, { ok: true, msg: 'bye' });
      setTimeout(() => process.exit(0), 200);
      return;
    }

    if (req.method === 'POST' && pth === '/api/fs/write') {
      const d = JSON.parse(await readBody(req) || '{}');
      const abs = safeRel(d.path);
      if (!abs) return json(res, 400, { ok: false, error: '非法路径' });
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, String(d.content == null ? '' : d.content), 'utf8');
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && pth === '/api/fs/writeb64') {
      const d = JSON.parse(await readBody(req) || '{}');
      const abs = safeRel(d.path);
      if (!abs) return json(res, 400, { ok: false, error: '非法路径' });
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, Buffer.from(String(d.data || ''), 'base64'));
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && pth === '/api/fs/mkdirs') {
      const d = JSON.parse(await readBody(req) || '{}');
      const paths = Array.isArray(d.paths) ? d.paths : [];
      for (const rel of paths) {
        const abs = safeRel(rel);
        if (!abs) continue;
        fs.mkdirSync(abs, { recursive: true });
      }
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && pth === '/api/fs/delete') {
      const d = JSON.parse(await readBody(req) || '{}');
      const abs = safeProjectRel(d.path);
      if (!abs) return json(res, 400, { ok: false, error: '只允许删除 projects/ 下的项目目录' });
      fs.rmSync(abs, { recursive: true, force: true });
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && pth === '/api/fs/exists') {
      const d = JSON.parse(await readBody(req) || '{}');
      const abs = safeRel(d.path);
      return json(res, 200, { ok: true, exists: !!(abs && fs.existsSync(abs)) });
    }
    /* 服务端代理下载外部 URL（如视频模型返回的 CDN 视频），绕过浏览器跨域，直接落盘 */
    if (req.method === 'POST' && pth === '/api/fs/fetchsave') {
      let d = {};
      try { d = JSON.parse(await readBody(req) || '{}'); } catch (e) {}
      const url = String(d.url || '');
      const relPath = d.path;
      const abs = safeRel(relPath);
      if (!abs) return json(res, 400, { ok: false, error: '非法路径' });
      if (!/^https?:\/\//i.test(url)) return json(res, 400, { ok: false, error: '仅支持 http(s) 链接' });
      try {
        const headers = { 'User-Agent': 'ai-manju-workbench' };
        if (d.auth) headers['Authorization'] = String(d.auth);
        const r = await fetch(url, { headers, redirect: 'follow' });
        if (!r.ok) return json(res, 502, { ok: false, error: '上游返回 ' + r.status });
        const buf = Buffer.from(await r.arrayBuffer());
        if (!buf.length) return json(res, 502, { ok: false, error: '上游返回空内容' });
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, buf);
        return json(res, 200, { ok: true, bytes: buf.length });
      } catch (e) { return json(res, 500, { ok: false, error: e.message }); }
    }
    if (req.method === 'GET' && pth === '/api/fs/list') {
      const rel = u.searchParams.get('path') || 'projects';
      const withDocs = u.searchParams.get('withDocs') === '1';
      const abs = safeRel(rel);
      if (!abs || !fs.existsSync(abs)) return json(res, 200, { ok: true, entries: [] });
      function countFiles(d) {
        let n = 0;
        try {
          for (const x of fs.readdirSync(d, { withFileTypes: true })) {
            if (x.isDirectory()) n += countFiles(path.join(d, x.name));
            else n++;
          }
        } catch (err) {}
        return n;
      }
      function collectDocs(d) {
        // 收集 script/ 下 md 文件内容，用于「打开项目」还原记录
        const docs = [];
        try {
          for (const x of fs.readdirSync(d, { withFileTypes: true })) {
            if (!x.isFile()) continue;
            if (!/\.(md|markdown|txt)$/i.test(x.name)) continue;
            try {
              const content = fs.readFileSync(path.join(d, x.name), 'utf8');
              if (content.length <= 200000) docs.push({ name: x.name, content });
            } catch (err) {}
          }
        } catch (err) {}
        return docs;
      }
      const entries = fs.readdirSync(abs, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => {
          const item = { name: e.name, files: countFiles(path.join(abs, e.name)) };
          if (withDocs) {
            const scriptDir = path.join(abs, e.name, 'script');
            item.docs = fs.existsSync(scriptDir) ? collectDocs(scriptDir) : [];
            const sbDir = path.join(abs, e.name, 'storyboard');
            item.sbDocs = fs.existsSync(sbDir) ? collectDocs(sbDir) : [];
          }
          return item;
        });
      return json(res, 200, { ok: true, entries });
    }
    if (req.method === 'GET' && pth === '/api/fs/listfiles') {
      const rel = u.searchParams.get('path') || '';
      const abs = safeRel(rel);
      if (!abs || !fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) return json(res, 200, { ok: true, files: [] });
      try {
        const files = fs.readdirSync(abs).filter(function (n) { return fs.statSync(path.join(abs, n)).isFile(); });
        return json(res, 200, { ok: true, files: files });
      } catch (e) { return json(res, 200, { ok: true, files: [] }); }
    }
    if (req.method === 'GET' && pth === '/api/fs/read') {
      const abs = safeRel(u.searchParams.get('path') || '');
      if (!abs || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) return json(res, 404, { ok: false, error: '文件不存在' });
      return res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }), res.end(fs.readFileSync(abs, 'utf8'));
    }

    /* ---------- 视频合成：用内置 ffmpeg 真正把多个片段合并成一个 MP4 ---------- */
    /* 优先用项目内置的 tools/ffmpeg.exe（随项目一起迁移），否则退回系统 ffmpeg */
    function resolveFfmpeg() {
      const local = path.join(ROOT, 'tools', 'ffmpeg.exe');
      if (fs.existsSync(local)) return local;
      return 'ffmpeg';
    }
    function ffProbeDuration(ff, file) {
      try {
        const r = spawnSync(ff, ['-hide_banner', '-i', file], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
        const txt = String(r.stderr || '') + String(r.stdout || '');
        const m = txt.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
        if (m) return (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
      } catch (e) {}
      return 0;
    }
    function pad(n, w) { return String(n).padStart(w || 2, '0'); }
    function srtTime(t) {
      const hh = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), ss = Math.floor(t % 60);
      const ms = Math.round((t - Math.floor(t)) * 1000);
      return pad(hh) + ':' + pad(mm) + ':' + pad(ss) + ',' + pad(ms, 3);
    }
    function buildSrt(blocks) {
      let out = '', idx = 1;
      blocks.forEach(b => {
        const txt = String(b.text || '').trim();
        if (!txt) return;
        out += idx + '\n' + srtTime(b.start) + ' --> ' + srtTime(b.end) + '\n' + txt.replace(/\s*\n\s*/g, '\n') + '\n\n';
        idx++;
      });
      return out;
    }
    if (req.method === 'GET' && pth === '/api/vid/status') {
      const ff = resolveFfmpeg();
      const r = spawnSync(ff, ['-version'], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
      let ver = '';
      if (r.status === 0) { const m = String(r.stdout || '').match(/ffmpeg version (\S+)/); ver = m ? m[1] : 'ok'; }
      return json(res, 200, { ok: r.status === 0, ffmpeg: ff, version: ver });
    }
    if (req.method === 'POST' && pth === '/api/vid/compose') {
      const d = JSON.parse(await readBody(req) || '{}');
      const clips = Array.isArray(d.clips) ? d.clips : [];
      const absOut = safeRel(d.out);
      if (!absOut) return json(res, 400, { ok: false, error: '非法输出路径' });
      if (!clips.length) return json(res, 400, { ok: false, error: '没有可合成的片段' });
      const ff = resolveFfmpeg();
      const chk = spawnSync(ff, ['-version'], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
      if (chk.status !== 0) return json(res, 500, { ok: false, error: '未检测到可用的 ffmpeg（应位于 tools/ffmpeg.exe）' });

      /* 1) 校验所有片段存在 */
      const files = [];
      for (const c of clips) {
        const abs = safeRel(c.rel);
        if (!abs || !fs.existsSync(abs)) return json(res, 400, { ok: false, error: '片段不存在：' + (c.rel || '') });
        files.push({ abs, rel: c.rel, subtitle: c.subtitle || '' });
      }
      try { fs.mkdirSync(path.dirname(absOut), { recursive: true }); } catch (e) {}

      /* 2) 写 concat 清单并合并（-c copy 无损快速；失败则重编码兜底） */
      const tmpDir = path.join(ROOT, 'tools', '_tmp');
      try { fs.mkdirSync(tmpDir, { recursive: true }); } catch (e) {}
      const listFile = path.join(tmpDir, 'concat_' + Date.now() + '.txt');
      const lines = files.map(f => "file '" + f.abs.replace(/\\/g, '/').replace(/'/g, "'\\''") + "'");
      fs.writeFileSync(listFile, lines.join('\n'), 'utf8');

      let mode = '';
      let r = spawnSync(ff, ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-movflags', '+faststart', absOut],
        { windowsHide: true, timeout: 900000 });
      if (r.status === 0 && fs.existsSync(absOut) && fs.statSync(absOut).size > 0) {
        mode = 'copy';
      } else {
        /* 编码参数不一致时，重编码后再合并 */
        const r2 = spawnSync(ff, ['-y', '-f', 'concat', '-safe', '0', '-i', listFile,
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', absOut],
          { windowsHide: true, timeout: 1800000 });
        if (r2.status !== 0 || !fs.existsSync(absOut) || fs.statSync(absOut).size === 0) {
          const err = String((r2.stderr || r.stderr || '')).trim().split('\n').slice(-6).join(' | ');
          try { fs.unlinkSync(listFile); } catch (e) {}
          return json(res, 500, { ok: false, error: 'ffmpeg 合并失败：' + err.slice(0, 400) });
        }
        mode = 'reencode';
      }
      try { fs.unlinkSync(listFile); } catch (e) {}

      /* 3) 依据真实时长生成字幕，并尝试以软字幕轨并入 MP4 */
      const durs = files.map(f => ffProbeDuration(ff, f.abs));
      let t = 0; const blocks = [];
      files.forEach((f, i) => {
        const dur = durs[i] || (parseFloat(clips[i].duration) || 5);
        blocks.push({ start: t, end: t + dur, text: f.subtitle });
        t += dur;
      });
      const srtAbs = absOut.replace(/\.mp4$/i, '') + '.srt';
      let srtRel = null;
      try { fs.writeFileSync(srtAbs, buildSrt(blocks), 'utf8'); srtRel = path.relative(ROOT, srtAbs).replace(/\\/g, '/'); } catch (e) {}
      let subs = false;
      if (srtRel && blocks.some(b => String(b.text || '').trim())) {
        const withSubs = absOut.replace(/\.mp4$/i, '') + '_subs.mp4';
        const r3 = spawnSync(ff, ['-y', '-i', absOut, '-i', srtAbs,
          '-map', '0:v', '-map', '0:a?', '-map', '1:s',
          '-c', 'copy', '-c:s', 'mov_text', '-metadata:s:s:0', 'language=chi',
          '-movflags', '+faststart', withSubs], { windowsHide: true, timeout: 900000 });
        if (r3.status === 0 && fs.existsSync(withSubs) && fs.statSync(withSubs).size > 0) {
          try { fs.copyFileSync(withSubs, absOut); fs.unlinkSync(withSubs); subs = true; } catch (e) {}
        } else { try { fs.unlinkSync(withSubs); } catch (e) {} }
      }
      const relOf = p => path.relative(ROOT, p).replace(/\\/g, '/');
      return json(res, 200, {
        ok: true, rel: relOf(absOut), srtRel, mode, subs,
        durations: durs, bytes: fs.existsSync(absOut) ? fs.statSync(absOut).size : 0
      });
    }

    /* ---------- 配音：edge-tts（项目内置 tools/py 虚拟环境） ---------- */
    function resolvePython() {
      const local = path.join(ROOT, 'tools', 'py', 'Scripts', 'python.exe');
      if (fs.existsSync(local)) return local;
      const unix = path.join(ROOT, 'tools', 'py', 'bin', 'python');
      if (fs.existsSync(unix)) return unix;
      return 'python';
    }
    let TTS_VOICES_CACHE = null;
    function listTtsVoices() {
      if (TTS_VOICES_CACHE) return TTS_VOICES_CACHE;
      const fallback = [
        { name: 'zh-CN-XiaoxiaoNeural', gender: 'Female', desc: '女·温柔（新闻/小说）' },
        { name: 'zh-CN-XiaoyiNeural', gender: 'Female', desc: '女·活泼（卡通/小说）' },
        { name: 'zh-CN-YunjianNeural', gender: 'Male', desc: '男·激昂（体育/小说）' },
        { name: 'zh-CN-YunxiNeural', gender: 'Male', desc: '男·阳光（小说）' },
        { name: 'zh-CN-YunxiaNeural', gender: 'Male', desc: '男·可爱（卡通）' },
        { name: 'zh-CN-YunyangNeural', gender: 'Male', desc: '男·沉稳（新闻）' }
      ];
      try {
        const py = resolvePython();
        const r = spawnSync(py, ['-m', 'edge_tts', '--list-voices'], { encoding: 'utf8', windowsHide: true, timeout: 90000 });
        if (r.status === 0 && r.stdout) {
          const lines = String(r.stdout).split('\n').filter(l => /^zh-(CN|TW|HK)/.test(l.trim()));
          if (lines.length) {
            const vs = lines.map(l => {
              const t = l.trim().split(/\s+/);
              return { name: t[0], gender: (t[1] || ''), desc: t.slice(1).join(' ') };
            });
            TTS_VOICES_CACHE = vs;
            return vs;
          }
        }
      } catch (e) {}
      TTS_VOICES_CACHE = fallback;
      return fallback;
    }
    if (req.method === 'GET' && pth === '/api/tts/voices') {
      const vs = listTtsVoices();
      const py = resolvePython();
      let ready = true, err = '';
      try {
        const r = spawnSync(py, ['-m', 'edge_tts', '--version'], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
        ready = (r.status === 0);
        if (!ready) err = String(r.stderr || '').trim().slice(0, 200);
      } catch (e) { ready = false; err = e.message; }
      return json(res, 200, { ok: true, ready, error: err, voices: vs });
    }
    if (req.method === 'POST' && pth === '/api/tts/synth') {
      const d = JSON.parse(await readBody(req) || '{}');
      const abs = safeRel(d.out);
      if (!abs) return json(res, 400, { ok: false, error: '非法输出路径' });
      const text = String(d.text || '').trim();
      if (!text) return json(res, 400, { ok: false, error: '配音文本为空' });
      const voice = String(d.voice || 'zh-CN-XiaoxiaoNeural');
      const rate = String(d.rate || '+0%');
      const volume = String(d.volume || '+0%');
      const py = resolvePython();
      try { fs.mkdirSync(path.dirname(abs), { recursive: true }); } catch (e) {}
      const args = ['-m', 'edge_tts', '--voice', voice, '--rate=' + rate, '--volume=' + volume, '--text', text, '--write-media', abs];
      const r = spawnSync(py, args, { encoding: 'utf8', windowsHide: true, timeout: 180000 });
      if (r.status !== 0 || !fs.existsSync(abs)) {
        return json(res, 500, { ok: false, error: 'edge-tts 合成失败：' + String(r.stderr || r.stdout || '').trim().slice(0, 300) });
      }
      return json(res, 200, { ok: true, rel: path.relative(ROOT, abs).replace(/\\/g, '/'), bytes: fs.statSync(abs).size });
    }
    /* 把多条配音按时间轴位置（adelay）拼成一条完整旁白音轨 */
    if (req.method === 'POST' && pth === '/api/aud/assemble') {
      const d = JSON.parse(await readBody(req) || '{}');
      const items = Array.isArray(d.items) ? d.items : [];
      const abs = safeRel(d.out);
      if (!abs) return json(res, 400, { ok: false, error: '非法输出路径' });
      const ff = resolveFfmpeg();
      const valid = [];
      for (const it of items) {
        const a = safeRel(it.rel);
        if (a && fs.existsSync(a)) valid.push({ abs: a, at: Math.max(0, parseFloat(it.at) || 0) });
      }
      if (!valid.length) return json(res, 400, { ok: false, error: '没有可用于拼接的配音' });
      try { fs.mkdirSync(path.dirname(abs), { recursive: true }); } catch (e) {}
      const args = ['-y'];
      valid.forEach(v => args.push('-i', v.abs));
      /* 兼容新旧 ffmpeg：统一采样格式后用 adelay+apad 对齐时间轴，
         再 amix（不带 normalize，老版本不支持该选项），最后 volume=N 补偿 amix 的默认归一化衰减 */
      let flt = '', tags = '';
      valid.forEach((v, i) => {
        const ms = Math.round(v.at * 1000);
        flt += '[' + i + ':a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,' +
          'adelay=' + ms + '|' + ms + ',apad[a' + i + '];';
        tags += '[a' + i + ']';
      });
      flt += tags + 'amix=inputs=' + valid.length + '[am];[am]volume=' + valid.length + '[aout]';
      args.push('-filter_complex', flt, '-map', '[aout]', '-c:a', 'aac', '-ar', '44100');
      if (d.total) args.push('-t', String(parseFloat(d.total)));
      args.push(abs);
      const runArgs = args.slice();
      let r = spawnSync(ff, runArgs, { windowsHide: true, timeout: 900000 });
      /* 若失败，回退到「新版本语法」（带 normalize=0）再试一次 */
      if (r.status !== 0 || !fs.existsSync(abs)) {
        const fb = args.map(a => (a === flt ? flt.replace('amix=inputs=' + valid.length, 'amix=inputs=' + valid.length + ':normalize=0:dropout_transition=0') : a));
        const r2 = spawnSync(ff, fb, { windowsHide: true, timeout: 900000 });
        if (r2.status === 0 && fs.existsSync(abs)) r = r2;
      }
      if (r.status !== 0 || !fs.existsSync(abs)) {
        return json(res, 500, { ok: false, error: '音轨拼接失败：' + String(r.stderr || '').trim().split('\n').slice(-4).join(' | ').slice(0, 300) });
      }
      return json(res, 200, { ok: true, rel: path.relative(ROOT, abs).replace(/\\/g, '/'), bytes: fs.statSync(abs).size });
    }
    /* 把配音混入已合成成片：mix=与原声混合，replace=替换原声 */
    if (req.method === 'POST' && pth === '/api/vid/muxaudio') {
      const d = JSON.parse(await readBody(req) || '{}');
      const vIn = safeRel(d.video), aIn = safeRel(d.audio);
      const abs = safeRel(d.out);
      if (!vIn || !aIn || !abs) return json(res, 400, { ok: false, error: '缺少视频/音频/输出路径' });
      if (!fs.existsSync(vIn)) return json(res, 400, { ok: false, error: '成片不存在' });
      if (!fs.existsSync(aIn)) return json(res, 400, { ok: false, error: '配音音轨不存在' });
      const ff = resolveFfmpeg();
      try { fs.mkdirSync(path.dirname(abs), { recursive: true }); } catch (e) {}
      const mode = (d.mode === 'replace') ? 'replace' : 'mix';
      /* 先探测成片是否自带音轨（很多 AI 生成的片段是无声的） */
      const probe = spawnSync(ff, ['-i', vIn], { encoding: 'utf8', windowsHide: true });
      const hasAudio = /Stream #\d+:\d+.*Audio:/i.test(String(probe.stderr || ''));
      let args, errs = [];
      if (mode === 'replace' || !hasAudio) {
        /* 无声成片或「替换原声」：直接把配音作为唯一音轨挂上（视频流无损 copy） */
        args = ['-y', '-i', vIn, '-i', aIn, '-map', '0:v:0', '-map', '1:a:0',
          '-c:v', 'copy', '-c:a', 'aac', '-ar', '44100', '-shortest', '-movflags', '+faststart', abs];
      } else {
        /* 有声成片：混合。兼容老版本 ffmpeg（不带 dropout_transition），并用 volume 补偿 amix 归一化衰减 */
        args = ['-y', '-i', vIn, '-i', aIn,
          '-filter_complex', '[1:a]volume=1.0[nar];[0:a][nar]amix=inputs=2:duration=first[am];[am]volume=2[aout]',
          '-map', '0:v:0', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-ar', '44100', '-shortest', '-movflags', '+faststart', abs];
      }
      let r = spawnSync(ff, args, { windowsHide: true, timeout: 900000 });
      /* 老版本 ffmpeg 可能连 :duration=first 都不认 → 退化为「替换」方案，保证一定出片 */
      if ((r.status !== 0 || !fs.existsSync(abs)) && mode !== 'replace' && hasAudio) {
        errs.push(String(r.stderr || '').trim().split('\n').slice(-2).join(' | ').slice(0, 160));
        args = ['-y', '-i', vIn, '-i', aIn, '-map', '0:v:0', '-map', '1:a:0',
          '-c:v', 'copy', '-c:a', 'aac', '-ar', '44100', '-shortest', '-movflags', '+faststart', abs];
        r = spawnSync(ff, args, { windowsHide: true, timeout: 900000 });
      }
      if (r.status !== 0 || !fs.existsSync(abs)) {
        return json(res, 500, { ok: false, error: '混音失败：' + (errs.join(' ## ') || String(r.stderr || '').trim().split('\n').slice(-4).join(' | ').slice(0, 300)) });
      }
      return json(res, 200, { ok: true, rel: path.relative(ROOT, abs).replace(/\\/g, '/'), mode, bytes: fs.statSync(abs).size });
    }

    /* 静态文件 */
    if (req.method === 'GET') {
      const rel = (pth === '/' || pth === '/index.html') ? 'index.html' : pth.replace(/^\/+/, '');
      const abs = safeRel(rel);
      if (abs && fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        const ext = path.extname(abs).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        return fs.createReadStream(abs).pipe(res);
      }
    }
    return json(res, 404, { ok: false, error: 'not found' });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message });
  }
});

function listen(p) {
  server.once('error', err => {
    if (err.code === 'EADDRINUSE' && p < 8775) { listen(p + 1); }
    else { console.error('[AI漫剧工作台] 启动失败:', err.message); process.exit(1); }
  });
  server.listen(p, '127.0.0.1', () => {
    try { fs.writeFileSync(path.join(ROOT, 'server.pid'), String(process.pid)); } catch (e) {}
    console.log('==============================================');
    console.log('  AI 漫剧工作台 本地服务已启动');
    console.log('  地址: http://127.0.0.1:' + p);
    console.log('  目录: ' + ROOT);
    console.log('  PID : ' + process.pid + '（写入 server.pid，可用「停止工作台.bat」停止）');
    console.log('  关闭此窗口或运行停止脚本即结束服务');
    console.log('==============================================');
    exec('start "" "http://127.0.0.1:' + p + '"');
  });
}
function cleanup() {
  try { const cur = fs.readFileSync(path.join(ROOT, 'server.pid'), 'utf8').trim();
    if (cur === String(process.pid)) fs.unlinkSync(path.join(ROOT, 'server.pid'));
  } catch (e) {}
  process.exit(0);
}
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', () => { try { const cur = fs.readFileSync(path.join(ROOT, 'server.pid'), 'utf8').trim(); if (cur === String(process.pid)) fs.unlinkSync(path.join(ROOT, 'server.pid')); } catch (e) {} });
listen(8765);
