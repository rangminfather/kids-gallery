"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

type InviteRow = {
  token: string;
  expires_at: string;
};

type GuestbookRow = {
  id: string;
  display_name: string;
  content: string;
  created_at: string;
};

export default function DashboardPage() {
  const [email, setEmail] = useState<string>("");
  const [invite, setInvite] = useState<InviteRow | null>(null);
  const [guestbook, setGuestbook] = useState<GuestbookRow[]>([]);
  const [msg, setMsg] = useState<string>("");

  const load = async () => {
    setMsg("불러오는 중...");

    const { data: userData } = await supabase.auth.getUser();
    setEmail(userData.user?.email ?? "");

    // 1) 현재 활성 초대 링크 하나 가져오기(가장 최근)
    const { data: inv, error: invErr } = await supabase
      .from("family_invites")
      .select("token, expires_at")
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1);

    if (invErr) {
      setMsg("초대 링크 조회 실패: " + invErr.message);
      return;
    }
    setInvite(inv?.[0] ?? null);

    // 2) 방명록 가져오기
    const { data: gb, error: gbErr } = await supabase
      .from("guestbook_entries")
      .select("id, display_name, content, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (gbErr) {
      setMsg("방명록 조회 실패: " + gbErr.message);
      return;
    }

    setGuestbook(gb ?? []);
    setMsg("");
  };

  useEffect(() => {
    load();
  }, []);

  const regenerateInvite = async () => {
    setMsg("초대 링크 재생성 중...");
    const { data, error } = await supabase.rpc("regenerate_family_invite");

    if (error) {
      setMsg("재생성 실패: " + error.message);
      return;
    }

    // 함수 결과가 row로 오므로 token/expires_at 재로딩
    await load();
    setMsg("✅ 새 초대 링크가 생성됐어!");
  };

  const deleteEntry = async (id: string) => {
    const ok = confirm("이 방명록을 삭제할까?");
    if (!ok) return;

    const { error } = await supabase.from("guestbook_entries").delete().eq("id", id);
    if (error) {
      alert("삭제 실패: " + error.message);
      return;
    }
    setGuestbook((prev) => prev.filter((x) => x.id !== id));
  };

  const logout = async () => {
    await supabase.auth.signOut();
    location.href = "/login";
  };

  const inviteUrl =
    invite?.token ? `${location.origin}/invite/${invite.token}` : "";



  const copyInvite = async () => {
  if (!inviteUrl) return;

  try {
    await navigator.clipboard.writeText(inviteUrl);
    setMsg("✅ 링크를 복사했어!");
    setTimeout(() => setMsg(""), 1200);
  } catch {
    // 구형 브라우저/권한 이슈 대비
    prompt("복사가 안 되면 아래 링크를 복사해줘:", inviteUrl);
  }
};



  return (
    <main style={{ padding: 40, maxWidth: 720 }}>
      <h1>부모 대시보드</h1>
      <p style={{ opacity: 0.7 }}>로그인: {email || "(알 수 없음)"}</p>

      <section style={{ marginTop: 24, padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
        <h2 style={{ marginTop: 0 }}>가족관 초대 링크</h2>

        {invite ? (
          <>
            <div style={{ fontSize: 14, wordBreak: "break-all" }}>
              <div><b>링크:</b> {inviteUrl}</div>
              <div><b>만료:</b> {new Date(invite.expires_at).toLocaleString()}</div>
            </div>
            <div style={{ marginTop: 12 }}>
              <button onClick={regenerateInvite}>초대 링크 재생성(기존 링크 즉시 무효)</button>
              <button onClick={copyInvite} style={{ marginLeft: 8 }}>링크 복사</button>
            </div>
          </>
        ) : (
          <>
            <p>아직 초대 링크가 없어. 아래 버튼을 눌러 생성해줘.</p>
            <button onClick={regenerateInvite}>초대 링크 생성</button>
          </>
        )}
      </section>

      <section style={{ marginTop: 24, padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
        <h2 style={{ marginTop: 0 }}>방명록 (부모가 삭제 가능)</h2>

        {guestbook.length === 0 ? (
          <p style={{ opacity: 0.7 }}>아직 방명록이 없어.</p>
        ) : (
          <ul style={{ paddingLeft: 18 }}>
            {guestbook.map((g) => (
              <li key={g.id} style={{ marginBottom: 10 }}>
                <div>
                  <b>{g.display_name}</b>{" "}
                  <span style={{ opacity: 0.6, fontSize: 12 }}>
                    {new Date(g.created_at).toLocaleString()}
                  </span>
                </div>
                <div style={{ marginTop: 2 }}>{g.content}</div>
                <button
                  onClick={() => deleteEntry(g.id)}
                  style={{ marginTop: 6 }}
                >
                  X 삭제
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {msg && <p style={{ marginTop: 16 }}>{msg}</p>}

      <div style={{ marginTop: 24 }}>
        <button onClick={logout}>로그아웃</button>
      </div>
    </main>
  );
}
