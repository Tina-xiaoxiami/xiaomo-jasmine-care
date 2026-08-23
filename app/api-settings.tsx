"use client";

import { type FormEvent, useEffect, useState } from "react";
import {
  type ApiConfig,
  createApiConfig,
  deleteApiConfig,
  maskApiKey,
  readApiConfigs,
  writeApiConfigs,
} from "./api-config";

const emptyForm = { name: "", endpoint: "", model: "", apiKey: "" };

export function ApiSettings() {
  const [configs, setConfigs] = useState<ApiConfig[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setConfigs(readApiConfigs(window.localStorage)));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function updateField(field: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    try {
      const config = createApiConfig(form, crypto.randomUUID(), new Date().toISOString());
      const next = [config, ...configs];
      writeApiConfigs(window.localStorage, next);
      setConfigs(next);
      setForm(emptyForm);
      setNotice("配置已保存在这台设备上。密钥以后只显示尾号。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "配置暂时无法保存，请稍后再试");
    }
  }

  function remove(config: ApiConfig) {
    if (!window.confirm(`确认删除“${config.name}”吗？删除后无法恢复。`)) return;
    try {
      const next = deleteApiConfig(configs, config.id);
      writeApiConfigs(window.localStorage, next);
      setConfigs(next);
      setError("");
      setNotice(`已删除“${config.name}”。`);
    } catch {
      setError("删除失败，请检查浏览器是否允许本地存储");
    }
  }

  return (
    <section className="api-settings-page">
      <div className="page-heading">
        <p className="eyebrow">LOCAL CONNECTIONS</p>
        <h1>API 设置</h1>
        <p>记录你想使用的接口。当前只保存配置，不会自动调用，也不会把密钥上传到服务器。</p>
      </div>

      <div className="api-settings-grid">
        <form className="api-config-form" onSubmit={submit}>
          <div className="api-form-heading">
            <span>＋</span>
            <div><p className="eyebrow">NEW CONFIG</p><h2>添加一个 API</h2></div>
          </div>

          <label className="api-field">
            <span>配置名称 <b>必填</b></span>
            <input value={form.name} onChange={(event) => updateField("name", event.target.value)} maxLength={80} placeholder="例如：我的图像识别接口" required />
          </label>
          <label className="api-field">
            <span>接口地址 <b>必填</b></span>
            <input type="url" value={form.endpoint} onChange={(event) => updateField("endpoint", event.target.value)} maxLength={2048} placeholder="https://api.example.com/v1" inputMode="url" autoCapitalize="none" spellCheck={false} required />
          </label>
          <label className="api-field">
            <span>模型名称 <small>选填</small></span>
            <input value={form.model} onChange={(event) => updateField("model", event.target.value)} maxLength={200} placeholder="例如：vision-model" autoCapitalize="none" spellCheck={false} />
          </label>
          <label className="api-field">
            <span>API 密钥 <small>选填</small></span>
            <input type="password" value={form.apiKey} onChange={(event) => updateField("apiKey", event.target.value)} maxLength={4096} placeholder="粘贴密钥" autoComplete="new-password" autoCapitalize="none" spellCheck={false} />
          </label>

          <div className="api-secret-note"><span>⌁</span><p><strong>只保存在当前设备</strong>保存后不再完整显示。清理网站数据或卸载 App 可能会删除这些记录。</p></div>
          {error && <p className="api-message error" role="alert">{error}</p>}
          {notice && <p className="api-message success" role="status">{notice}</p>}
          <button className="primary-btn api-save-btn" type="submit">保存 API 配置</button>
        </form>

        <div className="api-config-list">
          <div className="api-list-heading"><div><p className="eyebrow">SAVED</p><h2>已保存的配置</h2></div><span>{configs.length} 个</span></div>
          {configs.length === 0 ? (
            <div className="api-empty"><span>⌘</span><h3>还没有 API 配置</h3><p>在左侧填写并保存后，记录会出现在这里。</p></div>
          ) : configs.map((config) => (
            <article className="api-config-card" key={config.id}>
              <div className="api-config-title"><span>API</span><div><h3>{config.name}</h3><small>{new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(config.createdAt))} 保存</small></div></div>
              <dl>
                <div><dt>接口</dt><dd>{config.endpoint}</dd></div>
                <div><dt>模型</dt><dd>{config.model || "未指定"}</dd></div>
                <div><dt>密钥</dt><dd className="masked-key">{maskApiKey(config.apiKey)}</dd></div>
              </dl>
              <button className="delete-api-btn" type="button" onClick={() => remove(config)}>删除配置</button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
