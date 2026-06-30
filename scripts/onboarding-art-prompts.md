# 온보딩 마스코트 8컷 생성 프롬프트

캐릭터를 ChatGPT(또는 다른 이미지 생성)로 직접 뽑을 때 쓰는 프롬프트.
**핵심: 모든 컷에 아래 "스타일 고정문"을 그대로 붙이고, 포즈 문장만 바꿔서** 캐릭터가 컷마다 달라지지 않게 한다.

- 출력: **정사각 1024×1024, 배경 투명 PNG**
- 저장 위치: `public/onboarding/{파일명}.png` (아래 표의 파일명 그대로)
- 첫 컷(`greet.png`)을 먼저 만든 뒤, 나머지는 "이 캐릭터 그대로, 포즈만 바꿔서"라고 레퍼런스로 넣으면 일관성이 가장 좋다.

> 자동 생성도 가능: 유효한 `OPENAI_API_KEY`를 `cheap/.env.local`에 넣고
> `node scripts/gen-onboarding-art.mjs` 실행 (gpt-image-1, 따옴표·`\n` 없이 키 입력).

---

## 스타일 고정문 (모든 컷 공통, 그대로 복붙)

```
Mascot character for a friendly Korean housing app. The mascot is a cute rounded
house-buddy: a soft squircle body shaped like a cozy little house with a small
triangular roof, a smooth blue gradient body (from #4784FE to #47A9FF), simple
round black dot eyes, a tiny cheerful smile, rosy cheeks, and short rounded stubby
arms. Flat modern vector illustration, minimal, thick soft shapes, smooth clean
edges, no harsh outlines, 2-3 color palette (blue + white + one soft warm accent),
soft and approachable, centered in frame with generous padding, fully transparent
background. Square 1024x1024.
```

---

## 컷별 포즈 (위 고정문 뒤에 한 줄 덧붙임)

| 파일명 | 화면(질문) | 포즈 프롬프트 |
|---|---|---|
| `greet.png` | 나이 (첫 화면) | `Pose: waving hello with one stubby arm raised, looking cheerful and welcoming.` |
| `heart.png` | 혼인 상태 | `Pose: gently holding a small soft pink heart with both arms, looking warm.` |
| `family.png` | 세대원 수 | `Pose: standing next to two smaller identical mini house-buddy characters, like a little family.` |
| `key.png` | 주택 소유 | `Pose: proudly holding up a single cute golden house key.` |
| `thumbsup.png` | 우선공급 해당사항 | `Pose: giving a confident thumbs up with one arm, with a small checkmark badge nearby.` |
| `coin.png` | 월소득 / 총자산 (공용) | `Pose: hugging a small piggy bank with a gold coin, looking happy about savings.` |
| `map.png` | 거주 지역 | `Pose: holding a folded map with a red location pin marker on it.` |
| `celebrate.png` | 완료 화면 | `Pose: celebrating with both arms raised high, small confetti pieces around it, very happy.` |

---

PNG를 `public/onboarding/`에 넣기만 하면 온보딩 화면에 자동으로 표시됨.
파일이 없으면 그 자리에 임시 이모지 플레이스홀더가 보인다 (앱은 정상 동작).
