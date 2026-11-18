"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createUser, setUserRoleAction } from "@/app/actions/users";
import type { UserAccessSummary } from "@/lib/models";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type OperatorRole = "staff" | "admin";

export function UsersClient({ users }: { users: UserAccessSummary[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [grant, setGrant] = useState<{ user: UserAccessSummary; role: OperatorRole } | null>(null);
  const [form, setForm] = useState<{ name: string; email: string; password: string; role: OperatorRole }>({ name: "", email: "", password: "", role: "staff" });

  async function save(action: () => Promise<{ success: boolean; error?: string }>) {
    setBusy(true); setError("");
    try {
      const result = await action();
      if (!result.success) { setError(result.error || "Unable to save account access"); return; }
      setGrant(null); router.refresh();
    } catch { setError("Unable to save account access. Refresh and try again."); }
    finally { setBusy(false); }
  }

  return <div className="space-y-6 overflow-auto pb-6">
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <Card><CardHeader><CardTitle>Registrations and access</CardTitle></CardHeader><CardContent>
      <Table><TableHeader><TableRow><TableHead>Person</TableHead><TableHead>Registered</TableHead><TableHead>Role</TableHead><TableHead>Access</TableHead></TableRow></TableHeader>
        <TableBody>{users.map(user => <TableRow key={user.id}>
          <TableCell><p className="font-medium">{user.name}</p><p className="text-muted-foreground">{user.email}</p></TableCell>
          <TableCell>{new Date(typeof user.createdAt === "number" && user.createdAt < 1e12 ? user.createdAt * 1000 : user.createdAt).toLocaleString()}</TableCell>
          <TableCell><Select value={user.role === "customer" ? "" : user.role} disabled={busy} onValueChange={role => { if (role === "staff" || role === "admin") setGrant({ user, role }); }}><SelectTrigger aria-label={`Role for ${user.email}`}><SelectValue placeholder="Grant staff access" /></SelectTrigger><SelectContent><SelectItem value="staff">staff</SelectItem><SelectItem value="admin">admin</SelectItem></SelectContent></Select></TableCell>
          <TableCell>{user.role === "customer" ? "Awaiting staff access" : "Active"}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Create account</CardTitle></CardHeader><CardContent>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); void save(async () => { const result = await createUser(form); if (result.success) setForm({ name: "", email: "", password: "", role: "staff" }); return result; }); }}>
        <div className="space-y-2"><Label htmlFor="create-name">Name</Label><Input id="create-name" required maxLength={255} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="create-email">Email</Label><Input id="create-email" type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="create-password">Temporary password</Label><Input id="create-password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></div>
        <div className="space-y-2"><Label>Initial role</Label><Select value={form.role} onValueChange={role => { if (role === "staff" || role === "admin") setForm({ ...form, role }); }}><SelectTrigger aria-label="Initial role"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="staff">staff</SelectItem><SelectItem value="admin">admin</SelectItem></SelectContent></Select></div>
        <Button disabled={busy} type="submit">Create account</Button>
      </form>
    </CardContent></Card>
    <Dialog open={!!grant} onOpenChange={open => { if (!open) setGrant(null); }}><DialogContent><DialogHeader><DialogTitle>Confirm role change</DialogTitle><DialogDescription>Change {grant?.user.email} from {grant?.user.role === "customer" ? "Awaiting staff access" : grant?.user.role} to {grant?.role}? Staff can access all financial records; administrators can also grant access and approve payments.</DialogDescription></DialogHeader>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <DialogFooter><Button variant="outline" onClick={() => setGrant(null)}>Cancel</Button><Button disabled={busy} onClick={() => { if (grant) void save(() => setUserRoleAction({ user_id: grant.user.id, role: grant.role })); }}>Confirm role change</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
