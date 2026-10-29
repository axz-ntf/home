import json,re,zipfile,xml.etree.ElementTree as ET
from pathlib import Path
import pdfplumber
root=Path('.cache/document-address-review')
manifest=json.loads((root/'manifest.json').read_text())
out=[]
for doc in manifest:
    if not doc.get('localUrl'): continue
    file=Path('public'+doc['localUrl'])
    if file.suffix=='.hwpx':
        with zipfile.ZipFile(file) as z:
            text='\n'.join(' '.join(ET.fromstring(z.read(n)).itertext()) for n in z.namelist() if re.match(r'Contents/section\d+.xml',n))
            Path(doc['textFile']).write_text(text)
    if file.suffix!='.pdf' or doc['kind']!='housing-list': continue
    with pdfplumber.open(file) as pdf:
        col=None
        for page_no,page in enumerate(pdf.pages,1):
            for table in page.extract_tables():
                for row_no,row in enumerate(table,1):
                    headers=[re.sub(r'\s','',v or '') for v in row]
                    if '주소' in headers: col=headers.index('주소');continue
                    if col is None or len(row)<=col or not re.fullmatch(r'\d+',row[0] or ''):continue
                    raw=row[col] or ''
                    # Wrapped road names join within tokens; a number on the next line starts the building number.
                    address=re.sub(r'(?<=[가-힣0-9])\n(?=[가-힣])','',raw)
                    address=re.sub(r'\s+',' ',address).strip()
                    if not re.search(r'(로|길|동|리)\s*\d',address):continue
                    out.append({**doc,'address':address,'units':1,'evidence':f'PDF {page_no}쪽 표 {row_no}행 주소: {raw}', 'localUrl':doc['localUrl']+f'#page={page_no}'})
    print(doc['id'],len([x for x in out if x['id']==doc['id']]),flush=True)
(root/'pdf-table-addresses.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
