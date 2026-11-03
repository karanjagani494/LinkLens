import {parse} from 'tldts';
import {toUnicode} from 'punycode/';
import type {Domain} from './types';
export function validateUrl(value:string):string|null {
 if(!/^https?:\/\//i.test(value)) return 'Enter an explicit http:// or https:// URL.';
 if(new TextEncoder().encode(value).length>4096) return 'The URL exceeds 4,096 UTF-8 bytes.';
 if(/[\u0000-\u0020\u007f\\]/.test(value)) return 'Remove spaces, control characters and backslashes.';
 try { const u=new URL(value); if(u.username||u.password) return 'URLs containing credentials are not supported.';
 const raw=value.match(/^https?:\/\/([^/?#]+)/i)![1];
 const host=raw.startsWith('[')?raw.slice(0,raw.indexOf(']')+1):raw.split(':')[0];
 if(host.includes('%')||u.hostname.length>253||(!u.hostname.startsWith('[')&&u.hostname.split('.').some(label=>label.startsWith('-')||label.endsWith('-')))) return 'The hostname is malformed or noncanonical.';
 if(u.hostname.startsWith('[')&&host.toLowerCase()!==u.hostname) return 'Use a canonical IPv6 address.';
 if(!u.hostname.includes('.')&&!u.hostname.includes(':')) return 'Use a fully qualified hostname or canonical IP address.';
 if(/^[\d.]+$/.test(u.hostname)&&host!==u.hostname) return 'Numeric and noncanonical host encodings are not supported.';
 if(/^0x/i.test(host)||host.endsWith('.')||u.hostname.split('.').some(p=>!p||p.length>63)||(!u.hostname.startsWith('[')&&!/^[a-z\d.-]+$/i.test(u.hostname))) return 'The hostname is malformed or noncanonical.';
 return null;
 } catch{return 'Enter a valid HTTP(S) URL.'}
}
export function domainOf(value:string):Domain {const u=new URL(value);const p=parse(u.hostname,{allowPrivateDomains:true}); const fixture=u.hostname.endsWith('.test')?u.hostname.split('.').slice(-2).join('.'):null;const known=!!fixture||p.isIcann||p.isPrivate;const domain=known?(fixture||p.domain):null;return {scheme:u.protocol.slice(0,-1),hostname:u.hostname,unicode:toUnicode(u.hostname),subdomain:domain?u.hostname.slice(0,-domain.length).replace(/\.$/,''):null,registrableDomain:p.isIp?null:domain,publicSuffix:fixture?'test (fixture)':p.isIcann||p.isPrivate?p.publicSuffix:null}}
export function redact(value:string){const u=new URL(value);return `${u.protocol}//${u.host}${u.pathname==='/'?'':'/[redacted]'}`}
export function validateImageHeader(bytes:Uint8Array,size:number){if(size>5*1024*1024)throw Error('Choose an image no larger than 5 MB.');const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;const webp=String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';if(!png&&!jpeg&&!webp)throw Error('Choose a valid PNG, JPEG or WebP image.');if((png && new TextDecoder('latin1').decode(bytes).includes('acTL'))||(webp && new TextDecoder('latin1').decode(bytes).includes('ANIM')))throw Error('Animated images are not supported.');}
export function checkPixels(w:number,h:number){if(!w||!h||w*h>16_000_000)throw Error('The image exceeds 16 megapixels or is invalid.');}

