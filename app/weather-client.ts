import type { ForecastDay } from "./care-forecast";

type GeocodeResult = { name: string; latitude: number; longitude: number; country?: string; admin1?: string };
type WeatherPayload = {
  latitude: number;
  longitude: number;
  timezone: string;
  current: { time: string; temperature_2m: number; relative_humidity_2m: number; is_day: number; weather_code: number; wind_speed_10m: number };
  hourly: { time: string[]; relative_humidity_2m: number[] };
  daily: {
    time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[];
    precipitation_sum: number[]; precipitation_probability_max: number[]; sunshine_duration: number[];
    uv_index_max: number[]; sunrise: string[]; sunset: string[];
  };
};

export type ForecastData = {
  location: { label: string; latitude: number; longitude: number; timezone: string };
  current: WeatherPayload["current"];
  days: ForecastDay[];
};

export async function fetchWeatherForecast(query: string, request = fetch): Promise<ForecastData> {
  const parameters = new URLSearchParams(query);
  const city = parameters.get("city")?.trim() ?? "";
  let latitude = Number(parameters.get("lat"));
  let longitude = Number(parameters.get("lon"));
  let label = "我的位置";

  if (city) {
    if (city.length < 2 || city.length > 80) throw new Error("请输入完整的城市名称。 ");
    const geocodeUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
    geocodeUrl.search = new URLSearchParams({ name: city, count: "1", language: "zh", format: "json" }).toString();
    const geocodeResponse = await request(geocodeUrl);
    if (!geocodeResponse.ok) throw new Error("城市服务暂时不可用，请稍后再试。 ");
    const geocode = await geocodeResponse.json() as { results?: GeocodeResult[] };
    const match = geocode.results?.[0];
    if (!match) throw new Error("没有找到这个城市，请换一种写法。 ");
    latitude = match.latitude;
    longitude = match.longitude;
    label = [match.name, match.admin1, match.country].filter(Boolean).join(" · ");
  } else if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error("位置坐标无效。 ");
  }

  const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
  forecastUrl.search = new URLSearchParams({
    latitude: latitude.toFixed(4), longitude: longitude.toFixed(4), timezone: "auto", forecast_days: "14",
    current: "temperature_2m,relative_humidity_2m,is_day,weather_code,wind_speed_10m",
    hourly: "relative_humidity_2m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,sunshine_duration,uv_index_max,sunrise,sunset",
  }).toString();
  const forecastResponse = await request(forecastUrl);
  if (!forecastResponse.ok) throw new Error("天气服务暂时不可用，请稍后再试。 ");
  return toForecastData(await forecastResponse.json() as WeatherPayload, label);
}

export function toForecastData(weather: WeatherPayload, label: string): ForecastData {
  const humidityByDate = new Map<string, number[]>();
  weather.hourly.time.forEach((time, index) => {
    const humidity = weather.hourly.relative_humidity_2m[index];
    if (!Number.isFinite(humidity)) return;
    const values = humidityByDate.get(time.slice(0, 10)) ?? [];
    values.push(humidity);
    humidityByDate.set(time.slice(0, 10), values);
  });

  const days = weather.daily.time.map((date, index) => {
    const humidities = humidityByDate.get(date) ?? [];
    return {
      date, weatherCode: weather.daily.weather_code[index], maxTemp: weather.daily.temperature_2m_max[index], minTemp: weather.daily.temperature_2m_min[index],
      rainSum: weather.daily.precipitation_sum[index], rainProbability: weather.daily.precipitation_probability_max[index],
      sunshineHours: Math.round((weather.daily.sunshine_duration[index] / 3600) * 10) / 10, uvMax: weather.daily.uv_index_max[index],
      humidity: humidities.length ? Math.round(humidities.reduce((sum, value) => sum + value, 0) / humidities.length) : 0,
      sunrise: weather.daily.sunrise[index], sunset: weather.daily.sunset[index],
    };
  });
  return { location: { label, latitude: weather.latitude, longitude: weather.longitude, timezone: weather.timezone }, current: weather.current, days };
}
