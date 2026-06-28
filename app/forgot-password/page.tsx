"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);

  const submit = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setMessage("올바른 이메일 형식이 아닙니다.");
      return;
    }

    setBusy(true);
    setMessage("재설정 메일 발송 중...");

    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setMessage("발송 실패: " + error.message);
      setBusy(false);
      return;
    }

    setDone(true);
    setMessage(
      "비밀번호 재설정 링크를 이메일로 보냈어요. 받은편지함에서 링크를 눌러 새 비밀번호를 설정해 주세요. (해당 이메일로 가입된 계정이 없으면 메일이 오지 않습니다.)"
    );
    setBusy(false);
  };

  return (
    <main className="wrap">
      <section className="card">
        <div className="badge">FORGOT PASSWORD</div>
        <h1 className="title">비밀번호 찾기</h1>
        <p className="desc">가입 시 등록한 이메일로 재설정 링크를 보내드립니다.</p>

        <div className="form">
          <input
            type="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void submit()}
            autoComplete="email"
            inputMode="email"
            className="input"
            disabled={busy || done}
          />
          <button onClick={() => void submit()} disabled={busy || done} className="submit">
            {busy ? "발송 중..." : done ? "발송 완료" : "재설정 메일 보내기"}
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
        .title { margin: 12px 0 8px; letter-spacing: -0.5px; font-size: 28px; color: #111827; }
        .desc { margin: 0 0 14px; color: #6b7280; font-size: 14px; line-height: 1.5; }
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
