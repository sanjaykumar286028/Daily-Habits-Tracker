import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
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

