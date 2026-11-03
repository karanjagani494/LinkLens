import type {Report,Verdict} from './types';
export function verdictFor(findings:Report['findings'],complete:boolean):Verdict {return findings.some(f=>f.severity==='high'||f.severity==='medium')?'suspicious':complete?'no_indicators_found':'insufficient_evidence'}
export function captureCapability(id:string){const fragment=new URLSearchParams(location.hash.slice(1));const cap=fragment.get('capability');if(cap){sessionStorage.setItem(`linklens:cap:${id}`,cap);history.replaceState(null,'',location.pathname+location.search)}return cap||sessionStorage.getItem(`linklens:cap:${id}`)}
export function privateLink(id:string,cap:string){return `${location.origin}/report?id=${encodeURIComponent(id)}#capability=${encodeURIComponent(cap)}`}
export const statusLabel={passed:'Completed without indicator',finding:'Finding detected',skipped:'Skipped',unavailable:'Unavailable',blocked:'Blocked'};
