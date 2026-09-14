import type { PlayerRosterGroupsData, PlayerRosterGroupRow, PlayerRosterGroupSection } from "@/lib/queries/player-roster-groups";

export type DirectorReadOnlyRosterRow = Omit<PlayerRosterGroupRow, "tuition">;
export type DirectorReadOnlyRosterSection = Omit<PlayerRosterGroupSection, "rows"> & { rows: DirectorReadOnlyRosterRow[] };
export type DirectorReadOnlyRosterData = Omit<PlayerRosterGroupsData, "months" | "sections" | "canEditTrainingGroups"> & {
  canViewFinancials: false;
  canEditTrainingGroups: false;
  sections: DirectorReadOnlyRosterSection[];
};
