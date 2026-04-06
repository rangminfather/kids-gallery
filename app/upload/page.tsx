"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type MadeAtMode = "now" | "photo" | "manual";

type SelectedUploadFile = {
  file: File;
  previewUrl: string;
  detectedMadeAt: string | null;
  titleSuggestion: string;
};

function pad2(v: number) {
  return String(v).padStart(2, "0");
}

function formatDateForInput(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(
    date.getMinutes()
  )}`;
}

function sanitizeTitleFromFilename(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "작품";
}

function exifToInputValue(raw: string) {
  const m = /^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2})(?::\d{2})?$/.exec(raw.trim());
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`;
}

function parseArtworkMadeAt(input: string): { iso: string | null; error: string | null } {
  const t = input.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/.exec(t);
  if (!m) return { iso: null, error: "형식은 YYYY-MM-DD HH:mm 입니다." };

  const yyyy = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  let hh = Number(m[4]);
  const mi = Number(m[5]);

  if (mm < 1 || mm > 12) return { iso: null, error: "월(month)이 올바르지 않습니다." };
  if (dd < 1 || dd > 31) return { iso: null, error: "일(day)이 올바르지 않습니다." };
  if (mi < 0 || mi > 59) return { iso: null, error: "분(minute)은 00~59만 가능합니다." };
  if (!(hh === 24 || (hh >= 0 && hh <= 23))) return { iso: null, error: "시간(hour)은 00~24만 가능합니다." };
  if (hh === 24 && mi !== 0) return { iso: null, error: "24시는 24:00으로만 입력할 수 있습니다." };

  const base = new Date(yyyy, mm - 1, dd, 0, 0, 0, 0);
  if (Number.isNaN(base.getTime())) return { iso: null, error: "날짜가 올바르지 않습니다." };

  if (hh === 24) {
    base.setDate(base.getDate() + 1);
    hh = 0;
  }
  base.setHours(hh, mi, 0, 0);

  return { iso: base.toISOString(), error: null };
}

function readAscii(view: DataView, offset: number, length: number) {
  let out = "";
  for (let i = 0; i < length; i++) out += String.fromCharCode(view.getUint8(offset + i));
  return out;
}

function getExifAsciiValue(view: DataView, tiffStart: number, valueOffset: number, count: number) {
  if (count <= 1) return null;
  try {
    return readAscii(view, tiffStart + valueOffset, count - 1);
  } catch {
    return null;
  }
}

function findExifDateInIfd(view: DataView, tiffStart: number, ifdOffset: number, littleEndian: boolean) {
  const dateTags = new Set([0x9003, 0x9004, 0x0132]);
  const exifOffsetTag = 0x8769;

  try {
    const dirOffset = tiffStart + ifdOffset;
    const entryCount = view.getUint16(dirOffset, littleEndian);
    let nestedExifOffset: number | null = null;

    for (let i = 0; i < entryCount; i++) {
      const entryOffset = dirOffset + 2 + i * 12;
      const tag = view.getUint16(entryOffset, littleEndian);
      const count = view.getUint32(entryOffset + 4, littleEndian);
      const valueOffset = view.getUint32(entryOffset + 8, littleEndian);

      if (dateTags.has(tag)) {
        const raw = getExifAsciiValue(view, tiffStart, valueOffset, count);
        const normalized = raw ? exifToInputValue(raw) : null;
        if (normalized) return normalized;
      }

      if (tag === exifOffsetTag) nestedExifOffset = valueOffset;
    }

    if (nestedExifOffset != null) return findExifDateInIfd(view, tiffStart, nestedExifOffset, littleEndian);
  } catch {
    return null;
  }

  return null;
}

