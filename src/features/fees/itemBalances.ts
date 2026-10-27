import { AppError } from '../../lib/errors';

export type ItemAmount = { invoiceItemId: string; description: string; amountNgn: number };
type Bill = { totalNgn: number; paidNgn: number; items?: { id: string; description: string; amountNgn: number }[]; allocations?: { amountNgn: number; itemAllocations?: unknown }[] };

/** Older allocations had no item breakdown. Apply those to the remaining items in stable ID order. */
export function itemBalances(invoice: Bill) {
  const items = [...(invoice.items ?? [])].sort((a, b) => a.id.localeCompare(b.id)).map(item => ({ ...item, paidNgn: 0, outstandingNgn: item.amountNgn }));
  let explicit = 0;
  for (const allocation of invoice.allocations ?? []) {
    if (!Array.isArray(allocation.itemAllocations)) continue;
    for (const line of allocation.itemAllocations as ItemAmount[]) {
      const item = items.find(item => item.id === line.invoiceItemId);
      if (!item || !Number.isSafeInteger(line.amountNgn) || line.amountNgn <= 0) continue;
      const amount = Math.min(item.outstandingNgn, line.amountNgn);
      item.paidNgn += amount; item.outstandingNgn -= amount; explicit += amount;
    }
  }
  let legacy = Math.max(0, invoice.paidNgn - explicit);
  for (const item of items) {
    const amount = Math.min(legacy, item.outstandingNgn);
    item.paidNgn += amount; item.outstandingNgn -= amount; legacy -= amount;
  }
  return items;
}

export function allocateItems(invoice: Bill, amountNgn: number, selection?: ItemAmount[]): ItemAmount[] {
  const balances = itemBalances(invoice);
  const remaining = new Map(balances.map(item => [item.id, item]));
  let budget = amountNgn;
  const out: ItemAmount[] = [];
  for (const line of selection ?? balances.map(item => ({ invoiceItemId: item.id, description: item.description, amountNgn: item.outstandingNgn }))) {
    const item = remaining.get(line.invoiceItemId);
    if (!item) throw new AppError(409, 'ITEM_CHANGED', 'A selected fee item has changed. Refresh the bills.');
    const amount = Math.min(budget, item.outstandingNgn, line.amountNgn);
    if (amount > 0) out.push({ invoiceItemId: item.id, description: item.description, amountNgn: amount });
    item.outstandingNgn -= amount; budget -= amount;
  }
  if (budget > 0 && balances.length) throw new AppError(409, 'ITEM_BALANCE_CHANGED', 'The selected fee balance has changed. Refresh the bills.');
  return out;
}
