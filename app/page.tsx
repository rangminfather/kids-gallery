"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

export default function HomePage() {
  const router = useRouter();

  const [sessionLoading, setSessionLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [actionLoading, setActionLoading] = useState<"logout" | null>(null);

  // ✅ 버전 표식 (환경변수 있으면 표시)
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION;

  // ✅ "공개 갤러리"가 회원 전용이면 true로 바꾸세요.
  // 지금 대화 맥락상 회원 전용이 맞으니 true로 둡니다.
  const GALLERY_REQUIRES_LOGIN = true;

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      // 최초 세션 확인
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      const loggedIn = !!data.session;
      setIsLoggedIn(loggedIn);
      setSessionLoading(false);
    };

    init();

    // ✅ 세션 변화(로그인/로그아웃/토큰갱신) 감지
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const loggedIn = !!session;
      setIsLoggedIn(loggedIn);

      // ✅ 안전장치: 로그아웃 발생 시 /login으로 보내기
      if (!loggedIn) {
        router.replace("/login");
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  const goFamilyRoom = () => {
    if (!isLoggedIn) router.push("/login");
    else router.push("/manage");
  };

  const goGallery = () => {
    // ✅ 공개갤러리가 회원 전용이라면 여기서 차단
    if (GALLERY_REQUIRES_LOGIN && !isLoggedIn) {
      router.push("/login");
      return;
    }
    router.push("/gallery");
  };

  const goPassword = () => {
    if (!isLoggedIn) {
      router.push("/login");
      return;
    }
    router.push("/account/password");
  };

  const logout = async () => {
    if (actionLoading) return;
    setActionLoading("logout");

    try {
      await supabase.auth.signOut();
      router.replace("/login");
    } finally {
      setActionLoading(null);
    }
  };

  const goLogin = () => router.push("/login");

  const statusText = useMemo(() => {
    if (sessionLoading) return "세션 확인 중...";
    return isLoggedIn ? "로그인됨" : "비로그인";
  }, [sessionLoading, isLoggedIn]);

  return (
    <main className="wrap">
      <div className="hall" />

      <div className="curtain left" />
      <div className="curtain right" />

      <div className="topbar">
        <div className="chip">{statusText}</div>

        {/* ✅ 버전 표식 */}
        {!!appVersion && <div className="ver">v{appVersion}</div>}

        {/* ✅ 로그인 상태일 때만 비밀번호 변경 버튼 노출 */}
        {!sessionLoading && isLoggedIn && (
          <button className="linkBtn" onClick={goPassword}>
            비밀번호 변경
          </button>
        )}

        {/* ✅ 비로그인일 때 로그인 버튼 노출 */}
        {!sessionLoading && !isLoggedIn && (
          <button className="linkBtn" onClick={goLogin}>
            로그인
          </button>
        )}

        {/* ✅ 로그인일 때 로그아웃 버튼 */}
        {!sessionLoading && isLoggedIn && (
          <button className="linkBtn" onClick={logout} disabled={actionLoading === "logout"}>
            {actionLoading === "logout" ? "로그아웃 중..." : "로그아웃"}
          </button>
        )}
      </div>

      <section className="center">
        <div className="titleBlock">
          <div className="kicker">아이들 작품 사이버 전시</div>
          <h1 className="title">Family Art Museum</h1>
          <p className="sub">가족 전시관에서 올리고, 공개 갤러리에서 함께 전시해요.</p>
        </div>

        <div className="cardRow">
          <button className="bigCard" onClick={goFamilyRoom}>
            <div className="icon">🏠</div>
            <div className="cardTitle">가족 전시관</div>
            <div className="cardDesc">
              우리 가족 작품 관리 / 전시 공개 설정
              {!sessionLoading && !isLoggedIn && <span className="hint"> · 로그인 필요</span>}
            </div>
          </button>

          <button className="bigCard" onClick={goGallery}>
            <div className="icon">🖼️</div>
            <div className="cardTitle">공개 갤러리</div>
            <div className="cardDesc">
              전시 중인 작품 구경하기
              {!sessionLoading && GALLERY_REQUIRES_LOGIN && !isLoggedIn && (
                <span className="hint"> · 로그인 필요</span>
              )}
            </div>
          </button>
        </div>
      </section>

      <style jsx>{`
        .wrap {
          position: relative;
          min-height: 100vh;
          overflow: hidden;
          background: #0b1020;
          color: #fff;
        }

        .hall {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(900px 500px at 50% 35%, rgba(255,255,255,0.14), transparent 60%),
            radial-gradient(700px 400px at 50% 75%, rgba(255,255,255,0.08), transparent 60%),
            linear-gradient(180deg, #0b1020 0%, #0a0f1c 50%, #070a12 100%);
        }

        .curtain {
          position: absolute;
          top: 0;
          width: 55%;
          height: 100%;
          background:
            linear-gradient(90deg, rgba(0,0,0,0.25), rgba(255,255,255,0.06), rgba(0,0,0,0.25)),
            linear-gradient(180deg, #7c1320 0%, #5f0f18 55%, #3d0a10 100%);
          box-shadow: 0 20px 80px rgba(0,0,0,0.5);
          z-index: 3;
          animation-duration: 900ms;
          animation-timing-function: cubic-bezier(0.2, 0.9, 0.2, 1);
          animation-fill-mode: forwards;
        }

        .curtain.left {
          left: 0;
          border-right: 1px solid rgba(255,255,255,0.08);
          animation-name: openLeft;
        }

        .curtain.right {
          right: 0;
          border-left: 1px solid rgba(255,255,255,0.08);
          animation-name: openRight;
        }

        @keyframes openLeft {
          from { transform: translateX(0); }
          to { transform: translateX(-102%); }
        }

        @keyframes openRight {
          from { transform: translateX(0); }
          to { transform: translateX(102%); }
        }

        .topbar {
          position: relative;
          z-index: 4;
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 10px;
          padding: 16px 18px;
        }

        .chip {
          font-size: 12px;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.16);
          background: rgba(255,255,255,0.06);
          backdrop-filter: blur(6px);
        }

        /* ✅ 버전 표식: 과하지 않게 */
        .ver {
          font-size: 11px;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.04);
          color: rgba(255,255,255,0.75);
          letter-spacing: -0.2px;
        }

        .linkBtn {
          font-size: 12px;
          border: 1px solid rgba(255,255,255,0.16);
          background: rgba(255,255,255,0.06);
          color: #fff;
          padding: 6px 10px;
          border-radius: 10px;
          cursor: pointer;
        }

        .linkBtn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .center {
          position: relative;
          z-index: 2;
          min-height: calc(100vh - 60px);
          display: grid;
          place-items: center;
          padding: 18px;
        }

        .titleBlock {
          text-align: center;
          margin-bottom: 18px;
        }

        .kicker {
          font-size: 12px;
          opacity: 0.75;
          letter-spacing: -0.2px;
        }

        .title {
          margin: 8px 0 6px;
          font-size: 38px;
          letter-spacing: -0.8px;
          line-height: 1.1;
        }

        .sub {
          margin: 0;
          opacity: 0.75;
          font-size: 14px;
        }

        .cardRow {
          display: grid;
          grid-template-columns: repeat(2, minmax(220px, 320px));
          gap: 14px;
          margin-top: 18px;
        }

        .bigCard {
          text-align: left;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.06);
          padding: 16px 16px 14px;
          color: #fff;
          cursor: pointer;
          backdrop-filter: blur(8px);
          transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
        }

        .bigCard:hover {
          transform: translateY(-2px);
          background: rgba(255,255,255,0.08);
          border-color: rgba(255,255,255,0.22);
        }

        .icon {
          font-size: 26px;
          margin-bottom: 10px;
        }

        .cardTitle {
          font-size: 18px;
          font-weight: 900;
          letter-spacing: -0.4px;
          margin-bottom: 6px;
        }

        .cardDesc {
          font-size: 13px;
          opacity: 0.8;
          line-height: 1.35;
        }

        .hint {
          opacity: 0.85;
          font-weight: 700;
        }

        @media (max-width: 720px) {
          .title { font-size: 32px; }
          .cardRow { grid-template-columns: 1fr; }
        }

        @media (prefers-reduced-motion: reduce) {
          .curtain { display: none; }
        }
      `}</style>
    </main>
  );
}
