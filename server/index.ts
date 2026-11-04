import {JobRuntime} from './jobs/runtime';
import {databasePool} from './db/pool';
import {ReportStore} from './db/reports';
import { buildApi } from './app';

const port = Number(process.env.PORT || process.env.API_PORT || 4000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT or API_PORT must be an integer from 1 to 65535.');
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
const jobs=store && process.env.REDIS_URL && process.env.RATE_LIMIT_SECRET ? new JobRuntime(store,process.env.REDIS_URL,process.env.RATE_LIMIT_SECRET) : undefined;
if(process.env.NODE_ENV==='production' && !jobs) throw Error('Production requires database, Redis and RATE_LIMIT_SECRET.');
const app = buildApi({ frontendOrigins, store, jobs });
let purgeTimer: ReturnType<typeof setInterval> | undefined;
app.addHook('onClose', async () => { clearInterval(purgeTimer); await jobs?.close(); await pool?.end(); });
async function start() {
  try {
    if (store) {
      await store.ready();
      await store.purge();
      purgeTimer = setInterval(() => { store.purge().catch(() => console.error('Expired-report cleanup failed.')); }, 3600000);
      purgeTimer.unref();
    }
    await jobs?.start();
    await app.listen({ host: process.env.API_HOST || '127.0.0.1', port });
    console.log(`LinkLens API listening on port ${port}. ${jobs ? "Queued processing enabled." : "Direct development analysis; queue not configured."}`);
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
