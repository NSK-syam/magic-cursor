const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { JSDOM } = require('jsdom');
const settle = () => new Promise(resolve => setImmediate(resolve));
async function popup({ running = true, injectFails = false } = {}) {
  const dom = new JSDOM(readFileSync('popup.html', 'utf8'), { runScripts: 'outside-only' });
  const calls = [], stored = { profile: {}, settings: { enabled: true, mode: 'hover' }, resume: '' };
  dom.window.MagicStorage = { async get() { return stored; }, async set(data) { Object.assign(stored, data); } };
  dom.window.chrome = {
    runtime: { getManifest() { return { version: '0.4.0' }; }, openOptionsPage() {} },
    storage: { local: { async setAccessLevel() {}, async get() { return stored; } }, session: { async get() { return {}; } } },
    tabs: { async query() { return [{ id: 42 }]; }, async sendMessage(id, message) { calls.push({ id, message }); if (!running) throw new Error('No receiving end'); return { ok: true, version: '0.4.0', enabled: true, fieldCount: 3 }; } },
    scripting: { async executeScript(options) { calls.push(options); if (injectFails) throw new Error('Cannot access a chrome:// URL'); running = true; } }
  };
  dom.window.eval(readFileSync('src/credentials.js', 'utf8'));
  dom.window.eval(readFileSync('src/popup.js', 'utf8')); await settle();
  return { dom, calls, stored, doc: dom.window.document };
}
test('popup reports whether the content script responds on the current tab', async () => {
  const active = await popup();
  assert.match(active.doc.getElementById('page-status').textContent, /Active.*3/i); active.dom.window.close();
  const inactive = await popup({ running: false });
  assert.match(inactive.doc.getElementById('page-status').textContent, /not running/i);
  assert.equal(inactive.doc.getElementById('enable-page').hidden, false); inactive.dom.window.close();
});
test('enable on this page attaches the extension and checks the response', async () => {
  const h = await popup({ running: false });
  h.doc.getElementById('enable-page').click(); await settle(); await settle();
  const injection = h.calls.find(call => call.files);
  assert.equal(injection.target.tabId, 42);
  assert.deepEqual(Array.from(injection.files), ['src/matcher.js', 'src/answers.js', 'src/content.js']);
  assert.equal(h.stored.settings.enabled, true);
  assert.match(h.doc.getElementById('page-status').textContent, /Active/); h.dom.window.close();
});
test('restricted pages show a useful error instead of silently failing', async () => {
  const h = await popup({ running: false, injectFails: true });
  h.doc.getElementById('enable-page').click(); await settle();
  assert.match(h.doc.getElementById('page-status').textContent, /browser.*page|refresh/i);
  assert.equal(h.doc.getElementById('enable-page').disabled, false); h.dom.window.close();
});
