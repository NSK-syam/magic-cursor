const { cpSync, mkdirSync, readFileSync, existsSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist', 'magic-cursor');
const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const entrypoints = [manifest.options_page, manifest.action.default_popup, manifest.background.service_worker, ...manifest.content_scripts.flatMap(script => script.js)];
for (const entry of entrypoints) {
  if (!existsSync(path.join(root, entry))) throw new Error(`Missing extension file: ${entry}`);
}
mkdirSync(output, { recursive: true });
for (const entry of ['manifest.json', 'index.html', 'popup.html', 'src', 'assets', 'README.md']) {
  cpSync(path.join(root, entry), path.join(output, entry), { recursive: true });
}
const vendor = path.join(output, 'src', 'vendor');
mkdirSync(vendor, { recursive: true });
for (const name of ['pdf.mjs', 'pdf.worker.mjs']) cpSync(path.join(root, 'node_modules/pdfjs-dist/legacy/build', name), path.join(vendor, name));
cpSync(path.join(root, 'node_modules/pdfjs-dist/LICENSE'), path.join(vendor, 'PDFJS-LICENSE.txt'));
const bundle = require('esbuild').buildSync({
  entryPoints: [path.join(root, 'src', 'claude-client.mjs')],
  outfile: path.join(output, 'src', 'claude-client.js'),
  bundle: true, platform: 'browser', format: 'iife', globalName: 'MagicClaude',
  target: 'chrome102', minify: true, legalComments: 'eof', metafile: true
});
const bundledPackages = new Set();
for (const input of Object.keys(bundle.metafile.inputs)) {
  const relative = input.split('node_modules/').pop();
  if (relative === input) continue;
  const parts = relative.split('/');
  bundledPackages.add(parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]);
}
const licenses = path.join(output, 'third-party-licenses');
mkdirSync(licenses, { recursive: true });
for (const name of bundledPackages) {
  for (const file of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'NOTICE']) {
    const source = path.join(root, 'node_modules', name, file);
    if (existsSync(source)) cpSync(source, path.join(licenses, `${name.replaceAll('/', '-')}-${file}.txt`));
  }
}
console.log(`Ready to load in Chrome or Edge: ${output}`);
