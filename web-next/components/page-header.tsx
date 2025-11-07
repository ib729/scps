"use client"

import { usePathname } from "next/navigation"

export function PageHeader() {
  const pathname = usePathname()
  
  const getPageTitle = () => {
    if (pathname === "/" || pathname === "/dashboard") return "Dashboard"
    if (pathname === "/students") return "Students"
    if (pathname?.startsWith("/students/")) return "Student Details"
    if (pathname === "/transactions") return "Transactions"
    if (pathname === "/pos") return "Point of Sale"
    if (pathname === "/topup") return "Top-up"
    if (pathname === "/settings") return "Settings"
    return "STUCO 2025-2026"
  }

  return (
    <h1 className="text-lg font-semibold">{getPageTitle()}</h1>
  )
}

