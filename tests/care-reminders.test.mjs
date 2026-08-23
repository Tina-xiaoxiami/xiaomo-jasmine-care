import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildReminderPlan, createCalendarFile } from "../app/care-reminders.ts";

const day = (date, overrides = {}) => ({
  date, weatherCode: 1, maxTemp: 27, minTemp: 20,
  rainSum: 0, rainProbability: 10, sunshineHours: 6, uvMax: 5,
  humidity: 60, sunrise: `${date}T05:30`, sunset: `${date}T18:30`,
  ...overrides,
});

test("hot high-UV days schedule an early soil check, shade, and evening recheck", () => {
  const reminders = buildReminderPlan([
    day("2026-08-23", { maxTemp: 35, uvMax: 9 }),
  ], { fertilizerDue: false });
  assert.deepEqual(reminders.map(({ type, time }) => [type, time]), [
    ["water", "07:30"], ["shade", "10:45"], ["water", "18:30"],
  ]);
});

test("rainy days schedule protection instead of automatic watering", () => {
  const reminders = buildReminderPlan([
    day("2026-08-23", { rainSum: 18, rainProbability: 90 }),
  ], { fertilizerDue: false });
  assert.equal(reminders[0].type, "rain");
  assert.equal(reminders[0].time, "07:30");
  assert.match(reminders[0].body, /避雨|挡雨/);
  assert.doesNotMatch(reminders.map((item) => item.title).join(" "), /直接浇水/);
});

test("fertilizer is reminded once on the first stable suitable day", () => {
  const reminders = buildReminderPlan([
    day("2026-08-23", { rainProbability: 90 }),
    day("2026-08-24"),
    day("2026-08-25"),
  ], { fertilizerDue: true });
  const fertilizer = reminders.filter((item) => item.type === "fertilizer");
  assert.equal(fertilizer.length, 1);
  assert.equal(fertilizer[0].date, "2026-08-24");
  assert.equal(fertilizer[0].time, "09:00");
});

test("fresh wet soil replaces watering with a recheck reminder", () => {
  const reminders = buildReminderPlan([day("2026-08-23")], {
    fertilizerDue: false,
    plantStatus: { recordDate: "2026-08-23", soil: "wet", leaves: "healthy", bloom: "buds", note: "" },
  });
  assert.equal(reminders.some((item) => item.type === "water"), false);
  assert.equal(reminders.some((item) => item.type === "inspection"), true);
  assert.match(reminders.map((item) => item.body).join(" "), /继续湿就不浇|不要浇/);
});

test("plant abnormalities pause fertilizer and schedule follow-up inspections", () => {
  const reminders = buildReminderPlan([
    day("2026-08-23"), day("2026-08-24"), day("2026-08-25"), day("2026-08-26"),
  ], {
    fertilizerDue: true,
    plantStatus: { recordDate: "2026-08-23", soil: "moist", leaves: "yellow", bloom: "drop", note: "" },
  });
  assert.equal(reminders.some((item) => item.type === "fertilizer"), false);
  assert.equal(reminders.filter((item) => item.type === "inspection").length, 3);
});

test("calendar export carries the forecast timezone and phone alarms", () => {
  const reminders = buildReminderPlan([day("2026-08-23")], { fertilizerDue: false });
  const calendar = createCalendarFile(reminders, "Asia/Shanghai", new Date("2026-08-23T00:00:00Z"));
  assert.match(calendar, /X-WR-TIMEZONE:Asia\/Shanghai/);
  assert.match(calendar, /DTSTART;TZID=Asia\/Shanghai:20260823T080000/);
  assert.match(calendar, /BEGIN:VALARM[\s\S]*TRIGGER:PT0M[\s\S]*END:VALARM/);
  assert.match(calendar, /UID:xiaomo-/);
});

test("reminder center is transparent about notification limits and offers calendar export", async () => {
  const panel = await readFile(new URL("../app/reminder-center.tsx", import.meta.url), "utf8");
  assert.match(panel, /Notification\.requestPermission/);
  assert.match(panel, /serviceWorker\.ready/);
  assert.match(panel, /localStorage/);
  assert.match(panel, /\.ics/);
  assert.match(panel, /关闭.*App|没有打开/);
});
