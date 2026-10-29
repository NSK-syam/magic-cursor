const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { JSDOM } = require('jsdom');
const matcher = require('../src/matcher.js');
const profile = { firstName: 'Alex', lastName: 'Morgan', email: 'alex@example.com', linkedin: 'https://linkedin.com/in/alex', website: 'https://alex.example', github: 'https://github.com/alex', city: 'Austin' };
function field(markup) { return new JSDOM(markup).window.document.querySelector('input,textarea'); }

test('matches accessible labels, names, placeholders and autocomplete', () => {
  const cases = [
    ['<label>LinkedIn URL<input type="url" autocomplete="url"></label>', 'linkedin'],
    ['<input name="first_name">', 'firstName'],
    ['<input id="lastName">', 'lastName'],
    ['<input placeholder="E-mail address">', 'email'],
    ['<span id="label">GitHub profile</span><input aria-labelledby="label">', 'github'],
    ['<input autocomplete="section-application given-name">', 'firstName'],
    ['<input aria-label="City">', 'city'],
    ['<input aria-label="Full name">', 'fullName']
  ];
  for (const [markup, key] of cases) assert.equal(matcher.match(field(markup), profile)?.key, key, markup);
  assert.equal(matcher.match(field('<input aria-label="Full name">'), profile).value, 'Alex Morgan');
});
test('rejects sensitive, disabled, unsupported, ambiguous and unknown fields', () => {
  for (const markup of [
    '<input type="password" name="email">', '<input type="hidden" name="email">',
    '<input type="file" name="linkedin">', '<input name="email" disabled>',
    '<input name="email" readonly>', '<fieldset disabled><input name="email"></fieldset>',
    '<div aria-hidden="true"><input name="email"></div>',
    '<input aria-label="Email verification code">', '<input aria-label="LinkedIn or website">',
    '<input name="ssn" autocomplete="name">', '<input name="username" autocomplete="email">',
    '<input name="something">', '<input name="phone">'
  ]) assert.equal(matcher.match(field(markup), profile), null, markup);
});

