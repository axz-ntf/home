import json,re
from pathlib import Path
import pdfplumber
root=Path('.cache/document-address-review');manifest=json.loads((root/'manifest.json').read_text())
targets={x['id'] for x in json.loads((root/'targets.json').read_text()) if x['addresses']==0 and ('리츠' in x['title'])}
out=[]
for d in manifest:
 if d['id'] not in targets or not d.get('localUrl','').endswith('.pdf'):continue
 with pdfplumber.open('public'+d['localUrl']) as pdf:
  for pno,p in enumerate(pdf.pages[:5],1):
   for table in p.extract_tables():
    idx=None;last=['','','']
    for row in table:
     vals=[re.sub(r'\s+','',v or '') for v in row]
     heads=[i for i,v in enumerate(vals) if '단지명' in v]
     if heads:idx=heads[0];continue
     if idx is None or idx<3 or len(row)<=idx:continue
     name=vals[idx]
     if not name or not re.search('[가-힣]',name) or any(v in name for v in ['계약','공급','접수','모집','신청','지사']):continue
     for i in range(3):
      if vals[i]:last[i]=vals[i]
     if not all(last):continue
     out.append({**d,'name':name,'region':list(last),'query':' '.join(last+[name]),'evidence':f'PDF {pno}쪽 임대대상 단지 표: '+str(row),'page':pno})
(root/'complex-name-candidates.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
for x in out:print(x['id'],x['query'])
