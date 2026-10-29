"use client";

import { useId, useState } from "react";
import type { ListingPhoto } from "@/lib/types";
import { MATERIAL_LABELS, type MaterialKind } from "@/lib/notice-materials";
import { Button } from "./button";
import { DdsIcon } from "./dds-icon";
import "./notice-attachments.css";

const PREVIEW_SIZE = 3;
const PAGE_SIZE = 5;

function isNotice(file: ListingPhoto) {
  if (file.kind === "notice") return true;
  const name = file.name ?? "";
  return ["PDF", "HWP", "HWPX"].includes(format(file) ?? "") &&
    /공고문|(?:예비)?입주자\s*모집/.test(name) &&
    !/서식|양식|팸플릿|팜플렛|리플릿|평면|배치/.test(name);
}

function format(file: ListingPhoto) {
  return file.name?.match(/\.(pdf|hwpx?|xlsx?|zip|jpe?g|png)$/i)?.[1].toUpperCase();
}

function priority(file: ListingPhoto) {
  return isNotice(file) ? (format(file) === "PDF" ? 0 : 1) : 2;
}

/** Compact preview; every original URL remains available through the page controls. */
export function NoticeAttachments({ files }: { files: ListingPhoto[] }) {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(0);
  const id = useId();
  // Different files can share a name. Only identical URLs are duplicates.
  const unique = [...new Map(files.map(file => [file.url, file])).values()]
    .sort((a, b) => priority(a) - priority(b));
  if (!unique.length) return null;

  const totalPages = Math.ceil(unique.length / PAGE_SIZE);
  const currentPage = Math.min(page, totalPages - 1);
  const start = expanded ? currentPage * PAGE_SIZE : 0;
  const visible = unique.slice(start, start + (expanded ? PAGE_SIZE : PREVIEW_SIZE));
  const hasMore = unique.length > PREVIEW_SIZE;

  return <section className="detail-section notice-attachments" aria-labelledby={`${id}-title`}>
    <div className="notice-attachments-heading">
      <h3 id={`${id}-title`}>공식 첨부자료 <span>{unique.length}개</span></h3>
      <span className="notice-attachments-hint">공고문 우선</span>
    </div>
    <p className="notice-attachments-description">공고 전체 자료예요. 파일 안의 단지명과 주택형을 확인하세요.</p>
    <ul className="notice-attachments-list" id={`${id}-list`}>
      {visible.map(file => {
        const label = isNotice(file) ? "공고문" : MATERIAL_LABELS[file.kind as MaterialKind] ?? "첨부자료";
        const extension = format(file);
        return <li key={file.url}>
          <a className="notice-attachment" href={file.url} target="_blank" rel="noreferrer" title={file.name ?? label}>
            <span className="notice-attachment-icon"><DdsIcon name={isNotice(file) ? "summary" : "contents"} size={20} /></span>
            <span className="notice-attachment-text">
              <span className="notice-attachment-meta">{label}{extension ? ` · ${extension}` : ""}</span>
              <span className="notice-attachment-name">{file.name || label}</span>
            </span>
            <DdsIcon name="arrow-up-right" size={16} />
            <span className="notice-attachment-sr">새 창에서 열기</span>
          </a>
        </li>;
      })}
    </ul>
    {expanded && totalPages > 1 && <nav className="notice-attachments-pages" aria-label="첨부자료 페이지">
      <span aria-live="polite">{start + 1}–{start + visible.length} / {unique.length}개</span>
      <div>
        <Button size="sm" variant="outline" color="ghost" aria-label="이전 첨부자료" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><DdsIcon name="chevron-left" size={16} /></Button>
        <span>{currentPage + 1} / {totalPages}</span>
        <Button size="sm" variant="outline" color="ghost" aria-label="다음 첨부자료" disabled={currentPage === totalPages - 1} onClick={() => setPage(currentPage + 1)}><DdsIcon name="chevron-right" size={16} /></Button>
      </div>
    </nav>}
    {hasMore && <Button className="notice-attachments-toggle" size="md" variant="outline" color="ghost" fullWidth
      aria-expanded={expanded} aria-controls={`${id}-list`}
      trailingIcon={<DdsIcon name={expanded ? "chevron-up" : "chevron-down"} size={16} />}
      onClick={() => { setExpanded(!expanded); setPage(0); }}>
      {expanded ? "간략히 보기" : `전체 ${unique.length}개 보기`}
    </Button>}
  </section>;
}
