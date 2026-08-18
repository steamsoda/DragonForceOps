import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const cajaActions = await readFile("src/server/actions/caja.ts", "utf8");
const cajaClient = await readFile("src/components/caja/caja-client.tsx", "utf8");

assert.match(cajaActions, /function canUseCajaCatalogException[\s\S]*context\?\.isDirector \|\| context\?\.isFrontDesk/);
assert.match(cajaActions, /includeEligibilityExceptions && canUseCajaCatalogException/);
assert.match(cajaActions, /canAccessEnrollmentRecord\(enrollmentId, permissionContext\)/);
assert.match(cajaActions, /catalog_exception_confirmation_required/);
assert.match(cajaActions, /catalogException && isTuition[\s\S]*catalog_exception_forbidden/);
assert.match(cajaActions, /getConfiguredExceptionPriceOptions/);
assert.match(cajaActions, /configuredExceptionPrices\.some\(\(option\) => Math\.abs\(option - amount\) < 0\.009\)/);
assert.match(cajaActions, /charge\.created\.catalog_exception/);
assert.match(cajaActions, /training_group_matched: productMatchesTrainingGroup/);
assert.match(cajaActions, /if \(item\.catalogException\) chargeForm\.set\("catalogException", "1"\)/);
assert.match(cajaActions, /if \(item\.exceptionConfirmed\) chargeForm\.set\("exceptionConfirmed", "1"\)/);
assert.match(cajaActions, /syncPaidCompetitionSignupsForCharges\([\s\S]*allAllocatedCharges/);

assert.match(cajaClient, /Mostrar catálogo completo/);
assert.match(cajaClient, /Excepción de elegibilidad/);
assert.match(cajaClient, /Precio configurado/);
assert.match(cajaClient, /Confirmar producto fuera de elegibilidad/);
assert.match(cajaClient, /Confirmo que este jugador fue autorizado como excepcion/);
assert.match(cajaClient, /disabled=!\{exceptionAcknowledged\}|disabled=\{!exceptionAcknowledged\}/);
assert.match(cajaClient, /Si el cargo queda pagado por completo, la inscripcion al torneo se registrara normalmente/);

console.log("Caja full-catalog exception assertions passed.");
