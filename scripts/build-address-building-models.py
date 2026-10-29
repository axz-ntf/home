"""Match official named buildings to nearby named OSM polygons, conservatively.
The resulting association is an inference, not an authoritative survey.
"""
import collections
import hashlib
import json
import math
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

root = Path('lib/building-register-local')
queue = json.loads((root / 'queue.json').read_text())
db = sqlite3.connect('.cache/building-model/footprints.sqlite')
created = 0
for entry in queue:
    address = entry['address']
    digest = hashlib.sha256(''.join(address.split()).encode()).hexdigest()
    target = root / ('model-' + digest + '.json')
    # Retire an old model when its matching inputs are no longer sufficient.
    if len(entry.get('points', [])) != 1:
        target.unlink(missing_ok=True)
        continue
    source = root / ('address-' + digest + '.json')
    if not source.exists():
        target.unlink(missing_ok=True)
        continue
    register = json.loads(source.read_text())
    if register.get('status') != 'geometry_unavailable' or not register.get('buildings'):
        target.unlink(missing_ok=True)
        continue
    point = entry['points'][0]
    counts = collections.Counter(b['name'] for b in register['buildings'])
    buildings = []
    for b in register['buildings']:
        if counts[b['name']] != 1:
            continue
        lat, lon = point['lat'], point['lng']
        rows = db.execute('SELECT id,lat,lon,ring FROM buildings WHERE name=? AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?', (b['name'], lat-.003, lat+.003, lon-.004, lon+.004)).fetchall()
        nearby = []
        for osm_id, y, x, ring in rows:
            distance = math.hypot((y-lat)*111320, (x-lon)*111320*math.cos(math.radians(lat)))
            if distance <= 250:
                nearby.append((osm_id, ring))
        # Ambiguous names and missing geometry are never guessed.
        if len(nearby) != 1:
            continue
        osm_id, ring = nearby[0]
        buildings.append({'id':str(osm_id),'name':b['name'],'height':b['height'],'floors':b['floors'],'heightSource':'국토교통부 건축물대장 표제부','ring':json.loads(ring),'sourceUrl':f'https://www.openstreetmap.org/way/{osm_id}'})
    if not buildings:
        target.unlink(missing_ok=True)
        continue
    now = datetime.now(timezone.utc).isoformat()
    model = {'id':digest,'name':address,'address':address,'noticeId':'','fetchedAt':now,'dataTimestamp':'2026-10-29','center':[point['lng'],point['lat']],'source':'OpenStreetMap contributors · Geofabrik','license':'ODbL 1.0','licenseUrl':'https://www.openstreetmap.org/copyright','addressEvidence':'주소 좌표 250m 이내의 고유한 동명과 건축물대장 동명을 연결한 추정 결과입니다. 공식 배치도 검증은 하지 않았습니다.','heightReference':'국토교통부 건축HUB 건축물대장 표제부','heightReferenceUrl':'https://www.data.go.kr/data/15134735/openapi.do','buildings':buildings}
    target = root / ('model-' + digest + '.json')
    temp = target.with_suffix('.tmp')
    temp.write_text(json.dumps(model, ensure_ascii=False))
    os.replace(temp, target)
    created += 1
print(f'주소 {created}개에서 동명이 유일하게 일치하는 3D 후보 생성')
