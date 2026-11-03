import ipaddr from 'ipaddr.js';
import {promises as dns} from 'node:dns';
import {isIP} from 'node:net';
import {request as httpRequest} from 'node:http';
import {request as httpsRequest} from 'node:https';
import {validateUrl,redact} from '../../src/lib/validation';
import type {Inspection} from '../providers/analysis';
export class Blocked extends Error{constructor(){super('BLOCKED_DESTINATION')}}
export function publicAddress(value:string){
 try{const address=ipaddr.parse(value);if(address.range()!=='unicast')return false;if(address.kind()==='ipv6'&&!address.match(ipaddr.parse('2000::') as ipaddr.IPv6,3))return false;return true}catch{return false}
}
export type Answer={address:string;family:number};
export async function resolvePublic(host:string,resolver:(host:string)=>Promise<Answer[]>=h=>dns.lookup(h,{all:true,verbatim:true})):Promise<Answer>{
 const name=host.replace(/^\[|\]$/g,'');
 const answers=isIP(name)?[{address:name,family:isIP(name)}]:await Promise.race([resolver(name),new Promise<never>((_,reject)=>{const t=setTimeout(()=>reject(Error('DNS_TIMEOUT')),2000);t.unref()})]);
 if(!answers.length||answers.some(a=>!publicAddress(a.address)))throw new Blocked();return answers[0];
}
function canonical(value:string){try{const a=ipaddr.parse(value);return a.kind()==='ipv6'&&(a as ipaddr.IPv6).isIPv4MappedAddress()?(a as ipaddr.IPv6).toIPv4Address().toString():a.toNormalizedString()}catch{return ''}}
export interface HeaderResult {status:number;location?:string}
export function headersOnly(url:URL,pinned:Answer,signal:AbortSignal):Promise<HeaderResult>{
 return new Promise((resolve,reject)=>{
  const request=url.protocol==='https:'?httpsRequest:httpRequest;
  const req=request(url,{method:'GET',agent:false,signal,maxHeaderSize:32768,headers:{'User-Agent':'LinkLens/1.0 (headers-only)','Accept':'*/*'},lookup:((_hostname:unknown,opts:unknown,callback:(...args:unknown[])=>void)=>{if(opts&&typeof opts==='object'&&'all' in opts&&(opts as {all:boolean}).all)callback(null,[pinned]);else callback(null,pinned.address,pinned.family)}) as never},res=>{
   const result={status:res.statusCode||0,location:res.headers.location};res.destroy();req.destroy();resolve(result);
  });
  req.setTimeout?.(3000,()=>req.destroy(Error('HEADER_TIMEOUT')));
  const connectTimer=setTimeout(()=>req.destroy(Error('CONNECT_TIMEOUT')),3000);connectTimer.unref();
  req.on('socket',socket=>{
   socket.once('connect',()=>{
    if(canonical(socket.remoteAddress||'')!==canonical(pinned.address)){req.destroy(new Blocked());return}
    clearTimeout(connectTimer);
   });
  });
  req.on('error',error=>{clearTimeout(connectTimer);reject(error)});req.on('close',()=>clearTimeout(connectTimer));req.end();
 });
}
export async function inspectChain(value:string,signal:AbortSignal,dependencies:{resolve?:typeof resolvePublic;request?:typeof headersOnly}={}):Promise<Inspection>{
 const result:Inspection={redirects:[],urls:[],status:'unavailable',reason:'Inspection did not complete.'};
 const visited=new Set<string>();let current=value;
 try{
  const bounded=AbortSignal.any([signal,AbortSignal.timeout(15000)]);
  for(let hop=0;hop<=5;hop++){
   bounded.throwIfAborted();if(validateUrl(current))throw new Blocked();const url=new URL(current);url.hash='';
   if(url.port||url.username||url.password)throw new Blocked();
   if(visited.has(url.href)){result.reason='Redirect loop detected.';return result}visited.add(url.href);
   const address=await (dependencies.resolve||resolvePublic)(url.hostname);bounded.throwIfAborted();
   const headers=await (dependencies.request||headersOnly)(url,address,bounded);
   result.urls.push(url.href);
   result.redirects.push({url:redact(url.href),status:headers.status,outcome:'Response headers observed; body not inspected.'});
   if(![301,302,303,307,308].includes(headers.status)){result.status='passed';result.reason='Header-only inspection completed. No page content, forms or JavaScript inspected.';return result}
   if(!headers.location){result.reason='Redirect response had no Location header.';return result}
   if(hop===5){result.reason='Redirect limit reached (five redirects).';return result}
   current=new URL(headers.location,url).href;
  }
 }catch(error){result.status=error instanceof Blocked?'blocked':'unavailable';result.reason=result.status==='blocked'?'Destination blocked by the network safety policy.':'DNS, connection, TLS or inspection time/header budget failed.'}
 return result;
}
