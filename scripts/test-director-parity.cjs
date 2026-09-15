const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function load(file, modules = {}) {
  const m = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { module: m, exports: m.exports, require: id => {
    if (id in modules) return modules[id];
    if (["react", "react/jsx-runtime"].includes(id)) return require(id);
    throw Error(`Unexpected dependency: ${id}`);
  }, Intl, URLSearchParams });
  return m.exports;
}

const policy = load("src/lib/auth/director-presentation.ts");
const readonly = { isDirectorReadOnly: true, isDirector: false, canViewFinancials: false, hasOperationalAccess: false };
assert.equal(policy.directorPresentation(readonly).individualFinancials, true);
assert.equal(policy.directorPresentation(readonly).consolidatedFinancials, false);
assert.equal(policy.directorPresentation({ ...readonly, isDirector: true, canViewFinancials: true }).consolidatedFinancials, false);
assert.equal(policy.directorPresentation({ ...readonly, isDirectorReadOnly: false, isDirector: true, canViewFinancials: true }).consolidatedFinancials, true);
for (const context of [null, readonly, { ...readonly, hasOperationalAccess: true }]) {
  assert.equal(policy.mayAutomaticallyApplyCajaCredit(context, true, false), false);
}
const staff = { isDirectorReadOnly: false, hasOperationalAccess: true };
assert.equal(policy.mayAutomaticallyApplyCajaCredit(staff, true, false), true);
assert.equal(policy.mayAutomaticallyApplyCajaCredit(staff, false, false), false);
assert.equal(policy.mayAutomaticallyApplyCajaCredit(staff, true, true), false);

const presentation = load("src/lib/queries/dashboard-presentation.ts");
const operational = { activeEnrollments: 25, newEnrollmentsThisMonth: 3, bajasThisMonth: 1,
  attendanceRateThisWeek: 80, attendanceRecordsThisWeek: 40, selectedMonth: "2026-09",
  attendedPlayersThisMonth: 20, playersWithoutAttendanceThisMonth: 5, enrollmentsWithBalance: 4 };
const contaminated = { ...operational, pendingBalance: 87654321, paymentsToday: 87654321,
  paymentsThisMonth: 87654321, paymentsByMethod: [{ total: 87654321 }], secret: "not-for-browser" };
const projected = presentation.restrictedDashboard(contaminated);
assert.equal(projected.enrollmentsWithBalance, 4);
assert.equal(projected.pendingBalance, null);
assert.equal(projected.paymentsByMethod, null);
assert.doesNotMatch(JSON.stringify(projected), /87654321|not-for-browser/);
assert.equal(presentation.restrictedDashboard({ ...operational, enrollmentsWithBalance: undefined }).enrollmentsWithBalance, null);

const controls = load("src/components/auth/read-only-controls.tsx");
function button(readOnly, disabled = false) {
  return renderToStaticMarkup(React.createElement(controls.ReadOnlyProvider, { readOnly },
    React.createElement(controls.WriteButton, { disabled, type: "submit" }, "Guardar")));
}
assert.match(button(true), /disabled=""/);
assert.match(button(true), /title="Solo lectura"/);
assert.doesNotMatch(button(false), /disabled=""/);
assert.match(button(false, true), /disabled=""/);

const trend = load("src/components/dashboard/trend-card.tsx");
const trendHtml = renderToStaticMarkup(React.createElement(trend.TrendCard, {
  label: "Tendencia", currentValue: "\u2014", previousValue: "\u2014",
  currentRaw: null, previousRaw: null, description: "Detalle",
}));
assert.doesNotMatch(trendHtml, /0\.0%|NaN|Infinity/);
assert.match(trendHtml, /\u2014/);

const chartStub = ({ children }) => React.createElement("div", null, children);
const charts = load("src/components/dashboard/charts.tsx", { recharts: new Proxy({}, { get: () => chartStub }) });
const restrictedChart = renderToStaticMarkup(React.createElement(charts.PaymentsByMethodBar, { data: null }));
assert.match(restrictedChart, /restringido/);
assert.doesNotMatch(restrictedChart, /Sin cobros/);
const noPayments = renderToStaticMarkup(React.createElement(charts.PaymentsByMethodBar, { data: [] }));
assert.match(noPayments, /Sin cobros/);

const kpi = load("src/components/dashboard/kpi-card.tsx", {
  "next/link": { default: ({ children, href }) => React.createElement("a", { href }, children) },
});
const view = load("src/components/dashboard/dashboard-view.tsx", {
  "@/components/ui/page-shell": { PageShell: ({ title, children }) => React.createElement("main", null, React.createElement("h1", null, title), children) },
  "@/lib/queries/dashboard-presentation": presentation,
  "@/components/dashboard/dashboard-filters": { DashboardFilters: () => React.createElement("nav", null, "Filtros") },
  "@/components/dashboard/kpi-card": kpi,
  "@/components/dashboard/trend-card": trend,
  "@/components/dashboard/charts": charts,
});
const props = { campuses: [], selectedCampusId: "" };
const readonlyHtml = renderToStaticMarkup(React.createElement(view.DashboardView, { ...props, dashboard: projected }));
for (const label of ["Saldo pendiente", "Pagos de hoy", "Pagos del mes", "360Player", "Tendencia de pagos", "Tendencia de cargos", "Asistencia semana"]) {
  assert.ok(readonlyHtml.includes(label), `Read-only must keep the Director panel: ${label}`);
}
assert.doesNotMatch(readonlyHtml, /87,654,321|87654321|not-for-browser|NaN/);
assert.match(readonlyHtml, /dashboard\/new-enrollments/);

const page = fs.readFileSync("src/app/(protected)/dashboard/page.tsx", "utf8");
const readPage = fs.readFileSync("src/app/(protected)/dashboard/nonfinancial.tsx", "utf8");
assert.match(page, /<DashboardView/);
assert.match(readPage, /<DashboardView/);
assert.doesNotMatch(readPage, /getDashboardData|createAdminClient/);
console.log("PASS: selective financial presentation, deny-first credit application, read-only controls, dashboard projection and restricted chart/trend rendering.");
