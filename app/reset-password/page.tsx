"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("재설정 링크 확인 중...");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
        setMessage("새 비밀번호를 입력해 주세요.");
      }
    });

    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setReady(true);
        setMessage("새 비밀번호를 입력해 주세요.");
      } else {
        setMessage(
          "재설정 링크가 만료되었거나 잘못된 링크입니다. ‘비밀번호 찾기’에서 다시 시도해 주세요."
        );
      }
    };

    void init();

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const submit = async () => {
    if (pw1.length < 8) return setMessage("비밀번호는 8자 이상이어야 합니다.");
    if (pw1 !== pw2) return setMessage("비밀번호 확인이 일치하지 않습니다.");

    setBusy(true);
    setMessage("변경 중...");

    const { error } = await supabase.auth.updateUser({ password: pw1 });
    if (error) {
      setMessage("변경 실패: " + error.message);
      setBusy(false);
      return;
    }

    setDone(true);
    setMessage("비밀번호가 변경되었습니다. 로그인 페이지로 이동합니다...");
    setTimeout(async () => {
      await supabase.auth.signOut();
      router.replace("/login");
    }, 1200);
  };

  return (
    <main className="wrap">
      <section className="card">
        <div className="badge">RESET PASSWORD</div>
        <h1 className="title">새 비밀번호 설정</h1>

        <div className="form">
          <input
            type="password"
            placeholder="새 비밀번호 (8자 이상)"
            value={pw1}
            onChange={(e) => setPw1(e.target.value)}
            autoComplete="new-password"
            className="input"
            disabled={!ready || busy || done}
          />
          <input
            type="password"
            placeholder="새 비밀번호 확인"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ready && void submit()}
            autoComplete="new-password"
            className="input"
            disabled={!ready || busy || done}
          />
          <button
            onClick={() => void submit()}
            disabled={!ready || busy || done}
            className="submit"
          >
            {busy ? "변경 중..." : done ? "완료" : "변경하기"}
          </button>

          <div className="links">
            <Link href="/login" className="linkA">로그인으로</Link>
          </div>
        </div>

        {message && <p className="message">{message}</p>}
      </section>

      <style jsx>{`
        .wrap {
          min-height: 100vh; display: grid; place-items: center; padding: 24px;
          background:
            radial-gradient(680px 320px at 50% 0%, rgba(124, 19, 32, 0.18), transparent 70%),
            linear-gradient(180deg, #f7efe8 0%, #fffaf5 42%, #f4ede7 100%);
        }
        .card {
          width: min(520px, 100%); border-radius: 24px;
          border: 1px solid rgba(17, 24, 39, 0.08); background: rgba(255, 255, 255, 0.94);
          box-shadow: 0 24px 60px rgba(17, 24, 39, 0.12); padding: 24px; backdrop-filter: blur(8px);
        }
        .badge { font-size: 11px; letter-spacing: 0.18em; color: #7c1320; font-weight: 900; }
        .title { margin: 12px 0 14px; letter-spacing: -0.5px; font-size: 28px; color: #111827; }
        .form { display: grid; gap: 10px; }
        .input {
          width: 100%; padding: 12px 14px; border-radius: 14px;
          border: 1px solid #d7dce5; background: #fff; color: #111827; font-size: 14px; outline: none;
        }
        .submit {
          width: 100%; padding: 12px 14px; border-radius: 14px;
          border: 1px solid #111827; background: #111827; color: #fff; font-weight: 900;
          font-size: 14px; cursor: pointer;
        }
        .submit:disabled { opacity: 0.6; cursor: not-allowed; }
        .links { display: flex; justify-content: center; font-size: 13px; }
        .linkA { color: #7c1320; font-weight: 800; text-decoration: none; }
        .linkA:hover { text-decoration: underline; }
        .message {
          margin-top: 14px; padding: 10px 12px; border-radius: 12px;
          border: 1px solid #eee; background: #fff; color: #111827; line-height: 1.5;
        }
      `}</style>
    </main>
  );
}
