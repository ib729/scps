import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Nav() {
  return (
    <nav className="border-b bg-card">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-xl font-semibold">
              Stuco Snack Bar
            </Link>
            <div className="flex gap-1">
              <Button variant="ghost" asChild>
                <Link href="/dashboard">Dashboard</Link>
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/students">Students</Link>
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/transactions">Transactions</Link>
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/pos">POS</Link>
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/topup">Top-up</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

