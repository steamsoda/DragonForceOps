import React from "react";
import { createRoot } from "react-dom/client";
import { CoachDirectoryClient } from "../../src/components/coaches/coach-directory-client";
import type { CoachDirectory } from "../../src/lib/coaches/types";
const reader = location.search.includes("readonly");
const data: CoachDirectory = {
  canManage: !reader, canLifecycle: !reader,
  campuses: [{ id: "lv", name: "Linda Vista" }, { id: "co", name: "Contry" }],
  coaches: [
    { id: "a", firstName: "Ana", lastName: "Prueba", campusId: "lv", active: true, linked: true, email: "test@example.invalid", roles: ["coach", "front_desk"], protected: false, version: "v1", departureVersion: "d1", providerPending: false, tournaments: [{ squad: "2015 Azul", tournament: "Torneo de prueba", campusId: "lv", inherited: false }] },
    { id: "b", firstName: "Bruno", lastName: "Prueba", campusId: "co", active: true, linked: false, email: null, roles: [], protected: false, version: "v2", departureVersion: "d2", providerPending: false, tournaments: [] },
    { id: "c", firstName: "Carla", lastName: "Prueba", campusId: "lv", active: true, linked: false, email: null, roles: [], protected: false, version: "v3", departureVersion: "d3", providerPending: false, tournaments: [] },
  ],
  groups: [
    { id: "g1", name: "2015", program: "futbol_para_todos", status: "active", campusId: "lv", startTime: "16:00:00", endTime: "17:10:00", coaches: [{ coachId: "a", primary: true, linkId: "l1" }, { coachId: "c", primary: false, linkId: "l2" }], tournaments: [] },
    { id: "g2", name: "Selectivo 2016", program: "selectivo", status: "active", campusId: "co", startTime: "17:10:00", endTime: "18:20:00", coaches: [{ coachId: "a", primary: true, linkId: "l3" }], tournaments: [] },
    { id: "g3", name: "2020", program: "futbol_para_todos", status: "active", campusId: "lv", startTime: "16:00:00", endTime: "17:10:00", coaches: [], tournaments: [] },
  ],
};
data.groups[0].tournaments = [{ id: "s1", name: "2015 Heredado", tournament: "Copa local", campusId: "lv", mode: "inherited", sourceGroups: [{ groupId: "g1", coaches: data.groups[0].coaches }] }];
data.groups[2].tournaments = [{ id: "s3", name: "2020 Azul", tournament: "Copa local", campusId: "lv", mode: "inherited", sourceGroups: [{ groupId: "g3", coaches: [] }] }];
(window as any).__coachCommands = [];
createRoot(document.getElementById("root")!).render(<main className="mx-auto max-w-7xl p-5"><h1 className="mb-5 text-2xl font-semibold">Profesores</h1><CoachDirectoryClient data={data} /></main>);
