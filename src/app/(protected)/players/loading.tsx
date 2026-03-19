export default function Loading() {
  return (
    <div className="p-6 space-y-4 animate-pulse">
      <div className="h-7 w-32 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="flex gap-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-9 w-28 rounded bg-slate-200 dark:bg-slate-700" />
        ))}
      </div>
      <div className="rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="h-10 bg-slate-100 dark:bg-slate-800" />
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-12 border-t border-slate-100 dark:border-slate-800 flex items-center px-4 gap-4">
            <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-700" />
            <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-700" />
            <div className="h-4 w-20 rounded bg-slate-200 dark:bg-slate-700" />
          </div>
        ))}
      </div>
    </div>
  );
}
