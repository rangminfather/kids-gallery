"use client";

import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

type Entry = {
  id: string;
  display_name: string;
  content: string;
  created_at: string;
};

type ArtworkRowFromRPC = {
  id: string;
  kid_name: string;
  title: string;
  private_image_path: string;
  created_at: string;
  artwork_made_at: string | null;
};

type ArtworkView = {
  id: string;
  kid_name: string;
  title: string;
  image_url: string;
  created_at: string;
  artwork_made_at: string | null;
};

const PAGE_SIZE = 24;

function fmt(iso: string | null | undefined) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function toImageUrlFromRow(a: ArtworkRowFromRPC) {
  const v = (a.private_image_path ?? "").trim();
  if (!v) return "";
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  const { data } = supabase.storage.from("artworks").getPublicUrl(v);
  return data.publicUrl;
}

export default function InvitePage() {
  const params = useParams<{ token?: string }>();

  const token = useMemo(() => {
    const t = params?.token;
    if (!t) return "";
    return Array.isArray(t) ? t[0] : t;
  }, [params]);

  const [artworks, setArtworks] = useState<ArtworkView[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");

  const [status, setStatus] = useState("불러오는 중...");
  const [debug, setDebug] = useState("");

  const [loading, setLoading] = useState(true);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [page, setPage] = useState(1);

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerSrc, setViewerSrc] = useState("");
  const [viewerArt, setViewerArt] = useState<ArtworkView | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const openViewer = (art: ArtworkView, index: number) => {
    setViewerSrc(art.image_url);
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
  const canMoveNext = viewerIndex != null && viewerIndex < artworks.length - 1;

  const moveViewer = (direction: -1 | 1) => {
    if (viewerIndex == null) return;
    const nextIndex = viewerIndex + direction;
    if (nextIndex < 0 || nextIndex >= artworks.length) return;
    const nextArt = artworks[nextIndex];
    setViewerIndex(nextIndex);
    setViewerSrc(nextArt.image_url);
    setViewerArt(nextArt);
  };

  const moveViewerEvent = useEffectEvent((direction: -1 | 1) => {
    moveViewer(direction);
  });

  const totalPages = Math.max(1, Math.ceil(artworks.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedArtworks = useMemo(
    () => artworks.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [artworks, currentPage]
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

  const loadArtworks = async (): Promise<{ ok: boolean; count: number }> => {
    const { data, error } = await supabase.rpc("get_artworks_by_token", { p_token: token });

    if (error) {
      setArtworks([]);
      setDebug((prev) => (prev ? prev : "") + `\n[get_artworks_by_token] ${error.message}`);
      return { ok: false, count: 0 };
    }

    const rows = (data ?? []) as ArtworkRowFromRPC[];
    const mapped: ArtworkView[] = rows.map((a) => ({
      id: a.id,
      kid_name: a.kid_name,
      title: a.title,
      image_url: toImageUrlFromRow(a),
      created_at: a.created_at,
      artwork_made_at: a.artwork_made_at ?? null,
    }));

    setArtworks(mapped);
    setPage(1);
    return { ok: true, count: mapped.length };
  };

  const loadGuestbook = async (): Promise<{ ok: boolean; count: number }> => {
    const { data, error } = await supabase.rpc("get_guestbook_entries_by_token", { p_token: token });

    if (error) {
      setEntries([]);
      setDebug((prev) => (prev ? prev : "") + `\n[get_guestbook_entries_by_token] ${error.message}`);
      return { ok: false, count: 0 };
    }

    const list = (data ?? []) as Entry[];
    setEntries(list);
    return { ok: true, count: list.length };
  };

  const loadAll = async () => {
    if (!token || token.trim().length < 6) {
      setLoading(false);
      setStatus("초대 링크가 올바르지 않습니다.");
      setDebug((prev) => (prev ? prev : "") + `\n[token] invalid or missing: "${token}"`);
      setArtworks([]);
      setEntries([]);
      return;
    }

    setLoading(true);
    setStatus("불러오는 중...");
    setDebug("");

    const [guestRes, artRes] = await Promise.all([loadGuestbook(), loadArtworks()]);

    if (!guestRes.ok || !artRes.ok) {
      setLoading(false);
      setStatus("초대 링크를 불러오지 못했습니다. 아래 디버그 정보를 확인해 주세요.");
      return;
    }

    setStatus(artRes.count === 0 ? "전시된 작품이 아직 없어요." : "");
    setLoading(false);
  };

  const loadAllEvent = useEffectEvent(() => {
    void loadAll();
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadAllEvent();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [token]);

  const submit = async () => {
    if (submitBusy) return;

    if (!token) {
      alert("초대 링크가 올바르지 않습니다.");
      return;
    }
    if (!name.trim() || !content.trim()) {
      alert("이름과 내용을 입력해 주세요.");
      return;
    }

    setSubmitBusy(true);
    setStatus("등록 중...");

    const { data, error } = await supabase.rpc("add_guestbook_entry", {
      p_token: token,
      p_display_name: name.trim(),
      p_content: content.trim(),
    });

    if (error) {
      setStatus("등록 실패: " + error.message);
      setDebug((prev) => (prev ? prev : "") + `\n[add_guestbook_entry] ${error.message}`);
      setSubmitBusy(false);
      return;
    }

    const newEntry = data as unknown as Entry;
    setEntries((prev) => [newEntry, ...prev]);
    setName("");
    setContent("");
    setStatus("남겨졌어요!");
    setSubmitBusy(false);
    setTimeout(() => setStatus(""), 1200);
  };

  return (
    <main className="wrap">
      <header className="header">
        <div>
          <div className="eyebrow">INVITE</div>
          <h1 className="h1">가족 전시관</h1>
          <p className="desc">작품을 보고, 따뜻한 마음을 남겨주세요.</p>
        </div>
        <div className="right" />
      </header>

      {status && <div className="notice">{status}</div>}
      {loading && !status && <div className="notice">불러오는 중...</div>}

      {debug && (
        <details className="debug" open>
          <summary>디버그 정보</summary>
          <pre className="pre">{debug}</pre>
        </details>
      )}

      <section className="section">
        <div className="secTitle">작품</div>

        {artworks.length === 0 ? (
          <div className="empty">
            <div className="emptyTitle">전시된 작품이 없어요.</div>
            <div className="emptyDesc">가족이 작품을 공개하면 여기에서 볼 수 있어요.</div>
          </div>
        ) : (
          <div className="grid">
            {pagedArtworks.map((a) => (
              <article className="card" key={a.id}>
                {(() => {
                  const absoluteIndex = artworks.findIndex((item) => item.id === a.id);
                  return (
                <div
                  className="thumbWrap"
                  role="button"
                  tabIndex={0}
                  onClick={() => openViewer(a, absoluteIndex)}
                  onKeyDown={(e) => e.key === "Enter" && openViewer(a, absoluteIndex)}
                  title="클릭하면 크게 보기"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="img"
                    src={a.image_url}
                    alt={a.title}
                    loading="lazy"
                    onError={() => {
                      setDebug((prev) => (prev ? prev : "") + `\n[img_error] ${a.image_url || "(empty url)"}`);
                    }}
                  />
                  <div className="overlay">
                    <div className="overlayTop">
                      <div className="kid">{a.kid_name}</div>
                    </div>
                    <div className="title">{a.title}</div>
                    <div className="overlayMeta">작품제작일 {fmt(a.artwork_made_at ?? a.created_at)}</div>
                  </div>
                </div>
                  );
                })()}
              </article>
            ))}
          </div>
        )}
      </section>

      {artworks.length > PAGE_SIZE && (
        <div className="pager">
          <button className="pageBtn" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={currentPage === 1}>
            이전
          </button>
          <div className="pagerText">
            {currentPage} / {totalPages}
          </div>
          <button className="pageBtn" onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages}>
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
                <span className="infoKey">작품제작일</span>
                <span className="infoVal">{fmt(viewerArt.artwork_made_at ?? viewerArt.created_at)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <section className="section">
        <div className="secTitle">방명록 남기기</div>

        <div className="guestbox">
          <div className="field">
            <label className="label">이름</label>
            <input className="input" placeholder="예: 외할머니" value={name} onChange={(e) => setName(e.target.value)} disabled={submitBusy} />
          </div>

          <div className="field">
            <label className="label">내용</label>
            <textarea
              className="textarea"
              placeholder="예쁜 작품 잘 봤어요"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              disabled={submitBusy}
            />
          </div>

          <div className="actions">
            <button className="primary" onClick={submit} disabled={submitBusy}>
              {submitBusy ? "등록 중..." : "남기기"}
            </button>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="secTitle">최근 방명록</div>

        {entries.length === 0 ? (
          <div className="empty">
            <div className="emptyTitle">아직 방명록이 없어요.</div>
            <div className="emptyDesc">첫 메시지를 남겨주세요.</div>
          </div>
        ) : (
          <div className="list">
            {entries.map((e) => (
              <div className="entry" key={e.id}>
                <div className="entryTop">
                  <div className="who">{e.display_name}</div>
                  <div className="when">{fmt(e.created_at)}</div>
                </div>
                <div className="entryContent">{e.content}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <style jsx>{`
        .wrap { padding: 38px; max-width: 1280px; margin: 0 auto; }
        .header { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; padding-bottom: 14px; border-bottom: 1px solid #eef0f3; }
        .eyebrow { font-size: 11px; letter-spacing: 0.18em; color: #6b7280; }
        .h1 { margin: 6px 0 6px; letter-spacing: -0.6px; font-size: 28px; }
        .desc { margin: 0; color: #6b7280; font-size: 14px; line-height: 1.45; }
        .right { min-height: 1px; }
        .notice { margin-top: 14px; padding: 10px 12px; border: 1px solid #eee; border-radius: 12px; background: #fff; color: #111827; font-size: 13px; }
        .debug { margin-top: 12px; border: 1px solid #fee2e2; background: #fff7ed; border-radius: 12px; padding: 10px 12px; }
        .pre { margin: 8px 0 0; white-space: pre-wrap; word-break: break-word; font-size: 12px; }
        .section { margin-top: 18px; }
        .secTitle { font-weight: 900; letter-spacing: -0.3px; margin-bottom: 10px; }
        .empty { border: 1px solid #eef0f3; border-radius: 16px; padding: 18px; background: #fafafa; }
        .emptyTitle { font-weight: 900; letter-spacing: -0.4px; }
        .emptyDesc { margin-top: 6px; font-size: 13px; color: #6b7280; line-height: 1.45; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 14px; }
        .card { border: 1px solid #e8ebf0; border-radius: 18px; background: #fff; padding: 10px; box-shadow: 0 10px 24px rgba(17, 24, 39, 0.06); }
        .thumbWrap { position: relative; cursor: zoom-in; border-radius: 14px; overflow: hidden; }
        .overlay { position: absolute; inset: auto 0 0 0; padding: 10px; background: linear-gradient(180deg, rgba(17,24,39,0.04) 0%, rgba(17,24,39,0.74) 62%, rgba(17,24,39,0.92) 100%); color: #fff; }
        .overlayTop { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
        .kid { font-size: 12px; color: rgba(255,255,255,0.82); font-weight: 800; }
        .title { font-weight: 900; letter-spacing: -0.3px; word-break: break-word; line-height: 1.25; }
        .overlayMeta { margin-top: 6px; font-size: 11px; color: rgba(255,255,255,0.78); font-weight: 700; }
        .img { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; display: block; background: #f3f4f6; border: 1px solid #f1f5f9; }
        .pager { margin-top: -4px; display: flex; align-items: center; justify-content: center; gap: 10px; }
        .pageBtn { padding: 10px 12px; border-radius: 12px; border: 1px solid #e5e7eb; background: #fff; color: #111827; font-size: 12px; font-weight: 900; cursor: pointer; }
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
        .guestbox { border: 1px solid #e8ebf0; border-radius: 16px; background: #fff; padding: 14px; box-shadow: 0 1px 0 rgba(17, 24, 39, 0.04); }
        .field { display: grid; gap: 6px; margin-top: 10px; }
        .label { font-size: 12px; color: #6b7280; font-weight: 800; }
        .input { padding: 11px 12px; border-radius: 14px; border: 1px solid #e5e7eb; background: #fff; outline: none; font-size: 13px; }
        .textarea { padding: 11px 12px; border-radius: 14px; border: 1px solid #e5e7eb; background: #fff; outline: none; font-size: 13px; resize: vertical; }
        .actions { margin-top: 12px; display: flex; justify-content: flex-end; }
        .primary { padding: 11px 14px; border-radius: 14px; border: 1px solid rgba(0,0,0,0.08); background: #111827; color: #fff; font-size: 13px; font-weight: 900; cursor: pointer; }
        .primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .list { display: grid; gap: 10px; }
        .entry { border: 1px solid #e8ebf0; border-radius: 16px; background: #fff; padding: 12px; box-shadow: 0 1px 0 rgba(17, 24, 39, 0.04); }
        .entryTop { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
        .who { font-weight: 900; letter-spacing: -0.2px; }
        .when { font-size: 12px; color: #6b7280; font-weight: 800; white-space: nowrap; }
        .entryContent { margin-top: 6px; line-height: 1.55; }

        @media (max-width: 720px) {
          .wrap { padding: 18px; }
          .header { align-items: flex-start; }
          .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        }
      `}</style>
    </main>
  );
}
