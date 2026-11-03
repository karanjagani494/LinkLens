export type CheckStatus = 'passed'|'finding'|'skipped'|'unavailable'|'blocked';
export type ScanState = 'queued'|'running'|'completed'|'failed';
export type Verdict = 'suspicious'|'no_indicators_found'|'insufficient_evidence';
export interface ScanRequest {url:string;inputKind:'url'|'qr';inspectRedirects:boolean;checkReputation:boolean}
export interface Finding {id:string;severity:'high'|'medium'|'informational';observed:string;why:string;limitation:string}
export interface Check {name:string;status:CheckStatus;reason:string}
export interface Domain {scheme:string;hostname:string;unicode:string;subdomain:string|null;registrableDomain:string|null;publicSuffix:string|null}
export interface Report {id:string;state:ScanState;createdAt:string;expiresAt:string;verdict:Verdict|null;coverage:'complete'|'partial';inputDisplay:string;domain:Domain;findings:Finding[];checks:Check[];redirects:{url:string;status:number;outcome:string}[];explanation:{source:'template'|'ai';summary:string;limitations:string[]};versions:{schema:string;rules:string;brands:string;suffix:string}}
export interface Receipt {id:string;capability:string;state:'queued'|'completed';expiresAt:string}
export interface ScanService {create(input:ScanRequest,signal:AbortSignal,scenario?:string):Promise<Receipt>;get(id:string,capability:string,signal:AbortSignal):Promise<Report>;delete(id:string,capability:string,signal:AbortSignal):Promise<void>}
export class ServiceError extends Error {constructor(message:string,public code:string,public retryAfter?:number){super(message)}}
