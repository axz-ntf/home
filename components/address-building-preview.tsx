'use client';
import {useState} from 'react';
import type {BuildingModel} from '@/lib/building-models/types';
import {DdsIcon} from '@/components/dds-icon';
import DongtanMapLibreViewer from '@/components/dongtan-maplibre-viewer';
export default function AddressBuildingPreview({model}:{model:BuildingModel}){
 const [open,setOpen]=useState(false);
 return <div className="hd-building-preview">
  <div className="hd-building-preview-info"><span className="hd-building-icon"><DdsIcon name="map" size={20}/></span><div><strong>지도에서 건물 살펴보기</strong><p>주소 좌표와 동 이름을 바탕으로 {model.buildings.length}개 동을 연결했습니다. 일부 동만 표시될 수 있습니다.</p></div></div>
  <div className="hd-building-preview-footer"><span className="hd-data-badge"><DdsIcon name="info" size={14}/> 참고용 · 배치도 확인 필요</span><button className="a-btn secondary hd-map-action" type="button" aria-expanded={open} onClick={()=>setOpen(!open)}><DdsIcon name={open?'chevron-up':'map'} size={16}/>{open?'3D 지도 닫기':'3D 지도와 그림자 보기'}</button></div>
  {open&&<div className="hd-building-preview-map"><DongtanMapLibreViewer data={model}/></div>}
 </div>;
}
