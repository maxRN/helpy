// Mock Work Map for the tutor, used until P3's real one exists (about hour 10).
// Mirrors the running example in the brief. Replace with deps.getWorkMapMarkdown().

export const MOCK_WORK_MAP = `# Work Map: supplier invoice processing (expert: Sabine, accounts payable)

## Steps
1. Open the next invoice from the queue.
2. Check the supplier against the approved supplier list.
3. Check amount and category.
4. Code the invoice to a cost center (step id: S4, field: cost_center). Default is opex (4711).
5. Check for a hold or a second approval.
6. Save and post.

## Guardrails (with Sabine's words)
- G1 (step S4) Equipment over EUR 5,000 is always capex (0400), never opex (4711).
  Sabine: "Equipment over 5,000 euros is always capex."
  Also: no asset number, no capex booking.
- G2 (step S5) A quarter-end invoice from a supplier known to double-bill is held, not posted.
  Sabine: "That supplier double-bills at every quarter-end, so I hold it until the controller releases it."
- G3 (step S5) Invoices from the Czech subsidiary need a second approval.
  Sabine: "Czech subsidiary always goes to a second approval."
- G4 (step S2) Unknown supplier: stop and ask the controller.
  Sabine: "If I don't know the supplier, I don't touch it. I ask the controller."

## Judgment calls
- J1 Re-coding opex to capex when the amount is over the limit (S4).
- J2 Holding an invoice that looks normal but has a double-billing history (S5).
- J3 Sending to second approval based on the sender, not the amount (S5).
`;
