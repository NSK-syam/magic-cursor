import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { draft as draftClaude } from '../src/claude-client.mjs';
import answers from '../src/answers.js';
import policy from '../src/draft-policy.js';
import { createCredentialStore } from './credential-store.mjs';

const root = fileURLToPath(new URL('../dist/magic-cursor/', import.meta.url));
const token = () => randomBytes(24).toString('hex');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/plain', '.txt': 'text/plain', '.json': 'application/json' };

export function createLocalServer({ generate = draftClaude, fetchAPI = fetch, credentialStore = createCredentialStore() } = {}) {
  const sessions = new Map();
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const json = (status, value) => { if (!res.destroyed) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); } };
    try {
      const host = req.headers.host || '';
      const port = server.address()?.port;
      if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(host)) { json(403, { ok: false, error: 'Local access only.' }); return; }
      const url = new URL(req.url, `http://${host}`);
      if (url.pathname.startsWith('/api/')) {
        if (req.headers.origin && req.headers.origin !== `http://${host}`) { json(403, { ok: false, error: 'Cross-origin requests are not allowed.' }); return; }
        const now = Date.now();
        for (const [id, entry] of sessions) if (now - entry.touchedAt > 8 * 60 * 60 * 1000) sessions.delete(id);
        const cookie = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith('magic_session='))?.slice('magic_session='.length);
        let session = sessions.get(cookie);
        if (url.pathname === '/api/status' && req.method === 'GET') {
          if (!session) {
            if (sessions.size >= 100) { json(429, { ok: false, error: 'Too many local sessions. Restart the local server.' }); return; }
            const id = token(); session = { keys: {}, csrf: token(), touchedAt: now, busy: false, lastDraftAt: 0 }; sessions.set(id, session);
            res.setHeader('Set-Cookie', `magic_session=${id}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=28800`);
          }
          session.touchedAt = now;
          const saved = await credentialStore.read();
          json(200, { ok: true, csrfToken: session.csrf, connected: { claude: Boolean(session.keys.claude || saved.claude), openai: Boolean(session.keys.openai || saved.openai) }, remembered: { claude: Boolean(saved.claude), openai: Boolean(saved.openai) } }); return;
        }
        if (req.method !== 'POST' || req.headers.origin !== `http://${host}` || !session || req.headers['x-magic-csrf'] !== session.csrf) { json(403, { ok: false, error: 'Local session expired. Refresh the page and reconnect your API key.' }); return; }
        session.touchedAt = now;
        if (!String(req.headers['content-type']).startsWith('application/json')) { json(415, { ok: false, error: 'JSON is required.' }); return; }
        const chunks = []; let bytes = 0;
        for await (const chunk of req) { bytes += chunk.length; if (bytes > 256000) { json(413, { ok: false, error: 'Request too large.' }); return; } chunks.push(chunk); }
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { json(400, { ok: false, error: 'Invalid JSON request.' }); return; }
        if (!body || !['claude', 'openai'].includes(body.provider)) { json(400, { ok: false, error: 'Choose Claude or OpenAI.' }); return; }
        const provider = body.provider;
        if (url.pathname === '/api/connect') {
          if (typeof body.apiKey !== 'string' || !body.apiKey.trim() || body.apiKey.length > 2000) { json(400, { ok: false, error: 'Enter a valid API key.' }); return; }
          if (body.remember !== undefined && typeof body.remember !== 'boolean') { json(400, { ok: false, error: 'Choose whether to remember this key.' }); return; }
          if (body.remember) await credentialStore.save(provider, body.apiKey.trim());
          else await credentialStore.remove(provider);
          session.keys[provider] = body.apiKey.trim(); json(200, { ok: true }); return;
        }
        if (url.pathname === '/api/remember') {
          if (typeof body.remember !== 'boolean') { json(400, { ok: false, error: 'Choose whether to remember this key.' }); return; }
          const key = session.keys[provider] || (await credentialStore.read())[provider];
          if (!key) { json(400, { ok: false, error: 'Connect your API key first.' }); return; }
          if (body.remember) await credentialStore.save(provider, key); else await credentialStore.remove(provider);
          session.keys[provider] = key; json(200, { ok: true }); return;
        }
        if (url.pathname === '/api/disconnect') {
          await credentialStore.remove(provider);
          for (const entry of sessions.values()) delete entry.keys[provider];
          json(200, { ok: true }); return;
        }
        if (url.pathname !== '/api/draft') { json(404, { ok: false, error: 'Unknown API route.' }); return; }
        let { question, resume } = body;
        if (typeof question !== 'string' || !question.trim() || question.length > 1000 || typeof resume !== 'string' || !resume.trim() || resume.length > 40000) { json(400, { ok: false, error: 'Save your resume text and choose a readable question before drafting.' }); return; }
        let prepared;
        try { prepared = policy.prepareInput(question, resume); } catch (error) { json(400, { ok: false, error: error.message }); return; }
        ({ question, resume } = prepared);
        if (answers.needsFact(question)) { json(200, { ok: true, draft: { answer: '', evidence: [], missingFacts: ['Please provide this fact or preference yourself.'] } }); return; }
        const apiKey = session.keys[provider] || (await credentialStore.read())[provider];
        if (!apiKey) { json(400, { ok: false, error: `Connect ${provider === 'claude' ? 'Claude' : 'OpenAI'} using Turn on AI answers at the top of your profile.` }); return; }
        if (session.busy || now - session.lastDraftAt < 10000) { json(429, { ok: false, error: 'A draft is in progress or was just requested. Please wait 10 seconds.' }); return; }
        session.busy = true; session.lastDraftAt = now;
        try {
          let draft;
          if (provider === 'claude') draft = await generate({ apiKey, question, resume, ...policy });
          else {
            const response = await fetchAPI('https://api.openai.com/v1/responses', { method: 'POST', signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model: 'gpt-4o-mini', store: false, max_output_tokens: 1600, instructions: policy.instructions, input: JSON.stringify({ question, resume }), text: { format: { type: 'json_schema', name: 'application_answer', strict: true, schema: policy.schema } } }) });
            if (!response.ok) throw new Error(response.status === 401 ? 'OpenAI rejected the API key.' : response.status === 429 ? 'OpenAI quota or rate limit reached.' : `OpenAI request failed (${response.status}).`);
            const payload = await response.json();
            if (payload.status !== 'completed') throw new Error('OpenAI did not complete this draft. Please try again.');
            try { draft = JSON.parse((payload.output || []).flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('')); } catch { throw new Error('OpenAI did not return a usable draft.'); }
          }
          json(200, { ok: true, draft: { ...answers.validateDraft(draft, resume, prepared), filteredInput: prepared.filtered } });
        } catch (error) { json(502, { ok: false, error: error.name === 'TimeoutError' ? 'The draft request timed out. Try again.' : error.message }); }
        finally { session.busy = false; }
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
      const pathname = decodeURIComponent(url.pathname);
      const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(root) || pathname.split('/').some(part => part.startsWith('.'))) { res.writeHead(403); res.end(); return; }
      if (!(await stat(file)).isFile()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      res.end(req.method === 'HEAD' ? undefined : await readFile(file));
    } catch { if (!res.headersSent) json(req.url?.startsWith('/api/') ? 500 : 404, { ok: false, error: req.url?.startsWith('/api/') ? 'Could not access saved API keys. Check this device’s credential storage and try again.' : 'The requested local resource was not found.' }); else res.end(); }
  });
  server.on('close', () => sessions.clear());
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const server = createLocalServer();
  const port = Number(process.env.MAGIC_CURSOR_PORT || 4321);
  server.listen(port, '127.0.0.1', () => console.log(`Magic Cursor: http://127.0.0.1:${port} (remembered API keys stay on this device)`));
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is in use. Stop the previous server or set MAGIC_CURSOR_PORT.` : 'Could not start the local server.'); process.exitCode = 1; });
}
