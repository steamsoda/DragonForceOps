import React from 'react';
import { createRoot } from 'react-dom/client';
import { ExplicitCartDialog } from '../../src/components/caja/explicit-cart-dialog';
import { loadCartRecovery } from '../../src/lib/finance/explicit-cart-recovery';
const form = new FormData(); form.set('method', 'cash'); form.set('amount', '1300');
async function mount() {
  const stored = await fetch('/test-recovery').then(response => response.json());
  let pending = loadCartRecovery('11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111');
  if (stored) { pending = new FormData(); stored.fields.forEach(([key,value]: [string,string]) => pending!.set(key,value)); pending.set('recoverySnapshot',JSON.stringify(stored.snapshot)); }
  createRoot(document.getElementById('root')!).render(<ExplicitCartDialog
  actorId="11111111-1111-4111-8111-111111111111"
  enrollmentId="11111111-1111-4111-8111-111111111111" form={pending ?? form} printerName="Test"
  onClose={() => {}} onSaved={() => {}} />);
}
void mount();
