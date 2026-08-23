export type ForecastDay = {
  date: string;
  weatherCode: number;
  maxTemp: number;
  minTemp: number;
  rainSum: number;
  rainProbability: number;
  sunshineHours: number;
  uvMax: number;
  humidity: number;
  sunrise: string;
  sunset: string;
};

export type CarePlan = {
  level: "good" | "watch" | "alert";
  headline: string;
  actions: string[];
};

export function buildCarePlan(day: ForecastDay, context: { fertilizerDue: boolean; currentHour?: number }): CarePlan {
  const actions: string[] = [];
  let level: CarePlan["level"] = "good";
  const isHot = day.maxTemp >= 33;
  const isCold = day.minTemp <= 10;
  const isRainy = day.rainSum >= 8 || day.rainProbability >= 70;
  const isVeryHumid = day.humidity >= 85;

  if (isHot) {
    level = "alert";
    actions.push("早上 8 点前摸土，干到 2 厘米再一次浇透；傍晚复查，不要中午浇。 ");
    actions.push("11–15 点避开正午暴晒，保持明亮和通风，暂停施肥。 ");
  } else if (isCold) {
    level = "alert";
    actions.push("夜间移到室内明亮处保温，远离冷风，尽量保持 12°C 以上。 ");
    actions.push("低温时盆土干得慢，延后浇水并暂停施肥。 ");
  } else if (isRainy) {
    level = "watch";
    actions.push("有花苞或正在开花时移到避雨处或挡雨，避免雨打落花。 ");
    actions.push("雨天蒸发慢，先摸土；湿就不浇，不要因为日程固定浇水。 ");
  } else {
    actions.push("早上 8–9 点摸土，表土下 2 厘米干了再慢慢浇透。 ");
  }

  if (isVeryHumid) {
    if (level === "good") level = "watch";
    actions.push("湿度偏高，拉开植株间距并加强通风，避免叶片和花朵长时间带水。 ");
  } else if (day.humidity > 0 && day.humidity < 40) {
    if (level === "good") level = "watch";
    actions.push("空气偏干，可在周围增湿；不要直接向花朵频繁喷水。 ");
  }

  if (!isHot && !isCold) {
    if (day.sunshineHours < 2) {
      actions.push("日照不足，把花放到最亮的窗边，必要时补光 4–6 小时。 ");
    } else if (day.uvMax >= 7 || day.sunshineHours >= 8) {
      actions.push("上午安排 3–4 小时光照，正午观察叶温，突然转晒时要逐步适应。 ");
    } else {
      actions.push("上午安排 4–6 小时明亮光照，每两天转盆约四分之一圈。 ");
    }
  }

  const canFertilize = context.fertilizerDue && !isHot && !isCold && !isRainy && !isVeryHumid && day.maxTemp <= 31 && day.minTemp >= 15;
  if (canFertilize) {
    actions.push("天气平稳且施肥周期已到，适合施薄肥：先让土微湿，再用说明浓度的 1/2。 ");
  } else if (context.fertilizerDue && !actions.some((action) => action.includes("暂停施肥"))) {
    actions.push("施肥周期虽已到，但天气不稳，今天暂停施肥，等温度和湿度平稳再进行。 ");
  }

  return {
    level,
    headline: level === "alert" ? "天气压力较大，优先保护" : level === "watch" ? "今天需要多观察一次" : "天气平稳，按节奏养护",
    actions: adaptToLocalTime(actions, context.currentHour),
  };
}

function adaptToLocalTime(actions: string[], currentHour?: number) {
  if (!Number.isInteger(currentHour) || currentHour === undefined || currentHour < 0 || currentHour > 23) return actions;
  const beforeMorning = currentHour < 6;
  const afterMorning = currentHour >= 10;
  if (!beforeMorning && !afterMorning) return actions;

  return actions.map((action) => {
    if (beforeMorning && action.startsWith("早上")) {
      return "现在先观察叶片和盆土表面，不建议深夜浇水；天亮后按计划摸土，需要时再浇透。 ";
    }
    if (afterMorning && action.startsWith("早上 8 点前")) {
      return currentHour >= 18
        ? "今晚先摸土并记录；除非植株明显缺水萎蔫，否则安排明早 8 点前再判断是否浇透。 "
        : "早晨检查时段已过，现在先摸土；明显干到 2 厘米再浇透，傍晚复查，避免正午浇水。 ";
    }
    if (afterMorning && action.startsWith("早上 8–9 点")) {
      return currentHour >= 18
        ? "今晚先摸土并记录；表土下 2 厘米已干，就安排明早 8–9 点慢慢浇透。 "
        : "早晨检查时段已过，现在先摸土；表土下 2 厘米干了再慢慢浇透。 ";
    }
    if (afterMorning && action.startsWith("上午安排")) {
      return currentHour >= 18
        ? `今天的日照时段已过，今晚保持通风；明天${action}`
        : `上午光照时段已过，今天先保持明亮散射光；明天${action}`;
    }
    if (currentHour >= 18 && action.startsWith("天气平稳且施肥周期已到")) {
      return "施肥周期已到，今晚先不施；若明早天气和植株状态仍稳定，再先润土并使用说明浓度的 1/2。 ";
    }
    return action;
  });
}

export function weatherLabel(code: number) {
  if (code === 0) return "晴";
  if ([1, 2].includes(code)) return "晴间多云";
  if (code === 3) return "阴";
  if ([45, 48].includes(code)) return "雾";
  if ([51, 53, 55, 56, 57].includes(code)) return "毛毛雨";
  if ([61, 66, 80].includes(code)) return "小雨";
  if ([63, 81].includes(code)) return "中雨";
  if ([65, 67, 82].includes(code)) return "大雨";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "雪";
  if ([95, 96, 99].includes(code)) return "雷雨";
  return "天气变化";
}
