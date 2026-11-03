import {databasePool} from './db/pool';
import {ReportStore} from './db/reports';
import { buildApi } from './app';

const port = Number(process.env.API_PORT || 4000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('API_PORT must be an integer from 1 to 65535.');
}
const frontendOrigins = (process.env.FRONTEND_ORIGINS || 'http://127.0.0.1:3000,http://localhost:3000')
  .split(',').map(value => value.trim()).filter(Boolean);
for (const origin of frontendOrigins) {
  const parsed = new URL(origin);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) {
    throw new Error('FRONTEND_ORIGINS must contain explicit HTTP(S) origins without paths or trailing slashes.');
  }
}
const pool = databasePool();
const store = pool ? new ReportStore(pool) : undefined;
const app = buildApi({ frontendOrigins, store });
let purgeTimer: ReturnType<typeof setInterval> | undefined;
app.addHook('onClose', async () => { clearInterval(purgeTimer); await pool?.end(); });
async function start() {
  try {
    if (store) {
      await store.ready();
      await store.purge();
      purgeTimer = setInterval(() => { store.purge().catch(() => console.error('Expired-report cleanup failed.')); }, 3600000);
      purgeTimer.unref();
    }
    await app.listen({ host: process.env.API_HOST || '127.0.0.1', port });
    console.log(`LinkLens API foundation listening on port ${port}. Structural URL analysis is available when database storage is configured.`);
  } catch {
    console.error('LinkLens API could not start. Check the configured host and port.');
    await app.close();
    process.exitCode = 1;
  }
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { app.close().catch(() => { process.exitCode = 1; }); });
}
void start();
