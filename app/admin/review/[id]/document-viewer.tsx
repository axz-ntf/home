'use client';
import { DdsIcon } from "@/components/dds-icon";
import { useState } from 'react';
import type { SavedDocument } from '@/lib/saved-documents';
export default function DocumentViewer({files}:{files:SavedDocument[]}) {
  const [selected,setSelected]=useState(files.find(f=>f.localUrl.endsWith('.pdf'))?.localUrl??files[0]?.localUrl??'');
  const file=files.find(f=>f.localUrl===selected);
  return <section className="nw-card nw-document">
    <header className="nw-card-heading"><h2>공식 공고문</h2><span className="nw-tag">{files.length}개 저장</span></header>
    {file ? <>
      <div className="nw-document-toolbar">
        <label className="nw-visually-hidden" htmlFor="notice-document">공고문 파일 선택</label>
        <select id="notice-document" value={selected} onChange={event=>setSelected(event.target.value)}>{files.map(f=><option key={f.originalUrl} value={f.localUrl}>{f.name}</option>)}</select>
        <a href={file.localUrl} download={file.name} aria-label="선택한 공고문 다운로드"><DdsIcon name="arrow-down" size={16}/> 저장</a>
      </div>
      {file.localUrl.endsWith('.pdf')?<iframe title="공식 공고문 PDF" src={`${file.localUrl}#toolbar=1&navpanes=0&view=FitH`}/>:<div className="nw-file-empty"><span>HWP · HWPX 원본 파일</span><p>파일을 내려받아 한글 문서 뷰어로 열어보세요.</p><a className="a-btn secondary" href={file.localUrl} download={file.name}>원본 다운로드</a></div>}
      <footer className="nw-document-foot"><span>원본 저장 완료 · {(file.bytes/1024/1024).toFixed(2)} MB</span><a href={file.localUrl} target="_blank" rel="noreferrer">새 창에서 열기 <DdsIcon name="arrow-up-right" size={14}/></a></footer>
    </>:<div className="nw-file-empty"><span>저장된 공고문이 없습니다</span><p>다운로드가 완료되면 여기에 원문이 표시됩니다.</p></div>}
  </section>;
}
