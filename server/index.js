import express from "express";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "./db.js";
import authRouter from "./auth.js";
import gpaRouter from "./gpa.js";
import habitsRouter from "./habits.js";
import pspRouter from "./psp.js";
import { studentAnalytics, studentDashboard } from "./analytics.js";
import { seedDemo, DEMO } from "./seed.js";

const here = dirname(fileURLToPath(import.meta.url));
const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.use("/api/auth", authRouter);
app.use("/api/gpa", gpaRouter);
app.use("/api/habits", habitsRouter);
app.use("/api/psp", pspRouter);
app.use("/api/analytics/student", studentAnalytics);
app.use("/api/dashboard", studentDashboard);

app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

app.use(express.static(resolve(here, "..", "public"), { extensions: ["html"] }));

// Error handler: never leak stack traces to the browser
app.use((err, _req, res, _next) => {
  if (err.type === "entity.too.large") return res.status(413).json({ error: "That upload is too large" });
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON body" });
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server" });
});

// First run with an empty database: add the demo student so every page has data (NO_DEMO=1 skips this).
if (!process.env.NO_DEMO && seedDemo({ onlyIfEmpty: true })) console.log(`Demo student created: ${DEMO.email} / ${DEMO.password}`);

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`BiTS Connect running on http://localhost:${port}`));
