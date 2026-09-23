export type PrintStatus = "idle" | "printing" | "unknown" | "sent" | "failed";
type Attempt = { status: PrintStatus; printer: string; pending: boolean; promise: Promise<void> };
const attempts = new Map<string, Attempt>();
const listeners = new Set<() => void>();
export const PRINT_WAIT_MS = 30000;

export function getPrintStatus(operationId: string): PrintStatus { return attempts.get(operationId)?.status ?? "idle"; }
export function subscribePrintStatus(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
const changed = () => { for (const listener of listeners) listener(); };

// A UI deadline cannot cancel a QZ request. Keep its printer locked until it settles,
// even after the dialog unmounts, to prevent a second concurrent paper dispatch.
export function runPrintAttempt(operationId: string, printer: string, action: () => Promise<void>): Promise<void> {
  if ([...attempts.values()].some(attempt => attempt.pending && attempt.printer === printer)
    || attempts.get(operationId)?.pending) return Promise.reject(new Error("print_in_progress"));
  // Bound completed history; unresolved transports must retain their lock.
  if (attempts.size >= 100) for (const [key, value] of attempts) {
    if (!value.pending) { attempts.delete(key); break; }
  }
  const attempt: Attempt = { status: "printing", printer, pending: true, promise: Promise.resolve() };
  attempts.set(operationId, attempt);
  attempt.promise = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      attempt.status = "unknown"; changed(); reject(new Error("print_delivery_unknown"));
    }, PRINT_WAIT_MS);
    Promise.resolve().then(action).then(() => {
      clearTimeout(timer); attempt.pending = false; attempt.status = "sent"; changed(); resolve();
    }, () => {
      clearTimeout(timer); attempt.pending = false;
      // A late failure does not prove the first paper dispatch never arrived.
      if (attempt.status !== "unknown") attempt.status = "failed";
      changed(); reject(new Error(attempt.status === "unknown" ? "print_delivery_unknown" : "print_failed"));
    });
  });
  changed();
  return attempt.promise;
}

export function isPrintPending(operationId: string) { return attempts.get(operationId)?.pending ?? false; }
export function isPrinterBusy(printer: string) { return [...attempts.values()].some(attempt => attempt.pending && attempt.printer === printer); }
