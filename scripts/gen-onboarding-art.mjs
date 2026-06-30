// 온보딩 마스코트 캐릭터 생성 (OpenAI gpt-image-1).
// 1) master(greet) 컷을 생성 → public/onboarding/greet.png
// 2) 나머지 컷은 master를 레퍼런스(images/edits)로 넣어 동일 캐릭터·포즈만 변경.
// 투명 배경 PNG, 1024x1024.
//
// 실행:
//   node scripts/gen-onboarding-art.mjs greet      # master만
//   node scripts/gen-onboarding-art.mjs            # 전체(없는 것만)
//   node scripts/gen-onboarding-art.mjs --force key # 특정 컷 재생성
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public/onboarding");
fs.mkdirSync(OUT, { recursive: true });

// .env.local에서 OPENAI_API_KEY 로드
const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
const KEY = (env.match(/^OPENAI_API_KEY=(.*)$/m)?.[1] || "")
  .trim()
  .replace(/^["']|["']$/g, "") // 양쪽 따옴표 제거
  .replace(/\\n$/, "") // 끝에 붙은 리터럴 \n 제거
  .trim();
if (!KEY) throw new Error("OPENAI_API_KEY 없음 (.env.local)");

// 모든 컷이 공유하는 캐릭터 스타일 — 절대 바꾸지 말 것.
const STYLE =
  "Mascot character for a friendly Korean housing app. The mascot is a cute rounded house-buddy: " +
  "a soft squircle body shaped like a cozy little house with a small triangular roof, a smooth blue " +
  "gradient body (from #4784FE to #47A9FF), simple round black dot eyes, a tiny cheerful smile, rosy " +
  "cheeks, and short rounded stubby arms. Flat modern vector illustration, minimal, thick soft shapes, " +
  "smooth clean edges, no harsh outlines, 2-3 color palette (blue + white + one soft warm accent), " +
  "soft and approachable, centered in frame with generous padding, fully transparent background.";

const SCENES = {
  greet: "The mascot waving hello with one stubby arm raised, looking cheerful and welcoming.",
  heart: "The mascot gently holding a small soft pink heart with both arms, looking warm.",
  family: "The mascot standing next to two smaller identical mini house-buddy characters, like a little family.",
  key: "The mascot proudly holding up a single cute golden house key.",
  thumbsup: "The mascot giving a confident thumbs up with one arm, with a small checkmark badge nearby.",
  coin: "The mascot hugging a small piggy bank with a gold coin, looking happy about savings.",
  map: "The mascot holding a folded map with a red location pin marker on it.",
  celebrate: "The mascot celebrating with both arms raised high, small confetti pieces around it, very happy.",
};

const MASTER = "greet";
const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.filter((a) => a !== "--force");

async function callImages(endpoint, body, isForm) {
  const headers = { Authorization: `Bearer ${KEY}` };
  let payload;
  if (isForm) {
    payload = body; // FormData
  } else {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const r = await fetch(`https://api.openai.com/v1/images/${endpoint}`, {
    method: "POST",
    headers,
    body: payload,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${data.error?.message || JSON.stringify(data).slice(0, 300)}`);
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("이미지 데이터 없음");
  return Buffer.from(b64, "base64");
}

async function genMaster() {
  console.log("master(greet) 생성 중…");
  const buf = await callImages("generations", {
    model: "gpt-image-1",
    prompt: `${STYLE}\n\nPose: ${SCENES.greet}`,
    n: 1,
    size: "1024x1024",
    background: "transparent",
  });
  fs.writeFileSync(path.join(OUT, "greet.png"), buf);
  console.log("  ✓ greet.png");
}

async function genFromMaster(key) {
  const masterPath = path.join(OUT, "greet.png");
  const form = new FormData();
  form.append("model", "gpt-image-1");
  form.append("size", "1024x1024");
  form.append("background", "transparent");
  form.append(
    "prompt",
    `Keep the exact same mascot character from the reference image — same body shape, same colors, ` +
      `same face and proportions. Only change the pose. ${SCENES[key]} Fully transparent background.`,
  );
  const bytes = fs.readFileSync(masterPath);
  form.append("image", new Blob([bytes], { type: "image/png" }), "greet.png");
  const buf = await callImages("edits", form, true);
  fs.writeFileSync(path.join(OUT, `${key}.png`), buf);
  console.log(`  ✓ ${key}.png`);
}

const wanted = only.length ? only : Object.keys(SCENES);

for (const key of wanted) {
  if (!SCENES[key]) {
    console.log(`(스킵) 알 수 없는 컷: ${key}`);
    continue;
  }
  const file = path.join(OUT, `${key}.png`);
  if (fs.existsSync(file) && !force) {
    console.log(`(있음) ${key}.png — 스킵`);
    continue;
  }
  try {
    if (key === MASTER) await genMaster();
    else {
      if (!fs.existsSync(path.join(OUT, "greet.png"))) {
        console.log(`(대기) master(greet) 먼저 생성 필요 — ${key} 스킵`);
        continue;
      }
      console.log(`${key} 생성 중…`);
      await genFromMaster(key);
    }
  } catch (e) {
    console.error(`  ✗ ${key}: ${e.message}`);
  }
}
console.log("완료.");
