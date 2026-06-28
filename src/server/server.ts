import express from "express";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { StudyDatabase } from "./database";
import { parseQuizText } from "../shared/parser";
import {
  importPreviewRequestSchema,
  importSaveRequestSchema,
  questionInputSchema,
  quizSessionInputSchema
} from "../shared/schemas";
import { z } from "zod";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(__dirname, "../..");
const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? "true"];
  })
);
const port = Number(args.get("port") ?? process.env.PORT ?? 4173);
const isProduction = process.env.NODE_ENV === "production";

const app = express();
const database = new StudyDatabase(process.env.STUDY_DB_PATH ?? "data/study.sqlite");

app.use(express.json({ limit: "10mb" }));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.post("/api/import/preview", (request, response) => {
  const parsed = importPreviewRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues.map((issue) => issue.message).join(" ") });
    return;
  }

  response.json(
    parseQuizText({
      ...parsed.data,
      sourceFileName: parsed.data.sourceFileName ?? null
    })
  );
});

app.post("/api/import/save", (request, response) => {
  const parsed = importSaveRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues.map((issue) => issue.message).join(" ") });
    return;
  }

  const result = database.saveImport({
    ...parsed.data,
    sourceFileName: parsed.data.sourceFileName ?? null
  });
  response.json(result);
});

app.get("/api/classes", (_request, response) => {
  response.json(database.listClasses());
});

app.patch("/api/classes/:id", (request, response) => {
  const id = Number(request.params.id);
  const parsed = z.object({ name: z.string().trim().min(1) }).safeParse(request.body);
  if (!Number.isInteger(id) || id <= 0 || !parsed.success) {
    response.status(400).json({ error: "A valid class name is required." });
    return;
  }
  database.updateClassName(id, parsed.data.name);
  response.json({ ok: true });
});

app.patch("/api/chapters/:id", (request, response) => {
  const id = Number(request.params.id);
  const parsed = z.object({ name: z.string().trim().min(1) }).safeParse(request.body);
  if (!Number.isInteger(id) || id <= 0 || !parsed.success) {
    response.status(400).json({ error: "A valid chapter name is required." });
    return;
  }
  database.updateChapterName(id, parsed.data.name);
  response.json({ ok: true });
});

app.get("/api/history", (_request, response) => {
  response.json(database.listQuizHistory());
});

app.get("/api/history/recent", (_request, response) => {
  response.json(database.listRecentQuizHistory());
});

app.get("/api/questions", (request, response) => {
  const classId = Number(request.query.classId);
  const chapterIds = String(request.query.chapterIds ?? "")
    .split(",")
    .filter(Boolean)
    .map(Number);

  if (!Number.isInteger(classId) || classId <= 0 || chapterIds.length === 0) {
    response.status(400).json({ error: "A class and at least one chapter are required." });
    return;
  }

  response.json(database.getQuestions(classId, chapterIds));
});

app.patch("/api/questions/:id", (request, response) => {
  const id = Number(request.params.id);
  const parsed = questionInputSchema.safeParse(request.body);
  if (!Number.isInteger(id) || id <= 0 || !parsed.success) {
    response.status(400).json({
      error: parsed.success
        ? "A valid question id is required."
        : parsed.error.issues.map((issue) => issue.message).join(" ")
    });
    return;
  }
  database.updateQuestion(id, parsed.data);
  response.json({ ok: true });
});

app.delete("/api/questions/:id", (request, response) => {
  const id = Number(request.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    response.status(400).json({ error: "A valid question id is required." });
    return;
  }
  database.deleteQuestion(id);
  response.json({ ok: true });
});

app.post("/api/quiz-sessions", (request, response) => {
  const parsed = quizSessionInputSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues.map((issue) => issue.message).join(" ") });
    return;
  }

  response.json(database.saveQuizSession(parsed.data));
});

app.get("/api/quiz-sessions/:id/missed-questions", (request, response) => {
  const id = Number(request.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    response.status(400).json({ error: "A valid quiz session id is required." });
    return;
  }

  const quiz = database.getMissedQuestionQuiz(id);
  if (!quiz) {
    response.status(404).json({ error: "Quiz session not found." });
    return;
  }
  response.json(quiz);
});

app.get("/api/export", (_request, response) => {
  response.json(database.exportData());
});

app.use("/api", (_request, response) => {
  response.status(404).json({
    error: "API route not found. Restart AnswerDeck if it was already running when the app was updated."
  });
});

if (isProduction) {
  const clientPath = join(root, "dist/client");
  if (existsSync(clientPath)) {
    app.use(express.static(clientPath));
    app.get("/{*splat}", (_request, response) => {
      response.sendFile(join(clientPath, "index.html"));
    });
  }
} else {
  const vite = await createViteServer({
    root,
    server: { middlewareMode: true },
    appType: "spa"
  });
  app.use(vite.middlewares);
}

const server = app.listen(port, "127.0.0.1", () => {
  console.log(`AnswerDeck running at http://127.0.0.1:${port}`);
});

function shutdown() {
  database.close();
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