async function harness({ mode = 'hover', aiProvider = 'claude', enabled = true, value = '', resume = '', answers = [], customFields = [], sendMessage, markup = '<label>LinkedIn URL<input name="linkedin" type="url"></label>' } = {}) {
  const dom = new JSDOM(markup, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://application.example' });
  const w = dom.window, input = w.document.querySelector('input, textarea');
  input.value = value;
  let tick, storageListener, runtimeListener, root, hoveringBubble = false;
  const attach = w.Element.prototype.attachShadow;
  w.Element.prototype.attachShadow = function (options) { root = attach.call(this, options); return root; };
  input.getBoundingClientRect = () => ({ left: 30, top: 30, right: 330, bottom: 70, width: 300, height: 40 });
  w.document.hasFocus = () => true;
  w.document.elementFromPoint = () => hoveringBubble ? w.document.querySelector('[data-magic-cursor]') : input;
  const saved = { profile, settings: { enabled, mode, aiProvider }, resume, answers, customFields };
  w.chrome = { storage: { local: { get: async () => saved }, onChanged: { addListener(fn) { storageListener = fn; } } } };
  const handleMessage = sendMessage || (async message => {
    if (message.type === 'remember-answer') {
      saved.answers.push({ question: message.question, questionKey: w.MagicAnswers.normalize(message.question), answer: message.answer, origin: 'https://application.example' });
      return { ok: true };
    }
    return { ok: false, error: 'Connect an API key first.' };
  });
  w.chrome.runtime = { id: 'magic-test', getManifest: () => ({ version: '0.4.0' }), onMessage: { addListener(fn) { runtimeListener = fn; } }, sendMessage: async message => message.type === 'profile-data' ? { ok: true, data: saved } : handleMessage(message) };
  w.setTimeout = fn => { tick = fn; return 1; };
  w.clearTimeout = () => { tick = null; };
  w.requestAnimationFrame = fn => { queueMicrotask(fn); return 1; };
  w.eval(readFileSync('src/matcher.js', 'utf8'));
  w.eval(readFileSync('src/answers.js', 'utf8'));
  w.eval(readFileSync('src/content.js', 'utf8'));
  await new Promise(resolve => setImmediate(resolve));
  return {
    w, input, saved,
    get root() { return root; },
    pageStatus() { let response; runtimeListener({ type: 'magic-status' }, { id: 'magic-test' }, value => { response = value; }); return response; },
    async move(x = 22, y = 50) { w.document.dispatchEvent(new w.MouseEvent('pointermove', { clientX: x, clientY: y })); await new Promise(resolve => setImmediate(resolve)); },
    async settingsChange() { runtimeListener({ type: 'magic-data-changed' }, { id: 'magic-test' }, () => {}); await new Promise(resolve => setImmediate(resolve)); },
    tick() { const fn = tick; tick = null; fn?.(); },
    get timerPending() { return Boolean(tick); },
    close() { dom.window.close(); }
  };
}
test('hovering near a field fills after delay, emits form events and supports undo', async () => {
  const h = await harness();
  let inputs = 0, changes = 0;
  h.input.addEventListener('input', () => inputs++); h.input.addEventListener('change', () => changes++);
  await h.move();
  assert.equal(h.input.value, ''); assert.equal(h.timerPending, true);
  h.tick();
  assert.equal(h.input.value, profile.linkedin); assert.equal(inputs, 1); assert.equal(changes, 1);
  h.root.querySelector('.row button').click();
  assert.equal(h.input.value, ''); assert.equal(inputs, 2); assert.equal(changes, 2);
  h.close();
});
test('a reworded location question fills from the saved profile without an AI request', async () => {
  let requests = 0;
  const h = await harness({ markup: '<label>Where are you currently located?<input name="city"></label>', sendMessage: async () => { requests++; } });
  h.saved.profile = { ...profile, city: 'Dallas', location: 'Dallas, TX' };
  await h.settingsChange(); await h.move();
  assert.equal(h.timerPending, true); h.tick();
  assert.equal(h.input.value, 'Dallas, TX'); assert.equal(requests, 0);
  h.root.querySelector('.row button').click(); assert.equal(h.input.value, ''); h.close();
});
test('moving away or pressing Escape cancels autofill', async () => {
  for (const cancel of ['move', 'escape']) {
    const h = await harness(); await h.move();
    if (cancel === 'move') await h.move(800, 400);
    else h.w.document.dispatchEvent(new h.w.KeyboardEvent('keydown', { key: 'Escape' }));
    h.tick(); assert.equal(h.input.value, ''); assert.equal(h.timerPending, false); h.close();
  }
});
test('existing text and text entered during the hover are never overwritten', async () => {
  const h = await harness({ value: 'https://existing.example' }); await h.move(); h.tick();
  assert.equal(h.input.value, 'https://existing.example'); h.close();
  const later = await harness(); await later.move(); later.input.value = 'my own value'; later.tick();
  assert.equal(later.input.value, 'my own value'); later.close();
});
test('click mode only fills on click and Undo preserves subsequent edits', async () => {
  const h = await harness({ mode: 'click' }); await h.move();
  assert.equal(h.timerPending, false); assert.equal(h.input.value, '');
  h.root.querySelector('.row button').click(); assert.equal(h.input.value, profile.linkedin);
  h.input.value = 'https://my-edit.example'; h.root.querySelector('.row button').click();
  assert.equal(h.input.value, 'https://my-edit.example'); h.close();
});
test('paused extension and live settings changes prevent filling', async () => {
  const paused = await harness({ enabled: false }); await paused.move(); paused.tick();
  assert.equal(paused.input.value, ''); paused.close();
  const h = await harness(); await h.move(); h.saved.settings.enabled = false; await h.settingsChange(); h.tick();
  assert.equal(h.input.value, ''); h.close();
});
test('hidden, removed and length-limited fields cannot receive autofill', async () => {
  for (const mutation of [input => { input.style.visibility = 'hidden'; }, input => input.remove(), input => { input.maxLength = 5; }]) {
    const h = await harness(); await h.move(); mutation(h.input); h.tick(); assert.equal(h.input.value, ''); h.close();
  }
});
test('keyboard shortcut offers an explicit fill action', async () => {
  const h = await harness(); h.input.focus();
  h.input.dispatchEvent(new h.w.KeyboardEvent('keydown', { code: 'KeyF', shiftKey: true, altKey: true, bubbles: true }));
  assert.equal(h.timerPending, false); h.root.querySelector('.row button').click();
  assert.equal(h.input.value, profile.linkedin); h.close();
});

const settle = () => new Promise(resolve => setImmediate(resolve));
const pythonMarkup = '<label>Describe your Python experience<textarea></textarea></label>';
test('hovering an unfamiliar unlabelled field automatically drafts once with Claude and requires approval', async () => {
  const question = 'At Lance, our mission is to automate hotel operations. We believe this starts with our own work. Describe a manual, broken, or low-value process from a previous role that you found frustrating. Then, briefly outline the system or tool you would build to eliminate it entirely.';
  let requests = 0, request, resolve;
  const h = await harness({ markup: `<div><p>${question}</p><textarea placeholder="Type here..."></textarea></div>`, resume: 'Built Python services.', sendMessage: message => { requests++; request = message; return new Promise(r => { resolve = r; }); } });
  await h.move(); assert.equal(requests, 0); assert.equal(h.timerPending, true);
  h.tick(); await settle();
  assert.equal(requests, 1); assert.equal(request.question, question); assert.equal(request.provider, 'claude');
  assert.equal(h.w.document.documentElement.hasAttribute('data-magic-cursor-drafting'), true);
  assert.notEqual(h.w.document.activeElement, h.root.querySelector('textarea'));
  await h.move(); assert.equal(requests, 1);
  resolve({ ok: true, draft: { answer: 'I built Python services.', evidence: ['Built Python services.'], missingFacts: [] } }); await settle();
  assert.equal(h.root.querySelector('textarea').value, 'I built Python services.'); assert.equal(h.input.value, '');
  h.w.document.dispatchEvent(new h.w.KeyboardEvent('keydown', { key: 'Escape' }));
  await h.move(800, 400); await h.move(); h.tick(); await settle();
  assert.equal(requests, 1); assert.equal(h.root.querySelector('textarea').value, 'I built Python services.');
  h.root.querySelector('.row button').click(); await settle(); assert.equal(h.input.value, 'I built Python services.'); h.close();
});
test('automatic drafting cancels on departure, typing, changed questions, and click mode', async () => {
  for (const change of ['leave', 'type', 'question', 'click']) {
    let requests = 0;
    const h = await harness({ mode: change === 'click' ? 'click' : 'hover', markup: pythonMarkup, sendMessage: async () => { requests++; } });
    await h.move();
    if (change === 'leave') await h.move(800, 400);
    if (change === 'type') h.input.value = 'My own answer';
    if (change === 'question') h.input.parentElement.firstChild.textContent = 'Different question';
    h.tick(); await settle(); assert.equal(requests, 0, change); h.close();
  }
});
test('nearby questions use profile facts, route narrative link requests to Claude, and protect sensitive fields', async () => {
  const location = await harness({ markup: '<div><p>Where are you currently located?</p><div><input placeholder="Type here..."></div></div>' });
  location.saved.profile = { ...profile, location: 'Dallas, TX' }; await location.settingsChange();
  await location.move(); location.tick(); assert.equal(location.input.value, 'Dallas, TX'); location.close();
  let requests = 0;
  const project = await harness({ markup: '<div><p>Share a link to something you built (GitHub) and a sentence on your role in it.</p><textarea placeholder="Type here..."></textarea></div>', sendMessage: async () => { requests++; return { ok: false, error: 'Test only' }; } });
  await project.move(); project.tick(); await settle(); assert.equal(requests, 1); assert.equal(project.input.value, ''); project.close();
  const protectedField = await harness({ markup: '<div><p>Social security number</p><input placeholder="Type here..."></div>', sendMessage: async () => { requests++; } });
  await protectedField.move(); protectedField.tick(); await settle(); assert.equal(requests, 1); assert.equal(protectedField.root.host.style.display, 'none'); protectedField.close();
});
test('a deeply nested numbered University question fills a custom field or automatically asks Claude', async () => {
  const markup = '<div data-automation-id="questionItem"><div data-automation-id="questionTitle">3. University <span aria-hidden="true">*</span></div><div><div><div><div><input aria-label="Enter your answer" placeholder="Enter your answer"></div></div></div></div><p role="alert">This question is required.</p></div>';
  const saved = await harness({ markup, customFields: [{ id: 'school', name: 'University', value: 'University of North Texas' }] });
  await saved.move(); saved.tick(); assert.equal(saved.input.value, 'University of North Texas');
  assert.equal(saved.pageStatus().version, '0.4.0'); assert.equal(saved.pageStatus().fieldCount, 1); saved.close();
  let request;
  const unknown = await harness({ markup, sendMessage: async message => { request = message; return { ok: false, error: 'Connect Claude in the extension profile.' }; } });
  await unknown.move(); unknown.tick(); await settle();
  assert.equal(request.question, '3. University'); assert.equal(request.provider, 'claude');
  assert.match(unknown.root.querySelector('section [role=status]').textContent, /Connect Claude/);
  assert.equal(unknown.root.querySelector('section > button').hidden, false); unknown.close();
});
test('the actual Lance Ashby essay fields are recognized and automatically routed for drafting', async () => {
  // Public field markup captured from the reported Lance application on 2026-10-28.
  const fixtures = JSON.parse(readFileSync('tests/fixtures/ashby-lance.json', 'utf8'));
  for (const markup of fixtures) {
    let request;
    const h = await harness({ markup, resume: 'Built Python services.', sendMessage: async message => { request = message; return { ok: true, draft: { answer: 'I built Python services.', evidence: ['Built Python services.'], missingFacts: [] } }; } });
    await h.move(); h.tick(); await settle();
    assert.equal(request.question, h.input.labels[0].textContent); assert.equal(request.provider, 'claude');
    assert.equal(h.root.querySelector('textarea').value, 'I built Python services.'); assert.equal(h.input.value, ''); h.close();
  }
});
test('unfamiliar questions never auto-fill and ask the user for missing facts', async () => {
  const h = await harness({ markup: '<label>When are you available to start?<input></label>' });
  await h.move(); assert.equal(h.timerPending, true); h.tick(); assert.equal(h.input.value, '');
  assert.match(h.root.querySelector('section [role=status]').textContent, /own fact/);
  assert.equal(h.root.querySelector('.tools button').disabled, true);
  h.root.querySelector('textarea').value = 'Two weeks after accepting an offer';
  h.root.querySelector('.row button').click(); await settle();
  assert.equal(h.input.value, 'Two weeks after accepting an offer'); h.close();
});
test('resume excerpts require approval, expose evidence, remember only when requested, and support undo', async () => {
  const resume = 'Built Python services with FastAPI and Redis for production applications.\nTrained deep learning models using PyTorch.';
  const h = await harness({ markup: pythonMarkup, resume });
  await h.move(); h.root.querySelector('.row button').click();
  h.root.querySelector('.tools button').click();
  assert.match(h.root.querySelector('textarea').value, /Built Python/);
  assert.equal(h.root.querySelector('details').hidden, false);
  assert.equal(h.input.value, ''); assert.equal(h.saved.answers.length, 0);
  h.root.querySelector('input[type=checkbox]').checked = true;
  h.root.querySelector('.row button').click(); await settle();
  assert.match(h.input.value, /Built Python/); assert.equal(h.saved.answers.length, 1);
  h.root.querySelector('.row button').click(); assert.equal(h.input.value, ''); h.close();
});
test('remembered answers require review and are scoped to a website and exact question', async () => {
  const question = 'Describe your Python experience';
  const answers = [{ question, questionKey: 'describe your python experience', answer: 'My approved answer', origin: 'https://application.example' }];
  const h = await harness({ markup: pythonMarkup, answers });
  await h.move(); h.tick(); assert.equal(h.input.value, '');
  h.root.querySelector('.row button').click(); assert.equal(h.root.querySelector('textarea').value, 'My approved answer');
  h.close();
  const other = await harness({ markup: pythonMarkup, answers: [{ ...answers[0], origin: 'https://other.example' }] });
  await other.move(); other.root.querySelector('.row button').click(); assert.equal(other.root.querySelector('textarea').value, ''); other.close();
});
test('an editor stays open when pointer leaves; empty, oversized or stale approvals cannot fill', async () => {
  const h = await harness({ markup: pythonMarkup }); await h.move(); h.root.querySelector('.row button').click();
  await h.move(800, 400); assert.equal(h.root.querySelector('section').hidden, false);
  h.root.querySelector('.row button').click(); assert.equal(h.input.value, '');
  h.input.maxLength = 5; h.root.querySelector('textarea').value = 'A longer answer';
  h.root.querySelector('.row button').click(); assert.equal(h.input.value, '');
  h.input.maxLength = 100; h.input.value = 'A manual edit';
  h.root.querySelector('.row button').click(); assert.equal(h.input.value, 'A manual edit'); h.close();
});
test('failed memory writes keep the answer editable without filling', async () => {
  const h = await harness({ markup: pythonMarkup, sendMessage: async () => ({ ok: false, error: 'Storage full' }) });
  await h.move(); h.root.querySelector('.row button').click(); h.root.querySelector('textarea').value = 'An answer';
  h.root.querySelector('input[type=checkbox]').checked = true;
  h.root.querySelector('.row button').click(); await settle();
  assert.equal(h.input.value, ''); assert.match(h.root.querySelector('section [role=status]').textContent, /Storage full/); h.close();
});
test('late AI results are discarded after Escape and cannot fill another field', async () => {
  let resolve;
  const h = await harness({ markup: pythonMarkup, sendMessage: () => new Promise(r => { resolve = r; }) });
  await h.move(); h.root.querySelector('.row button').click(); h.root.querySelectorAll('.tools button')[1].click();
  h.w.document.dispatchEvent(new h.w.KeyboardEvent('keydown', { key: 'Escape' }));
  resolve({ ok: true, draft: { answer: 'Stale AI answer', evidence: [], missingFacts: [] } }); await settle();
  assert.equal(h.root.querySelector('section').hidden, true); assert.equal(h.input.value, ''); h.close();
});
test('a draft is sent only to the provider disclosed when the editor was opened', async () => {
  let request;
  const h = await harness({ markup: pythonMarkup, sendMessage: async message => { request = message; return { ok: false, error: 'Test only' }; } });
  await h.move(); h.root.querySelector('.row button').click();
  assert.equal(h.root.querySelectorAll('.tools button')[1].textContent, 'Draft with Claude');
  h.saved.settings.aiProvider = 'openai'; await h.settingsChange();
  h.root.querySelectorAll('.tools button')[1].click(); await settle();
  assert.equal(request.provider, 'claude');
  h.close();
});
test('drafting shows a waiting cursor and spinner, prevents duplicates, then restores the editor', async () => {
  let resolve, requests = 0;
  const h = await harness({ markup: pythonMarkup, sendMessage: () => { requests++; return new Promise(r => { resolve = r; }); } });
  await h.move(); h.root.querySelector('.row button').click();
  const button = h.root.querySelectorAll('.tools button')[1]; button.click(); button.click();
  assert.equal(requests, 1); assert.equal(button.textContent, 'Drafting…'); assert.equal(button.getAttribute('data-loading'), 'true');
  assert.equal(h.root.querySelector('.bubble').getAttribute('aria-busy'), 'true');
  assert.equal(h.w.document.documentElement.hasAttribute('data-magic-cursor-drafting'), true);
  assert.equal(h.root.querySelector('textarea').readOnly, true);
  resolve({ ok: true, draft: { answer: 'An answer for review', evidence: ['A resume quote'], missingFacts: [] } }); await settle();
  assert.equal(button.textContent, 'Draft with Claude'); assert.equal(button.disabled, false);
  assert.equal(h.w.document.documentElement.hasAttribute('data-magic-cursor-drafting'), false);
  assert.equal(h.root.querySelector('textarea').value, 'An answer for review'); assert.equal(h.input.value, ''); h.close();
});
test('draft failure or dismissal restores the cursor and leaves existing answer text intact', async () => {
  const h = await harness({ markup: pythonMarkup, sendMessage: async () => ({ ok: false, error: 'Connect Claude first.' }) });
  await h.move(); h.root.querySelector('.row button').click(); h.root.querySelector('textarea').value = 'My existing draft';
  h.root.querySelectorAll('.tools button')[1].click(); await settle();
  assert.equal(h.w.document.documentElement.hasAttribute('data-magic-cursor-drafting'), false);
  assert.equal(h.root.querySelector('textarea').value, 'My existing draft'); assert.match(h.root.querySelector('section [role=status]').textContent, /Connect Claude/); h.close();
  let resolve;
  const pending = await harness({ markup: pythonMarkup, sendMessage: () => new Promise(r => { resolve = r; }) });
  await pending.move(); pending.root.querySelector('.row button').click(); pending.root.querySelectorAll('.tools button')[1].click();
  pending.w.document.dispatchEvent(new pending.w.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(pending.w.document.documentElement.hasAttribute('data-magic-cursor-drafting'), false);
  resolve({ ok: false, error: 'Late result' }); await settle(); pending.close();
});
test('Claude drafts stay visible with unanswered details; missing-fact responses clearly explain the empty result', async () => {
  const h = await harness({ markup: pythonMarkup, sendMessage: async () => ({ ok: true, draft: { answer: 'I built Python services.', evidence: ['Built Python services.'], missingFacts: ['Exact years of Python experience'] } }) });
  await h.move(); h.root.querySelector('.row button').click(); h.root.querySelectorAll('.tools button')[1].click(); await settle();
  assert.equal(h.root.querySelector('textarea').value, 'I built Python services.');
  assert.match(h.root.querySelector('.heading').textContent, /Claude draft ready/);
  assert.match(h.root.querySelector('section [role=status]').textContent, /Still unanswered: Exact years/);
  assert.equal(h.input.value, ''); h.close();
  const missing = await harness({ markup: pythonMarkup, sendMessage: async () => ({ ok: true, draft: { answer: '', evidence: [], missingFacts: ['No relevant Python work in the resume'] } }) });
  await missing.move(); missing.root.querySelector('.row button').click(); missing.root.querySelector('textarea').value = 'An existing draft';
  missing.root.querySelectorAll('.tools button')[1].click(); await settle();
  assert.equal(missing.root.querySelector('textarea').value, 'An existing draft');
  assert.match(missing.root.querySelector('.heading').textContent, /Claude needs your input/);
  assert.match(missing.root.querySelector('section [role=status]').textContent, /did not produce a draft/); missing.close();
});
test('the practice form routes AI requests to its local backend instead of extension messaging', async () => {
  let requests = 0;
  // A fresh demo context is needed because demo scope is chosen when content.js loads.
  const dom = new JSDOM('<div id="demo-fields"></div><section id="practice-panel"><label>Describe Python<textarea></textarea></label><div id="demo-result"></div></section>', { url: 'http://127.0.0.1:4321', runScripts: 'outside-only' });
  const w = dom.window, field = w.document.querySelector('textarea'); let shadow;
  const attach = w.Element.prototype.attachShadow;
  w.Element.prototype.attachShadow = function (options) { shadow = attach.call(this, options); return shadow; };
  field.getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 40, width: 100, height: 40 });
  w.MagicStorage = { async get() { return { profile: {}, settings: {}, resume: 'Built Python services.', answers: [] }; } };
  w.MagicLocalAI = { available: true, async draft(question, provider, resume) { requests++; assert.equal(provider, 'claude'); assert.equal(resume, 'Built Python services.'); return { answer: 'I built Python services.', evidence: [resume], missingFacts: [] }; } };
  for (const file of ['matcher.js', 'answers.js', 'content.js']) w.eval(readFileSync('src/' + file, 'utf8'));
  await settle(); field.focus(); field.dispatchEvent(new w.KeyboardEvent('keydown', { code: 'KeyF', shiftKey: true, altKey: true, bubbles: true }));
  shadow.querySelectorAll('.tools button')[1].click(); await settle();
  assert.equal(requests, 1); assert.equal(shadow.querySelector('textarea').value, 'I built Python services.'); dom.window.close();
});
test('saved custom fields fill a matching external form and support Undo', async () => {
  const customFields = [{ id: 'school', name: 'University', value: 'University of North Texas', aliases: ['College'] }];
  const h = await harness({ markup: '<label>College (required)<input name="education_org"></label>', customFields });
  await h.move(); h.tick(); assert.equal(h.input.value, 'University of North Texas');
  h.root.querySelector('.row button').click(); assert.equal(h.input.value, ''); h.close();
});
test('custom field edits and removals are reflected live before filling', async () => {
  const customFields = [{ id: 'school', name: 'University', value: 'Old value' }];
  const h = await harness({ markup: '<label>University<input></label>', customFields });
  await h.move(); h.saved.customFields = [{ ...customFields[0], value: 'Updated value' }]; await h.settingsChange(); h.tick();
  assert.equal(h.input.value, ''); await h.move(); h.tick(); assert.equal(h.input.value, 'Updated value'); h.close();
  const removed = await harness({ markup: '<label>University<input></label>', customFields });
  await removed.move(); removed.saved.customFields = []; await removed.settingsChange(); await removed.move(); removed.tick();
  await settle(); assert.equal(removed.input.value, ''); removed.close();
});

