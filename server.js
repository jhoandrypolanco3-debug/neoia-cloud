const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, spawn } = require('child_process');
const db = require('./database');

const PORT = process.env.PORT || 3333;
const PUBLIC_DIR = fs.existsSync(path.join(__dirname, 'public')) ? path.join(__dirname, 'public') : __dirname;

const TARGET_SERVICES = {
  ollama: 'http://localhost:11434',
  lmstudio: 'http://localhost:1234',
  sdwebui: 'http://localhost:7860',
  comfyui: 'http://localhost:8188',
  localai: 'http://localhost:1337',
  whisper: 'http://localhost:9000'
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.apk': 'application/vnd.android.package-archive'
};

// 20 Curated Local Models
const CATALOG_20_MODELS = [
  { id: 'qwen2.5-coder:1.5b', name: 'Qwen 2.5 Coder 1.5B', tag: 'Robótica / FTC / Java', size: '986 MB', desc: 'Especialista en código FTC, Java, Android Studio y algoritmos.' },
  { id: 'llama3.2:1b', name: 'Meta Llama 3.2 1B', tag: 'Velocidad Pura', size: '1.3 GB', desc: 'El más rápido para chat, instrucciones rápidas y tareas generales.' },
  { id: 'deepseek-r1:1.5b', name: 'DeepSeek R1 1.5B', tag: 'Razonamiento & Lógica', size: '1.1 GB', desc: 'Piensa paso a paso. Ideal para matemáticas, física y lógica de robots.' },
  { id: 'smollm2:1.7b', name: 'SmolLM2 1.7B', tag: 'Conocimiento Compacto', size: '1.0 GB', desc: 'Modelo compacto de HuggingFace con gran capacidad de síntesis.' },
  { id: 'tinyllama:1.1b', name: 'TinyLlama 1.1B', tag: 'Ultra Liviano', size: '637 MB', desc: 'Extremadamente pequeño, ideal para máquinas con poca memoria.' },
  { id: 'phi3:mini', name: 'Microsoft Phi-3 Mini 3.8B', tag: 'Lógica Avanzada', size: '2.2 GB', desc: 'Entrenado con libros de texto sintéticos. Gran razonamiento en código.' },
  { id: 'gemma2:2b', name: 'Google Gemma 2 2B', tag: 'Google DeepMind', size: '1.6 GB', desc: 'Arquitectura moderna de Google con alta precisión semántica.' },
  { id: 'codellama:7b', name: 'Code Llama 7B', tag: 'Arquitectura Software', size: '3.8 GB', desc: 'El estándar de Meta para refactorización de código y librerías.' },
  { id: 'mistral:7b', name: 'Mistral 7B Instruct', tag: 'Líder en 7B', size: '4.1 GB', desc: 'Potente modelo general para tareas complejas y redacción técnica.' },
  { id: 'starcoder2:3b', name: 'StarCoder2 3B', tag: 'Multi-lenguaje', size: '1.8 GB', desc: 'Entrenado en más de 80 lenguajes incluyendo Java, C++ y Python.' },
  { id: 'llava:7b', name: 'LLaVA 7B (Visión)', tag: 'Visión de Robots', size: '4.5 GB', desc: 'Describe imágenes, detecta objetos y ayuda a interpretar cámaras.' },
  { id: 'bakllava', name: 'BakLLaVA (Visión Ligera)', tag: 'Multimodal', size: '4.7 GB', desc: 'Motor visual rápido para analizar fotos de robots y sensores.' },
  { id: 'sqlcoder:7b', name: 'SQLCoder 7B', tag: 'Bases de Datos', size: '4.1 GB', desc: 'Especialista en consultas SQL y almacenamiento de telemetría.' },
  { id: 'wizard-vicuna-uncensored:7b', name: 'Wizard Vicuna 7B', tag: 'Conversación Abierta', size: '3.8 GB', desc: 'Excelente siguiendo instrucciones detalladas sin restricciones.' },
  { id: 'orca-mini:3b', name: 'Orca Mini 3B', tag: 'Instrucciones Rápidas', size: '1.9 GB', desc: 'Optimizado para explicaciones didácticas y tutoría técnica.' },
  { id: 'nemotron-mini:4b', name: 'NVIDIA Nemotron Mini 4B', tag: 'NVIDIA AI', size: '2.7 GB', desc: 'Optimizado para computación en el borde y dispositivos locales.' },
  { id: 'yi:6b', name: '01-ai Yi 6B', tag: 'Gran Contexto', size: '3.5 GB', desc: 'Excelente comprensión bilingüe y análisis de archivos grandes.' },
  { id: 'hermes3:3b', name: 'Nous Hermes 3 3B', tag: 'Agentes & Herramientas', size: '2.0 GB', desc: 'Diseñado específicamente para llamadas a funciones y actuar como agente.' },
  { id: 'granite-code:3b', name: 'IBM Granite Code 3B', tag: 'Código Empresarial', size: '2.1 GB', desc: 'Modelo de IBM para Java, pruebas unitarias y calidad de código.' },
  { id: 'qwen2.5:3b', name: 'Qwen 2.5 3B', tag: 'Equilibrio Potente', size: '1.9 GB', desc: 'Balance perfecto entre tamaño, velocidad y alta comprensión técnica.' }
];

