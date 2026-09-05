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
  const [question, setQuestion] = useState("");
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
  const hasQuestion = question.trim().length > 0;

  async function diagnose() {
    setError("");
    setResult("");
    if (!photoKey) {
      setError("请先在上方拍一张今天的照片，再进行提问。");
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
          question: question.trim(),
        }),
      });
      if (response.status === 404) {
        throw new Error("当前部署不支持在线提问。请在本地运行（npm run dev）或部署到 Cloudflare 后再使用。");
      }
      const data = (await response.json().catch(() => null)) as { error?: string; content?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? `请求失败（${response.status}）`);
      if (!data?.content) throw new Error("没有拿到回答，请稍后再试。");
      setResult(data.content);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "请求失败，请稍后再试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="diagnosis-section" aria-labelledby="diagnosis-title">
      <div className="diagnosis-head">
        <div>
          <p className="eyebrow">AI PLANT CHAT</p>
          <h2 id="diagnosis-title">AI 拍照问答</h2>
          <p>拍下叶背、黄叶或虫害的近照后，可以直接打字提问，也可以不填问题一键做健康诊断。默认用 DeepSeek 视觉模型。</p>
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
            <p className="eyebrow">回答</p>
            {result.split("\n").map((line, index) => (line.trim() ? <p key={index}>{line}</p> : <br key={index} />))}
          </div>
        ) : (
          <p className="diagnosis-hint">{photoKey ? "照片已就绪，可以直接提问，或直接点下方按钮做健康诊断。" : "先在上方拍一张今天的照片，再提问。"}</p>
        )}

        <label className="diagnosis-question">
          <span>想问什么（可选）</span>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            maxLength={500}
            rows={2}
            placeholder="例如：叶子发黄是缺肥还是浇水太多？不填则做整体健康诊断。"
          />
        </label>

        {error && <p className="diagnosis-error" role="alert">{error}</p>}

        <div className="diagnosis-actions">
          <button className="primary-btn" type="button" onClick={diagnose} disabled={disabled}>
            {loading ? "正在回答…" : hasQuestion ? "发送提问" : "开始诊断"}
          </button>
          {configs.length === 0 && <button className="text-btn" type="button" onClick={onOpenSettings}>改用其它接口</button>}
        </div>
        <small className="diagnosis-note">{activeConfig ? "回答通过你部署的 Worker 转发到你保存的接口。" : "未保存本地配置时，默认调用 DeepSeek 视觉模型（deepseek-v4-flash-vision-exp），密钥由部署时设置的服务端变量提供。"} 照片与密钥不会在 Worker 中存储，结果仅供参考。</small>
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