async function detectPhotoMadeAt(file: File) {
  const fallback = formatDateForInput(new Date(file.lastModified));
  if (file.type !== "image/jpeg" && file.type !== "image/jpg") return fallback;

  try {
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return fallback;

    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset);
      offset += 2;

      if (marker === 0xffda || marker === 0xffd9) break;

      const size = view.getUint16(offset);
      if (size < 2 || offset + size > view.byteLength) break;

      if (marker === 0xffe1 && readAscii(view, offset + 2, 6) === "Exif\u0000\u0000") {
        const tiffStart = offset + 8;
        const endian = readAscii(view, tiffStart, 2);
        const littleEndian = endian === "II";
        if (endian !== "II" && endian !== "MM") return fallback;

        const ifd0Offset = view.getUint32(tiffStart + 4, littleEndian);
        const exifDate = findExifDateInIfd(view, tiffStart, ifd0Offset, littleEndian);
        return exifDate ?? fallback;
      }

      offset += size;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

export default function UploadPage() {
  const router = useRouter();

  const [kidName, setKidName] = useState("");
  const [title, setTitle] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<SelectedUploadFile[]>([]);

  const [madeAtMode, setMadeAtMode] = useState<MadeAtMode>("now");
  const [madeAtInput, setMadeAtInput] = useState(formatDateForInput(new Date()));
  const [madeAtError, setMadeAtError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgTone, setMsgTone] = useState<"ok" | "err" | "info">("info");
  const [redirectIn, setRedirectIn] = useState<number | null>(null);

  useEffect(() => {
    if (madeAtMode !== "manual") {
      setMadeAtError(null);
      return;
    }
    const { error } = parseArtworkMadeAt(madeAtInput);
    setMadeAtError(error);
  }, [madeAtInput, madeAtMode]);

  useEffect(() => {
    if (madeAtMode === "now") {
      setMadeAtInput(formatDateForInput(new Date()));
      return;
    }
    if (madeAtMode === "photo" && selectedFiles[0]?.detectedMadeAt) {
      setMadeAtInput(selectedFiles[0].detectedMadeAt);
    }
  }, [madeAtMode, selectedFiles]);

  useEffect(() => {
    if (redirectIn == null) return;
    if (redirectIn <= 0) {
      router.replace("/manage");
      return;
    }
    const timer = setTimeout(() => setRedirectIn((prev) => (prev == null ? null : prev - 1)), 1000);
    return () => clearTimeout(timer);
  }, [redirectIn, router]);

  useEffect(() => {
    return () => {
      selectedFiles.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, [selectedFiles]);

  const canSubmit = useMemo(() => {
    if (!kidName.trim()) return false;
    if (selectedFiles.length === 0) return false;
    if (selectedFiles.length === 1 && !title.trim()) return false;
    if (madeAtMode === "manual" && !!madeAtError) return false;
    return true;
  }, [kidName, selectedFiles, title, madeAtMode, madeAtError]);

  const handleFilesChange = async (list: FileList | null) => {
    const files = Array.from(list ?? []);

    selectedFiles.forEach((item) => URL.revokeObjectURL(item.previewUrl));

    if (files.length === 0) {
      setSelectedFiles([]);
      return;
    }

    setMsgTone("info");
    setMsg("사진 정보를 읽는 중...");

    const next = await Promise.all(
      files.map(async (file) => ({
        file,
        previewUrl: URL.createObjectURL(file),
        detectedMadeAt: await detectPhotoMadeAt(file),
        titleSuggestion: sanitizeTitleFromFilename(file.name),
      }))
    );

    setSelectedFiles(next);
    setMsg("");
  };

  const resolveArtworkMadeAt = (item: SelectedUploadFile) => {
    if (madeAtMode === "now") return new Date().toISOString();
    if (madeAtMode === "photo") {
      const parsed = parseArtworkMadeAt(item.detectedMadeAt ?? "");
      if (parsed.iso) return parsed.iso;
      return new Date(item.file.lastModified).toISOString();
    }

    const parsed = parseArtworkMadeAt(madeAtInput);
    if (parsed.error || !parsed.iso) throw new Error(parsed.error ?? "작품제작일 형식이 올바르지 않습니다.");
    return parsed.iso;
  };

  const buildTitle = (item: SelectedUploadFile, index: number) => {
    if (selectedFiles.length === 1) return title.trim();
    if (title.trim()) return `${title.trim()} ${index + 1}`;
    return item.titleSuggestion;
  };

  const resetForm = () => {
    selectedFiles.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setKidName("");
    setTitle("");
    setSelectedFiles([]);
    setMadeAtMode("now");
    setMadeAtInput(formatDateForInput(new Date()));
  };

  const upload = async () => {
    if (!canSubmit) {
      alert("아이 이름과 사진 파일을 확인하고, 단일 업로드일 때는 제목도 입력해 주세요.");
      return;
    }

    setBusy(true);
    setMsgTone("info");
    setMsg("업로드 중...");

    const { data: prof, error: profErr } = await supabase.from("profiles").select("family_id").single();

    if (profErr || !prof?.family_id) {
      setMsgTone("err");
      setMsg("가족 정보(profiles)를 찾지 못했습니다. 로그인 상태를 확인해 주세요.");
      setBusy(false);
      return;
    }

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const item = selectedFiles[i];
        const fileExt = item.file.name.split(".").pop() || "jpg";
        const filePath = `${Date.now()}-${i}-${Math.random().toString(16).slice(2)}.${fileExt}`;
        const artworkMadeAt = resolveArtworkMadeAt(item);

        const { error: uploadError } = await supabase.storage.from("artworks").upload(filePath, item.file, { upsert: false });
        if (uploadError) throw new Error(`파일 업로드 실패: ${item.file.name} / ${uploadError.message}`);

        const { data: publicUrlData } = supabase.storage.from("artworks").getPublicUrl(filePath);
        const publicUrl = publicUrlData.publicUrl;

        const { error: dbError } = await supabase.from("artworks").insert({
          family_id: prof.family_id,
          kid_name: kidName.trim(),
          title: buildTitle(item, i),
          private_image_path: publicUrl,
          public_image_path: publicUrl,
          is_public: false,
          artwork_made_at: artworkMadeAt,
        });

        if (dbError) throw new Error(`DB 저장 실패: ${item.file.name} / ${dbError.message}`);
      }

      setMsgTone("ok");
      setMsg(`업로드 완료: ${selectedFiles.length}개 작품을 저장했습니다. 잠시 후 가족 전시관으로 이동합니다.`);
      setRedirectIn(2);
      resetForm();
    } catch (error) {
      setMsgTone("err");
      setMsg(error instanceof Error ? error.message : "업로드 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const isManualDisabled = busy || madeAtMode !== "manual";

  return (
    <main className="wrap">
      <header className="header">
        <div>
          <div className="eyebrow">UPLOAD</div>
          <h1 className="h1">작품 업로드</h1>
          <p className="desc">아이 이름과 사진을 올리면 작품제작일을 현재시간, 사진 생성날짜, 직접입력 중에서 고를 수 있습니다.</p>
        </div>
        <div className="right">
          <Link className="ghost" href="/manage">
            가족 전시관
          </Link>
          <Link className="ghost" href="/">
            메인으로
          </Link>
        </div>
      </header>

      <section className="card">
        <div className="grid">
          <div className="field">
            <label className="label">아이 이름</label>
            <input className="input" placeholder="예: 민서" value={kidName} onChange={(e) => setKidName(e.target.value)} disabled={busy} />
          </div>

          <div className="field">
            <label className="label">{selectedFiles.length > 1 ? "제목 템플릿" : "작품 제목"}</label>
            <input
              className="input"
              placeholder={selectedFiles.length > 1 ? "비워두면 파일명으로 자동 저장" : "예: 봄 꽃밭"}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
            />
            <div className="hint">
              {selectedFiles.length > 1
                ? "여러 장 업로드 시 제목을 비워두면 각 파일명으로 저장하고, 입력하면 1, 2, 3 순번이 붙습니다."
                : "단일 업로드일 때는 제목을 직접 입력합니다."}
            </div>
          </div>

          <div className="field">
            <label className="label">작품제작일</label>
            <div className="modeRow">
              <label className="check">
                <input type="checkbox" checked={madeAtMode === "now"} onChange={() => setMadeAtMode("now")} disabled={busy} />
                <span>현재시간</span>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={madeAtMode === "photo"}
                  onChange={() => setMadeAtMode("photo")}
                  disabled={busy || selectedFiles.length === 0}
                />
                <span>사진 생성날짜</span>
              </label>
              <label className="check">
                <input type="checkbox" checked={madeAtMode === "manual"} onChange={() => setMadeAtMode("manual")} disabled={busy} />
                <span>직접입력</span>
              </label>
            </div>

            <input
              className="input"
              placeholder="YYYY-MM-DD HH:mm"
              value={madeAtInput}
              onChange={(e) => setMadeAtInput(e.target.value)}
              disabled={isManualDisabled}
              style={isManualDisabled ? { opacity: 0.55 } : undefined}
            />

            <div className="hint">
              형식: <b>YYYY-MM-DD HH:mm</b>
              {madeAtMode === "photo" ? " / 사진 내부 메타데이터가 없으면 파일 수정시간으로 대체합니다." : ""}
              {madeAtMode === "manual" && madeAtError ? <span className="err"> · {madeAtError}</span> : null}
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
                  multiple
                  onChange={(e) => void handleFilesChange(e.target.files)}
                  disabled={busy}
                />
                파일 선택
              </label>

              <div className="fileName" title={selectedFiles.map((item) => item.file.name).join(", ")}>
                {selectedFiles.length > 0 ? `${selectedFiles.length}개 선택됨` : "선택된 파일 없음"}
              </div>
            </div>

            <div className="hint">여러 장을 한 번에 올릴 수 있습니다. 각 작품은 개별 항목으로 저장됩니다. 사진을 꾹 누르시면 복수개가 선택됩니다.</div>
          </div>
        </div>

        {selectedFiles.length > 0 && (
          <div className="previewWrap">
            <div className="previewHead">
              <div className="previewTitle">선택한 사진</div>
              <div className="previewMeta">{selectedFiles.length}개</div>
            </div>

            <div className="previewGrid">
              {selectedFiles.map((item, index) => (
                <div className="previewCard" key={`${item.file.name}-${index}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="preview" src={item.previewUrl} alt={item.file.name} />
                  <div className="previewName">{buildTitle(item, index)}</div>
                  <div className="previewHint">{item.detectedMadeAt ?? "-"}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="actions">
          <button className="primary" onClick={upload} disabled={busy || !canSubmit}>
            {busy ? "업로드 중..." : selectedFiles.length > 1 ? "여러 작품 업로드" : "업로드"}
          </button>
          <Link className="ghostBtn" href="/manage">
            취소
          </Link>
        </div>

        {msg && (
          <div className={`message ${msgTone}`}>
            <div>{msg}</div>
            {redirectIn != null && redirectIn > 0 ? <div className="small">{redirectIn}초 뒤 이동합니다.</div> : null}
          </div>
        )}
      </section>

      <style jsx>{`
        .wrap { padding: 38px; max-width: 980px; margin: 0 auto; }
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
        .input { padding: 11px 12px; border-radius: 14px; border: 1px solid #e5e7eb; background: #fff; outline: none; font-size: 13px; }
        .hint { font-size: 12px; color: #6b7280; line-height: 1.45; }
        .err { color: #b45309; font-weight: 800; }
        .modeRow { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
        .check { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: #111827; font-weight: 800; user-select: none; }
        .fileRow { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        .fileHidden { display: none; }
        .fileBtn { display: inline-flex; align-items: center; justify-content: center; padding: 11px 14px; border-radius: 14px; border: 1px solid rgba(0,0,0,0.12); background: #111827; color: #fff; font-size: 13px; font-weight: 900; cursor: pointer; user-select: none; transition: transform 0.05s ease, opacity 0.15s ease; }
        .fileBtn:active { transform: translateY(1px); }
        .fileBtn.disabled { opacity: 0.5; cursor: not-allowed; }
        .fileName { flex: 1; min-width: 180px; padding: 11px 12px; border-radius: 14px; border: 1px solid #e5e7eb; background: #fafafa; color: #111827; font-size: 13px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .previewWrap { margin-top: 14px; border: 1px solid #eef0f3; border-radius: 16px; background: #fafafa; padding: 12px; }
        .previewHead { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
        .previewTitle { font-size: 13px; font-weight: 900; color: #111827; }
        .previewMeta { font-size: 12px; color: #6b7280; font-weight: 800; }
        .previewGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
        .previewCard { border: 1px solid #e8ebf0; border-radius: 14px; background: #fff; padding: 8px; }
        .preview { width: 100%; height: 140px; object-fit: cover; border-radius: 10px; background: #f3f4f6; border: 1px solid #f1f5f9; }
        .previewName { margin-top: 8px; font-size: 12px; font-weight: 800; color: #111827; word-break: break-word; }
        .previewHint { margin-top: 4px; font-size: 11px; color: #6b7280; }
        .actions { margin-top: 14px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        .primary { padding: 11px 14px; border-radius: 14px; border: 1px solid rgba(0,0,0,0.08); background: #111827; color: #fff; font-size: 13px; font-weight: 900; cursor: pointer; }
        .ghostBtn { padding: 11px 14px; border-radius: 14px; border: 1px solid #e5e7eb; background: #fff; color: #111827; text-decoration: none; font-size: 13px; font-weight: 900; }
        .message { margin-top: 14px; padding: 10px 12px; border-radius: 12px; border: 1px solid #eee; background: #fff; font-size: 13px; }
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
