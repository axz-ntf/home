import type { DatasetId } from "./housing-catalog";

type SourceEndpoint = { name: string; method: "GET" | "POST"; kind: "공공데이터 API" | "공식 사이트 HTML" | "공식 사이트 JSON" | "좌표 보강 API"; url: string; auth: string };
type SourceReference = { pipeline: string; scripts: string[]; endpoints: SourceEndpoint[] };
const complex: SourceEndpoint = { name: "마이홈 공공임대주택 단지정보", method: "GET", kind: "공공데이터 API", url: "https://data.myhome.go.kr/rentalHouseList", auth: "공공데이터 인증키 필요" };
const vworld: SourceEndpoint = { name: "VWorld 주소 좌표 변환", method: "GET", kind: "좌표 보강 API", url: "https://api.vworld.kr/req/address", auth: "VWorld 인증키 필요" };

// Documented from the collection scripts. Never use a live request URL containing credentials.
export const HOUSING_SOURCE_REFERENCES: Record<DatasetId, SourceReference> = {
  "lh-complexes": {
    pipeline: "시도·시군구별 API 페이지 수집 → 단지·주택형 원본 저장 → 단지 식별자로 묶어 조회",
    scripts: ["scripts/sync-lh-api.mjs"], endpoints: [complex],
  },
  "lh-listings": {
    pipeline: "LH 공고·공급정보 API + 단지정보 → 기존 수집 공고 병합 → 공식 상세·주소 좌표 보강 → 서비스용 데이터",
    scripts: ["scripts/sync-lh-api.mjs", "scripts/enrich-complexes.mjs"],
    endpoints: [
      { name: "LH 분양임대 공고정보", method: "GET", kind: "공공데이터 API", url: "http://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1", auth: "공공데이터 인증키 필요" },
      { name: "LH 공고별 공급정보", method: "GET", kind: "공공데이터 API", url: "https://apis.data.go.kr/B552555/lhLeaseNoticeSplInfo1/getLeaseNoticeSplInfo1", auth: "공공데이터 인증키 필요" },
      complex,
      { name: "LH 청약플러스 공고 상세", method: "GET", kind: "공식 사이트 HTML", url: "https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do", auth: "공고 식별자로 조회" },
      vworld,
      { name: "카카오 주소 검색 (좌표 보강)", method: "GET", kind: "좌표 보강 API", url: "https://dapi.kakao.com/v2/local/search/address.json", auth: "카카오 REST 인증키 필요" },
      { name: "행정안전부 도로명주소 검색 (주소 확인)", method: "GET", kind: "공공데이터 API", url: "https://business.juso.go.kr/addrlink/addrLinkApi.do", auth: "도로명주소 검색 API 승인키 필요" },
      { name: "카카오 키워드 검색 (주소 검색 보완)", method: "GET", kind: "좌표 보강 API", url: "https://dapi.kakao.com/v2/local/search/keyword.json", auth: "카카오 REST 인증키 필요" },
    ],
  },
  "lh-notices": {
    pipeline: "마이홈 전국 임대·분양 공고 수집 → LH 공고 추출·정규화 → 공식 상세 보강",
    scripts: ["scripts/sync-myhome-all.mjs", "scripts/normalize-lh-notices.mjs", "scripts/enrich-lh-details.mjs"],
    endpoints: [
      { name: "마이홈 임대주택 입주자모집공고", method: "GET", kind: "공공데이터 API", url: "https://apis.data.go.kr/1613000/HWSPR02/rsdtRcritNtcList", auth: "공공데이터 인증키 필요" },
      { name: "마이홈 공공분양 공고 목록", method: "POST", kind: "공식 사이트 JSON", url: "https://www.myhome.go.kr/hws/portal/sch/selectLttotHouseList.do", auth: "인증키 미사용" },
      { name: "LH 청약플러스 공고 상세 보강", method: "GET", kind: "공식 사이트 HTML", url: "https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do", auth: "공고 식별자로 조회" },
    ],
  },
  "sh-notices": {
    pipeline: "서울주거포털 SH 공고 목록 HTML → SH 공식 상세·첨부 정보 수집",
    scripts: ["scripts/sync-sh.mjs"],
    endpoints: [
      { name: "서울주거포털 SH 공공임대 공고 목록", method: "GET", kind: "공식 사이트 HTML", url: "https://housing.seoul.go.kr/site/main/sh/publicLease/list", auth: "인증키 미사용" },
      { name: "SH 공식 공고 상세", method: "GET", kind: "공식 사이트 HTML", url: "https://www.i-sh.co.kr/main/lay2/program/S1T294C295/www/brd/m_241/view.do", auth: "게시물 번호로 조회" },
    ],
  },
  "youth-notices": {
    pipeline: "서울시 청년안심주택 목록 JSON → 공식 상세에서 지역·첨부 정보 수집",
    scripts: ["scripts/sync-youth.mjs"],
    endpoints: [
      { name: "청년안심주택 공고 목록", method: "POST", kind: "공식 사이트 JSON", url: "https://soco.seoul.go.kr/youth/pgm/home/yohome/bbsListJson.json", auth: "인증키 미사용" },
      { name: "청년안심주택 공고 상세", method: "GET", kind: "공식 사이트 HTML", url: "https://soco.seoul.go.kr/youth/bbs/BMSR00015/view.do", auth: "게시물 번호로 조회" },
    ],
  },
  "youth-complexes": {
    pipeline: "단지 카드 목록 + 지도 목록을 단지 코드로 병합 → 좌표가 없는 주소는 VWorld로 보강",
    scripts: ["scripts/sync-youth.mjs"],
    endpoints: [
      { name: "청년안심주택 단지 카드 목록", method: "POST", kind: "공식 사이트 JSON", url: "https://soco.seoul.go.kr/youth/pgm/home/yohome/yoHomeListJson.json", auth: "인증키 미사용" },
      { name: "청년안심주택 단지 지도 목록", method: "POST", kind: "공식 사이트 JSON", url: "https://soco.seoul.go.kr/youth/pgm/home/yohome/maplist.json", auth: "인증키 미사용" },
      vworld,
    ],
  },
};
