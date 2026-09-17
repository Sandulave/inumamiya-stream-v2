import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const root = new URL('../', import.meta.url);
const paths = ['apps/api/.env.local', 'apps/web/.env.local'];
const files = await Promise.all(paths.map(async (path) => {
  const url = new URL(path, root);
  const raw = await readFile(url, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  return { url, raw, values: parseEnv(raw) };
}));
const [api, web] = files;
if (api.values.ANALYTICS_API_TOKEN && web.values.ANALYTICS_API_TOKEN &&
  api.values.ANALYTICS_API_TOKEN !== web.values.ANALYTICS_API_TOKEN) {
  throw new Error('The API and web ANALYTICS_API_TOKEN values differ. Align them before running setup.');
}
const token = api.values.ANALYTICS_API_TOKEN || web.values.ANALYTICS_API_TOKEN || randomBytes(32).toString('hex');
const values = [
  {
    ANALYTICS_API_TOKEN: token,
    ANALYTICS_ADMIN_PASSWORD: api.values.ANALYTICS_ADMIN_PASSWORD || randomBytes(18).toString('base64url'),
  },
  {
    ANALYTICS_API_TOKEN: token,
    ANALYTICS_SESSION_SECRET: web.values.ANALYTICS_SESSION_SECRET || randomBytes(32).toString('hex'),
  },
];

for (const [index, file] of files.entries()) {
  let raw = file.raw;
  for (const [name, value] of Object.entries(values[index])) {
    if (file.values[name]) continue;
    const line = new RegExp(`^${name}=.*$`, 'm');
    if (line.test(raw)) raw = raw.replace(line, `${name}=${value}`);
    else raw += `${raw.endsWith('\n') || !raw ? '' : '\n'}${name}=${value}\n`;
  }
  if (raw !== file.raw) await writeFile(file.url, raw, { mode: 0o600 });
}
console.log('Analytics local configuration is ready. Existing values were preserved.');
console.log(`Admin password: ANALYTICS_ADMIN_PASSWORD in ${fileURLToPath(api.url)}`);
console.log('Private dashboard: http://localhost:3000/admin/analytics');
