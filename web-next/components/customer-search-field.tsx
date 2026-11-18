"use client";

import { useEffect, useState } from "react";

import { searchCustomersAction } from "@/app/actions/customers";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { CustomerWithAccount } from "@/lib/models";
import { formatCurrency } from "@/lib/currency";

type CustomerSearchFieldProps = {
  id: string;
  label: string;
  placeholder?: string;
  selectedCustomer: CustomerWithAccount | null;
  onSelect: (customer: CustomerWithAccount | null) => void;
  onTabComplete?: () => void;
};

export function CustomerSearchField({
  id,
  label,
  placeholder,
  selectedCustomer,
  onSelect,
  onTabComplete,
}: CustomerSearchFieldProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerWithAccount[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 1) {
      return;
    }

    let active = true;
    const timeoutId = window.setTimeout(async () => {
      setIsSearching(true);
      const result = await searchCustomersAction(trimmedQuery, 8);
      if (!active) return;
      if (result.success) {
        const nextResults = result.data ?? [];
        setResults(nextResults);
        setHighlightedIndex(nextResults.length > 0 ? 0 : -1);
      } else {
        setResults([]);
        setHighlightedIndex(-1);
      }
      setIsSearching(false);
    }, 200);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [isOpen, query]);

  const selectCustomer = (customer: CustomerWithAccount) => {
    onSelect(customer);
    setQuery("");
    setResults([]);
    setHighlightedIndex(-1);
    setIsOpen(false);
  };

  return (
    <div className="space-y-3">
      <Label htmlFor={id} className="block text-base font-medium leading-normal">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          value={selectedCustomer?.name ?? query}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            setIsOpen(true);
            setResults([]);
            setHighlightedIndex(-1);
            setIsSearching(nextQuery.trim().length > 0);
            if (selectedCustomer && nextQuery !== selectedCustomer.name) {
              onSelect(null);
            }
          }}
          onFocus={() => {
            if (!selectedCustomer) setIsOpen(true);
          }}
          onBlur={() => {
            window.setTimeout(() => setIsOpen(false), 120);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && isOpen) {
              setIsOpen(false);
              return;
            }
            if (!isOpen || results.length === 0) return;

            if (event.key === "ArrowDown") {
              event.preventDefault();
              setHighlightedIndex((currentIndex) =>
                currentIndex >= results.length - 1 ? 0 : currentIndex + 1,
              );
              return;
            }

            if (event.key === "ArrowUp") {
              event.preventDefault();
              setHighlightedIndex((currentIndex) =>
                currentIndex <= 0 ? results.length - 1 : currentIndex - 1,
              );
              return;
            }

            const completeWithTab = event.key === "Tab" && !event.shiftKey && onTabComplete;
            if (event.key === "Enter" || completeWithTab) {
              const customer = results[highlightedIndex];
              if (!customer) return;

              event.preventDefault();
              selectCustomer(customer);
              if (completeWithTab) completeWithTab();
            }
          }}
          placeholder={placeholder}
          className={`h-12 text-base md:text-base ${selectedCustomer ? "pr-18" : ""}`}
          autoComplete="off"
        />
        {selectedCustomer ? (
          <Button
            type="button"
            variant="ghost"
            className="absolute right-1 top-1 h-10 px-3"
            onClick={() => {
              setQuery("");
              setResults([]);
              setIsOpen(false);
              onSelect(null);
            }}
          >
            Clear
          </Button>
        ) : null}

        {isOpen ? (
          <div className="absolute z-20 mt-2 w-full rounded-md border bg-background shadow-lg">
            {isSearching ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">Searching...</p>
            ) : results.length > 0 ? (
              <div className="max-h-64 overflow-y-auto py-1">
                {results.map((customer, index) => (
                  <button
                    key={customer.id}
                    type="button"
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left ${
                      highlightedIndex === index
                        ? "bg-muted"
                        : "hover:bg-muted"
                    }`}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => selectCustomer(customer)}
                  >
                    <span className="font-medium wrap-anywhere">{customer.name}</span>
                    <span className="shrink-0 text-sm text-muted-foreground">
                      ¥{formatCurrency(customer.balance)}
                    </span>
                  </button>
                ))}
              </div>
            ) : query.trim().length >= 1 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">No customers found</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
