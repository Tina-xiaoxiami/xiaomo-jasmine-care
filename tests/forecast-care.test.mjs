import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildCarePlan, weatherLabel } from "../app/care-forecast.ts";

const day = (overrides = {}) => ({
  date: "2026-08-23", weatherCode: 1, maxTemp: 27, minTemp: 20,
  rainSum: 0, rainProbability: 10, sunshineHours: 6, uvMax: 5,
  humidity: 60, sunrise: "2026-08-23T05:30", sunset: "2026-08-23T18:30",
  ...overrides,
});

test("hot sunny weather prioritizes early watering checks and pauses fertilizer", () => {
  const plan = buildCarePlan(day({ maxTemp: 35, uvMax: 9, sunshineHours: 10 }), { fertilizerDue: true });
  assert.equal(plan.level, "alert");
  assert.match(plan.actions.join(" "), /8 点前.*摸土/);
  assert.match(plan.actions.join(" "), /暂停施肥/);
  assert.match(plan.actions.join(" "), /正午/);
});

test("rainy humid weather protects flowers and prevents automatic watering", () => {
  const plan = buildCarePlan(day({ rainSum: 18, rainProbability: 90, humidity: 91, sunshineHours: 1 }), { fertilizerDue: true });
  assert.match(plan.actions.join(" "), /避雨|挡雨/);
  assert.match(plan.actions.join(" "), /不要因为日程固定浇水/);
  assert.match(plan.actions.join(" "), /通风/);
});

test("cold weather moves jasmine indoors and blocks fertilizer", () => {
  const plan = buildCarePlan(day({ minTemp: 8, maxTemp: 14 }), { fertilizerDue: true });
  assert.equal(plan.level, "alert");
  assert.match(plan.actions.join(" "), /移到室内|保温/);
  assert.match(plan.actions.join(" "), /暂停施肥/);
});

test("mild weather offers fertilizer only when the cycle is due", () => {
  const due = buildCarePlan(day(), { fertilizerDue: true });
  const notDue = buildCarePlan(day(), { fertilizerDue: false });
  assert.match(due.actions.join(" "), /适合施薄肥/);
  assert.doesNotMatch(notDue.actions.join(" "), /适合施薄肥/);
});

test("weather codes have useful Chinese labels", () => {
  assert.equal(weatherLabel(0), "晴");
  assert.equal(weatherLabel(63), "中雨");
  assert.equal(weatherLabel(95), "雷雨");
});

test("forecast endpoint and guide request a local fourteen-day plan", async () => {
  const [route, panel, page] = await Promise.all([
    readFile(new URL("../app/api/forecast/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/forecast-care.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(route, /forecast_days.*14/);
  assert.match(route, /timezone.*auto/);
  assert.match(route, /geocoding-api\.open-meteo\.com/);
  assert.match(route, /max-age=900/);
  assert.match(panel, /navigator\.geolocation/);
  assert.match(panel, /未来 14 天/);
  assert.match(panel, /输入城市/);
  assert.match(page, /<ForecastCare fertilizerDue=\{fertilizerDue\}/);
});
