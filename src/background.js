importScripts('answers.js', 'draft-policy.js', 'claude-client.js', 'credentials.js');

const credentialsReady = MagicCredentials.initialize();
credentialsReady.catch(() => {});
const publicKeys = ['profile', 'settings', 'resume', 'answers', 'customFields'];
chrome.storage.onChanged?.addListener((changes, area) => {
  if (area !== 'local' || !publicKeys.some(key => Object.hasOwn(changes, key))) return;
  chrome.tabs.query({}).then(tabs => Promise.allSettled(tabs.map(tab => chrome.tabs.sendMessage(tab.id, { type: 'magic-data-changed' })))).catch(() => {});
});

const lastRequest = new Map();
let answerWrites = Promise.resolve();
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return false;
  async function handle() {
    await credentialsReady;
    if (message?.type === 'profile-data') {
      const stored = await chrome.storage.local.get(publicKeys);
      return { ok: true, data: Object.fromEntries(publicKeys.map(key => [key, stored[key]])) };
    }
    if (message?.type === 'open-settings') {
      if (message.section === 'resume') await chrome.tabs.create({ url: chrome.runtime.getURL('index.html#resume') });
      else await chrome.runtime.openOptionsPage();
      return { ok: true };
    }
    if (message?.type === 'remember-answer') {
      const origin = new URL(sender.url).origin;
      const question = typeof message.question === 'string' ? message.question.trim().slice(0, 1000) : '';
      const answer = typeof message.answer === 'string' ? message.answer.trim().slice(0, 6000) : '';
      if (!question || !answer) throw new Error('A question and answer are required.');
      // Serialize writes from different tabs so one saved answer cannot erase another.
      const write = answerWrites.catch(() => {}).then(async () => {
        const { answers = [] } = await chrome.storage.local.get('answers');
        const questionKey = MagicAnswers.normalize(question);
        const remaining = answers.filter(item => item.origin !== origin || item.questionKey !== questionKey);
        remaining.push({ question, questionKey, origin, answer, updatedAt: Date.now() });
        if (remaining.length > 500) throw new Error('Your answer library is full. Remove an old answer from your profile.');
        await chrome.storage.local.set({ answers: remaining });
      });
      answerWrites = write;
      await write;
      return { ok: true };
    }
    if (message?.type !== 'draft-answer') throw new Error('Unknown request.');
    if (typeof message.question !== 'string' || message.question.length > 1000 || !message.question.trim()) throw new Error('Choose a question with a readable label.');
    const { resume = '', settings = {} } = await chrome.storage.local.get(['resume', 'settings']);
    if (settings.enabled === false) throw new Error('Magic Cursor is paused.');
    if (!resume.trim()) throw new Error('Save your resume text in your profile first.');
    const input = MagicDraftPolicy.prepareInput(message.question, resume.slice(0, 40000));
    if (MagicAnswers.needsFact(input.question)) return { ok: true, draft: { answer: '', evidence: [], missingFacts: ['Please provide this fact or preference yourself.'] } };
    const provider = message.provider || 'openai';
    if (!['claude', 'openai'].includes(provider)) throw new Error('Choose Claude or OpenAI in your profile.');
    const name = provider === 'claude' ? 'Claude' : 'OpenAI';
    const apiKey = await MagicCredentials.get(provider);
    if (!apiKey) throw new Error(`Connect a ${name} API key in your profile, or use a local resume excerpt.`);
    const allowed = await chrome.permissions.contains({ origins: [provider === 'claude' ? 'https://api.anthropic.com/*' : 'https://api.openai.com/*'] });
    if (!allowed) throw new Error(`Reconnect ${name} in your profile to allow API access.`);
    const source = sender.tab?.id || sender.url;
    if (Date.now() - (lastRequest.get(source) || 0) < 10000) throw new Error('Please wait 10 seconds before generating another draft.');
    lastRequest.set(source, Date.now());
    const { instructions, schema } = MagicDraftPolicy;
    if (provider === 'claude') {
      const draft = await MagicClaude.draft({ apiKey, question: input.question, resume: input.resume, instructions, schema });
      return { ok: true, draft: { ...MagicAnswers.validateDraft(draft, input.resume, input), filteredInput: input.filtered } };
    }
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini', store: false, max_output_tokens: 1600,
        instructions,
        input: JSON.stringify({ question: input.question, resume: input.resume }),
        text: { format: { type: 'json_schema', name: 'application_answer', strict: true, schema } }
      })
    });
    if (!response.ok) throw new Error(response.status === 401 ? 'The API key was rejected. Reconnect with a valid key.' : response.status === 429 ? 'OpenAI quota or rate limit reached. Check your API account or use a local excerpt.' : `OpenAI request failed (${response.status}). Try again or use a local excerpt.`);
    const payload = await response.json();
    if (payload.status !== 'completed') throw new Error('The AI could not complete this draft. Try again or write your answer.');
    const output = (payload.output || []).flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('');
    let parsed;
    try { parsed = JSON.parse(output); } catch { throw new Error('The AI did not return a usable answer. Please write your answer.'); }
    return { ok: true, draft: { ...MagicAnswers.validateDraft(parsed, input.resume, input), filteredInput: input.filtered } };
  }
  handle().then(respond, error => respond({ ok: false, error: error.name === 'TimeoutError' ? 'The AI request timed out. Try again or use a local excerpt.' : error.message }));
  return true;
});
