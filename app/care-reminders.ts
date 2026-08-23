import { type ForecastDay, type PlantStatus, plantNeedsRecovery } from "./care-forecast.ts";

export type CareReminderType = "water" | "fertilizer" | "shade" | "rain" | "inspection";

export type CareReminder = {
  id: string;
  date: string;
  time: string;
  type: CareReminderType;
  title: string;
  body: string;
};

export function buildReminderPlan(days: ForecastDay[], context: { fertilizerDue: boolean; plantStatus?: PlantStatus | null }) {
  const reminders: CareReminder[] = [];
  let fertilizerScheduled = false;
  const needsRecovery = plantNeedsRecovery(context.plantStatus);

  for (const [index, day] of days.entries()) {
    const hot = day.maxTemp >= 33;
    const highUv = day.uvMax >= 7 || day.sunshineHours >= 8;
    const rainy = day.rainSum >= 8 || day.rainProbability >= 70;
    const veryHumid = day.humidity >= 85;
    const cold = day.minTemp <= 10;
    const freshStatus = index === 0 && context.plantStatus?.recordDate === day.date ? context.plantStatus : null;
    const freshSoil = freshStatus?.soil;

    if (freshSoil === "dry") {
      reminders.push(reminder(day.date, hot ? "07:30" : "08:00", "water", "最新摸土已干：检查后浇透", "再次确认表土下 2 厘米仍干，再沿盆边慢慢浇透。"));
    } else if ((freshSoil === "wet" || freshSoil === "moist") && !needsRecovery) {
      reminders.push(reminder(day.date, "18:30", "inspection", "复查最新盆土状态", freshSoil === "wet" ? "早些时候摸土很湿；傍晚复查，继续湿就不浇。" : "早些时候土仍微湿；傍晚复查，不要提前浇水。"));
    } else if (!rainy && !cold) {
      reminders.push(reminder(day.date, hot ? "07:30" : "08:00", "water", "摸土后再决定浇水", "检查表土下 2 厘米，干了才慢慢浇透。"));
    }

    if (rainy) reminders.push(reminder(day.date, "07:30", "rain", "挡雨并检查通风", "有花苞就移到避雨处；先摸土，湿就不浇。"));

    if (hot || highUv) {
      reminders.push(reminder(day.date, "10:45", "shade", "给茉莉遮阴", "11–15 点避开正午暴晒，保持明亮和通风。"));
    }

    if (hot && freshSoil !== "wet" && freshSoil !== "moist") {
      reminders.push(reminder(day.date, "18:30", "water", "傍晚再检查一次盆土", "天气炎热，只在土确实干、植株缺水时补水。"));
    }

    if (needsRecovery && index < 3) {
      reminders.push(reminder(day.date, "19:30", "inspection", "复查叶片与花苞状态", "对照上次巡检，检查叶背、黄叶、萎蔫和掉苞；有恶化就拍照。"));
    }

    const suitableForFertilizer = !fertilizerScheduled && context.fertilizerDue && !needsRecovery && !hot && !cold && !rainy && !veryHumid && day.maxTemp <= 31 && day.minTemp >= 15;
    if (suitableForFertilizer) {
      reminders.push(reminder(day.date, "09:00", "fertilizer", "今天适合施一次薄肥", "先让盆土微湿，再使用说明浓度的 1/2；不施浓肥。"));
      fertilizerScheduled = true;
    }
  }

  return reminders.sort((left, right) => `${left.date}T${left.time}`.localeCompare(`${right.date}T${right.time}`));
}

export function createCalendarFile(reminders: CareReminder[], timezone: string, now = new Date()) {
  const safeTimezone = /^[A-Za-z0-9_+\-/]+$/.test(timezone) ? timezone : "Asia/Shanghai";
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Xiaomo Jasmine Care//ZH-CN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:小茉日常",
    `X-WR-TIMEZONE:${safeTimezone}`,
  ];

  for (const item of reminders) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:xiaomo-${item.id.replace(/[^a-z0-9-]/gi, "-")}@xiaomo.care`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${safeTimezone}:${item.date.replaceAll("-", "")}T${item.time.replace(":", "")}00`,
      "DURATION:PT15M",
      `SUMMARY:${escapeCalendarText(item.title)}`,
      `DESCRIPTION:${escapeCalendarText(item.body)}`,
      "BEGIN:VALARM",
      "TRIGGER:PT0M",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeCalendarText(item.title)}`,
      "END:VALARM",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

function reminder(date: string, time: string, type: CareReminderType, title: string, body: string): CareReminder {
  return { id: `${date}-${time}-${type}`, date, time, type, title, body };
}

function escapeCalendarText(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll(",", "\\,").replaceAll(";", "\\;");
}
