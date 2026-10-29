import type { DatasetId } from "@/lib/housing-catalog";
import { HOUSING_SOURCE_REFERENCES } from "@/lib/housing-data-sources";

export function SourceReference({ source, expanded = false }: { source: DatasetId; expanded?: boolean }) {
  const reference = HOUSING_SOURCE_REFERENCES[source];
  return <details className="hd-source-reference" open={expanded}>
    <summary>출처 · API <span>{reference.endpoints.length}개 연결 주소</span></summary>
    <div className="hd-reference-body">
      <p>{reference.pipeline}</p>
      <ul>{reference.endpoints.map(endpoint => <li key={endpoint.url}>
        <div><strong>{endpoint.name}</strong><span className="hd-pill">{endpoint.kind}</span></div>
        <div className="hd-endpoint"><code>{endpoint.method}</code><a href={endpoint.url} target="_blank" rel="noreferrer">{endpoint.url}</a></div>
        <small>{endpoint.auth}</small>
      </li>)}</ul>
      <p className="hd-footnote">수집 코드에 설정된 주소입니다. 인증키·요청 파라미터는 제외했습니다. 공식 사이트 JSON은 공공데이터포털의 공개 API와 구분됩니다.</p>
      <details className="hd-source-code"><summary>수집 코드 위치</summary>{reference.scripts.map(script => <code key={script}>{script}</code>)}</details>
    </div>
  </details>;
}
