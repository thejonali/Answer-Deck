import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { CircleAlert, CircleCheck, RotateCcw, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { getPerformanceReport, listClasses } from "../api";
import { formatDateTime } from "../utils/formatDateTime";
import type { PerformanceReport, PerformanceReportFilters, StoredClass } from "../../shared/types";

type DatePreset = "30_days" | "90_days" | "all_time" | "custom";

const DEFAULT_FILTERS: PerformanceReportFilters = {
  classId: null,
  chapterId: null,
  from: null,
  to: null,
  attemptType: "all",
  page: 1,
  pageSize: 25
};

function shortDate(value: string) {
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function percent(value: number) {
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function ReportsView({ classesVersion }: { classesVersion: number }) {
  const [classes, setClasses] = useState<StoredClass[]>([]);
  const [filters, setFilters] = useState<PerformanceReportFilters>(DEFAULT_FILTERS);
  const [datePreset, setDatePreset] = useState<DatePreset>("all_time");
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listClasses().then(setClasses).catch((caught) => setError(String(caught)));
  }, [classesVersion]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getPerformanceReport(filters)
      .then((nextReport) => {
        if (!cancelled) setReport(nextReport);
      })
      .catch((caught) => {
        if (!cancelled) setError(String(caught));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [classesVersion, filters]);

  const selectedClass = classes.find((item) => item.id === filters.classId) ?? null;
  const trendData = useMemo(
    () =>
      report?.trend.map((point) => ({
        ...point,
        label: shortDate(point.completedAt),
        originalAccuracy: point.attemptType === "original" ? point.accuracy : null,
        retryAccuracy: point.attemptType === "retry" ? point.accuracy : null
      })) ?? [],
    [report]
  );
  const chapterData = report?.chapters.map((chapter) => ({
    ...chapter,
    label: filters.classId === null ? `${chapter.className} · ${chapter.chapterName}` : chapter.chapterName
  }));
  const totalPages = report ? Math.max(1, Math.ceil(report.attempts.total / report.attempts.pageSize)) : 1;
  const selectedChapter = selectedClass?.chapters.find((chapter) => chapter.id === filters.chapterId) ?? null;
  const originalAttemptCount = report?.trend.filter((point) => point.attemptType === "original").length ?? 0;
  const scopeLabel = selectedClass
    ? selectedChapter
      ? `${selectedClass.name} · ${selectedChapter.name}`
      : selectedClass.name
    : "All classes";
  const dateLabel =
    datePreset === "30_days"
      ? "Last 30 days"
      : datePreset === "90_days"
        ? "Last 90 days"
        : datePreset === "custom"
          ? `${filters.from ?? "Start"} – ${filters.to ?? "Today"}`
          : "All time";

  const updateFilters = (changes: Partial<PerformanceReportFilters>) => {
    setFilters((current) => ({ ...current, ...changes, page: changes.page ?? 1 }));
  };

  const applyDatePreset = (preset: DatePreset) => {
    setDatePreset(preset);
    if (preset === "custom") return;
    if (preset === "all_time") {
      updateFilters({ from: null, to: null });
      return;
    }

    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - (preset === "30_days" ? 29 : 89));
    updateFilters({ from: toDateInputValue(from), to: toDateInputValue(to) });
  };

  const resetFilters = () => {
    setDatePreset("all_time");
    setFilters(DEFAULT_FILTERS);
  };

  return (
    <section className="tool-page reports-page">
      <section className="report-hero">
        <header className="report-hero-heading">
          <div>
            <p className="eyebrow">Long-term analysis</p>
            <h2>Performance Reports</h2>
            <p className="page-description">See what is sticking, where you are improving, and what to review next.</p>
          </div>
          {report && (
            <span className="report-updated-badge">
              <span aria-hidden="true" /> Updated from {report.attempts.total}{" "}
              {report.attempts.total === 1 ? "attempt" : "attempts"}
            </span>
          )}
        </header>

        <div className="report-filter-grid" aria-label="Report filters">
          <section className="report-filter-cluster report-scope-filter">
            <span className="report-cluster-label">Study scope</span>
            <div className="report-scope-controls">
              <select
                aria-label="Class"
                value={filters.classId ?? ""}
                onChange={(event) =>
                  updateFilters({ classId: event.target.value ? Number(event.target.value) : null, chapterId: null })
                }
              >
                <option value="">All classes</option>
                {classes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Chapter"
                value={filters.chapterId ?? ""}
                disabled={selectedClass === null}
                onChange={(event) =>
                  updateFilters({ chapterId: event.target.value ? Number(event.target.value) : null })
                }
              >
                <option value="">All chapters</option>
                {selectedClass?.chapters.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>
                    {chapter.name}
                  </option>
                ))}
              </select>
            </div>
          </section>

          <section className="report-filter-cluster">
            <span className="report-cluster-label">Time period</span>
            <div className="report-segmented-control">
              {[
                ["30_days", "30 days"],
                ["90_days", "90 days"],
                ["all_time", "All time"],
                ["custom", "Custom"]
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={datePreset === value ? "active" : ""}
                  aria-pressed={datePreset === value}
                  onClick={() => applyDatePreset(value as DatePreset)}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section className="report-filter-cluster report-attempt-filter">
            <span className="report-cluster-label">Attempt type</span>
            <div className="report-segmented-control">
              {[
                ["all", "All"],
                ["original", "Original"],
                ["retry", "Retest"]
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={filters.attemptType === value ? "active" : ""}
                  aria-pressed={filters.attemptType === value}
                  onClick={() =>
                    updateFilters({ attemptType: value as PerformanceReportFilters["attemptType"] })
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </section>
        </div>

        {datePreset === "custom" && (
          <div className="report-custom-date-row">
            <label>
              From
              <input
                type="date"
                value={filters.from ?? ""}
                onChange={(event) => updateFilters({ from: event.target.value || null })}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={filters.to ?? ""}
                onChange={(event) => updateFilters({ to: event.target.value || null })}
              />
            </label>
          </div>
        )}

        <div className="report-active-filters">
          <span className="report-filter-chip">{scopeLabel}</span>
          <span className="report-filter-chip">{dateLabel}</span>
          {filters.attemptType !== "all" && (
            <span className="report-filter-chip">
              {filters.attemptType === "original" ? "Original attempts" : "Retests only"}
            </span>
          )}
          <button className="report-reset-link" onClick={resetFilters}>
            Reset view
          </button>
        </div>
      </section>

      {error && <div className="notice error">{error}</div>}
      {loading && report === null && <div className="notice compact-notice">Loading report...</div>}

      {report && (
        <>
          <div className="report-primary-kpis">
            <article
              className="report-primary-kpi"
              style={{ "--report-accent": "#4f46e5", "--report-tint": "#eeedff" } as CSSProperties}
            >
              <div className="report-kpi-label">
                <span>First-pass accuracy</span>
                <span className="report-kpi-icon"><TrendingUp size={17} /></span>
              </div>
              <strong>{percent(report.kpis.firstPassAccuracy)}</strong>
              <small>{originalAttemptCount} original {originalAttemptCount === 1 ? "attempt" : "attempts"} in this view</small>
            </article>
            <article
              className="report-primary-kpi"
              style={{ "--report-accent": "#0d9488", "--report-tint": "#e3f7f4" } as CSSProperties}
            >
              <div className="report-kpi-label">
                <span>Latest mastery</span>
                <span className="report-kpi-icon"><CircleCheck size={17} /></span>
              </div>
              <strong>{percent(report.kpis.latestMastery)}</strong>
              <small>
                {report.kpis.unresolvedQuestions === 0
                  ? "All currently answered questions resolved"
                  : `${report.kpis.unresolvedQuestions} unresolved questions`}
              </small>
            </article>
            <article
              className="report-primary-kpi"
              style={{ "--report-accent": "#d97706", "--report-tint": "#fff3e3" } as CSSProperties}
            >
              <div className="report-kpi-label">
                <span>Retry recovery</span>
                <span className="report-kpi-icon"><RotateCcw size={17} /></span>
              </div>
              <strong>{percent(report.kpis.retryRecovery)}</strong>
              <small>
                {report.retryFunnel.recovered === 0
                  ? "No recovered retests in this view"
                  : `${report.retryFunnel.recovered} recovered through focused retests`}
              </small>
            </article>
            <article
              className="report-primary-kpi"
              style={{ "--report-accent": "#e11d48", "--report-tint": "#fff0f3" } as CSSProperties}
            >
              <div className="report-kpi-label">
                <span>Needs attention</span>
                <span className="report-kpi-icon"><CircleAlert size={17} /></span>
              </div>
              <strong>{report.kpis.unresolvedQuestions}</strong>
              <small>
                {report.kpis.unresolvedQuestions === 0
                  ? "No unresolved questions"
                  : "Questions whose latest answer was missed"}
              </small>
            </article>
          </div>

          <div className="report-secondary-stats">
            <div><strong>{report.kpis.questionsAnswered.toLocaleString()}</strong><span>questions answered</span></div>
            <div><strong>{report.kpis.averageSecondsPerQuestion.toFixed(1)}s</strong><span>average response</span></div>
            <div><strong>{report.kpis.attempts}</strong><span>attempts</span></div>
            <div><strong>{percent(report.kpis.weightedAccuracy)}</strong><span>weighted accuracy</span></div>
          </div>

          {report.kpis.questionsAnswered === 0 ? (
            <div className="panel empty-report">
              <h3>No matching activity</h3>
              <p className="muted">Adjust the report filters or complete another practice session.</p>
            </div>
          ) : (
            <>
              <div className="report-chart-grid">
                <section className="panel chart-panel">
                  <div className="report-section-heading">
                    <div>
                      <h3>Accuracy over time</h3>
                      <p className="muted">Original attempts and focused retests are shown separately.</p>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={trendData} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" minTickGap={28} />
                      <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                      <Tooltip
                        labelFormatter={(_label, payload) =>
                          payload[0]?.payload.completedAt ? formatDateTime(payload[0].payload.completedAt) : ""
                        }
                        formatter={(value, name) => [percent(Number(value)), name === "originalAccuracy" ? "Original" : "Retest"]}
                      />
                      <Legend formatter={(value) => (value === "originalAccuracy" ? "Original" : "Retest")} />
                      <Line
                        type="monotone"
                        dataKey="originalAccuracy"
                        stroke="#2e6de8"
                        strokeWidth={2}
                        connectNulls
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="retryAccuracy"
                        stroke="#d9822b"
                        strokeWidth={2}
                        strokeDasharray="5 4"
                        connectNulls
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </section>

                <section className="panel chart-panel">
                  <div className="report-section-heading">
                    <div>
                      <h3>Study activity</h3>
                      <p className="muted">Question volume and outcomes by day.</p>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={report.activity} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={28} />
                      <YAxis allowDecimals={false} />
                      <Tooltip labelFormatter={(value) => shortDate(String(value))} />
                      <Legend />
                      <Bar
                        dataKey="correct"
                        stackId="answers"
                        fill="#1f9d68"
                        radius={[4, 4, 0, 0]}
                        isAnimationActive={false}
                      />
                      <Bar
                        dataKey="incorrect"
                        stackId="answers"
                        fill="#d84a4a"
                        radius={[4, 4, 0, 0]}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </section>
              </div>

              <div className="report-analysis-grid">
                <section className="panel chart-panel">
                  <div className="report-section-heading">
                    <div>
                      <h3>Chapter performance</h3>
                      <p className="muted">Latest mastery includes one most-recent answer per question.</p>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={Math.max(280, (chapterData?.length ?? 0) * 46)}>
                    <BarChart data={chapterData} layout="vertical" margin={{ left: 16, right: 20, top: 12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                      <YAxis dataKey="label" type="category" width={150} />
                      <Tooltip formatter={(value) => percent(Number(value))} />
                      <Legend />
                      <Bar
                        dataKey="accuracy"
                        name="All-answer accuracy"
                        fill="#94a3b8"
                        radius={[0, 4, 4, 0]}
                        isAnimationActive={false}
                      />
                      <Bar
                        dataKey="latestMastery"
                        name="Latest mastery"
                        fill="#2e6de8"
                        radius={[0, 4, 4, 0]}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </section>

                <section className="panel retry-panel">
                  <div className="report-section-heading">
                    <div>
                      <h3>Retry recovery</h3>
                      <p className="muted">Original misses followed through their linked retests.</p>
                    </div>
                  </div>
                  <div className="retry-funnel">
                    {[
                      ["Missed", report.retryFunnel.missed],
                      ["Retested", report.retryFunnel.retested],
                      ["Recovered", report.retryFunnel.recovered],
                      ["Still missed", report.retryFunnel.stillMissed]
                    ].map(([label, value]) => (
                      <div className="retry-funnel-row" key={label}>
                        <span>{label}</span>
                        <strong>{value}</strong>
                        <div className="retry-funnel-track">
                          <span
                            style={{
                              width: `${report.retryFunnel.missed === 0 ? 0 : (Number(value) / report.retryFunnel.missed) * 100}%`
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <section className="panel report-table-panel">
                <div className="report-section-heading">
                  <div>
                    <h3>Weak and repeated questions</h3>
                    <p className="muted">Questions with misses, prioritized by unresolved status and repeat count.</p>
                  </div>
                </div>
                <div className="report-table-scroll">
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th>Question</th>
                        <th>Area</th>
                        <th>Misses</th>
                        <th>Avg time</th>
                        <th>Latest</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.weakQuestions.map((question) => (
                        <tr key={question.questionId}>
                          <td>{question.prompt}</td>
                          <td>
                            {question.className} · {question.chapterName}
                          </td>
                          <td>
                            {question.misses}/{question.answers}
                          </td>
                          <td>{question.averageSeconds.toFixed(1)}s</td>
                          <td>
                            <span className={`status-pill ${question.latestCorrect ? "ok" : "warn"}`}>
                              {question.latestCorrect ? "Correct" : "Missed"}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {report.weakQuestions.length === 0 && (
                        <tr>
                          <td colSpan={5} className="muted">
                            No missed questions in this report range.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="panel report-table-panel">
                <div className="report-section-heading">
                  <div>
                    <h3>Complete attempt log</h3>
                    <p className="muted">Question-weighted results for the selected class, chapter, and date range.</p>
                  </div>
                  <span className="muted">{report.attempts.total} attempts</span>
                </div>
                <div className="report-table-scroll">
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Class and chapter</th>
                        <th>Type</th>
                        <th>Score</th>
                        <th>Accuracy</th>
                        <th>Avg time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.attempts.items.map((attempt) => {
                        const attemptAccuracy =
                          attempt.totalQuestions === 0 ? 0 : (attempt.correctCount / attempt.totalQuestions) * 100;
                        return (
                          <tr key={attempt.id}>
                            <td>{formatDateTime(attempt.completedAt)}</td>
                            <td>
                              <strong>{attempt.className}</strong>
                              <span className="report-table-subline">{attempt.chapterNames.join(", ")}</span>
                            </td>
                            <td>{attempt.parentSessionId === null ? "Original" : "Retest"}</td>
                            <td>
                              {attempt.correctCount}/{attempt.totalQuestions}
                            </td>
                            <td>{percent(attemptAccuracy)}</td>
                            <td>{attempt.averageSecondsPerQuestion.toFixed(1)}s</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {report.attempts.total > report.attempts.pageSize && (
                  <div className="report-pagination">
                    <button
                      className="ghost-action"
                      disabled={filters.page === 1 || loading}
                      onClick={() => updateFilters({ page: filters.page - 1 })}
                    >
                      Previous
                    </button>
                    <span>
                      Page {filters.page} of {totalPages}
                    </span>
                    <button
                      className="ghost-action"
                      disabled={filters.page >= totalPages || loading}
                      onClick={() => updateFilters({ page: filters.page + 1 })}
                    >
                      Next
                    </button>
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}
    </section>
  );
}
