"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { PwaInstall } from "./pwa-install";
import { ForecastCare } from "./forecast-care";
import { type PlantStatus, plantNeedsRecovery } from "./care-forecast";
import { ApiSettings } from "./api-settings";
import { type LocalCareRecord, readLocalCareRecords, readLocalPhoto, saveLocalPhoto, upsertLocalCareRecord } from "./local-care";

export const dynamic = "force-static";

type Tab = "today" | "records" | "guide" | "settings";
type CareRecord = LocalCareRecord;
type Draft = { completed: string[]; soil: string; leaves: string; bloom: string; note: string; photoKey: string | null; fertilized: boolean };

const todayKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const today = todayKey();

const baseTasks = [
  { id: "sun", time: "08:00", title: "晒早阳", note: "放到东向或南向明亮窗边，先晒 2–4 小时", icon: "☀" },
  { id: "soil", time: "08:30", title: "摸土，再决定浇水", note: "手指探入 2 厘米；干了才浇透，湿就不浇", icon: "◒" },
  { id: "check", time: "19:30", title: "晚间状态巡检", note: "看叶色、花苞、虫害和盆底积水", icon: "✦" },
  { id: "photo", time: "20:00", title: "拍一张成长照", note: "尽量保持同角度、同距离，变化更好比较", icon: "◎" },
];

const guides = [
  { icon: "◒", title: "浇水", tag: "见干见湿", text: "表土下约 2 厘米干燥再浇。每次慢慢浇到盆底出水，10 分钟后倒掉托盘积水。不要每天固定浇，也不要只浇一小口。" },
  { icon: "☀", title: "日照", tag: "4–6 小时", text: "茉莉喜光。春秋可逐步增加直射光；夏季新买回或一直室内养的植株，先避开 11–15 点烈日，防止突然晒伤。" },
  { icon: "◇", title: "施肥", tag: "薄肥勤施", text: "生长和花期约 10–14 天一次，用通用水溶肥或偏磷钾肥，按说明浓度的 1/2 使用。先浇湿土再施，病弱、缺水、刚换盆时暂停。" },
  { icon: "⌁", title: "修剪", tag: "花后轻剪", text: "残花连同花下 1–2 对叶剪掉，促发新枝。黄叶随时清理；一次不要剪掉超过总叶量的 1/3。" },
  { icon: "✣", title: "虫害", tag: "每周看叶背", text: "重点看红蜘蛛、介壳虫和白粉虱。先隔离植株，用清水冲洗叶背；持续或严重时，再按标签使用对应药剂。" },
  { icon: "▱", title: "换盆", tag: "春季优先", text: "根系绕满盆或浇水很快流走时再换。新盆只大一号，使用疏松排水基质；换盆后缓苗 7–10 天，暂停施肥。" },
];

function dateText(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", weekday: "short", timeZone: "Asia/Shanghai" }).format(new Date(`${value}T12:00:00+08:00`));
}

