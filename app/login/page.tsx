"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import InstallPrompt from "../components/InstallPrompt";

const FIXED_DOMAIN = "love.you";

function usernameToEmail(username: string) {
  const u = username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(u)) {
    throw new Error("아이디는 영문/숫자/._-만 가능하며 3~30자로 입력해 주세요.");
  }
  return `${u}@${FIXED_DOMAIN}`;
}

export default function LoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
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
    if (!username || !password) {
      setMessage("아이디와 비밀번호를 입력해 주세요.");
      return;
    }

    let email: string;
    try {
      email = usernameToEmail(username);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "아이디 형식이 올바르지 않습니다.");
      return;
    }

    setBusy(true);
    setMessage("로그인 중...");

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setMessage("로그인 실패: 아이디와 비밀번호를 확인해 주세요.");
      setBusy(false);
      return;
    }

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
            type="text"
            placeholder="아이디"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="username"
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
      `}</style>
    </main>
  );
}
