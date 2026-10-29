'use client';
import {useEffect,useRef,useState} from 'react';
import type {GeoJSONSource,Map as MapLibreMap} from 'maplibre-gl';
import type {Feature,FeatureCollection,Polygon} from 'geojson';
import type {BuildingModel} from '@/lib/building-models/types';
import {geographicBuildingCenter} from '@/lib/building-models/types';
import {solarPosition,shadowOffset} from '@/lib/building-models/solar';
import 'maplibre-gl/dist/maplibre-gl.css';

type Properties=Record<string,string|number>;
const features=(data:BuildingModel):FeatureCollection<Polygon,Properties>=>({type:'FeatureCollection',features:data.buildings.map(b=>({type:'Feature',id:b.id,properties:{id:b.id,name:b.name,height:b.height,floors:b.floors},geometry:{type:'Polygon',coordinates:[b.ring]}}))});
function shadowFeatures(data:BuildingModel,date:string,minutes:number):FeatureCollection<Polygon,Properties>{
 const position=solarPosition(date,minutes,data.center[1],data.center[0]);const shadows:Feature<Polygon,Properties>[]=[];
 if(position&&position.elevation>0)for(const b of data.buildings){
  const offset=shadowOffset(b.height,position.azimuth,position.elevation);if(!offset)continue;
  const dx=offset.east/(111320*Math.cos(data.center[1]*Math.PI/180)),dy=offset.north/111320;
  const ring=b.ring.slice(0,-1),shifted=ring.map(p=>[p[0]+dx,p[1]+dy]);
  const add=(points:number[][])=>shadows.push({type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[...points,points[0]]]}});
  add(shifted);ring.forEach((p,i)=>{const next=(i+1)%ring.length;add([p,ring[next],shifted[next],shifted[i]]);});
 }
 return {type:'FeatureCollection',features:shadows};
}
export default function DongtanMapLibreViewer({data}:{data:BuildingModel}){
 const host=useRef<HTMLDivElement>(null),mapRef=useRef<MapLibreMap|null>(null);const [ready,setReady]=useState(false),[error,setError]=useState('');
 const [selected,setSelected]=useState(data.buildings[0].id);const [date,setDate]=useState(()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));const [minutes,setMinutes]=useState(720);
 const solar=solarPosition(date,minutes,data.center[1],data.center[0]);const building=data.buildings.find(b=>b.id===selected)!;
 useEffect(()=>{
  let disposed=false;let map:MapLibreMap|undefined;
  async function initialize(){
   const ml=await import('maplibre-gl');if(disposed||!host.current)return;
   ml.setWorkerUrl('/vendor/maplibre/maplibre-gl-worker.mjs');
   map=new ml.Map({container:host.current,style:'https://tiles.openfreemap.org/styles/positron',center:[data.center[0],data.center[1]],zoom:16.2,pitch:55,bearing:-20,attributionControl:{compact:true}});mapRef.current=map;
   map.addControl(new ml.NavigationControl({visualizePitch:true}),'top-right');
   map.on('load',()=>{if(!map||disposed)return;
    map.addSource('dongtan-shadows',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    map.addLayer({id:'dongtan-shadows',type:'fill',source:'dongtan-shadows',paint:{'fill-color':'#243b48','fill-opacity':.25}});
    map.addSource('dongtan-buildings',{type:'geojson',data:features(data)});
    map.addLayer({id:'dongtan-buildings',type:'fill-extrusion',source:'dongtan-buildings',paint:{'fill-extrusion-color':['case',['==',['get','id'],data.buildings[0].id],'#a5c9bb','#e9e8df'],'fill-extrusion-height':['get','height'],'fill-extrusion-base':0,'fill-extrusion-opacity':1}});
    map.addLayer({id:'dongtan-labels',type:'symbol',source:'dongtan-buildings',layout:{'text-field':['get','name'],'text-size':12,'text-anchor':'center','text-allow-overlap':true},paint:{'text-color':'#174b41','text-halo-color':'#ffffff','text-halo-width':2}});
    map.on('click','dongtan-buildings',e=>{const id=e.features?.[0]?.properties?.id;if(typeof id==='string')setSelected(id);});
    map.on('mouseenter','dongtan-buildings',()=>{if(map)map.getCanvas().style.cursor='pointer';});map.on('mouseleave','dongtan-buildings',()=>{if(map)map.getCanvas().style.cursor='';});
    setError('');setReady(true);
   });
   map.on('error',e=>{if(!disposed&&!map?.loaded())setError(`지도 데이터를 불러오지 못했습니다. ${e.error?.message??''}`);});
  }
  initialize().catch(()=>{if(!disposed)setError('3D 지도를 시작하지 못했습니다.');});
  return()=>{disposed=true;mapRef.current=null;map?.remove();};
 },[data]);
 useEffect(()=>{const map=mapRef.current;if(!ready||!map)return;map.setPaintProperty('dongtan-buildings','fill-extrusion-color',['case',['==',['get','id'],selected],'#85b8a5','#e9e8df']);},[ready,selected]);
 useEffect(()=>{const map=mapRef.current;if(!ready||!map)return;(map.getSource('dongtan-shadows') as GeoJSONSource).setData(shadowFeatures(data,date,minutes));},[ready,data,date,minutes]);
 const focus=()=>{const point=geographicBuildingCenter(building.ring,data.center);mapRef.current?.easeTo({center:point,zoom:18,pitch:55,duration:600});};
 return <section className="bm-viewer"><div className="bm-toolbar"><span role="status">{error||(!ready?'3D 지도 불러오는 중':'MapLibre 3D 지도 · 드래그 이동 / Shift+드래그 회전')}</span><div><button onClick={()=>mapRef.current?.easeTo({center:[data.center[0],data.center[1]],zoom:16.2,pitch:55,bearing:-20,duration:600})}>전체 보기</button><button onClick={focus}>선택 동 확대</button><button onClick={()=>mapRef.current?.easeTo({pitch:0,bearing:0,duration:500})}>위에서 보기</button><button onClick={()=>mapRef.current?.easeTo({pitch:55,duration:500})}>입체 보기</button></div></div><div className="bm-canvas" ref={host} aria-label={`${data.name} MapLibre 3D 지도`}/>
 <section className="bm-solar" aria-label="태양과 그림자 시뮬레이션"><div><strong>☀ 태양과 그림자</strong><span>참고용 · 한국 시간</span></div><div className="bm-solar-controls"><label>날짜 <input type="date" min="1901-01-01" max="2099-12-31" value={date} onChange={e=>setDate(e.target.value)}/></label><label>시간 <input type="range" min="0" max="1430" step="10" value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/><output>{String(Math.floor(minutes/60)).padStart(2,'0')}:{String(minutes%60).padStart(2,'0')}</output></label></div><p role="status">{!solar?'날짜를 선택해 주세요.':solar.elevation<=0?'태양이 지평선 아래에 있어 그림자를 표시하지 않습니다.':`태양 고도 ${solar.elevation.toFixed(1)}° · 방위 ${solar.azimuth.toFixed(0)}° (북쪽 기준 시계 방향)${solar.elevation<7?' · 긴 그림자는 최대 500m로 제한':''}`}</p><p>건축물대장 높이와 OSM 윤곽 기반의 참고용 그림자입니다. 주변 건물·지형·날씨는 반영하지 않으며 세대별 일조시간이나 법적 판단에 사용할 수 없습니다.</p></section>
 <div className="bm-legend"><span>건물 윤곽: OpenStreetMap · 높이·층수: 건축물대장</span><a href={data.licenseUrl} target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a></div><div className="bm-selection"><div className="bm-dongs" aria-label="동 선택">{data.buildings.map(b=><button key={b.id} aria-pressed={selected===b.id} onClick={()=>setSelected(b.id)}>{b.name}</button>)}</div><div className="bm-selected"><strong>{building.name}</strong><span>건축물대장 {building.floors}층 · {building.height}m</span>{building.osmFloors!==undefined&&building.osmFloors!==building.floors&&<span>OSM 등록 {building.osmFloors}층과 차이</span>}<a href={building.sourceUrl} target="_blank" rel="noreferrer">건물 윤곽 원본 ↗</a></div></div></section>;
}
