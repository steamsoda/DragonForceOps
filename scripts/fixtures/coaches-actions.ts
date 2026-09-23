export async function manageCoachAction(command: unknown) {
  (window as any).__coachCommands.push(command);
  if ((window as any).__coachFail) return { ok: false, message: "Las asignaciones cambiaron. Actualiza y revisa nuevamente." };
  return { ok: true, providerPending: false };
}
