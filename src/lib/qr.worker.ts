import {BinaryBitmap,HybridBinarizer,RGBLuminanceSource,QRCodeReader} from '@zxing/library';
self.onmessage=(e:MessageEvent<{pixels:Uint8ClampedArray;width:number;height:number}>)=>{
 const {pixels,width,height}=e.data;const values=new Set<string>();const reader=new QRCodeReader();
 const decode=(x:number,y:number,w:number,h:number)=>{const gray=new Uint8ClampedArray(w*h);for(let j=0;j<h;j++)for(let i=0;i<w;i++){const o=((y+j)*width+x+i)*4;gray[j*w+i]=(pixels[o]*306+pixels[o+1]*601+pixels[o+2]*117)>>10}try{values.add(reader.decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(gray,w,h)))).getText())}catch{}finally{reader.reset()}};
 decode(0,0,width,height);
 for(const split of [2,3])for(let i=0;i<split;i++){
  const w=Math.min(width,Math.ceil(width/split*1.2)),h=Math.min(height,Math.ceil(height/split*1.2));
  decode(Math.max(0,Math.min(Math.floor(i*width/split),width-w)),0,w,height);
  decode(0,Math.max(0,Math.min(Math.floor(i*height/split),height-h)),width,h);
 }
 // Overlapping image tiles find spatially separated QR codes without uploading pixels.
 for(const split of [2,3])for(let y=0;y<split;y++)for(let x=0;x<split;x++){const w=Math.ceil(width/(split)*1.2),h=Math.ceil(height/(split)*1.2);const left=Math.min(Math.floor(x*width/split),width-w),top=Math.min(Math.floor(y*height/split),height-h);decode(Math.max(0,left),Math.max(0,top),Math.min(w,width),Math.min(h,height))}
 self.postMessage([...values]);
};
