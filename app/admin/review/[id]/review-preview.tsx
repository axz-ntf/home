// 검수 상세 오른쪽 미리보기 패널 (서버 컴포넌트, 현재 저장값 기준).
// ① 앱 매물 카드가 어떻게 노출되는지 ② 등록된 단지 목록(주택목록 xlsx / mapped points) 표.
// 저장 전 "현재 노출" 을 보여줘 검수자가 정정 전후를 대조하도록 한다.

interface PreviewPoint {
  label?: string;
  address?: string;
  depositManwon?: number;
  rentManwon?: number;
  area?: string;
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
  points,
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
  points: PreviewPoint[];
}) {
  const priceLine = isSale
    ? (salePriceManwon ? `분양가 ${priceKo(salePriceManwon)}` : "분양가 정보 없음")
    : (deposit
        ? `보증금 ${priceKo(deposit)}${rent ? ` · 월세 ${comma(rent)}만원` : ""}`
        : "가격 정보 없음");
  const priceMissing = isSale ? !salePriceManwon : !deposit;

  const metaBits = [area, district, supplyUnits ? `모집 ${comma(supplyUnits)}세대` : null].filter(Boolean);

  return (
    <aside className="a-review-aside">
      <div className="a-aside-label">미리보기</div>

      {/* 앱 매물 카드 미리보기 */}
      <div className="a-preview-card">
        <div className="a-preview-badges">
          <span className="a-preview-badge type">{typeLabel}</span>
          <span className="a-preview-badge agency">{agency}</span>
        </div>
        <div className="a-preview-title">{title}</div>
        <div className={`a-preview-price ${priceMissing ? "missing" : ""}`}>{priceLine}</div>
        {metaBits.length > 0 && <div className="a-preview-meta">{metaBits.join(" · ")}</div>}
        <div className="a-preview-note">저장 전 현재 앱 노출 — 왼쪽에서 정정하면 반영됩니다</div>
      </div>

      {/* 등록된 단지 목록 (주택목록 xlsx / mapped points) */}
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
    </aside>
  );
}
