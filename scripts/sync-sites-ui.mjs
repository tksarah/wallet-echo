import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Presentation only: never copy runtime configuration, APIs, or stored data.
const root = fileURLToPath(new URL('../', import.meta.url));
const target = resolve(root, 'sites-wallet-echo');
const manifest = JSON.parse(await readFile(resolve(target, '.openai/hosting.json'), 'utf8'));
if (manifest.project_id !== 'appgprj_6ab16c7fad7081918af45797540ee842') throw new Error('Unexpected Sites checkout');
const files = ['app/page.tsx', 'app/home.module.css', 'app/hero.css',
  'app/components/style-picker.tsx', 'app/components/example-gallery.tsx', 'lib/translations.ts'];
const check = process.argv.includes('--check');
for (const file of files) {
  const source = await readFile(resolve(root, 'src', file));
  if (check) {
    const destination = await readFile(resolve(target, file));
    if (source.toString().replace(/\r\n/g, '\n') !== destination.toString().replace(/\r\n/g, '\n')) throw new Error(`UI differs: ${file}`);
  } else await writeFile(resolve(target, file), source);
}
console.log(`${check ? 'Verified' : 'Synced'} ${files.length} public UI files; backend and data untouched.`);
