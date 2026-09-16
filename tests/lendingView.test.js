import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Lending from '@/components/views/Lending';
import { ToastProvider } from '@/components/ui/Toast';
import { buildDemoLedger } from '@/lib/demoData';

// A one-shot server render of the Lending screen, in the same spirit as
// tests/helpers/callHook.js: no jsdom, no DOM testing library, just enough to
// prove the screen renders and that the numbers it prints are the ones the
// helpers worked out. It also enforces the repo rule that a view takes its
// store as a prop — a view reaching for useFinanceStore would need a Supabase
// client and would blow up right here.

const TODAY = '2026-09-15';

function render(store) {
  return renderToStaticMarkup(
    React.createElement(ToastProvider, null, React.createElement(Lending, { store }))
  );
}

/** A store-shaped object: only the fields this view is entitled to read. */
function storeFrom(ledger) {
  return {
    people: ledger.people,
    lendingEntries: ledger.lendingEntries,
    addPerson: async () => {},
    updatePerson: async () => {},
    deletePerson: async () => {},
    addLendingEntry: async () => {},
    updateLendingEntry: async () => {},
    deleteLendingEntry: async () => {},
  };
}

describe('the Lending screen renders from the demo ledger', () => {
  const ledger = buildDemoLedger(TODAY);
  const html = render(storeFrom(ledger));

  it('renders every tracked person', () => {
    for (const person of ledger.people) {
      expect(html).toContain(person.name);
    }
  });

  it('states each balance in the right direction', () => {
    // Aarav was lent 12,000 and paid 4,000 back.
    expect(html).toContain('Aarav owes you ₹8,000');
    // Riya covered 6,500 and has been paid 2,500 of it.
    expect(html).toContain('You owe Riya ₹4,000');
    // Kabir is square.
    expect(html).toContain('All settled');
  });

  it('shows both headline figures rather than one netted number', () => {
    expect(html).toContain('owed to you');
    expect(html).toContain('you owe');
    expect(html).toContain('₹11,000');   // 8,000 from Aarav + 3,000 from Meera
    expect(html).toContain('₹6,000');    // 4,000 to Riya + 2,000 to Dev
  });

  it('says plainly that this money is kept out of the rest of the app', () => {
    expect(html).toContain('completely apart');
  });
});

describe('the screen holds up with nothing in it', () => {
  it('renders an empty state instead of crashing', () => {
    const html = render(storeFrom({ people: [], lendingEntries: [] }));
    expect(html).toContain('Add whoever you lend to or borrow from');
    expect(html).toContain('Add a person first');
  });
});

describe('an entry whose person was deleted still shows its money', () => {
  it('keeps a row under the name frozen on the entry', () => {
    const html = render(
      storeFrom({
        people: [],
        lendingEntries: [
          { id: 'x', personId: null, person: 'Meera', direction: 'out', amount: 3000, date: '2026-09-01', note: '', method: 'UPI' },
        ],
      })
    );
    expect(html).toContain('Meera owes you ₹3,000');
    expect(html).toContain('person removed');
  });
});
