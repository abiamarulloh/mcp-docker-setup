const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const net = require('net');
const url = require('url');

const BASE_PORT = Number.parseInt(process.env.UI_PORT || process.env.PORT || '3456', 10);
const ROOT = __dirname;
const PROJECT = path.resolve(ROOT, '..');
const ENV_PATH = path.join(PROJECT, '.env');
const SOURCE_PATH = path.join(PROJECT, 'source.json');
const ENV_EXAMPLE_PATH = path.join(PROJECT, '.env.example');

function readEnv(filePath) {
  if (!fs.existsSync(filePath)) return { lines: [], parsed: {} };
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  const parsed = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    parsed[key] = val;
  }
  return { lines, parsed };
}

function writeEnv(filePath, updates) {
  const { lines } = readEnv(filePath);
  const usedKeys = new Set();
  const out = lines.map(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || !trimmed.includes('=')) return line;
    const eq = line.indexOf('=');
    const key = line.slice(0, eq).trim();
    if (updates[key] !== undefined) {
      usedKeys.add(key);
      return `${key}=${updates[key]}`;
    }
    return line;
  });
  for (const [key, val] of Object.entries(updates)) {
    if (!usedKeys.has(key)) {
      out.push(`${key}=${val}`);
    }
  }
  fs.writeFileSync(filePath, out.join('\n') + '\n');
}

function readSource() {
  return JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf-8'));
}

function writeSource(data) {
  fs.writeFileSync(SOURCE_PATH, JSON.stringify(data, null, 2) + '\n');
}

function getEnvMapping() {
  const source = readSource();
  const servers = source.mcpServers || {};
  const mapping = {};
  for (const [serverName, server] of Object.entries(servers)) {
    const env = server.env || {};
    for (const [envKey, envVal] of Object.entries(env)) {
      const refMatch = typeof envVal === 'string' ? envVal.match(/^\$\{(.+)\}$/) : null;
      const varName = refMatch ? refMatch[1] : envVal;
      if (!mapping[varName]) mapping[varName] = [];
      mapping[varName].push({ server: serverName, envKey });
    }
  }
  return mapping;
}

function getConfig() {
  const envData = readEnv(ENV_PATH);
  const source = readSource();
  const servers = source.mcpServers || {};

  const result = {};
  for (const [serverName, server] of Object.entries(servers)) {
    const serverEnv = server.env || {};
    const envVars = {};
    for (const [envKey, envVal] of Object.entries(serverEnv)) {
      const refMatch = typeof envVal === 'string' ? envVal.match(/^\$\{(.+)\}$/) : null;
      const varName = refMatch ? refMatch[1] : envVal;
      envVars[varName] = {
        envKey,
        value: envData.parsed[varName] || '',
        enabled: true,
        status: null,
        statusText: ''
      };
    }
    result[serverName] = {
      command: server.command,
      args: server.args || [],
      env: envVars
    };
  }

  const example = readEnv(ENV_EXAMPLE_PATH);
  for (const [varName, defaultValue] of Object.entries(example.parsed)) {
    if (!result['_orphan']) result['_orphan'] = { command: '', args: [], env: {} };
    if (Object.values(result).some(s => s.env && s.env[varName])) continue;
    const enabled = envData.parsed[varName] !== undefined && envData.parsed[varName] !== '';
    result['_orphan'].env[varName] = {
      envKey: varName,
      value: envData.parsed[varName] || '',
      enabled,
      status: null,
      statusText: ''
    };
  }
  if (result['_orphan'] && Object.keys(result['_orphan'].env).length === 0) {
    delete result['_orphan'];
  }

  return result;
}

