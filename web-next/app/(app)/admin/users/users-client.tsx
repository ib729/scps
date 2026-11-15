"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { approveCustomerRegistrationAction, createUser, setUserRoleAction } from "@/app/actions/users";
import { searchCustomersAction } from "@/app/actions/customers";
import type { UserRole } from "@/lib/auth-session";
import type { CustomerWithAccount, UserAccessSummary } from "@/lib/models";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function UsersClient({ users }: { users: UserAccessSummary[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [linkUser, setLinkUser] = useState<UserAccessSummary | null>(null);
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<CustomerWithAccount[]>([]);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [grant, setGrant] = useState<{ user: UserAccessSummary; role: UserRole } | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "customer" as UserRole });

  async function save(action: () => Promise<{ success: boolean; error?: string }>) {
    setBusy(true); setError("");
    try {
      const result = await action();
      if (!result.success) { setError(result.error || "Unable to save account access"); return; }
      setLinkUser(null); setGrant(null); router.refresh();
    } catch { setError("Unable to save account access. Refresh and try again."); }
    finally { setBusy(false); }
  }

  return <div className="space-y-6 overflow-auto pb-6">
    <header><h1 className="text-2xl font-semibold">Accounts</h1><p className="text-muted-foreground">Verify each person before linking a balance or granting operator access. Email addresses are not verified.</p></header>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <Card><CardHeader><CardTitle>Registrations and access</CardTitle></CardHeader><CardContent>
      <Table><TableHeader><TableRow><TableHead>Person</TableHead><TableHead>Registered</TableHead><TableHead>Customer account</TableHead><TableHead>Role</TableHead><TableHead>Approval</TableHead></TableRow></TableHeader>
        <TableBody>{users.map(user => <TableRow key={user.id}>
          <TableCell><p className="font-medium">{user.name}</p><p className="text-muted-foreground">{user.email}</p></TableCell>
          <TableCell>{new Date(typeof user.createdAt === "number" && user.createdAt < 1e12 ? user.createdAt * 1000 : user.createdAt).toLocaleString()}</TableCell>
          <TableCell>{user.customerId ? `${user.customerName} (#${user.customerId})` : user.role === "customer" ? "Awaiting approval" : "Not linked"}</TableCell>
          <TableCell><Select value={user.role} disabled={busy} onValueChange={role => setGrant({ user, role: role as UserRole })}><SelectTrigger aria-label={`Role for ${user.email}`}><SelectValue /></SelectTrigger><SelectContent>{["customer", "staff", "admin"].map(role => <SelectItem key={role} value={role}>{role}</SelectItem>)}</SelectContent></Select></TableCell>
          <TableCell>{user.role === "customer" && !user.customerId && <Button disabled={busy} onClick={() => { setLinkUser(user); setQuery(""); setCustomers([]); setCustomerId(null); setError(""); }}>Review registration</Button>}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Create account</CardTitle></CardHeader><CardContent>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); void save(async () => { const result = await createUser(form); if (result.success) setForm({ name: "", email: "", password: "", role: "customer" }); return result; }); }}>
        <div className="space-y-2"><Label htmlFor="create-name">Name</Label><Input id="create-name" required maxLength={255} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="create-email">Email</Label><Input id="create-email" type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="create-password">Temporary password</Label><Input id="create-password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></div>
        <div className="space-y-2"><Label>Initial role</Label><Select value={form.role} onValueChange={role => setForm({ ...form, role: role as UserRole })}><SelectTrigger aria-label="Initial role"><SelectValue /></SelectTrigger><SelectContent>{["customer", "staff", "admin"].map(role => <SelectItem key={role} value={role}>{role}</SelectItem>)}</SelectContent></Select></div>
        <Button disabled={busy} type="submit">Create account</Button>
      </form>
    </CardContent></Card>
    <Dialog open={!!linkUser} onOpenChange={open => { if (!open) setLinkUser(null); }}><DialogContent><DialogHeader><DialogTitle>Link {linkUser?.name}</DialogTitle><DialogDescription>Choose the existing financial customer record. This does not create a new balance.</DialogDescription></DialogHeader>
      <form className="flex gap-2" onSubmit={async event => { event.preventDefault(); setBusy(true); setError(""); try { const result = await searchCustomersAction(query); if (result.success && result.data) setCustomers(result.data); else setError(result.error || "Search failed"); } finally { setBusy(false); } }}><Input aria-label="Search existing customers" placeholder="Customer name" value={query} onChange={e => setQuery(e.target.value)} /><Button disabled={busy} type="submit">Search</Button></form>
      <div className="max-h-60 space-y-2 overflow-auto">{customers.map(customer => <Button key={customer.id} className="w-full justify-start" variant={customerId === customer.id ? "default" : "outline"} onClick={() => setCustomerId(customer.id)}>{customer.name} (#{customer.id})</Button>)}</div>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <DialogFooter><Button disabled={busy || !customerId} onClick={() => { if (linkUser && customerId) void save(() => approveCustomerRegistrationAction({ user_id: linkUser.id, customer_id: customerId })); }}>Approve and link</Button></DialogFooter>
    </DialogContent></Dialog>
    <Dialog open={!!grant} onOpenChange={open => { if (!open) setGrant(null); }}><DialogContent><DialogHeader><DialogTitle>Confirm role change</DialogTitle><DialogDescription>Change {grant?.user.email} from {grant?.user.role} to {grant?.role}? Staff can access all financial records; administrators can also grant access and approve payments.</DialogDescription></DialogHeader>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <DialogFooter><Button variant="outline" onClick={() => setGrant(null)}>Cancel</Button><Button disabled={busy} onClick={() => { if (grant) void save(() => setUserRoleAction({ user_id: grant.user.id, role: grant.role })); }}>Confirm role change</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
