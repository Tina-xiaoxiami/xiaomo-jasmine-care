"use client";

import { useEffect, useState } from "react";
import { type ApiConfig, readApiConfigs } from "./api-config";
import { readLocalPhoto } from "./local-care";

export function PhotoDiagnosis({ photoKey, note, onOpenSettings }: {
  photoKey: string | null;
  note: string;
  onOpenSettings: () => void;
}) {
  const [configs, setConfigs] = useState<ApiConfig[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const next = readApiConfigs(window.localStorage);
      setConfigs(next);
      setSelectedId((current) => current || next[0]?.id || "");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const activeConfig = configs.find((config) => config.id === selectedId) ?? configs[0] ?? null;
  const disabled = loading || !photoKey;

  async function diagnose() {
    setError("");
    setResult("");
    if (!photoKey) {
      setError("请先在上方拍一张今天的照片，再进行诊断。");
      return;
    }

    setLoading(true);
    try {
      const photo = await readLocalPhoto(photoKey);
      if (!photo) throw new Error("照片读取失败，请重新拍摄后再试。");
      const imageBase64 = await blobToBase64(photo);
      const response = await fetch("./api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: activeConfig?.endpoint ?? "",
          model: activeConfig?.model ?? "",
          apiKey: activeConfig?.apiKey ?? "",
          imageBase64,
          note,
        }),
      });
      if (response.status === 404) {
        throw new Error("当前部署不支持在线诊断。请在本地运行（npm run dev）或部署到 Cloudflare 后再使用。");
      }
      const data = (await response.json().catch(() => null)) as { error?: string; content?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? `诊断失败（${response.status}）`);
      if (!data?.content) throw new Error("没有拿到诊断结果，请稍后再试。");
      setResult(data.content);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "诊断请求失败，请稍后再试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="diagnosis-section" aria-labelledby="diagnosis-title">
      <div className="diagnosis-head">
        <div>
          <p className="eyebrow">AI PLANT CHECK</p>
          <h2 id="diagnosis-title">AI 拍照诊断</h2>
          <p>拍下叶背、黄叶或虫害的近照，默认用 DeepSeek 视觉模型给出初步判断和处置建议；也可在 API 设置里改用其它接口。</p>
        </div>
        {configs.length > 1 && (
          <label className="diagnosis-select">
            <span>使用接口</span>
            <select value={activeConfig?.id ?? ""} onChange={(event) => setSelectedId(event.target.value)}>
              {configs.map((config) => <option key={config.id} value={config.id}>{config.name}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="diagnosis-body">
        {result ? (
          <div className="diagnosis-result" role="status">
            <p className="eyebrow">诊断结果</p>
            {result.split("\n").map((line, index) => (line.trim() ? <p key={index}>{line}</p> : <br key={index} />))}
          </div>
        ) : (
          <p className="diagnosis-hint">{photoKey ? "照片已就绪，点击下方按钮开始诊断。" : "先在上方拍一张今天的照片，诊断会以照片为准。"}</p>
        )}

        {error && <p className="diagnosis-error" role="alert">{error}</p>}

        <div className="diagnosis-actions">
          <button className="primary-btn" type="button" onClick={diagnose} disabled={disabled}>
            {loading ? "正在诊断…" : result ? "重新诊断" : "开始诊断"}
          </button>
          {configs.length === 0 && <button className="text-btn" type="button" onClick={onOpenSettings}>改用其它接口</button>}
        </div>
        <small className="diagnosis-note">{activeConfig ? "诊断通过你部署的 Worker 转发到你保存的接口。" : "未保存本地配置时，默认调用 DeepSeek 视觉模型（deepseek-v4-flash-vision-exp），密钥由部署时设置的服务端变量提供。"} 照片与密钥不会在 Worker 中存储，结果仅供参考。</small>
      </div>
    </section>
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      resolve(value.split(",", 2)[1] ?? "");
    };
    reader.onerror = () => reject(new Error("照片读取失败"));
    reader.readAsDataURL(blob);
  });
}