function saveConfig(body) {
  const savedServers = body.servers || {};
  const envUpdates = {};
  const source = readSource();
  if (!source.mcpServers) source.mcpServers = {};

  for (const [serverName, serverData] of Object.entries(savedServers)) {
    const envVars = serverData.env || {};
    for (const [varName, varData] of Object.entries(envVars)) {
      envUpdates[varName] = varData.value || '';
    }
    if (serverName === '_orphan') continue;
    if (!source.mcpServers[serverName]) {
      source.mcpServers[serverName] = { command: '', args: [] };
    }
    const serverSource = source.mcpServers[serverName];
    const newEnv = {};
    for (const [varName, varData] of Object.entries(envVars)) {
      newEnv[varData.envKey || varName] = `\${${varName}}`;
    }
    serverSource.env = Object.keys(newEnv).length > 0 ? newEnv : undefined;
  }

  writeEnv(ENV_PATH, envUpdates);
  writeSource(source);

  try {
    execSync('npm run generate', { cwd: PROJECT, stdio: 'pipe' });
  } catch (e) {
    throw new Error(`Generate failed: ${e.stderr?.toString() || e.message}`);
  }
}

function testGitHubToken(token) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: '/user',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'mcp-env-ui',
        'Accept': 'application/vnd.github+json'
      },
      timeout: 10000
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const user = JSON.parse(data);
            resolve({ ok: true, text: `Connected as ${user.login}` });
          } catch {
            resolve({ ok: true, text: 'Connected' });
          }
        } else if (res.statusCode === 401) {
          resolve({ ok: false, text: 'Invalid token (401)' });
        } else if (res.statusCode === 403) {
          resolve({ ok: false, text: 'Rate limited (403)' });
        } else {
          resolve({ ok: false, text: `HTTP ${res.statusCode}` });
        }
      });
    });
    req.on('error', (err) => {
      resolve({ ok: false, text: `Connection failed: ${err.message}` });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, text: 'Connection timed out' });
    });
    req.end();
  });
}

function testPostgresURL(urlStr) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(urlStr);
      const host = parsed.hostname;
      const port = parseInt(parsed.port) || 5432;
      const socket = new net.Socket();
      socket.setTimeout(5000);
      socket.on('connect', () => {
        socket.destroy();
        resolve({ ok: true, text: `Connected to ${host}:${port}` });
      });
      socket.on('error', (err) => {
        resolve({ ok: false, text: `Cannot connect: ${err.message}` });
      });
      socket.on('timeout', () => {
        socket.destroy();
        resolve({ ok: false, text: 'Connection timed out' });
      });
      socket.connect(port, host);
    } catch (err) {
      resolve({ ok: false, text: `Invalid URL: ${err.message}` });
    }
  });
}

function normalizeHttpOrigin(host) {
  if (!host) return null;
  const trimmed = String(host).trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    try {
      return new URL(`https://${trimmed}`).origin;
    } catch {
      return null;
    }
  }
}

function httpRequestJson({ urlStr, method = 'GET', headers = {}, body = null, timeoutMs = 10000 }) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(urlStr);
    } catch (e) {
      reject(new Error(`Invalid URL: ${e.message}`));
      return;
    }

    const lib = parsed.protocol === 'http:' ? http : https;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'http:' ? 80 : 443),
      path: `${parsed.pathname}${parsed.search}`,
      method,
      headers,
      timeout: timeoutMs
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        const contentType = String(res.headers['content-type'] || '');
        if (contentType.includes('application/json')) {
          try {
            resolve({ statusCode: res.statusCode, headers: res.headers, json: data ? JSON.parse(data) : null, text: data });
          } catch {
            resolve({ statusCode: res.statusCode, headers: res.headers, json: null, text: data });
          }
          return;
        }
        resolve({ statusCode: res.statusCode, headers: res.headers, json: null, text: data });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('Request timed out'));
    });

    if (body) req.write(body);
    req.end();
  });
}

