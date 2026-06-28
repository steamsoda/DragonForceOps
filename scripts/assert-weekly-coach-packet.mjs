import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/app/(protected)/attendance/reports/page.tsx", "utf8");
const query = readFileSync("src/lib/queries/weekly-coach-packet.ts", "utf8");
const printButton = readFileSync("src/components/attendance/weekly-coach-packet-print-button.tsx", "utf8");

assert.match(page, /Reporte semanal para coaches/, "Attendance reports should render the weekly coach packet section.");
assert.match(page, /type="week"/, "Weekly coach packet should use a native week picker.");
assert.match(page, /WeeklyCoachPacketPrintButton/, "Weekly coach packet should expose a direct print button.");
assert.match(page, /Pendiente de pago/, "Coach packet should show a simple pending payment tag.");
assert.match(page, /Al corriente/, "Coach packet should show a simple current payment tag.");
assert.match(page, /3\+ faltas/, "Coach packet should show the compact absence follow-up tag.");
assert.match(page, /print:hidden/, "Non-packet report controls should be hidden from print output.");
assert.match(printButton, /window\.print\(\)/, "Print button should trigger the browser print flow.");

assert.match(query, /getPlayerAttendanceRiskByPlayerIds/, "Coach packet should reuse the attendance-risk summary.");
assert.match(query, /hasPendingPayment: boolean/, "Coach packet should expose only a boolean payment flag.");
assert.match(query, /charge_types\.code", "monthly_tuition"/, "Pending payment flag should be based on monthly tuition.");
assert.doesNotMatch(query, /pendingMonthCount|pendingAmount|amountOwed|balanceDue/, "Coach packet query should not expose financial detail fields.");

console.log("Weekly coach packet assertions passed.");
