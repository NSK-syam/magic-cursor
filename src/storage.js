(function () {
  const defaults = { profile: {}, settings: { enabled: true, mode: 'hover', delay: 1100 } };
  const extension = typeof chrome !== 'undefined' && chrome.storage?.local;
  window.MagicStorage = {
    async get() {
      const data = extension ? await chrome.storage.local.get(['profile', 'settings', 'resume', 'answers', 'customFields']) : JSON.parse(localStorage.getItem('magic-cursor') || '{}');
      return { profile: data.profile || {}, settings: { ...defaults.settings, ...data.settings }, resume: data.resume || '', answers: data.answers || [], customFields: Array.isArray(data.customFields) ? data.customFields : [] };
    },
    async set(data) {
      if (extension) await chrome.storage.local.set(data);
      else {
        const previous = await this.get();
        localStorage.setItem('magic-cursor', JSON.stringify({ ...previous, ...data }));
        window.dispatchEvent(new CustomEvent('magic-storage-change'));
      }
    }
  };
})();
