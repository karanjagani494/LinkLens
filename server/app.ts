import type {JobRuntime} from './jobs/runtime';
import {LimitError,LocalAdmission} from './jobs/admission';
import {reputationEnabled,inspectionEnabled,completeAnalysis} from './providers/analysis';
import {analyse,validateRequest} from './analysis/analyse';
import type { ReportStore } from './db/reports';
import Fastify from 'fastify';
import cors from '@fastify/cors';

export interface ApiOptions { frontendOrigins?: string[]; store?: ReportStore; jobs?: JobRuntime }

export function buildApi(options: ApiOptions = {}) {
  const localAdmission=new LocalAdmission();
  const app = Fastify({ trustProxy:process.env.TRUST_PROXY_CIDRS?.split(',').map(s=>s.trim()).filter(Boolean)||false, logger: false, bodyLimit: 8192, requestTimeout: 10_000 });
  const origins = options.frontendOrigins ?? ['http://127.0.0.1:3000', 'http://localhost:3000'];

  app.register(cors, {
    origin: origins,
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
  });

  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Robots-Tag', 'noindex, nofollow');
    reply.header('Referrer-Policy', 'no-referrer');
  });

  app.get('/api/health', async () => ({
    service: 'linklens-api',
    status: 'ok',
    version: 'v1',
    stage: options.jobs ? 'queued-analysis' : options.store ? 'structural-analysis' : 'foundation',
    capabilities: { scans: !!options.store, redirects: inspectionEnabled() && !!options.jobs, reputation: reputationEnabled(), ai: false },
  }));

  app.get('/api/ready', async (_request, reply) => {
    if (!options.store) return reply.code(503).send({status:'unavailable',database:'not_configured'});
    try { await options.store.ready(); } catch { return reply.code(503).send({status:'unavailable',database:'unavailable',queue:'not_checked',scans:false}); }
    try { await options.jobs?.ready(); } catch { return reply.code(503).send({status:'unavailable',database:'connected',queue:'unavailable',scans:false}); }
    return {status:'ready',database:'connected',queue:options.jobs?'connected':'not_configured',scans:true};
  });

  // Never accept scans until persistence, capability access and processing exist.
  const unavailable = async (_request: unknown, reply: import('fastify').FastifyReply) =>
    reply.code(503).send({ code: 'NOT_READY', message: 'Real scanning is not available yet. The API foundation is running.' });
  app.post('/api/scans', async (request, reply) => {
    if (!options.store) return unavailable(request, reply);
    if (!validateRequest(request.body)) return reply.code(400).send({code:'INVALID_INPUT',message:'Provide a valid explicit HTTP(S) URL, input kind and two boolean consent options.'});
    if (options.jobs) {
      try { return reply.code(202).send(await options.jobs.submit(request.body,request.ip)); }
      catch(error) {
        if (error instanceof LimitError) return reply.header('Retry-After',String(error.retryAfter)).code(429).send({code:'RATE_LIMIT',message:error.message});
        return reply.code(503).send({code:'QUEUE_UNAVAILABLE',message:'The scan queue is unavailable. Try again later.'});
      }
    }
    // Local development may run without Redis. Public mode requires the queue.
    if (process.env.NODE_ENV==='production') return reply.code(503).send({code:'QUEUE_REQUIRED',message:'Scan processing is unavailable.'});
    if (request.body.inspectRedirects) return reply.code(400).send({code:'INSPECTION_UNAVAILABLE',message:'Redirect inspection requires the queue and isolated service.'});
    let release:()=>void;
    try { release=localAdmission.reserve(request.ip); } catch(error) { if(error instanceof LimitError)return reply.header('Retry-After',String(error.retryAfter)).code(429).send({code:'RATE_LIMIT',message:error.message});throw error; }
    try {
      const report = await completeAnalysis(request.body,AbortSignal.timeout(30000));
      const receipt = await options.store.create(report);
      return reply.code(201).send({...receipt,state:'completed'});
    } catch {
      return reply.code(503).send({code:'STORAGE_UNAVAILABLE',message:'Report storage is unavailable. No scan was accepted.'});
    } finally { release(); }
  });
  const missing = {code:'NOT_FOUND',message:'Report unavailable, deleted, expired, or missing access.'};
  const capability = (header: string | undefined) => /^Bearer ([a-f0-9]{64})$/i.exec(header || '')?.[1] || '';
  app.get<{Params:{id:string}}>('/api/scans/:id', async (request, reply) => {
    if (!options.store) return unavailable(request, reply);
    const report = await options.store.get(request.params.id, capability(request.headers.authorization));
    return report || reply.code(404).send(missing);
  });
  app.delete<{Params:{id:string}}>('/api/scans/:id', async (request, reply) => {
    if (!options.store) return unavailable(request, reply);
    if (!await options.store.delete(request.params.id, capability(request.headers.authorization))) return reply.code(404).send(missing);
    await options.jobs?.cancel(request.params.id);
    return reply.code(204).send();
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ code: 'NOT_FOUND', message: 'Endpoint not found.' });
  });
  app.setErrorHandler((error, _request, reply) => {
    const code = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : undefined;
    const status = code === 413 ? 413 : code === 400 ? 400 : 500;
    reply.code(status).send({
      code: status === 413 ? 'BODY_TOO_LARGE' : status === 400 ? 'BAD_REQUEST' : 'INTERNAL_ERROR',
      message: status === 413 ? 'Request body exceeds 8 KB.' : status === 400 ? 'Invalid request.' : 'The service could not complete the request.',
    });
  });
  return app;
}
