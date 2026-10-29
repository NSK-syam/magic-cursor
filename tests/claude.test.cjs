const { test } = require('node:test');
const assert = require('node:assert/strict');

const resume = 'Built Python services with FastAPI.';
const result = { answer: 'I built Python services with FastAPI.', evidence: [resume], missingFacts: [] };
function streamResponse(text, stop = 'end_turn') {
  const events = [
    { type: 'message_start', message: { id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 20, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 30 } },
    { type: 'message_stop' }
  ];
  return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
}
test('official Claude SDK streams structured output to Anthropic with the supplied session key', async () => {
  const { draft } = await import('../src/claude-client.mjs');
  let request;
  const answer = await draft({ apiKey: 'test-only-credential', resume, question: 'Describe Python', instructions: 'Use only the resume.', schema: { type: 'object' }, fetch: async (url, init) => { request = { url, init }; return streamResponse(JSON.stringify(result)); } });
  assert.deepEqual(answer, result);
  assert.equal(String(request.url), 'https://api.anthropic.com/v1/messages');
  assert.equal(new Headers(request.init.headers).get('authorization'), 'Bearer test-only-credential');
  const body = JSON.parse(request.init.body);
  assert.equal(body.model, 'claude-haiku-5-5'); assert.equal(body.stream, true);
  assert.equal(body.output_config.format.type, 'json_schema');
  assert.deepEqual(Object.keys(JSON.parse(body.messages[0].content)).sort(), ['question', 'resume']);
});
test('the bundled SDK runs in a browser worker without Node globals', async () => {
  const vm = require('node:vm');
  const { buildSync } = require('esbuild');
  const bundle = buildSync({ entryPoints: ['src/claude-client.mjs'], bundle: true, write: false, format: 'iife', globalName: 'MagicClaude', platform: 'browser', target: 'chrome102' }).outputFiles[0].text;
  const context = vm.createContext({ console, URL, URLSearchParams, Headers, Request, Response, FormData, File, Blob, AbortController, AbortSignal, TextEncoder, TextDecoder, ReadableStream, crypto: globalThis.crypto, setTimeout, clearTimeout, fetch: async () => streamResponse(JSON.stringify(result)) });
  vm.runInContext(bundle, context);
  const answer = await context.MagicClaude.draft({ apiKey: 'test-only-credential', resume, question: 'Describe Python', instructions: 'Use resume evidence', schema: { type: 'object' } });
  assert.equal(answer.answer, result.answer);
});
test('Claude rejects truncated/refused/malformed drafts and redacts API error bodies', async () => {
  const { draft } = await import('../src/claude-client.mjs');
  for (const stop of ['max_tokens', 'refusal']) {
    await assert.rejects(draft({ apiKey: 'test-only', resume, question: 'Describe Python', schema: {}, fetch: async () => streamResponse(JSON.stringify(result), stop) }), /Claude/);
  }
  await assert.rejects(draft({ apiKey: 'test-only', resume, question: 'Describe Python', schema: {}, fetch: async () => streamResponse('not json') }), /usable draft/);
  try {
    await draft({ apiKey: 'test-only', resume, question: 'Describe Python', schema: {}, fetch: async () => new Response(JSON.stringify({ error: { type: 'authentication_error', message: 'SECRET SHOULD NOT REACH UI' } }), { status: 401, headers: { 'content-type': 'application/json' } }) });
    assert.fail('Should reject invalid key');
  } catch (error) { assert.match(error.message, /rejected the API key/); assert.equal(error.message.includes('SECRET'), false); }
});
