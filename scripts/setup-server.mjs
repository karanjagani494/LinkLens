import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
const path='.env.api';let text=existsSync(path)?readFileSync(path,'utf8'):readFileSync('.env.api.example','utf8');
for(const key of ['RATE_LIMIT_SECRET','FETCH_SERVICE_TOKEN']){
 const re=new RegExp('^'+key+'=.*$','m');const current=text.match(re)?.[0].split('=').slice(1).join('');
 if(!current||current==='replace-me'){const line=key+'='+randomBytes(32).toString('hex');text=re.test(text)?text.replace(re,line):text+'\n'+line;}
}
writeFileSync(path,text+'\n',{mode:0o600});console.log('Server secrets prepared in ignored .env.api. No credentials printed.');
