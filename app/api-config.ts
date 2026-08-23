export const API_CONFIG_STORAGE_KEY = "xiaomo-api-configs-v1";

export type ApiConfigInput = {
  name: string;
  endpoint: string;
  model?: string;
  apiKey?: string;
};

export type ApiConfig = {
  id: string;
  name: string;
  endpoint: string;
  model: string;
  apiKey: string;
  createdAt: string;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function validEndpoint(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("请输入完整的接口地址，例如 https://api.example.com/v1");
  }

  if (url.username || url.password) {
    throw new Error("接口地址里不能包含账号或密码");
  }

  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localHosts.has(url.hostname))) {
    throw new Error("接口地址必须使用 HTTPS；HTTP 只允许本机地址");
  }

  return url.toString();
}

export function createApiConfig(input: ApiConfigInput, id: string, createdAt: string): ApiConfig {
  const name = input.name.trim();
  const endpoint = input.endpoint.trim();
  const model = input.model?.trim() ?? "";
  const apiKey = input.apiKey?.trim() ?? "";

  if (!name) throw new Error("请填写配置名称");
  if (name.length > 80) throw new Error("配置名称不能超过 80 个字");
  if (!endpoint) throw new Error("请填写接口地址");
  if (endpoint.length > 2048) throw new Error("接口地址过长");
  if (model.length > 200) throw new Error("模型名称不能超过 200 个字符");
  if (apiKey.length > 4096) throw new Error("API 密钥过长");

  return { id, name, endpoint: validEndpoint(endpoint), model, apiKey, createdAt };
}

export function maskApiKey(apiKey: string) {
  if (!apiKey) return "未填写";
  if (apiKey.length <= 4) return "•".repeat(apiKey.length);
  return `${"•".repeat(Math.min(8, apiKey.length - 4))}${apiKey.slice(-4)}`;
}

function isApiConfig(value: unknown): value is ApiConfig {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ApiConfig>;
  if (typeof item.id !== "string" || typeof item.name !== "string" || typeof item.endpoint !== "string"
    || typeof item.model !== "string" || typeof item.apiKey !== "string" || typeof item.createdAt !== "string") return false;
  if (!item.id || !item.name || !item.endpoint || !item.createdAt || !Number.isFinite(Date.parse(item.createdAt))) return false;
  if (item.name.length > 80 || item.endpoint.length > 2048 || item.model.length > 200 || item.apiKey.length > 4096) return false;
  try {
    validEndpoint(item.endpoint);
    return true;
  } catch {
    return false;
  }
}

export function readApiConfigs(storage: StorageLike): ApiConfig[] {
  try {
    const value = storage.getItem(API_CONFIG_STORAGE_KEY);
    if (!value) return [];
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(isApiConfig) : [];
  } catch {
    return [];
  }
}

export function writeApiConfigs(storage: StorageLike, configs: ApiConfig[]) {
  storage.setItem(API_CONFIG_STORAGE_KEY, JSON.stringify(configs));
}

export function deleteApiConfig(configs: ApiConfig[], id: string) {
  return configs.filter((config) => config.id !== id);
}
