import { mkdir, readFile, writeFile, rename, rm, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const directory = process.platform === 'darwin' ? path.join(homedir(), 'Library', 'Application Support', 'Magic Cursor') : path.join(homedir(), '.config', 'magic-cursor');
export function createCredentialStore(filename = path.join(directory, 'credentials.json')) {
  let writes = Promise.resolve();
  async function read() {
    try {
      const data = JSON.parse(await readFile(filename, 'utf8'));
      await chmod(filename, 0o600);
      return Object.fromEntries(['claude', 'openai'].filter(provider => typeof data[provider] === 'string' && data[provider].trim()).map(provider => [provider, data[provider]]));
    } catch (error) {
      if (error.code === 'ENOENT') return {};
      throw new Error('Could not read saved API keys on this device.');
    }
  }
  function change(provider, value) {
    if (!['claude', 'openai'].includes(provider)) throw new Error('Choose Claude or OpenAI.');
    const operation = writes.catch(() => {}).then(async () => {
      const keys = await read();
      if (value) keys[provider] = value; else delete keys[provider];
      const folder = path.dirname(filename), temporary = filename + '.' + randomUUID() + '.tmp';
      try {
        await mkdir(folder, { recursive: true, mode: 0o700 }); await chmod(folder, 0o700);
        if (!Object.keys(keys).length) { await rm(filename, { force: true }); return; }
        await writeFile(temporary, JSON.stringify(keys), { flag: 'wx', mode: 0o600 });
        await rename(temporary, filename);
      } catch { throw new Error('Could not save API keys on this device. Your connection was not changed.'); }
      finally { await rm(temporary, { force: true }).catch(() => {}); }
    });
    writes = operation;
    return operation;
  }
  return { read: async () => { await writes.catch(() => {}); return read(); }, save: (provider, value) => change(provider, value), remove: provider => change(provider) };
}
