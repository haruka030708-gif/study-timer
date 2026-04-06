import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  BarChart,
  Bar,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type StudyLog = {
  id: string;
  subject: string;
  startAt: string;
  endAt: string;
  durationMs: number;
  memo: string;
  dateKey: string;
};

type RunningSession = {
  subject: string;
  startAt: string;
} | null;

type CalendarCell = {
  date: Date;
  dateKey: string;
  inCurrentMonth: boolean;
};

const SUBJECTS_DEFAULT = ["英語", "数学", "化学", "生物", "情報", "国語", "社会", "その他"];
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

const pad = (n: number) => String(n).padStart(2, "0");

const formatClock = (date: Date) =>
  `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

const formatDateKey = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const formatDuration = (ms: number) => {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

const formatMinutes = (ms: number) => `${Math.round(ms / 60000)}分`;

const formatDateLabel = (dateKey: string) => {
  const [y, m, d] = dateKey.split("-");
  return `${y}年${Number(m)}月${Number(d)}日`;
};

const getMonthLabel = (date: Date) => `${date.getFullYear()}年${date.getMonth() + 1}月`;

function useLocalStorage<T>(key: string, init: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : init;
    } catch {
      return init;
    }
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
}

function createCalendarCells(baseDate: Date): CalendarCell[] {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();

  const firstDay = new Date(year, month, 1);
  const firstWeekday = firstDay.getDay();
  const startDate = new Date(year, month, 1 - firstWeekday);

  const cells: CalendarCell[] = [];

  for (let i = 0; i < 42; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);

    cells.push({
      date: d,
      dateKey: formatDateKey(d),
      inCurrentMonth: d.getMonth() === month,
    });
  }

  return cells;
}

export default function App() {
  const [now, setNow] = useState(new Date());
  const [subjects] = useLocalStorage("subjects", SUBJECTS_DEFAULT);
  const [selectedSubject, setSelectedSubject] = useLocalStorage("selectedSubject", SUBJECTS_DEFAULT[0]);
  const [logs, setLogs] = useLocalStorage<StudyLog[]>("logs", []);
  const [running, setRunning] = useLocalStorage<RunningSession>("running", null);
  const [memo, setMemo] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedDateKey, setSelectedDateKey] = useState(formatDateKey(new Date()));
  const [dailyGoalMinutes, setDailyGoalMinutes] = useLocalStorage("dailyGoalMinutes", 120);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const elapsed = useMemo(() => {
    if (!running) return 0;
    return now.getTime() - new Date(running.startAt).getTime();
  }, [running, now]);

  const todayKey = formatDateKey(now);

  const todayLogs = useMemo(() => logs.filter((log) => log.dateKey === todayKey), [logs, todayKey]);

  const todayTotalMs = useMemo(() => todayLogs.reduce((sum, log) => sum + log.durationMs, 0), [todayLogs]);

  const totalsByDate = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const log of logs) {
      totals[log.dateKey] = (totals[log.dateKey] || 0) + log.durationMs;
    }
    return totals;
  }, [logs]);

  const selectedDateLogs = useMemo(
    () =>
      logs
        .filter((log) => log.dateKey === selectedDateKey)
        .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()),
    [logs, selectedDateKey]
  );

  const selectedDateTotalMs = useMemo(
    () => selectedDateLogs.reduce((sum, log) => sum + log.durationMs, 0),
    [selectedDateLogs]
  );

  const calendarCells = useMemo(() => createCalendarCells(calendarMonth), [calendarMonth]);

  const achievedDates = useMemo(() => {
    const result: Record<string, boolean> = {};
    const goalMs = dailyGoalMinutes * 60 * 1000;

    for (const [dateKey, totalMs] of Object.entries(totalsByDate)) {
      result[dateKey] = totalMs >= goalMs;
    }

    return result;
  }, [totalsByDate, dailyGoalMinutes]);

  const weeklyChartData = useMemo(() => {
    const result: Array<{ label: string; minutes: number }> = [];

    for (let i = 6; i >= 0; i -= 1) {
      const date = new Date(now);
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - i);

      const dateKey = formatDateKey(date);

      result.push({
        label: `${date.getMonth() + 1}/${date.getDate()}`,
        minutes: Math.round((totalsByDate[dateKey] || 0) / 60000),
      });
    }

    return result;
  }, [now, totalsByDate]);

  const subjectChartData = useMemo(() => {
    const totals: Record<string, number> = {};
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 6);

    logs.forEach((log) => {
      const logDate = new Date(log.startAt);
      if (logDate >= start) {
        totals[log.subject] = (totals[log.subject] || 0) + log.durationMs;
      }
    });

    return Object.entries(totals)
      .map(([subject, totalMs]) => ({
        subject,
        minutes: Math.round(totalMs / 60000),
      }))
      .sort((a, b) => b.minutes - a.minutes);
  }, [logs, now]);

  const startTimer = () => {
    if (running) return;
    setRunning({
      subject: selectedSubject,
      startAt: new Date().toISOString(),
    });
  };

  const stopTimer = () => {
    if (!running) return;

    const end = new Date();
    const start = new Date(running.startAt);

    const newLog: StudyLog = {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`,
      subject: running.subject,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      durationMs: end.getTime() - start.getTime(),
      memo,
      dateKey: formatDateKey(start),
    };

    setLogs([newLog, ...logs]);
    setRunning(null);
    setMemo("");
    setSelectedDateKey(formatDateKey(start));
    setCalendarMonth(new Date(start.getFullYear(), start.getMonth(), 1));
  };

  const moveMonth = (offset: number) => {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  };

  const glassCard: CSSProperties = {
    background: "linear-gradient(180deg, rgba(255,255,255,0.78) 0%, rgba(248,251,255,0.62) 100%)",
    backdropFilter: "blur(24px) saturate(140%)",
    WebkitBackdropFilter: "blur(24px) saturate(140%)",
    border: "1px solid rgba(255,255,255,0.92)",
    borderRadius: 32,
    boxShadow:
      "0 20px 45px rgba(94, 109, 128, 0.14), inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(214,224,235,0.55)",
    padding: 24,
  };

  const pillButton = (active: boolean): CSSProperties => ({
    padding: "10px 16px",
    borderRadius: 999,
    border: active ? "1px solid rgba(96,165,250,0.65)" : "1px solid rgba(214,224,235,0.8)",
    cursor: "pointer",
    background: active
      ? "linear-gradient(180deg, rgba(121,191,255,0.95) 0%, rgba(84,160,255,0.95) 100%)"
      : "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(240,245,250,0.86) 100%)",
    color: active ? "#ffffff" : "#334155",
    fontWeight: 600,
    boxShadow: active
      ? "0 10px 20px rgba(96,165,250,0.25), inset 0 1px 0 rgba(255,255,255,0.35)"
      : "inset 0 1px 0 rgba(255,255,255,0.95)",
  });

  const tooltipStyle: CSSProperties = {
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.95)",
    background: "rgba(255,255,255,0.88)",
    backdropFilter: "blur(14px)",
    boxShadow: "0 12px 30px rgba(94,109,128,0.14)",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, rgba(194,233,255,0.9) 0%, rgba(232,238,245,0.92) 36%, rgba(212,220,229,0.96) 100%)",
        padding: "24px",
        color: "#1f2937",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 12% 18%, rgba(125,211,252,0.22), transparent 24%), radial-gradient(circle at 85% 12%, rgba(255,255,255,0.48), transparent 20%), radial-gradient(circle at 78% 78%, rgba(191,219,254,0.18), transparent 26%)",
            pointerEvents: "none",
            filter: "blur(8px)",
          }}
        />

        <div
          style={{
            ...glassCard,
            marginBottom: 24,
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(135deg, rgba(255,255,255,0.48) 0%, transparent 40%, rgba(148,163,184,0.08) 100%)",
              pointerEvents: "none",
            }}
          />

          <div style={{ position: "relative" }}>
            <div
              style={{
                fontSize: 13,
                color: "#64748b",
                letterSpacing: 0.4,
                textTransform: "uppercase",
              }}
            >
              Study Timer
            </div>
            <div
              style={{
                fontSize: 40,
                fontWeight: 700,
                letterSpacing: -1.2,
                color: "#0f172a",
              }}
            >
              {formatClock(now)}
            </div>
          </div>

          <div style={{ textAlign: "right", position: "relative" }}>
            <div style={{ fontSize: 13, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4 }}>
              Today
            </div>
            <div style={{ fontSize: 30, fontWeight: 700, color: "#0f172a", letterSpacing: -0.8 }}>
              {formatMinutes(todayTotalMs)}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 24,
            alignItems: "start",
            position: "relative",
          }}
        >
          <div style={glassCard}>
            <div style={{ fontSize: 14, color: "#64748b", marginBottom: 12, fontWeight: 600 }}>科目</div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 24 }}>
              {subjects.map((subject) => (
                <button key={subject} onClick={() => setSelectedSubject(subject)} style={pillButton(selectedSubject === subject)}>
                  {subject}
                </button>
              ))}
            </div>

            <div
              style={{
                fontSize: 54,
                textAlign: "center",
                letterSpacing: 3,
                fontWeight: 300,
                marginBottom: 24,
                color: "#0f172a",
                textShadow: "0 1px 0 rgba(255,255,255,0.65)",
              }}
            >
              {formatDuration(elapsed)}
            </div>

            {!running ? (
              <button
                onClick={startTimer}
                style={{
                  width: "100%",
                  padding: "17px",
                  borderRadius: 20,
                  border: "1px solid rgba(96,165,250,0.6)",
                  cursor: "pointer",
                  background: "linear-gradient(180deg, rgba(126,196,255,0.98) 0%, rgba(84,160,255,0.98) 100%)",
                  color: "#fff",
                  fontSize: 18,
                  fontWeight: 700,
                  boxShadow: "0 16px 28px rgba(96,165,250,0.26), inset 0 1px 0 rgba(255,255,255,0.28)",
                }}
              >
                スタート
              </button>
            ) : (
              <button
                onClick={stopTimer}
                style={{
                  width: "100%",
                  padding: "17px",
                  borderRadius: 20,
                  border: "1px solid rgba(71,85,105,0.65)",
                  cursor: "pointer",
                  background: "linear-gradient(180deg, rgba(71,85,105,0.98) 0%, rgba(30,41,59,0.98) 100%)",
                  color: "#fff",
                  fontSize: 18,
                  fontWeight: 700,
                  boxShadow: "0 16px 28px rgba(30,41,59,0.18), inset 0 1px 0 rgba(255,255,255,0.15)",
                }}
              >
                停止して記録
              </button>
            )}

            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="何をしたかメモ"
              style={{
                width: "100%",
                minHeight: 108,
                marginTop: 16,
                padding: 15,
                borderRadius: 20,
                border: "1px solid rgba(214,224,235,0.92)",
                background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(245,248,252,0.9) 100%)",
                fontSize: 15,
                boxSizing: "border-box",
                boxShadow: "inset 0 1px 1px rgba(255,255,255,0.8)",
                color: "#0f172a",
              }}
            />

            <div
              style={{
                marginTop: 20,
                padding: 18,
                borderRadius: 22,
                background: "linear-gradient(180deg, rgba(255,255,255,0.82) 0%, rgba(241,245,249,0.76) 100%)",
                border: "1px solid rgba(214,224,235,0.9)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.88)",
              }}
            >
              <div style={{ fontSize: 14, color: "#64748b", marginBottom: 8, fontWeight: 600 }}>達成ライン</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="number"
                  min={1}
                  step={5}
                  value={dailyGoalMinutes}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    if (Number.isFinite(next) && next > 0) {
                      setDailyGoalMinutes(next);
                    }
                  }}
                  style={{
                    width: 100,
                    padding: "10px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(203,213,225,0.95)",
                    fontSize: 15,
                    background: "rgba(255,255,255,0.95)",
                    color: "#0f172a",
                  }}
                />
                <span style={{ color: "#475569", fontWeight: 500 }}>分 / 日</span>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={glassCard}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 18,
                }}
              >
                <button
                  onClick={() => moveMonth(-1)}
                  style={{
                    border: "1px solid rgba(214,224,235,0.9)",
                    background: "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(241,245,249,0.9) 100%)",
                    borderRadius: 16,
                    padding: "8px 14px",
                    cursor: "pointer",
                    fontSize: 18,
                    color: "#334155",
                  }}
                >
                  ←
                </button>

                <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", letterSpacing: -0.4 }}>
                  {getMonthLabel(calendarMonth)}
                </div>

                <button
                  onClick={() => moveMonth(1)}
                  style={{
                    border: "1px solid rgba(214,224,235,0.9)",
                    background: "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(241,245,249,0.9) 100%)",
                    borderRadius: 16,
                    padding: "8px 14px",
                    cursor: "pointer",
                    fontSize: 18,
                    color: "#334155",
                  }}
                >
                  →
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, 1fr)",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                {WEEKDAYS.map((day) => (
                  <div
                    key={day}
                    style={{
                      textAlign: "center",
                      fontSize: 13,
                      color: "#64748b",
                      fontWeight: 600,
                      paddingBottom: 4,
                    }}
                  >
                    {day}
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, 1fr)",
                  gap: 8,
                }}
              >
                {calendarCells.map((cell) => {
                  const totalMs = totalsByDate[cell.dateKey] || 0;
                  const achieved = achievedDates[cell.dateKey] || false;
                  const isSelected = selectedDateKey === cell.dateKey;
                  const isToday = todayKey === cell.dateKey;

                  return (
                    <button
                      key={cell.dateKey}
                      onClick={() => setSelectedDateKey(cell.dateKey)}
                      style={{
                        minHeight: 88,
                        borderRadius: 20,
                        border: isSelected
                          ? "2px solid rgba(96,165,250,0.9)"
                          : isToday
                          ? "1px solid rgba(147,197,253,0.95)"
                          : "1px solid rgba(226,232,240,0.9)",
                        background: isSelected
                          ? "linear-gradient(180deg, rgba(219,234,254,0.9) 0%, rgba(239,246,255,0.82) 100%)"
                          : "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(246,249,252,0.9) 100%)",
                        cursor: "pointer",
                        padding: 10,
                        textAlign: "left",
                        color: cell.inCurrentMonth ? "#1f2937" : "#9ca3af",
                        boxShadow: isSelected ? "0 12px 20px rgba(96,165,250,0.12)" : "inset 0 1px 0 rgba(255,255,255,0.85)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{cell.date.getDate()}</span>
                        {achieved && (
                          <span
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: "50%",
                              background: "linear-gradient(180deg, #34d399 0%, #16a34a 100%)",
                              display: "inline-block",
                              boxShadow: "0 0 0 3px rgba(220,252,231,0.8)",
                            }}
                          />
                        )}
                      </div>

                      <div style={{ marginTop: 8, fontSize: 12, color: "#64748b", fontWeight: 500 }}>
                        {totalMs > 0 ? formatMinutes(totalMs) : "-"}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={glassCard}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 14, color: "#64748b", fontWeight: 600 }}>選択中の日付</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", letterSpacing: -0.4 }}>
                    {formatDateLabel(selectedDateKey)}
                  </div>
                  {achievedDates[selectedDateKey] && (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#166534",
                        background: "linear-gradient(180deg, rgba(220,252,231,0.98) 0%, rgba(187,247,208,0.95) 100%)",
                        padding: "6px 11px",
                        borderRadius: 999,
                        border: "1px solid rgba(134,239,172,0.8)",
                      }}
                    >
                      達成
                    </span>
                  )}
                </div>
                <div style={{ marginTop: 8, fontSize: 15, color: "#475569", fontWeight: 500 }}>
                  合計: {formatDuration(selectedDateTotalMs)}
                </div>
              </div>

              {selectedDateLogs.length === 0 ? (
                <div style={{ color: "#6b7280" }}>この日の記録はまだないよ。</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {selectedDateLogs.map((log) => (
                    <div
                      key={log.id}
                      style={{
                        background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(245,248,252,0.9) 100%)",
                        borderRadius: 20,
                        padding: 14,
                        border: "1px solid rgba(226,232,240,0.9)",
                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.88)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <strong style={{ color: "#0f172a" }}>{log.subject}</strong>
                        <span style={{ color: "#334155", fontWeight: 600 }}>{formatDuration(log.durationMs)}</span>
                      </div>
                      <div style={{ fontSize: 13, color: "#64748b", marginBottom: 6 }}>
                        {new Date(log.startAt).toLocaleTimeString("ja-JP")} -{" "}
                        {new Date(log.endAt).toLocaleTimeString("ja-JP")}
                      </div>
                      <div style={{ fontSize: 14, color: "#334155" }}>{log.memo || "メモなし"}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={glassCard}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 14, color: "#64748b", fontWeight: 600 }}>直近7日間</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", letterSpacing: -0.4 }}>週間グラフ</div>
              </div>

              <div style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                    <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelFormatter={(label) => `日付: ${String(label)}`}
                    />
                    <Bar dataKey="minutes" name="勉強時間（分）" radius={[12, 12, 0, 0]} fill="url(#appleBlueGradient)" />
                    <defs>
                      <linearGradient id="appleBlueGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8fd3ff" />
                        <stop offset="100%" stopColor="#5aa7ff" />
                      </linearGradient>
                    </defs>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div style={glassCard}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 14, color: "#64748b", fontWeight: 600 }}>直近7日間</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", letterSpacing: -0.4 }}>
                  科目別グラフ
                </div>
              </div>

              <div style={{ width: "100%", height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={subjectChartData}
                    layout="vertical"
                    margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                    <XAxis
                      type="number"
                      tick={{ fill: "#64748b", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="subject"
                      width={64}
                      tick={{ fill: "#64748b", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelFormatter={(label) => `科目: ${String(label)}`}
                    />
                    <Bar dataKey="minutes" name="勉強時間（分）" radius={[0, 12, 12, 0]} fill="url(#appleBlueGradient2)" />
                    <defs>
                      <linearGradient id="appleBlueGradient2" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#9ad9ff" />
                        <stop offset="100%" stopColor="#5aa7ff" />
                      </linearGradient>
                    </defs>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}