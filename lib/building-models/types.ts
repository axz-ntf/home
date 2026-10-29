export type BuildingModel = {id:string;name:string;address:string;noticeId:string;fetchedAt:string;dataTimestamp:string;center:number[];source:string;license:string;licenseUrl:string;addressEvidence:string;heightReference?:string;heightReferenceUrl?:string;buildings:{id:string;name:string;floors:number;osmFloors?:number;height:number;heightSource:string;heightVerifiedAt?:string;ring:number[][];sourceUrl:string}[]};
export function localPoint(point:number[],center:number[]):[number,number]{
 return [(point[0]-center[0])*111320*Math.cos(center[1]*Math.PI/180),(point[1]-center[1])*111320];
}

/** Polygon area centroid in local metres; handles either winding and an optional closed ring. */
export function buildingCenter(ring:number[][],center:number[]):[number,number]{
 const points=ring.map(point=>localPoint(point,center));
 if(points.length===0)return [0,0];
 let area=0,x=0,north=0;
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[(i+1)%points.length],cross=a[0]*b[1]-b[0]*a[1];
  area+=cross;x+=(a[0]+b[0])*cross;north+=(a[1]+b[1])*cross;
 }
 if(Math.abs(area)<1e-8)return [points.reduce((sum,p)=>sum+p[0],0)/points.length,points.reduce((sum,p)=>sum+p[1],0)/points.length];
 return [x/(3*area),north/(3*area)];
}
export function geographicBuildingCenter(ring:number[][],center:number[]):[number,number]{
 const [east,north]=buildingCenter(ring,center);
 return [center[0]+east/(111320*Math.cos(center[1]*Math.PI/180)),center[1]+north/111320];
}