function daysBetween(from: string, to = today) {
  return Math.floor((new Date(`${to}T12:00:00+08:00`).getTime() - new Date(`${from}T12:00:00+08:00`).getTime()) / 86400000);
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("today");
  const [records, setRecords] = useState<CareRecord[]>([]);
  const [done, setDone] = useState<string[]>([]);
  const [soil, setSoil] = useState("unknown");
  const [leaves, setLeaves] = useState("healthy");
  const [bloom, setBloom] = useState("unknown");
  const [note, setNote] = useState("");
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [storedPhotoUrl, setStoredPhotoUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);
  const [greeting, setGreeting] = useState("你好");
  const fileRef = useRef<HTMLInputElement>(null);

  const dateLabel = useMemo(() => dateText(today), []);
  const completedTaskCount = baseTasks.filter((task) => done.includes(task.id)).length;
  const progress = Math.round((completedTaskCount / baseTasks.length) * 100);
  const latestFertilized = records.find((record) => record.fertilized)?.recordDate;
  const daysSinceFertilized = latestFertilized ? daysBetween(latestFertilized) : null;
  const fertilizerDue = daysSinceFertilized === null || daysSinceFertilized >= 12;
  const latestInspection = useMemo(() => records.find((record) => record.completed.includes("inspection")) ?? null, [records]);
  const plantStatus = useMemo<PlantStatus | null>(() => latestInspection ? ({ recordDate: latestInspection.recordDate, soil: latestInspection.soil, leaves: latestInspection.leaves, bloom: latestInspection.bloom, note: latestInspection.note }) : null, [latestInspection]);
  const freshSoilBlocksFertilizer = plantStatus?.recordDate === today && !["unknown", "moist"].includes(plantStatus.soil);
  const fertilizerPausedByStatus = plantNeedsRecovery(plantStatus) || freshSoilBlocksFertilizer;
  const fertilizerReady = fertilizerDue && !fertilizerPausedByStatus;

  const expert = useMemo(() => {
    const advice: string[] = [];
    let level: "good" | "watch" | "alert" = "good";
    if (soil === "dry") advice.push("土已干：现在沿盆边慢慢浇透，倒掉托盘积水。 ");
    if (soil === "wet") { advice.push("土偏湿：今天不要浇水，增强通风并检查排水孔。 "); level = "watch"; }
    if (leaves === "yellow") { advice.push("出现黄叶：先排查长期湿土与光照不足，暂缓施肥。 "); level = "watch"; }
    if (leaves === "spotted") { advice.push("叶片有斑：隔离观察，检查叶背虫害，浇水不要淋叶。 "); level = "alert"; }
    if (leaves === "droop") { advice.push("叶片萎蔫：先摸土再处理；干则浇透，湿则避免继续浇水。 "); level = "watch"; }
    if (bloom === "drop") { advice.push("正在掉苞：保持位置、温度与水分稳定，暂停浓肥。 "); level = "alert"; }
    if (!advice.length) advice.push("目前没有明显异常。保持充足光照，继续按“摸土再浇”的节奏。 ");
    return { level, title: level === "good" ? "状态稳定" : level === "watch" ? "需要留意" : "建议尽快处理", advice };
  }, [soil, leaves, bloom]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const hour = new Date().getHours();
      setGreeting(hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const nextRecords = readLocalCareRecords(window.localStorage);
      setRecords(nextRecords);
      const current = nextRecords.find((record) => record.recordDate === today);
      if (current) {
        setDone(current.completed); setSoil(current.soil); setLeaves(current.leaves); setBloom(current.bloom);
        setNote(current.note); setPhotoKey(current.photoKey);
      }
      setLoading(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    let active = true;
    let url = "";
    if (!photoKey) return;
    readLocalPhoto(photoKey)
      .then((photo) => {
        if (!active || !photo) return;
        url = URL.createObjectURL(photo);
        setStoredPhotoUrl(url);
      })
      .catch(() => active && setStoredPhotoUrl(""));
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [photoKey]);

  async function saveRecord(overrides: Partial<Draft> = {}) {
    const payload: Draft = { completed: done, soil, leaves, bloom, note, photoKey, fertilized: false, ...overrides };
    const existing = records.find((record) => record.recordDate === today);
    const record: CareRecord = { id: existing?.id ?? crypto.randomUUID(), recordDate: today, ...payload, updatedAt: new Date().toISOString() };
    const next = upsertLocalCareRecord(window.localStorage, record);
    setRecords(next);
    setSaved(true); window.setTimeout(() => setSaved(false), 1800);
    return record;
  }

  async function toggleTask(id: string) {
    const next = done.includes(id) ? done.filter((item) => item !== id) : [...done, id];
    setDone(next);
    try { await saveRecord({ completed: next }); } catch { setMessage("这次勾选没能保存，请稍后再试。 "); }
  }

  async function submitInspection() {
    const nextDone = done.includes("inspection") ? done : [...done, "inspection"];
    setDone(nextDone);
    try { await saveRecord({ completed: nextDone }); setMessage(`巡检已联动天气计划与提醒。${expert.advice.join("")}`); } catch { setMessage("巡检结果暂时没有保存，请稍后再试。 "); }
  }

  async function markFertilized() {
    try { await saveRecord({ fertilized: true }); setMessage("已记录今天施肥。接下来 10–14 天先不重复施肥。 "); } catch { setMessage("施肥记录暂时没有保存成功。 "); }
  }

  async function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) { setMessage("照片超过 12MB，请选择小一点的图片。 "); return; }
    setUploading(true);
    try {
      const uploadFile = await compressPhoto(file);
      const key = `${today}-${crypto.randomUUID()}`;
      await saveLocalPhoto(key, uploadFile);
      setPhotoPreview(URL.createObjectURL(uploadFile));
      setPhotoKey(key);
      const nextDone = done.includes("photo") ? done : [...done, "photo"];
      setDone(nextDone); await saveRecord({ photoKey: key, completed: nextDone });
      setMessage("照片已保存在这台手机。保持同角度拍摄，更容易看出变化。 ");
    } catch { setMessage("照片暂时没有保存成功，请检查手机存储空间后再试。 "); }
    finally { setUploading(false); }
  }

  async function copySummary() {
    const summary = `茉莉巡检 ${today}\n土壤：${soil}\n叶片：${leaves}\n花苞：${bloom}\n专家提示：${expert.advice.join("")}\n备注：${note || "无"}`;
    try { await navigator.clipboard.writeText(summary); setMessage("巡检摘要已复制，可以直接发给我继续判断。 "); } catch { setMessage(summary); }
  }

  const currentPhotoUrl = photoPreview || storedPhotoUrl;

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setTab("today")} aria-label="回到今天"><span>茉</span><div><strong>小茉日常</strong><small>JASMINE CARE</small></div></button>
        <div className="top-actions"><PwaInstall /><div className="top-status"><span className={`status-dot ${expert.level}`} />专家监督中</div></div>
      </header>

      {tab === "today" && <>
        <section className="welcome">
          <div><p className="eyebrow">{dateLabel} · 室内茉莉</p><h1>{greeting}，<br />今天也照顾好它。</h1></div>
          <button className="save-pill" onClick={() => saveRecord().catch(() => setMessage("暂时没有保存成功。 "))}>{saved ? "✓ 已保存" : loading ? "正在同步" : "保存今日记录"}</button>
        </section>

        <section className="hero-grid">
          <article className="today-card">
            <div className="progress-ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}><div><strong>{completedTaskCount}/{baseTasks.length}</strong><span>今日完成</span></div></div>
            <div className="hero-copy"><p className="eyebrow">今日节奏</p><h2>{progress === 100 ? "今天的照顾完成啦" : "规律，比热情更重要"}</h2><p>浇水看土，不看日历；施肥看状态，不求频繁。慢慢观察，它会告诉你需要什么。</p></div>
            <span className="leaf-shape leaf-one" /><span className="leaf-shape leaf-two" />
          </article>
          <aside className="expert-card"><div className="expert-head"><span className={`pulse ${expert.level}`} /><p>专家判断</p></div><h3>{expert.title}</h3><p>{expert.advice[0]}</p><button onClick={() => document.getElementById("inspection")?.scrollIntoView({ behavior: "smooth" })}>开始巡检 <span>→</span></button></aside>
        </section>

        <section className="section-block">
          <div className="section-title"><div><p className="eyebrow">TODAY</p><h2>今天要做的事</h2></div><span>{progress}%</span></div>
          <div className="task-list">{baseTasks.map((task) => {
            const isDone = done.includes(task.id);
            return <button key={task.id} className={`task-row ${isDone ? "is-done" : ""}`} onClick={() => toggleTask(task.id)} aria-pressed={isDone}><span className="task-time">{task.time}</span><span className="task-icon">{task.icon}</span><span className="task-copy"><strong>{task.title}</strong><small>{task.note}</small></span><span className="checkmark">{isDone ? "✓" : ""}</span></button>;
          })}</div>
        </section>

        <section className="rhythm-grid">
          <article className="fertilizer-card"><div className="card-kicker"><span>◇</span><p>施肥节奏</p></div><h2>{fertilizerPausedByStatus ? "最新巡检建议暂停施肥" : fertilizerDue ? "可以准备下一次薄肥" : `再等 ${Math.max(0, 12 - (daysSinceFertilized ?? 0))} 天`}</h2><p>{latestFertilized ? `上次记录：${dateText(latestFertilized)}。` : "目前还没有施肥记录。"} {fertilizerPausedByStatus ? "先处理土壤或植株异常，恢复稳定后再重新安排。" : "生长花期每 10–14 天一次，必须先让土壤湿润。"}</p><div className="action-row"><button className="primary-btn" onClick={markFertilized} disabled={!fertilizerReady}>今天已施薄肥</button><button className="text-btn" onClick={() => setTab("guide")}>查看方法</button></div></article>
          <article className="light-card"><div className="sun-disc">☼</div><div><p className="eyebrow">今日光照</p><h2>先从早阳 2–4 小时开始</h2><p>新买回家的茉莉先适应一周，再逐步增加到每天 4–6 小时光照。</p></div></article>
        </section>

        <section className="inspection" id="inspection">
          <div className="inspection-intro"><p className="eyebrow">EXPERT CHECK</p><h2>一分钟健康巡检</h2><p>按你现在看到的情况选择，我会立刻调整建议。异常判断依赖你的观察，不会把固定提醒当作诊断。</p><div className={`verdict ${expert.level}`}><span className="status-dot" /><div><strong>{expert.title}</strong>{expert.advice.map((item) => <p key={item}>{item}</p>)}</div></div></div>
          <div className="inspection-form">
            <Choice label="土壤手感" value={soil} onChange={setSoil} options={[['unknown','还没摸'],['dry','干了'],['moist','微湿'],['wet','很湿']]} />
            <Choice label="叶片状态" value={leaves} onChange={setLeaves} options={[['healthy','绿而挺'],['yellow','发黄'],['spotted','有斑/虫'],['droop','萎蔫']]} />
            <Choice label="花苞状态" value={bloom} onChange={setBloom} options={[['unknown','没观察'],['buds','有花苞'],['blooming','开花中'],['drop','掉苞'],['none','暂无']]} />
            <label className="note-field"><span>补充观察</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：两片底部叶子变黄，昨天刚浇过水……" rows={3} /></label>
            <div className="form-actions"><button className="primary-btn" onClick={submitInspection}>保存并给出建议</button><button className="text-btn" onClick={copySummary}>复制给专家</button></div>
          </div>
        </section>

        <section className="photo-section">
          <div className={`photo-frame ${currentPhotoUrl ? "has-photo" : ""}`} onClick={() => fileRef.current?.click()} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") fileRef.current?.click(); }}>
            {currentPhotoUrl ? <img src={currentPhotoUrl} alt="今天的茉莉记录" /> : <><span className="camera-mark">◎</span><strong>添加今天的照片</strong><small>建议拍全株和一张叶片近照</small></>}
          </div>
          <div className="photo-copy"><p className="eyebrow">DAILY PHOTO</p><h2>用照片看见变化</h2><p>尽量每天在相同位置、相同光线下拍摄。照片会保存在你的成长记录中；如果需要更细的判断，把照片和复制的巡检摘要发到这个对话。</p><button className="primary-btn" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? "正在保存…" : currentPhotoUrl ? "更换今天的照片" : "拍照或选择照片"}</button><input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} hidden /></div>
        </section>
      </>}

      {tab === "records" && <section className="records-page"><div className="page-heading"><p className="eyebrow">GROWTH LOG</p><h1>成长记录</h1><p>把变化连起来看，比单独一天更可靠。</p></div>{records.length === 0 ? <div className="empty-state"><span>⌁</span><h2>还没有记录</h2><p>从今天完成一次巡检或拍照，第一条成长记录就会出现在这里。</p><button className="primary-btn" onClick={() => setTab("today")}>开始今天的照顾</button></div> : <div className="record-grid">{records.map((record) => <article className="record-card" key={record.id}>{record.photoKey ? <StoredPhoto photoKey={record.photoKey} alt={`${dateText(record.recordDate)}的茉莉`} /> : <div className="record-placeholder">茉</div>}<div className="record-body"><div><p className="eyebrow">{dateText(record.recordDate)}</p><span className={record.leaves === "healthy" && record.bloom !== "drop" ? "mini-good" : "mini-watch"}>{record.leaves === "healthy" && record.bloom !== "drop" ? "状态稳定" : "需要留意"}</span></div><h3>{record.completed.filter((item) => baseTasks.some((task) => task.id === item)).length} 项养护已完成</h3><p>{record.note || (record.fertilized ? "今天记录了施肥。" : "没有补充备注。")}</p><div className="record-tags"><span>土：{labelOf(record.soil)}</span><span>叶：{labelOf(record.leaves)}</span>{record.completed.includes("inspection") && <span>已联动计划</span>}{record.fertilized && <span>已施肥</span>}</div></div></article>)}</div>}</section>}

      {tab === "guide" && <section className="guide-page"><div className="page-heading"><p className="eyebrow">CARE MANUAL</p><h1>茉莉养护手册</h1><p>把原则记住，环境变化时就不会被固定日程困住。</p></div><ForecastCare fertilizerDue={fertilizerDue} plantStatus={plantStatus} /><div className="guide-note"><strong>专家底线</strong><p>缺水和积水都会让叶片萎蔫，所以看到萎蔫不能直接浇水——先摸土。刚买回、刚换盆、生病或缺水时，不施肥。</p></div><div className="guide-grid">{guides.map((guide, index) => <article className="guide-card" key={guide.title}><span className="guide-number">0{index + 1}</span><div className="guide-icon">{guide.icon}</div><div><p className="eyebrow">{guide.tag}</p><h2>{guide.title}</h2><p>{guide.text}</p></div></article>)}</div><section className="warning-box"><p className="eyebrow">WHEN TO ASK</p><h2>这些情况，建议马上拍照问我</h2><ul><li>两三天内大量黄叶或落叶</li><li>花苞连续脱落，叶片同时萎蔫</li><li>叶背出现细网、白色飞虫或褐色硬壳</li><li>盆土长期有异味、长霉或浇水后几天仍很湿</li></ul></section></section>}

      {tab === "settings" && <ApiSettings />}

      {message && <div className="toast" role="status"><span>{message}</span><button onClick={() => setMessage("")} aria-label="关闭提示">×</button></div>}
      <nav className="bottom-nav" aria-label="主导航"><button className={tab === "today" ? "active" : ""} onClick={() => setTab("today")}><span>⌂</span>今天</button><button className={tab === "records" ? "active" : ""} onClick={() => setTab("records")}><span>▦</span>记录</button><button className={tab === "guide" ? "active" : ""} onClick={() => setTab("guide")}><span>⌁</span>养护手册</button><button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}><span>⚙</span>API 设置</button></nav>
    </main>
  );
}

