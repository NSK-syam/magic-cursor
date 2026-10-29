const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
function credentials(local = {}, session = {}, deny = false) {
  const access = [];
  const area = data => ({ async get(key) { return { [key]: data[key] }; }, async set(values) { Object.assign(data, values); }, async remove(key) { delete data[key]; } });
  const context = vm.createContext({ chrome: { storage: {
    local: { ...area(local), async setAccessLevel(options) { access.push(options); if (deny) throw new Error('Restricted storage unavailable'); } }, session: area(session)
  } } });
  vm.runInContext(readFileSync('src/credentials.js', 'utf8'), context);
  return { api: context.MagicCredentials, access, local, session };
}
test('remembered extension keys survive a fresh worker/session and remain provider-specific', async () => {
  const first = credentials(); await first.api.save('claude', 'test-claude', true); await first.api.save('openai', 'test-openai', true);
  assert.equal(first.access[0].accessLevel, 'TRUSTED_CONTEXTS');
  const restarted = credentials(first.local, {});
  assert.equal(await restarted.api.get('claude'), 'test-claude');
  assert.equal((await restarted.api.status('claude')).remembered, true);
  await restarted.api.forget('claude'); assert.equal(await restarted.api.get('claude'), ''); assert.equal(await restarted.api.get('openai'), 'test-openai');
});
test('existing session credentials can be remembered without entering the key again', async () => {
  const c = credentials({}, { claudeKey: 'test-only-key' });
  await c.api.remember('claude', true); assert.equal(c.local.claudeKey, 'test-only-key');
  await c.api.remember('claude', false); assert.equal(c.local.claudeKey, undefined); assert.equal(await c.api.get('claude'), 'test-only-key');
  assert.equal(await credentials(c.local, {}).api.get('claude'), '');
});
test('failure to restrict storage prevents persisting a key', async () => {
  const c = credentials({}, {}, true);
  await assert.rejects(c.api.save('claude', 'test-only-key', true), /Restricted/);
  assert.deepEqual(c.local, {}); assert.deepEqual(c.session, {});
});
