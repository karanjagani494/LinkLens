import {randomUUID} from 'node:crypto';
import {isIP} from 'node:net';
import {domainToUnicode} from 'node:url';
import {createRequire} from 'node:module';
import {parse} from 'tldts';
import catalogue from './brands.json';
import {validateUrl,redact} from '../../src/lib/validation';
import {verdictFor} from '../../src/lib/privacy';
import type {Report,ScanRequest} from '../../src/lib/types';
const suffixVersion=createRequire(import.meta.url)('tldts/package.json').version as string;
export function validateRequest(value:unknown):value is ScanRequest{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const v=value as Record<string,unknown>;
 return Object.keys(v).every(k=>['url','inputKind','inspectRedirects','checkReputation'].includes(k))&&typeof v.url==='string'&&['url','qr'].includes(String(v.inputKind))&&typeof v.inspectRedirects==='boolean'&&typeof v.checkReputation==='boolean'&&!validateUrl(v.url);
}
function oneEdit(a:string,b:string){
 if(Math.abs(a.length-b.length)>1||a===b)return false;
 let i=0,j=0,edits=0;
 while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue}if(++edits>1)return false;if(a.length>=b.length)i++;if(b.length>=a.length)j++}
 return edits+(a.length-i)+(b.length-j)===1;
}
export function analyse(input:ScanRequest):Report{
 const u=new URL(input.url);const hostname=u.hostname;const ip=!!isIP(hostname.replace(/^\[|\]$/g,''));
 const parsed=parse(hostname,{allowPrivateDomains:true});const known=parsed.isIcann||parsed.isPrivate;
 const domain={scheme:u.protocol.slice(0,-1),hostname,unicode:domainToUnicode(hostname)||hostname,subdomain:known?parsed.subdomain:null,registrableDomain:known?parsed.domain:null,publicSuffix:known?parsed.publicSuffix:null};
 const findings:Report['findings']=[];
 const add=(id:string,severity:Report['findings'][number]['severity'],observed:string,why:string,limitation:string)=>findings.push({id,severity,observed,why,limitation});
 for(const brand of catalogue.brands){
  if(brand.domains.includes(parsed.domain||''))continue;
  const misplaced=brand.domains.find(d=>hostname.startsWith(d+'.')||hostname.includes('.'+d+'.'));
  if(misplaced){add('DOM-001','high',`Official-domain text ${misplaced} appears outside that official domain in ${hostname}.`,'A brand domain embedded in another hostname does not establish ownership.','This structural indicator does not prove who operates the site or whether a payment is fraudulent.');break}
 }
 const label=parsed.domainWithoutSuffix;
 if(known&&label&&!catalogue.brands.some(b=>b.domains.includes(parsed.domain||''))){
  const brand=catalogue.brands.find(b=>b.label.length>=5&&(oneEdit(label,b.label)||Object.entries(b.substitutions).reduce((v,[from,to])=>v.split(from).join(to),label)===b.label));
  if(brand)add('DOM-002','medium',`The registrable domain label ${label} resembles ${brand.label}.`,'An edit-distance-one spelling or supported ASCII substitution can resemble a familiar brand.','Similarity is heuristic; legitimate unrelated domains can match. The catalogue covers ten illustrative brands only.');
 }
 if(hostname.includes('xn--'))add('DOM-003','informational',`Internationalised hostname: ${hostname}.`,'The Unicode and ASCII representations differ; review both domain representations.','An internationalised hostname alone is not a suspicious indicator.');
 if(u.protocol==='http:')add('URL-001','medium','The submitted link uses plain HTTP.','HTTP does not encrypt transport with HTTPS.','HTTP does not prove fraud; HTTPS does not establish merchant legitimacy.');
 if(ip)add('URL-002','informational',`The link uses the IP-literal hostname ${hostname}.`,'IP addresses have no registrable domain or public suffix.','An IP address alone is not evidence of fraud. No connection to this address was made.');
 const domainComplete=known||ip;
 const checks:Report['checks']=[
  {name:'Domain parsing',status:domainComplete?'passed':'unavailable',reason:ip?'Canonical IP literal; registrable domain does not apply.':known?'Domain boundaries identified using the bundled public and private suffix lists.':'Suffix is unknown; domain boundaries and domain coverage are unavailable.'},
  {name:'Structural rules',status:findings.some(f=>f.severity!=='informational')?'finding':'passed',reason:'Versioned structural rules evaluated locally on the server. No target requests.'},
  {name:'Redirect inspection',status:input.inspectRedirects?'unavailable':'skipped',reason:input.inspectRedirects?'Not implemented yet. The link was not visited.':'No consent to visit the link.'},
  {name:'Google Web Risk',status:input.checkReputation?'unavailable':'skipped',reason:input.checkReputation?'Not configured yet. No URL was sent to a provider.':'No consent to send the URL to a reputation provider.'},
  {name:'AI explanation',status:'skipped',reason:'Reviewed templates used; no AI request.'}
 ];
 const verdict=verdictFor(findings,false);const now=Date.now();
 return {id:randomUUID(),state:'completed',createdAt:new Date(now).toISOString(),expiresAt:new Date(now+86400000).toISOString(),verdict,coverage:'partial',inputDisplay:redact(input.url),domain,findings,checks,redirects:[],explanation:{source:'template',summary:verdict==='suspicious'?'Structural indicators warrant caution. Review the observed evidence and verify the payment request independently.':'No risk indicators were found in the available structural checks. Redirect and reputation coverage is missing, so the evidence remains insufficient.',limitations:['This report analyses URL structure only. No target website was visited.','Redirect inspection and reputation checks are unavailable at this stage.','The ten-brand catalogue and ASCII lookalike rules are illustrative and can miss or misidentify domains.','No finding or lack of findings verifies a merchant, payment or transaction.']},versions:{schema:'v1',rules:'structural-v1',brands:catalogue.version,suffix:`tldts@${suffixVersion} (bundled ICANN + private PSL)`}};
}
