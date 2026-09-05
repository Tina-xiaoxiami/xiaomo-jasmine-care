import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildDiagnosisRequest,
  chatCompletionsUrl,
  DEFAULT_PROVIDER,
  parseDiagnosisContent,
} from "../app/diagnose.ts";
import { handleDiagnose } from "../worker/diagnose.ts";

const config = { endpoint: "https://api.example.com/v1", model: "vision-1", apiKey: "sk-test-123" };

function postRequest(body) {
  return new Request("https://xiaomo.care/api/diagnose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("builds an OpenAI-compatible vision request with a care-specific prompt", () => {
  const request = buildDiagnosisRequest(config, { imageBase64: "aGVsbG8=", note: "叶背有白色小点" });
  assert.equal(request.url, "https://api.example.com/v1/chat/completions");
  assert.equal(request.headers.Authorization, "Bearer sk-test-123");

  const body = JSON.parse(request.body);
  assert.equal(body.model, "vision-1");
  assert.equal(body.stream, false);
  assert.equal(body.messages[0].role, "system");
  assert.match(body.messages[0].content, /园艺师/);
  assert.equal(body.messages[1].role, "user");
  assert.equal(body.messages[1].content[0].type, "text");
  assert.match(body.messages[1].content[0].text, /叶背有白色小点/);
  assert.equal(body.messages[1].content[1].type, "image_url");
  assert.equal(body.messages[1].content[1].image_url.url, "data:image/jpeg;base64,aGVsbG8=");
});

test("normalizes endpoints and omits empty fields", () => {
  assert.equal(
    chatCompletionsUrl("https://api.example.com/v1/"),
    "https://api.example.com/v1/chat/completions",
  );
  assert.equal(
    buildDiagnosisRequest({ ...config, endpoint: "https://api.example.com/v1/chat/completions" }, { imageBase64: "aGVsbG8=" }).url,
    "https://api.example.com/v1/chat/completions",
  );

  const noModel = buildDiagnosisRequest({ ...config, model: "" }, { imageBase64: "aGVsbG8=" });
  assert.equal("model" in JSON.parse(noModel.body), false);
  assert.equal("Authorization" in noModel.headers, true);

  const noKey = buildDiagnosisRequest({ ...config, apiKey: "" }, { imageBase64: "aGVsbG8=" });
  assert.equal("Authorization" in noKey.headers, false);
});

test("disables DeepSeek thinking mode when asked", () => {
  const plain = buildDiagnosisRequest(config, { imageBase64: "aGVsbG8=" });
  assert.equal("thinking" in JSON.parse(plain.body), false);

  const noThinking = buildDiagnosisRequest(config, { imageBase64: "aGVsbG8=" }, { disableThinking: true });
  assert.deepEqual(JSON.parse(noThinking.body).thinking, { type: "disabled" });
});

test("defaults to the DeepSeek vision provider", () => {
  assert.equal(DEFAULT_PROVIDER.endpoint, "https://t.vinno.com/v1");
  assert.equal(DEFAULT_PROVIDER.model, "deepseek-v4-flash-vision-exp");
});

test("rejects unsafe endpoints and damaged images before calling upstream", () => {
  assert.throws(() => buildDiagnosisRequest({ ...config, endpoint: "http://api.example.com/v1" }, { imageBase64: "aGVsbG8=" }), /HTTPS/);
  assert.throws(() => buildDiagnosisRequest({ ...config, endpoint: "https://user:pass@example.com/v1" }, { imageBase64: "aGVsbG8=" }), /账号|密码/);
  assert.throws(() => buildDiagnosisRequest(config, { imageBase64: "not base64!!" }), /照片数据无效/);
  assert.throws(() => buildDiagnosisRequest(config, { imageBase64: "" }), /缺少照片/);
});

