"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

type Artwork = {
  id: string;
  kid_name: string;
  title: string;
  private_image_path: string;
  created_at: string;
  is_public: boolean;
  public_until: string | null;
  artwork_made_at: string | null;
};

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

function toISO(d: Date) {
  return d.toISOString();
}

function formatKoreanDate(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function isExpired(art: Artwork) {
  if (!art.is_public) return false;
  if (!art.public_until) return false;
  return new Date(art.public_until).getTime() <= Date.now();
}

function StatusBadge({ art }: { art: Artwork }) {
  const expired = isExpired(art);

  const base: React.CSSProperties = {
    fontSize: 12,
    padding: "4px 10px",
    borderRadius: 999,
    fontWeight: 800,
    letterSpacing: -0.2,
    userSelect: "none",
    whiteSpace: "nowrap",
    border: "1px solid rgba(0,0,0,0.08)",
  };

  if (!art.is_public) {
    return (
      <span
        style={{
          ...base,
          background: "#111827",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.15)",
        }}
      >
        비공개
      </span>
    );
  }

  if (expired) {
    return (
      <span style={{ ...base, background: "#FDE68A", color: "#111827" }}>
        전시만료
      </span>
    );
  }

  return (
    <span style={{ ...base, background: "#22C55E", color: "#111827" }}>
      공개중
    </span>
  );
}

// 브라우저에서 안전하게 토큰 생성
function makeToken(len = 24) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/**
 * ✅ profiles 구조가 (id)든 (user_id)든 대응해서:
 * - 내 profiles row를 찾아 family_id / invite_token 읽어오기
 */
async function getMyProfileFlexible(): Promise<{
  family_id: string | null;
  invite_token: string | null;
  usedKey: "user_id" | "id" | null;
  errorMessage: string | null;
}> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) {
    return { family_id: null, invite_token: null, usedKey: null, errorMessage: "로그인 정보를 찾지 못했습니다." };
  }

  // 1) profiles.user_id = uid 시도
  {
    const { data, error } = await supabase
      .from("profiles")
      .select("family_id, invite_token")
      .eq("user_id", uid)
      .maybeSingle();

    if (!error && data?.family_id) {
      return {
        family_id: data.family_id as string,
        invite_token: (data.invite_token ?? null) as string | null,
        usedKey: "user_id",
        errorMessage: null,
      };
    }
  }

  // 2) profiles.id = uid 시도
  {
    const { data, error } = await supabase
      .from("profiles")
      .select("family_id, invite_token")
      .eq("id", uid)
      .maybeSingle();

    if (!error && data?.family_id) {
      return {
        family_id: data.family_id as string,
        invite_token: (data.invite_token ?? null) as string | null,
        usedKey: "id",
        errorMessage: null,
      };
    }
  }

  return {
    family_id: null,
    invite_token: null,
    usedKey: null,
    errorMessage: "profiles에서 내 가족정보를 찾지 못했어요. (profiles 컬럼이 id/user_id 중 무엇인지 확인 필요)",
  };
}

