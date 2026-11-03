import {beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({peer:'8.8.8.8',options:null as any,url:null as any,bodyDestroyed:false}));
vi.mock('node:https',async()=>{
 const {EventEmitter}=await import('node:events');
 return {request:vi.fn((url,options,callback)=>{
  state.options=options;state.url=url;const req=new EventEmitter() as any;req.destroyed=false;
  req.destroy=(error?:Error)=>{req.destroyed=true;if(error)req.emit('error',error);req.emit('close');return req};
  req.end=()=>{const socket=new EventEmitter() as any;socket.remoteAddress=state.peer;req.emit('socket',socket);socket.emit('connect');if(!req.destroyed)callback({statusCode:302,headers:{location:'/next?private=1'},destroy:()=>{state.bodyDestroyed=true}})};
  return req;
 })};
});
import {headersOnly,Blocked} from '../server/inspection/network';
beforeEach(()=>{state.peer='8.8.8.8';state.options=null;state.bodyDestroyed=false});
describe('pinned header transport',()=>{
 it('pins lookup to the validated IP while retaining the hostname and aborts the response body',async()=>{const result=await headersOnly(new URL('https://example.com/private?secret=1'),{address:'8.8.8.8',family:4},new AbortController().signal);expect(state.url.hostname).toBe('example.com');const callback=vi.fn();state.options.lookup('example.com',{all:false},callback);expect(callback).toHaveBeenCalledWith(null,'8.8.8.8',4);expect(state.options.agent).toBe(false);expect(state.options.maxHeaderSize).toBe(32768);expect(state.options.headers).not.toHaveProperty('Cookie');expect(state.options.headers).not.toHaveProperty('Authorization');expect(state.bodyDestroyed).toBe(true);expect(result.status).toBe(302)});
 it('rejects a socket peer that differs from the validated address',async()=>{state.peer='127.0.0.1';await expect(headersOnly(new URL('https://example.com'),{address:'8.8.8.8',family:4},new AbortController().signal)).rejects.toBeInstanceOf(Blocked);expect(state.bodyDestroyed).toBe(false)});
});