test("parses chat-completions answers and surfaces upstream errors", () => {
  assert.equal(parseDiagnosisContent({ choices: [{ message: { content: "叶片有黄斑" } }] }), "叶片有黄斑");
  assert.equal(
    parseDiagnosisContent({ choices: [{ message: { content: [{ type: "text", text: "判断：红蜘蛛" }, { type: "text", text: "，先隔离。" }] } }] }),
    "判断：红蜘蛛，先隔离。",
  );
  assert.throws(() => parseDiagnosisContent({ error: { message: "额度已用尽" } }), /额度已用尽/);
  assert.throws(() => parseDiagnosisContent({}), /没有返回文字结果/);
  assert.throws(() => parseDiagnosisContent(null), /无法识别/);
});

test("worker route forwards a valid custom request and returns the model answer", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://api.example.com/v1/chat/completions");
    const body = JSON.parse(init.body);
    assert.equal(init.headers.Authorization, "Bearer sk-test-123");
    assert.equal(body.messages[1].content[1].image_url.url, "data:image/jpeg;base64,aGVsbG8=");
    assert.equal("thinking" in body, false);
    return new Response(JSON.stringify({ choices: [{ message: { content: "疑似红蜘蛛，请隔离并用清水冲洗叶背。" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const response = await handleDiagnose(postRequest({ ...config, imageBase64: "aGVsbG8=", note: "" }), {});
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.match(data.content, /红蜘蛛/);
  } finally {
    globalThis.fetch = original;
  }
});

test("worker route uses the default DeepSeek provider and disables thinking", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://t.vinno.com/v1/chat/completions");
    const body = JSON.parse(init.body);
    assert.equal(init.headers.Authorization, "Bearer sk-deepseek");
    assert.equal(body.model, "deepseek-v4-flash-vision-exp");
    assert.deepEqual(body.thinking, { type: "disabled" });
    return new Response(JSON.stringify({ choices: [{ message: { content: "叶片有轻微黄斑。" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const response = await handleDiagnose(
      postRequest({ imageBase64: "aGVsbG8=" }),
      { DEEPSEEK_API_KEY: "sk-deepseek" },
    );
    assert.equal(response.status, 200);
    assert.match((await response.json()).content, /黄斑/);
  } finally {
    globalThis.fetch = original;
  }
});

test("worker route requires a default key when no custom endpoint is provided", async () => {
  const response = await handleDiagnose(postRequest({ imageBase64: "aGVsbG8=" }), {});
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /DEEPSEEK_API_KEY/);
});

test("worker route rejects bad methods, bad JSON, and unsafe endpoints", async () => {
  assert.equal((await handleDiagnose(new Request("https://xiaomo.care/api/diagnose", { method: "GET" }), {})).status, 405);

  const badJson = await handleDiagnose(new Request("https://xiaomo.care/api/diagnose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not json",
  }), {});
  assert.equal(badJson.status, 400);

  const unsafe = await handleDiagnose(postRequest({ ...config, endpoint: "http://api.example.com/v1", imageBase64: "aGVsbG8=" }), {});
  assert.equal(unsafe.status, 400);
  assert.match((await unsafe.json()).error, /HTTPS/);
});

test("worker route passes through upstream error messages", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: "无效的 API key" } }), { status: 401 });
  try {
    const response = await handleDiagnose(postRequest({ ...config, imageBase64: "aGVsbG8=" }), {});
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /无效的 API key/);
  } finally {
    globalThis.fetch = original;
  }
});

test("the client wires the photo diagnosis panel into the today page", async () => {
  const [page, panel, worker] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/photo-diagnosis.tsx", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /<PhotoDiagnosis photoKey=\{photoKey\} note=\{note\} onOpenSettings=/);
  assert.match(panel, /readLocalPhoto/);
  assert.match(panel, /\.\/api\/diagnose/);
  assert.match(panel, /开始诊断/);
  assert.match(panel, /DeepSeek/);
  assert.match(panel, /deepseek-v4-flash-vision-exp/);
  assert.match(worker, /\/api\/diagnose/);
  assert.match(worker, /handleDiagnose/);
  assert.match(worker, /DEEPSEEK_API_KEY/);
});

test("the built worker serves the /api/diagnose route", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("https://xiaomo.care/api/diagnose", { method: "GET" }),
    {},
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 405);
});
