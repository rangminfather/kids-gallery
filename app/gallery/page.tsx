"use client";

import { useEffect, useState } from "react";
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
  const d = Math.ceil(t / (24 * 60 * 60 * 1000));
  return d;
}

export default function GalleryPage() {
  const router = useRouter();

  const [items, setItems] = useState<Artwork[]>([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

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

  // ✅ (추가) ESC 닫기
  useEffect(() => {
    if (!viewerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeViewer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerOpen]);

  const load = async () => {
    setMsg("불러오는 중...");

    // (선택) 만료 처리 RPC - 실패해도 갤러리 조회는 진행
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
      setMsg("❌ 조회 실패: " + error.message);
      setItems([]);
      return;
    }

    setItems((data ?? []) as Artwork[]);
    setMsg("");
  };

  useEffect(() => {
    let alive = true;

    const run = async () => {
      // ✅ 1) 로그인 보호
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/login");
        return;
      }

      // ✅ 2) 로그인 상태면 로딩
      if (!alive) return;
      setLoading(true);
      await load();
      if (!alive) return;
      setLoading(false);
    };

    run();

    // ✅ 3) 세션이 중간에 끊기면 즉시 로그인으로
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) router.replace("/login");
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          <a className="ghost" href="/">
            메인으로
          </a>
        </div>
      </header>

      {/* ✅ 로딩/메시지 */}
      {msg && <div className="notice">{msg}</div>}
      {loading && !msg && <div className="notice">불러오는 중...</div>}

      {!loading && items.length === 0 ? (
        <div className="empty">
          <div className="emptyTitle">전시 중인 작품이 없어요</div>
          <div className="emptyDesc">가족 전시관에서 전시 공개를 켜면 여기에서 보여요.</div>
        </div>
      ) : (
        !loading && (
          <section className="grid">
            {items.map((a) => {
              const left = daysLeft(a.public_until);
              const leftText = left == null ? "" : left <= 0 ? "오늘 종료" : `${left}일 남음`;

              const imgSrc = a.public_image_path || a.private_image_path;

              return (
                <article className="card" key={a.id}>
                  <div className="meta">
                    <div className="kid">{a.kid_name}</div>
                    <div className="until">
                      종료: {formatKoreanDate(a.public_until)}
                      {leftText ? <span className="pill">{leftText}</span> : null}
                    </div>
                  </div>

                  <div className="title">{a.title}</div>

                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="img"
                    src={imgSrc}
                    alt={a.title}
                    loading="lazy"
                    role="button"
                    tabIndex={0}
                    onClick={() => openViewer(imgSrc, a.title)}
                    onKeyDown={(e) => e.key === "Enter" && openViewer(imgSrc, a.title)}
                    title="클릭하면 크게 보기"
                  />
                </article>
              );
            })}
          </section>
        )
      )}

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

      <style jsx>{`
        .wrap {
          padding: 38px;
          max-width: 1040px;
          margin: 0 auto;
        }

        .header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 14px;
          padding-bottom: 14px;
          border-bottom: 1px solid #eef0f3;
        }

        .eyebrow {
          font-size: 11px;
          letter-spacing: 0.18em;
          color: #6b7280;
        }

        .h1 {
          margin: 6px 0 6px;
          letter-spacing: -0.6px;
          font-size: 28px;
        }

        .desc {
          margin: 0;
          color: #6b7280;
          font-size: 14px;
          line-height: 1.45;
        }

        .right {
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .ghost {
          font-size: 12px;
          padding: 8px 10px;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          background: #fff;
          color: #111827;
          text-decoration: none;
          font-weight: 700;
        }

        .notice {
          margin-top: 14px;
          padding: 10px 12px;
          border: 1px solid #eee;
          border-radius: 12px;
          background: #fff;
          color: #111827;
          font-size: 13px;
        }

        .empty {
          margin-top: 18px;
          border: 1px solid #eef0f3;
          border-radius: 16px;
          padding: 18px;
          background: #fafafa;
        }

        .emptyTitle {
          font-weight: 900;
          letter-spacing: -0.4px;
        }

        .emptyDesc {
          margin-top: 6px;
          font-size: 13px;
          color: #6b7280;
          line-height: 1.45;
        }

        .grid {
          margin-top: 16px;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 12px;
        }

        .card {
          border: 1px solid #e8ebf0;
          border-radius: 16px;
          background: #fff;
          padding: 12px;
          box-shadow: 0 1px 0 rgba(17, 24, 39, 0.04);
        }

        .meta {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 10px;
        }

        .kid {
          font-size: 12px;
          color: #6b7280;
          font-weight: 700;
        }

        .until {
          font-size: 12px;
          color: #6b7280;
          display: flex;
          align-items: center;
          gap: 8px;
          white-space: nowrap;
        }

        .pill {
          font-size: 11px;
          padding: 3px 8px;
          border-radius: 999px;
          background: #f3f4f6;
          border: 1px solid #e5e7eb;
          color: #111827;
          font-weight: 800;
        }

        .title {
          margin-top: 6px;
          margin-bottom: 10px;
          font-weight: 900;
          letter-spacing: -0.3px;
          word-break: break-word;
          line-height: 1.25;
        }

        .img {
          width: 100%;
          height: 210px;
          object-fit: cover;
          border-radius: 14px;
          background: #f3f4f6;
          border: 1px solid #f1f5f9;
          cursor: zoom-in;
        }

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

        @media (max-width: 720px) {
          .wrap {
            padding: 18px;
          }
          .header {
            align-items: flex-start;
          }
        }
      `}</style>
    </main>
  );
}
