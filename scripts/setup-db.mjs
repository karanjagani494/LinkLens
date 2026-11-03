import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
if(!existsSync('.env.db'))writeFileSync('.env.db',`POSTGRES_PASSWORD=${randomBytes(32).toString('hex')}\n`,{mode:0o600});
const password=readFileSync('.env.db','utf8').match(/^POSTGRES_PASSWORD=([a-f0-9]+)$/m)?.[1];
if(!password)throw Error('Local DB environment is invalid. Existing settings were preserved.');
const existing=existsSync('.env.api')?readFileSync('.env.api','utf8'):'';
if(!/^DATABASE_URL=.+/m.test(existing))writeFileSync('.env.api',existing+`\nDATABASE_URL=postgresql://linklens:${password}@127.0.0.1:5433/linklens\n`,{mode:0o600});
console.log('Local database configuration ready. Password stays in ignored environment files.');
