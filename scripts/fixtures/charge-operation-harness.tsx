import React from "react";
import { createRoot } from "react-dom/client";
import { ChargesLedgerTable } from "../../src/components/billing/charges-ledger-table";
import { ReadOnlyProvider } from "../../src/components/auth/read-only-controls";

const base={manualPriceOverride:false,manualPriceOverrideReason:null,manualPriceOverrideAt:null,
  typeCode:"cup",typeName:"Torneo",currency:"MXN",dueDate:null,periodMonth:null,createdAt:"2026-09-22T12:00:00Z",
  creditAppliedAmount:0,settledAt:null,paymentReferences:[],creditReferences:[],cashRefund:null};
const rows=[
  {...base,id:"11111111-1111-4111-8111-111111111111",description:"Cargo sin pagar",status:"pending",amount:400,allocatedAmount:0,pendingAmount:400},
  {...base,id:"22222222-2222-4222-8222-222222222222",description:"Cargo parcialmente pagado",status:"pending",amount:400,allocatedAmount:100,pendingAmount:300},
  {...base,id:"33333333-3333-4333-8333-333333333333",description:"Cargo cancelado",status:"void",amount:400,allocatedAmount:0,pendingAmount:0},
];
createRoot(document.getElementById("root")!).render(<ReadOnlyProvider readOnly={location.search.includes("readonly")}>
  <main className="p-4"><ChargesLedgerTable rows={rows} enrollmentId="11111111-1111-4111-8111-111111111111"
    printerName="ISOLATED TEST" voidChargeAction={async()=>{throw new Error("No financial writes in fixture");}} /></main>
</ReadOnlyProvider>);
