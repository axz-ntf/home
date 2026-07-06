"use client";

// 검수 상세 오른쪽 미리보기 패널 — 폼 입력을 실시간 구독 (review-live 컨텍스트).
// ① 앱 매물 카드가 어떻게 노출되는지 ② 주택목록 / 등록 단지 목록 표.
// 입력 중엔 live 값을, 아니면 저장값(props)을 보여줘 정정 결과를 저장 전에 확인.
import { useReviewLive } from "./review-live";

interface PreviewPoint {
  label?: string;
  address?: string;
  depositManwon?: number;
  rentManwon?: number;
  area?: string;
}

// 주택목록(complexes rows — xlsx/검수값 파싱 결과) 표시용 행.
interface PreviewRow {
  houseType: string;
  area: string;
  depositManwon: number | null;
}

// 자동 추출 raw 메타 (편집 불가 컨텍스트) — 폼 세로 길이 줄이려 우측 패널에 표시.
export interface RefInfo {
  complexName: string | null;
  address: string;
  pnu: string | null;
  houseType: string | null;
  heatMethod: string | null;
  parkngCo: number | null;
  coverPhotoUrl: string | null;
  eligible: string[];
}

function comma(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// 만원 → "1억 1,520만원" 한국식.
function priceKo(manwon: number | null | undefined): string {
  if (manwon == null || !Number.isFinite(manwon) || manwon <= 0) return "";
  const eok = Math.floor(manwon / 10000);
  const rest = manwon % 10000;
  if (eok > 0 && rest > 0) return `${eok}억 ${comma(rest)}만원`;
  if (eok > 0) return `${eok}억원`;
  return `${comma(rest)}만원`;
}

export default function ReviewPreview({
  title,
  typeLabel,
  agency,
  district,
  deposit,
  rent,
  salePriceManwon,
  supplyUnits,
  area,
  isSale,
  rows = [],
  points,
  refInfo = null,
}: {
  title: string;
  typeLabel: string;
  agency: string;
  district: string;
  deposit: number | null;
  rent: number | null;
  salePriceManwon: number | null;
  supplyUnits: number | null;
  area: string;
  isSale: boolean;
  rows?: PreviewRow[];
  points: PreviewPoint[];
  refInfo?: RefInfo | null;
}) {
  const hasRef = Boolean(refInfo && (
    refInfo.complexName || refInfo.address || refInfo.pnu || refInfo.houseType ||
    refInfo.heatMethod || refInfo.parkngCo != null || refInfo.coverPhotoUrl || refInfo.eligible.length > 0
  ));
  // 폼 입력 실시간 반영 — live 가 있으면(폼 마운트 후) 그 값을, 없으면 저장값.
  const { live } = useReviewLive();
  const v = {
    deposit: live ? live.deposit : deposit,
    rent: live ? live.rent : rent,
    salePriceManwon: live ? live.salePriceManwon : salePriceManwon,
    supplyUnits: live ? live.supplyUnits : supplyUnits,
    area: live?.area ?? area,
  };
  const shownRows = live?.rows ?? rows;
  const dirty = live?.dirty ?? false;

  const priceLine = isSale
    ? (v.salePriceManwon ? `분양가 ${priceKo(v.salePriceManwon)}` : "분양가 정보 없음")
    : (v.deposit
        ? `보증금 ${priceKo(v.deposit)}${v.rent ? ` · 월세 ${comma(v.rent)}만원` : ""}`
        : "가격 정보 없음");
  const priceMissing = isSale ? !v.salePriceManwon : !v.deposit;

  const metaBits = [v.area, district, v.supplyUnits ? `모집 ${comma(v.supplyUnits)}세대` : null].filter(Boolean);

  return (
    <aside className="a-review-aside">
      <div className="a-aside-label">
        미리보기
        {dirty && <span className="a-badge notice-correction">수정 중 · 미저장</span>}
      </div>

      {/* 앱 매물 카드 미리보기 */}
      <div className="a-preview-card">
        <div className="a-preview-badges">
          <span className="a-preview-badge type">{typeLabel}</span>
          <span className="a-preview-badge agency">{agency}</span>
        </div>
        <div className="a-preview-title">{title}</div>
        <div className={`a-preview-price ${priceMissing ? "missing" : ""}`}>{priceLine}</div>
        {metaBits.length > 0 && <div className="a-preview-meta">{metaBits.join(" · ")}</div>}
        <div className="a-preview-note">
          {dirty ? "저장 전 미리보기 — 저장하면 앱에 반영됩니다" : "앱 매물 카드에 이렇게 노출됩니다 — 왼쪽에서 정정하면 반영"}
        </div>
      </div>

      {/* 주택목록 (complexes rows — xlsx 파싱/검수값, 평형별 입력 중엔 폼 실시간) */}
      {shownRows.length > 0 && (
        <div className="a-preview-card">
          <div className="a-preview-cardhead">
            <span className="a-preview-cardtitle">주택목록</span>
            <span className="a-preview-count">
              {v.supplyUnits ? `${comma(v.supplyUnits)}호` : `${shownRows.length}행`}
            </span>
          </div>
          <div className="a-preview-tbl">
            <div className="a-preview-tr cols3 head">
              <span>유형</span>
              <span className="r">면적</span>
              <span className="r">보증금</span>
            </div>
            {shownRows.slice(0, 6).map((r, i) => (
              <div className="a-preview-tr cols3" key={i}>
                <span className="a-preview-c1">{r.houseType || `행 ${i + 1}`}</span>
                <span className="r">{r.area || "—"}</span>
                <span className="r">{r.depositManwon ? priceKo(r.depositManwon) : "—"}</span>
              </div>
            ))}
            {shownRows.length > 6 && (
              <div className="a-preview-more">+ {shownRows.length - 6}개 더 · 첨부에서 자동 파싱</div>
            )}
          </div>
        </div>
      )}

      {/* 등록된 단지 목록 (분리 핀 mapped points) */}
      {points.length > 0 && (
        <div className="a-preview-card">
          <div className="a-preview-cardhead">
            <span className="a-preview-cardtitle">등록 단지 목록</span>
            <span className="a-preview-count">{points.length}곳</span>
          </div>
          <div className="a-preview-tbl">
            <div className="a-preview-tr head">
              <span>단지 · 주소</span>
              <span className="r">보증금</span>
            </div>
            {points.slice(0, 6).map((p, i) => (
              <div className="a-preview-tr" key={i}>
                <span className="a-preview-c1">{p.label || p.address || `단지 ${i + 1}`}</span>
                <span className="r">{p.depositManwon ? priceKo(p.depositManwon) : "—"}</span>
              </div>
            ))}
            {points.length > 6 && (
              <div className="a-preview-more">+ {points.length - 6}곳 더</div>
            )}
          </div>
        </div>
      )}

      {/* 참고 정보 — 자동 추출 raw 메타 (편집 불가). 폼에서 옮겨와 좌측 세로 길이 절약. */}
      {hasRef && refInfo && (
        <div className="a-preview-card">
          <div className="a-preview-cardhead">
            <span className="a-preview-cardtitle">참고 정보</span>
            <span className="a-preview-count">원본 메타</span>
          </div>
          {refInfo.coverPhotoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={refInfo.coverPhotoUrl}
              alt="공고 표지"
              style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 8, background: "var(--a-bg-3)" }}
            />
          )}
          <dl className="a-ref-dl">
            {refInfo.complexName && <><dt>단지명</dt><dd>{refInfo.complexName}</dd></>}
            {refInfo.houseType && <><dt>주거형태</dt><dd>{refInfo.houseType}</dd></>}
            {refInfo.heatMethod && <><dt>난방방식</dt><dd>{refInfo.heatMethod}</dd></>}
            {refInfo.parkngCo != null && <><dt>주차대수</dt><dd>{refInfo.parkngCo.toLocaleString()}대</dd></>}
            {refInfo.address && <><dt>주소</dt><dd>{refInfo.address}</dd></>}
            {refInfo.pnu && <><dt>PNU</dt><dd><code>{refInfo.pnu}</code></dd></>}
            {refInfo.eligible.length > 0 && (
              <><dt>자격</dt><dd className="chips">
                {refInfo.eligible.map((e) => (
                  <span key={e} className="a-badge notice-normal">{e}</span>
                ))}
              </dd></>
            )}
          </dl>
        </div>
      )}
    </aside>
  );
}
