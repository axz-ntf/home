import type * as THREE from 'three';
import type {NaverLatLng,NaverMap,NaverNamespace} from '../naver-types';
import {loadNaverMaps} from '../naver-loader';
type Projection={fromCoordToOffset(p:NaverLatLng):{x:number;y:number}};
type Overlay={setMap(m:NaverMap|null):void;getProjection():Projection;onAdd():void;draw():void;onRemove():void};
type Maps=NaverNamespace['maps']&{OverlayView:new()=>Overlay;Event:NaverNamespace['maps']['Event']&{removeListener(listener:unknown):void}};
export async function attachNaverOverlay(options:{host:HTMLElement;canvas:HTMLCanvasElement;center:number[];camera:THREE.PerspectiveCamera;content:THREE.Group;render:()=>void;isDisposed:()=>boolean;onAuthError:()=>void}){
 const key=process.env.NEXT_PUBLIC_NAVER_MAPS_CLIENT_ID;
 if(!key)throw new Error('네이버 지도 키가 설정되지 않았습니다.');
 const authWindow=window as Window&{navermap_authFailure?:()=>void};
 let authRejected=false;
 const previous=authWindow.navermap_authFailure;
 const failed=()=>{authRejected=true;if(!options.isDisposed()){options.canvas.style.visibility='hidden';options.onAuthError();}previous?.();};
 authWindow.navermap_authFailure=failed;
 const restoreAuth=()=>{if(authWindow.navermap_authFailure===failed)authWindow.navermap_authFailure=previous;};
 try{await loadNaverMaps(key);}catch(error){restoreAuth();throw error;}
 if(options.isDisposed()){restoreAuth();return null;}
 const maps=window.naver!.maps as Maps;
 const container=document.createElement('div');Object.assign(container.style,{position:'absolute',inset:'0'});options.host.prepend(container);
 const center=new maps.LatLng(options.center[1],options.center[0]);
 const map=new maps.Map(container,{center,zoom:18,scaleControl:true,logoControl:true,mapDataControl:true,zoomControl:false,mapTypeControl:true,scrollWheel:false,disableDoubleClickZoom:true});
 const canvas=options.canvas;Object.assign(canvas.style,{position:'absolute',inset:'0',pointerEvents:'none',zIndex:'1'});
 let tilt=50;const perspective=1000;
 const overlay=new maps.OverlayView();
 overlay.onAdd=()=>{};overlay.onRemove=()=>{};
 overlay.draw=()=>{
  if(options.isDisposed())return;
  const projection=overlay.getProjection(),p=projection.fromCoordToOffset(center);
  const east=projection.fromCoordToOffset(new maps.LatLng(options.center[1],options.center[0]+.001));
  const scale=(east.x-p.x)/(.001*111320*Math.cos(options.center[1]*Math.PI/180));
  if(!(scale>0))return;
  const camera=options.camera,w=options.host.clientWidth,h=options.host.clientHeight;
  const angle=tilt*Math.PI/180,co=Math.cos(angle),si=Math.sin(angle);
  container.style.transform=`perspective(${perspective}px) rotateX(${tilt}deg)`;
  container.style.transformOrigin='50% 50%';
  camera.fov=2*Math.atan(h/(2*perspective))*180/Math.PI;camera.aspect=w/h;camera.position.set(0,0,perspective);camera.up.set(0,1,0);camera.lookAt(0,0,0);camera.updateProjectionMatrix();
  // Offset coordinates are relative to the map's moving overlay origin, not the viewport.
  // Subtract the current map centre in the same coordinate system to follow dragging.
  const mapCenter=(map as NaverMap&{getCenter():NaverLatLng}).getCenter();
  const centerPixel=projection.fromCoordToOffset(mapCenter);
  const dx=p.x-centerPixel.x,dy=p.y-centerPixel.y;
  // Exactly the same perspective and X rotation as the CSS map plane.
  // Building elevation is perpendicular to that plane, not a screen-space shear.
  options.content.matrix.set(scale,0,0,dx,0,scale*si,-scale*co,-dy*co,0,scale*co,scale*si,dy*si,0,0,0,1);
  options.content.matrixWorldNeedsUpdate=true;options.render();
 };
 overlay.setMap(map);
 const listeners=['center_changed','zoom_changed','bounds_changed','idle'].map(event=>maps.Event.addListener(map,event,()=>overlay.draw()));
 const zoom=(delta:number)=>{const current=map.getZoom();map.setZoom(Math.max(6,Math.min(21,current+delta)),false);overlay.draw();};
 let lastWheel=0;
 const wheel=(event:WheelEvent)=>{if(event.deltaY===0)return;event.preventDefault();event.stopPropagation();const now=Date.now();if(now-lastWheel<180)return;lastWheel=now;zoom(event.deltaY<0?1:-1);};
 options.host.addEventListener('wheel',wheel,{passive:false,capture:true});
 const observer=new ResizeObserver(()=>overlay.draw());observer.observe(options.host);overlay.draw();
 return {zoom,setTilt:(degrees:number)=>{tilt=degrees;overlay.draw();},home:()=>{map.setCenter(center);map.setZoom(18,false);overlay.draw();},focus:(point:number[])=>{map.setCenter(new maps.LatLng(point[1],point[0]));map.setZoom(19,false);overlay.draw();},dispose:()=>{restoreAuth();options.host.removeEventListener('wheel',wheel,true);observer.disconnect();if(!authRejected){listeners.forEach(l=>maps.Event.removeListener(l));overlay.setMap(null);(map as NaverMap&{destroy?:()=>void}).destroy?.();}container.remove();}};
}
