"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

const FIXED_DOMAIN = "love.you"; // ✅ 여기만 바꾸면 됨 (운영 도메인)

function usernameToEmail(username: string) {
  const u = username.trim().toLowerCase();

  // 아이디 규칙 (영문/숫자/._- 만 허용)
  if (!/^[a-z0-9._-]{3,30}$/.test(u)) {
    throw new Error("아이디는 영문/숫자/._- 만 가능하며 3~30자로 입력해줘.");
  }

  return `${u}@${FIXED_DOMAIN}`;
}

export default function LoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  // ✅ 이미 로그인 상태면 메인으로 이동
  useEffect(() => {
    const run = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!error && data.session) {
        router.replace("/");
      }
    };
    run();
  }, [router]);

  const handleLogin = async () => {
    if (!username || !password) {
      setMessage("아이디/비밀번호를 입력해줘.");
      return;
    }

    let email: string;

    try {
      email = usernameToEmail(username);
    } catch (e: any) {
      setMessage(e?.message ?? "아이디 형식이 올바르지 않습니다.");
      return;
    }

    setBusy(true);
    setMessage("로그인 중...");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage("❌ 로그인 실패: 아이디/비밀번호를 확인해줘.");
      setBusy(false);
      return;
    }

    setMessage("✅ 로그인 성공! 이동 중...");
    router.replace("/");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleLogin();
  };

  return (
    <main style={{ padding: 40, maxWidth: 420, margin: "0 auto" }}>
      <h1 style={{ margin: 0, letterSpacing: -0.4 }}>가족 전시관 로그인</h1>
      <p style={{ opacity: 0.7, marginTop: 8 }}>
        아이디로 로그인하세요. (예: <b>rangmin</b>)
      </p>

      <div style={{ marginTop: 16 }}>
        <input
          type="text"
          placeholder="아이디"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={onKeyDown}
          autoComplete="username"
          style={{
            display: "block",
            width: "100%",
            marginBottom: 10,
            padding: 10,
            borderRadius: 12,
            border: "1px solid #ddd",
          }}
        />

        <input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={onKeyDown}
          autoComplete="current-password"
          style={{
            display: "block",
            width: "100%",
            marginBottom: 12,
            padding: 10,
            borderRadius: 12,
            border: "1px solid #ddd",
          }}
        />

        <button
          onClick={handleLogin}
          disabled={busy}
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid #111",
            background: busy ? "#f3f3f3" : "#111",
            color: busy ? "#444" : "#fff",
            fontWeight: 800,
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "로그인 중..." : "로그인"}
        </button>
      </div>

      {message && (
        <p
          style={{
            marginTop: 14,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #eee",
            background: "#fff",
            color: "#111",
          }}
        >
          {message}
        </p>
      )}
    </main>
  );
}
