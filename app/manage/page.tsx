"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useRouter } from "next/navigation";

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

/** ✅ 방명록 타입 */
type Entry = {
  id: string;
  display_name: string;
  content: string;
  created_at: string;
};

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

function toISO(d: Date) {
  return d.toISOString();
}

function formatKoreanDate(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
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
    return <span style={{ ...base, background: "#FDE68A", color: "#111827" }}>전시만료</span>;
  }

  return <span style={{ ...base, background: "#22C55E", color: "#111827" }}>공개중</span>;
}

function makeToken(len = 24) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/**
 * private_image_path가 URL이어도 bucket 내부 경로를 최대한 뽑아준다.
 */
function getStoragePathFromPrivateImagePath(privateImagePath: string) {
  const raw = (privateImagePath ?? "").trim();
  if (!raw) return "";

  if (!raw.startsWith("http://") && !raw.startsWith("https://")) return raw;

  try {
    const u = new URL(raw);
    const p = u.pathname;
    const marker = "/artworks/";
    const idx = p.indexOf(marker);
    if (idx >= 0) return decodeURIComponent(p.slice(idx + marker.length));
    return decodeURIComponent(p.split("/").pop() || "");
  } catch {
    return raw.split("/").pop() || "";
  }
}

/** profiles.user_id 기준으로 내 프로필을 찾는다 */
async function fetchMyProfile(): Promise<{
  family_id: string | null;
  invite_token: string | null;
  uid: string | null;
  error: string | null;
}> {
  const { data: u, error: uErr } = await supabase.auth.getUser();
  const uid = u.user?.id ?? null;

  if (uErr || !uid) {
    return {
      family_id: null,
      invite_token: null,
      uid: null,
      error: "로그인 사용자 정보를 찾지 못했어요.",
    };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("family_id, invite_token")
    .eq("user_id", uid)
    .maybeSingle();

  if (error) {
    return { family_id: null, invite_token: null, uid, error: error.message };
  }

  return {
    family_id: (data?.family_id ?? null) as string | null,
    invite_token: (data?.invite_token ?? null) as string | null,
    uid,
    error: null,
  };
}

/** 초대코드 저장: upsert */
async function saveInviteToken(
  next: string,
  prof: { uid: string; family_id: string }
): Promise<{ ok: boolean; error: string | null }> {
  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      { user_id: prof.uid, family_id: prof.family_id, invite_token: next },
      { onConflict: "user_id" }
    )
    .select("user_id, family_id, invite_token");

  if (error) return { ok: false, error: error.message };
  if (data && data.length > 0 && data[0]?.invite_token === next) return { ok: true, error: null };
  return { ok: false, error: "저장 결과 확인 실패" };
}

