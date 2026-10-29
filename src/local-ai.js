(function () {
  const available = location.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
  async function request(path, body, signal) {
    if (!available) throw new Error('AI drafting requires the installed extension or the local app started with npm start.');
    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(cancel, 30000);
    try {
      const status = await fetch('/api/status', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
      let session;
      try { session = await status.json(); } catch { throw new Error('The local AI server is not running. Start this project with npm start, then refresh this page.'); }
      if (!status.ok || !session.ok) throw new Error(session.error || 'Could not connect to the local AI server.');
      if (!path) return session;
      const response = await fetch(path, {
        method: 'POST', credentials: 'same-origin', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'X-Magic-CSRF': session.csrfToken }, body: JSON.stringify(body)
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'The local AI request failed.');
      return result;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error(signal?.aborted ? 'Draft cancelled.' : 'The AI request timed out. Please try again.');
      if (error instanceof TypeError) throw new Error('Could not reach the local AI server. Start npm start and refresh this page.');
      throw error;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
  }
  window.MagicLocalAI = {
    available,
    async status(provider) { const status = await request(); return Boolean(status.connected?.[provider]); },
    async connection(provider) { const status = await request(); return { connected: Boolean(status.connected?.[provider]), remembered: Boolean(status.remembered?.[provider]) }; },
    connect(provider, apiKey, remember = true) { return request('/api/connect', { provider, apiKey, remember }); },
    remember(provider, remember) { return request('/api/remember', { provider, remember }); },
    disconnect(provider) { return request('/api/disconnect', { provider }); },
    async draft(question, provider, resume, signal) { const result = await request('/api/draft', { question, provider, resume }, signal); return result.draft; }
  };
})();
