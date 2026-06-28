"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("인증 처리 중...");

  useEffect(() => {
    const finish = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) {
        setMessage("인증 실패: 링크가 만료되었거나 잘못되었습니다. 다시 시도해 주세요.");
        return;
      }

      const familyName =
        (data.session.user.user_metadata?.family_name as string | undefined) ?? null;

      const { error: rpcErr } = await supabase.rpc("ensure_my_profile", {
        p_family_name: familyName,
      });
      if (rpcErr) {
        setMessage("가족 프로필 생성 실패: " + rpcErr.message);
        return;
      }

      setMessage("인증 완료! 이동 중...");
      router.replace("/manage");
    };

    void finish();
  }, [router]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "linear-gradient(180deg,#f7efe8 0%,#fffaf5 42%,#f4ede7 100%)",
      }}
    >
      <div
        style={{
          padding: "24px 28px",
          borderRadius: 16,
          background: "#fff",
          border: "1px solid #eee",
          boxShadow: "0 24px 60px rgba(17,24,39,0.08)",
          fontWeight: 800,
          color: "#111827",
        }}
      >
        {message}
      </div>
    </main>
  );
}
