import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CARE_RECORDS_STORAGE_KEY,
  readLocalCareRecords,
  upsertLocalCareRecord,
} from "../app/local-care.ts";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

const record = (overrides = {}) => ({
  id: "record-1", recordDate: "2026-08-24", completed: ["sun"], soil: "moist",
  leaves: "healthy", bloom: "buds", note: "状态稳定", photoKey: null,
  fertilized: false, updatedAt: "2026-08-24T08:00:00.000Z", ...overrides,
});

test("stores care records only in the current device and replaces the same day's entry", () => {
  const storage = memoryStorage();
  const initial = upsertLocalCareRecord(storage, record());
  const updated = upsertLocalCareRecord(storage, record({ completed: ["sun", "inspection"], updatedAt: "2026-08-24T09:00:00.000Z" }));

  assert.equal(initial.length, 1);
  assert.deepEqual(updated, [record({ completed: ["sun", "inspection"], updatedAt: "2026-08-24T09:00:00.000Z" })]);
  assert.deepEqual(readLocalCareRecords(storage), updated);
  assert.match(storage.getItem(CARE_RECORDS_STORAGE_KEY), /inspection/);
});

test("recovers safely when device-local care data is damaged", () => {
  const storage = memoryStorage({ [CARE_RECORDS_STORAGE_KEY]: "not-json" });
  assert.deepEqual(readLocalCareRecords(storage), []);
});

test("the standalone build uses browser-local data and direct weather requests", async () => {
  const [page, forecast, config, workflow] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/forecast-care.tsx", import.meta.url), "utf8"),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/deploy-pages.yml", import.meta.url), "utf8"),
  ]);

  assert.match(page, /readLocalCareRecords/);
  assert.match(page, /saveLocalPhoto/);
  assert.doesNotMatch(page, /fetch\("\/api\/records/);
  assert.doesNotMatch(page, /fetch\("\/api\/photos/);
  assert.match(forecast, /fetchWeatherForecast/);
  assert.doesNotMatch(forecast, /\/api\/forecast/);
  assert.match(config, /output:\s*isGitHubPages\s*\?\s*"export"/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /npm run build:pages/);
});
