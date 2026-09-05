import { buildDiagnosisRequest, DEFAULT_PROVIDER, parseDiagnosisContent, upstreamErrorMessage } from "../app/diagnose.ts";

const MAX_BODY_BYTES = 9_000_000;
const UPSTREAM_TIMEOUT_MS = 120_000;

export type DiagnoseEnv = {
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_BASE_URL?: string;
  DEEPSEEK_VISION_MODEL?: string;
};

export async function handleDiagnose(request: Request, env: DiagnoseEnv): Promise<Response> {
  if (request.method !== "POST") return json({ error: "仅支持 POST 请求" }, 405);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "请求体不是有效的 JSON" }, 400);
  }
  if (!payload || typeof payload !== "object") return json({ error: "请求体格式不正确" }, 400);

  const body = payload as Record<string, unknown>;
  const input = {
    imageBase64: typeof body.imageBase64 === "string" ? body.imageBase64 : "",
    note: typeof body.note === "string" ? body.note : "",
  };

  if (JSON.stringify(body).length > MAX_BODY_BYTES) return json({ error: "请求体过大" }, 413);

  const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
  const isDefault = !endpoint;
  const config = isDefault
    ? {
        endpoint: env.DEEPSEEK_BASE_URL ?? DEFAULT_PROVIDER.endpoint,
        model: env.DEEPSEEK_VISION_MODEL ?? DEFAULT_PROVIDER.model,
        apiKey: env.DEEPSEEK_API_KEY ?? "",
      }
    : {
        endpoint,
        model: typeof body.model === "string" ? body.model : "",
        apiKey: typeof body.apiKey === "string" ? body.apiKey : "",
      };

  if (isDefault && !config.apiKey) {
    return json({ error: "未配置默认 DeepSeek 密钥，请在部署时设置 DEEPSEEK_API_KEY。" }, 500);
  }

  let upstream: { url: string; headers: Record<string, string>; body: string };
  try {
    upstream = buildDiagnosisRequest(config, input, { disableThinking: isDefault });
  } catch (reason) {
    return json({ error: reason instanceof Error ? reason.message : "请求参数无效" }, 400);
  }

  try {
    const response = await fetch(upstream.url, {
      method: "POST",
      headers: upstream.headers,
      body: upstream.body,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const text = await response.text();

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      const message = upstreamErrorMessage(parsed) ?? `接口返回错误（${response.status}）`;
      return json({ error: message }, 502);
    }

    return json({ content: parseDiagnosisContent(parsed) }, 200);
  } catch (reason) {
    if (reason instanceof Error && reason.name === "TimeoutError") {
      return json({ error: "诊断超时，请稍后再试" }, 504);
    }
    return json({ error: reason instanceof Error ? reason.message : "诊断请求失败" }, 502);
  }
}

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
