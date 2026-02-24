export const APP_ROLES = {
  DIRECTOR_ADMIN: "director_admin",
  ADMIN_RESTRICTED: "admin_restricted",
  COACH: "coach"
} as const;

export type AppRole = (typeof APP_ROLES)[keyof typeof APP_ROLES];
