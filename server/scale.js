// BiTS grading scale: grade points per letter grade.
export const GRADE_POINTS = {
  "A+": 4.0, A: 4.0, "A-": 3.7, "B+": 3.5, B: 3.0, "B-": 2.7,
  "C+": 2.5, C: 2.0, "C-": 1.75, D: 1.0, F: 0.0,
};

export const REQUIRED_CREDITS = 140;

// Semester labels, grouped by academic year.
export const SEMESTERS_BY_YEAR = {
  1: ["1st Semester 2022", "2nd Semester 2023"],
  2: ["1st Semester 2023", "2nd Semester 2024"],
  3: ["1st Semester 2024", "2nd Semester 2025"],
  4: ["1st Semester 2025", "2nd Semester 2026"],
};
export const ALL_SEMESTERS = Object.values(SEMESTERS_BY_YEAR).flat();

// "1st Semester 2024" -> "First Semester"; "2nd Semester 2025" -> "Second Semester"
export function semesterName(label) {
  if (!label) return null;
  if (label.startsWith("1st")) return "First Semester";
  if (label.startsWith("2nd")) return "Second Semester";
  return label;
}

export const gradePoints = (letter) => (letter in GRADE_POINTS ? GRADE_POINTS[letter] : null);
