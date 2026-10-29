'use client';
import {useEffect,useRef,useState} from 'react';
import type {BuildingModel} from '@/lib/building-models/types';
import {attachNaverOverlay} from '@/lib/building-models/naver-overlay';
import {insideRing,roofCores} from '@/lib/building-models/exterior';
import {solarPosition,shadowOffset} from '@/lib/building-models/solar';
import {localPoint,buildingCenter,geographicBuildingCenter} from '@/lib/building-models/types';
export default function BuildingModelViewer({data}:{data:BuildingModel}){
 const [mode,setMode]=useState<'map'|'orbit'>('map');
 return <><div className="bm-mode"><button aria-pressed={mode==='map'} onClick={()=>setMode('map')}>네이버 지도 위에서 보기</button><button aria-pressed={mode==='orbit'} onClick={()=>setMode('orbit')}>모형 자유 회전</button></div><ModelScene key={mode} data={data} mapMode={mode==='map'}/></>;
}
function ModelScene({data,mapMode}:{data:BuildingModel;mapMode:boolean}){
 const mount=useRef<HTMLDivElement>(null);const command=useRef<(action:string,id?:string)=>void>(()=>{});
 const [mapError,setMapError]=useState(false);const [mapStatus,setMapStatus]=useState(mapMode?'네이버 지도 불러오는 중':'지도 없는 모형 보기');
 const [date,setDate]=useState(()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));const [minutes,setMinutes]=useState(720);
 const solar=solarPosition(date,minutes,data.center[1],data.center[0]);
 const [detail,setDetail]=useState(false);const [selected,setSelected]=useState(data.buildings[0].id);const [status,setStatus]=useState('3D 화면 준비 중');
 const building=data.buildings.find(b=>b.id===selected)!;
 useEffect(()=>{
  let disposed=false;let cleanup=()=>{};let naver:Awaited<ReturnType<typeof attachNaverOverlay>>=null;
  async function init(){
   const [T,{OrbitControls}]=await Promise.all([import('three'),import('three/examples/jsm/controls/OrbitControls.js')]);
   if(disposed||!mount.current)return;const host=mount.current;
   const renderer=new T.WebGLRenderer({antialias:true,alpha:mapMode});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;host.appendChild(renderer.domElement);
   renderer.domElement.setAttribute('aria-label',mapMode?'네이버 지도 위 재구성 건물. 동 선택은 아래 버튼으로 가능합니다.':'실제 건물 윤곽 기반 단지 3D. 드래그로 회전, 휠로 확대. 동 선택은 아래 버튼으로도 가능합니다.');renderer.domElement.setAttribute('role','img');
   const scene=new T.Scene();scene.background=mapMode?null:new T.Color('#e8edf0');const content=new T.Group();scene.add(content);if(mapMode){content.matrixAutoUpdate=false;}
   const camera=new T.PerspectiveCamera(38,1,1,3000);camera.position.set(280,230,320);
   const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,22,0);controls.minDistance=100;controls.maxDistance=1200;controls.maxPolarAngle=Math.PI/2.08;controls.update();controls.enabled=!mapMode;
   scene.add(new T.HemisphereLight(0xf0f7ff,0x879385,2.4));const sun=new T.DirectionalLight(0xfff3dc,3.2);sun.position.set(-180,300,180);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-400,right:400,top:400,bottom:-400,near:1,far:1000});sun.shadow.bias=-0.0003;scene.add(sun);
   const ground=new T.Mesh(new T.PlaneGeometry(3000,3000),new T.MeshStandardMaterial({color:'#d7dfd5',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.1;ground.receiveShadow=true;if(!mapMode)scene.add(ground);else{ground.geometry.dispose();ground.material.dispose();}
   const shadowGroup=new T.Group();content.add(shadowGroup);
   const shadowMaterial=new T.MeshBasicMaterial({color:'#354553',transparent:true,opacity:.22,depthWrite:false,side:T.DoubleSide});
   const clearShadows=()=>{for(const child of [...shadowGroup.children]){shadowGroup.remove(child);(child as import('three').Mesh).geometry.dispose();}};
   const updateSolar=(dateTime:string)=>{
    const [day,minuteText]=dateTime.split('|');const position=solarPosition(day,Number(minuteText),data.center[1],data.center[0]);clearShadows();
    if(!position||position.elevation<=0){sun.intensity=0;return;}
    sun.intensity=3.2;
    const az=position.azimuth*Math.PI/180,el=position.elevation*Math.PI/180;
    sun.position.set(400*Math.cos(el)*Math.sin(az),400*Math.sin(el),-400*Math.cos(el)*Math.cos(az));
    for(const building of data.buildings){
     const shift=shadowOffset(building.height,position.azimuth,position.elevation);if(!shift)continue;
     const pts=building.ring.slice(0,-1).map(p=>localPoint(p,data.center));
     const projected=pts.map(([x,n])=>new T.Vector2(x+shift.east,n+shift.north));
     const triangles=T.ShapeUtils.triangulateShape(projected,[]),vertices:number[]=[];
     for(const triangle of triangles)for(const i of triangle){const p=projected[i];vertices.push(p.x,.08,-p.y);}
     for(let i=0;i<pts.length;i++){
      const a=pts[i],b=pts[(i+1)%pts.length],c=[b[0]+shift.east,b[1]+shift.north],d=[a[0]+shift.east,a[1]+shift.north];
      for(const p of [a,b,c,a,c,d])vertices.push(p[0],.08,-p[1]);
     }
     const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();shadowGroup.add(new T.Mesh(geometry,shadowMaterial));
    }
   };
   const details=new T.Group();details.visible=false;content.add(details);
   const textures:import('three').Texture[]=[];const groups=new Map<string,import('three').Mesh>();const pickables:import('three').Mesh[]=[];
   for(const b of data.buildings){
    const pts=b.ring.slice(0,-1).map(p=>localPoint(p,data.center));const shape=new T.Shape(pts.map(p=>new T.Vector2(...p)));
    const geometry=new T.ExtrudeGeometry(shape,{depth:b.height,bevelEnabled:false});geometry.rotateX(-Math.PI/2);
    const body=new T.Mesh(geometry,[new T.MeshStandardMaterial({color:'#e4e4de',roughness:.9}),new T.MeshStandardMaterial({color:'#d1d1ca',roughness:.85})]);body.castShadow=true;body.receiveShadow=true;body.userData.id=b.id;content.add(body);groups.set(b.id,body);pickables.push(body);
    const trim=new T.MeshStandardMaterial({color:'#efeee6',roughness:.8});
    const blue=new T.MeshStandardMaterial({color:'#536d7c',roughness:.7});
    const ochre=new T.MeshStandardMaterial({color:'#c6aa70',roughness:.85});
    const box=(w:number,h:number,d:number,x:number,y:number,z:number,angle:number,mat:import('three').Material)=>{
     const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);mesh.rotation.y=angle;mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.id=b.id;details.add(mesh);pickables.push(mesh);return mesh;
    };
    const windows:{x:number;y:number;z:number;angle:number}[]=[];
    for(let i=0;i<pts.length;i++){
     const a=pts[i],n=pts[(i+1)%pts.length];const dx=n[0]-a[0],dy=n[1]-a[1],len=Math.hypot(dx,dy);if(len<.5)continue;
     const angle=Math.atan2(dy,dx),mx=(a[0]+n[0])/2,my=(a[1]+n[1])/2;
     const sign=insideRing(mx-dy/len*.2,my+dx/len*.2,pts)?-1:1;
     const nx=-dy/len*sign,ny=dx/len*sign;
     box(len,.9,.3,mx,b.height+.45,-my,angle,trim);
     box(len,6,.12,mx+nx*.07,3,-my-ny*.07,angle,blue);
     // Windows are an inferred repeating module; short return walls remain solid.
     if(len<5)continue;
     const count=Math.floor(len/3.5);
     for(let col=0;col<count;col++){
      const t=(col+.5)/count;const x=a[0]+dx*t+nx*.18,y=a[1]+dy*t+ny*.18;
      for(let floor=0;floor<b.floors;floor++)windows.push({x,y:floor*(b.height/b.floors)+(b.height/b.floors)*.53,z:-y,angle});
     }
    }
    const frame=new T.InstancedMesh(new T.BoxGeometry(2.2,2.35,.28),trim,windows.length);
    const glass=new T.InstancedMesh(new T.BoxGeometry(1.85,1.95,.3),new T.MeshStandardMaterial({color:'#68818b',metalness:.25,roughness:.32}),windows.length);
    const divider=new T.InstancedMesh(new T.BoxGeometry(.07,1.95,.34),trim,windows.length);
    const transform=new T.Object3D();windows.forEach((w,i)=>{transform.position.set(w.x,w.y,w.z);transform.rotation.y=w.angle;transform.updateMatrix();frame.setMatrixAt(i,transform.matrix);glass.setMatrixAt(i,transform.matrix);divider.setMatrixAt(i,transform.matrix);});
    for(const mesh of [frame,glass,divider]){mesh.userData.id=b.id;mesh.castShadow=true;mesh.receiveShadow=true;details.add(mesh);pickables.push(mesh);}
    for(const core of roofCores(pts)){
     box(6,3.8,5,core.x,b.height+1.9,-core.y,core.angle,ochre);
     box(6.6,.45,5.6,core.x,b.height+4,-core.y,core.angle,trim);
     box(3.5,.6,3,core.x,b.height+4.5,-core.y,core.angle,blue);
    }
    const label=document.createElement('canvas');label.width=256;label.height=80;const lc=label.getContext('2d')!;lc.fillStyle='#143c3b';lc.roundRect(4,4,248,72,18);lc.fill();lc.fillStyle='white';lc.font='bold 36px sans-serif';lc.textAlign='center';lc.fillText(b.name,128,53);
    const lt=new T.CanvasTexture(label);textures.push(lt);const sprite=new T.Sprite(new T.SpriteMaterial({map:lt,depthTest:false,sizeAttenuation:false}));sprite.scale.set(mapMode?.025:.085,mapMode?.0078125:.0265625,1);const [cx,cn]=buildingCenter(b.ring,data.center);sprite.position.set(cx,b.height+9,-cn);content.add(sprite);
   }
   const mapCamera=new T.PerspectiveCamera(38,1,1,10000);mapCamera.position.set(0,0,1000);
   const render=()=>renderer.render(scene,mapMode?mapCamera:camera);
   command.current=(action,id)=>{if(action==='solar'&&id){updateSolar(id);}else if(mapMode&&action==='zoomIn'){naver?.zoom(1);}else if(mapMode&&action==='zoomOut'){naver?.zoom(-1);}else if(mapMode&&action==='reset'){naver?.home();}else if(mapMode&&action==='focus'){const b=data.buildings.find(b=>b.id===id);if(b)naver?.focus(geographicBuildingCenter(b.ring,data.center));}else if(mapMode&&action==='top'){naver?.setTilt(0);}else if(mapMode&&action==='oblique'){naver?.setTilt(50);}else if(action==='detail'){details.visible=!details.visible;setDetail(details.visible);}else if(action==='select'){for(const [key,mesh] of groups){const mats=mesh.material as import('three').MeshStandardMaterial[];mats[0].color.set(key===id?'#bfd1c7':'#e4e4de');}setSelected(id!);}else if(action==='focus'){const b=data.buildings.find(b=>b.id===id);if(b){const [x,north]=buildingCenter(b.ring,data.center);const z=-north;controls.target.set(x,b.height/2,z);camera.position.set(x+100,b.height+50,z+130);}}else if(action==='top'){camera.position.set(0,650,.1);controls.target.set(0,0,0);}else if(action==='reset'){camera.position.set(280,230,320);controls.target.set(0,22,0);}else if(action==='light'){sun.position.x=-sun.position.x;}controls.update();render();};
   const resize=()=>{const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();render();};const observer=new ResizeObserver(resize);observer.observe(host);controls.addEventListener('change',render);
   let down=[0,0];const pointerDown=(e:PointerEvent)=>{down=[e.clientX,e.clientY];};const pointerUp=(e:PointerEvent)=>{if(Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const rect=renderer.domElement.getBoundingClientRect();const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);const hit=ray.intersectObjects(pickables.filter(m=>m.parent!==details||details.visible))[0];if(hit)command.current('select',hit.object.userData.id);};renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointerup',pointerUp);
   command.current('select',data.buildings[0].id);command.current('solar',`${date}|${minutes}`);resize();setStatus(mapMode?'지도 드래그 이동 / 휠 확대 · 건물은 아래에서 선택':'3D 준비 완료 · 드래그 회전 / 휠 확대');
   cleanup=()=>{clearShadows();shadowMaterial.dispose();naver?.dispose();command.current=()=>{};observer.disconnect();controls.dispose();renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointerup',pointerUp);scene.traverse(o=>{const m=o as import('three').Mesh;if(m instanceof T.InstancedMesh)m.dispose();if(m.geometry)m.geometry.dispose();if(m.material)for(const mat of Array.isArray(m.material)?m.material:[m.material])mat.dispose();});textures.forEach(t=>t.dispose());renderer.dispose();renderer.domElement.remove();};
   if(mapMode){try{naver=await attachNaverOverlay({host,canvas:renderer.domElement,center:data.center,camera:mapCamera,content,render,isDisposed:()=>disposed,onAuthError:()=>{setMapError(true);setMapStatus('네이버 지도 인증 실패');}});if(!disposed)setMapStatus('네이버 지도 · 동일 원근으로 기울인 3D 건물');}catch{if(!disposed){setMapError(true);setMapStatus('네이버 지도 로드 실패');}}}
  }
  init().catch(()=>{if(!disposed)setStatus('3D를 표시할 수 없습니다. WebGL 사용 설정을 확인해주세요. 아래 원본 데이터는 확인할 수 있습니다.');});
  return()=>{disposed=true;cleanup();};
 // Model state is applied by the separate effect below without rebuilding the scene.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[data,mapMode]);
 useEffect(()=>{command.current('solar',`${date}|${minutes}`);},[date,minutes]);
 return <section className="bm-viewer"><div className="bm-toolbar"><span role="status">{status}</span><div>{mapMode&&<><button onClick={()=>command.current('zoomIn')} aria-label="지도 확대">＋</button><button onClick={()=>command.current('zoomOut')} aria-label="지도 축소">－</button></>}<button onClick={()=>command.current('reset')}>전체 보기</button><button onClick={()=>command.current('focus',selected)}>선택 동 확대</button><button onClick={()=>command.current('top')}>위에서 보기</button>{mapMode&&<button onClick={()=>command.current('oblique')}>입체 보기</button>}<button aria-pressed={detail} onClick={()=>command.current('detail')}>{detail?'외관 켜짐':'윤곽만 보기'}</button></div></div><div className="bm-canvas" ref={mount}/>{mapError&&<div role="alert" className="bm-map-error"><strong>네이버 지도 인증을 확인해주세요.</strong><p>네이버 클라우드 Maps에서 Web Dynamic Map 사용 여부와 현재 Client ID를 확인하고, Web 서비스 URL에 현재 접속 도메인(로컬은 http://localhost)이 등록되어 있는지 확인해주세요. 건물은 상단의 모형 자유 회전에서 확인할 수 있습니다.</p><a href="https://www.ncloud.com/support/faq/all/1047?searchKeyword=map" target="_blank" rel="noreferrer">공식 인증 오류 안내 ↗</a></div>}<section className="bm-solar" aria-label="태양과 그림자 시뮬레이션"><div><strong>☀ 태양과 그림자</strong><span>참고용 · 한국 시간</span></div><div className="bm-solar-controls"><label>날짜 <input type="date" min="1901-01-01" max="2099-12-31" value={date} onChange={e=>setDate(e.target.value)}/></label><label>시간 <input type="range" min="0" max="1430" step="10" value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/><output>{String(Math.floor(minutes/60)).padStart(2,'0')}:{String(minutes%60).padStart(2,'0')}</output></label></div><p role="status">{!solar?'날짜를 선택해 주세요.':solar.elevation<=0?'태양이 지평선 아래에 있어 그림자를 표시하지 않습니다.':`태양 고도 ${solar.elevation.toFixed(1)}° · 방위 ${solar.azimuth.toFixed(0)}° (북쪽 기준 시계 방향)${solar.elevation<7?' · 긴 그림자는 최대 500m로 제한':''}`}</p><p>동별 높이는 건축물대장 표제부 기준이며 주변 건물·지형·날씨는 반영하지 않습니다. 세대별 일조시간이나 법적 판단에 사용할 수 없습니다. <a href="https://gml.noaa.gov/grad/solcalc/solareqns.PDF" target="_blank" rel="noreferrer">태양 위치 계산 근거 ↗</a></p></section><div className="bm-legend"><span role="status">{mapStatus}</span><span>동별 위치·윤곽: OpenStreetMap · 높이·층수: 건축물대장</span><span>옥탑·창호·외벽은 외관 참고 재구성 · 실측 아님</span><a href={data.licenseUrl} target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a></div><div className="bm-selection"><div className="bm-dongs" aria-label="동 선택">{data.buildings.map(b=><button key={b.id} aria-pressed={selected===b.id} onClick={()=>command.current('select',b.id)}>{b.name}</button>)}</div><div className="bm-selected"><strong>{building.name}</strong><span>건축물대장 {building.floors}층</span><span>대장 높이 {building.height}m</span>{building.osmFloors!==undefined&&building.osmFloors!==building.floors&&<span>OSM 등록 {building.osmFloors}층과 차이</span>}<a href={building.sourceUrl} target="_blank" rel="noreferrer">건물 윤곽 원본 ↗</a></div></div></section>;
}
