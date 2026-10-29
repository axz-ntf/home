// NOAA fractional-year approximation; input time is Korea Standard Time (UTC+9).
// Azimuth is clockwise from north, elevation is geometric (no refraction).
export function solarPosition(date:string,minutes:number,latitude:number,longitude:number){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(minutes)||minutes<0||minutes>=1440)return null;
 const [y,m,d]=date.split('-').map(Number),stamp=Date.UTC(y,m-1,d),day=new Date(stamp);
 if(day.getUTCFullYear()!==y||day.getUTCMonth()!==m-1||day.getUTCDate()!==d||y<1901||y>2099)return null;
 const n=Math.floor((stamp-Date.UTC(y,0,1))/86400000)+1,days=(y%4===0&&(y%100!==0||y%400===0))?366:365;
 const g=2*Math.PI/days*(n-1+(minutes/60-12)/24);
 const eq=229.18*(.000075+.001868*Math.cos(g)-.032077*Math.sin(g)-.014615*Math.cos(2*g)-.040849*Math.sin(2*g));
 const dec=.006918-.399912*Math.cos(g)+.070257*Math.sin(g)-.006758*Math.cos(2*g)+.000907*Math.sin(2*g)-.002697*Math.cos(3*g)+.00148*Math.sin(3*g);
 const hour=(minutes+eq+4*longitude-540)/4-180,ha=hour*Math.PI/180,lat=latitude*Math.PI/180;
 const up=Math.sin(lat)*Math.sin(dec)+Math.cos(lat)*Math.cos(dec)*Math.cos(ha);
 const east=-Math.cos(dec)*Math.sin(ha),north=Math.cos(lat)*Math.sin(dec)-Math.sin(lat)*Math.cos(dec)*Math.cos(ha);
 return {elevation:Math.asin(Math.max(-1,Math.min(1,up)))*180/Math.PI,azimuth:(Math.atan2(east,north)*180/Math.PI+360)%360};
}
export function shadowOffset(height:number,azimuth:number,elevation:number){
 if(elevation<=0)return null;
 const length=height/Math.tan(elevation*Math.PI/180),bounded=Math.min(length,500),a=azimuth*Math.PI/180;
 return {east:-Math.sin(a)*bounded,north:-Math.cos(a)*bounded,truncated:length>bounded};
}
