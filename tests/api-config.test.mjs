import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  API_CONFIG_STORAGE_KEY,
  createApiConfig,
  deleteApiConfig,
  maskApiKey,
  readApiConfigs,
  writeApiConfigs,
} from "../app/api-config.ts";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("normalizes a valid custom API configuration", () => {
  const config = createApiConfig({
    name: "  我的接口  ",
    endpoint: " https://api.example.com/v1/ ",
    model: "  jasmine-vision  ",
    apiKey: "  secret-123456  ",
  }, "config-1", "2026-08-24T08:00:00.000Z");

  assert.deepEqual(config, {
    id: "config-1",
    name: "我的接口",
    endpoint: "https://api.example.com/v1/",
    model: "jasmine-vision",
    apiKey: "secret-123456",
    createdAt: "2026-08-24T08:00:00.000Z",
  });
});

test("accepts local HTTP endpoints but rejects unsafe or credentialed URLs", () => {
  assert.doesNotThrow(() => createApiConfig({ name: "本机", endpoint: "http://localhost:11434/v1" }, "1", "2026-08-24T08:00:00.000Z"));
  assert.doesNotThrow(() => createApiConfig({ name: "本机", endpoint: "http://127.0.0.1:8080/v1" }, "2", "2026-08-24T08:00:00.000Z"));
  assert.throws(() => createApiConfig({ name: "危险", endpoint: "javascript:alert(1)" }, "3", "2026-08-24T08:00:00.000Z"), /接口地址/);
  assert.throws(() => createApiConfig({ name: "明文", endpoint: "http://api.example.com/v1" }, "4", "2026-08-24T08:00:00.000Z"), /HTTPS/);
  assert.throws(() => createApiConfig({ name: "账号", endpoint: "https://user:pass@example.com/v1" }, "5", "2026-08-24T08:00:00.000Z"), /账号|密码/);
});

test("masks saved API keys without revealing the full value", () => {
  assert.equal(maskApiKey("secret-123456"), "••••••••3456");
  assert.equal(maskApiKey("abc"), "•••");
  assert.equal(maskApiKey(""), "未填写");
  assert.doesNotMatch(maskApiKey("secret-123456"), /secret|123456/);
});

test("persists, safely reads, and deletes local configurations", () => {
  const storage = memoryStorage();
  const config = createApiConfig({ name: "示例", endpoint: "https://api.example.com/v1" }, "config-1", "2026-08-24T08:00:00.000Z");
  writeApiConfigs(storage, [config]);
  assert.deepEqual(readApiConfigs(storage), [config]);
  assert.deepEqual(deleteApiConfig([config], "config-1"), []);

  const broken = memoryStorage({ [API_CONFIG_STORAGE_KEY]: "not-json" });
  assert.deepEqual(readApiConfigs(broken), []);

  const invalidRecord = memoryStorage({
    [API_CONFIG_STORAGE_KEY]: JSON.stringify([{ ...config, createdAt: "not-a-date" }]),
  });
  assert.deepEqual(readApiConfigs(invalidRecord), []);
});

test("API settings UI saves locally, hides secrets, and supports deletion", async () => {
  const [settings, page] = await Promise.all([
    readFile(new URL("../app/api-settings.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(settings, /localStorage/);
  assert.match(settings, /type="password"/);
  assert.match(settings, /maskApiKey/);
  assert.match(settings, /window\.confirm/);
  assert.match(settings, /删除配置/);
  assert.match(settings, /DeepSeek/);
  assert.match(settings, /deepseek-v4-flash-vision-exp/);
  assert.match(settings, /t\.vinno\.com/);
  assert.match(settings, /填入 DeepSeek/);
  assert.match(page, /"settings"/);
  assert.match(page, /<ApiSettings/);
  assert.match(page, />API 设置</);
});
