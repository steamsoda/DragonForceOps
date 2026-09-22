import { z } from "zod";

const money = z.number().finite().min(0).max(9999999999.99)
  .refine((value) => Math.round(value * 100) / 100 === value);
const positiveMoney = money.refine((value) => value > 0);
const cents = (value: number) => Math.round(value * 100);
const amount = (value: number) => value / 100;
const uuid = z.string().uuid().transform((value) => value.toLowerCase());
const method = z.enum(["cash", "transfer", "card", "stripe_360player", "other"]);

// This is a server-resolved price/balance snapshot, never an authorization token.
const snapshotSchema = z.object({
  enrollmentId: uuid,
  currency: z.string().regex(/^[A-Z]{3}$/),
  availableCredit: money,
  lines: z.array(z.object({
    key: uuid,
    chargeId: uuid.nullable(),
    description: z.string().min(1).max(1000),
    pending: positiveMoney,
    due: positiveMoney,
    kind: z.enum(["ordinary", "copa_tigres"]),
    creditAllowed: z.boolean(),
  }).strict()).min(1).max(100),
}).strict();
const selectionSchema = z.array(z.object({ key: uuid, amount: positiveMoney }).strict()).max(100);
const paymentsSchema = z.array(z.object({ method, amount: positiveMoney }).strict()).max(2);
const expectedLineSchema = z.object({
  key: uuid, chargeId: uuid.nullable(), pending: positiveMoney, due: positiveMoney,
  kind: z.enum(["ordinary", "copa_tigres"]), creditAllowed: z.boolean(),
}).strict();
const commandSchema = z.object({
  requestId: uuid,
  enrollmentId: uuid,
  currency: z.string().regex(/^[A-Z]{3}$/),
  expectedAvailableCredit: money,
  expectedLines: z.array(expectedLineSchema).min(1).max(100),
  creditSelection: selectionSchema,
  payments: paymentsSchema,
}).strict();

export function parseExplicitCheckoutCommand(input: unknown): ExplicitCheckoutCommand {
  return parse(commandSchema, input);
}

export type ExplicitCheckoutSnapshot = z.infer<typeof snapshotSchema>;
export type ExplicitCheckoutSelection = z.infer<typeof selectionSchema>;
export type ExplicitCheckoutCommand = z.infer<typeof commandSchema>;
export type ExplicitCheckoutQuote = {
  currency: string;
  grossAmount: number;
  creditApplied: number;
  moneyDue: number;
  creditRemaining: number;
  selectedPendingAfter: number;
  lines: Array<ExplicitCheckoutSnapshot["lines"][number] & {
    creditApplied: number; moneyDue: number; pendingAfter: number;
  }>;
};
export type ExplicitCheckoutPlan = {
  command: ExplicitCheckoutCommand;
  quote: ExplicitCheckoutQuote;
  paymentAllocations: Array<{ paymentIndex: number; key: string; amount: number }>;
};
export type ExplicitCheckoutReceipt = {
  operationId: string;
  enrollmentId: string;
  actorId: string;
  occurredAt: string;
  paidAt: string;
  playerName: string;
  campusName: string;
  operatorCampusName: string;
  currency: string;
  moneyReceived: number;
  creditApplied: number;
  creditRemaining: number;
  pendingChargesTotal: number;
  sessionWarning: boolean;
  lines: Array<{
    key: string; chargeId: string; description: string;
    pendingBefore: number; creditApplied: number; moneyReceived: number; pendingAfter: number;
  }>;
  payments: Array<{ id: string; folio: string | null; method: z.infer<typeof method>; amount: number }>;
};

