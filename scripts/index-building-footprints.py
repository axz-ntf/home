"""Index named OSM building ways from a local extract for bounded, offline matching.
Usage: python scripts/index-building-footprints.py extract.osm.pbf index.sqlite
Requires pyosmium. The original extract remains the source of truth (ODbL).
"""
import json
import os
import sqlite3
import sys
import osmium

source, target = sys.argv[1:3]
temporary = target + '.tmp'
if os.path.exists(temporary):
    os.unlink(temporary)
db = sqlite3.connect(temporary)
db.execute('CREATE TABLE buildings (id INTEGER PRIMARY KEY, name TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, ring TEXT NOT NULL)')
db.execute('CREATE INDEX by_name ON buildings(name)')

class Buildings(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.count = 0
    def way(self, way):
        name = way.tags.get('name', '').strip()
        if not name or not way.tags.get('building') or len(way.nodes) < 4:
            return
        try:
            ring = [[n.lon, n.lat] for n in way.nodes]
        except osmium.InvalidLocationError:
            return
        if ring[0] != ring[-1]:
            return
        lon = sum(p[0] for p in ring[:-1]) / (len(ring)-1)
        lat = sum(p[1] for p in ring[:-1]) / (len(ring)-1)
        db.execute('INSERT INTO buildings VALUES (?,?,?,?,?)', (way.id, name, lat, lon, json.dumps(ring, separators=(',', ':'))))
        self.count += 1
        if self.count % 10000 == 0:
            db.commit()

handler = Buildings()
handler.apply_file(source, locations=True, idx='sparse_file_array')
db.commit()
db.close()
os.replace(temporary, target)
print(f'OSM 이름이 있는 닫힌 건물 윤곽 {handler.count:,}개 색인 완료')