async function testJiraConnection({ host, email, apiToken }) {
  const origin = normalizeHttpOrigin(host);
  if (!origin) return { ok: false, text: 'Invalid JIRA_HOST' };
  if (!email) return { ok: false, text: 'Missing JIRA_EMAIL' };
  if (!apiToken) return { ok: false, text: 'Missing JIRA_API_TOKEN' };

  const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
  const headers = {
    'Authorization': `Basic ${auth}`,
    'Accept': 'application/json'
  };

  const endpoints = [
    `${origin}/rest/api/3/myself`,
    `${origin}/rest/api/2/myself`
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await httpRequestJson({ urlStr: endpoint, method: 'GET', headers, timeoutMs: 10000 });
      if (res.statusCode === 200 && res.json) {
        const display = res.json.displayName || res.json.name || res.json.emailAddress || 'user';
        return { ok: true, text: `Connected as ${display}` };
      }
      if (res.statusCode === 401) return { ok: false, text: 'Unauthorized (401) — check JIRA_EMAIL / JIRA_API_TOKEN' };
      if (res.statusCode === 403) return { ok: false, text: 'Forbidden (403) — token lacks permission' };
      if (res.statusCode === 404) continue;
      const snippet = (res.text || '').slice(0, 200).trim();
      return { ok: false, text: `HTTP ${res.statusCode}${snippet ? `: ${snippet}` : ''}` };
    } catch (e) {
      return { ok: false, text: `Connection failed: ${e.message}` };
    }
  }

  return { ok: false, text: 'Jira endpoint not found (tried /rest/api/3/myself and /rest/api/2/myself)' };
}

async function testSlackConnection({ botToken, teamId }) {
  if (!botToken) return { ok: false, text: 'Missing SLACK_BOT_TOKEN' };
  if (!teamId) return { ok: false, text: 'Missing SLACK_TEAM_ID' };

  try {
    const res = await httpRequestJson({
      urlStr: 'https://slack.com/api/auth.test',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': '0'
      },
      timeoutMs: 10000
    });

    if (res.statusCode !== 200) {
      return { ok: false, text: `HTTP ${res.statusCode}` };
    }

    if (!res.json) {
      const snippet = (res.text || '').slice(0, 200).trim();
      return { ok: false, text: `Invalid response${snippet ? `: ${snippet}` : ''}` };
    }

    if (res.json.ok) {
      if (res.json.team_id && res.json.team_id !== teamId) {
        return { ok: false, text: `Connected, but SLACK_TEAM_ID mismatch (got ${res.json.team_id})` };
      }
      const user = res.json.user || res.json.user_id || 'bot';
      return { ok: true, text: `Connected as ${user}` };
    }

    return { ok: false, text: res.json.error ? `Slack error: ${res.json.error}` : 'Slack auth failed' };
  } catch (e) {
    return { ok: false, text: `Connection failed: ${e.message}` };
  }
}

function getRequiredVarsForServer(serverName) {
  const known = {
    jira: ['JIRA_HOST', 'JIRA_EMAIL', 'JIRA_API_TOKEN'],
    slack: ['SLACK_BOT_TOKEN', 'SLACK_TEAM_ID'],
    'github-personal': ['GITHUB_PERSONAL_ACCESS_TOKEN'],
    context7: ['CONTEXT7_API_KEY'],
    'filesystem-personal': ['FILESYSTEM_PATH']
  };
  return known[serverName] || [];
}

async function testServerConnection(serverName, vars) {
  const required = getRequiredVarsForServer(serverName);
  const missing = required.filter((k) => !vars[k] || !String(vars[k]).trim());
  if (missing.length) {
    return { ok: false, text: `Missing required env: ${missing.join(', ')}`, missing };
  }

  if (serverName === 'jira') {
    const r = await testJiraConnection({
      host: vars.JIRA_HOST,
      email: vars.JIRA_EMAIL,
      apiToken: vars.JIRA_API_TOKEN
    });
    return { ...r, missing };
  }

  if (serverName === 'slack') {
    const r = await testSlackConnection({
      botToken: vars.SLACK_BOT_TOKEN,
      teamId: vars.SLACK_TEAM_ID
    });
    return { ...r, missing };
  }

  if (serverName === 'github-personal') {
    const r = await testGitHubToken(vars.GITHUB_PERSONAL_ACCESS_TOKEN);
    return { ...r, missing };
  }

  if (serverName === 'context7') {
    const key = vars.CONTEXT7_API_KEY || '';
    if (!key) return { ok: false, text: 'Missing CONTEXT7_API_KEY', missing };
    try {
      const res = await httpRequestJson({
        urlStr: 'https://context7.com/api/v2/libs/search?libraryName=react&query=test',
        method: 'GET',
        headers: { 'Authorization': `Bearer ${key}` },
        timeoutMs: 10000
      });
      if (res.statusCode === 200) {
        return { ok: true, text: 'API key valid', missing };
      }
      if (res.statusCode === 401) {
        return { ok: false, text: 'Invalid API key (401)', missing };
      }
      return { ok: false, text: `Unexpected response: HTTP ${res.statusCode}`, missing };
    } catch (e) {
      return { ok: false, text: `Connection failed: ${e.message}`, missing };
    }
  }

  if (serverName === 'filesystem-personal') {
    const p = vars.FILESYSTEM_PATH || '';
    if (!p) return { ok: false, text: 'No path configured', missing };
    if (!fs.existsSync(p)) return { ok: false, text: `Path does not exist: ${p}`, missing };
    const stats = fs.statSync(p);
    if (!stats.isDirectory()) return { ok: false, text: `Not a directory: ${p}`, missing };
    return { ok: true, text: `Directory exists (${p})`, missing };
  }

  return { ok: true, text: 'No server-level test available', missing };
}

