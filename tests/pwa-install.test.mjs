import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("declares an installable standalone app", async () => {
  const manifest = JSON.parse(await readFile(new URL("public/manifest.webmanifest", root), "utf8"));
  assert.equal(manifest.name, "小茉日常｜茉莉养护助手");
  assert.equal(manifest.short_name, "小茉日常");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.theme_color, "#285d4c");
  assert.deepEqual(manifest.icons.map(({ src, sizes, type }) => ({ src, sizes, type })), [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
  ]);
  await Promise.all([
    access(new URL("public/icon-192.png", root)),
    access(new URL("public/icon-512.png", root)),
    access(new URL("public/apple-touch-icon.png", root)),
  ]);
});

test("registers a safe offline worker and exposes install metadata", async () => {
  const [worker, layout, installer] = await Promise.all([
    readFile(new URL("public/sw.js", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/pwa-install.tsx", root), "utf8"),
  ]);
  assert.match(worker, /skipWaiting/);
  assert.match(worker, /clients\.claim/);
  assert.match(worker, /pathname\.startsWith\("\/api\/"\)/);
  assert.match(layout, /manifest:\s*"\/manifest\.webmanifest"/);
  assert.match(layout, /apple:\s*"\/apple-touch-icon\.png"/);
  assert.match(installer, /serviceWorker\.register\("\/sw\.js"\)/);
  assert.match(installer, /beforeinstallprompt/);
  assert.match(installer, /添加到主屏幕/);
});
