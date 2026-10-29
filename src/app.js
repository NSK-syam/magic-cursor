(async function () {
  const form = document.getElementById('profile-form');
  const status = document.getElementById('save-status');
  const enabled = document.getElementById('enabled');
  const mode = document.getElementById('fill-mode');
  const provider = document.getElementById('ai-provider');
  const setupButton = document.getElementById('setup-ai');
  const aiSetup = document.getElementById('ai-setup');
  let aiConnected = false, connecting = false;
  let saved;
  try { saved = await MagicStorage.get(); } catch { status.textContent = 'Could not load your profile. Reload to try again.'; return; }
  for (const [key, value] of Object.entries(saved.profile)) if (form.elements.namedItem(key)) form.elements.namedItem(key).value = value;
  const customContainer = document.getElementById('custom-fields');
  let customIndex = 0;
  function updateCustomEmpty() { document.getElementById('custom-empty').hidden = customContainer.children.length > 0; }
  function addCustomRow(field = {}, focus = false) {
    const row = document.createElement('div'); row.className = 'custom-field-row';
    row.dataset.id = field.id || `field-${Date.now().toString(36)}-${++customIndex}`;
    row.setAttribute('role', 'group'); row.setAttribute('aria-label', 'Custom field');
    function control(text, element, key) {
      const label = document.createElement('label'); label.textContent = text; element.dataset.custom = key; label.append(element); row.append(label); return element;
    }
    const name = control('Field name', document.createElement('input'), 'name');
    name.type = 'text'; name.value = field.name || ''; name.placeholder = 'e.g. University'; name.maxLength = 120; name.required = true;
    const value = control('Value to fill', document.createElement('textarea'), 'value');
    value.value = field.value || ''; value.placeholder = 'e.g. University of North Texas'; value.rows = 2; value.maxLength = 6000; value.required = true;
    const aliases = control('Other names for this field (optional)', document.createElement('input'), 'aliases');
    aliases.type = 'text'; aliases.value = Array.isArray(field.aliases) ? field.aliases.join(', ') : ''; aliases.placeholder = 'e.g. College, School name'; aliases.maxLength = 1000;
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'text-button'; remove.textContent = 'Remove field';
    remove.addEventListener('click', () => { row.remove(); updateCustomEmpty(); status.textContent = 'Unsaved changes. Save profile to remove this field.'; });
    row.append(remove); customContainer.append(row); updateCustomEmpty();
    if (focus) name.focus();
  }
  function readCustomFields() {
    return MagicMatcher.validateCustomFields(Array.from(customContainer.children, row => ({
      id: row.dataset.id,
      name: row.querySelector('[data-custom="name"]').value,
      value: row.querySelector('[data-custom="value"]').value,
      aliases: row.querySelector('[data-custom="aliases"]').value.split(',')
    })));
  }
  function renderCustomDemo(fields) {
    const demo = document.getElementById('custom-demo-fields'); demo.replaceChildren();
    document.getElementById('custom-demo').hidden = !fields.length;
    for (const field of fields) {
      const label = document.createElement('label'); label.append(document.createTextNode(field.name));
      const input = document.createElement(field.value.includes('\n') ? 'textarea' : 'input');
      input.name = `custom-demo-${field.id}`;
      if (input.tagName === 'TEXTAREA') input.rows = 3; else input.type = 'text';
      input.placeholder = 'Hover here to fill your saved value'; label.append(input); demo.append(label);
    }
  }
  for (const field of saved.customFields) addCustomRow(field);
  updateCustomEmpty(); renderCustomDemo(saved.customFields);
  document.getElementById('add-custom-field').addEventListener('click', () => {
    if (customContainer.children.length >= 50) { status.textContent = 'You can save up to 50 custom fields.'; return; }
    addCustomRow({}, true); status.textContent = 'New field added. Give it a name and value, then save your profile.';
  });
  function updateCount(profile) {
    document.getElementById('profile-count').textContent = `${Object.values(profile).filter(value => value.trim()).length + saved.customFields.length} details saved`;
  }
  updateCount(saved.profile);
  enabled.checked = saved.settings.enabled;
  mode.value = saved.settings.mode;
  provider.value = saved.settings.aiProvider === 'openai' ? 'openai' : 'claude';
  function renderActivation() {
    const hasResume = Boolean(saved.resume?.trim());
    const providerName = provider.value === 'openai' ? 'OpenAI' : 'Claude';
    const state = document.getElementById('ai-ready-status');
    state.dataset.ready = String(enabled.checked && aiConnected && hasResume);
    state.textContent = connecting ? 'Connecting…' : !enabled.checked ? 'Paused' : !aiConnected ? 'Needs setup' : !hasResume ? 'Add resume' : 'Ready to draft';
    setupButton.textContent = !aiConnected ? 'Turn on AI answers' : !enabled.checked ? 'Turn on' : !hasResume ? 'Add resume' : 'Try it';
    setupButton.disabled = connecting;
    document.getElementById('ai-quick-hint').textContent = !enabled.checked ? 'Turn Magic Cursor on to fill fields and draft answers.' : !aiConnected ? `Connect ${providerName} once to get resume-based drafts.` : !hasResume ? 'Your key is connected. Add your resume to start drafting.' : `Hold over an unfamiliar field for 1.1 seconds to draft with ${providerName}. Review before filling.`;
  }
  function updateDescription() {
    document.getElementById('enabled-description').textContent = enabled.checked ? 'On · Hover near a field to fill it' : 'Off · Paused on all websites';
    renderActivation();
  }
  updateDescription();
  form.addEventListener('input', () => { status.textContent = 'Unsaved changes'; });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    let customFields;
    try { customFields = readCustomFields(); } catch (error) { status.textContent = error.message; return; }
    const profile = Object.fromEntries(Array.from(new FormData(form), ([key, value]) => [key, value.trim()]));
    const buttons = document.querySelectorAll('button[type="submit"]');
    buttons.forEach(button => { button.disabled = true; });
    try { await MagicStorage.set({ profile, customFields }); saved.profile = profile; saved.customFields = customFields; renderCustomDemo(customFields); updateCount(profile); status.textContent = '✓ Profile saved. Try hovering over the practice form.'; }
    catch { status.textContent = 'Could not save your profile. Please try again.'; }
    finally { buttons.forEach(button => { button.disabled = false; }); }
  });
  const transferStatus = document.getElementById('transfer-status');
  document.getElementById('export-profile').addEventListener('click', async () => {
    try {
      const stored = await MagicStorage.get();
      const payload = { format: 'magic-cursor-profile', version: 1, profile: stored.profile, customFields: stored.customFields };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = 'magic-cursor-profile.json'; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      transferStatus.textContent = 'Saved profile exported. Import this file in the extension to use it on other sites.';
    } catch { transferStatus.textContent = 'Could not export your saved profile. Please try again.'; }
  });
  document.getElementById('import-profile').addEventListener('click', () => document.getElementById('profile-import-file').click());
  document.getElementById('profile-import-file').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 200000) throw new Error('Choose a profile JSON smaller than 200 KB.');
      const payload = JSON.parse(await file.text());
      if (payload.format !== 'magic-cursor-profile' || payload.version !== 1 || !payload.profile || typeof payload.profile !== 'object' || Array.isArray(payload.profile)) throw new Error('Choose a profile file exported by Magic Cursor.');
      const profile = {};
      for (const field of MagicMatcher.fields) {
        const control = form.elements.namedItem(field.key); if (!control) continue;
        const value = payload.profile[field.key] ?? '';
        if (typeof value !== 'string' || (control.maxLength >= 0 && value.length > control.maxLength)) throw new Error('Invalid profile field.');
        profile[field.key] = value.trim();
      }
      const customFields = MagicMatcher.validateCustomFields(payload.customFields || []);
      await MagicStorage.set({ profile, customFields });
      saved.profile = profile; saved.customFields = customFields;
      for (const [key, value] of Object.entries(profile)) form.elements.namedItem(key).value = value;
      customContainer.replaceChildren(); customFields.forEach(field => addCustomRow(field)); updateCustomEmpty(); renderCustomDemo(customFields); updateCount(profile);
      transferStatus.textContent = 'Profile imported. Your saved details are ready.';
    } catch (error) { transferStatus.textContent = error instanceof SyntaxError ? 'This is not a valid profile JSON file.' : error.message; }
    event.target.value = '';
  });
  async function saveSettings() {
    try {
      await MagicStorage.set({ settings: { ...saved.settings, enabled: enabled.checked, mode: mode.value, aiProvider: provider.value } });
      saved.settings = { ...saved.settings, enabled: enabled.checked, mode: mode.value, aiProvider: provider.value };
      updateDescription(); document.getElementById('settings-status').textContent = '';
    } catch { document.getElementById('settings-status').textContent = 'Could not save settings. Please try again.'; }
  }
  enabled.addEventListener('change', saveSettings);
  mode.addEventListener('change', saveSettings);
  document.getElementById('reset-demo').addEventListener('click', () => {
    document.querySelectorAll('#practice-panel input, #practice-panel textarea').forEach(input => { input.value = ''; });
    document.dispatchEvent(new Event('magic-reset'));
    document.getElementById('demo-result').textContent = '↖ Move your pointer close to a field';
  });
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    const practice = button.dataset.view === 'practice';
    document.querySelectorAll('[data-view]').forEach(item => item.classList.toggle('active', item === button));
    document.getElementById('breadcrumb').textContent = practice ? 'Practice playground' : 'Your profile';
    document.body.classList.toggle('practice-selected', practice);
    document.getElementById(practice ? 'practice-panel' : 'profile-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }));
  const resume = document.getElementById('resume-text');
  resume.value = saved.resume;
  document.getElementById('resume-import').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    const status = document.getElementById('resume-status');
    try {
      status.textContent = 'Reading and saving your resume…';
      event.target.disabled = true;
      const { extractResume } = await import('./resume-upload.mjs');
      const text = await extractResume(file);
      await MagicStorage.set({ resume: text });
      resume.value = text; saved.resume = text; renderActivation();
      status.textContent = `✓ ${file.name} saved. Ready to answer from your resume.`;
    } catch (error) { status.textContent = error.message; }
    event.target.disabled = false; event.target.value = '';
  });
  if (location.hash === '#resume') { resume.closest('section').scrollIntoView?.({ block: 'center' }); document.getElementById('resume-import').focus(); }
  document.getElementById('resume-form').addEventListener('submit', async event => {
    event.preventDefault();
    try { await MagicStorage.set({ resume: resume.value.trim() }); saved.resume = resume.value.trim(); renderActivation(); document.getElementById('resume-status').textContent = 'Resume text saved. Try the Python question.'; }
    catch { document.getElementById('resume-status').textContent = 'Could not save resume text. Please try again.'; }
  });
  async function renderLibrary() {
    const library = document.getElementById('answer-library');
    try {
      const { answers } = await MagicStorage.get();
      library.replaceChildren();
      if (!answers.length) { const empty = document.createElement('p'); empty.className = 'empty-library'; empty.textContent = 'No remembered answers yet. Approve an answer in the playground to get started.'; library.append(empty); }
      for (const item of answers) {
        const article = document.createElement('article'); article.className = 'saved-answer';
        const heading = document.createElement('h3'); heading.textContent = item.question;
        const site = document.createElement('small'); site.textContent = item.origin === 'null' ? 'Local playground' : item.origin;
        const label = document.createElement('label'); label.textContent = 'Approved answer';
        const text = document.createElement('textarea'); text.value = item.answer; text.rows = 3; text.maxLength = 6000; label.append(text);
        const controls = document.createElement('div'); controls.className = 'knowledge-actions';
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'text-button'; remove.textContent = 'Forget answer';
        const save = document.createElement('button'); save.type = 'button'; save.className = 'button secondary'; save.textContent = 'Save answer';
        const status = document.createElement('span'); status.setAttribute('role', 'status');
        async function change(deleting) {
          try {
            if (!deleting && !text.value.trim()) { status.textContent = 'Write an answer first.'; return; }
            const current = await MagicStorage.get();
            const next = current.answers.filter(answer => answer.origin !== item.origin || answer.questionKey !== item.questionKey);
            if (!deleting) next.push({ ...item, answer: text.value.trim(), updatedAt: Date.now() });
            await MagicStorage.set({ answers: next });
            if (deleting) await renderLibrary(); else status.textContent = 'Saved';
          } catch { status.textContent = 'Could not update this answer. Please try again.'; }
        }
        remove.addEventListener('click', () => change(true)); save.addEventListener('click', () => change(false));
        controls.append(remove, status, save); article.append(heading, site, label, controls); library.append(article);
      }
    } catch { document.getElementById('library-status').textContent = 'Could not load your remembered answers.'; }
  }
  renderLibrary();
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) chrome.storage.onChanged.addListener(changes => { if (changes.answers) renderLibrary(); });
  window.addEventListener('magic-storage-change', renderLibrary);
  const aiStatus = document.getElementById('ai-status'), key = document.getElementById('ai-key');
  const rememberKey = document.getElementById('remember-api-key');
  const providers = {
    claude: { name: 'Claude', keyName: 'claudeKey', origin: 'https://api.anthropic.com/*', model: 'claude-haiku-5-5' },
    openai: { name: 'OpenAI', keyName: 'openaiKey', origin: 'https://api.openai.com/*', model: 'gpt-4o-mini' }
  };
  async function updateAIStatus() {
    const selected = provider.value, config = providers[selected];
    rememberKey.checked = true;
    aiConnected = false; renderActivation();
    document.getElementById('ai-key-label').textContent = selected === 'claude' ? 'Anthropic API key' : 'OpenAI API key';
    document.getElementById('ai-model').textContent = `${config.name} model: ${config.model}`;
    aiStatus.textContent = `${config.name} not connected. Local resume excerpts are available.`;
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      try {
        const credentials = await MagicCredentials.status(selected);
        if (provider.value === selected && credentials.connected) {
          rememberKey.checked = credentials.remembered; aiConnected = true;
          aiStatus.textContent = `${config.name} connected${credentials.remembered ? ' · Key remembered on this device.' : ' for this session. Select Remember API key to keep it after reloads.'}`; renderActivation();
        }
      } catch { aiStatus.textContent = 'Could not read saved API keys. Reopen Magic Cursor to try again.'; }
    } else if (window.MagicLocalAI?.available) {
      document.getElementById('key-storage-note').textContent = 'Remembered keys are stored in a file on this device with access restricted to your user account, outside this project. Disconnect removes the saved key.';
      try {
        const connection = await MagicLocalAI.connection(selected);
        if (provider.value === selected && connection.connected) {
          rememberKey.checked = connection.remembered; aiConnected = true;
          aiStatus.textContent = `${config.name} connected${connection.remembered ? ' · Key remembered on this device.' : ' for this local session. Select Remember API key to keep it after restarts.'}`; renderActivation();
        }
      } catch (error) { if (provider.value === selected) aiStatus.textContent = error.message; }
    }
  }
  updateAIStatus();
  rememberKey.addEventListener('change', async () => {
    if (!aiConnected) return;
    const selected = provider.value, value = rememberKey.checked;
    rememberKey.disabled = true;
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.session) await MagicCredentials.remember(selected, value);
      else await MagicLocalAI.remember(selected, value);
      aiStatus.textContent = value ? 'API key remembered on this device. You can restart without reconnecting.' : 'Saved key removed. The current session stays connected.';
    } catch (error) { rememberKey.checked = !value; aiStatus.textContent = error.message; }
    finally { rememberKey.disabled = false; }
  });
  setupButton.addEventListener('click', async () => {
    if (aiConnected && !enabled.checked) { enabled.checked = true; await saveSettings(); }
    if (!aiConnected) { aiSetup.open = true; key.focus(); }
    else if (!saved.resume?.trim()) { resume.scrollIntoView({ block: 'center', behavior: 'smooth' }); resume.focus({ preventScroll: true }); }
    else {
      const question = document.querySelector('[name="app-python"]');
      question.scrollIntoView({ block: 'center', behavior: 'smooth' }); question.focus({ preventScroll: true });
    }
  });
  provider.addEventListener('change', () => { key.value = ''; saveSettings(); updateAIStatus(); });
  document.getElementById('connect-ai').addEventListener('click', async () => {
    const selected = provider.value, config = providers[selected];
    if (!key.value.trim()) { aiStatus.textContent = `Enter a ${config.name} API key first.`; return; }
    const credential = key.value.trim();
    const rememberCredential = rememberKey.checked;
    connecting = true; renderActivation();
    const connectButton = document.getElementById('connect-ai');
    connectButton.disabled = true; connectButton.textContent = 'Turning on…'; provider.disabled = true; key.readOnly = true; rememberKey.disabled = true;
    const wasEnabled = enabled.checked;
    async function finishSetup() {
      if (provider.value !== selected) return;
      key.value = ''; aiConnected = true; enabled.checked = true;
      const settings = { ...saved.settings, enabled: true, mode: mode.value, aiProvider: selected };
      const resumeText = resume.value.trim();
      await MagicStorage.set({ settings, resume: resumeText });
      saved.settings = settings; saved.resume = resumeText;
      updateDescription();
      aiStatus.textContent = `${config.name} connected. ${resumeText ? 'AI answers are on. Review every draft before filling.' : 'Add your resume text to start drafting.'}`;
      aiSetup.open = false;
    }
    try {
      if (typeof chrome === 'undefined' || !chrome.storage?.session) {
        if (!window.MagicLocalAI?.available) throw new Error('Start this project with npm start, or use the installed extension to connect.');
        await MagicLocalAI.connect(selected, credential, rememberCredential);
        await finishSetup();
        return;
      }
      const granted = await chrome.permissions.request({ origins: [config.origin] });
      if (!granted) throw new Error('API access was not granted. Local resume excerpts still work.');
      await MagicCredentials.save(selected, credential, rememberCredential);
      await finishSetup();
    } catch (error) { if (provider.value === selected) { enabled.checked = wasEnabled; aiSetup.open = true; aiStatus.textContent = error.message; } }
    finally { connecting = false; connectButton.disabled = false; connectButton.textContent = 'Save key & turn on'; provider.disabled = false; key.readOnly = false; rememberKey.disabled = false; updateDescription(); }
  });
  document.getElementById('disconnect-ai').addEventListener('click', async () => {
    const selected = provider.value, config = providers[selected];
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.session) {
        await MagicCredentials.forget(selected);
        await chrome.permissions.remove({ origins: [config.origin] });
      } else if (window.MagicLocalAI?.available) await MagicLocalAI.disconnect(selected);
      if (provider.value === selected) { key.value = ''; aiConnected = false; renderActivation(); aiStatus.textContent = `${config.name} disconnected. Local resume excerpts still work.`; }
    } catch { if (provider.value === selected) aiStatus.textContent = 'Could not remove the saved key. Please try Disconnect again.'; }
  });
})();
