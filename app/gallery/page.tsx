"use client";

import { useEffect, useEffectEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type Artwork = {
  id: string;
  kid_name: string;
  title: string;
  public_image_path: string;
  private_image_path: string;
  created_at: string;
  public_until: string | null;
};

type ViewerArtwork = {
  kid_name: string;
  title: string;
  public_until: string | null;
};

const PAGE_SIZE = 24;

function formatKoreanDate(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function daysLeft(iso: string | null) {
  if (!iso) return null;
  const t = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(t)) return null;
  return Math.ceil(t / (24 * 60 * 60 * 1000));
}

export default function GalleryPage() {
  const router = useRouter();

  const [items, setItems] = useState<Artwork[]>([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerSrc, setViewerSrc] = useState("");
  const [viewerArt, setViewerArt] = useState<ViewerArtwork | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const openViewer = (art: ViewerArtwork, src: string, index: number) => {
    setViewerSrc(src);
    setViewerArt(art);
    setViewerIndex(index);
    setViewerOpen(true);
  };

  const closeViewer = () => {
    setViewerOpen(false);
    setViewerSrc("");
    setViewerArt(null);
    setViewerIndex(null);
  };

  const canMovePrev = viewerIndex != null && viewerIndex > 0;
  const canMoveNext = viewerIndex != null && viewerIndex < items.length - 1;

  const moveViewer = (direction: -1 | 1) => {
    if (viewerIndex == null) return;
    const nextIndex = viewerIndex + direction;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    const nextArt = items[nextIndex];
    const nextSrc = nextArt.public_image_path || nextArt.private_image_path;
    setViewerIndex(nextIndex);
    setViewerSrc(nextSrc);
    setViewerArt({
      kid_name: nextArt.kid_name,
      title: nextArt.title,
      public_until: nextArt.public_until,
    });
  };

  const moveViewerEvent = useEffectEvent((direction: -1 | 1) => {
    moveViewer(direction);
  });

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedItems = useMemo(
    () => items.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [currentPage, items]
  );

  useEffect(() => {
    if (!viewerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeViewer();
      if (e.key === "ArrowLeft") moveViewerEvent(-1);
      if (e.key === "ArrowRight") moveViewerEvent(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewerOpen]);

  const load = async () => {
    setMsg("불러오는 중...");

    try {
      await supabase.rpc("expire_public_artworks");
    } catch {}

    const { data, error } = await supabase
      .from("artworks")
      .select("id, kid_name, title, public_image_path, private_image_path, created_at, public_until")
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      setMsg("조회 실패: " + error.message);
      setItems([]);
      return;
    }

    setItems((data ?? []) as Artwork[]);
    setPage(1);
    setMsg("");
  };

  useEffect(() => {
    let alive = true;

    const run = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/login");
        return;
      }

      if (!alive) return;
      setLoading(true);
      await load();
      if (!alive) return;
      setLoading(false);
    };

    run();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) router.replace("/login");
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  return (
    <main className="wrap">
      <header className="header">
        <div>
          <div className="eyebrow">PUBLIC GALLERY</div>
          <h1 className="h1">공개 갤러리</h1>
          <p className="desc">
            가족들이 <b>전시 공개</b>를 켠 작품만 2주 동안 전시돼요.
          </p>
        </div>

        <div className="right">
          <Link className="ghost" href="/">
            메인으로
          </Link>
        </div>
      </header>

      {msg && <div className="notice">{msg}</div>}
      {loading && !msg && <div className="notice">불러오는 중...</div>}

      {!loading && items.length === 0 ? (
        <div className="empty">
          <div className="emptyTitle">전시 중인 작품이 없어요.</div>
          <div className="emptyDesc">가족 전시관에서 전시 공개를 켜면 여기에서 보여요.</div>
        </div>
      ) : (
        !loading && (
          <section className="grid">
            {pagedItems.map((a) => {
              const left = daysLeft(a.public_until);
              const leftText = left == null ? "" : left <= 0 ? "오늘 종료" : `${left}일 남음`;
              const imgSrc = a.public_image_path || a.private_image_path;
              const absoluteIndex = items.findIndex((item) => item.id === a.id);

              return (
                <article className="card" key={a.id}>
                  <div
                    className="thumbWrap"
                    role="button"
                    tabIndex={0}
                    onClick={() => openViewer({ kid_name: a.kid_name, title: a.title, public_until: a.public_until }, imgSrc, absoluteIndex)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && openViewer({ kid_name: a.kid_name, title: a.title, public_until: a.public_until }, imgSrc, absoluteIndex)
                    }
                    title="클릭하면 크게 보기"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="img" src={imgSrc} alt={a.title} loading="lazy" />
                    <div className="overlay">
                      <div className="overlayTop">
                        <div className="kid">{a.kid_name}</div>
                        {leftText ? <span className="pill">{leftText}</span> : null}
                      </div>
                      <div className="title">{a.title}</div>
                      <div className="overlayMeta">종료 {formatKoreanDate(a.public_until)}</div>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )
      )}

      {!loading && items.length > PAGE_SIZE && (
        <div className="pager">
          <button className="ghost" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={currentPage === 1}>
            이전
          </button>
          <div className="pagerText">
            {currentPage} / {totalPages}
          </div>
          <button className="ghost" onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages}>
            다음
          </button>
        </div>
      )}

      {viewerOpen && viewerArt && (
        <div className="modal" onClick={closeViewer} role="dialog" aria-modal="true">
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="modalTop">
              <div className="modalTitleWrap">
                <div className="modalEyebrow">{viewerArt.kid_name}</div>
                <div className="modalTitle">{viewerArt.title}</div>
              </div>
              <div className="modalActions">
                <button className="navBtn" onClick={() => moveViewer(-1)} disabled={!canMovePrev} aria-label="이전 작품">
                  이전
                </button>
                <button className="navBtn" onClick={() => moveViewer(1)} disabled={!canMoveNext} aria-label="다음 작품">
                  다음
                </button>
                <button className="modalClose" onClick={closeViewer} aria-label="닫기">
                  닫기
                </button>
              </div>
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="modalImg" src={viewerSrc} alt={viewerArt.title} />

            <div className="modalInfo">
              <div className="infoRow">
                <span className="infoKey">공개 종료</span>
                <span className="infoVal">{formatKoreanDate(viewerArt.public_until)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .wrap { padding: 38px; max-width: 1280px; margin: 0 auto; }
        .header { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; padding-bottom: 14px; border-bottom: 1px solid #eef0f3; }
        .eyebrow { font-size: 11px; letter-spacing: 0.18em; color: #6b7280; }
        .h1 { margin: 6px 0 6px; letter-spacing: -0.6px; font-size: 28px; }
        .desc { margin: 0; color: #6b7280; font-size: 14px; line-height: 1.45; }
        .right { display: flex; gap: 10px; align-items: center; }
        .ghost { font-size: 12px; padding: 8px 10px; border-radius: 12px; border: 1px solid #e5e7eb; background: #fff; color: #111827; text-decoration: none; font-weight: 700; }
        .notice { margin-top: 14px; padding: 10px 12px; border: 1px solid #eee; border-radius: 12px; background: #fff; color: #111827; font-size: 13px; }
        .empty { margin-top: 18px; border: 1px solid #eef0f3; border-radius: 16px; padding: 18px; background: #fafafa; }
        .emptyTitle { font-weight: 900; letter-spacing: -0.4px; }
        .emptyDesc { margin-top: 6px; font-size: 13px; color: #6b7280; line-height: 1.45; }
        .grid { margin-top: 16px; display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 14px; }
        .card { border: 1px solid #e8ebf0; border-radius: 18px; background: #fff; padding: 10px; box-shadow: 0 10px 24px rgba(17, 24, 39, 0.06); }
        .thumbWrap { position: relative; cursor: zoom-in; border-radius: 14px; overflow: hidden; }
        .overlay { position: absolute; inset: auto 0 0 0; padding: 10px; background: linear-gradient(180deg, rgba(17,24,39,0.04) 0%, rgba(17,24,39,0.74) 62%, rgba(17,24,39,0.92) 100%); color: #fff; }
        .overlayTop { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
        .kid { font-size: 12px; color: rgba(255,255,255,0.82); font-weight: 700; }
        .pill { font-size: 11px; padding: 3px 8px; border-radius: 999px; background: rgba(255,255,255,0.88); border: 1px solid rgba(255,255,255,0.4); color: #111827; font-weight: 800; }
        .title { font-weight: 900; letter-spacing: -0.3px; word-break: break-word; line-height: 1.25; }
        .overlayMeta { margin-top: 6px; font-size: 11px; color: rgba(255,255,255,0.78); font-weight: 700; }
        .img { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; display: block; background: #f3f4f6; border: 1px solid #f1f5f9; }
        .pager { margin-top: 16px; display: flex; align-items: center; justify-content: center; gap: 10px; }
        .pagerText { min-width: 72px; text-align: center; font-size: 12px; color: #6b7280; font-weight: 900; }
        .modal { position: fixed; inset: 0; background: rgba(17, 24, 39, 0.6); display: flex; align-items: center; justify-content: center; padding: 18px; z-index: 1000; }
        .modalCard { width: min(1080px, 100%); max-height: 92vh; background: #fff; border-radius: 16px; border: 1px solid rgba(0, 0, 0, 0.08); overflow: hidden; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18); }
        .modalTop { display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 12px 14px; border-bottom: 1px solid #eef0f3; }
        .modalTitleWrap { min-width: 0; }
        .modalEyebrow { font-size: 11px; color: #6b7280; font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase; }
        .modalTitle { font-weight: 900; letter-spacing: -0.3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .modalActions { display: flex; align-items: center; gap: 8px; }
        .navBtn { padding: 8px 10px; border-radius: 12px; border: 1px solid #e5e7eb; background: #fff; color: #111827; font-size: 12px; font-weight: 900; cursor: pointer; }
        .navBtn:disabled { opacity: 0.45; cursor: not-allowed; }
        .modalClose { padding: 8px 10px; border-radius: 12px; border: 1px solid #e5e7eb; background: #fff; color: #111827; font-size: 12px; font-weight: 900; cursor: pointer; }
        .modalImg { width: 100%; height: auto; max-height: calc(92vh - 146px); object-fit: contain; background: #111827; }
        .modalInfo { padding: 14px; border-top: 1px solid #eef0f3; background: #fff; }
        .infoRow { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
        .infoKey { font-size: 12px; color: #6b7280; font-weight: 800; }
        .infoVal { font-size: 13px; color: #111827; font-weight: 900; text-align: right; }

        @media (max-width: 720px) {
          .wrap { padding: 18px; }
          .header { align-items: flex-start; }
          .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        }
      `}</style>
    </main>
  );
}
