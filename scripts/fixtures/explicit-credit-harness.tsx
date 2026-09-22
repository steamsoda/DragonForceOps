import React from "react";
import { createRoot } from "react-dom/client";
import { ExplicitCreditPanel } from "../../src/components/caja/explicit-credit-panel";

createRoot(document.getElementById("root")!).render(<main className="mx-auto max-w-5xl p-6">
  <h1 className="mb-4 text-xl font-semibold">Caja</h1>
  <ExplicitCreditPanel enrollmentId="11111111-1111-4111-8111-111111111111" printerName="Test printer" />
</main>);
