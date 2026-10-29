'use client';
import {useEffect,useRef,useState} from 'react';
import type {Map as MapLibreMap} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {DdsIcon} from '@/components/dds-icon';
export type HousingMapPoint={lat:number;lng:number;label:string;status:string};
export default function HousingLocationMap({points,total,hasHeight=false,hasModel=false}:{points:HousingMapPoint[];total:number;hasHeight?:boolean;hasModel?:boolean}){
 const host=useRef<HTMLDivElement>(null),[open,setOpen]=useState(false),[status,setStatus]=useState('지도 준비 중');
 useEffect(()=>{
  if(!open||!points.length)return;let disposed=false;let map:MapLibreMap|undefined;
  async function init(){const ml=await import('maplibre-gl');if(disposed||!host.current)return;ml.setWorkerUrl('/vendor/maplibre/maplibre-gl-worker.mjs');
   map=new ml.Map({container:host.current,style:'https://tiles.openfreemap.org/styles/positron',center:[points[0].lng,points[0].lat],zoom:14,attributionControl:{compact:true}});
   map.addControl(new ml.NavigationControl(),'top-right');
   map.on('load',()=>{if(disposed||!map)return;const bounds=new ml.LngLatBounds();
    for(const point of points){const node=document.createElement('div');node.className='housing-map-marker';node.setAttribute('aria-label',`${point.label} ${point.status}`);
     const popupNode=document.createElement('div');const title=document.createElement('strong');title.textContent=point.label;const detail=document.createElement('p');detail.textContent=point.status;popupNode.append(title,detail);
     new ml.Marker({element:node}).setLngLat([point.lng,point.lat]).setPopup(new ml.Popup({offset:16}).setDOMContent(popupNode)).addTo(map);bounds.extend([point.lng,point.lat]);}
    if(points.length>1)map.fitBounds(bounds,{padding:55,maxZoom:15,duration:0});setStatus('위치 표시 완료');
   });
   map.on('error',()=>{if(!disposed&&!map?.loaded())setStatus('지도 연결을 확인해 주세요.');});
  }
  init().catch(()=>{if(!disposed)setStatus('지도를 시작하지 못했습니다.');});
  return()=>{disposed=true;map?.remove();};
 },[open,points]);
 return <section className="hd-panel hd-section" id="housing-map"><div className="hd-location-header"><div><h2>지도 · 건물 정보</h2><p>수집된 주소와 좌표를 지도에서 확인합니다.</p></div><span className="hd-data-badge"><DdsIcon name="location-arrow" size={14}/> 좌표 {total.toLocaleString()}곳</span></div>{!points.length?<div className="hd-map-empty"><DdsIcon name="map" size={20}/><div><strong>표시할 좌표가 없습니다</strong><p>좌표가 확인되면 지도에서 위치를 볼 수 있습니다.</p></div></div>:<><div className="hd-location-info"><DdsIcon name="info" size={16}/><p>{total>points.length?`${total.toLocaleString()}곳 중 ${points.length}곳을 표시합니다. `:''}{hasModel?'일부 동의 참고용 3D를 확인할 수 있습니다.':hasHeight?'건물 높이를 확인했으며, 동별 윤곽을 확인하면 3D를 표시할 수 있습니다.':'건물 윤곽과 높이가 확인되면 3D를 표시할 수 있습니다.'}</p></div><button type="button" className="a-btn secondary hd-map-action" aria-expanded={open} onClick={()=>setOpen(!open)}><DdsIcon name={open?'chevron-up':'map'} size={16}/>{open?'지도 닫기':'지도 열기'}</button>{open&&<><p className="hd-map-status" role="status">{status}</p><div ref={host} className="housing-location-map" aria-label="공급주택 위치 지도"/></>}</>}</section>;
}
