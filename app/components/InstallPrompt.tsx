"use client";

import { useEffect, useMemo, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type InstallPromptProps = {
  tone?: "dark" | "light";
  title?: string;
  className?: string;
};

function isStandaloneMode() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function detectPlatform() {
  if (typeof window === "undefined") {
    return { isIos: false, isAndroid: false, isKakao: false };
  }

  const ua = window.navigator.userAgent.toLowerCase();
  return {
    isIos: /iphone|ipad|ipod/.test(ua),
    isAndroid: /android/.test(ua),
    isKakao: /kakaotalk/.test(ua),
  };
}

export default function InstallPrompt({
  tone = "dark",
  title = "홈 화면에 추가",
  className = "",
}: InstallPromptProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandaloneMode());
  const platform = useMemo(() => detectPlatform(), []);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  const guideText = useMemo(() => {
    if (installed) return "이미 설치되어 있습니다. 홈 화면에서 바로 열 수 있어요.";
    if (deferredPrompt) return "버튼을 누르면 앱처럼 설치되고, 다음부터는 홈 화면 아이콘으로 바로 열 수 있어요.";
    if (platform.isKakao) return "카카오톡 안에서는 설치 버튼이 잘 안 뜰 수 있어요. 우측 상단 메뉴에서 Chrome 또는 Safari로 열어 설치해 주세요.";
    if (platform.isIos) return "Safari 공유 버튼을 눌러 '홈 화면에 추가'를 선택해 주세요.";
    if (platform.isAndroid) return "Chrome에서 열면 설치 버튼이 나타납니다. 설치 후 앱처럼 실행할 수 있어요.";
    return "브라우저에 따라 설치 방식이 다를 수 있어요. 가능하면 Chrome이나 Safari에서 열어 주세요.";
  }, [deferredPrompt, installed, platform]);

  const buttonLabel = installed ? "설치 완료" : deferredPrompt ? "앱으로 설치" : platform.isKakao ? "브라우저로 열기 안내" : "설치 안내 보기";

  const handleHelp = async () => {
    if (deferredPrompt) {
      await handleInstall();
      return;
    }

    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(window.location.href);
      } catch {}
    }
  };

  return (
    <div className={`installCard ${tone} ${className}`}>
      <div className="installIcon">{installed ? "✓" : "앱"}</div>
      <div className="installBody">
        <div className="installTitle">{title}</div>
        <div className="installDesc">{guideText}</div>
      </div>
      <button className="installAction" onClick={() => void handleHelp()} disabled={installed}>
        {buttonLabel}
      </button>

      <style jsx>{`
        .installCard {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 12px;
          align-items: center;
          border-radius: 18px;
          padding: 14px 16px;
          border: 1px solid rgba(255,255,255,0.14);
        }

        .installCard.dark {
          background: linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0.07));
          box-shadow: 0 18px 40px rgba(0,0,0,0.18);
        }

        .installCard.light {
          background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(250,244,240,0.94));
          border-color: rgba(124, 19, 32, 0.14);
          box-shadow: 0 18px 40px rgba(17,24,39,0.08);
        }

        .installIcon {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          display: grid;
          place-items: center;
          font-size: 14px;
          font-weight: 900;
          background: rgba(124, 19, 32, 0.16);
          color: inherit;
        }

        .installBody {
          min-width: 0;
        }

        .installTitle {
          font-size: 15px;
          font-weight: 900;
          letter-spacing: -0.3px;
          color: inherit;
        }

        .installDesc {
          margin-top: 4px;
          font-size: 12px;
          line-height: 1.45;
          opacity: 0.84;
          color: inherit;
        }

        .installAction {
          min-width: 110px;
          padding: 11px 12px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.18);
          background: #111827;
          color: #fff;
          font-size: 13px;
          font-weight: 900;
          cursor: pointer;
        }

        .light .installAction {
          background: #7c1320;
          border-color: rgba(124, 19, 32, 0.2);
        }

        .installAction:disabled {
          opacity: 0.55;
          cursor: default;
        }

        @media (max-width: 720px) {
          .installCard {
            grid-template-columns: 1fr;
            text-align: left;
          }

          .installAction {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
