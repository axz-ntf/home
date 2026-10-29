'use client';
import { DdsIcon } from "@/components/dds-icon";
import {useState} from 'react';
import {useRouter} from 'next/navigation';
export default function CollectInformationButton({listingId}:{listingId:string}){
 const router=useRouter();const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [failed,setFailed]=useState(false);
 async function collect(){
  if(busy)return;setBusy(true);setFailed(false);setMessage('공고문을 읽고 있습니다. 완료되면 추출 정보를 자동으로 채웁니다.');
  try{
   const response=await fetch('/api/admin/collect-information',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:listingId}),signal:AbortSignal.timeout(300000)});
   const result=await response.json();if(!response.ok)throw new Error(result.error||'정보 수집에 실패했습니다.');
   setMessage(result.message);router.refresh();
  }catch(error){setFailed(true);setMessage(error instanceof Error?error.message:'정보 수집에 실패했습니다.');}
  finally{setBusy(false);}
 }
 return <div className="nw-collect"><button className="a-btn secondary" onClick={collect} disabled={busy}><DdsIcon name="refresh" size={16}/>{busy?'정보 수집 중…':'다시 수집'}</button>{message&&<p role={failed?'alert':'status'} className={failed?'nw-collect-error':''}>{message}</p>}</div>;
}