export default function ManagePage() {
  const [items, setItems] = useState<Artwork[]>([]);
  const [msg, setMsg] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [myFamilyId, setMyFamilyId] = useState<string | null>(null);

  // ✅ 초대코드
  const [inviteToken, setInviteToken] = useState<string>("");
  const [inviteBusy, setInviteBusy] = useState(false);

  const inviteLink = useMemo(() => {
    if (!inviteToken) return "";
    if (typeof window === "undefined") return `/invite/${inviteToken}`;
    return `${window.location.origin}/invite/${inviteToken}`;
  }, [inviteToken]);

  const load = async (familyId: string) => {
    setMsg("불러오는 중...");

    const { data, error } = await supabase
      .from("artworks")
      .select("id, kid_name, title, private_image_path, created_at, is_public, public_until, artwork_made_at")
      .eq("family_id", familyId) // ✅ 내 가족만
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      setMsg("❌ 조회 실패: " + error.message);
      return;
    }

    setItems((data ?? []) as Artwork[]);
    setMsg("");
  };

  const loadInviteToken = async () => {
    const prof = await getMyProfileFlexible();
    if (prof.errorMessage) {
      setMsg("⚠️ 초대코드/가족정보 조회 실패: " + prof.errorMessage);
      return;
    }

    setMyFamilyId(prof.family_id);
    setInviteToken(prof.invite_token ?? "");
  };

  useEffect(() => {
    const run = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) {
        location.href = "/login";
        return;
      }

      // 1) 내 family_id / invite_token 로드
      await loadInviteToken();

      // 2) family_id로 작품 로드
      const prof = await getMyProfileFlexible();
      if (!prof.family_id) return;
      await load(prof.family_id);
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createOrRegenerateInvite = async () => {
    setInviteBusy(true);
    setMsg("초대코드 처리 중...");

    const prof = await getMyProfileFlexible();
    if (prof.errorMessage || !prof.family_id) {
      setMsg("❌ 초대코드 저장 실패: " + (prof.errorMessage ?? "family_id 없음"));
      setInviteBusy(false);
      return;
    }

    const next = makeToken(28);

    // ✅ 가족당 1개 초대코드: family_id 기준으로 업데이트 (profiles PK 상관없음)
    const { error } = await supabase
      .from("profiles")
      .update({ invite_token: next })
      .eq("family_id", prof.family_id);

    if (error) {
      setMsg("❌ 초대코드 저장 실패: " + error.message);
      setInviteBusy(false);
      return;
    }

    setInviteToken(next);
    setMsg("✅ 초대코드가 준비됐어요.");
    setInviteBusy(false);
    setTimeout(() => setMsg(""), 1200);
  };

  const copyInvite = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setMsg("✅ 초대 링크 복사 완료!");
      setTimeout(() => setMsg(""), 1200);
    } catch {
      setMsg("⚠️ 복사에 실패했어요. 링크를 직접 드래그해서 복사해줘.");
    }
  };

  const togglePublic = async (art: Artwork) => {
    const next = !art.is_public;

    setBusyId(art.id);
    setMsg("변경 중...");

    const payload: { is_public: boolean; public_until: string | null } = {
      is_public: next,
      public_until: next ? toISO(new Date(Date.now() + TWO_WEEKS_MS)) : null,
    };

    const { error } = await supabase.from("artworks").update(payload).eq("id", art.id);

    if (error) {
      setMsg("❌ 변경 실패: " + error.message);
      setBusyId(null);
      return;
    }

    if (myFamilyId) await load(myFamilyId);
    setBusyId(null);
    setMsg("");
  };

  const extendTwoWeeks = async (art: Artwork) => {
    setBusyId(art.id);
    setMsg("기간 연장 중...");

    const payload = {
      is_public: true,
      public_until: toISO(new Date(Date.now() + TWO_WEEKS_MS)),
    };

    const { error } = await supabase.from("artworks").update(payload).eq("id", art.id);

    if (error) {
      setMsg("❌ 연장 실패: " + error.message);
      setBusyId(null);
      return;
    }

    if (myFamilyId) await load(myFamilyId);
    setBusyId(null);
    setMsg("");
  };

  const deleteArtwork = async (art: Artwork) => {
    const ok = confirm("이 작품을 삭제할까? (사진도 함께 삭제돼)");
    if (!ok) return;

    setBusyId(art.id);
    setMsg("삭제 중...");

    const url = art.private_image_path;
    const fileName = url.split("/").pop() || "";

    if (fileName) {
      const { error: stErr } = await supabase.storage.from("artworks").remove([fileName]);
      if (stErr) setMsg("⚠️ 사진 삭제 실패(그래도 DB는 지울게): " + stErr.message);
    }

    const { error: dbErr } = await supabase.from("artworks").delete().eq("id", art.id);

    if (dbErr) {
      setMsg("❌ DB 삭제 실패: " + dbErr.message);
      setBusyId(null);
      return;
    }

    setItems((prev) => prev.filter((x) => x.id !== art.id));
    setBusyId(null);
    setMsg("✅ 삭제 완료");
    setTimeout(() => setMsg(""), 1200);
  };

  // 검색
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter((a) => a.kid_name.toLowerCase().includes(t) || a.title.toLowerCase().includes(t));
  }, [items, q]);

  return (
    <main className="wrap">
      <header className="header">
        <div>
          <div className="eyebrow">FAMILY ROOM</div>
          <h1 className="h1">가족 전시관</h1>
          <p className="desc">작품 관리 / 전시 공개 / 초대 링크 공유</p>
        </div>

        <div className="right">
          <a className="ghost" href="/">메인</a>
          <a className="primary" href="/upload">업로드</a>
        </div>
      </header>

      {/* ✅ 초대코드 박스 */}
      <section className="inviteBox">
        <div className="inviteTop">
          <div>
            <div className="inviteTitle">초대 링크</div>
            <div className="inviteDesc">
              할아버지·할머니에게 링크를 보내면 작품 보기/방명록 작성이 가능해요.
            </div>
          </div>

          <div className="inviteBtns">
            <button className="ghostBtn" onClick={createOrRegenerateInvite} disabled={inviteBusy}>
              {inviteToken ? "재생성" : "생성"}
            </button>
            <button className="darkBtn" onClick={copyInvite} disabled={!inviteToken}>
              링크 복사
            </button>
          </div>
        </div>

        <div className="inviteLink">
          {inviteToken ? (
            <a href={inviteLink} target="_blank" rel="noreferrer" className="link">
              {inviteLink}
            </a>
          ) : (
            <span className="muted">아직 초대코드가 없어요. ‘생성’을 눌러주세요.</span>
          )}
        </div>
      </section>

      <div className="toolbar">
        <input
          className="search"
          placeholder="검색 (아이 이름 / 제목)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="ghostBtn" onClick={() => myFamilyId && load(myFamilyId)} disabled={!myFamilyId}>
          새로고침
        </button>
      </div>

      {msg && <div className="notice">{msg}</div>}

      {filtered.length === 0 ? (
        <div className="empty">
          <div className="emptyTitle">작품이 아직 없어요</div>
          <div className="emptyDesc">우측 상단 업로드 버튼으로 올려주세요.</div>
        </div>
      ) : (
        <section className="grid">
          {filtered.map((a) => {
            const busy = busyId === a.id;
            const expired = isExpired(a);
            const extendEnabled = a.is_public && expired;

            const showPublic = a.is_public;
            const publicBtnStyle: React.CSSProperties = showPublic
              ? { background: "#22C55E", color: "#111827", border: "1px solid rgba(0,0,0,0.08)" }
              : { background: "#111827", color: "#fff", border: "1px solid rgba(255,255,255,0.15)" };

            return (
              <article className="card" key={a.id}>
                <div className="top">
                  <div className="left">
                    <div className="kid">{a.kid_name}</div>
                    <div className="title">{a.title}</div>
                  </div>
                  <StatusBadge art={a} />
                </div>

                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="img" src={a.private_image_path} alt={a.title} loading="lazy" />

                <div className="metaRow">
                  <div className="metaLine">
                    <span className="metaKey">작품제작일</span>
                    <span className="metaVal">{formatKoreanDate(a.artwork_made_at)}</span>
                  </div>
                  <div className="metaLine">
                    <span className="metaKey">전시만료</span>
                    <span className="metaVal">{formatKoreanDate(a.public_until)}</span>
                  </div>
                </div>

                <div className="actions">
                  <button
                    onClick={() => togglePublic(a)}
                    disabled={busy}
                    className="toggleBtn"
                    style={publicBtnStyle}
                  >
                    {showPublic ? "공개중" : "비공개"}
                  </button>

                  <button
                    onClick={() => extendEnabled && !busy && extendTwoWeeks(a)}
                    disabled={!extendEnabled || busy}
                    className={`linkBtn ${extendEnabled ? "on" : "off"}`}
                    title={extendEnabled ? "2주 연장" : "만료된 경우에만 사용 가능"}
                  >
                    기간만료연장
                  </button>

                  <span className="spacer" />

                  <button onClick={() => deleteArtwork(a)} disabled={busy} className="delBtn">
                    삭제
                  </button>
                </div>

                {busy && <div className="busy">처리 중…</div>}
              </article>
            );
          })}
        </section>
      )}

      <style jsx>{`
        .wrap { padding: 38px; max-width: 1040px; margin: 0 auto; }
        .header { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; padding-bottom: 14px; border-bottom: 1px solid #eef0f3; }
        .eyebrow { font-size: 11px; letter-spacing: 0.18em; color: #6b7280; }
        .h1 { margin: 6px 0 6px; letter-spacing: -0.6px; font-size: 28px; }
        .desc { margin: 0; color: #6b7280; font-size: 14px; line-height: 1.45; }
        .right { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
        .primary { font-size: 12px; padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.08); background: #111827; color: #fff; text-decoration: none; font-weight: 900; }
        .ghost { font-size: 12px; padding: 10px 12px; border-radius: 12px; border: 1px solid #e5e7eb; background: #fff; color: #111827; text-decoration: none; font-weight: 800; }

        .inviteBox { margin-top: 14px; border: 1px solid #e8ebf0; border-radius: 16px; background: #fff; padding: 14px; box-shadow: 0 1px 0 rgba(17, 24, 39, 0.04); }
        .inviteTop { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .inviteTitle { font-weight: 900; letter-spacing: -0.3px; }
        .inviteDesc { margin-top: 6px; color: #6b7280; font-size: 13px; line-height: 1.45; }
        .inviteBtns { display: flex; gap: 10px; align-items: center; }
        .ghostBtn { padding: 10px 12px; border-radius: 12px; border: 1px solid #e5e7eb; background: #fff; cursor: pointer; font-size: 12px; font-weight: 900; }
        .darkBtn { padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.08); background: #111827; color: #fff; cursor: pointer; font-size: 12px; font-weight: 900; }
        .inviteLink { margin-top: 10px; padding: 10px 12px; border: 1px solid #eef0f3; border-radius: 14px; background: #fafafa; font-size: 13px; }
        .link { color: #111827; font-weight: 800; text-decoration: none; word-break: break-all; }
        .muted { color: #6b7280; font-weight: 700; }

        .toolbar { margin-top: 14px; display: flex; gap: 10px; align-items: center; }
        .search { flex: 1; padding: 11px 12px; border-radius: 14px; border: 1px solid #e5e7eb; background: #fff; outline: none; font-size: 13px; }
        .notice { margin-top: 14px; padding: 10px 12px; border: 1px solid #eee; border-radius: 12px; background: #fff; color: #111827; font-size: 13px; }

        .empty { margin-top: 18px; border: 1px solid #eef0f3; border-radius: 16px; padding: 18px; background: #fafafa; }
        .emptyTitle { font-weight: 900; letter-spacing: -0.4px; }
        .emptyDesc { margin-top: 6px; font-size: 13px; color: #6b7280; line-height: 1.45; }

        .grid { margin-top: 16px; display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
        .card { border: 1px solid #e8ebf0; border-radius: 16px; background: #fff; padding: 12px; box-shadow: 0 1px 0 rgba(17, 24, 39, 0.04); }
        .top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .kid { font-size: 12px; color: #6b7280; font-weight: 800; }
        .title { margin-top: 3px; font-weight: 900; letter-spacing: -0.3px; word-break: break-word; line-height: 1.25; }
        .img { margin-top: 10px; width: 100%; height: 210px; object-fit: cover; border-radius: 14px; background: #f3f4f6; border: 1px solid #f1f5f9; }

        .metaRow { margin-top: 10px; display: grid; gap: 6px; }
        .metaLine { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
        .metaKey { font-size: 12px; color: #6b7280; font-weight: 800; }
        .metaVal { font-size: 12px; color: #111827; font-weight: 800; }

        .actions { margin-top: 10px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .toggleBtn { padding: 10px 12px; border-radius: 12px; font-size: 12px; font-weight: 900; letter-spacing: -0.2px; cursor: pointer; }
        .linkBtn { border: none; background: transparent; font-size: 12px; font-weight: 900; letter-spacing: -0.2px; user-select: none; }
        .linkBtn.off { color: #9ca3af; cursor: not-allowed; text-decoration: none; }
        .linkBtn.on { color: #111827; cursor: pointer; text-decoration: underline; }
        .spacer { flex: 1; }
        .delBtn { padding: 10px 12px; border-radius: 12px; border: 1px solid #e5e7eb; background: #fff; cursor: pointer; font-size: 12px; font-weight: 900; letter-spacing: -0.2px; }
        .busy { margin-top: 10px; font-size: 12px; color: #6b7280; }

        @media (max-width: 720px) {
          .wrap { padding: 18px; }
          .header { align-items: flex-start; }
          .spacer { display: none; }
        }
      `}</style>
    </main>
  );
}
