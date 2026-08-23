"use client";

import { FormEvent, useState } from "react";
import { buildCarePlan, ForecastDay, weatherLabel } from "./care-forecast";

type ForecastData = {
  location: { label: string; latitude: number; longitude: number; timezone: string };
  current: { time: string; temperature_2m: number; relative_humidity_2m: number; is_day: number; weather_code: number; wind_speed_10m: number };
  days: ForecastDay[];
};

export function ForecastCare({ fertilizerDue }: { fertilizerDue: boolean }) {
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadForecast(query: string) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/forecast?${query}`);
      const data = await response.json() as ForecastData & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "暂时无法读取天气");
      setForecast(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "暂时无法读取天气");
    } finally {
      setLoading(false);
    }
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setError("当前浏览器不支持定位，请输入城市。 ");
      return;
    }
    setLoading(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => loadForecast(new URLSearchParams({ lat: String(coords.latitude), lon: String(coords.longitude) }).toString()),
      () => { setLoading(false); setError("无法读取位置，请允许定位，或在下方输入城市。 "); },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 15 * 60 * 1000 },
    );
  }

  function searchCity(event: FormEvent) {
    event.preventDefault();
    if (city.trim().length < 2) { setError("请输入完整的城市名称。 "); return; }
    loadForecast(new URLSearchParams({ city: city.trim() }).toString());
  }

  if (!forecast) {
    return <section className="forecast-onboarding">
      <div className="forecast-onboarding-copy">
        <p className="eyebrow">LOCAL CARE</p>
        <h2>生成你所在地的两周养护计划</h2>
        <p>结合当地日期与时间、温度、湿度、降雨、日照和紫外线，安排每天何时摸土、晒太阳和施肥。</p>
      </div>
      <div className="location-actions">
        <button className="location-btn" onClick={useMyLocation} disabled={loading}><span>⌖</span>{loading ? "正在读取…" : "使用我的位置"}</button>
        <div className="or-line"><span>或</span></div>
        <form className="city-form" onSubmit={searchCity}>
          <label htmlFor="care-city">输入城市</label>
          <div><input id="care-city" value={city} onChange={(event) => setCity(event.target.value)} placeholder="例如：上海、成都、新加坡" autoComplete="address-level2" /><button type="submit" disabled={loading}>查看</button></div>
        </form>
        {error && <p className="location-error" role="alert">{error}</p>}
      </div>
    </section>;
  }

  const today = forecast.days[0];
  const localClock = forecast.current.time.slice(11, 16);
  const currentHour = Number(localClock.slice(0, 2));
  const todayPlan = buildCarePlan(today, { fertilizerDue, currentHour });

  return <section className="forecast-section">
    <div className="forecast-hero">
      <div className="forecast-now">
        <div className="forecast-location"><span>⌖</span><div><strong>{forecast.location.label}</strong><small>当地 {localClock} · {forecast.location.timezone}</small></div></div>
        <div className="current-weather"><strong>{Math.round(forecast.current.temperature_2m)}°</strong><div><span>{weatherLabel(forecast.current.weather_code)}</span><small>湿度 {forecast.current.relative_humidity_2m}% · 风速 {Math.round(forecast.current.wind_speed_10m)} km/h</small></div></div>
        <button className="change-location" onClick={() => { setForecast(null); setError(""); }}>更换位置</button>
      </div>
      <div className={`today-prescription ${todayPlan.level}`}>
        <p className="eyebrow">今天的专家安排</p>
        <h2>{todayPlan.headline}</h2>
        <ul>{todayPlan.actions.map((action) => <li key={action}>{action}</li>)}</ul>
      </div>
    </div>

    <div className="fortnight-heading"><div><p className="eyebrow">NEXT 14 DAYS</p><h2>未来 14 天</h2></div><p>天气预报越往后不确定性越高，建议每天打开一次更新。</p></div>
    <div className="forecast-days">
      {forecast.days.map((day, index) => <ForecastCard key={day.date} day={day} index={index} fertilizerDue={fertilizerDue} currentHour={index === 0 ? currentHour : undefined} />)}
    </div>
    <p className="weather-credit">天气数据由 <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> 提供。养护建议仍以当天摸土和植株实际状态为准。</p>
  </section>;
}

function ForecastCard({ day, index, fertilizerDue, currentHour }: { day: ForecastDay; index: number; fertilizerDue: boolean; currentHour?: number }) {
  const plan = buildCarePlan(day, { fertilizerDue, currentHour });
  const label = index === 0 ? "今天" : index === 1 ? "明天" : new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", weekday: "short", timeZone: "UTC" }).format(new Date(`${day.date}T12:00:00Z`));
  return <article className={`forecast-day-card ${plan.level}`}>
    <div className="forecast-day-top"><div><strong>{label}</strong><small>{weatherLabel(day.weatherCode)}</small></div><span>{Math.round(day.maxTemp)}°<small>/{Math.round(day.minTemp)}°</small></span></div>
    <div className="weather-metrics"><span>☀ {day.sunshineHours}h</span><span>雨 {day.rainProbability}%</span><span>湿 {day.humidity}%</span></div>
    <p>{plan.actions[0]}</p>
    {plan.actions[1] && <p>{plan.actions[1]}</p>}
  </article>;
}
