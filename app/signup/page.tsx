"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [familyName, setFamilyName] = useState("");

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const run = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) router.replace("/");
    };
    void run();
  }, [router]);

  const handleSignup = async () => {
    const cleanEmail = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setMessage("올바른 이메일 형식이 아닙니다.");
      return;
    }
    if (password.length < 8) {
      setMessage("비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    if (password !== password2) {
      setMessage("비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    setBusy(true);
    setMessage("가입 처리 중...");

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { family_name: familyName.trim() || null },
      },
    });

    if (error) {
      setMessage("가입 실패: " + error.message);
      setBusy(false);
      return;
    }

    const userId = data.user?.id ?? null;
    const hasSession = !!data.session;

    setDone(true);

    if (hasSession && userId) {
      await supabase.rpc("ensure_my_profile", { p_family_name: familyName.trim() || null });
      setMessage("가입 완료! 이동 중...");
      router.replace("/");
      return;
    }

    setMessage(
      "가입 신청이 접수됐어요. 입력하신 이메일로 인증 메일을 보냈습니다. 메일 안의 링크를 눌러 인증을 완료해 주세요."
    );
    setBusy(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") void handleSignup();
  };

  return (
    <main className="wrap">
      <section className="card">
        <div className="badge">SIGN UP</div>
        <h1 className="title">가족 전시관 회원가입</h1>
        <p className="desc">
          이메일은 비밀번호 분실 시 복구에 사용됩니다. 반드시 본인이 받을 수 있는 주소로 입력해 주세요.
        </p>

        <div className="form">
          <label className="lab">이메일</label>
          <input
            type="email"
            placeholder="example@domain.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="email"
            inputMode="email"
            className="input"
            disabled={busy || done}
          />

          <label className="lab">비밀번호 (8자 이상)</label>
          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="new-password"
            className="input"
            disabled={busy || done}
          />

          <label className="lab">비밀번호 확인</label>
          <input
            type="password"
            placeholder="비밀번호 다시 입력"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="new-password"
            className="input"
            disabled={busy || done}
          />

          <label className="lab">가족 이름 (선택)</label>
          <input
            type="text"
            placeholder="예: 김씨네"
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            onKeyDown={onKeyDown}
            className="input"
            disabled={busy || done}
          />
          <div className="hint">비워두면 “우리 가족”으로 시작합니다. 나중에 변경할 수 있어요.</div>

          <button
            onClick={() => void handleSignup()}
            disabled={busy || done}
            className="submit"
          >
            {busy ? "처리 중..." : done ? "메일 발송 완료" : "회원가입"}
          </button>

          <div className="links">
            이미 계정이 있나요?
            <Link href="/login" className="linkA">로그인</Link>
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
        .badge { font-size: 11px; letter-spacing: 0.18em; color: #7c1320; font-weight: 900; }
        .title { margin: 12px 0 8px; letter-spacing: -0.5px; font-size: 28px; color: #111827; }
        .desc { margin: 0 0 14px; color: #6b7280; font-size: 14px; line-height: 1.5; }
        .form { display: grid; gap: 8px; }
        .lab { font-size: 12px; color: #6b7280; font-weight: 800; margin-top: 6px; }
        .input {
          width: 100%; padding: 12px 14px; border-radius: 14px;
          border: 1px solid #d7dce5; background: #fff; color: #111827; font-size: 14px; outline: none;
        }
        .hint { font-size: 12px; color: #6b7280; }
        .submit {
          margin-top: 8px; width: 100%; padding: 12px 14px; border-radius: 14px;
          border: 1px solid #111827; background: #111827; color: #fff; font-weight: 900;
          font-size: 14px; cursor: pointer;
        }
        .submit:disabled { opacity: 0.6; cursor: not-allowed; }
        .links {
          margin-top: 10px; display: flex; gap: 8px; align-items: center; justify-content: center;
          font-size: 13px; color: #6b7280;
        }
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
