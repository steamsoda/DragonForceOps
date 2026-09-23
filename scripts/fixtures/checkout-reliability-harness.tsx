import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ExplicitCartDialog } from '../../src/components/caja/explicit-cart-dialog';
import { loadCartRecovery } from '../../src/lib/finance/explicit-cart-recovery';
import { state } from './checkout-reliability-mocks';
const id = '11111111-1111-4111-8111-111111111111';
function Harness({ form }: { form: FormData }) {
  const [open, setOpen] = useState(true);
  return open ? <ExplicitCartDialog actorId={id} enrollmentId={id} form={form} printerName="ISOLATED"
    onClose={() => setOpen(false)} onSaved={() => { state.saved++; state.events.push({ name: 'saved-ui', at: performance.now() }); }} /> : <h1>Cuenta</h1>;
}
async function mount() {
  let form = loadCartRecovery(id, id);
  const pending = await fetch('/recovery').then(r => r.json());
  if (!form && pending) { form = new FormData(); pending.fields.forEach(([k,v]: [string,string]) => form!.set(k,v)); form.set('recoverySnapshot', JSON.stringify(pending.snapshot)); }
  if (!form) { form = new FormData(); form.set('method', 'card'); form.set('amount', '700'); }
  createRoot(document.getElementById('root')!).render(<Harness form={form} />);
}
void mount();
