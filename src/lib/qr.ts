import {validateImageHeader,checkPixels} from './validation';
export async function decodeQr(file:File,signal:AbortSignal):Promise<string[]> {
 if(file.size>5*1024*1024)throw Error('Choose an image no larger than 5 MB.');
 const bytes=new Uint8Array(await file.arrayBuffer());validateImageHeader(bytes,file.size);checkImageDimensions(bytes);signal.throwIfAborted();
 const blob=new Blob([bytes],{type:file.type});const bitmap=await createImageBitmap(blob);try{checkPixels(bitmap.width,bitmap.height);const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw Error('Image processing is unavailable in this browser.');context.drawImage(bitmap,0,0);const data=context.getImageData(0,0,canvas.width,canvas.height);canvas.width=canvas.height=0;
 return await new Promise((resolve,reject)=>{const worker=new Worker(new URL('./qr.worker.ts',import.meta.url));const cleanup=()=>{clearTimeout(timer);worker.terminate();signal.removeEventListener('abort',abort)};const abort=()=>{cleanup();reject(new DOMException('Aborted','AbortError'))};const timer=setTimeout(()=>{cleanup();reject(Error('QR decoding exceeded 3 seconds. Try a smaller, clearer crop.'))},3000);signal.addEventListener('abort',abort,{once:true});worker.onmessage=(e:MessageEvent<string[]>)=>{cleanup();e.data.length?resolve(e.data):reject(Error('No QR code found. Try a clear image with the entire code visible.'))};worker.onerror=()=>{cleanup();reject(Error('Could not decode this image. Try a different PNG, JPEG or WebP.'))};worker.postMessage({pixels:data.data,width:data.width,height:data.height},[data.data.buffer]);});
 } finally{bitmap.close()}
}
// Check encoded dimensions before raster allocation, then check decoded dimensions again.
export function checkImageDimensions(b:Uint8Array){
 const v=new DataView(b.buffer,b.byteOffset,b.byteLength);let w=0,h=0;
 if(b[0]===137&&b.length>=24){w=v.getUint32(16);h=v.getUint32(20)}
 else if(b[0]===255){let i=2;while(i+8<b.length){if(b[i]!==255){i++;continue}const marker=b[i+1];if(marker===0xda||marker===0xd9)break;const length=v.getUint16(i+2);if(length<2||i+2+length>b.length)break;if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){h=v.getUint16(i+5);w=v.getUint16(i+7);break}i+=2+length}}
 else if(b.length>=30){const kind=String.fromCharCode(...b.slice(12,16));if(kind==='VP8X'){w=1+b[24]+(b[25]<<8)+(b[26]<<16);h=1+b[27]+(b[28]<<8)+(b[29]<<16)}else if(kind==='VP8 '){w=v.getUint16(26,true)&0x3fff;h=v.getUint16(28,true)&0x3fff}else if(kind==='VP8L'&&b[20]===0x2f){const bits=v.getUint32(21,true);w=(bits&0x3fff)+1;h=((bits>>>14)&0x3fff)+1}}
 if(!w||!h)throw Error('The image header is invalid or its dimensions are unsupported.');checkPixels(w,h);
}
