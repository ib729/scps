"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/currency";
import type { FinanceBookAmounts, FinanceSnapshot } from "@/lib/finance";

const channels = ["WeChat", "Alipay", "Cash", "Unassigned"] as const;
const money = (amount: number | null) => amount === null ? "Not entered" : `¥${formatCurrency(amount)}`;
const chinaTime = (value: string) => new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short" });
const total = (values: FinanceBookAmounts) => channels.reduce((sum, channel) => sum + values[channel], 0);

export function FinanceStatement({ snapshot, stale, staleReason }: { snapshot: FinanceSnapshot; stale: boolean; staleReason: string | null }) {
  const draft = snapshot.draft;
  const summary = draft.summary;
  const rows = [
    ["Expected opening", summary.openingCents], ["Recorded receipts", summary.receiptsCents],
    ["Other income", summary.incomeCents], ["Expenses", summary.expensesCents],
    ["Transfers in", summary.transfersInCents], ["Transfers out", summary.transfersOutCents],
    ["Expected closing", summary.expectedClosingCents], ["Actual closing", summary.actualClosingCents],
    ["Difference", summary.varianceCents],
  ] as const;
  const expenses = draft.entries.filter(entry => entry.kind === "expense");
  const transfers = draft.entries.filter(entry => entry.kind === "transfer");
  const relevantIds = new Set(snapshot.evidence.entries.filter(entry => entry.date.startsWith(`${snapshot.month}-`)).map(entry => entry.id));
  const history = snapshot.evidence.entries.filter(entry => relevantIds.has(entry.id));
  return <>
    <div className="finance-toolbar"><Link href={`/admin/finance?month=${snapshot.month}`}>Back to Finance</Link><span>{stale ? `Stale: ${staleReason ?? "source records changed"}` : "Current"}</span><Button onClick={() => window.print()}>Print / Save as PDF</Button></div>
    <main className="finance-statement">
      <header><p className="eyebrow">Student council · finance</p><h1>Monthly statement</h1><p className="identity">{snapshot.month} · revision {snapshot.revision}</p><p>China time: {chinaTime(draft.startUtc)} inclusive to {chinaTime(draft.endUtc)} exclusive</p><p>Saved {chinaTime(snapshot.savedAt)} China time by {snapshot.savedBy.name}{snapshot.reason ? ` · Revision reason: ${snapshot.reason}` : ""}</p></header>
      <section><h2>Summary</h2><div className="finance-table"><table><tbody>
        <tr><th scope="row">Recorded receipts</th><td>{money(total(summary.receiptsCents))}</td><th scope="row">Other income</th><td>{money(total(summary.incomeCents))}</td></tr>
        <tr><th scope="row">Expenses</th><td>{money(total(summary.expensesCents))}</td><th scope="row">Recorded sales</th><td>{money(summary.salesCents)}</td></tr>
        <tr><th scope="row">Sales less recorded expenses</th><td>{money(summary.salesLessExpensesCents)}</td><th scope="row">Wallet adjustments</th><td>{money(summary.walletAdjustmentsCents)}</td></tr>
        <tr><th scope="row">Expected funds</th><td>{money(summary.totalExpectedCents)}</td><th scope="row">Actual funds</th><td>{money(summary.totalActualCents)}</td></tr>
        <tr><th scope="row">Overall difference</th><td>{money(summary.totalVarianceCents)}</td><th scope="row">Explanation</th><td>{draft.observation?.explanation || "None"}</td></tr>
      </tbody></table></div><p>Actual balance observation recorded {draft.observation ? `${chinaTime(draft.observation.recordedAt)} China time by ${draft.observation.actor.name}` : "not entered"}.</p></section>
      <section><h2>Channel reconciliation</h2><div className="finance-table"><table><thead><tr><th scope="col">Movement</th>{channels.map(channel => <th scope="col" key={channel}>{channel}</th>)}</tr></thead><tbody>{rows.map(([label, values]) => <tr key={label}><th scope="row">{label}</th>{channels.map(channel => <td key={channel}>{values && channel in values ? money(values[channel as keyof typeof values]) : "—"}</td>)}</tr>)}</tbody></table></div><p>Unassigned is expected only. Overall difference includes Unassigned and is not the sum of the three channel differences.</p></section>
      <section><h2>Expenses</h2><div className="finance-table"><table><thead><tr><th>Date</th><th>Channel</th><th>Amount</th><th>Purpose</th><th>Recipient</th><th>Reference</th><th>Recorded by</th></tr></thead><tbody>{expenses.map(entry => <tr key={entry.id}><td>{entry.date}</td><td>{entry.channel}</td><td>{money(entry.amountCents)}</td><td>{entry.description}</td><td>{entry.recipient || "—"}</td><td>{entry.reference || "—"}</td><td>{entry.actor.name}</td></tr>)}</tbody></table></div>{!expenses.length && <p>No expenses recorded.</p>}</section>
      <section><h2>Recorded receipts and other income</h2><div className="finance-table"><table><thead><tr><th>Source / ID</th><th>Posted, China time</th><th>Channel / method</th><th>Customer credit</th><th>Receipt</th><th>Purpose / reference</th></tr></thead><tbody>{draft.receipts.map(receipt => <tr key={`${receipt.source}-${receipt.sourceId}`}><td>{receipt.source} #{receipt.sourceId}</td><td>{chinaTime(receipt.postedAt)}</td><td>{receipt.channel}{receipt.channel === "Unassigned" ? ` (${receipt.originalMethod ?? "not specified"})` : ""}</td><td>{receipt.creditedCents === null ? "—" : money(receipt.creditedCents)}</td><td>{money(receipt.amountCents)}</td><td>{[receipt.description, receipt.recipient, receipt.reference].filter(Boolean).join(" · ") || "—"}</td></tr>)}</tbody></table></div>{!draft.receipts.length && <p>No receipts recorded.</p>}</section>
      <section><h2>Transfers</h2><div className="finance-table"><table><thead><tr><th>Date</th><th>From</th><th>To</th><th>Amount</th><th>Purpose / reference</th><th>Recorded by</th></tr></thead><tbody>{transfers.map(entry => <tr key={entry.id}><td>{entry.date}</td><td>{entry.channel}</td><td>{entry.toChannel}</td><td>{money(entry.amountCents)}</td><td>{[entry.description, entry.reference].filter(Boolean).join(" · ")}</td><td>{entry.actor.name}</td></tr>)}</tbody></table></div>{!transfers.length && <p>No transfers recorded.</p>}</section>
      <section><h2>Notes and source limitations</h2><p>Recorded receipts are not verified bank settlement. Approved WeChat requests use approval time and payable amount; customer credit is separate. Purchases must be entered manually. Entered actual balances do not become the next month’s opening funds.</p><p>Wallet adjustments do not change council funds. CLI-Admin is a legacy marker, not verified payment evidence. Other administrative errors cannot be identified automatically.</p><p>Current customer balances at preparation, not historical month-end balances. Observed {chinaTime(draft.creditObservation.observedAt)} China time. Credit owed: {money(draft.creditObservation.creditOwedCents)}; customer debt: {money(draft.creditObservation.debtCents)}.</p>{draft.warnings.length > 0 && <><h3>Source warnings</h3><ul>{draft.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul></>}{history.length > 0 && <><h3>Entry revisions</h3><ul>{history.map(entry => <li key={`${entry.id}-${entry.revision}`}>{entry.id} · revision {entry.revision} · {entry.date} · {entry.voided ? "voided · " : ""}{entry.description} · {entry.actor.name} · {chinaTime(entry.recordedAt)}{entry.reason ? ` · ${entry.reason}` : ""}</li>)}</ul></>}</section>
    </main>
    <style jsx global>{`
      .finance-toolbar { max-width: 1100px; margin: 0 auto; padding: 1rem; display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; }
      .finance-toolbar a { text-decoration: underline; }
      .finance-statement { max-width: 1100px; margin: 0 auto; padding: 1.5rem 1rem 4rem; line-height: 1.45; }
      .finance-statement header { border-bottom: 2px solid currentColor; padding-bottom: 1rem; }
      .finance-statement h1 { font-size: 2rem; font-weight: 700; }
      .finance-statement .eyebrow { text-transform: uppercase; letter-spacing: .08em; font-size: .75rem; font-weight: 600; }
      .finance-statement .identity { font-size: 1.25rem; font-weight: 600; }
      .finance-statement section { margin-top: 1.75rem; }
      .finance-statement h2 { font-size: 1.2rem; font-weight: 700; margin-bottom: .5rem; }
      .finance-statement h3 { font-weight: 600; margin-top: .75rem; }
      .finance-statement p { margin-top: .4rem; }
      .finance-statement ul { list-style: disc; padding-left: 1.4rem; overflow-wrap: anywhere; }
      .finance-table { overflow-x: auto; }
      .finance-statement table { width: 100%; min-width: 36rem; border-collapse: collapse; font-size: .83rem; }
      .finance-statement th, .finance-statement td { border: 1px solid currentColor; padding: .35rem; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
      .finance-statement th { font-weight: 600; }
      @page { size: A4; margin: 12mm; }
      @media print {
        html, body { color: #000 !important; background: #fff !important; color-scheme: light !important; height: auto !important; overflow: visible !important; }
        .finance-toolbar { display: none !important; }
        .finance-statement { color: #000 !important; background: #fff !important; width: auto; max-width: none; margin: 0; padding: 0; }
        .finance-statement section { margin-top: 1rem; }
        .finance-statement h2, .finance-statement h3 { break-after: avoid; }
        .finance-table { overflow: visible !important; }
        .finance-statement table { min-width: 0; table-layout: fixed; font-size: 8pt; }
        .finance-statement thead { display: table-header-group; }
        .finance-statement tr { break-inside: avoid; page-break-inside: avoid; }
        .finance-statement th, .finance-statement td { border-color: #000; }
      }
    `}</style>
  </>;
}