export class ExplicitCheckoutError extends Error {
  constructor(public readonly code: "invalid_checkout" | "checkout_changed" | "invalid_credit_selection"
    | "copa_tigres_no_credit" | "invalid_copa_installment" | "payment_total_mismatch") {
    super(code);
    this.name = "ExplicitCheckoutError";
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ExplicitCheckoutError("invalid_checkout");
  return result.data;
}

function sorted<T extends { key: string }>(lines: T[]): T[] {
  return [...lines].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}

export function quoteExplicitCheckout(snapshotInput: ExplicitCheckoutSnapshot,
  selectionInput: ExplicitCheckoutSelection = []): ExplicitCheckoutQuote {
  const snapshot = parse(snapshotSchema, snapshotInput);
  const selection = parse(selectionSchema, selectionInput);
  const keys = new Set(snapshot.lines.map((line) => line.key));
  const chargeIds = snapshot.lines.flatMap((line) => line.chargeId ? [line.chargeId] : []);
  if (keys.size !== snapshot.lines.length || new Set(chargeIds).size !== chargeIds.length
    || snapshot.lines.filter((line) => line.kind === "copa_tigres").length > 1) {
    throw new ExplicitCheckoutError("invalid_checkout");
  }
  const selected = new Map(selection.map((line) => [line.key, cents(line.amount)]));
  if (selected.size !== selection.length || selection.some((line) => !keys.has(line.key))) {
    throw new ExplicitCheckoutError("invalid_credit_selection");
  }
  let gross = 0;
  let credit = 0;
  let pendingAfter = 0;
  const lines = sorted(snapshot.lines).map((line) => {
    const due = cents(line.due);
    const pending = cents(line.pending);
    const applied = selected.get(line.key) ?? 0;
    if (due > pending) throw new ExplicitCheckoutError("invalid_checkout");
    if (line.kind === "copa_tigres") {
      if (snapshot.currency !== "MXN" || !((pending === 125000 && (due === 60000 || due === 125000))
        || (pending === 65000 && due === 65000))) {
        throw new ExplicitCheckoutError("invalid_copa_installment");
      }
      // Product configuration cannot accidentally opt Copa into credit usage.
      if (applied) throw new ExplicitCheckoutError("copa_tigres_no_credit");
    }
    if (applied > due || (applied > 0 && !line.creditAllowed)) {
      throw new ExplicitCheckoutError("invalid_credit_selection");
    }
    gross += due;
    credit += applied;
    pendingAfter += pending - due;
    return { ...line, creditApplied: amount(applied), moneyDue: amount(due - applied), pendingAfter: amount(pending - due) };
  });
  if (credit > cents(snapshot.availableCredit)) throw new ExplicitCheckoutError("invalid_credit_selection");
  if (gross > 999999999999 || pendingAfter > 999999999999) throw new ExplicitCheckoutError("invalid_checkout");
  return { currency: snapshot.currency, grossAmount: amount(gross), creditApplied: amount(credit),
    moneyDue: amount(gross - credit), creditRemaining: amount(cents(snapshot.availableCredit) - credit),
    selectedPendingAfter: amount(pendingAfter), lines };
}

export function prepareExplicitCheckout(snapshot: ExplicitCheckoutSnapshot, input: {
  requestId: string;
  creditSelection?: ExplicitCheckoutSelection;
  payments: ExplicitCheckoutCommand["payments"];
}): ExplicitCheckoutPlan {
  const current = parse(snapshotSchema, snapshot);
  const selection = parse(selectionSchema, input.creditSelection ?? []);
  const quote = quoteExplicitCheckout(current, selection);
  const payments = parse(paymentsSchema, input.payments);
  const received = payments.reduce((sum, payment) => sum + cents(payment.amount), 0);
  if (received !== cents(quote.moneyDue)) throw new ExplicitCheckoutError("payment_total_mismatch");
  const command = parse(commandSchema, {
    requestId: input.requestId, enrollmentId: current.enrollmentId, currency: current.currency,
    expectedAvailableCredit: current.availableCredit,
    expectedLines: quote.lines.map(({ key, chargeId, pending, due, kind, creditAllowed }) =>
      ({ key, chargeId, pending, due, kind, creditAllowed })),
    creditSelection: sorted(selection), payments,
  });
  // Keep tender order intact. Allocate Copa first, then the canonical ordinary lines.
  const targets = [...quote.lines.filter((line) => line.kind === "copa_tigres"),
    ...quote.lines.filter((line) => line.kind !== "copa_tigres")];
  const remaining = targets.map((line) => cents(line.moneyDue));
  const paymentAllocations: ExplicitCheckoutPlan["paymentAllocations"] = [];
  payments.forEach((payment, paymentIndex) => {
    let left = cents(payment.amount);
    targets.forEach((line, index) => {
      const applied = Math.min(left, remaining[index]);
      if (applied) paymentAllocations.push({ paymentIndex, key: line.key, amount: amount(applied) });
      left -= applied;
      remaining[index] -= applied;
    });
  });
  return { command, quote, paymentAllocations };
}

// The transaction must also recheck this snapshot under row locks. A match here
// does not replace current role/campus/source-credit checks or DB idempotency.
export function validateExplicitCheckout(snapshot: ExplicitCheckoutSnapshot, input: unknown): ExplicitCheckoutPlan {
  const command = parse(commandSchema, input);
  const parsedSnapshot = parse(snapshotSchema, snapshot);
  const currentLines = sorted(parsedSnapshot.lines).map(({ key, chargeId, pending, due, kind, creditAllowed }) =>
    ({ key, chargeId, pending, due, kind, creditAllowed }));
  if (command.enrollmentId !== parsedSnapshot.enrollmentId || command.currency !== parsedSnapshot.currency
    || cents(command.expectedAvailableCredit) !== cents(parsedSnapshot.availableCredit)
    || JSON.stringify(sorted(command.expectedLines)) !== JSON.stringify(currentLines)) {
    throw new ExplicitCheckoutError("checkout_changed");
  }
  return prepareExplicitCheckout(parsedSnapshot, {
    requestId: command.requestId, creditSelection: command.creditSelection, payments: command.payments,
  });
}
