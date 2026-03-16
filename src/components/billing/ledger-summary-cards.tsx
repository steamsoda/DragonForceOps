type LedgerSummaryCardsProps = {
  currency: string;
  totalCharges: number;
  totalPayments: number;
  balance: number;
};

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

export function LedgerSummaryCards({ currency, totalCharges, totalPayments, balance }: LedgerSummaryCardsProps) {
  const balanceLabel = balance > 0 ? "Saldo pendiente" : balance < 0 ? "Crédito en cuenta" : "Al corriente";
  const balanceValue = balance !== 0 ? formatMoney(Math.abs(balance), currency) : "—";

  const cards = [
    {
      label: "Total de cargos",
      value: formatMoney(totalCharges, currency)
    },
    {
      label: "Total de pagos",
      value: formatMoney(totalPayments, currency)
    },
    {
      label: balanceLabel,
      value: balanceValue
    }
  ];

  const balanceColor = balance > 0 ? "text-rose-600" : balance < 0 ? "text-emerald-600" : "text-slate-900 dark:text-slate-100";

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {cards.map((card, i) => (
        <article key={card.label} className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{card.label}</p>
          <p className={`mt-2 text-2xl font-semibold ${i === 2 ? balanceColor : "text-slate-900 dark:text-slate-100"}`}>{card.value}</p>
        </article>
      ))}
    </div>
  );
}

