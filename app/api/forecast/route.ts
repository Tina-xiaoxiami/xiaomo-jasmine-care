type GeocodeResult = {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
};

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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const city = url.searchParams.get("city")?.trim() ?? "";
  let latitude = Number(url.searchParams.get("lat"));
  let longitude = Number(url.searchParams.get("lon"));
  let label = "我的位置";

  try {
    if (city) {
      if (city.length < 2 || city.length > 80) return Response.json({ error: "请输入完整的城市名称" }, { status: 400 });
      const geocodeUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
      geocodeUrl.search = new URLSearchParams({ name: city, count: "1", language: "zh", format: "json" }).toString();
      const geocodeResponse = await fetch(geocodeUrl, { signal: AbortSignal.timeout(8000) });
      if (!geocodeResponse.ok) throw new Error("geocoding failed");
      const geocode = await geocodeResponse.json() as { results?: GeocodeResult[] };
      const match = geocode.results?.[0];
      if (!match) return Response.json({ error: "没有找到这个城市，请换一种写法" }, { status: 404 });
      latitude = match.latitude;
      longitude = match.longitude;
      label = [match.name, match.admin1, match.country].filter(Boolean).join(" · ");
    } else if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return Response.json({ error: "位置坐标无效" }, { status: 400 });
    }

    const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
    forecastUrl.search = new URLSearchParams({
      latitude: latitude.toFixed(4), longitude: longitude.toFixed(4), timezone: "auto", forecast_days: "14",
      current: "temperature_2m,relative_humidity_2m,is_day,weather_code,wind_speed_10m",
      hourly: "relative_humidity_2m",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,sunshine_duration,uv_index_max,sunrise,sunset",
    }).toString();
    const forecastResponse = await fetch(forecastUrl, { signal: AbortSignal.timeout(10000) });
    if (!forecastResponse.ok) throw new Error("forecast failed");
    const weather = await forecastResponse.json() as WeatherPayload;

    const humidityByDate = new Map<string, number[]>();
    weather.hourly.time.forEach((time, index) => {
      const date = time.slice(0, 10);
      const values = humidityByDate.get(date) ?? [];
      const humidity = weather.hourly.relative_humidity_2m[index];
      if (Number.isFinite(humidity)) values.push(humidity);
      humidityByDate.set(date, values);
    });

    const days = weather.daily.time.map((date, index) => {
      const humidities = humidityByDate.get(date) ?? [];
      return {
        date,
        weatherCode: weather.daily.weather_code[index],
        maxTemp: weather.daily.temperature_2m_max[index],
        minTemp: weather.daily.temperature_2m_min[index],
        rainSum: weather.daily.precipitation_sum[index],
        rainProbability: weather.daily.precipitation_probability_max[index],
        sunshineHours: Math.round((weather.daily.sunshine_duration[index] / 3600) * 10) / 10,
        uvMax: weather.daily.uv_index_max[index],
        humidity: humidities.length ? Math.round(humidities.reduce((sum, value) => sum + value, 0) / humidities.length) : 0,
        sunrise: weather.daily.sunrise[index],
        sunset: weather.daily.sunset[index],
      };
    });

    return Response.json({
      location: { label, latitude: weather.latitude, longitude: weather.longitude, timezone: weather.timezone },
      current: weather.current,
      days,
    }, { headers: { "cache-control": "private, max-age=900", "x-content-type-options": "nosniff" } });
  } catch {
    return Response.json({ error: "天气服务暂时不可用，请稍后再试" }, { status: 502 });
  }
}
