import type { PermissionContext } from "./permissions";

// Presentation capabilities never grant action, RPC, or database permissions.
export function directorPresentation(context: Pick<PermissionContext,
  "isDirectorReadOnly" | "isDirector" | "canViewFinancials"
>) {
  return {
    directorLayout: context.isDirector || context.isDirectorReadOnly,
    readOnly: context.isDirectorReadOnly,
    individualFinancials: context.isDirectorReadOnly || context.canViewFinancials,
    consolidatedFinancials: !context.isDirectorReadOnly && context.canViewFinancials,
  };
}

export function mayAutomaticallyApplyCajaCredit(context: Pick<PermissionContext,
  "isDirectorReadOnly" | "hasOperationalAccess"
> | null, canAccessEnrollment: boolean, debugWriteBlocked: boolean) {
  return Boolean(context && !context.isDirectorReadOnly && context.hasOperationalAccess &&
    canAccessEnrollment && !debugWriteBlocked);
}
