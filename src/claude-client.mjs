import Anthropic from '@anthropic-ai/sdk';

// Bundled locally for the extension worker. No SDK or script is loaded from a CDN.
export async function draft({ apiKey, question, resume, instructions, schema, fetch: fetchOverride }) {
  const client = new Anthropic({
    apiKey, baseURL: 'https://api.anthropic.com', dangerouslyAllowBrowser: true, maxRetries: 0, timeout: 25000,
    ...(fetchOverride ? { fetch: fetchOverride } : {})
  });
  try {
    const stream = client.messages.stream({
      model: 'claude-haiku-5-5', max_tokens: 4096,
      thinking: { type: 'adaptive' },
      system: instructions,
      messages: [{ role: 'user', content: JSON.stringify({ question, resume }) }],
      output_config: { format: { type: 'json_schema', schema } }
    }, { signal: AbortSignal.timeout(25000) });
    const response = await stream.finalMessage();
    if (response.stop_reason !== 'end_turn') throw new Error(response.stop_reason === 'max_tokens' ? 'Claude reached its output limit. Try again or use a local excerpt.' : 'Claude could not complete this draft. Write your answer or try a local excerpt.');
    const text = response.content.filter(block => block.type === 'text').map(block => block.text).join('');
    try { return JSON.parse(text); } catch { throw new Error('Claude did not return a usable draft. Write your answer or try again.'); }
  } catch (error) {
    // Never forward provider error bodies: they can echo request data or credentials.
    if (error.status === 401) throw new Error('Claude rejected the API key. Reconnect with a valid Anthropic API key.');
    if (error.status === 403) throw new Error('Your Anthropic account does not have access to this model. Check your API account.');
    if (error.status === 404) throw new Error('The configured Claude model is unavailable for your account. Check your model access.');
    if (error.status === 429) throw new Error('Claude quota or rate limit reached. Check your API account or use a local excerpt.');
    if (error.name === 'APIUserAbortError' || error.name === 'APIConnectionTimeoutError' || error.name === 'TimeoutError') throw new Error('The Claude request timed out. Try again or use a local excerpt.');
    if (error instanceof Anthropic.APIError || error instanceof Anthropic.APIConnectionError) throw new Error('Could not reach Claude. Check your connection and API access, or use a local excerpt.');
    throw error;
  }
}
