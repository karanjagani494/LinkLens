'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="shell empty"><h1>The workspace is unavailable.</h1><p>We could not load this page. Retry to restore the workspace.</p><button className="primary" onClick={reset}>Try again</button></main>}
