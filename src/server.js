const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');
const { getProvider, ProviderConfigurationError } = require('./providers');

const publicDir = path.resolve(__dirname, '../public');
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const recentRequests = new Map();

function sendJson(response, status, data) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(JSON.stringify(data));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 100_000) {
        reject(new Error('Request is too large. Shorten the brief and try again.'));
        request.destroy();
      }
    });
    request.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(new Error('The request could not be read. Please check the form and try again.')); }
    });
    request.on('error', reject);
  });
}

function validateBrief(body) {
  const fields = ['topic', 'audience', 'keywords', 'tone'];
  const brief = {};
  for (const field of fields) {
    if (typeof body[field] !== 'string' || !body[field].trim()) return { error: `Please enter a ${field === 'keywords' ? 'target keyword' : field}.` };
    if (body[field].length > 2_000) return { error: 'One of the brief fields is too long. Please shorten it and try again.' };
    brief[field] = body[field].trim();
  }
  const wordCount = Number(body.wordCount);
  if (!Number.isInteger(wordCount) || wordCount < 300 || wordCount > 3000) return { error: 'Choose an article length between 300 and 3,000 words.' };
  brief.wordCount = wordCount;
  return { brief };
}

function serveStatic(request, response, pathname) {
  const requested = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
  const filePath = path.resolve(publicDir, requested);
  if (!filePath.startsWith(`${publicDir}${path.sep}`) && filePath !== path.join(publicDir, 'index.html')) {
    response.writeHead(403); response.end('Forbidden'); return;
  }
  fs.readFile(filePath, (error, contents) => {
    if (error) { response.writeHead(404); response.end('Not found'); return; }
    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    });
    response.end(contents);
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (url.pathname === '/api/health' && request.method === 'GET') {
    const configured = Boolean(config.provider && config.apiKey && config.model);
    return sendJson(response, 200, { ok: true, aiConfigured: configured });
  }
  if (url.pathname === '/api/generate' && request.method === 'POST') {
    const address = request.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const previous = recentRequests.get(address) || 0;
    if (now - previous < 5000) return sendJson(response, 429, { error: 'Please wait a few seconds before generating another article.' });
    recentRequests.set(address, now);
    try {
      const body = await readJson(request);
      const validated = validateBrief(body);
      if (validated.error) return sendJson(response, 400, { error: validated.error });
      const provider = getProvider();
      const article = await provider.generate(validated.brief);
      return sendJson(response, 200, { article });
    } catch (error) {
      if (error instanceof ProviderConfigurationError) return sendJson(response, 503, { error: error.message });
      if (error.name === 'TimeoutError' || error.name === 'AbortError') return sendJson(response, 504, { error: 'The AI service took too long to respond. Please try again.' });
      if (error.message?.startsWith('Request is too large') || error.message?.startsWith('The request could not')) return sendJson(response, 400, { error: error.message });
      console.error('Article generation failed:', error.message);
      return sendJson(response, 502, { error: error.message || 'Something went wrong while generating the article. Please try again.' });
    }
  }
  if (url.pathname.startsWith('/api/')) return sendJson(response, 404, { error: 'That API route was not found.' });
  if (request.method !== 'GET') { response.writeHead(405); return response.end('Method not allowed'); }
  return serveStatic(request, response, url.pathname);
});

server.listen(config.port, '127.0.0.1', () => {
  console.log(`Venbhas AI Blog Writing Agent is running at http://localhost:${config.port}`);
  if (!config.provider || !config.apiKey || !config.model) console.log('AI generation is not configured. Copy .env.example to .env and add provider details when ready.');
});
