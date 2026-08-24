"use client";

import { useEffect, useMemo, useState } from "react";
import type { ForecastDay, PlantStatus } from "./care-forecast";
import { buildReminderPlan, CareReminder, createCalendarFile } from "./care-reminders";

const ENABLED_KEY = "xiaomo-reminders-enabled";
const NOTIFIED_KEY = "xiaomo-reminders-notified";

export function ReminderCenter({ days, timezone, fertilizerDue, currentLocalTime, plantStatus }: {
  days: ForecastDay[];
  timezone: string;
  fertilizerDue: boolean;
  currentLocalTime: string;
  plantStatus?: PlantStatus | null;
}) {
  const reminders = useMemo(() => buildReminderPlan(days, { fertilizerDue, plantStatus }), [days, fertilizerDue, plantStatus]);
  const upcoming = reminders.filter((item) => `${item.date}T${item.time}` >= currentLocalTime.slice(0, 16));
  const [enabled, setEnabled] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setEnabled(window.localStorage.getItem(ENABLED_KEY) === "true" && "Notification" in window && Notification.permission === "granted");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!enabled || !("Notification" in window) || Notification.permission !== "granted" || !("serviceWorker" in navigator)) return;

    async function notifyDueItems() {
      const clock = localClockParts(new Date(), timezone);
      const seen = readSeenReminders();
      const due = reminders.filter((item) => item.date === clock.date && minutesSince(item.time, clock.time) >= 0 && minutesSince(item.time, clock.time) <= 5 && !seen.has(item.id));
      if (!due.length) return;
      const registration = await navigator.serviceWorker.ready;
      for (const item of due) {
        const appUrl = new URL(".", window.location.href).pathname;
        const iconUrl = new URL("icon-192.png", window.location.href).pathname;
        await registration.showNotification(item.title, { body: item.body, icon: iconUrl, badge: iconUrl, tag: item.id, data: { url: appUrl } });
        seen.add(item.id);
      }
      window.localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...seen].slice(-120)));
    }

    notifyDueItems();
    const timer = window.setInterval(notifyDueItems, 30_000);
    return () => window.clearInterval(timer);
  }, [enabled, reminders, timezone]);

  async function enableNotifications() {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setNotice("这台手机暂不支持网页通知，请使用手机日历提醒。");
      return;
    }
    const permission = await Notification.requestPermission();
    const accepted = permission === "granted";
    window.localStorage.setItem(ENABLED_KEY, String(accepted));
    setEnabled(accepted);
    setNotice(accepted ? "到点通知已开启。" : "没有获得通知权限，你仍可以加入手机日历。");
  }

  function downloadCalendar() {
    const futureReminders = upcoming.length ? upcoming : reminders;
    const file = new Blob([createCalendarFile(futureReminders, timezone)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "小茉日常-14天养护提醒.ics";
    link.click();
    URL.revokeObjectURL(url);
    setNotice("日历文件已生成，请在手机上选择加入日历。");
  }

  return <section className="reminder-center" aria-labelledby="reminder-title">
    <div className="reminder-copy">
      <p className="eyebrow">CARE REMINDERS</p>
      <h2 id="reminder-title">按天气提醒，不死守固定浇水日</h2>
      <p>自动安排摸土、施肥、遮阴和避雨。浇水提醒只是提醒你先摸土，不代表必须浇。</p>
      <div className="reminder-actions">
        <button className="primary-btn" onClick={enableNotifications}>{enabled ? "✓ 到点通知已开启" : "开启到点通知"}</button>
        <button className="calendar-btn" onClick={downloadCalendar}>加入手机日历</button>
      </div>
      <small>到点通知在 App 打开或后台可运行时生效；完全关闭 App 后，手机日历提醒更可靠。</small>
      {notice && <p className="reminder-notice" role="status">{notice}</p>}
    </div>
    <div className="upcoming-reminders">
      <div className="upcoming-title"><strong>接下来</strong><span>{upcoming.length} 项</span></div>
      {(upcoming.slice(0, 4)).map((item) => <ReminderRow key={item.id} item={item} />)}
      {!upcoming.length && <p className="no-reminders">两周内暂无待办提醒。</p>}
    </div>
  </section>;
}

function ReminderRow({ item }: { item: CareReminder }) {
  const icon = item.type === "water" ? "⌁" : item.type === "fertilizer" ? "◇" : item.type === "shade" ? "☀" : item.type === "rain" ? "☂" : "✦";
  const date = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", weekday: "short", timeZone: "UTC" }).format(new Date(`${item.date}T12:00:00Z`));
  return <div className={`reminder-row ${item.type}`}><span className="reminder-icon">{icon}</span><div><strong>{item.title}</strong><small>{date} · {item.time}</small></div></div>;
}

function readSeenReminders() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(NOTIFIED_KEY) ?? "[]");
    return new Set<string>(Array.isArray(stored) ? stored.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function localClockParts(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
  return { date: `${value("year")}-${value("month")}-${value("day")}`, time: `${value("hour")}:${value("minute")}` };
}

function minutesSince(planned: string, current: string) {
  const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  return toMinutes(current) - toMinutes(planned);
}
