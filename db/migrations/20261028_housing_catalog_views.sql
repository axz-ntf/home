-- Views over the imported project snapshots. These are not upstream raw API payloads.
-- security_invoker keeps the existing RLS and privileges of underlying tables.
BEGIN;
CREATE OR REPLACE VIEW public.housing_complexes_v WITH (security_invoker=true) AS
WITH selected AS (
 SELECT source, row_number, payload,
   CASE WHEN source='lh-complexes' THEN NULLIF(payload->>'hsmpSn','') ELSE NULLIF(payload->>'homeCode','') END AS external_id
 FROM public.housing_catalog_records WHERE source IN ('lh-complexes','youth-complexes')
), ranked AS (
 SELECT *,row_number() OVER (PARTITION BY source,coalesce(external_id,'__missing_row_'||row_number::text) ORDER BY row_number) AS choice
 FROM selected
)
SELECT source,coalesce(external_id,'__missing_row_'||row_number::text) AS source_id,
       external_id IS NOT NULL AS has_external_id,
       CASE WHEN source='lh-complexes' THEN payload->>'hsmpNm' ELSE payload->>'homeName' END AS name,
       CASE WHEN source='lh-complexes' THEN payload->>'rnAdres' ELSE payload->>'address' END AS address,
       payload->>'pnu' AS pnu, payload->>'lat' AS latitude, payload->>'lng' AS longitude,
       row_number AS representative_row, payload AS representative_data
FROM ranked WHERE choice=1;

CREATE OR REPLACE VIEW public.housing_unit_types_v WITH (security_invoker=true) AS
SELECT source, row_number AS source_row,
       coalesce(nullif(payload->>'hsmpSn',''),'__missing_row_'||row_number::text) AS complex_source_id,
       payload->>'styleNm' AS unit_type, payload->>'houseTyNm' AS building_type,
       payload->>'suplyPrvuseAr' AS exclusive_area_m2,
       payload->>'bassRentGtn' AS deposit_won, payload->>'bassMtRntchrg' AS monthly_rent_won,
       payload AS source_data
FROM public.housing_catalog_records WHERE source='lh-complexes';

CREATE OR REPLACE VIEW public.housing_notices_v WITH (security_invoker=true) AS
SELECT source,row_number AS source_row,
 CASE source WHEN 'sh-notices' THEN coalesce(nullif(payload->>'seq',''),'__missing_row_'||row_number::text)
 WHEN 'youth-notices' THEN coalesce(nullif(payload->>'boardId',''),'__missing_row_'||row_number::text)
 ELSE coalesce(nullif(payload->>'id',''),'__missing_row_'||row_number::text) END AS source_id,
 coalesce(nullif(payload->>'noticeTitle',''),payload->>'title') AS title,
 coalesce(nullif(payload->>'announceDate',''),payload->>'postedAt') AS announced_at_text,
 coalesce(nullif(payload->>'sourceUrl',''),payload->>'detailUrl') AS source_url,
 payload->>'address' AS address,payload->>'pblancId' AS provider_notice_id,
 payload AS source_data
FROM public.housing_catalog_records WHERE source IN ('lh-listings','lh-notices','sh-notices','youth-notices');

-- A shared LH panId establishes common notice provenance, not a complex match.
-- Exclude duplicate IDs on either side so a link cannot multiply ambiguously.
CREATE OR REPLACE VIEW public.housing_notice_links_v WITH (security_invoker=true) AS
WITH listing AS (
 SELECT source_id,source_row,provider_notice_id AS pan_id,
 count(*) OVER(PARTITION BY provider_notice_id) AS n
 FROM public.housing_notices_v WHERE source='lh-listings' AND provider_notice_id ~ '^[0-9]+$'
), extracted AS (
 SELECT source_id,source_row,substring(source_url FROM '[?&]panId=([0-9]+)') AS pan_id
 FROM public.housing_notices_v WHERE source='lh-notices'
), unique_notice AS (
 SELECT *,count(*) OVER(PARTITION BY pan_id) AS n FROM extracted WHERE pan_id IS NOT NULL
)
SELECT 'lh-listings'::text AS left_source,l.source_id AS left_id,l.source_row AS left_row,
       'lh-notices'::text AS right_source,n.source_id AS right_id,n.source_row AS right_row,
       l.pan_id AS common_pan_id,'exact_lh_pan_id'::text AS evidence
FROM listing l JOIN unique_notice n ON l.pan_id=n.pan_id WHERE l.n=1 AND n.n=1;
REVOKE ALL ON public.housing_complexes_v,public.housing_unit_types_v,public.housing_notices_v,public.housing_notice_links_v FROM anon,authenticated;
COMMIT;
