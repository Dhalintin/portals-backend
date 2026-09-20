"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gradeFromTotal = gradeFromTotal;
exports.computeScoreTotal = computeScoreTotal;
exports.defaultRemarkFromGrade = defaultRemarkFromGrade;
/**
 * Default private-school letter grades (0–100).
 * Swap or make org-configurable later without changing Score storage.
 */
function gradeFromTotal(total) {
    if (total == null || Number.isNaN(total))
        return null;
    const t = total;
    if (t >= 70)
        return "A";
    if (t >= 60)
        return "B";
    if (t >= 50)
        return "C";
    if (t >= 45)
        return "D";
    if (t >= 40)
        return "E";
    return "F";
}
function computeScoreTotal(ca1, ca2, exam) {
    return (ca1 ?? 0) + (ca2 ?? 0) + (exam ?? 0);
}
/** Remark hint from grade — optional UX, not stored unless caller sets remark */
function defaultRemarkFromGrade(grade) {
    if (!grade)
        return null;
    const map = {
        A: "Excellent",
        B: "Very Good",
        C: "Good",
        D: "Fair",
        E: "Pass",
        F: "Fail",
    };
    return map[grade] ?? null;
}
