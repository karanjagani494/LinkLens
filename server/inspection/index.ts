import Fastify from 'fastify';
import {timingSafeEqual} from 'node:crypto';
import {inspectChain} from './network';
import {validateUrl} from '../../src/lib/validation';
const token=process.env.FETCH_SERVICE_TOKEN||'';
if(process.env.ENABLE_REDIRECT_INSPECTION!=='true'||process.env.NETWORK_ISOLATION_CONFIRMED!=='true'||token.length<32)throw Error('Inspection requires explicit enablement, a private token and verified egress isolation.');
const app=Fastify({logger:false,bodyLimit:8192,requestTimeout:17000});
app.post<{Body:{url?:unknown}}>('/inspect',async(request,reply)=>{
 const provided=request.headers.authorization||'',expected=`Bearer ${token}`;
 if(Buffer.byteLength(provided)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(provided),Buffer.from(expected)))return reply.code(404).send({code:'NOT_FOUND'});
 if(typeof request.body?.url!=='string'||validateUrl(request.body.url))return reply.code(400).send({code:'INVALID_INPUT'});
 const controller=new AbortController();request.raw.once('aborted',()=>controller.abort());reply.raw.once('close',()=>{if(!reply.raw.writableFinished)controller.abort()});
 return inspectChain(request.body.url,controller.signal);
});
app.setNotFoundHandler((_request,reply)=>reply.code(404).send({code:'NOT_FOUND'}));
app.setErrorHandler((_error,_request,reply)=>reply.code(503).send({code:'INSPECTION_UNAVAILABLE'}));
app.addHook('onSend',async(_request,reply)=>{reply.header('Cache-Control','no-store');reply.header('X-Robots-Tag','noindex, nofollow')});
app.listen({host:process.env.FETCH_SERVICE_HOST||'127.0.0.1',port:Number(process.env.FETCH_SERVICE_PORT||4010)}).then(()=>console.log('Restricted inspection service started.')).catch(()=>{console.error('Restricted inspection service could not start.');process.exitCode=1});
for(const signal of ['SIGTERM','SIGINT'] as const)process.once(signal,()=>{void app.close()});
