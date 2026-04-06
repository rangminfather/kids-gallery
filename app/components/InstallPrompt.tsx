"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type InstallPromptProps = {
  className?: string;
  compact?: boolean;
};

export default function InstallPrompt({ className = "", compact = false }: InstallPromptProps) {
  const initialIsStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true);
  const initialIsIos =
    typeof window !== "undefined" && /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(initialIsStandalone);
  const [iosHint] = useState(initialIsIos && !initialIsStandalone);

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

  if (installed) return null;

  if (deferredPrompt) {
    return (
      <button className={className} onClick={() => void handleInstall()}>
        {compact ? "앱으로 설치" : "홈 화면에 추가"}
      </button>
    );
  }

  if (iosHint) {
    return <div className={className}>{compact ? "공유 버튼에서 홈 화면에 추가" : "사파리 공유 버튼을 눌러 홈 화면에 추가해 주세요"}</div>;
  }

  return null;
}
