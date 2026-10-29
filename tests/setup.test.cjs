const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { JSDOM } = require('jsdom');
const settle = () => new Promise(resolve => setImmediate(resolve));

async function setup(initial, chrome, options = {}) {
  const dom = new JSDOM(readFileSync('index.html', 'utf8'), { url: options.url || 'https://demo.example', runScripts: 'outside-only' });
  dom.window.localStorage.setItem('magic-cursor', JSON.stringify(initial));
  if (chrome) {
    chrome.storage.local.setAccessLevel ||= async () => {};
    chrome.storage.local.remove ||= async key => { delete (await chrome.storage.local.get())[key]; };
    dom.window.chrome = chrome;
  }
  if (options.fetch) dom.window.fetch = options.fetch;
  for (const file of ['matcher.js', 'answers.js', 'storage.js', 'credentials.js', 'local-ai.js', 'app.js']) dom.window.eval(readFileSync(`src/${file}`, 'utf8'));
  await settle();
  return dom;
}
test('old profiles survive adding resume text and saved answers', async () => {
  const dom = await setup({ profile: { firstName: 'Alex', linkedin: 'https://linkedin.com/in/alex' }, settings: { enabled: true, mode: 'click' } });
  const doc = dom.window.document;
  assert.equal(doc.querySelector('[name=firstName]').value, 'Alex');
  doc.getElementById('resume-text').value = 'Built Python services using FastAPI.';
  doc.getElementById('resume-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await settle();
  const stored = JSON.parse(dom.window.localStorage.getItem('magic-cursor'));
  assert.equal(stored.profile.firstName, 'Alex'); assert.equal(stored.settings.mode, 'click');
  assert.equal(stored.resume, 'Built Python services using FastAPI.');
  assert.match(doc.getElementById('resume-status').textContent, /saved/);
  dom.window.close();
});
test('the local practice page can connect Claude instead of requiring extension APIs', async () => {
  const requests = [];
  const dom = await setup({ profile: {}, settings: {} }, undefined, { url: 'http://127.0.0.1:4321', fetch: async (url, options) => {
    requests.push({ url, options }); return { ok: true, async json() { return { ok: true, connected: false, csrfToken: 'test-csrf' }; } };
  } });
  const doc = dom.window.document;
  doc.getElementById('ai-key').value = 'test-only-credential';
  doc.getElementById('connect-ai').click(); await settle(); await settle();
  assert.equal(requests.some(item => item.url === '/api/connect'), true);
  assert.match(doc.getElementById('ai-status').textContent, /Claude connected/);
  dom.window.close();
});
test('provider switching preserves settings, stores session credentials separately, and disconnects only the selected provider', async () => {
  const local = { profile: {}, settings: { enabled: true, mode: 'hover', delay: 1100 }, resume: '', answers: [] };
  const session = { openaiKey: 'test-openai' }, permissions = [];
  const chrome = {
    storage: {
      local: { async get() { return local; }, async set(data) { Object.assign(local, data); } },
      session: { async get() { return session; }, async set(data) { Object.assign(session, data); }, async remove(key) { delete session[key]; } },
      onChanged: { addListener() {} }
    },
    permissions: { async request(request) { permissions.push(request); return true; }, async remove(request) { permissions.push(request); return true; } }
  };
  const dom = await setup(local, chrome), doc = dom.window.document;
  assert.equal(doc.getElementById('ai-provider').value, 'claude');
  doc.getElementById('ai-key').value = 'test-claude'; doc.getElementById('connect-ai').click(); await settle();
  assert.equal(session.claudeKey, 'test-claude'); assert.equal(session.openaiKey, 'test-openai');
  assert.equal(permissions[0].origins[0], 'https://api.anthropic.com/*');
  assert.equal(doc.getElementById('ai-key').value, '');
  assert.equal(local.claudeKey, 'test-claude');
  assert.equal(JSON.stringify(local.profile).includes('test-claude'), false);
  const provider = doc.getElementById('ai-provider'); provider.value = 'openai'; provider.dispatchEvent(new dom.window.Event('change')); await settle();
  assert.equal(local.settings.aiProvider, 'openai'); assert.match(doc.getElementById('ai-status').textContent, /OpenAI connected/);
  provider.value = 'claude'; provider.dispatchEvent(new dom.window.Event('change')); await settle();
  const mode = doc.getElementById('fill-mode'); mode.value = 'click'; mode.dispatchEvent(new dom.window.Event('change')); await settle();
  assert.equal(local.settings.aiProvider, 'claude'); assert.equal(local.settings.mode, 'click');
  doc.getElementById('disconnect-ai').click(); await settle();
  assert.equal(session.claudeKey, undefined); assert.equal(local.claudeKey, undefined); assert.equal(session.openaiKey, 'test-openai');
  assert.equal(permissions.at(-1).origins[0], 'https://api.anthropic.com/*');
  dom.window.close();
});
test('the remember checkbox saves a connected extension key without re-entry and survives reopening', async () => {
  const local = { profile: {}, settings: {}, resume: 'Built Python services.' }, session = { claudeKey: 'test-existing-key' };
  const chrome = { storage: {
    local: { async get() { return local; }, async set(values) { Object.assign(local, values); } },
    session: { async get() { return session; }, async set(values) { Object.assign(session, values); }, async remove(key) { delete session[key]; } }, onChanged: { addListener() {} }
  } };
  const first = await setup(local, chrome), checkbox = first.window.document.getElementById('remember-api-key');
  assert.equal(checkbox.checked, false); checkbox.checked = true; checkbox.dispatchEvent(new first.window.Event('change')); await settle();
  assert.equal(local.claudeKey, 'test-existing-key'); first.window.close(); delete session.claudeKey;
  const reopened = await setup(local, chrome);
  assert.equal(reopened.window.document.getElementById('ai-ready-status').textContent, 'Ready to draft');
  assert.equal(reopened.window.document.getElementById('remember-api-key').checked, true); reopened.window.close();
});
test('approved answer library supports editing, forgetting and safe text rendering', async () => {
  const dom = await setup({ profile: {}, answers: [{ question: '<img src=x onerror=alert(1)>', questionKey: 'example', origin: 'https://jobs.example', answer: 'Original' }] });
  const doc = dom.window.document;
  assert.equal(doc.querySelector('#answer-library img'), null);
  doc.querySelector('#answer-library textarea').value = 'Updated approved answer';
  doc.querySelector('#answer-library .secondary').click(); await settle(); await settle();
  assert.equal(JSON.parse(dom.window.localStorage.getItem('magic-cursor')).answers[0].answer, 'Updated approved answer');
  doc.querySelector('#answer-library .text-button').click(); await settle(); await settle();
  assert.equal(JSON.parse(dom.window.localStorage.getItem('magic-cursor')).answers.length, 0);
  assert.match(doc.getElementById('answer-library').textContent, /No remembered answers/);
  dom.window.close();
});
test('quick setup reveals the key field and turns on drafting while saving the entered resume', async () => {
  const dom = await setup({ profile: {}, settings: { enabled: false }, resume: '' }, undefined, { url: 'http://127.0.0.1:4321', fetch: async () => ({ ok: true, async json() { return { ok: true, csrfToken: 'test-csrf', connected: {} }; } }) });
  const doc = dom.window.document;
  assert.equal(doc.getElementById('ai-setup').open, false);
  assert.equal(doc.getElementById('ai-ready-status').textContent, 'Paused');
  doc.getElementById('setup-ai').click();
  assert.equal(doc.getElementById('ai-setup').open, true);
  assert.equal(doc.activeElement.id, 'ai-key');
  doc.getElementById('resume-text').value = 'Built Python services with FastAPI.';
  doc.getElementById('ai-key').value = 'test-only-credential';
  doc.getElementById('connect-ai').click(); await settle(); await settle();
  const stored = JSON.parse(dom.window.localStorage.getItem('magic-cursor'));
  assert.equal(stored.settings.enabled, true); assert.equal(stored.resume, 'Built Python services with FastAPI.');
  assert.equal(doc.getElementById('ai-ready-status').textContent, 'Ready to draft');
  assert.equal(doc.getElementById('setup-ai').textContent, 'Try it');
  assert.equal(doc.getElementById('ai-setup').open, false);
  assert.equal(doc.getElementById('ai-key').value, '');
  assert.equal(JSON.stringify(stored).includes('test-only-credential'), false); dom.window.close();
});
test('quick setup reports missing resume and preserves errors when connection fails', async () => {
  const dom = await setup({ profile: {}, settings: {}, resume: '' }, undefined, { url: 'http://127.0.0.1:4321', fetch: async () => ({ ok: true, async json() { return { ok: true, csrfToken: 'test-csrf', connected: {} }; } }) });
  const doc = dom.window.document;
  doc.getElementById('ai-key').value = 'test-only'; doc.getElementById('connect-ai').click(); await settle(); await settle();
  assert.equal(doc.getElementById('ai-ready-status').textContent, 'Add resume');
  doc.getElementById('resume-text').value = 'Built Python services.';
  doc.getElementById('resume-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); await settle();
  assert.equal(doc.getElementById('ai-ready-status').textContent, 'Ready to draft'); dom.window.close();
  const failing = await setup({ profile: {}, settings: { enabled: false } }, undefined, { url: 'http://127.0.0.1:4321', fetch: async url => ({ ok: url !== '/api/connect', async json() { return url === '/api/connect' ? { ok: false, error: 'Connection failed' } : { ok: true, csrfToken: 'test-csrf', connected: {} }; } }) });
  const d = failing.window.document; d.getElementById('ai-key').value = 'test-only'; d.getElementById('connect-ai').click(); await settle(); await settle();
  assert.equal(d.getElementById('enabled').checked, false); assert.equal(d.getElementById('ai-setup').open, true);
  assert.match(d.getElementById('ai-status').textContent, /Connection failed/); assert.equal(d.getElementById('connect-ai').disabled, false); failing.window.close();
});
test('custom fields can be added, saved, reloaded, edited and removed with their practice boxes', async () => {
  const dom = await setup({ profile: { firstName: 'Alex' }, settings: {}, resume: 'Saved resume' });
  const doc = dom.window.document;
  doc.getElementById('add-custom-field').click();
  const row = doc.querySelector('.custom-field-row');
  row.querySelector('[data-custom=name]').value = 'University'; row.querySelector('[data-custom=value]').value = 'University of North Texas'; row.querySelector('[data-custom=aliases]').value = 'College, School name';
  doc.getElementById('profile-form').dispatchEvent(new dom.window.Event('submit', { cancelable: true })); await settle();
  let stored = JSON.parse(dom.window.localStorage.getItem('magic-cursor'));
  assert.equal(stored.customFields.length, 1); assert.equal(stored.profile.firstName, 'Alex'); assert.equal(stored.resume, 'Saved resume');
  assert.deepEqual(stored.customFields[0].aliases, ['College', 'School name']);
  assert.equal(doc.querySelector('#custom-demo-fields label').textContent, 'University');
  assert.equal(doc.querySelector('#custom-demo-fields input').value, '');
  const reloaded = await setup(stored), d = reloaded.window.document;
  assert.equal(d.querySelector('[data-custom=value]').value, 'University of North Texas');
  d.querySelector('[data-custom=value]').value = 'New school';
  d.getElementById('profile-form').dispatchEvent(new reloaded.window.Event('submit', { cancelable: true })); await settle();
  assert.equal(JSON.parse(reloaded.window.localStorage.getItem('magic-cursor')).customFields[0].value, 'New school');
  d.querySelector('.custom-field-row button').click(); d.getElementById('profile-form').dispatchEvent(new reloaded.window.Event('submit', { cancelable: true })); await settle();
  assert.equal(JSON.parse(reloaded.window.localStorage.getItem('magic-cursor')).customFields.length, 0); assert.equal(d.getElementById('custom-demo').hidden, true);
  reloaded.window.close(); dom.window.close();
});
test('duplicate custom names and aliases cannot overwrite previously saved values', async () => {
  const initial = { id: 'existing', name: 'University', value: 'Saved school', aliases: [] };
  const dom = await setup({ profile: {}, settings: {}, customFields: [initial] }), doc = dom.window.document;
  doc.getElementById('add-custom-field').click(); const rows = doc.querySelectorAll('.custom-field-row');
  rows[1].querySelector('[data-custom=name]').value = 'School'; rows[1].querySelector('[data-custom=value]').value = 'Other school'; rows[1].querySelector('[data-custom=aliases]').value = 'University';
  doc.getElementById('profile-form').dispatchEvent(new dom.window.Event('submit', { cancelable: true })); await settle();
  assert.match(doc.getElementById('save-status').textContent, /Two custom fields/);
  assert.equal(JSON.parse(dom.window.localStorage.getItem('magic-cursor')).customFields.length, 1); dom.window.close();
});
test('profile export and import transfer custom fields without resume text or API credentials', async () => {
  const custom = { id: 'school', name: 'University', value: 'University of North Texas', aliases: ['College'] };
  const source = await setup({ profile: { firstName: 'Alex' }, settings: {}, customFields: [custom], resume: 'Private resume text', answers: [{ answer: 'Private answer' }], claudeKey: 'test-private-claude-key' });
  let exported, filename;
  source.window.URL.createObjectURL = blob => { exported = blob; return 'blob:test'; };
  source.window.URL.revokeObjectURL = () => {};
  source.window.HTMLAnchorElement.prototype.click = function () { filename = this.download; };
  source.window.document.getElementById('export-profile').click(); await settle();
  assert.equal(filename, 'magic-cursor-profile.json');
  const raw = await new Promise((resolve, reject) => { const reader = new source.window.FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsText(exported); });
  const payload = JSON.parse(raw);
  assert.equal(raw.includes('test-private-claude-key'), false);
  assert.equal(payload.customFields[0].value, custom.value); assert.equal(payload.resume, undefined); assert.equal(payload.answers, undefined); assert.equal(payload.settings, undefined);
  const destination = await setup({ profile: { firstName: 'Before import' }, settings: { enabled: false }, resume: 'Keep this resume' });
  const file = destination.window.document.getElementById('profile-import-file');
  Object.defineProperty(file, 'files', { value: [{ size: raw.length, async text() { return raw; } }] });
  file.dispatchEvent(new destination.window.Event('change')); await settle(); await settle();
  const stored = JSON.parse(destination.window.localStorage.getItem('magic-cursor'));
  assert.equal(stored.profile.firstName, 'Alex'); assert.equal(stored.customFields[0].value, custom.value);
  assert.equal(stored.resume, 'Keep this resume'); assert.equal(stored.settings.enabled, false);
  assert.equal(destination.window.document.querySelector('[data-custom=name]').value, 'University');
  source.window.close(); destination.window.close();
});
test('invalid profile imports do not erase existing profile values', async () => {
  const dom = await setup({ profile: { firstName: 'Keep me' }, settings: {}, customFields: [] });
  const payload = { format: 'magic-cursor-profile', version: 1, profile: { firstName: 'Replace me' }, customFields: [{ name: 'College', value: 'One' }, { name: 'University', aliases: ['College'], value: 'Two' }] };
  const file = dom.window.document.getElementById('profile-import-file');
  Object.defineProperty(file, 'files', { value: [{ size: 100, async text() { return JSON.stringify(payload); } }] });
  file.dispatchEvent(new dom.window.Event('change')); await settle();
  assert.equal(JSON.parse(dom.window.localStorage.getItem('magic-cursor')).profile.firstName, 'Keep me');
  assert.match(dom.window.document.getElementById('transfer-status').textContent, /Two custom fields/); dom.window.close();
});
