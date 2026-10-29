// Client-safe exports: never pull the filesystem or crypto into the admin editor bundle.
export type { CatalogNote, DatasetId } from "./housing-catalog";
export const NOTE_STATES = { none: "미지정", watch: "관심 데이터", check: "확인 필요", done: "확인 완료" } as const;
