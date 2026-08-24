"use client";

import { useEffect, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstall() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [installed, setInstalled] = useState(true);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register(new URL("sw.js", window.location.href).pathname);
    const frame = window.requestAnimationFrame(() => {
      setInstalled(window.matchMedia("(display-mode: standalone)").matches ||
        Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
      setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    });

    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
      setInstalled(false);
    };
    const handleInstalled = () => { setInstalled(true); setPromptEvent(null); setShowGuide(false); };
    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  async function install() {
    if (promptEvent) {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setPromptEvent(null);
      return;
    }
    setShowGuide(true);
  }

  if (installed) return null;
  if (!promptEvent && !isIos) return null;

  return <>
    <button className="install-app-btn" onClick={install}><span>↓</span>安装 App</button>
    {showGuide && <div className="install-overlay">
      <button className="install-backdrop" onClick={() => setShowGuide(false)} aria-label="关闭安装说明" />
      <div className="install-sheet" role="dialog" aria-modal="true" aria-labelledby="install-title">
        <div className="install-icon">茉</div>
        <p className="eyebrow">安装到 iPhone</p>
        <h2 id="install-title">把“小茉日常”放到桌面</h2>
        <ol><li>点击 Safari 底部的“分享”按钮</li><li>向下滑，选择“添加到主屏幕”</li><li>点击右上角“添加”即可</li></ol>
        <button className="primary-btn" onClick={() => setShowGuide(false)}>我知道了</button>
      </div>
    </div>}
  </>;
}
