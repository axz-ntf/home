import Link from "next/link";
import { notFound } from "next/navigation";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getAllTips, getTip, thumbClass } from "@/lib/tips";
import "../../m/tokens.css";
import "../../m/mobile.css";
import "../tips.css";
import "./post.css";

export function generateStaticParams() {
  return getAllTips().map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getTip(slug);
  if (!post) return {};
  return {
    title: `${post.title} — 주거 가이드 | 다음부동산`,
    description: post.summary,
  };
}

export default async function TipPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getTip(slug);
  if (!post) notFound();

  const related = getAllTips().filter((p) => p.slug !== slug).slice(0, 3);

  return (
    // body 가 overflow:hidden(지도 풀스크린용)이라 이 페이지는 자체 스크롤 컨테이너로 둔다.
    <div style={{ height: "100dvh", overflowY: "auto" }}>
      <div className="post-page">
        <header className="post-nav">
          <Link href="/tips" style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none", color: "inherit" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="다음" width={24} height={24} />
            <strong style={{ fontSize: 16, letterSpacing: "-0.02em" }}>주거 가이드</strong>
          </Link>
        </header>

        <div className="post-head">
          <div className="post-meta">
            {post.tags[0] && <span>{post.tags[0]}</span>}
            {post.tags[0] && post.date && <span className="dot" aria-hidden="true" />}
            {post.date && <time dateTime={post.date}>{post.date.replace(/-/g, ". ")}.</time>}
          </div>
          <h1 className="post-title">{post.title}</h1>
        </div>

        {post.cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="post-cover" src={post.cover} alt={post.title} />
        )}

        <article className="tip-post">
          <Markdown remarkPlugins={[remarkGfm]}>{post.content}</Markdown>
        </article>

        <section className="post-cta">
          <strong className="post-cta-text">내 조건에 맞는 공고가 궁금하다면</strong>
          <Link href="/" className="post-cta-btn">지도에서 공고 보기 →</Link>
        </section>

        <Link href="/tips" className="post-home">콘텐츠 홈 돌아가기</Link>

        {related.length > 0 && (
          <section className="post-related">
            <h2>연관 콘텐츠</h2>
            <div className="tips-grid">
              {related.map((p) => (
                <Link key={p.slug} href={`/tips/${p.slug}`} className="tip-card">
                  <div
                    className={`tip-card-thumb ${p.cover ? "" : thumbClass(p.slug)}`}
                    style={p.cover ? { backgroundImage: `url(${p.cover})` } : undefined}
                  >
                    {!p.cover && <span className="tip-card-thumb-label">{p.tags[0] ?? "주거 가이드"}</span>}
                  </div>
                  <strong className="tip-card-title">{p.title}</strong>
                  {p.summary && <p className="tip-card-desc">{p.summary}</p>}
                  {p.tags.length > 0 && (
                    <div className="tip-card-tags">
                      {p.tags.map((t) => <span key={t} className="tip-chip">{t}</span>)}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