test('draft controls do not escape to page navigation handlers or erase other application fields', async () => {
  const h = await harness({ markup: '<form><label>Describe Python<textarea></textarea></label><input id="other" value="Already completed"></form>', sendMessage: async () => ({ ok: true, draft: { answer: 'I built Python services.', evidence: ['Built Python services.'], missingFacts: [] } }) });
  let pageClicks = 0, pageKeys = 0, submissions = 0;
  h.w.document.addEventListener('click', () => { pageClicks++; h.w.document.getElementById('other').value = ''; });
  h.w.document.addEventListener('keydown', () => pageKeys++);
  h.w.document.querySelector('form').addEventListener('submit', event => { event.preventDefault(); submissions++; });
  await h.move(); h.root.querySelector('.row button').click();
  h.root.querySelectorAll('.tools button')[1].click(); await settle();
  h.root.querySelector('textarea').dispatchEvent(new h.w.KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, composed: true }));
  assert.equal(pageClicks, 0); assert.equal(pageKeys, 0); assert.equal(submissions, 0);
  assert.equal(h.w.document.getElementById('other').value, 'Already completed');
  assert.equal(h.input.value, ''); assert.equal(h.root.querySelector('textarea').value, 'I built Python services.');
  for (const button of h.root.querySelectorAll('button')) assert.equal(button.type, 'button');
  h.root.querySelector('textarea').dispatchEvent(new h.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
  assert.equal(h.root.host.style.display, 'none'); h.close();
});
