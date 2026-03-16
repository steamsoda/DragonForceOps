/**
 * Bulk add dark: variants to Tailwind class strings across source files.
 * Idempotent — skips files that already have dark: classes in a given string.
 *
 * Run: node scripts/add-dark-mode.mjs
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

// Map of exact class tokens → their dark-mode counterpart
// Order matters: more-specific first so bg-slate-100 is matched before bg-slate-10x
const REPLACEMENTS = [
  // Backgrounds
  ["bg-white", "dark:bg-slate-900"],
  ["bg-slate-50", "dark:bg-slate-800"],
  ["bg-slate-100", "dark:bg-slate-800"],
  ["bg-slate-200", "dark:bg-slate-700"],
  // Borders
  ["border-slate-200", "dark:border-slate-700"],
  ["border-slate-300", "dark:border-slate-600"],
  ["divide-slate-200", "dark:divide-slate-700"],
  // Text
  ["text-slate-900", "dark:text-slate-100"],
  ["text-slate-800", "dark:text-slate-200"],
  ["text-slate-700", "dark:text-slate-300"],
  ["text-slate-600", "dark:text-slate-400"],
  ["text-slate-500", "dark:text-slate-400"],
  // Hover
  ["hover:bg-slate-50", "dark:hover:bg-slate-800"],
  ["hover:bg-slate-100", "dark:hover:bg-slate-700"],
  ["hover:text-slate-900", "dark:hover:text-slate-100"],
  ["hover:text-slate-700", "dark:hover:text-slate-300"],
  // Rings / focus
  ["ring-slate-200", "dark:ring-slate-700"],
  // Placeholders
  ["placeholder-slate-400", "dark:placeholder-slate-500"],
];

// Files to skip (already handled manually)
const SKIP = new Set([
  "src/app/layout.tsx",
  "src/app/(protected)/layout.tsx",
  "src/components/ui/app-sidebar.tsx",
  "src/components/ui/page-shell.tsx",
  "src/components/ui/theme-toggle.tsx",
]);

function walk(dir, base = dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = full.replace(base + "/", "").replace(base + "\\", "").replace(/\\/g, "/");
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      results.push(...walk(full, base));
    } else if (/\.(tsx|ts)$/.test(entry) && !entry.endsWith(".d.ts")) {
      results.push({ full, rel });
    }
  }
  return results;
}

const cwd = process.cwd();
const files = walk(join(cwd, "src"), cwd)
  .filter(({ rel }) => !SKIP.has(rel))
  .map(({ full }) => full);

let filesChanged = 0;

for (const file of files) {
  const original = readFileSync(file, "utf-8");
  const relDisplay = file.replace(cwd, "").replace(/\\/g, "/");
  let updated = original;

  for (const [base, darkVariant] of REPLACEMENTS) {
    // Match class token as a whole word inside a class string.
    // We look for: `base` NOT already preceded by `dark:` and NOT already
    // followed by ` dark:...` that includes this same base.
    // Strategy: for each occurrence of `base`, check if `darkVariant` is
    // already present nearby (within 120 chars after it in the same string).
    // Simple replacement: only replace `base` tokens not already paired.
    const regex = new RegExp(`(?<![\\w:-])${escapeRegex(base)}(?![\\w-])`, "g");
    updated = updated.replace(regex, (match, offset, str) => {
      // Look ahead up to 200 chars for the dark variant
      const window = str.slice(offset, offset + 200);
      if (window.includes(darkVariant)) return match; // already there
      return `${match} ${darkVariant}`;
    });
  }

  if (updated !== original) {
    writeFileSync(file, updated, "utf-8");
    console.log("✓", relDisplay);
    filesChanged++;
  }
}

console.log(`\nDone. ${filesChanged} file(s) updated.`);

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
