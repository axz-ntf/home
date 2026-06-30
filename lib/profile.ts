import type { EligibilityForm } from "./eligibility";
import { judge } from "./eligibility";
import { createClient } from "./supabase/client";

const MARRIED_LABEL: Record<string, string> = { single: "미혼", yes: "기혼", planning: "예비부부" };
const REGION_LABEL: Record<string, string> = { seoul: "서울", gyeonggi: "경기", incheon: "인천", other: "기타" };
const SPECIAL_LABEL: Record<string, string> = {
  student: "대학생",
  children: "자녀 있음",
  multichild: "다자녀(3명 이상)",
  parentcare: "노부모 부양",
  disabled: "장애인",
  veteran: "국가유공자",
};

// AI 챗 system 프롬프트에 주입할 사용자 자격 요약. 나이 미입력이면 null.
export function summarizeEligibility(form: EligibilityForm): string | null {
  if (!form.age) return null;
  const j = judge(form);
  const lines = [
    `- 나이: 만 ${form.age}세`,
    `- 혼인: ${MARRIED_LABEL[form.married] ?? "미입력"}${
      form.married === "yes" && form.marriedYears ? ` (혼인 ${form.marriedYears}년차)` : ""
    }`,
    `- 세대 구성: ${form.household}인`,
    `- 주택 소유: ${form.houseOwner === "no" ? "무주택" : "유주택"}`,
    `- 거주 지역: ${REGION_LABEL[form.region] ?? form.region}`,
  ];
  if (form.income) lines.push(`- 월평균 소득: ${form.income}만원 (도시근로자 ${j.incomeRatio}%)`);
  if (form.assets) lines.push(`- 총자산: ${form.assets}만원`);
  const special = form.specialCase.map((c) => SPECIAL_LABEL[c]).filter(Boolean);
  if (special.length) lines.push(`- 우선공급 해당: ${special.join(", ")}`);
  const eligible = j.results.filter((r) => r.status === "eligible").map((r) => r.name);
  if (eligible.length) lines.push(`- 사전 판정상 신청 가능 유형: ${eligible.join(", ")}`);
  return lines.join("\n");
}

// public.profiles 행(snake_case) ↔ EligibilityForm(camelCase) 매핑.
type ProfileRow = {
  age: string | null;
  married: string | null;
  married_years: string | null;
  household: string | null;
  income: string | null;
  assets: string | null;
  house_owner: string | null;
  region: string | null;
  special_case: string[] | null;
};

function rowToForm(row: ProfileRow): EligibilityForm {
  return {
    age: row.age ?? "",
    married: row.married ?? "",
    marriedYears: row.married_years ?? "",
    household: row.household ?? "2",
    income: row.income ?? "",
    assets: row.assets ?? "",
    houseOwner: row.house_owner ?? "no",
    region: row.region ?? "seoul",
    specialCase: row.special_case ?? [],
  };
}

function formToRow(form: EligibilityForm) {
  return {
    age: form.age,
    married: form.married,
    married_years: form.marriedYears,
    household: form.household,
    income: form.income,
    assets: form.assets,
    house_owner: form.houseOwner,
    region: form.region,
    special_case: form.specialCase,
  };
}

// 로그인 사용자의 저장된 자격을 로드. 미로그인이거나 아직 입력 전(age 비어있음)이면 null.
export async function loadProfile(): Promise<EligibilityForm | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!data || !data.age) return null;
  return rowToForm(data as ProfileRow);
}

// 닉네임만 로드 (자격 입력 전이어도 가져옴). 미로그인/없음이면 null.
export async function loadNickname(): Promise<string | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("nickname").eq("id", user.id).maybeSingle();
  return data?.nickname ?? null;
}

// 프로필 화면용 — getUser 1회 + profiles 쿼리 1회로 폼·닉네임·이메일·로그인여부를 한 번에.
// (loadProfile + loadNickname 을 따로 부르면 getUser 가 3번 돌아 느려짐.)
export async function loadProfileFull(): Promise<{
  loggedIn: boolean; email: string | null; form: EligibilityForm | null; nickname: string | null;
}> {
  const supabase = createClient();
  // getSession 은 로컬 스토리지에서 즉시 — getUser(네트워크 검증)보다 빠름. RLS 가 데이터 보호.
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return { loggedIn: false, email: null, form: null, nickname: null };
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  const row = data as ProfileRow & { nickname?: string | null } | null;
  return {
    loggedIn: true,
    email: user.email ?? null,
    form: row && row.age ? rowToForm(row) : null,
    nickname: row?.nickname ?? null,
  };
}

// 자격을 profiles 에 upsert. nickname 은 전달 시에만 함께 저장. 미로그인이면 에러 반환.
export async function saveProfile(
  form: EligibilityForm,
  nickname?: string,
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요해요." };
  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    ...formToRow(form),
    ...(nickname !== undefined && { nickname: nickname.trim() || null }),
    updated_at: new Date().toISOString(),
  });
  return { error: error?.message ?? null };
}
