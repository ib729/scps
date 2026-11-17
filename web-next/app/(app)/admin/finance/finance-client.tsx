"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveFinanceSetupAction, saveFinanceEntryAction, saveFinanceObservationAction, closeFinanceMonthAction, calculateFinanceProfitAction } from "@/app/actions/finance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/currency";
import type { FinanceAmounts, FinanceBalanceInput, FinanceChannel, FinanceDraft, FinanceEntry, FinanceEntryInput, FinancePageData } from "@/lib/finance";

const channels: FinanceChannel[] = ["WeChat", "Alipay", "Cash"];
const money = (value: number | null) => value === null ? "Not entered" : `¥${formatCurrency(value)}`;
const chinaTime = (value: string) => new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short" });
const text = (form: FormData, name: string) => String(form.get(name) ?? "");
const amounts = (form: FormData): FinanceBalanceInput => ({ WeChat: text(form, "WeChat"), Alipay: text(form, "Alipay"), Cash: text(form, "Cash") });

function BalanceFields({ values }: { values?: FinanceAmounts }) {
  const id = useId();
  return <div className="grid gap-3 sm:grid-cols-3">{channels.map(channel => <div className="space-y-2" key={channel}><Label htmlFor={`${id}-${channel}`}>{channel} (¥)</Label><Input id={`${id}-${channel}`} name={channel} inputMode="decimal" defaultValue={values ? formatCurrency(values[channel]) : "0.00"} required /></div>)}</div>;
}

