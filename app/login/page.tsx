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
      if (!error && data.session) {
        router.replace("/");
      }
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

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

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
        <div className="badgeRow">
          <div className="badge">FAMILY LOGIN</div>
          <InstallPrompt className="installChip" compact />
        </div>

        <h1 className="title">가족 전시관 로그인</h1>
        <p className="desc">
          아이디로 로그인해 주세요. 설치 버튼을 누르면 홈 화면에서 앱처럼 바로 열 수 있습니다.
        </p>

        <div className="installArea">
          <InstallPrompt className="installBtn" />
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
          width: min(460px, 100%);
          border-radius: 24px;
          border: 1px solid rgba(17, 24, 39, 0.08);
          background: rgba(255, 255, 255, 0.92);
          box-shadow: 0 24px 60px rgba(17, 24, 39, 0.12);
          padding: 24px;
          backdrop-filter: blur(8px);
        }

        .badgeRow {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .badge {
          font-size: 11px;
          letter-spacing: 0.18em;
          color: #7c1320;
          font-weight: 900;
        }

        .installChip {
          font-size: 12px;
          border: 1px solid rgba(17, 24, 39, 0.1);
          background: #fff;
          color: #111827;
          padding: 8px 10px;
          border-radius: 10px;
          cursor: pointer;
          font-weight: 800;
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
          margin-top: 16px;
        }

        .installBtn {
          width: 100%;
          border: 1px solid rgba(124, 19, 32, 0.18);
          background: linear-gradient(180deg, #9b1c2c 0%, #7c1320 100%);
          color: #fff;
          padding: 12px 14px;
          border-radius: 14px;
          font-size: 14px;
          font-weight: 900;
          cursor: pointer;
          box-shadow: 0 12px 28px rgba(124, 19, 32, 0.2);
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
