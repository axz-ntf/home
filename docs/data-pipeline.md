# 데이터 파이프라인 — 신규 공고 대응 전략

> 현재 도구 7단계 + 신규 공고 자동 처리 방안 설계.

## 1. 현재 파이프라인 (수동 실행)

```
[A] sync-myhome-all.mjs        → MyHome API → lib/myhome-*-notices.json (전체 공고 list)
[B] normalize-lh-notices.mjs   → lib/lh-notices-all.json (정규화)
[C] enrich-lh-details.mjs      → details 보강 (좌표, 사진, 일정, noticeStatus)
[D] enrich-complexes.mjs       → 단지별 표 (주택형/세대수/가격)
[E] enrich-notice-text.mjs     → Document Parse → lib/notice-texts/*.md
[F] embed-notice-texts.mjs     → Solar embedding → lib/notice-embeddings/
[G] extract-eligibility.mjs    → LLM 구조화 → lib/notice-eligibility/*.json
[H] sync-lh-api.mjs            → 최종 → lib/listings-api.json
```

각 단계 모두 incremental (이미 처리된 항목은 skip).

## 2. 신규 공고가 들어왔을 때 무엇이 바뀌나

- 새 매물 1건 = LH OpenAPI 가 PAN_ID 신규 응답
- 자동 처리 항목: 좌표 / 단지 정보 / PDF 본문 / 임베딩 / 자격 구조화 모두 새로
- 비용: 신규 1건당 ≈ 0.7s × Doc Parse + ~$0.005 (Solar) — 거의 무시할 수준

## 3. 대응 전략 옵션

### Option A: 수동 트리거 (현재)
- 사용자가 가끔 모든 스크립트 실행
- 장점: 무료, 단순
- 단점: 새 공고가 늦게 반영

### Option B: 일일 cron (추천)
- 매일 새벽 1시 모든 pipeline 자동 실행
- 인프라:
  - **로컬 cron / launchd** — 개발 머신에 한정
  - **GitHub Actions cron** — 무료, Linux runner 에서 실행 후 결과를 PR 또는 commit
  - **Vercel Cron Jobs** — Vercel Function 으로 호출, 단 60s 한도 (긴 step 분리 필요)

### Option C: 이벤트 기반 (향후)
- LH API 의 PAN_NT_ST_DT (공고일) 변경 감지 → push 알림 → 즉시 처리
- Webhook 없는 LH 환경에서는 polling + diff 방식

## 4. 추천 실행: GitHub Actions Daily Cron

### 설계
```yaml
# .github/workflows/sync-listings.yml
name: Daily LH Sync
on:
  schedule:
    - cron: "0 16 * * *"  # UTC 16:00 = KST 01:00
  workflow_dispatch:       # 수동 트리거 허용
jobs:
  sync:
    runs-on: ubuntu-latest
    timeout-minutes: 90
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24 }
      - run: npm ci
      - name: Run pipeline
        env:
          DATA_GO_KR_KEY: ${{ secrets.DATA_GO_KR_KEY }}
          VWORLD_API_KEY: ${{ secrets.VWORLD_API_KEY }}
          SOLAR_API_KEY: ${{ secrets.SOLAR_API_KEY }}
          SOLAR_BASE_URL: https://api.upstage.ai/v1
        run: |
          node scripts/sync-myhome-all.mjs
          node scripts/normalize-lh-notices.mjs
          node scripts/enrich-lh-details.mjs        # noticeStatus 갱신
          node scripts/enrich-complexes.mjs
          node scripts/enrich-notice-text.mjs --limit 9999  # 신규 매물만
          node scripts/embed-notice-texts.mjs --limit 9999
          node scripts/extract-eligibility.mjs --limit 9999
          node scripts/sync-lh-api.mjs
      - name: Commit updated data
        run: |
          git config user.name "daum-public-housing-bot"
          git config user.email "bot@daum-public-housing.example"
          git add lib/ public/lh-covers/
          git commit -m "data: daily sync $(date -u +%Y-%m-%d)" || echo "no changes"
          git push
```

### 동작
1. 매일 새벽 1시 (KST) 시작
2. Phase A~H 순차 실행
3. 모든 incremental step 은 이미 처리된 항목 자동 skip
4. 신규 매물만 새로 처리됨
5. 변경된 데이터 자동 commit → Vercel preview/production 배포 트리거

### 비용 추정 (신규 매물 가정: 일 5건)
- Doc Parse: 5건 × 30페이지 × $0.01 ≈ $1.5
- Solar embedding: 5건 × 0.5K 토큰 × $0.00001 ≈ 무시
- Solar extract: 5건 × 20K 토큰 × $0.00001 ≈ $0.001
- **합계: 일 ~$1.5 / 월 ~$45**

## 5. 단계별 도입 로드맵

### 단기 (지금 ~ 1주)
- 수동 실행 유지 + `npm run sync-all` 같이 한 번에 묶는 npm script 추가
- 사용자가 필요 시 수동 실행 (예: 새 공고가 떠 있으면 한 줄 명령)

### 중기 (1~2주 후)
- GitHub Actions cron 설정 + Secrets 등록
- 시범 운영 (주 1회 dispatch) → 확인 후 daily 전환

### 장기 (사용자 증가 후)
- LH API 의 변경 감지 → 즉시 알림 + 처리
- Vercel Postgres + pgvector 로 데이터 이전 (현재 JSON → DB)
- 사용자별 알림 ("내 조건 매물 새로 떴어요")

## 6. 실패 / 모니터링

- 각 step 의 progress 파일 (`.progress.json`) — 중단 시 resume 가능
- GitHub Actions 실패 시 Slack/Email 알림 추가 가능
- 자격 추출 fail 매물 별도 로그 (`lib/extract-fails.json`) → 수동 재처리

## 7. 결정 필요 사항

- [ ] GitHub Actions cron 도입 시점
- [ ] Secrets 관리 (현재 .env.local — Actions secrets 로 옮길지)
- [ ] 변경된 lib 파일들을 commit 할지 vs 별도 storage (R2 등)
- [ ] daily run 시간대 (KST 새벽 1시 vs 오전 9시 등)