function Reconciliation({ draft }: { draft: FinanceDraft }) {
  const s = draft.summary;
  const columns = [...channels, "Unassigned"] as const;
  const rows = [
    ["Expected opening", s.openingCents], ["Recorded receipts", s.receiptsCents], ["Other income", s.incomeCents],
    ["Expenses", s.expensesCents], ["Transfers in", s.transfersInCents], ["Transfers out", s.transfersOutCents],
    ["Expected closing", s.expectedClosingCents], ["Actual closing", s.actualClosingCents], ["Difference", s.varianceCents],
  ] as const;
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      ["Recorded receipts", Object.values(s.receiptsCents).reduce((a, b) => a + b, 0)],
      ["Other income", Object.values(s.incomeCents).reduce((a, b) => a + b, 0)],
      ["Expenses", Object.values(s.expensesCents).reduce((a, b) => a + b, 0)],
      ["Recorded sales", s.salesCents], ["Sales less recorded expenses", s.salesLessExpensesCents],
      ["Expected funds", s.totalExpectedCents], ["Actual funds", s.totalActualCents], ["Overall difference", s.totalVarianceCents],
    ].map(([label, value]) => <div key={String(label)} className="rounded-lg border p-3"><p className="text-sm text-muted-foreground">{label}</p><p className="text-lg font-semibold tabular-nums">{money(value as number | null)}</p></div>)}</div>
    <Table><TableHeader><TableRow><TableHead>Reconciliation</TableHead>{columns.map(channel => <TableHead key={channel} className="text-right">{channel}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map(([label, values]) => <TableRow key={label}><TableCell>{label}</TableCell>{columns.map(channel => <TableCell className="text-right tabular-nums" key={channel}>{values && channel in values ? money(values[channel as keyof typeof values]) : "—"}</TableCell>)}</TableRow>)}</TableBody></Table>
    <p className="text-sm text-muted-foreground">Current customer balances at preparation, not historical month-end balances. Credit owed {money(draft.creditObservation.creditOwedCents)}; customer debt {money(draft.creditObservation.debtCents)}. Observed {chinaTime(draft.creditObservation.observedAt)} China time.</p>
    <p className="text-sm text-muted-foreground">Recorded receipts are not verified bank settlement. Approved WeChat requests use approval time and payable amount; customer credit is shown separately. Purchases must be entered manually. Wallet corrections do not change council funds; CLI-Admin is a legacy marker, not proof of payment. Other administrative errors cannot be identified automatically.</p>
    {draft.warnings.length > 0 && <div className="space-y-1 text-sm"><p className="font-medium">Source warnings</p><ul className="list-disc pl-5">{draft.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul></div>}
    {draft.observation?.explanation && <p className="text-sm"><strong>Explanation:</strong> {draft.observation.explanation}</p>}
    {draft.receipts.length > 0 && <div><h3 className="mb-2 font-medium">Receipt detail</h3><Table><TableHeader><TableRow><TableHead>Source</TableHead><TableHead>Recorded</TableHead><TableHead>Channel</TableHead><TableHead>Credit</TableHead><TableHead>Receipt</TableHead><TableHead>Purpose / reference</TableHead></TableRow></TableHeader><TableBody>{draft.receipts.map(receipt => <TableRow key={`${receipt.source}-${receipt.sourceId}`}><TableCell>{receipt.source} #{receipt.sourceId}</TableCell><TableCell>{chinaTime(receipt.postedAt)}</TableCell><TableCell>{receipt.channel}{receipt.channel === "Unassigned" ? ` (${receipt.originalMethod ?? "not specified"})` : ""}</TableCell><TableCell>{receipt.creditedCents === null ? "—" : money(receipt.creditedCents)}</TableCell><TableCell>{money(receipt.amountCents)}</TableCell><TableCell>{[receipt.description, receipt.reference].filter(Boolean).join(" · ") || "—"}</TableCell></TableRow>)}</TableBody></Table></div>}
  </div>;
}

export function FinanceClient({ data }: { data: FinancePageData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [setupOpen, setSetupOpen] = useState(false);
  const [entryDialog, setEntryDialog] = useState<{ entry: FinanceEntry | null; voiding: boolean } | null>(null);
  const [kind, setKind] = useState<FinanceEntryInput["kind"]>("expense");
  const [channel, setChannel] = useState<FinanceChannel>("WeChat");
  const [destination, setDestination] = useState<FinanceChannel>("Cash");
  const [selectedReport, setSelectedReport] = useState<number | null>(null);
  const [profit, setProfit] = useState<{ month: string; salesCents: number; profitCents: number; endUtc: string } | null>(null);
  const [profitError, setProfitError] = useState<{ month: string; message: string } | null>(null);
  const newEntryId = useRef<string | null>(null);
  const selected = data.revisions.find(report => report.id === selectedReport);
  const savedRevision = data.revisions[0]?.snapshot.revision ?? 0;
  const instantAvailable = !!data.draft && data.draft.startUtc <= data.draft.preparedAt;

  async function perform(action: () => Promise<{ success: boolean; error?: string }>, success: string, after?: () => void) {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await action();
      if (!result.success) setError(result.error || "Unable to save finance changes");
      else { setMessage(success); setProfit(null); after?.(); router.refresh(); }
    } catch { setError("Unable to save finance changes. Refresh before retrying."); }
    finally { setBusy(false); }
  }
  function openEntry(entry: FinanceEntry | null, voiding = false) {
    setKind(entry?.kind ?? "expense"); setChannel(entry?.channel ?? "WeChat"); setDestination(entry?.toChannel ?? "Cash");
    if (!entry) newEntryId.current = crypto.randomUUID();
    setError(""); setEntryDialog({ entry, voiding });
  }
  function submitSetup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void perform(() => saveFinanceSetupAction({ startMonth: data.setup?.startMonth ?? text(form, "startMonth"), balances: amounts(form), expectedRevision: data.setup?.revision ?? 0, reason: text(form, "reason") || undefined }), "Opening balances saved.", () => setSetupOpen(false));
  }
  function submitObservation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void perform(() => saveFinanceObservationAction({ month: data.month, balances: amounts(form), explanation: text(form, "explanation") || undefined, expectedRevision: data.observation?.revision ?? 0 }), "Month-end balances saved.");
  }
  function submitEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!entryDialog) return;
    const form = new FormData(event.currentTarget); const previous = entryDialog.entry;
    const input = { id: previous?.id ?? newEntryId.current!, expectedRevision: previous?.revision ?? 0, kind, date: text(form, "date"), channel, toChannel: kind === "transfer" ? destination : undefined, amount: text(form, "amount"), description: text(form, "description"), recipient: text(form, "recipient") || undefined, reference: text(form, "reference") || undefined, voided: entryDialog.voiding, reason: text(form, "reason") || undefined };
    void perform(() => saveFinanceEntryAction(input), entryDialog.voiding ? "Entry voided." : "Entry saved.", () => setEntryDialog(null));
  }
  function submitClose(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!data.draft) return;
    const form = new FormData(event.currentTarget);
    void perform(() => closeFinanceMonthAction({ month: data.month, expectedRevision: savedRevision, expectedHash: data.draft!.sourceHash, reason: text(form, "reason") || undefined }), "Statement saved.");
  }
  async function submitProfit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setProfitError(null); setProfit(null);
    try {
      const result = await calculateFinanceProfitAction({ month: data.month, goodsCost: text(form, "goodsCost"), otherExpenses: text(form, "otherExpenses") });
      if (!result.success) setProfitError({ month: data.month, message: result.error });
      else setProfit({ month: data.month, ...result.data });
    } catch { setProfitError({ month: data.month, message: "Unable to calculate estimated profit." }); }
    finally { setBusy(false); }
  }
  const setupForm = <form method="post" onSubmit={submitSetup} className="space-y-4">{!data.setup && <div className="space-y-2"><Label htmlFor="startMonth">Start month</Label><Input id="startMonth" name="startMonth" type="month" defaultValue={data.month} required /></div>}<BalanceFields values={data.setup?.balancesCents} />{data.setup && <div className="space-y-2"><Label htmlFor="setup-reason">Reason for correction</Label><Textarea id="setup-reason" name="reason" maxLength={1000} required /></div>}<Button type="submit" disabled={busy}>{busy ? "Saving…" : data.setup ? "Save correction" : "Save opening balances"}</Button></form>;

  return <div className="min-h-0 flex-1 space-y-6 overflow-auto pb-8">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold">Finance</h1><p className="text-muted-foreground">Record council funds and prepare monthly statements.</p></div><form className="flex items-end gap-2" onSubmit={event => { event.preventDefault(); router.push(`/admin/finance?month=${encodeURIComponent(text(new FormData(event.currentTarget), "month"))}`); }}><div className="space-y-2"><Label htmlFor="month">Selected month</Label><Input key={data.month} id="month" type="month" name="month" defaultValue={data.month} required /></div><Button variant="outline" type="submit">Open</Button></form></header>
    {error && <p role="alert" className="text-destructive">{error}</p>}{message && <p role="status">{message}</p>}
    {!data.setup ? <Card><CardHeader><CardTitle>Opening balances</CardTitle><CardDescription>Choose the first month and independently verified balances at its start. The start month cannot be changed later.</CardDescription></CardHeader><CardContent>{setupForm}</CardContent></Card> : <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground"><span>Opening balances start {data.setup.startMonth} · revision {data.setup.revision}</span><Button variant="outline" onClick={() => setSetupOpen(true)}>Correct opening balances</Button></div>
      <Dialog open={setupOpen} onOpenChange={open => { if (!busy) setSetupOpen(open); }}><DialogContent><DialogHeader><DialogTitle>Correct opening balances</DialogTitle><DialogDescription>The start month stays fixed. Corrections make affected saved statements stale.</DialogDescription></DialogHeader>{setupForm}</DialogContent></Dialog>
      {data.error && <p role="alert" className="text-destructive">{data.error}</p>}
      <Card>
        <CardHeader><CardTitle>Quick profit estimate</CardTitle><CardDescription>Recorded sales minus the cost of goods sold and other expenses you enter. Do not count the same cost twice. Inventory is not tracked, so this is an estimate, not an accounting profit statement.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <form method="post" onSubmit={submitProfit} onChange={() => { setProfit(null); setProfitError(null); }} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="goods-cost">Cost of goods sold (¥)</Label><Input id="goods-cost" name="goodsCost" inputMode="decimal" placeholder="Enter 0 if none" disabled={busy || !instantAvailable} required /></div>
              <div className="space-y-2"><Label htmlFor="other-expenses">Other expenses (¥)</Label><Input id="other-expenses" name="otherExpenses" inputMode="decimal" placeholder="Enter 0 if none" disabled={busy || !instantAvailable} required /></div>
            </div>
            <Button type="submit" disabled={busy || !instantAvailable}>{busy ? "Calculating…" : "Calculate estimate"}</Button>
          </form>
          {profitError?.month === data.month && <p role="alert" className="text-destructive">{profitError.message}</p>}
          {profit?.month === data.month && <div role="status" className="rounded-lg border p-3"><p>Recorded sales: {money(profit.salesCents)}</p><p className="font-semibold">Estimated profit / loss: {money(profit.profitCents)}</p><p className="text-sm text-muted-foreground">Selected month through {new Date(profit.endUtc).toLocaleString("en-GB", { timeZone: "Asia/Shanghai", year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3, hourCycle: "h23" })} China time, exclusive. Entered costs are not saved or included in reports.</p></div>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Instant report</CardTitle><CardDescription>Generate a provisional report for the selected month up to now, without closing it or entering month-end balances. It is not a saved statement. Each export is generated separately and can differ if records change.</CardDescription></CardHeader>
        <CardContent>{instantAvailable ? <div className="flex flex-wrap gap-4"><a className="underline" href={`/api/finance/instant/export?month=${encodeURIComponent(data.month)}`}>Download provisional Excel</a><a className="underline" href={`/finance/instant?month=${encodeURIComponent(data.month)}`} target="_blank" rel="noopener noreferrer">Print provisional / Save as PDF</a></div> : <p className="text-sm text-muted-foreground">Choose a started month with valid finance data to generate a report.</p>}</CardContent>
      </Card>
      {data.draft && <Card><CardHeader><CardTitle>Draft for {data.month}</CardTitle><CardDescription>China time, {chinaTime(data.draft.startUtc)} inclusive to {chinaTime(data.draft.endUtc)} exclusive. Prepared {chinaTime(data.draft.preparedAt)}.</CardDescription></CardHeader><CardContent><Reconciliation draft={data.draft} /></CardContent></Card>}
      <Card><CardHeader><CardTitle>Balance at end of selected month</CardTitle><CardDescription>Enter actual balances for {data.month}. They do not change the expected ledger or the next month’s opening funds.</CardDescription></CardHeader><CardContent><form method="post" key={`${data.month}-${data.observation?.revision ?? 0}`} className="space-y-4" onSubmit={submitObservation}><BalanceFields values={data.observation?.balancesCents} /><div className="space-y-2"><Label htmlFor="explanation">Explanation for differences or warnings</Label><Textarea id="explanation" name="explanation" maxLength={1000} defaultValue={data.observation?.explanation ?? ""} /></div><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save actual balances"}</Button></form></CardContent></Card>
      <Card><CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3"><div><CardTitle>Manual register</CardTitle><CardDescription>Expenses, other income and transfers for {data.month}.</CardDescription></div><Button disabled={busy} onClick={() => openEntry(null)}>Add entry</Button></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Channel</TableHead><TableHead>Amount</TableHead><TableHead>Purpose</TableHead><TableHead>Status</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>{data.entries.map(entry => <TableRow key={entry.id}><TableCell>{entry.date}</TableCell><TableCell>{entry.kind}</TableCell><TableCell>{entry.channel}{entry.toChannel ? ` → ${entry.toChannel}` : ""}</TableCell><TableCell>{money(entry.amountCents)}</TableCell><TableCell className="max-w-xs whitespace-normal">{entry.description}</TableCell><TableCell>{entry.voided ? "Voided" : !entry.date.startsWith(data.month) ? "Moved out" : "Active"}</TableCell><TableCell><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => openEntry(entry)} disabled={busy}>Review / edit</Button>{!entry.voided && <Button size="sm" variant="outline" onClick={() => openEntry(entry, true)} disabled={busy}>Void</Button>}</div></TableCell></TableRow>)}</TableBody></Table>{!data.entries.length && <p className="py-4 text-sm text-muted-foreground">No manual entries for this month.</p>}</CardContent></Card>
      <Dialog open={!!entryDialog} onOpenChange={open => { if (!open && !busy) setEntryDialog(null); }}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{entryDialog?.voiding ? "Void entry" : entryDialog?.entry ? "Review / edit entry" : "Add entry"}</DialogTitle><DialogDescription>Changes are saved as new versions. A reason is required for corrections and voids.</DialogDescription></DialogHeader>{entryDialog && <form method="post" key={`${entryDialog.entry?.id ?? "new"}-${entryDialog.voiding}`} className="space-y-4" onSubmit={submitEntry}>
        <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="entry-kind">Type</Label><Select value={kind} onValueChange={value => setKind(value as FinanceEntryInput["kind"])}><SelectTrigger id="entry-kind"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="expense">Expense</SelectItem><SelectItem value="income">Other income</SelectItem><SelectItem value="transfer">Transfer</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label htmlFor="entry-date">Effective date</Label><Input id="entry-date" name="date" type="date" defaultValue={entryDialog.entry?.date ?? `${data.month}-01`} required /></div>
        <div className="space-y-2"><Label htmlFor="entry-channel">Channel</Label><Select value={channel} onValueChange={value => setChannel(value as FinanceChannel)}><SelectTrigger id="entry-channel"><SelectValue /></SelectTrigger><SelectContent>{channels.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>{kind === "transfer" && <div className="space-y-2"><Label htmlFor="entry-destination">Destination</Label><Select value={destination} onValueChange={value => setDestination(value as FinanceChannel)}><SelectTrigger id="entry-destination"><SelectValue /></SelectTrigger><SelectContent>{channels.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>}<div className="space-y-2"><Label htmlFor="entry-amount">Amount (¥)</Label><Input id="entry-amount" name="amount" inputMode="decimal" defaultValue={entryDialog.entry ? formatCurrency(entryDialog.entry.amountCents) : ""} required /></div></div>
        <div className="space-y-2"><Label htmlFor="entry-description">Purchase / purpose</Label><Textarea id="entry-description" name="description" maxLength={500} defaultValue={entryDialog.entry?.description ?? ""} required /></div><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="entry-recipient">Recipient (optional)</Label><Input id="entry-recipient" name="recipient" maxLength={255} defaultValue={entryDialog.entry?.recipient ?? ""} /></div><div className="space-y-2"><Label htmlFor="entry-reference">Receipt / reference (optional)</Label><Input id="entry-reference" name="reference" maxLength={255} defaultValue={entryDialog.entry?.reference ?? ""} /></div></div>{entryDialog.entry && <div className="space-y-2"><Label htmlFor="entry-reason">Reason for change</Label><Textarea id="entry-reason" name="reason" maxLength={1000} required /></div>}
        {entryDialog.entry && <div className="space-y-2 text-sm"><h3 className="font-medium">Version history</h3>{data.entryHistory.filter(version => version.id === entryDialog.entry!.id).map(version => <p key={version.revision}>Revision {version.revision} · {version.date} · {money(version.amountCents)} · {version.voided ? "voided" : version.description} · {version.actor.name} · {chinaTime(version.recordedAt)}{version.reason ? ` · ${version.reason}` : ""}</p>)}</div>}
        {error && <p role="alert" className="text-destructive">{error}</p>}<DialogFooter><Button type="submit" disabled={busy}>{busy ? "Saving…" : entryDialog.voiding ? "Void entry" : "Save entry"}</Button></DialogFooter></form>}</DialogContent></Dialog>
      <Card><CardHeader><CardTitle>Save statement</CardTitle><CardDescription>Only completed months with actual balances and any required explanation can be saved. Saved revisions never change.</CardDescription></CardHeader><CardContent className="space-y-3">{data.draft?.blockers.map(blocker => <p key={blocker} className="text-sm text-destructive">{blocker}</p>)}<form method="post" onSubmit={submitClose} className="space-y-3">{savedRevision > 0 && <div className="space-y-2"><Label htmlFor="revision-reason">Reason for new revision</Label><Textarea id="revision-reason" name="reason" maxLength={1000} required /></div>}<Button type="submit" disabled={busy || !data.draft?.canClose}>{busy ? "Saving…" : savedRevision ? "Save new revision" : "Save statement"}</Button></form></CardContent></Card>
      <Card>
        <CardHeader><CardTitle>Saved statements</CardTitle><CardDescription>Inspect original snapshots, including older or stale revisions.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {!data.reports.length && <p className="text-sm text-muted-foreground">No saved statements.</p>}
          {data.reports.map(report => <div key={report.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
            <div><p className="font-medium">{report.month} · revision {report.revision} <Badge variant="outline">{report.stale ? "Stale" : "Current"}</Badge></p>
              <p className="text-sm text-muted-foreground">{report.savedBy.name} · {chinaTime(report.savedAt)}{report.reason ? ` · ${report.reason}` : ""}</p>
              {report.staleReason && <p className="text-sm text-destructive">{report.staleReason}</p>}
            </div>
            <Button variant="outline" onClick={() => router.push(`/admin/finance?month=${report.month}`)}>Open month</Button>
          </div>)}
          {data.revisions.length > 0 && <div className="space-y-2"><h3 className="font-medium">Revisions for {data.month}</h3>
            <p className="text-sm text-muted-foreground">PDF is created using your browser’s Print / Save as PDF option.</p>
            {data.revisions.map(report => <div className="flex flex-wrap items-center gap-3" key={report.id}>
              <Button size="sm" variant="outline" onClick={() => setSelectedReport(report.id)}>Inspect revision {report.snapshot.revision}</Button>
              <a className="text-sm underline" href={`/api/finance/reports/${report.id}/export`}>Download Excel</a>
              <a className="text-sm underline" href={`/finance/reports/${report.id}`} target="_blank" rel="noopener noreferrer">Print / Save as PDF</a>
              <span className="text-sm">{report.snapshot.savedBy.name} · {chinaTime(report.snapshot.savedAt)} · {report.stale ? "Stale" : "Current"}{report.snapshot.reason ? ` · ${report.snapshot.reason}` : ""}</span>
            </div>)}
          </div>}
          {selected && <section className="space-y-4 rounded-lg border p-4">
            <h3 className="font-semibold">Saved {selected.snapshot.month} · revision {selected.snapshot.revision}</h3>
            <p className="text-sm text-muted-foreground">Saved by {selected.snapshot.savedBy.name} at {chinaTime(selected.snapshot.savedAt)}{selected.snapshot.reason ? ` · ${selected.snapshot.reason}` : ""}</p>
            <Reconciliation draft={selected.snapshot.draft} />
            <h4 className="font-medium">Saved manual entries</h4>
            <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Channel</TableHead><TableHead>Amount</TableHead><TableHead>Purpose</TableHead><TableHead>Recipient / reference</TableHead><TableHead>Recorded by</TableHead></TableRow></TableHeader><TableBody>
              {selected.snapshot.draft.entries.map(entry => <TableRow key={entry.id}><TableCell>{entry.date}</TableCell><TableCell>{entry.kind}</TableCell><TableCell>{entry.channel}{entry.toChannel ? ` → ${entry.toChannel}` : ""}</TableCell><TableCell>{money(entry.amountCents)}</TableCell><TableCell className="whitespace-normal">{entry.description}</TableCell><TableCell className="whitespace-normal">{[entry.recipient, entry.reference].filter(Boolean).join(" · ") || "—"}</TableCell><TableCell>{entry.actor.name}</TableCell></TableRow>)}
            </TableBody></Table>
            {!selected.snapshot.draft.entries.length && <p className="text-sm text-muted-foreground">No manual entries in this saved statement.</p>}
          </section>}
        </CardContent>
      </Card>
    </>}
  </div>;
}
