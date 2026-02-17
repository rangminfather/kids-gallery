"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function PasswordPage() {
  const router = useRouter();

  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const goHomeNow = () => router.replace("/");

  const onSave = async () => {
    if (saving) return;

    setMsg("");
    if (pw1.length < 8) return setMsg("비밀번호는 8자 이상 권장");
    if (pw1 !== pw2) return setMsg("비밀번호가 일치하지 않습니다.");

    setSaving(true);

    const { error } = await supabase.auth.updateUser({ password: pw1 });
    if (error) {
      setSaving(false);
      return setMsg(`변경 실패: ${error.message}`);
    }

    setMsg("✅ 비밀번호가 변경되었습니다. 잠시 후 메인으로 이동합니다…");

    timerRef.current = window.setTimeout(() => {
      router.replace("/");
    }, 1200);

    setSaving(false);
  };

  return (
    <main style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <h2 style={{ marginBottom: 16 }}>비밀번호 변경</h2>

        <button
          onClick={goHomeNow}
          style={{
            border: "1px solid #e5e7eb",
            background: "#fff",
            padding: "8px 10px",
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          메인으로
        </button>
      </div>

      <label>새 비밀번호</label>
      <input
        value={pw1}
        onChange={(e) => setPw1(e.target.value)}
        type="password"
        style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
        disabled={saving}
      />

      <label>새 비밀번호 확인</label>
      <input
        value={pw2}
        onChange={(e) => setPw2(e.target.value)}
        type="password"
        style={{ width: "100%", padding: 10, margin: "6px 0 16px" }}
        disabled={saving}
      />

      <button onClick={onSave} style={{ width: "100%", padding: 12 }} disabled={saving}>
        {saving ? "변경 중..." : "변경하기"}
      </button>

      {msg && <p style={{ marginTop: 12, opacity: 0.85, lineHeight: 1.45 }}>{msg}</p>}
    </main>
  );
}
