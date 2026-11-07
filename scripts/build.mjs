import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { validateSupabaseConfig } from '../src/supabase-client.js';
await mkdir('dist', { recursive: true });
for (const path of ['index.html', 'styles.css', 'manifest.json', 'sw.js', 'src', 'icons', '.nojekyll']) {
  await cp(path, `dist/${path}`, { recursive: true });
}
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
if (Boolean(supabaseUrl) !== Boolean(supabaseAnonKey)) throw new Error('Set both SUPABASE_URL and SUPABASE_ANON_KEY, or leave both unset.');
if (supabaseUrl && !validateSupabaseConfig(supabaseUrl, supabaseAnonKey)) throw new Error('Supabase configuration must use an HTTPS project URL and a publishable/anon key.');
await writeFile('dist/src/public-config.js', `export const supabaseUrl = ${JSON.stringify(supabaseUrl)};\nexport const supabaseAnonKey = ${JSON.stringify(supabaseAnonKey)};\n`);
const capacitorCorePath = 'node_modules/@capacitor/core/dist/index.js';
const localNotificationsPath = 'node_modules/@capacitor/local-notifications/dist/esm';
try {
  await mkdir('dist/vendor', { recursive:true });
  await writeFile('dist/vendor/capacitor-core.js', await readFile(capacitorCorePath));
  await rm('dist/vendor/local-notifications', { recursive:true, force:true });
  await mkdir('dist/vendor/local-notifications', { recursive:true });
  for (const name of await readdir(localNotificationsPath)) {
    if (!name.endsWith('.js')) continue;
    const file = `dist/vendor/local-notifications/${name}`;
    const source = await readFile(`${localNotificationsPath}/${name}`, 'utf8');
    const browserImports = source.replace(/((?:from\s*|import\s*\(\s*)['"])(\.{1,2}\/[^'"]+?)(['"])/g, (match, before, specifier, after) =>
      `${before}${/\.[a-z0-9]+$/i.test(specifier) ? specifier : `${specifier}.js`}${after}`).replace(/^\/\/# sourceMappingURL=.*$/gm, '');
    await writeFile(file, browserImports);
  }
  const htmlPath = 'dist/index.html';
  const html = await readFile(htmlPath, 'utf8');
  const importMap = '<script type="importmap">{"imports":{"@capacitor/core":"./vendor/capacitor-core.js","@capacitor/local-notifications":"./vendor/local-notifications/index.js"}}</script>\n  ';
  await writeFile(htmlPath, html.replace('<script type="module" src="./src/app.js"></script>', `${importMap}<script type="module" src="./src/app.js"></script>`));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const toneRate = 22050, toneSamples = Math.floor(toneRate * 0.18), tone = Buffer.alloc(44 + toneSamples * 2);
tone.write('RIFF', 0); tone.writeUInt32LE(tone.length - 8, 4); tone.write('WAVE', 8); tone.write('fmt ', 12);
tone.writeUInt32LE(16, 16); tone.writeUInt16LE(1, 20); tone.writeUInt16LE(1, 22); tone.writeUInt32LE(toneRate, 24);
tone.writeUInt32LE(toneRate * 2, 28); tone.writeUInt16LE(2, 32); tone.writeUInt16LE(16, 34); tone.write('data', 36); tone.writeUInt32LE(tone.length - 44, 40);
for (let sample = 0; sample < toneSamples; sample++) {
  const fade = Math.min(1, sample / 220, (toneSamples - sample) / 1100);
  tone.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 880 * sample / toneRate) * 5000 * fade), 44 + sample * 2);
}
await writeFile('dist/reminder.wav', tone);
const basePath = process.env.BASE_PATH || './';
if (!basePath.endsWith('/')) throw new Error('BASE_PATH must end with a slash');
if (basePath !== './') {
  const htmlPath = 'dist/index.html';
  const html = await readFile(htmlPath, 'utf8');
  await writeFile(htmlPath, html.replaceAll('href="./', `href="${basePath}`).replaceAll('src="./', `src="${basePath}`));
  const manifestPath = 'dist/manifest.json';
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.start_url = basePath;
  manifest.scope = basePath;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
console.log('Static site built in dist/');
