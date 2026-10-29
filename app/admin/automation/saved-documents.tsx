import { getSavedDocuments } from '@/lib/saved-documents';
export default async function SavedDocuments({sourceUrl}:{sourceUrl?:string}){
 const files=await getSavedDocuments(sourceUrl);
 return <section className="a-card">
  <div className="a-card-title">저장된 공고문 파일 · {files.length}개</div>
  <p className="a-card-sub">실제로 다운로드한 파일입니다. PDF는 브라우저에서 열고 HWP·HWPX는 내려받아 볼 수 있습니다.</p>
  {!files.length?<p>아직 이 환경에 저장된 공고문 파일이 없습니다.</p>:<ul>{files.map(file=><li key={file.originalUrl} style={{margin:'12px 0'}}>
    <a href={file.localUrl} target="_blank" rel="noreferrer">{file.name}</a> · {(file.bytes/1024/1024).toFixed(2)} MB · <a href={file.localUrl} download={file.name}>다운로드</a>
  </li>)}</ul>}
  {sourceUrl&&files.find(f=>f.localUrl.endsWith('.pdf'))&&<iframe title="저장된 공고문 PDF 미리보기" src={files.find(f=>f.localUrl.endsWith('.pdf'))!.localUrl} style={{width:'100%',height:640,border:'1px solid var(--a-line)',marginTop: 16}}/>}
 </section>;
}
