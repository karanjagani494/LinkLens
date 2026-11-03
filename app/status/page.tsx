'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Circle, LoaderCircle, RefreshCw } from 'lucide-react';

type Health = { service: string; status: string; stage: string; capabilities: Record<string, boolean> };
export default function StatusPage() {
  const [state, setState] = useState<'idle'|'checking'|'online'|'offline'>('idle');
  const [database, setDatabase] = useState('not checked');
  const [health, setHealth] = useState<Health|null>(null);
  const controller = useRef<AbortController|null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function check() {
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    const timer = setTimeout(() => current.abort(), 5000);
    setState('checking'); setHealth(null); setDatabase('checking');
    try {
      const base = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:4000';
      const response = await fetch(`${base}/api/health`, { signal: current.signal, cache: 'no-store', referrerPolicy: 'no-referrer' });
      const result: Health = await response.json();
      if (!response.ok || result.service !== 'linklens-api' || result.status !== 'ok' || !result.capabilities) throw Error();
      if (controller.current !== current) return;
      const readiness = await fetch(`${base}/api/ready`, { signal: current.signal, cache: 'no-store', referrerPolicy: 'no-referrer' });
      const ready = await readiness.json();
      if (controller.current !== current) return;
      setDatabase(readiness.ok && ready.database === 'connected' ? 'connected' : 'unavailable');
      setHealth(result); setState('online');
    } catch { if (controller.current === current) setState('offline'); }
    finally { clearTimeout(timer); }
  }
  return <main className="shell" style={{maxWidth:760,paddingBlock:45}}>
    <Link href="/" className="footer-brand"><ArrowLeft size={16}/> Back to LinkLens</Link>
    <section className="panel" style={{marginTop:30,padding:30}}>
      <span className="eyebrow">BUILD PROGRESS · STEP 3</span>
      <h1 style={{fontSize:36,fontWeight:800,letterSpacing:-1,margin:'16px 0'}}>Backend connection</h1>
      <p className="muted">Check that the separate API is running. Structural analysis is available when the API and database are ready. Redirect and reputation checks are not enabled.</p>
      <button className="primary" onClick={check} disabled={state==='checking'}>{state==='checking'?<LoaderCircle size={17} className="spin"/>:<RefreshCw size={17}/>} {state==='checking'?'Checking…':'Check API connection'}</button>
      <div role="status" style={{marginTop:26}}>
        {state==='online'&&<><p><Check size={17} style={{display:'inline',marginRight:8}}/>API connected · {health?.stage}</p><p>Database: {database}. Check the capability list below for available analysis.</p></>}
        {state==='offline'&&<p className="error">API not reachable. Start it with <code>npm run dev:api</code> in a separate terminal, then retry. If it is running, check the API URL and allowed frontend origins.</p>}
        {state==='idle'&&<p className="muted">No request sent yet. No credentials needed for this step.</p>}
      </div>
      {health&&<div className="checks">{Object.entries(health.capabilities).map(([name,enabled])=><div className="check-row" key={name}><span style={{textTransform:'capitalize'}}>{name}</span><span className="status">{enabled?<Check size={12}/>:<Circle size={12}/>} {enabled?'Enabled':'Not implemented'}</span></div>)}</div>}
    </section>
  </main>;
}
