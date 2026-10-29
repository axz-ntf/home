'use client';
import {useState} from 'react';
import type {BuildingModel} from '@/lib/building-models/types';
import BuildingModelViewer from './building-model-viewer';
export default function DongtanLegacyViewer({data}:{data:BuildingModel}){
 const [open,setOpen]=useState(false);
 return <details style={{marginTop:20}} onToggle={e=>setOpen(e.currentTarget.open)}><summary>기존 네이버 지도 합성 보기</summary>{open&&<BuildingModelViewer data={data}/>}</details>;
}
