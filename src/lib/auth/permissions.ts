import type { AppRole } from "@/lib/auth/roles";
import { APP_ROLES } from "@/lib/auth/roles";

export function canViewFinancials(role: AppRole): boolean {
  return role === APP_ROLES.DIRECTOR_ADMIN || role === APP_ROLES.ADMIN_RESTRICTED;
}

export function canManageAll(role: AppRole): boolean {
  return role === APP_ROLES.DIRECTOR_ADMIN;
}