// Helper to check service health
async function checkService(name, url, pingPath) {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${url}${pingPath}`, { signal: controller.signal });
    clearTimeout(timer);
    const latency = Date.now() - start;

    let models = [];
    if (res.ok) {
      try {
        const data = await res.json();
        if (name === 'ollama' && data.models) {
          models = data.models.map(m => m.name);
        } else if (data.data && Array.isArray(data.data)) {
          models = data.data.map(m => m.id);
        }
      } catch (e) {}
    }
    return { online: true, latency, models };
  } catch (err) {
    return { online: false, latency: 0, models: [] };
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;

  // 1. Health check
  if (pathname === '/api/health') {
    const results = {};
    results.ollama = await checkService('ollama', TARGET_SERVICES.ollama, '/api/tags');
    results.neoiacloud = await checkService('neoiacloud', 'https://neoia-351a.onrender.com', '/');
    if (results.neoiacloud.online) {
      results.neoiacloud.models = ['DeepSeek FTC Expert', 'NeoIA Cloud Engine'];
    }
    results.lmstudio = await checkService('lmstudio', TARGET_SERVICES.lmstudio, '/v1/models');
    results.sdwebui = await checkService('sdwebui', TARGET_SERVICES.sdwebui, '/sdapi/v1/options');
    results.comfyui = await checkService('comfyui', TARGET_SERVICES.comfyui, '/system_stats');

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(results));
    return;
  }

  // 1b. Live System & PC Performance Metrics
  if (pathname === '/api/system/metrics') {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsagePct = Math.round((usedMem / totalMem) * 100);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ram: {
        totalGB: (totalMem / (1024 ** 3)).toFixed(1),
        usedGB: (usedMem / (1024 ** 3)).toFixed(1),
        freeGB: (freeMem / (1024 ** 3)).toFixed(1),
        percentage: memUsagePct
      },
      cpus: os.cpus().length,
      platform: os.platform(),
      uptimeHours: (os.uptime() / 3600).toFixed(1),
      timestamp: Date.now()
    }));
    return;
  }

  // Enterprise Database Endpoints
  if (pathname === '/api/db/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(db.getStats()));
    return;
  }

  if (pathname === '/api/db/projects') {
    const category = parsedUrl.searchParams.get('category');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(db.getProjects(category)));
    return;
  }

  if (pathname === '/api/db/telemetry') {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const telemetryData = JSON.parse(body);
          db.logTelemetry(telemetryData);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, logged: true }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    } else {
      const limit = parseInt(parsedUrl.searchParams.get('limit')) || 30;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(db.getTelemetry(limit)));
      return;
    }
  }

  // 1.0. Hybrid Cloud Bridge: Proxy to NeoIA Cloud on Render
  if (pathname === '/api/cloud-chat' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const cloudRes = await fetch('https://neoia-351a.onrender.com/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const cloudData = await cloudRes.json();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(cloudData));
      } catch (err) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No se pudo conectar con NeoIA Cloud: ' + err.message }));
      }
    });
    return;
  }

  // 1.1. Local Network IP for QR Code Mobile Access
  if (pathname === '/api/network-ip') {
    const os = require('os');
    const nets = os.networkInterfaces();
    let localIp = '127.0.0.1';

    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
        if (net.family === 'IPv4' && !net.internal) {
          localIp = net.address;
          break;
        }
      }
      if (localIp !== '127.0.0.1') break;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ip: localIp,
      port: PORT,
      mobileUrl: `http://${localIp}:${PORT}`
    }));
    return;
  }

  // 2. Models Catalog endpoint (List 20 models + status)
  if (pathname === '/api/catalog') {
    const ollamaStatus = await checkService('ollama', TARGET_SERVICES.ollama, '/api/tags');
    const catalogWithStatus = CATALOG_20_MODELS.map(m => {
      const baseName = m.id.split(':')[0];
      const isInstalled = (ollamaStatus.models || []).some(inst => inst === m.id || inst.startsWith(baseName));
      return { ...m, installed: isInstalled };
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(catalogWithStatus));
    return;
  }

  // 2.1. 5 GB Storage Guard API
  if (pathname === '/api/storage') {
    const ollamaPath = path.join(process.env.USERPROFILE || 'C:\\Users\\jhoan', '.ollama');
    let totalBytes = 0;

    function getDirSize(dir) {
      if (!fs.existsSync(dir)) return 0;
      let bytes = 0;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            bytes += getDirSize(fullPath);
          } else if (entry.isFile()) {
            bytes += fs.statSync(fullPath).size;
          }
        }
      } catch (e) {}
      return bytes;
    }

    totalBytes = getDirSize(ollamaPath);
    const usedGB = parseFloat((totalBytes / (1024 * 1024 * 1024)).toFixed(2));
    const maxGB = 5.0;
    const remainingGB = parseFloat(Math.max(0, maxGB - usedGB).toFixed(2));
    const percent = Math.min(100, Math.round((usedGB / maxGB) * 100));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      usedGB,
      maxGB,
      remainingGB,
      percent,
      alert: usedGB >= 4.8
    }));
    return;
  }

  // 3. Agent Tool: Write File to PC (direct to Android Studio if requested)
  if (pathname === '/api/agent/write-file' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { filePath, content, targetAndroidStudio } = JSON.parse(body);
        if (!filePath || content === undefined) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'filePath y content son requeridos' }));
          return;
        }

        const androidStudioDir = 'C:\\Users\\jhoan\\AndroidStudioProjects\\BioBuzzFTC12\\TeamCode\\src\\main\\java\\org\\firstinspires\\ftc\\teamcode';
        let resolved;
        if (targetAndroidStudio || filePath.startsWith('TeamCode') || (!path.isAbsolute(filePath) && fs.existsSync(androidStudioDir))) {
          const base = path.basename(filePath);
          resolved = path.join(androidStudioDir, base);
        } else {
          resolved = path.isAbsolute(filePath) ? filePath : path.join(process.env.USERPROFILE || 'C:\\', filePath);
        }

        const dir = path.dirname(resolved);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(resolved, content, 'utf8');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, savedPath: resolved, bytes: Buffer.byteLength(content) }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 4. Agent Tool: Run Terminal Command on PC
  if (pathname === '/api/agent/run-cmd' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { command } = JSON.parse(body);
        if (!command) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'command es requerido' }));
          return;
        }

        // 5 GB Hard Limit Guard
        if (command.includes('ollama pull')) {
          const ollamaPath = path.join(process.env.USERPROFILE || 'C:\\Users\\jhoan', '.ollama');
          function getDirSize(dir) {
            if (!fs.existsSync(dir)) return 0;
            let bytes = 0;
            try {
              const entries = fs.readdirSync(dir, { withFileTypes: true });
              for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) bytes += getDirSize(fullPath);
                else if (entry.isFile()) bytes += fs.statSync(fullPath).size;
              }
            } catch (e) {}
            return bytes;
          }
          const usedGB = getDirSize(ollamaPath) / (1024 * 1024 * 1024);
          if (usedGB >= 4.5) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              error: `🛡️ BLOQUEO DE SEGURIDAD: Tienes ${usedGB.toFixed(2)} GB usados de tus 5.0 GB máximos. No se puede descargar otro modelo sin borrar uno antes.`
            }));
            return;
          }
        }

        exec(command, { timeout: 30000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: !err,
            stdout: stdout || '',
            stderr: stderr || '',
            error: err ? err.message : null
          }));
        });
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 5. Agent Tool: Read Directory / File on PC
  if (pathname === '/api/agent/read-file' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { filePath } = JSON.parse(body);
        if (!fs.existsSync(filePath)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Archivo no encontrado' }));
          return;
        }
        const content = fs.readFileSync(filePath, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ content }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 5b. Agent Tool: Abrir Aplicaciones (Android Studio, VS Code, Carpeta FTC) con Código Listo
  if (pathname === '/api/open-app' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { app, code, fileName } = JSON.parse(body || '{}');
        const projectDir = 'C:\\Users\\jhoan\\AndroidStudioProjects\\BioBuzzFTC12';
        const teamCodeDir = path.join(projectDir, 'TeamCode', 'src', 'main', 'java', 'org', 'firstinspires', 'ftc', 'teamcode');

        if (!fs.existsSync(teamCodeDir)) {
          fs.mkdirSync(teamCodeDir, { recursive: true });
        }

        let savedFile = null;
        let bytesWritten = 0;
        if (code && typeof code === 'string' && code.trim().length > 0) {
          const targetName = fileName || 'TeleOpBioBuzzTeam.java';
          savedFile = path.join(teamCodeDir, targetName);
          fs.writeFileSync(savedFile, code, 'utf8');
          bytesWritten = Buffer.byteLength(code);
        }

        let appName = '';

        if (app === 'androidstudio') {
          appName = 'Android Studio';
          const studioExe = 'C:\\Program Files\\Android\\Android Studio\\bin\\studio64.exe';

          // Limpiar archivo .lock si quedó huérfano de un cierre anterior
          try {
            const googleAppData = path.join(process.env.APPDATA || 'C:\\Users\\jhoan\\AppData\\Roaming', 'Google');
            if (fs.existsSync(googleAppData)) {
              const entries = fs.readdirSync(googleAppData);
              for (const entry of entries) {
                if (entry.toLowerCase().startsWith('androidstudio')) {
                  const lockPath = path.join(googleAppData, entry, '.lock');
                  if (fs.existsSync(lockPath)) {
                    fs.unlinkSync(lockPath);
                    console.log('🔓 Bloqueo .lock eliminado de Android Studio:', lockPath);
                  }
                }
              }
            }
          } catch (lockErr) {
            console.error('Aviso al limpiar .lock:', lockErr.message);
          }

          if (fs.existsSync(studioExe)) {
            const child = spawn(studioExe, [projectDir], { detached: true, stdio: 'ignore' });
            child.unref();
          } else {
            const child = spawn('explorer.exe', [projectDir], { detached: true, stdio: 'ignore' });
            child.unref();
          }
        } else if (app === 'vscode') {
          appName = 'VS Code';
          const vsCodeExe = path.join(process.env.LOCALAPPDATA || 'C:\\Users\\jhoan\\AppData\\Local', 'Programs', 'Microsoft VS Code', 'Code.exe');
          if (fs.existsSync(vsCodeExe)) {
            const child = spawn(vsCodeExe, [projectDir], { detached: true, stdio: 'ignore' });
            child.unref();
          } else {
            const child = spawn('cmd.exe', ['/c', 'code', projectDir], { detached: true, stdio: 'ignore' });
            child.unref();
          }
        } else if (app === 'folder') {
          appName = 'Carpeta de Código FTC';
          const child = spawn('explorer.exe', [teamCodeDir], { detached: true, stdio: 'ignore' });
          child.unref();
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'App no soportada. Usa androidstudio, vscode o folder' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true, 
          message: savedFile 
            ? `¡Código (${path.basename(savedFile)}) guardado y ${appName} abierto con el código listo!` 
            : `¡${appName} abierto con éxito en tu PC!`,
          savedFile,
          bytesWritten
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 6. Reverse Proxy for AI services
  const proxyMatch = pathname.match(/^\/proxy\/([a-z0-9_-]+)(\/.*)?$/);
  if (proxyMatch) {
    const serviceName = proxyMatch[1];
    const targetBase = TARGET_SERVICES[serviceName];
    const subPath = (proxyMatch[2] || '') + parsedUrl.search;

    if (!targetBase) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Servicio ${serviceName} no reconocido` }));
      return;
    }

    const targetUrl = `${targetBase}${subPath}`;
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', async () => {
      const bodyBuffer = Buffer.concat(chunks);
      try {
        const fetchOptions = {
          method: req.method,
          headers: {
            'Content-Type': req.headers['content-type'] || 'application/json'
          }
        };
        if (req.method !== 'GET' && req.method !== 'HEAD' && bodyBuffer.length > 0) {
          fetchOptions.body = bodyBuffer;
        }

        const upstreamRes = await fetch(targetUrl, fetchOptions);
        const resContentType = upstreamRes.headers.get('content-type') || 'application/json';
        res.writeHead(upstreamRes.status, { 'Content-Type': resContentType });

        if (upstreamRes.body) {
          const { Readable } = require('stream');
          Readable.fromWeb(upstreamRes.body).pipe(res);
        } else {
          res.end();
        }
      } catch (proxyErr) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: `No se pudo conectar con ${serviceName} en ${targetBase}`,
          details: proxyErr.message
        }));
      }
    });
    return;
  }

  // 6.5. Direct APK Download Route
  if (pathname === '/download-apk' || pathname === '/apk' || pathname === '/biobuzz.apk') {
    let apkFile = path.join(PUBLIC_DIR, 'FTC-8404-Odometry-Workshop.apk');
    if (!fs.existsSync(apkFile)) apkFile = path.join(__dirname, 'FTC-8404-Odometry-Workshop.apk');
    if (fs.existsSync(apkFile)) {
      const stat = fs.statSync(apkFile);
      res.writeHead(200, {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': 'attachment; filename="FTC-8404-Odometry-Workshop.apk"',
        'Content-Length': stat.size
      });
      fs.createReadStream(apkFile).pipe(res);
      return;
    }
  }

  // 7. Static file serving
  let relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  let filePath = path.join(PUBLIC_DIR, relPath);
  if (!fs.existsSync(filePath)) {
    if (fs.existsSync(path.join(__dirname, relPath))) {
      filePath = path.join(__dirname, relPath);
    } else if (fs.existsSync(path.join(__dirname, 'public', relPath))) {
      filePath = path.join(__dirname, 'public', relPath);
    }
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Archivo no encontrado');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const headers = {
      'Content-Type': contentType,
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    };

    if (ext === '.apk') {
      headers['Content-Disposition'] = `attachment; filename="${path.basename(filePath)}"`;
      headers['Content-Length'] = stats.size;
    }

    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🚀 LOCAL AI NEXUS SERVER CON AGENTE & 20 MODELOS`);
  console.log(`📍 Accede en tu navegador: http://localhost:${PORT}`);
  console.log(`📱 Acceso en red Wi-Fi activo en el puerto ${PORT}`);
  console.log(`=======================================================`);

  // Preload fast model into RAM permanently for instant responses
  fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'llama3.2:1b', keep_alive: '24h' })
  }).then(() => console.log('⚡ Modelo llama3.2:1b precargado en RAM (Turbo < 3s)')).catch(() => {});
});