function Choice({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  return <fieldset className="choice-group"><legend>{label}</legend><div>{options.map(([id, text]) => <button type="button" key={id} className={value === id ? "selected" : ""} onClick={() => onChange(id)}>{text}</button>)}</div></fieldset>;
}

function labelOf(value: string) {
  const labels: Record<string, string> = { unknown: "未查", dry: "干", moist: "微湿", wet: "湿", healthy: "健康", yellow: "黄叶", spotted: "有斑", droop: "萎蔫", buds: "有花苞", blooming: "开花", drop: "掉苞", none: "暂无" };
  return labels[value] ?? value;
}

function StoredPhoto({ photoKey, alt }: { photoKey: string; alt: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    readLocalPhoto(photoKey).then((photo) => {
      if (!active || !photo) return;
      objectUrl = URL.createObjectURL(photo);
      setUrl(objectUrl);
    }).catch(() => active && setUrl(""));
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [photoKey]);
  return url ? <img src={url} alt={alt} /> : <div className="record-placeholder">茉</div>;
}

async function compressPhoto(file: File) {
  if (!file.type.startsWith("image/") || file.size < 700_000) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const quality = file.size > 4_000_000 ? .62 : .76;
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("compress failed")), "image/jpeg", quality));
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "jasmine"}.jpg`, { type: "image/jpeg" });
}
