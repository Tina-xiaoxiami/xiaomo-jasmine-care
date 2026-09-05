export type DiagnosisConfig = {
  endpoint: string;
  model: string;
  apiKey: string;
};

export type DiagnosisInput = {
  imageBase64: string;
  note?: string;
};

export type DiagnosisOptions = {
  disableThinking?: boolean;
};

// 用户当前使用的 DeepSeek 视觉接口：VINNO 网关（OpenAI 兼容）。
export const DEFAULT_PROVIDER = {
  endpoint: "https://t.vinno.com/v1",
  model: "deepseek-v4-flash-vision-exp",
} as const;

const SYSTEM_PROMPT = [
  "你是一位资深园艺师，擅长茉莉花（Jasmine）等家庭盆栽的病虫害与养护诊断。",
  "请用简体中文回答，结构如下：先给出“最可能的判断”，再分点说明“现在怎么做”，最后补充“什么时候需要再来问我”。",
  "语气温和、务实、不夸大；只根据照片和补充观察判断，不要编造看不到的细节。",
  "拿不准时明确说明不确定性。你的建议不能替代专业植保诊断，涉及农药时提醒按标签使用并注意安全。",
].join("");

const MAX_IMAGE_BASE64 = 8_000_000;
const MAX_NOTE_LENGTH = 2000;

const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

function validateEndpoint(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("接口地址无效");
  }
  if (url.username || url.password) throw new Error("接口地址里不能包含账号或密码");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localHosts.has(url.hostname))) {
    throw new Error("接口地址必须使用 HTTPS；HTTP 只允许本机地址");
  }
  return url.toString();
}

function normalizeImageBase64(value: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("缺少照片");
  const cleaned = value.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/=]+$/.test(cleaned)) throw new Error("照片数据无效");
  if (cleaned.length > MAX_IMAGE_BASE64) throw new Error("照片过大，请压缩后重试");
  return cleaned;
}

export function chatCompletionsUrl(endpoint: string): string {
  const base = endpoint.replace(/\/+$/, "");
  return /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`;
}

function userPrompt(note: string): string {
  const base = "请诊断这盆茉莉花：判断当前健康状态，以及是否出现病虫害、缺水、积水、缺光、肥害等问题。";
  return note ? `${base}\n\n我的补充观察：${note}` : base;
}

export function buildDiagnosisRequest(config: DiagnosisConfig, input: DiagnosisInput, options: DiagnosisOptions = {}) {
  const endpoint = validateEndpoint(config.endpoint);
  const imageBase64 = normalizeImageBase64(input.imageBase64);
  const note = (input.note ?? "").trim().slice(0, MAX_NOTE_LENGTH);
  const model = config.model.trim();
  const apiKey = config.apiKey.trim();

  if (model.length > 200) throw new Error("模型名称不能超过 200 个字符");
  if (apiKey.length > 4096) throw new Error("API 密钥过长");

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        { type: "text", text: userPrompt(note) },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
      ],
    },
  ];

  const body: Record<string, unknown> = { messages, temperature: 0.3, max_tokens: 600, stream: false };
  if (model) body.model = model;
  if (options.disableThinking) body.thinking = { type: "disabled" };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  return { url: chatCompletionsUrl(endpoint), headers, body: JSON.stringify(body) };
}

function readText(part: unknown): string {
  if (!part || typeof part !== "object") return "";
  const value = part as { type?: unknown; text?: unknown };
  return value.type === "text" && typeof value.text === "string" ? value.text : "";
}

export function parseDiagnosisContent(payload: unknown): string {
  if (!payload || typeof payload !== "object") throw new Error("诊断接口返回了无法识别的内容");
  const data = payload as {
    error?: { message?: unknown };
    choices?: Array<{ message?: { content?: unknown }; text?: unknown }>;
  };

  if (data.error && typeof data.error === "object" && typeof data.error.message === "string" && data.error.message) {
    throw new Error(data.error.message);
  }

  const first = data.choices?.[0];
  const content = first?.message?.content ?? first?.text;

  if (typeof content === "string" && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    const text = content.map(readText).join("").trim();
    if (text) return text;
  }
  throw new Error("诊断接口没有返回文字结果");
}

export function upstreamErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as { error?: { message?: unknown } };
  return data.error && typeof data.error === "object" && typeof data.error.message === "string"
    ? data.error.message
    : null;
}
