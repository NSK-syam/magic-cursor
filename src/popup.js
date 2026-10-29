(async function () {
  const enabled = document.getElementById('enabled'), mode = document.getElementById('fill-mode'), status = document.getElementById('popup-status');
  document.getElementById('open-profile').addEventListener('click', () => chrome.runtime.openOptionsPage());
  const pageStatus = document.getElementById('page-status'), enablePage = document.getElementById('enable-page');
  let updateDescription = () => {};
  let activeTab;
  async function checkPage() {
    try {
      [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.id) throw new Error('No active tab');
      const response = await chrome.tabs.sendMessage(activeTab.id, { type: 'magic-status' }, { frameId: 0 });
      if (!response?.ok || response.version !== chrome.runtime.getManifest().version) throw new Error('Old or missing script');
      pageStatus.textContent = `Active on this page · ${response.fieldCount} fields found${response.enabled ? '' : ' · Paused'}`;
      enablePage.hidden = response.enabled;
      return true;
    } catch {
      pageStatus.textContent = 'Magic Cursor is not running on this page. Click Enable on this page, or refresh the application tab.';
      enablePage.hidden = false;
      return false;
    }
  }
  enablePage.addEventListener('click', async () => {
    enablePage.disabled = true; pageStatus.textContent = 'Enabling on this page…';
    try {
      if (!activeTab?.id) throw new Error('No active tab');
      const stored = await MagicStorage.get();
      await MagicStorage.set({ settings: { ...stored.settings, enabled: true } }); enabled.checked = true; updateDescription();
      await chrome.scripting.executeScript({ target: { tabId: activeTab.id, allFrames: true }, files: ['src/matcher.js', 'src/answers.js', 'src/content.js'] });
      if (!(await checkPage())) pageStatus.textContent = 'This tab may have an older Magic Cursor loaded. Refresh the application tab, then reopen Magic Cursor.';
    } catch { pageStatus.textContent = 'Cannot attach on this page. Browser settings pages and restricted pages cannot run Magic Cursor. On a normal form, refresh the tab and check the extension’s site access.'; }
    finally { enablePage.disabled = false; }
  });
  checkPage();
  try {
    const data = await MagicStorage.get();
    enabled.checked = data.settings.enabled; mode.value = data.settings.mode;
    enabled.disabled = false; mode.disabled = false;
    const selected = data.settings.aiProvider === 'openai' ? 'openai' : 'claude';
    const providerName = selected === 'claude' ? 'Claude' : 'OpenAI';
    const credentials = await MagicCredentials.status(selected);
    const connected = credentials.connected;
    function describe() {
      document.getElementById('enabled-description').textContent = enabled.checked ? 'On · Ready when you are' : 'Off · Paused on all websites';
      document.getElementById('popup-ai-status').textContent = !enabled.checked ? 'AI answers paused' : !connected ? `AI answers need setup · Connect ${providerName}` : !data.resume.trim() ? 'AI answers need your resume' : 'AI answers ready to draft';
      document.getElementById('open-profile').textContent = connected && data.resume.trim() ? 'Open profile & playground' : 'Turn on AI answers';
    }
    updateDescription = describe;
    describe();
    const count = Object.values(data.profile).filter(value => typeof value === 'string' && value.trim()).length;
    status.textContent = count ? `${count} details saved on this device. Refresh existing tabs after installing the extension.` : 'Start by adding your details to your profile.';
    async function save() {
      try { await MagicStorage.set({ settings: { ...data.settings, enabled: enabled.checked, mode: mode.value } }); describe(); }
      catch { status.textContent = 'Could not save settings. Reopen Magic Cursor to try again.'; }
    }
    enabled.addEventListener('change', save); mode.addEventListener('change', save);
  } catch { status.textContent = 'Could not load settings. Reopen Magic Cursor to try again.'; }
})();
