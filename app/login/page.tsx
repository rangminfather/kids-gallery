"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import InstallPrompt from "../components/InstallPrompt";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const run = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!error && data.session) router.replace("/");
    };
    void run();
  }, [router]);

  const handleLogin = async () => {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      setMessage("이메일과 비밀번호를 입력해 주세요.");
      return;
    }

    setBusy(true);
    setMessage("로그인 중...");

    const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });

    if (error) {
      const isUnconfirmed = /confirm|verified/i.test(error.message);
      setMessage(
        isUnconfirmed
          ? "이메일 인증이 아직 완료되지 않았어요. 받은편지함의 인증 링크를 먼저 눌러 주세요."
          : "로그인 실패: 이메일과 비밀번호를 확인해 주세요."
      );
      setBusy(false);
      return;
    }

    await supabase.rpc("ensure_my_profile");

    setMessage("로그인 성공! 이동 중...");
    router.replace("/");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") void handleLogin();
  };

  return (
    <main className="wrap">
      <section className="card">
        <div className="badge">FAMILY LOGIN</div>
        <h1 className="title">가족 전시관 로그인</h1>
        <p className="desc">처음 오셨다면 아래 설치 카드를 먼저 눌러 홈 화면에 추가해 두는 것을 권장합니다.</p>

        <div className="installArea">
          <InstallPrompt className="installPanel" tone="light" title="앱처럼 설치하고 바로 열기" />
        </div>

        <div className="form">
          <input
            type="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="email"
            inputMode="email"
            className="input"
          />

          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="current-password"
            className="input"
          />

          <button onClick={() => void handleLogin()} disabled={busy} className="submit">
            {busy ? "로그인 중..." : "로그인"}
          </button>

          <div className="links">
            <Link href="/signup" className="linkA">회원가입</Link>
            <span className="dot">·</span>
            <Link href="/forgot-password" className="linkA">비밀번호를 잊으셨나요?</Link>
          </div>
        </div>

        {message && <p className="message">{message}</p>}
      </section>

      <style jsx>{`
        .wrap {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 24px;
          background:
            radial-gradient(680px 320px at 50% 0%, rgba(124, 19, 32, 0.18), transparent 70%),
            linear-gradient(180deg, #f7efe8 0%, #fffaf5 42%, #f4ede7 100%);
        }

        .card {
          width: min(560px, 100%);
          border-radius: 24px;
          border: 1px solid rgba(17, 24, 39, 0.08);
          background: rgba(255, 255, 255, 0.94);
          box-shadow: 0 24px 60px rgba(17, 24, 39, 0.12);
          padding: 24px;
          backdrop-filter: blur(8px);
        }

        .badge {
          font-size: 11px;
          letter-spacing: 0.18em;
          color: #7c1320;
          font-weight: 900;
        }

        .title {
          margin: 12px 0 8px;
          letter-spacing: -0.5px;
          font-size: 30px;
          color: #111827;
        }

        .desc {
          margin: 0;
          color: #6b7280;
          font-size: 14px;
          line-height: 1.5;
        }

        .installArea {
          margin-top: 18px;
        }

        .installPanel {
          width: 100%;
        }

        .form {
          margin-top: 18px;
          display: grid;
          gap: 10px;
        }

        .input {
          width: 100%;
          padding: 12px 14px;
          border-radius: 14px;
          border: 1px solid #d7dce5;
          background: #fff;
          color: #111827;
          font-size: 14px;
          outline: none;
        }

        .submit {
          width: 100%;
          padding: 12px 14px;
          border-radius: 14px;
          border: 1px solid #111827;
          background: #111827;
          color: #fff;
          font-weight: 900;
          font-size: 14px;
          cursor: pointer;
        }

        .submit:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .message {
          margin-top: 14px;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid #eee;
          background: #fff;
          color: #111827;
        }

        .links {
          margin-top: 4px;
          display: flex;
          gap: 8px;
          align-items: center;
          justify-content: center;
          font-size: 13px;
        }

        .linkA {
          color: #7c1320;
          font-weight: 800;
          text-decoration: none;
        }

        .linkA:hover { text-decoration: underline; }

        .dot { color: #d1d5db; }
      `}</style>
    </main>
  );
}
