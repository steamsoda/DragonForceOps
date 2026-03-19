export default function Loading() {
  return (
    <div className="p-6 space-y-4 animate-pulse">
      <div className="h-7 w-16 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="max-w-md space-y-3">
        <div className="h-10 rounded-lg bg-slate-200 dark:bg-slate-700" />
        <div className="h-10 rounded-lg bg-slate-100 dark:bg-slate-800" />
      </div>
    </div>
  );
}
