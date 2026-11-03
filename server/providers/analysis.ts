import {redact,validateUrl} from '../../src/lib/validation';
import type {Report,ScanRequest} from '../../src/lib/types';
import {verdictFor} from '../../src/lib/privacy';
import {analyse} from '../analysis/analyse';
export const reputationEnabled=()=>process.env.ENABLE_REPUTATION==='true'&&!!process.env.GOOGLE_WEB_RISK_API_KEY;
export const inspectionEnabled=()=>process.env.ENABLE_REDIRECT_INSPECTION==='true'&&process.env.NETWORK_ISOLATION_CONFIRMED==='true'&&!!process.env.FETCH_SERVICE_TOKEN;
type ProviderFetch=typeof fetch;
const categories=['MALWARE','SOCIAL_ENGINEERING','UNWANTED_SOFTWARE'];
export async function reputation(url:string,signal:AbortSignal,request:ProviderFetch=fetch):Promise<string[]>{
 const endpoint=new URL('https://webrisk.googleapis.com/v1/uris:search');
 for(const threat of categories)endpoint.searchParams.append('threatTypes',threat);
 const target=new URL(url);target.hash='';endpoint.searchParams.set('uri',target.href);
 const response=await request(endpoint,{signal,headers:{'X-Goog-Api-Key':process.env.GOOGLE_WEB_RISK_API_KEY||''},redirect:'error',cache:'no-store'});
 if(!response.ok)throw Error('REPUTATION_UNAVAILABLE');
 // Bound data from a fixed provider; never log provider bodies or request URLs.
 const reader=response.body?.getReader();if(!reader)throw Error('REPUTATION_UNAVAILABLE');let text='',size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16384)throw Error('REPUTATION_UNAVAILABLE');text+=new TextDecoder().decode(value,{stream:true})}}finally{await reader.cancel().catch(()=>{})}
 const data=JSON.parse(text);if(!data||typeof data!=='object'||Array.isArray(data))throw Error('REPUTATION_UNAVAILABLE');
 if(Object.keys(data).length===0)return [];
 if(!data.threat||!Array.isArray(data.threat.threatTypes)||data.threat.threatTypes.length===0||data.threat.threatTypes.some((c:unknown)=>typeof c!=='string'||!categories.includes(c)))throw Error('REPUTATION_UNAVAILABLE');
 return [...new Set<string>(data.threat.threatTypes)];
}
export interface Inspection { redirects:Report['redirects']; urls:string[]; status:'passed'|'blocked'|'unavailable'; reason:string }
export async function inspect(url:string,signal:AbortSignal,request:ProviderFetch=fetch):Promise<Inspection>{
 const base=new URL(process.env.FETCH_SERVICE_URL||'http://127.0.0.1:4010');
 if(!['http:','https:'].includes(base.protocol)||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw Error('INSPECTION_UNAVAILABLE');
 const response=await request(new URL('/inspect',base),{method:'POST',signal,headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.FETCH_SERVICE_TOKEN}`},body:JSON.stringify({url}),redirect:'error'});
 if(!response.ok)throw Error('INSPECTION_UNAVAILABLE');
 const reader=response.body?.getReader();if(!reader)throw Error('INSPECTION_UNAVAILABLE');let text='',size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536)throw Error('INSPECTION_UNAVAILABLE');text+=new TextDecoder().decode(value,{stream:true})}}finally{await reader.cancel().catch(()=>{})}
 const data=JSON.parse(text) as Inspection;
 if(!data||!Array.isArray(data.redirects)||data.redirects.length>6||!Array.isArray(data.urls)||data.urls.length>6||!['passed','blocked','unavailable'].includes(data.status))throw Error('INSPECTION_UNAVAILABLE');
 if(data.urls.some(value=>typeof value!=='string'||!!validateUrl(value))||typeof data.reason!=='string'||data.reason.length>512)throw Error('INSPECTION_UNAVAILABLE');
 if(data.status==='passed'&&(!data.urls.length||data.urls.length!==data.redirects.length))throw Error('INSPECTION_UNAVAILABLE');
 data.redirects=data.redirects.map(hop=>{if(!hop||typeof hop.url!=='string'||validateUrl(hop.url)||!Number.isInteger(hop.status)||hop.status<100||hop.status>599||typeof hop.outcome!=='string'||hop.outcome.length>200)throw Error('INSPECTION_UNAVAILABLE');return {...hop,url:redact(hop.url)}});
 return data;
}
export async function completeAnalysis(input:ScanRequest,signal:AbortSignal,dependencies:{reputation?:typeof reputation;inspect?:typeof inspect}={}):Promise<Report>{
 const report=analyse(input);const find=(name:string)=>report.checks.find(c=>c.name===name)!;let targets=[input.url];
 if(input.inspectRedirects&&inspectionEnabled()){
  const check=find('Redirect inspection');
  try{
   const result=await (dependencies.inspect||inspect)(input.url,AbortSignal.any([signal,AbortSignal.timeout(16000)]));
   report.redirects=result.redirects;targets=[...new Set([input.url,...result.urls].map(value=>{const u=new URL(value);u.hash='';return u.href}))].slice(0,6);check.status=result.status;check.reason=result.reason;
   // Re-evaluate every observed destination; only redacted evidence persists.
   for(const url of targets){const hop=analyse({...input,url});if(hop.checks[0].status==='unavailable'){report.checks[0].status='unavailable';report.checks[0].reason='An observed destination has an unknown public suffix; domain coverage is incomplete.'}for(const f of hop.findings){if(!report.findings.some(v=>v.id===f.id&&v.observed===f.observed))report.findings.push(f)}}
   if(targets.some(url=>analyse({...input,url}).domain.registrableDomain!==report.domain.registrableDomain))report.findings.push({id:'RED-001',severity:'informational',observed:'Observed redirects cross a registrable-domain boundary.',why:'The destination domain differs from the submitted domain.',limitation:'Cross-domain redirects are common legitimate behaviour and are not independently suspicious.'});
   if(result.status==='blocked')report.findings.push({id:'NET-001',severity:'informational',observed:'Inspection blocked by the network safety policy.',why:'Connections to internal or unsupported destinations are blocked.',limitation:'A network policy block is not evidence of fraud.'});
  }catch{check.status='unavailable';check.reason='Network inspection did not complete within its limits.'}
 }
 if(input.checkReputation&&reputationEnabled()){
  const check=find('Google Web Risk');check.status='passed';check.reason='No match returned by Google Web Risk for every observed destination. This is not a guarantee.';
  const deadline=AbortSignal.any([signal,AbortSignal.timeout(3000)]);
  try{for(const target of targets.slice(0,6)){const matches=await (dependencies.reputation||reputation)(target,deadline);if(matches.length){check.status='finding';check.reason='Google Web Risk returned a threat-list match.';report.findings.push({id:'REP-001',severity:'high',observed:`Google Web Risk returned ${matches.join(', ')} for ${redact(target)}.`,why:'The provider lists an observed URL under these threat categories.',limitation:'A list match is a provider observation, not proof of merchant identity or guaranteed fraud.'})}}}
  catch{check.status='unavailable';check.reason='Google Web Risk was unavailable, timed out, or returned an invalid response. Any earlier match remains in the findings.'}
 }
 report.findings=report.findings.filter((finding,index,all)=>all.findIndex(other=>other.id===finding.id&&other.observed===finding.observed)===index);
 if(report.findings.some(f=>f.id!=='REP-001'&&['high','medium'].includes(f.severity)))find('Structural rules').status='finding';
 const structural=report.checks.slice(0,2).every(c=>['passed','finding'].includes(c.status));
 const coverage=structural&&['passed','finding'].includes(find('Redirect inspection').status)&&['passed','finding'].includes(find('Google Web Risk').status);
 report.coverage=coverage?'complete':'partial';report.verdict=verdictFor(report.findings,coverage);
 report.explanation.summary=report.verdict==='suspicious'?'Observed indicators warrant caution. Review the evidence and verify the payment request independently.':report.verdict==='no_indicators_found'?'The available checks completed without a risk indicator. This does not establish merchant or payment legitimacy.':'Some checks were skipped or unavailable. The available evidence is insufficient for a complete assessment.';
 report.explanation.limitations=["This MVP's coverage is limited and does not verify merchants, payments or transactions.",'Only HTTP headers are inspected when explicitly requested; no page content or JavaScript is analysed.','Reputation lists can miss new threats; structural similarity can flag unrelated legitimate domains.','Findings use deterministic rules and template explanations. AI is disabled.'];
 return report;
}
