"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavSection = {
  label: string;
  items: Array<{ href: string; label: string }>;
};

export function AppSidebar({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();

  return (
    <aside className="fixed bottom-0 left-0 top-14 z-20 hidden w-48 overflow-y-auto border-r border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 md:block">
      <nav className="space-y-5 px-3 py-4">
        {sections.map((section) => (
          <div key={section.label}>
            <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/" && pathname.startsWith(item.href + "/"));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      prefetch={false}
                      className={`flex items-center rounded-md px-2 py-1.5 text-sm transition-colors ${
                        isActive
                          ? "bg-portoBlue/10 font-medium text-portoBlue dark:bg-portoBlue/20 dark:text-blue-300"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
