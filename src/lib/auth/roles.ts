export const APP_ROLES = {
  SUPERADMIN: "superadmin",
  DIRECTOR_ADMIN: "director_admin",
  DIRECTOR_DEPORTIVO: "director_deportivo",
  NUTRITIONIST: "nutritionist",
  FRONT_DESK: "front_desk",
  COACH: "coach"
} as const;

export type AppRole = (typeof APP_ROLES)[keyof typeof APP_ROLES];

export const DIRECTOR_OR_ABOVE = [APP_ROLES.SUPERADMIN, APP_ROLES.DIRECTOR_ADMIN] as const;
export const SPORTS_STAFF_OR_ABOVE = [
  APP_ROLES.SUPERADMIN,
  APP_ROLES.DIRECTOR_ADMIN,
  APP_ROLES.DIRECTOR_DEPORTIVO,
] as const;

export const NUTRITION_STAFF_OR_ABOVE = [
  APP_ROLES.SUPERADMIN,
  APP_ROLES.DIRECTOR_ADMIN,
  APP_ROLES.NUTRITIONIST,
] as const;