function testConnection(serverName, varName, value, serverEnv) {
  const upper = varName.toUpperCase();

  if (upper.includes('GITHUB') && (upper.includes('TOKEN') || upper.includes('KEY'))) {
    return testGitHubToken(value);
  }

  if ((upper.includes('POSTGRES') || upper.includes('PG')) && (upper.includes('URL') || upper.includes('HOST'))) {
    return testPostgresURL(value);
  }

  if (upper === 'SLACK_BOT_TOKEN') {
    const teamId = (serverEnv && serverEnv['SLACK_TEAM_ID'] && serverEnv['SLACK_TEAM_ID'].value) || '';
    if (String(value).startsWith('xoxb-')) {
      if (teamId) return testSlackConnection({ botToken: value, teamId });
      if (String(value).length > 20) return Promise.resolve({ ok: true, text: 'Format valid' });
      return Promise.resolve({ ok: true, text: 'Format valid (xoxb-)' });
    }
    return Promise.resolve({ ok: false, text: 'Must start with xoxb-' });
  }

  if (upper === 'SLACK_TEAM_ID') {
    if (String(value).startsWith('T') && String(value).length >= 6) {
      return Promise.resolve({ ok: true, text: 'Format valid' });
    }
    return Promise.resolve({ ok: false, text: 'Must start with T and be >= 6 chars' });
  }

  if (upper === 'SLACK_CHANNEL_IDS') {
    const ids = String(value).split(',').map(s => s.trim()).filter(Boolean);
    const invalid = ids.filter(id => !id.startsWith('C'));
    if (invalid.length > 0) {
      return Promise.resolve({ ok: false, text: `Invalid channel IDs: ${invalid.join(', ')} (must start with C)` });
    }
    return Promise.resolve({ ok: true, text: `${ids.length} channel(s) configured` });
  }

  if (upper === 'JIRA_HOST') {
    const origin = normalizeHttpOrigin(value);
    if (!origin) return Promise.resolve({ ok: false, text: 'Invalid URL — add http:// or https://' });
    return httpRequestJson({ urlStr: origin, method: 'GET', timeoutMs: 8000 })
      .then(res => {
        if (res.statusCode >= 200 && res.statusCode < 500) {
          return { ok: true, text: `Reachable (HTTP ${res.statusCode})` };
        }
        return { ok: false, text: `HTTP ${res.statusCode}` };
      })
      .catch(err => ({ ok: false, text: `Unreachable: ${err.message}` }));
  }

  if (upper === 'JIRA_EMAIL') {
    const email = String(value).trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Promise.resolve({ ok: true, text: 'Valid email format' });
    }
    return Promise.resolve({ ok: false, text: 'Invalid email format' });
  }

  if (upper === 'JIRA_API_TOKEN') {
    if (!value) return Promise.resolve({ ok: false, text: 'No value' });
    const host = (serverEnv && serverEnv['JIRA_HOST'] && serverEnv['JIRA_HOST'].value) || '';
    const email = (serverEnv && serverEnv['JIRA_EMAIL'] && serverEnv['JIRA_EMAIL'].value) || '';
    if (host && email) {
      return testJiraConnection({ host, email, apiToken: value });
    }
    return Promise.resolve({ ok: true, text: 'Value set (fill JIRA_HOST + JIRA_EMAIL for full test)' });
  }

  if (upper === 'CONTEXT7_API_KEY') {
    if (!value) return Promise.resolve({ ok: false, text: 'No value' });
    return httpRequestJson({
      urlStr: 'https://context7.com/api/v2/libs/search?libraryName=react&query=test',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${value}` },
      timeoutMs: 10000
    }).then(res => {
      if (res.statusCode === 200) return { ok: true, text: 'API key valid' };
      if (res.statusCode === 401) return { ok: false, text: 'Invalid API key (401)' };
      return { ok: false, text: `HTTP ${res.statusCode}` };
    }).catch(err => ({ ok: false, text: `Connection failed: ${err.message}` }));
  }

  if (upper === 'FILESYSTEM_PATH') {
    if (!value) return Promise.resolve({ ok: false, text: 'No path configured' });
    try {
      if (!fs.existsSync(value)) return Promise.resolve({ ok: false, text: 'Path does not exist' });
      const stats = fs.statSync(value);
      if (!stats.isDirectory()) return Promise.resolve({ ok: false, text: 'Not a directory' });
      return Promise.resolve({ ok: true, text: 'Directory exists' });
    } catch (e) {
      return Promise.resolve({ ok: false, text: `Error: ${e.message}` });
    }
  }

  if (value) return Promise.resolve({ ok: true, text: 'Value set' });
  return Promise.resolve({ ok: false, text: 'No value' });
}

function parseJSON(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function serveFile(res, filePath, contentType) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const data = fs.readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(data);
}

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const method = req.method;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    if (method === 'GET' && parsed.pathname === '/api/config') {
      const config = getConfig();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(config));
      return;
    }

    if (method === 'POST' && parsed.pathname === '/api/config') {
      const body = await parseJSON(req);
      saveConfig(body);
      const config = getConfig();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, servers: config }));
      return;
    }

    const serverTestMatch = parsed.pathname.match(/^\/api\/test-server\/([^/]+)$/);
    if (method === 'POST' && serverTestMatch) {
      const serverName = serverTestMatch[1];
      const body = await parseJSON(req);
      const vars = body && typeof body.vars === 'object' && body.vars ? body.vars : {};
      const result = await testServerConnection(serverName, vars);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    const testMatch = parsed.pathname.match(/^\/api\/test\/([^/]+)\/([^/]+)$/);
    if (method === 'POST' && testMatch) {
      const serverName = testMatch[1];
      const varName = testMatch[2];
      const body = await parseJSON(req);
      const result = await testConnection(serverName, varName, body.value || '', body.serverEnv || {});
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    if (method === 'GET' && parsed.pathname === '/') {
      serveFile(res, path.join(ROOT, 'index.html'), 'text/html');
      return;
    }

    const staticPath = path.join(ROOT, parsed.pathname);
    const ext = path.extname(staticPath);
    if (fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
      serveFile(res, staticPath, MIME[ext] || 'application/octet-stream');
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

function listenWithFallback({ server, port, maxAttempts }) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const tryListen = () => {
      const targetPort = port + attempts;

      const onListening = () => {
        cleanup();
        resolve({ port: targetPort });
      };

      const onError = (err) => {
        if (err && err.code === 'EADDRINUSE' && attempts < maxAttempts) {
          attempts += 1;
          tryListen();
          return;
        }
        cleanup();
        reject(err);
      };

      const cleanup = () => {
        server.off('listening', onListening);
        server.off('error', onError);
      };

      server.once('listening', onListening);
      server.once('error', onError);
      server.listen(targetPort);
    };

    tryListen();
  });
}

listenWithFallback({ server, port: BASE_PORT, maxAttempts: 20 })
  .then(({ port }) => {
    console.log(`\n  MCP Env UI running at:\n  → http://localhost:${port}\n`);
  })
  .catch((err) => {
    const message = err && err.code === 'EADDRINUSE'
      ? `Port range ${BASE_PORT}-${BASE_PORT + 20} is already in use. Set UI_PORT (or PORT) to a free port.`
      : (err && err.message ? err.message : String(err));
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });