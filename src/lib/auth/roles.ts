export const APP_ROLES = {
  SUPERADMIN: "superadmin",
  DIRECTOR_ADMIN: "director_admin",
FRONT_DESK: "front_desk",
  COACH: "coach"
} as const;

export type AppRole = (typeof APP_ROLES)[keyof typeof APP_ROLES];

export const DIRECTOR_OR_ABOVE = [APP_ROLES.SUPERADMIN, APP_ROLES.DIRECTOR_ADMIN] as const;
