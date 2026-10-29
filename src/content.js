(function () {
  'use strict';
  if (window.__magicCursorLoaded) return;
  window.__magicCursorLoaded = true;
  const demo = Boolean(document.getElementById('demo-fields') && window.MagicStorage);
  let data = { profile: {}, customFields: [], resume: '', answers: [], settings: { enabled: true, mode: 'hover', delay: 1100 } };
  let current = null, match = null, timer = null, undo = null, pointer = null, frame = null;
  let pinned = false, activeQuestion = '', generation = 0;
  let draftProvider = 'claude';
  let draftController = null;
  let dismissed = new WeakSet();
  const draftCache = new WeakMap();
  const host = document.createElement('div');
  host.setAttribute('data-magic-cursor', '');
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = ':host{all:initial;position:fixed!important;z-index:2147483647!important;display:none;font-family:system-ui,sans-serif!important;color-scheme:light!important}.bubble{box-sizing:border-box;width:260px;padding:12px;background:#fff;color:#25272e;border:1px solid #ded6ef;border-radius:10px;box-shadow:0 6px 24px #26202e26;font:12px/1.5 system-ui,sans-serif}.heading{display:flex;align-items:center;justify-content:space-between;color:#7054c2;font-weight:650}.value{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:7px 0;color:#53505c}.hint{font-size:10px;color:#837b90}button{font:inherit;cursor:pointer;border:0;border-radius:5px;padding:5px 9px;background:#f0ebfa;color:#6547b4}button:focus-visible{outline:2px solid #7054c2;outline-offset:2px}.close{padding:0 5px;background:none;font-size:17px}.row{display:flex;justify-content:space-between;align-items:center;gap:8px}';
  const bubble = document.createElement('div'); bubble.className = 'bubble';
  bubble.setAttribute('role', 'region'); bubble.setAttribute('aria-label', 'Magic Cursor suggestions');
  const heading = document.createElement('div'); heading.className = 'heading';
  const title = document.createElement('span'); title.setAttribute('aria-live', 'polite');
  const close = document.createElement('button'); close.className = 'close'; close.textContent = '×'; close.setAttribute('aria-label', 'Dismiss autofill');
  const value = document.createElement('div'); value.className = 'value';
  const row = document.createElement('div'); row.className = 'row';
  const hint = document.createElement('span'); hint.className = 'hint';
  const action = document.createElement('button'); action.type = 'button';
  const editor = document.createElement('section'); editor.hidden = true;
  const questionText = document.createElement('p'); questionText.className = 'question';
  const message = document.createElement('p'); message.className = 'hint'; message.setAttribute('role', 'status');
  const answerLabel = document.createElement('label'); answerLabel.textContent = 'Your answer';
  const answer = document.createElement('textarea'); answer.rows = 5; answer.maxLength = 6000; answer.setAttribute('aria-label', 'Review or write your answer');
  const rememberLabel = document.createElement('label'); rememberLabel.className = 'remember';
  const remember = document.createElement('input'); remember.type = 'checkbox';
  rememberLabel.append(remember, document.createTextNode('Remember for this exact question on this site'));
  const tools = document.createElement('div'); tools.className = 'tools';
  const excerptButton = document.createElement('button'); excerptButton.textContent = 'Use resume excerpt';
  const aiButton = document.createElement('button'); aiButton.textContent = 'Draft with Claude';
  const disclosure = document.createElement('p'); disclosure.className = 'hint';
  const evidence = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = 'Resume evidence';
  const quotes = document.createElement('div'); evidence.append(summary, quotes); evidence.hidden = true;
  tools.append(excerptButton, aiButton); answerLabel.append(answer); editor.append(questionText, message, answerLabel, tools, disclosure, evidence, rememberLabel);
  const extraStyle = document.createElement('style'); extraStyle.textContent = '.bubble:has(section:not([hidden])){width:min(360px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto}.question{font-weight:600;overflow-wrap:anywhere}.hint{white-space:normal}textarea{box-sizing:border-box;display:block;width:100%;resize:vertical;min-height:90px;max-height:200px;margin:6px 0 10px;padding:9px;border:1px solid #cfc4e8;border-radius:5px;font:12px/1.5 system-ui;color:#25272e;background:white}.remember{display:flex;gap:7px;align-items:start;margin:12px 0;font-size:10px}.remember input{accent-color:#6a52cc}.tools{display:flex;gap:8px;flex-wrap:wrap}section label{font-size:11px}details{font-size:10px;margin:10px 0}blockquote{margin:8px 0;padding:6px 10px;border-left:2px solid #cfc4e8;white-space:pre-wrap}button:disabled{opacity:.5;cursor:wait}[hidden]{display:none!important}.row{margin-top:8px}';
  heading.append(title, close); row.append(hint, action); bubble.append(heading, value, editor, row); shadow.append(style, extraStyle, bubble);
  document.documentElement.append(host);
  const cursorStyle = document.createElement('style');
  cursorStyle.textContent = 'html[data-magic-cursor-drafting],html[data-magic-cursor-drafting] *{cursor:progress!important}';
  document.documentElement.append(cursorStyle);
  const loadingStyle = document.createElement('style');
  loadingStyle.textContent = '.bubble[aria-busy="true"],.bubble[aria-busy="true"] *{cursor:progress!important}button[data-loading="true"]::before{content:"";display:inline-block;width:11px;height:11px;margin-right:7px;vertical-align:-2px;border:2px solid #cfc4e8;border-top-color:#6547b4;border-radius:50%;animation:magic-spin .8s linear infinite}@keyframes magic-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){button[data-loading="true"]::before{animation:none}}';
  shadow.append(loadingStyle);
  const settingsButton = document.createElement('button'); settingsButton.textContent = 'Open AI settings'; settingsButton.hidden = true;
  editor.append(settingsButton);
  // Keep helper interactions inside its shadow tree. Composed events otherwise
  // reach document-level application shortcuts and delegated navigation handlers.
  for (const button of shadow.querySelectorAll('button')) button.type = 'button';
  for (const name of ['click', 'dblclick', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'keydown', 'keyup', 'keypress', 'input', 'change']) {
    shadow.addEventListener(name, event => {
      if (name === 'keydown' && event.key === 'Escape') { event.preventDefault(); dismiss(); }
      event.stopPropagation();
    });
  }
  function setDrafting(busy) {
    bubble.setAttribute('aria-busy', String(busy));
    document.documentElement.toggleAttribute('data-magic-cursor-drafting', busy);
    aiButton.toggleAttribute('data-loading', busy);
    // Match the value used by the loading CSS selector.
    if (busy) aiButton.setAttribute('data-loading', 'true');
    aiButton.textContent = busy ? 'Drafting…' : `Draft with ${draftProvider === 'claude' ? 'Claude' : 'OpenAI'}`;
    aiButton.disabled = busy; excerptButton.disabled = busy; action.disabled = busy; answer.readOnly = busy;
  }
  async function refresh() {
    try {
      let stored;
      if (demo) stored = await MagicStorage.get();
      else {
        const result = await chrome.runtime.sendMessage({ type: 'profile-data' });
        if (!result?.ok) throw new Error('Could not load your profile.');
        stored = result.data;
      }
      data = { profile: stored.profile || {}, customFields: stored.customFields || [], resume: stored.resume || '', answers: stored.answers || [], settings: { enabled: true, mode: 'hover', delay: 1100, ...stored.settings } };
    } catch { data.settings.enabled = false; }
    if (!pinned || !data.settings.enabled) clear();
  }
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) chrome.storage.onChanged.addListener((_changes, area) => { if (area === 'local') refresh(); });
  window.addEventListener('magic-storage-change', refresh);
  refresh();
  if (typeof chrome !== 'undefined') chrome.runtime?.onMessage?.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id) return false;
    if (message?.type === 'magic-data-changed') { refresh(); return false; }
    if (message?.type !== 'magic-status') return false;
    respond({ ok: true, version: chrome.runtime.getManifest().version, enabled: data.settings.enabled, fieldCount: document.querySelectorAll('input:not([type="hidden"]),textarea').length });
    return false;
  });
  function clear() {
    draftController?.abort(); draftController = null; setDrafting(false); settingsButton.hidden = true;
    clearTimeout(timer); timer = null; current = null; match = null; undo = null;
    pinned = false; activeQuestion = ''; generation++; editor.hidden = true; value.hidden = false;
    aiButton.disabled = false; excerptButton.disabled = false; action.disabled = false;
    host.style.setProperty('display', 'none', 'important');
  }
  function show(element) {
    const rect = element.getBoundingClientRect();
    host.style.setProperty('display', 'block', 'important');
    const width = host.getBoundingClientRect().width || 260;
    host.style.setProperty('left', `${Math.max(8, Math.min(rect.left, innerWidth - width - 8))}px`, 'important');
    const height = host.getBoundingClientRect().height || 112;
    const top = rect.bottom + 8 + height < innerHeight ? rect.bottom + 8 : rect.top - height - 8;
    host.style.setProperty('top', `${Math.max(8, top)}px`, 'important');
  }
  function visible(element) {
    const rect = element.getBoundingClientRect();
    const css = getComputedStyle(element);
    return rect.width > 2 && rect.height > 2 && css.visibility !== 'hidden' && css.display !== 'none' && css.opacity !== '0';
  }
  function distance(element, point) {
    const r = element.getBoundingClientRect();
    return Math.hypot(Math.max(r.left - point.x, 0, point.x - r.right), Math.max(r.top - point.y, 0, point.y - r.bottom));
  }
  function writable(element) {
    return element?.isConnected && MagicMatcher.eligible(element) && visible(element);
  }
  function setValue(element, text) {
    const view = element.ownerDocument.defaultView;
    const prototype = element.tagName === 'TEXTAREA' ? view.HTMLTextAreaElement.prototype : view.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, text);
    element.dispatchEvent(new view.Event('input', { bubbles: true, composed: true }));
    element.dispatchEvent(new view.Event('change', { bubbles: true }));
  }
  function fill() {
    const element = current;
    if (!data.settings.enabled || !writable(element) || element.value !== '' || !match) { clear(); return; }
    const fresh = MagicMatcher.match(element, data.profile, data.customFields);
    if (!fresh || fresh.key !== match.key || fresh.value !== match.value || (element.maxLength >= 0 && fresh.value.length > element.maxLength)) { clear(); return; }
    clearTimeout(timer);
    setValue(element, fresh.value);
    undo = { element, value: fresh.value };
    title.textContent = '↖ Filled with Magic Cursor'; hint.textContent = 'You’re in control'; action.textContent = 'Undo';
    show(element);
    if (demo) document.getElementById('demo-result').textContent = `✓ ${fresh.label} filled from your profile`;
  }
  function offerQuestion(element, keyboard = false) {
    const text = MagicAnswers.question(element);
    if (!text || text.length < 3) return;
    clear(); current = element; activeQuestion = text;
    title.textContent = '↖ Answer needs your review'; value.textContent = text;
    const auto = !keyboard && data.settings.mode === 'hover';
    hint.textContent = auto ? 'Hold here for an AI draft · Esc to skip' : 'Review an answer before filling'; action.textContent = 'Help me answer';
    show(element);
    if (auto) timer = setTimeout(() => {
      timer = null;
      if (!data.settings.enabled || !pointer || distance(element, pointer) > 18 || !document.hasFocus()
        || !writable(element) || element.value || MagicAnswers.question(element) !== text) { clear(); return; }
      openEditor(true);
      if (!MagicAnswers.needsFact(text) && !MagicAnswers.find(data.answers, text, location.origin)) draftAnswer(true);
    }, Math.max(700, Number(data.settings.delay) || 1100));
  }
  function openEditor(automatic = false) {
    clearTimeout(timer); timer = null;
    pinned = true; editor.hidden = false; value.hidden = true;
    draftProvider = data.settings.aiProvider === 'openai' ? 'openai' : 'claude';
    const providerName = draftProvider === 'claude' ? 'Claude' : 'OpenAI';
    aiButton.textContent = `Draft with ${providerName}`;
    disclosure.textContent = `Holding the pointer over an unfamiliar field drafts with ${providerName} using this question and your saved resume. Requires a connected API key; API usage may cost money.`;
    questionText.textContent = activeQuestion; answer.value = ''; remember.checked = false;
    quotes.replaceChildren(); evidence.hidden = true;
    const saved = MagicAnswers.find(data.answers, activeQuestion, location.origin);
    if (saved) { answer.value = saved.answer; message.textContent = 'Your previously approved answer. Review it for this application.'; }
    else message.textContent = MagicAnswers.needsFact(activeQuestion) ? 'This needs your own fact or preference. Please enter it below.' : 'Write an answer, or start with evidence from your saved resume.';
    excerptButton.disabled = aiButton.disabled = MagicAnswers.needsFact(activeQuestion);
    hint.textContent = 'Review before filling'; action.textContent = 'Approve & fill';
    show(current); if (!automatic) answer.focus();
  }
  function displayDraft(draft, source = 'Resume') {
    const hasDraft = Boolean(draft.answer.trim());
    const hadAnswer = Boolean(answer.value.trim());
    if (hasDraft) answer.value = draft.answer;
    title.textContent = hasDraft ? `↖ ${source === 'Resume' ? 'Resume excerpt' : source + ' draft'} ready` : `↖ ${source === 'Resume' ? 'More information needed' : source + ' needs your input'}`;
    if (hasDraft) message.textContent = 'Review the draft below and its resume evidence before filling.' + (draft.missingFacts.length ? ` Still unanswered: ${draft.missingFacts.join('; ')}` : '');
    else message.textContent = `${source === 'Resume' ? 'No matching resume excerpt.' : source + ' did not produce a draft.'} ${hadAnswer ? 'Your existing answer is unchanged. ' : ''}Please add the requested information or write your answer. ${draft.missingFacts.join('; ')}`;
    if (draft.filteredInput) message.textContent += ' Instruction-like text in the form or resume was ignored.';
    quotes.replaceChildren();
    for (const quote of draft.evidence) { const node = document.createElement('blockquote'); node.textContent = quote; quotes.append(node); }
    evidence.hidden = !draft.evidence.length;
    show(current);
  }
  excerptButton.addEventListener('click', () => displayDraft(MagicAnswers.excerpt(activeQuestion, data.resume)));
  async function draftAnswer(automatic = false) {
    if (draftController) return;
    const element = current, question = activeQuestion, resume = data.resume, provider = draftProvider;
    const previous = draftCache.get(element);
    if (automatic && previous?.question === question && previous.resume === resume && previous.provider === provider) {
      if (previous.draft) displayDraft(previous.draft, provider === 'claude' ? 'Claude' : 'OpenAI');
      else { message.textContent = previous.error || 'A draft was already requested. Click Draft to try again.'; settingsButton.hidden = !previous.error; }
      return;
    }
    const cached = { question, resume, provider }; draftCache.set(element, cached);
    const token = generation;
    draftController = new AbortController();
    const controller = draftController;
    setDrafting(true); settingsButton.hidden = true;
    const providerName = draftProvider === 'claude' ? 'Claude' : 'OpenAI';
    message.textContent = `${providerName} is drafting from your resume…`;
    show(current);
    try {
      let draft;
      if (demo && window.MagicLocalAI?.available && !(typeof chrome !== 'undefined' && chrome.runtime?.id)) {
        draft = await MagicLocalAI.draft(activeQuestion, draftProvider, data.resume, controller.signal);
      } else {
        if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) throw new Error('Start the local app with npm start and connect your API key using Turn on AI answers at the top of your profile, or use the installed extension.');
        const result = await chrome.runtime.sendMessage({ type: 'draft-answer', question: activeQuestion, provider: draftProvider });
        if (!result?.ok) throw new Error(result?.error || 'Could not generate an answer.');
        draft = result.draft;
      }
      cached.draft = draft;
      if (generation === token && pinned) displayDraft(draft, providerName);
    } catch (error) {
      cached.error = error.message;
      if (generation === token && pinned) {
        message.textContent = /Extension context invalidated|Receiving end does not exist|message port closed/i.test(error.message) ? 'Magic Cursor was reloaded. Refresh this tab, reconnect your API key, and try again.' : error.message;
        settingsButton.hidden = false; show(current); bubble.scrollTop = 0;
        settingsButton.textContent = /resume/i.test(error.message) ? 'Upload resume' : 'Open AI settings';
      }
    } finally { if (generation === token) { draftController = null; setDrafting(false); } }
  }
  aiButton.addEventListener('click', () => draftAnswer());
  settingsButton.addEventListener('click', () => {
    const uploadResume = settingsButton.textContent === 'Upload resume';
    if (demo) {
      clear();
      if (uploadResume) { document.getElementById('resume-import')?.scrollIntoView({ block: 'center' }); document.getElementById('resume-import')?.click(); return; }
      const settings = document.getElementById('ai-provider')?.closest('details');
      if (settings) { settings.open = true; settings.scrollIntoView({ block: 'center', behavior: 'smooth' }); document.getElementById('ai-key')?.focus({ preventScroll: true }); }
    } else chrome.runtime.sendMessage({ type: 'open-settings', section: uploadResume ? 'resume' : 'ai' }).catch(() => { message.textContent = 'Open Magic Cursor from the extensions menu, then choose your profile.'; });
  });
  async function approveAnswer() {
    const element = current, question = activeQuestion, text = answer.value.trim(), token = generation;
    if (!text) { message.textContent = 'Write an answer before filling.'; return; }
    if (!data.settings.enabled || !writable(element) || element.value !== '' || MagicAnswers.question(element) !== question) { clear(); return; }
    if (element.maxLength >= 0 && text.length > element.maxLength) { message.textContent = `This field allows ${element.maxLength} characters. Shorten your answer (${text.length} characters).`; return; }
    action.disabled = true;
    try {
      if (remember.checked) {
        if (demo) {
          const stored = await MagicStorage.get();
          const questionKey = MagicAnswers.normalize(question);
          const answers = stored.answers.filter(item => item.origin !== location.origin || item.questionKey !== questionKey);
          answers.push({ question, questionKey, origin: location.origin, answer: text, updatedAt: Date.now() });
          await MagicStorage.set({ answers });
        } else {
          const result = await chrome.runtime.sendMessage({ type: 'remember-answer', question, answer: text });
          if (!result?.ok) throw new Error(result?.error || 'Could not remember this answer.');
        }
      }
      if (token !== generation || current !== element || !data.settings.enabled || !writable(element) || element.value !== '' || MagicAnswers.question(element) !== question) return;
      setValue(element, text); undo = { element, value: text }; pinned = false; editor.hidden = true; value.hidden = false;
      value.textContent = text; title.textContent = '↖ Approved answer filled'; hint.textContent = 'You’re in control'; action.textContent = 'Undo';
      show(element);
      if (demo) document.getElementById('demo-result').textContent = '✓ Your approved answer was filled';
    } catch (error) { if (token === generation) message.textContent = error.message; }
    finally { if (token === generation) action.disabled = false; }
  }
  function suggest(element, result, keyboard) {
    clear(); current = element; match = result;
    title.textContent = `↖ ${result.label}`; value.textContent = result.value;
    action.textContent = 'Fill';
    const auto = !keyboard && data.settings.mode === 'hover';
    hint.textContent = auto ? 'Hold here to fill · Esc to skip' : 'Click Fill to use this detail';
    show(element);
    if (auto) timer = setTimeout(() => {
      if (!pointer || distance(element, pointer) > 18 || !document.hasFocus()) { clear(); return; }
      fill();
    }, Math.max(700, Number(data.settings.delay) || 1100));
  }
  function processPointer() {
    frame = null;
    if (!pointer || !data.settings.enabled) { clear(); return; }
    if (pinned) return;
    const hit = document.elementFromPoint(pointer.x, pointer.y);
    if (hit === host || (current && distance(host, pointer) < 12)) { clearTimeout(timer); timer = null; if (!activeQuestion) hint.textContent = undo ? 'You’re in control' : 'Click Fill to use this detail'; return; }
    if (current && distance(current, pointer) <= 18 && writable(current) && (current.value === '' || undo)) return;
    clear();
    const scope = demo ? document.getElementById('practice-panel') : document;
    let nearest = null, minimum = 18;
    for (const element of scope.querySelectorAll('input, textarea')) {
      if (element.value || !writable(element)) continue;
      const d = distance(element, pointer);
      if (d < minimum) { nearest = element; minimum = d; }
    }
    if (!nearest) { dismissed = new WeakSet(); return; }
    if (dismissed.has(nearest)) return;
    const result = MagicMatcher.match(nearest, data.profile, data.customFields);
    if (result) suggest(nearest, result, false);
    else offerQuestion(nearest);
  }
  document.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch') return;
    pointer = { x: event.clientX, y: event.clientY };
    if (!frame) frame = requestAnimationFrame(processPointer);
  }, { passive: true });
  // Keyboard users can request a suggestion for the focused field.
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { if (current) dismissed.add(current); clear(); }
    else if (event.altKey && event.shiftKey && event.code === 'KeyF' && data.settings.enabled) {
      const element = document.activeElement;
      if (demo && !element?.closest('#practice-panel')) return;
      if (writable(element) && !element.value) {
        const result = MagicMatcher.match(element, data.profile, data.customFields);
        if (result) { event.preventDefault(); suggest(element, result, true); action.focus(); }
        else { event.preventDefault(); offerQuestion(element, true); if (current) openEditor(); }
      }
    } else if (event.target === current) { dismissed.add(current); clear(); }
  });
  document.addEventListener('input', event => { if (event.isTrusted && event.target === current) { dismissed.add(current); clear(); } }, true);
  function dismiss() { if (current) dismissed.add(current); clear(); }
  close.addEventListener('click', dismiss);
  action.addEventListener('click', () => {
    if (undo) {
      const previous = undo;
      if (writable(previous.element) && previous.element.value === previous.value) {
        setValue(previous.element, ''); dismissed.add(previous.element);
        if (demo) document.getElementById('demo-result').textContent = 'Undone. Your field is empty again.';
      }
      clear();
    } else if (pinned) approveAnswer();
    else if (activeQuestion) openEditor();
    else fill();
  });
  window.addEventListener('scroll', event => { if (!event.composedPath().includes(host) && !pinned) clear(); }, true);
  window.addEventListener('resize', () => { if (pinned && current) show(current); else clear(); });
  window.addEventListener('blur', () => { if (!pinned) clear(); });
  document.addEventListener('visibilitychange', () => { if (!pinned) clear(); });
  document.addEventListener('magic-reset', () => { dismissed = new WeakSet(); clear(); });
})();
