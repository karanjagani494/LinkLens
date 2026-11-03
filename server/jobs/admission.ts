import { createHmac,randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
export class LimitError extends Error { constructor(public retryAfter:number){super('Submission limit reached. Wait before submitting again.')} }
const script=`
local now=tonumber(ARGV[1]); local id=ARGV[2]
redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',now-60000)
redis.call('ZREMRANGEBYSCORE',KEYS[3],'-inf',now)
redis.call('ZREMRANGEBYSCORE',KEYS[4],'-inf',now)
if redis.call('ZCARD',KEYS[1])>=5 then return 60 end
if tonumber(redis.call('GET',KEYS[2]) or '0')>=30 then return 86400 end
if redis.call('ZCARD',KEYS[3])>=2 or redis.call('ZCARD',KEYS[4])>=4 then return 45 end
redis.call('ZADD',KEYS[1],now,id);redis.call('PEXPIRE',KEYS[1],60000)
redis.call('INCR',KEYS[2]);redis.call('EXPIRE',KEYS[2],86400)
redis.call('ZADD',KEYS[3],now+45000,id);redis.call('EXPIRE',KEYS[3],60)
redis.call('ZADD',KEYS[4],now+45000,id);redis.call('EXPIRE',KEYS[4],60)
return 0`;
export class Admission {
 constructor(private redis:Redis,private secret:string,private prefix='ll'){}
 client(ip:string){return createHmac('sha256',this.secret).update(new Date().toISOString().slice(0,10)+':'+ip).digest('hex')}
 async reserve(ip:string,id:string=randomUUID()){
  const client=this.client(ip),base=`${this.prefix}:limit:${client}`;
  const retry=Number(await this.redis.eval(script,4,base+':minute',base+':day',base+':active',`${this.prefix}:active`,Date.now(),id));
  if(retry)throw new LimitError(retry);
  await this.redis.set(`${this.prefix}:owner:${id}`,client,'EX',300);
  return id;
 }
 async release(id:string){const owner=await this.redis.get(`${this.prefix}:owner:${id}`);const multi=this.redis.multi().zrem(`${this.prefix}:active`,id);if(owner)multi.zrem(`${this.prefix}:limit:${owner}:active`,id);await multi.del(`${this.prefix}:owner:${id}`).exec()}
}

// Development fallback only; production uses atomic Redis admission.
export class LocalAdmission {
 private clients=new Map<string,{minute:number[];day:number[];active:number}>();private active=0;private secret=randomUUID();
 reserve(ip:string){ip=createHmac('sha256',this.secret).update(ip).digest('hex');const now=Date.now();if(this.clients.size>10000)for(const [key,value] of this.clients)if(!value.day.some(t=>t>now-86400000))this.clients.delete(key);
  const client=this.clients.get(ip)||{minute:[],day:[],active:0};client.minute=client.minute.filter(t=>t>now-60000);client.day=client.day.filter(t=>t>now-86400000);
  if(client.minute.length>=5)throw new LimitError(60);if(client.day.length>=30)throw new LimitError(86400);if(client.active>=2||this.active>=4)throw new LimitError(45);
  client.minute.push(now);client.day.push(now);client.active++;this.active++;this.clients.set(ip,client);let released=false;
  return ()=>{if(!released){released=true;client.active--;this.active--}};
 }
}
