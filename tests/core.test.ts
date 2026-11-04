import {describe,it,expect,beforeEach,vi} from 'vitest';
import {validateUrl,domainOf,redact,validateImageHeader,checkPixels} from '../src/lib/validation';
import {verdictFor,captureCapability} from '../src/lib/privacy';
import {service} from '../src/lib/service';
const storage=new Map<string,string>();
beforeEach(()=>{storage.clear();vi.stubGlobal('sessionStorage',{getItem:(k:string)=>storage.get(k)||null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)});});
describe('URL policy',()=>{
 it.each(['example.com','javascript:alert(1)','https://user:pass@example.com','https://example.com/\\evil','https://localhost','https://127.1','https://2130706433','https://0x7f000001','https://a.com/\n','https://exa_mple.com'])('rejects %s',url=>expect(validateUrl(url)).not.toBeNull());
 it.each(['https://example.com/a?token=secret#fragment','http://192.168.1.1','https://[::1]/','https://例え.jp','https://a.co.uk'])('accepts analysable URL %s',url=>expect(validateUrl(url)).toBeNull());
 it('counts UTF-8 bytes',()=>expect(validateUrl('https://example.com/'+ 'é'.repeat(2100))).toMatch(/4,096/));
 it('uses public and private suffix boundaries',()=>{expect(domainOf('https://a.store.co.uk').registrableDomain).toBe('store.co.uk');expect(domainOf('https://user.github.io').registrableDomain).toBe('user.github.io');expect(domainOf('https://paypal.com.attacker.test').registrableDomain).toBe('attacker.test')});
 it('redacts every sensitive component',()=>expect(redact('https://example.test/SECRET?token=SENTINEL#PRIVATE')).toBe('https://example.test/[redacted]'));
});
describe('verdict policy',()=>{
 it('does not turn incomplete coverage into a pass',()=>expect(verdictFor([],false)).toBe('insufficient_evidence'));
 it('reports a completed no-indicator assessment',()=>expect(verdictFor([],true)).toBe('no_indicators_found'));
 it.each(['high','medium'] as const)('retains suspicious verdict with partial coverage for %s',severity=>expect(verdictFor([{id:'TEST',severity,observed:'x',why:'x',limitation:'x'}],false)).toBe('suspicious'));
 it('does not elevate informational evidence',()=>expect(verdictFor([{id:'NET-001',severity:'informational',observed:'x',why:'x',limitation:'x'}],true)).toBe('no_indicators_found'));
});
describe('QR safeguards',()=>{
 it('rejects signature spoofing and excessive size',()=>{expect(()=>validateImageHeader(new Uint8Array([60,115,118,103]),100)).toThrow(/PNG/);expect(()=>validateImageHeader(new Uint8Array([137,80,78,71]),6*1024*1024)).toThrow(/5 MB/)});
 it('rejects excessive pixel dimensions',()=>expect(()=>checkPixels(5000,5000)).toThrow(/16 megapixels/));
 it('rejects animation',()=>expect(()=>validateImageHeader(new Uint8Array([137,80,78,71,97,99,84,76]),8)).toThrow(/Animated/));
});
it('captures fragment capabilities in session storage and removes the fragment',()=>{vi.stubGlobal('location',{hash:'#capability=secret',pathname:'/report',search:'?id=abc'});const replace=vi.fn();vi.stubGlobal('history',{replaceState:replace});expect(captureCapability('abc')).toBe('secret');expect(storage.get('linklens:cap:abc')).toBe('secret');expect(replace).toHaveBeenCalledWith(null,'','/report?id=abc');});
it('mock consent, redaction and protected retrieval remain consistent',async()=>{const signal=new AbortController().signal;const receipt=await service.create({url:'https://example.test/SECRET?token=SENTINEL',inputKind:'url',inspectRedirects:false,checkReputation:false},signal);const report=await service.get(receipt.id,receipt.capability,signal);expect(report.checks.find(c=>c.name==='Redirect inspection')?.status).toBe('skipped');expect(report.checks.find(c=>c.name==='Google Safe Browsing')?.status).toBe('skipped');expect(JSON.stringify(report)).not.toMatch(/SECRET|SENTINEL/);await expect(service.get(receipt.id,'wrong',signal)).rejects.toMatchObject({code:'NOT_FOUND'});await service.delete(receipt.id,receipt.capability,signal);await expect(service.get(receipt.id,receipt.capability,signal)).rejects.toMatchObject({code:'NOT_FOUND'});});
it('aborts pending requests',async()=>{const c=new AbortController();const promise=service.create({url:'https://example.test',inputKind:'url',inspectRedirects:false,checkReputation:false},c.signal);c.abort();await expect(promise).rejects.toMatchObject({name:'AbortError'});});

it('shows Unicode alongside ASCII and keeps unknown suffix boundaries unavailable',()=>{expect(domainOf('https://xn--r8jz45g.jp').unicode).toBe('例え.jp');expect(domainOf('https://brand.unknownsuffix').registrableDomain).toBeNull()});
it('validates PNG dimensions before allocating raster pixels',async()=>{const {checkImageDimensions}=await import('../src/lib/qr');const bytes=new Uint8Array(24);bytes.set([137,80,78,71]);const v=new DataView(bytes.buffer);v.setUint32(16,100000);v.setUint32(20,100000);expect(()=>checkImageDimensions(bytes)).toThrow(/16 megapixels/)});
it('handles large valid image buffers without argument-stack overflow',()=>{const bytes=new Uint8Array(200000);bytes.set([137,80,78,71]);expect(()=>validateImageHeader(bytes,bytes.length)).not.toThrow()});
