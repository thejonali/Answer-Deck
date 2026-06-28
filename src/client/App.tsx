import { lazy, Suspense, useState } from "react";
import { BarChart3, Database, History, Layers, ListChecks, PanelLeftClose, PanelLeftOpen, Play, Upload } from "lucide-react";

const ImportTool = lazy(() => import("./views/ImportTool").then((module) => ({ default: module.ImportTool })));
const QuizTool = lazy(() => import("./views/QuizTool").then((module) => ({ default: module.QuizTool })));
const FlashcardTool = lazy(() => import("./views/FlashcardTool").then((module) => ({ default: module.FlashcardTool })));
const HistoryView = lazy(() => import("./views/HistoryView").then((module) => ({ default: module.HistoryView })));
const ReportsView = lazy(() => import("./views/ReportsView").then((module) => ({ default: module.ReportsView })));
const LibraryView = lazy(() => import("./views/LibraryView").then((module) => ({ default: module.LibraryView })));

type Tab = "import" | "quiz" | "flashcards" | "history" | "reports" | "library";

export function App() {
  const [tab, setTab] = useState<Tab>("import");
  const [classesVersion, setClassesVersion] = useState(0);
  const [retryRequest, setRetryRequest] = useState<{ sessionId: number; requestId: number } | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const isPracticeActive = tab === "quiz" || tab === "flashcards";

  return (
    <div className={`app-shell ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-header">
          <img className="brand-mark" src="/answerdeck-logo.png" alt="AnswerDeck logo" />
          <div className="brand-copy">
            <h1>AnswerDeck</h1>
            <p>Focused exam review</p>
          </div>
          <button
            className="sidebar-toggle"
            onClick={() => setIsSidebarCollapsed((value) => !value)}
            title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isSidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
        <nav className="nav-list" aria-label="Primary">
          <button className={tab === "import" ? "active" : ""} onClick={() => setTab("import")}>
            <Upload size={18} /> <span>Import</span>
          </button>
          <div className="nav-group">
            <button className={isPracticeActive ? "active" : ""} onClick={() => setTab("quiz")}>
              <Play size={18} /> <span>Practice</span>
            </button>
            <div className="subnav-list" aria-label="Practice modes">
              <button className={tab === "quiz" ? "active" : ""} onClick={() => setTab("quiz")}>
                <ListChecks size={16} /> <span>Quiz</span>
              </button>
              <button className={tab === "flashcards" ? "active" : ""} onClick={() => setTab("flashcards")}>
                <Layers size={16} /> <span>Flashcards</span>
              </button>
            </div>
          </div>
          <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
            <History size={18} /> <span>Attempts</span>
          </button>
          <button className={tab === "reports" ? "active" : ""} onClick={() => setTab("reports")}>
            <BarChart3 size={18} /> <span>Reports</span>
          </button>
          <button className={tab === "library" ? "active" : ""} onClick={() => setTab("library")}>
            <Database size={18} /> <span>Library</span>
          </button>
        </nav>
      </aside>
      <main className="workspace">
        <Suspense fallback={<div className="notice compact-notice">Loading...</div>}>
          {tab === "import" && (
            <ImportTool
              classesVersion={classesVersion}
              onSaved={() => {
                setClassesVersion((value) => value + 1);
                setTab("quiz");
              }}
            />
          )}
          {tab === "quiz" && (
            <QuizTool
              classesVersion={classesVersion}
              onSessionSaved={() => setClassesVersion((value) => value + 1)}
              retryRequest={retryRequest}
              onRetryHandled={() => setRetryRequest(null)}
            />
          )}
          {tab === "flashcards" && <FlashcardTool classesVersion={classesVersion} />}
          {tab === "history" && (
            <HistoryView
              classesVersion={classesVersion}
              onRetryMissed={(sessionId) => {
                setRetryRequest((current) => ({ sessionId, requestId: (current?.requestId ?? 0) + 1 }));
                setTab("quiz");
              }}
              onViewReports={() => setTab("reports")}
            />
          )}
          {tab === "reports" && <ReportsView classesVersion={classesVersion} />}
          {tab === "library" && <LibraryView classesVersion={classesVersion} />}
        </Suspense>
      </main>
    </div>
  );
}
