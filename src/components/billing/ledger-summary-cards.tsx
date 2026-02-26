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
      label: "Saldo",
      value: formatMoney(balance, currency)
    }
  ];

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {cards.map((card) => (
        <article key={card.label} className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{card.label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{card.value}</p>
        </article>
      ))}
    </div>
  );
}

