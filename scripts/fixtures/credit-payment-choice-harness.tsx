import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReadOnlyProvider } from '../../src/components/auth/read-only-controls';
import { CreditPaymentChoice } from '../../src/components/caja/credit-payment-choice';

const fixture = { clicks: 0, update: (_: { available: number | null; disabled?: boolean; readOnly?: boolean }) => {} };
(window as any).fixture = fixture;
function Harness() {
  const [state, setState] = useState<{ available: number | null; disabled?: boolean; readOnly?: boolean }>({ available: null });
  fixture.update = setState;
  return <ReadOnlyProvider readOnly={state.readOnly ?? false}>
    <main style={{ maxWidth: 460, padding: 16 }}>
      <h2>Metodo</h2>
      <CreditPaymentChoice available={state.available} currency="MXN" disabled={state.disabled ?? false}
        onChoose={() => { fixture.clicks++; }} />
    </main>
  </ReadOnlyProvider>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
