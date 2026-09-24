import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ExplicitCartDialog } from '../../src/components/caja/explicit-cart-dialog';
import { loadCartRecovery } from '../../src/lib/finance/explicit-cart-recovery';
import { state } from './checkout-reliability-mocks';
import { CheckoutReceiptPanel, type SavedCheckout } from '../../src/components/caja/checkout-receipt-panel';
import { prepareFastCheckoutForm } from '../../src/lib/finance/fast-checkout';
import { snapshot } from './checkout-reliability-mocks';
const id = '11111111-1111-4111-8111-111111111111';
const fast = new URLSearchParams(location.search).has('fast');
function Harness({ form }: { form: FormData }) {
  const [open, setOpen] = useState(true);
  const [started, setStarted] = useState(!fast || form.has('recoverySnapshot'));
  const [saved, setSaved] = useState<SavedCheckout | null>(null);
  if (fast && !started) return <button onClick={() => setStarted(true)}>Cobrar todo</button>;
  if (fast && saved && open) return <CheckoutReceiptPanel saved={saved} printerName="ISOLATED"
    onBack={() => setOpen(false)} onNext={() => setOpen(false)} />;
  return open ? <ExplicitCartDialog actorId={id} enrollmentId={id} form={form} printerName="ISOLATED"
    onComplete={fast ? setSaved : undefined}
    onClose={() => setOpen(false)} onSaved={() => { state.saved++; state.events.push({ name: 'saved-ui', at: performance.now() }); }} /> : <h1>Cuenta</h1>;
}
async function mount() {
  let form = loadCartRecovery(id, id);
  const pending = await fetch('/recovery').then(r => r.json());
  if (!form && pending) { form = new FormData(); pending.fields.forEach(([k,v]: [string,string]) => form!.set(k,v)); form.set('recoverySnapshot', JSON.stringify(pending.snapshot)); }
  if (!form) {
    form = new FormData(); form.set('method', 'card'); form.set('amount', '700');
    if (fast) form = prepareFastCheckoutForm(id, snapshot, form, crypto.randomUUID());
  }
  createRoot(document.getElementById('root')!).render(<Harness form={form} />);
}
void mount();
