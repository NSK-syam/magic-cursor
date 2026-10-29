const { test } = require('node:test');
const assert = require('node:assert/strict');
test('resume uploads preserve readable evidence and reject empty, unsupported, or oversized files', async () => {
  const { extractResume } = await import('../src/resume-upload.mjs');
  const file = { name: 'resume.txt', size: 40, text: async () => '  Built Python services.\nUsed FastAPI.  ' };
  assert.equal(await extractResume(file), 'Built Python services.\nUsed FastAPI.');
  await assert.rejects(extractResume({ ...file, text: async () => '  ' }), /No readable text/);
  await assert.rejects(extractResume({ ...file, name: 'resume.exe' }), /Choose a PDF/);
  await assert.rejects(extractResume({ ...file, size: 11000000 }), /10 MB/);
  await assert.rejects(extractResume({ ...file, text: async () => 'x'.repeat(40001) }), /40,000/);
});
