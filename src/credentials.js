(function (root) {
  'use strict';
  const names = { claude: 'claudeKey', openai: 'openaiKey' };
  let ready;
  function keyName(provider) {
    if (!names[provider]) throw new Error('Choose Claude or OpenAI.');
    return names[provider];
  }
  function initialize() {
    if (!ready) ready = chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(error => { ready = null; throw error; });
    return ready;
  }
  async function get(provider) {
    await initialize();
    const name = keyName(provider), session = await chrome.storage.session.get(name);
    return session[name] || (await chrome.storage.local.get(name))[name] || '';
  }
  async function status(provider) {
    await initialize();
    const name = keyName(provider), stored = await chrome.storage.local.get(name);
    return { connected: Boolean(await get(provider)), remembered: Boolean(stored[name]) };
  }
  async function save(provider, value, remember) {
    await initialize();
    if (typeof value !== 'string' || !value.trim() || value.length > 2000) throw new Error('Enter a valid API key.');
    const name = keyName(provider);
    if (remember) await chrome.storage.local.set({ [name]: value.trim() });
    else await chrome.storage.local.remove(name);
    await chrome.storage.session.set({ [name]: value.trim() });
  }
  async function remember(provider, enabled) {
    const value = await get(provider);
    if (!value) throw new Error('Connect your API key first.');
    await save(provider, value, enabled);
  }
  async function forget(provider) {
    await initialize();
    const name = keyName(provider);
    await chrome.storage.local.remove(name);
    await chrome.storage.session.remove(name);
  }
  root.MagicCredentials = { initialize, get, status, save, remember, forget };
})(typeof globalThis !== 'undefined' ? globalThis : this);
