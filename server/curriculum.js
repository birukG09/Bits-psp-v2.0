// Course catalog for the Software Engineering program (BiTS College Undergraduate Student Handbook).
// server/curriculum.json feeds both the course dropdown and "Add all program courses".
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SEMESTERS_BY_YEAR } from "./scale.js";

const here = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(resolve(here, "curriculum.json"), "utf8"));

const label = (year, sem) => (year && sem ? SEMESTERS_BY_YEAR[year][sem - 1] : null);

export const PROGRAMS = Object.fromEntries(
  Object.entries(raw).map(([key, p]) => [
    key,
    {
      name: p.name,
      requiredCredits: 140,
      electiveCreditsRequired: 9,
      courses: p.courses.map((c) => ({ ...c, semesterLabel: label(c.year, c.semester) })),
      electiveSlots: p.electiveSlots,
    },
  ])
);
