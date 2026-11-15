"use client"

import { usePathname } from "next/navigation"

export function PageHeader() {
  const pathname = usePathname()
  
  const getPageTitle = () => {
    if (pathname === "/admin") return "Dashboard"
    if (pathname === "/admin/customers") return "Customers"
    if (pathname?.startsWith("/admin/customers/")) return "Customer Details"
    if (pathname === "/admin/transactions") return "Transactions"
    if (pathname === "/admin/pos") return "Point of Sale"
    if (pathname === "/admin/topup") return "Top-up"
    if (pathname === "/admin/users") return "Accounts"
    if (pathname === "/admin/payments") return "Payment review"
    if (pathname === "/settings") return "Settings"
    return "STUCO 2025-2026"
  }

  return (
    <h1 className="text-lg font-semibold">{getPageTitle()}</h1>
  )
}
