/** Reference reconstruction, not surveyed facade/roof dimensions. Coordinates are local metres. */
export function insideRing(x:number,y:number,ring:number[][]):boolean {
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
  const a=ring[i],b=ring[j];
  if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }
 return inside;
}
export function roofCores(ring:number[][]):{x:number;y:number;angle:number}[] {
 const edges=ring.map((a,i)=>{const b=ring[(i+1)%ring.length];return {a,b,length:Math.hypot(b[0]-a[0],b[1]-a[1])};}).sort((a,b)=>b.length-a.length);
 const angle=Math.atan2(edges[0].b[1]-edges[0].a[1],edges[0].b[0]-edges[0].a[0]);
 const co=Math.cos(angle),si=Math.sin(angle);const result:{x:number;y:number;angle:number}[]=[];
 for(let x=Math.min(...ring.map(p=>p[0]))+3;x<Math.max(...ring.map(p=>p[0]));x+=2){
  for(let y=Math.min(...ring.map(p=>p[1]))+3;y<Math.max(...ring.map(p=>p[1]));y+=2){
   if(result.length>=3)return result;
   if(result.some(p=>Math.hypot(p.x-x,p.y-y)<16))continue;
   if([[-3,-2.5],[3,-2.5],[3,2.5],[-3,2.5],[0,0]].every(([u,v])=>insideRing(x+u*co-v*si,y+u*si+v*co,ring)))result.push({x,y,angle});
  }
 }
 return result;
}