export default function ManagePage() {
  const router = useRouter();

  const [items, setItems] = useState<Artwork[]>([]);
  const [msg, setMsg] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [myFamilyId, setMyFamilyId] = useState<string | null>(null);

  const [inviteToken, setInviteToken] = useState<string>("");
  const [inviteBusy, setInviteBusy] = useState(false);

  const [q, setQ] = useState("");

  /** ✅ 방명록 상태 */
  const [entries, setEntries] = useState<Entry[]>([]);
  const [guestbookBusy, setGuestbookBusy] = useState(false);

  // ✅ (추가) 이미지 확대 모달 상태
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerSrc, setViewerSrc] = useState<string>("");
  const [viewerTitle, setViewerTitle] = useState<string>("");

  const openViewer = (src: string, title: string) => {
    setViewerSrc(src);
    setViewerTitle(title);
    setViewerOpen(true);
  };

  const closeViewer = () => {
    setViewerOpen(false);
    setViewerSrc("");
    setViewerTitle("");
  };

  // ✅ ESC 닫기
  useEffect(() => {
    if (!viewerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeViewer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerOpen]);

  const inviteLink = useMemo(() => {
    if (!inviteToken) return "";
    if (typeof window === "undefined") return `/invite/${inviteToken}`;
    return `${window.location.origin}/invite/${inviteToken}`;
  }, [inviteToken]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter((a) => a.kid_name.toLowerCase().includes(t) || a.title.toLowerCase().includes(t));
  }, [items, q]);

  const load = async (familyId: string) => {
    setMsg("불러오는 중...");

    const { data, error } = await supabase
      .from("artworks")
      .select("id, kid_name, title, private_image_path, created_at, is_public, public_until, artwork_made_at")
      .eq("family_id", familyId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      setMsg("❌ 조회 실패: " + error.message);
      return;
    }

    setItems((data ?? []) as Artwork[]);
    setMsg("");
  };

  /** 방명록 조회: SQL 함수 public.get_guestbook_entries_by_token(text) 호출 */
  const loadGuestbook = async (token: string) => {
    if (!token) return;

    setGuestbookBusy(true);

    const { data, error } = await supabase.rpc("get_guestbook_entries_by_token", { p_token: token });

    if (error) {
      setEntries([]);
      setMsg("⚠️ 방명록 조회 실패: " + error.message);
      setGuestbookBusy(false);
      return;
    }

    setEntries((data ?? []) as Entry[]);
    setGuestbookBusy(false);
  };

  /** 방명록 삭제: SQL 함수 public.delete_guestbook_entry(uuid) 호출 */
  const deleteEntry = async (id: string) => {
    const ok = confirm("이 방명록을 삭제할까요?");
    if (!ok) return;

    const { error } = await supabase.rpc("delete_guestbook_entry", { p_id: id });

    if (error) {
      setMsg("❌ 방명록 삭제 실패: " + error.message);
      return;
    }

    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  useEffect(() => {
    const run = async () => {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        router.replace("/login");
        return;
      }

      const prof = await fetchMyProfile();
      if (prof.error || !prof.family_id) {
        setMsg("⚠️ 프로필 조회 실패: " + (prof.error ?? "unknown"));
        return;
      }

      setMyFamilyId(prof.family_id);

      const t = prof.invite_token ?? "";
      setInviteToken(t);

      await load(prof.family_id);
      if (t) await loadGuestbook(t);
    };

    run();
  }, [router]);

  const createOrRegenerateInvite = async () => {
    setInviteBusy(true);
    setMsg("초대코드 처리 중...");

    const prof = await fetchMyProfile();
    if (prof.error || !prof.family_id || !prof.uid) {
      setMsg("❌ 초대코드 저장 실패: " + (prof.error ?? "profiles 정보 없음"));
      setInviteBusy(false);
      return;
    }

    setMyFamilyId(prof.family_id);

    const next = makeToken(28);

    const saved = await saveInviteToken(next, {
      uid: prof.uid,
      family_id: prof.family_id,
    });

    if (!saved.ok) {
      setMsg("❌ 초대코드 저장 실패: " + (saved.error ?? "unknown"));
      setInviteBusy(false);
      return;
    }

    setInviteToken(next);

    // ✅ 초대코드 새로 만들었으면 방명록도 새 토큰 기준으로 로딩
    await loadGuestbook(next);

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

    const storagePath = getStoragePathFromPrivateImagePath(art.private_image_path);

    if (storagePath) {
      const { error: stErr } = await supabase.storage.from("artworks").remove([storagePath]);
      if (stErr) setMsg("⚠️ 사진 삭제 실패(그래도 DB는 지울게): " + stErr.message);
    } else {
      setMsg("⚠️ 사진 경로를 못 찾아서 DB만 지울게요.");
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

  return (
    <main className="wrap">
      <header className="header">
        <div>
          <div className="eyebrow">FAMILY ROOM</div>
          <h1 className="h1">가족 전시관</h1>
          <p className="desc">작품 관리 / 전시 공개 / 초대 링크 공유</p>
        </div>

        <div className="right">
          <a className="ghost" href="/">
            메인
          </a>
          <a className="primary" href="/upload">
            업로드
          </a>
        </div>
      </header>

      <section className="inviteBox">
        <div className="inviteTop">
          <div>
            <div className="inviteTitle">초대 링크</div>
            <div className="inviteDesc">할아버지·할머니에게 링크를 보내면 작품 보기/방명록 작성이 가능해요.</div>
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

      {/* ✅ 방명록 섹션 */}
      <section className="guestbookBox">
        <div className="guestTop">
          <div>
            <div className="guestTitle">방명록</div>
            <div className="guestDesc">초대 링크로 남겨진 메시지를 가족이 여기서 바로 확인할 수 있어요.</div>
          </div>

          <button
            className="ghostBtn"
            onClick={() => inviteToken && loadGuestbook(inviteToken)}
            disabled={!inviteToken || guestbookBusy}
            title={!inviteToken ? "초대 링크를 먼저 생성해 주세요." : "방명록 새로고침"}
          >
            {guestbookBusy ? "불러오는 중..." : "새로고침"}
          </button>
        </div>

        {entries.length === 0 ? (
          <div className="guestEmpty">
            <div className="guestEmptyTitle">아직 방명록이 없어요</div>
            <div className="guestEmptyDesc">초대 링크를 공유하면 메시지가 여기에 쌓여요.</div>
          </div>
        ) : (
          <div className="guestList">
            {entries.map((e) => (
              <div className="guestEntry" key={e.id}>
                <div className="guestEntryTop">
                  <div>
                    <div className="guestWho">{e.display_name}</div>
                    <div className="guestWhen">{formatKoreanDate(e.created_at)}</div>
                  </div>

                  <button className="delBtn" onClick={() => deleteEntry(e.id)} title="삭제">
                    삭제
                  </button>
                </div>

                <div className="guestContent">{e.content}</div>
              </div>
            ))}
          </div>
        )}
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
                <img
                  className="img"
                  src={a.private_image_path}
                  alt={a.title}
                  loading="lazy"
                  role="button"
                  tabIndex={0}
                  onClick={() => openViewer(a.private_image_path, a.title)}
                  onKeyDown={(e) => e.key === "Enter" && openViewer(a.private_image_path, a.title)}
                  title="클릭하면 크게 보기"
                />

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
                  <button onClick={() => togglePublic(a)} disabled={busy} className="toggleBtn" style={publicBtnStyle}>
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

      {/* ✅ 이미지 확대 모달 */}
      {viewerOpen && (
        <div className="modal" onClick={closeViewer} role="dialog" aria-modal="true">
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="modalTop">
              <div className="modalTitle">{viewerTitle}</div>
              <button className="modalClose" onClick={closeViewer} aria-label="닫기">
                닫기
              </button>
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="modalImg" src={viewerSrc} alt={viewerTitle} />
          </div>
        </div>
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

        .guestbookBox { margin-top: 14px; border: 1px solid #e8ebf0; border-radius: 16px; background: #fff; padding: 14px; box-shadow: 0 1px 0 rgba(17, 24, 39, 0.04); }
        .guestTop { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .guestTitle { font-weight: 900; letter-spacing: -0.3px; }
        .guestDesc { margin-top: 6px; color: #6b7280; font-size: 13px; line-height: 1.45; }

        .guestEmpty { margin-top: 10px; border: 1px solid #eef0f3; border-radius: 16px; padding: 14px; background: #fafafa; }
        .guestEmptyTitle { font-weight: 900; letter-spacing: -0.4px; }
        .guestEmptyDesc { margin-top: 6px; font-size: 13px; color: #6b7280; line-height: 1.45; }

        .guestList { margin-top: 10px; display: grid; gap: 10px; }
        .guestEntry { border: 1px solid #e8ebf0; border-radius: 16px; background: #fff; padding: 12px; }
        .guestEntryTop { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
        .guestWho { font-weight: 900; letter-spacing: -0.2px; }
        .guestWhen { font-size: 12px; color: #6b7280; font-weight: 800; white-space: nowrap; }
        .guestContent { margin-top: 6px; line-height: 1.55; }

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
        .img { margin-top: 10px; width: 100%; height: 210px; object-fit: cover; border-radius: 14px; background: #f3f4f6; border: 1px solid #f1f5f9; cursor: zoom-in; }

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

        /* ✅ 모달 */
        .modal { position: fixed; inset: 0; background: rgba(17, 24, 39, 0.6); display: flex; align-items: center; justify-content: center; padding: 18px; z-index: 1000; }
        .modalCard { width: min(980px, 100%); max-height: 92vh; background: #fff; border-radius: 16px; border: 1px solid rgba(0,0,0,0.08); overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.18); }
        .modalTop { display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 12px 14px; border-bottom: 1px solid #eef0f3; }
        .modalTitle { font-weight: 900; letter-spacing: -0.3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .modalClose { padding: 8px 10px; border-radius: 12px; border: 1px solid #e5e7eb; background: #fff; color: #111827; font-size: 12px; font-weight: 900; cursor: pointer; }
        .modalImg { width: 100%; height: auto; max-height: calc(92vh - 52px); object-fit: contain; background: #111827; }

        @media (max-width: 720px) {
          .wrap { padding: 18px; }
          .header { align-items: flex-start; }
          .spacer { display: none; }
        }
      `}</style>
    </main>
  );
}
