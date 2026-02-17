"use client";

import { useEffect, useMemo, useState } from "react";
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
  is_public?: boolean;
  public_until?: string | null;
};

type ArtworkView = {
  id: string;
  kid_name: string;
  title: string;
  image_url: string;
  created_at: string;
  artwork_made_at: string | null;
};

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

  // path만 저장된 케이스 대응
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

  const [status, setStatus] = useState<string>("불러오는 중...");
  const [debug, setDebug] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [submitBusy, setSubmitBusy] = useState(false);

  // ✅ (추가) 이미지 확대 모달 상태
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerSrc, setViewerSrc] = useState<string>("");
  const [viewerTitle, setViewerTitle] = useState<string>("");

  const openViewer = (src: string, title: string) => {
    setViewerSrc(src);
    setViewerTitle(title);
    setViewerOpen(true);
  };

  const closeViewer = () => {
    setViewerOpen(false);
    setViewerSrc("");
    setViewerTitle("");
  };

  // ✅ (추가) ESC로 닫기
  useEffect(() => {
    if (!viewerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeViewer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerOpen]);

  // ✅ RPC 호출 결과를 "개수"까지 반환해서, state 타이밍 이슈 제거
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
    // ✅ 토큰 기본 검증
    if (!token || token.trim().length < 6) {
      setLoading(false);
      setStatus("❌ 초대 링크가 올바르지 않습니다.");
      setDebug((prev) => (prev ? prev : "") + `\n[token] invalid or missing: "${token}"`);
      setArtworks([]);
      setEntries([]);
      return;
    }

    setLoading(true);
    setStatus("불러오는 중...");
    setDebug("");

    const [guestRes, artRes] = await Promise.all([loadGuestbook(), loadArtworks()]);

    // ✅ 둘 중 하나라도 RPC 실패면 유효하지 않은 링크로 간주
    if (!guestRes.ok || !artRes.ok) {
      setLoading(false);
      setStatus("❌ 초대 링크를 불러오지 못했습니다. (아래 디버그를 확인)");
      return;
    }

    // ✅ 정상 링크 + 아직 작품 없음
    if (artRes.count === 0) setStatus("표시할 작품이 아직 없어요.");
    else setStatus("");

    setLoading(false);
  };

  useEffect(() => {
    let alive = true;

    const run = async () => {
      if (!alive) return;
      await loadAll();
    };

    run();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setStatus("❌ 등록 실패: " + error.message);
      setDebug((prev) => (prev ? prev : "") + `\n[add_guestbook_entry] ${error.message}`);
      setSubmitBusy(false);
      return;
    }

    const newEntry = data as unknown as Entry;
    setEntries((prev) => [newEntry, ...prev]);

    setName("");
    setContent("");
    setStatus("✅ 남겼어요!");
    setSubmitBusy(false);
    setTimeout(() => setStatus(""), 1200);
  };

  return (
    <main className="wrap">
      <header className="header">
        <div>
          <div className="eyebrow">INVITE</div>
          <h1 className="h1">가족 전시관</h1>
          <p className="desc">작품을 보고, 따뜻한 말을 남겨주세요 🙂</p>
        </div>

        {/* ✅ 외부 손님 전용: 내부 이동/로그인 버튼 없음 */}
        <div className="right" />
      </header>

      {status && <div className="notice">{status}</div>}
      {loading && !status && <div className="notice">불러오는 중...</div>}

      {/* 디버그 (오류 시에만 표시) */}
      {debug && (
        <details className="debug" open>
          <summary>디버그 정보(오류 원인 확인)</summary>
          <pre className="pre">{debug}</pre>
        </details>
      )}

      {/* 작품 */}
      <section className="section">
        <div className="secTitle">작품</div>

        {artworks.length === 0 ? (
          <div className="empty">
            <div className="emptyTitle">표시할 작품이 없어요</div>
            <div className="emptyDesc">가족이 작품을 공개하면 여기에 표시돼요.</div>
          </div>
        ) : (
          <div className="grid">
            {artworks.map((a) => (
              <article className="card" key={a.id}>
                <div className="meta">
                  <div className="kid">{a.kid_name}</div>
                  <div className="made">작품제작일: {fmt(a.artwork_made_at ?? a.created_at)}</div>
                </div>

                <div className="title">{a.title}</div>

                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="img"
                  src={a.image_url}
                  alt={a.title}
                  loading="lazy"
                  role="button"
                  tabIndex={0}
                  onClick={() => openViewer(a.image_url, a.title)}
                  onKeyDown={(e) => e.key === "Enter" && openViewer(a.image_url, a.title)}
                  title="클릭하면 크게 보기"
                  onError={() => {
                    setDebug((prev) => (prev ? prev : "") + `\n[img_error] ${a.image_url || "(empty url)"}`);
                  }}
                />
              </article>
            ))}
          </div>
        )}
      </section>

      {/* ✅ (추가) 확대 모달 */}
      {viewerOpen && (
        <div className="modal" onClick={closeViewer} role="dialog" aria-modal="true">
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="modalTop">
              <div className="modalTitle">{viewerTitle}</div>
              <button className="modalClose" onClick={closeViewer} aria-label="닫기">
                닫기
              </button>
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="modalImg" src={viewerSrc} alt={viewerTitle} />
          </div>
        </div>
      )}

      {/* 방명록 작성 */}
      <section className="section">
        <div className="secTitle">방명록 남기기</div>

        <div className="guestbox">
          <div className="field">
            <label className="label">이름</label>
            <input
              className="input"
              placeholder="예: 할아버지"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitBusy}
            />
          </div>

          <div className="field">
            <label className="label">내용</label>
            <textarea
              className="textarea"
              placeholder="예: 우리 손자 화이팅!"
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

      {/* 최근 방명록 */}
      <section className="section">
        <div className="secTitle">최근 방명록</div>

        {entries.length === 0 ? (
          <div className="empty">
            <div className="emptyTitle">아직 방명록이 없어요</div>
            <div className="emptyDesc">첫 번째 메시지를 남겨주세요 🙂</div>
          </div>
        ) : (
          <div className="list">
            {entries.map((e) => (
              <div className="entry" key={e.id}>
                <div className="entryTop">
                  <div className="who">{e.display_name}</div>
                  <div className="when">{fmt(e.created_at)}</div>
                </div>
                <div className="content">{e.content}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <style jsx>{`
        .wrap { padding: 38px; max-width: 1040px; margin: 0 auto; }
        .header { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; padding-bottom: 14px; border-bottom: 1px solid #eef0f3; }
        .eyebrow { font-size: 11px; letter-spacing: 0.18em; color: #6b7280; }
        .h1 { margin: 6px 0 6px; letter-spacing: -0.6px; font-size: 28px; }
        .desc { margin: 0; color: #6b7280; font-size: 14px; line-height: 1.45; }
        .right { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; justify-content: flex-end; min-height: 1px; }

        .notice { margin-top: 14px; padding: 10px 12px; border: 1px solid #eee; border-radius: 12px; background: #fff; color: #111827; font-size: 13px; }

        .debug { margin-top: 12px; border: 1px solid #fee2e2; background: #fff7ed; border-radius: 12px; padding: 10px 12px; }
        .pre { margin: 8px 0 0; white-space: pre-wrap; word-break: break-word; font-size: 12px; }

        .section { margin-top: 18px; }
        .secTitle { font-weight: 900; letter-spacing: -0.3px; margin-bottom: 10px; }

        .empty { border: 1px solid #eef0f3; border-radius: 16px; padding: 18px; background: #fafafa; }
        .emptyTitle { font-weight: 900; letter-spacing: -0.4px; }
        .emptyDesc { margin-top: 6px; font-size: 13px; color: #6b7280; line-height: 1.45; }

        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
        .card { border: 1px solid #e8ebf0; border-radius: 16px; background: #fff; padding: 12px; box-shadow: 0 1px 0 rgba(17, 24, 39, 0.04); }
        .meta { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
        .kid { font-size: 12px; color: #6b7280; font-weight: 800; }
        .made { font-size: 12px; color: #6b7280; font-weight: 800; white-space: nowrap; }
        .title { margin-top: 6px; margin-bottom: 10px; font-weight: 900; letter-spacing: -0.3px; word-break: break-word; line-height: 1.25; }
        .img { width: 100%; height: 210px; object-fit: cover; border-radius: 14px; background: #f3f4f6; border: 1px solid #f1f5f9; cursor: zoom-in; }

        /* ✅ 모달 */
        .modal {
          position: fixed;
          inset: 0;
          background: rgba(17, 24, 39, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
          z-index: 1000;
        }
        .modalCard {
          width: min(980px, 100%);
          max-height: 92vh;
          background: #fff;
          border-radius: 16px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          overflow: hidden;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
        }
        .modalTop {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
          padding: 12px 14px;
          border-bottom: 1px solid #eef0f3;
        }
        .modalTitle {
          font-weight: 900;
          letter-spacing: -0.3px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .modalClose {
          padding: 8px 10px;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          background: #fff;
          color: #111827;
          font-size: 12px;
          font-weight: 900;
          cursor: pointer;
        }
        .modalImg {
          width: 100%;
          height: auto;
          max-height: calc(92vh - 52px);
          object-fit: contain;
          background: #111827;
        }

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
        .content { margin-top: 6px; line-height: 1.55; }

        @media (max-width: 720px) {
          .wrap { padding: 18px; }
          .header { align-items: flex-start; }
        }
      `}</style>
    </main>
  );
}
