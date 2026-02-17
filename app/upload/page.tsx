"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

function formatNowForInput() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} 24:00`;
}

function parseArtworkMadeAt(input: string): { iso: string | null; error: string | null } {
  const t = input.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/.exec(t);
  if (!m) return { iso: null, error: "형식은 YYYY-MM-DD 24:00 입니다." };

  const yyyy = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  let hh = Number(m[4]);
  const mi = Number(m[5]);

  if (mm < 1 || mm > 12) return { iso: null, error: "월(mm)이 올바르지 않습니다." };
  if (dd < 1 || dd > 31) return { iso: null, error: "일(dd)이 올바르지 않습니다." };
  if (mi !== 0) return { iso: null, error: "분은 00만 허용합니다. (예: 24:00)" };
  if (!(hh === 24 || (hh >= 0 && hh <= 23))) return { iso: null, error: "시간은 00~24만 허용합니다." };

  const base = new Date(yyyy, mm - 1, dd, 0, 0, 0, 0);
  if (Number.isNaN(base.getTime())) return { iso: null, error: "날짜가 올바르지 않습니다." };

  if (hh === 24) {
    base.setDate(base.getDate() + 1);
    hh = 0;
  }
  base.setHours(hh, 0, 0, 0);

  return { iso: base.toISOString(), error: null };
}

export default function UploadPage() {
  const router = useRouter();

  const [kidName, setKidName] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [useNow, setUseNow] = useState(true);
  const [madeAtInput, setMadeAtInput] = useState(formatNowForInput());
  const [madeAtError, setMadeAtError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);

  // 메시지(아래에 표시)
  const [msg, setMsg] = useState("");
  const [msgTone, setMsgTone] = useState<"ok" | "err" | "info">("info");

  const [preview, setPreview] = useState<string | null>(null);

  // 성공 후 자동 이동 카운트다운
  const [redirectIn, setRedirectIn] = useState<number | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (useNow) {
      setMadeAtError(null);
      return;
    }
    const { error } = parseArtworkMadeAt(madeAtInput);
    setMadeAtError(error);
  }, [useNow, madeAtInput]);

  useEffect(() => {
    if (redirectIn == null) return;
    if (redirectIn <= 0) {
      router.replace("/manage");
      return;
    }
    const t = setTimeout(() => setRedirectIn((v) => (v == null ? null : v - 1)), 1000);
    return () => clearTimeout(t);
  }, [redirectIn, router]);

  const canSubmit = useMemo(() => {
    if (!kidName.trim() || !title.trim() || !file) return false;
    if (!useNow && !!madeAtError) return false;
    return true;
  }, [kidName, title, file, useNow, madeAtError]);

  const upload = async () => {
    if (!canSubmit) {
      alert("아이 이름, 제목, 사진 파일을 입력하고 작품제작일 형식을 확인해줘.");
      return;
    }

    let artwork_made_at: string;
    if (useNow) {
      artwork_made_at = new Date().toISOString();
    } else {
      const parsed = parseArtworkMadeAt(madeAtInput);
      if (parsed.error || !parsed.iso) {
        alert(parsed.error ?? "작품제작일 형식이 올바르지 않습니다.");
        return;
      }
      artwork_made_at = parsed.iso;
    }

    setBusy(true);
    setMsgTone("info");
    setMsg("업로드 중...");

    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("family_id")
      .single();

    if (profErr || !prof?.family_id) {
      setMsgTone("err");
      setMsg("❌ 가족 정보(profiles)가 없어서 저장할 수 없어. 로그인 상태를 확인해줘.");
      setBusy(false);
      return;
    }

    const ext = file!.name.split(".").pop() || "jpg";
    const filePath = `${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;

    const { error: upErr } = await supabase.storage.from("artworks").upload(filePath, file!, { upsert: false });
    if (upErr) {
      setMsgTone("err");
      setMsg("❌ 업로드 실패: " + upErr.message);
      setBusy(false);
      return;
    }

    const { data: pub } = supabase.storage.from("artworks").getPublicUrl(filePath);
    const publicUrl = pub.publicUrl;

    const { error: dbErr } = await supabase.from("artworks").insert({
      family_id: prof.family_id,
      kid_name: kidName.trim(),
      title: title.trim(),
      private_image_path: publicUrl,
      public_image_path: publicUrl,
      is_public: false,
      artwork_made_at,
    });

    if (dbErr) {
      setMsgTone("err");
      setMsg("❌ DB 저장 실패: " + dbErr.message);
      setBusy(false);
      return;
    }

    // ✅ 성공: 아래에 메시지 + 2초 뒤 이동
    setMsgTone("ok");
    setMsg("✅ 업로드 완료! 곧 가족 전시관으로 이동해요.");
    setRedirectIn(2);

    // 입력 초기화(바로 해도 OK)
    setKidName("");
    setTitle("");
    setFile(null);
    setPreview(null);
    setUseNow(true);
    setMadeAtInput(formatNowForInput());
    setBusy(false);
  };

  return (
    <main className="wrap">
      <header className="header">
        <div>
          <div className="eyebrow">UPLOAD</div>
          <h1 className="h1">작품 업로드</h1>
          <p className="desc">아이 이름, 작품 제목, 작품제작일, 사진을 올려주세요.</p>
        </div>
        <div className="right">
          <a className="ghost" href="/manage">가족 전시관</a>
          <a className="ghost" href="/">메인으로</a>
        </div>
      </header>

      <section className="card">
        <div className="grid">
          <div className="field">
            <label className="label">아이 이름</label>
            <input className="input" placeholder="예: 민준" value={kidName} onChange={(e) => setKidName(e.target.value)} disabled={busy} />
          </div>

          <div className="field">
            <label className="label">작품 제목</label>
            <input className="input" placeholder="예: 무지개" value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
          </div>

          <div className="field">
            <div className="row">
              <label className="label">작품제작일</label>
              <label className="check">
                <input type="checkbox" checked={useNow} onChange={(e) => setUseNow(e.target.checked)} disabled={busy} />
                <span>현재시간</span>
              </label>
            </div>

            <input
              className="input"
              placeholder="YYYY-MM-DD 24:00"
              value={madeAtInput}
              onChange={(e) => setMadeAtInput(e.target.value)}
              disabled={busy || useNow}
              style={useNow ? { opacity: 0.55 } : undefined}
            />
            <div className="hint">
              형식: <b>YYYY-MM-DD 24:00</b> (분은 00만) {!useNow && madeAtError ? <span className="err"> · {madeAtError}</span> : null}
            </div>
          </div>

          <div className="field">
  <label className="label">사진 파일</label>

  <div className="fileRow">
    <label className={`fileBtn ${busy ? "disabled" : ""}`}>
      <input
        className="fileHidden"
        type="file"
        accept="image/*"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        disabled={busy}
      />
      파일 선택
    </label>

    <div className="fileName" title={file?.name ?? ""}>
      {file ? file.name : "선택된 파일 없음"}
    </div>
  </div>

  <div className="hint">가로/세로 상관 없이 자동으로 맞춰서 보여줘요.</div>
</div>
        </div>

        {preview && (
          <div className="previewWrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="preview" src={preview} alt="preview" />
          </div>
        )}

        <div className="actions">
          <button className="primary" onClick={upload} disabled={busy || !canSubmit}>
            {busy ? "업로드 중..." : "업로드"}
          </button>
          <a className="ghostBtn" href="/manage">취소</a>
        </div>

        {/* ✅ 완료/에러 메시지는 "아래"에 고정 */}
        {msg && (
          <div className={`message ${msgTone}`}>
            <div>{msg}</div>
            {redirectIn != null && redirectIn > 0 && (
              <div className="small">{redirectIn}초 후 이동…</div>
            )}
          </div>
        )}
      </section>

      <style jsx>{`
        .wrap { padding: 38px; max-width: 920px; margin: 0 auto; }
        .header { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; padding-bottom: 14px; border-bottom: 1px solid #eef0f3; }
        .eyebrow { font-size: 11px; letter-spacing: 0.18em; color: #6b7280; }
        .h1 { margin: 6px 0 6px; letter-spacing: -0.6px; font-size: 28px; }
        .desc { margin: 0; color: #6b7280; font-size: 14px; line-height: 1.45; }
        .right { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
        .ghost { font-size: 12px; padding: 10px 12px; border-radius: 12px; border: 1px solid #e5e7eb; background: #fff; color: #111827; text-decoration: none; font-weight: 800; }
        .card { margin-top: 16px; border: 1px solid #e8ebf0; border-radius: 16px; background: #fff; padding: 14px; box-shadow: 0 1px 0 rgba(17, 24, 39, 0.04); }
        .grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
        .field { display: grid; gap: 6px; }
        .label { font-size: 12px; color: #6b7280; font-weight: 800; }
        .row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .check { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: #111827; font-weight: 800; user-select: none; }
        .input { padding: 11px 12px; border-radius: 14px; border: 1px solid #e5e7eb; background: #fff; outline: none; font-size: 13px; }
        .file { font-size: 13px; }
        .fileRow {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.fileHidden {
  display: none;
}

.fileBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 11px 14px;
  border-radius: 14px;
  border: 1px solid rgba(0,0,0,0.12);
  background: #111827;
  color: #fff;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
  user-select: none;
  transition: transform 0.05s ease, opacity 0.15s ease;
}

.fileBtn:active {
  transform: translateY(1px);
}

.fileBtn.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.fileName {
  flex: 1;
  min-width: 180px;
  padding: 11px 12px;
  border-radius: 14px;
  border: 1px solid #e5e7eb;
  background: #fafafa;
  color: #111827;
  font-size: 13px;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

        .hint { font-size: 12px; color: #6b7280; line-height: 1.45; }
        .err { color: #b45309; font-weight: 800; }
        .previewWrap { margin-top: 12px; border: 1px solid #eef0f3; border-radius: 16px; background: #fafafa; padding: 10px; }
        .preview { width: 100%; height: 320px; object-fit: cover; border-radius: 14px; background: #f3f4f6; border: 1px solid #f1f5f9; }
        .actions { margin-top: 14px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        .primary { padding: 11px 14px; border-radius: 14px; border: 1px solid rgba(0,0,0,0.08); background: #111827; color: #fff; font-size: 13px; font-weight: 900; cursor: pointer; }
        .ghostBtn { padding: 11px 14px; border-radius: 14px; border: 1px solid #e5e7eb; background: #fff; color: #111827; text-decoration: none; font-size: 13px; font-weight: 900; }

        .message {
          margin-top: 14px;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid #eee;
          background: #fff;
          font-size: 13px;
        }
        .message.ok { border-color: rgba(34,197,94,0.35); }
        .message.err { border-color: rgba(239,68,68,0.35); }
        .message.info { border-color: #eee; }
        .small { margin-top: 6px; font-size: 12px; color: #6b7280; font-weight: 800; }

        @media (max-width: 720px) {
          .wrap { padding: 18px; }
          .header { align-items: flex-start; }
        }
      `}</style>
    </main>
  );
}
