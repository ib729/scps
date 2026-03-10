"use client";

import * as React from "react";
import Link from "next/link";

import { Check, Copy } from "@/lib/icons";
import type { TransactionListCursor, TransactionWithStudent } from "@/lib/models";
import { formatCurrency } from "@/lib/currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const BATCH_SIZE = 100;
const ROW_HEIGHT = 84;
const OVERSCAN_ROWS = 8;
const LOAD_MORE_THRESHOLD = 320;
const TABLE_COLUMNS = 8;

type TransactionTypeFilter = "all" | "TOPUP" | "DEBIT" | "ADJUST";

interface TransactionsClientProps {
  initialData: TransactionWithStudent[];
  initialCursor: TransactionListCursor | null;
  initialHasMore: boolean;
}

type TransactionsResponse = {
  success: boolean;
  error?: string;
  data?: {
    items: TransactionWithStudent[];
    nextCursor: TransactionListCursor | null;
    hasMore: boolean;
  };
};

type AnimationRequestState = "idle" | "initial" | "more";

function CopyButton({ txId }: { txId: number }) {
  const [copied, setCopied] = React.useState(false);

  const copyTransactionId = async () => {
    await navigator.clipboard.writeText(txId.toString());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={copyTransactionId}
      className="h-5 w-5 p-0"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}

function buildTransactionsUrl(params: {
  limit: number;
  search?: string;
  type?: string;
  cursor?: TransactionListCursor | null;
}) {
  const query = new URLSearchParams({
    limit: params.limit.toString(),
  });

  if (params.search) {
    query.set("search", params.search);
  }

  if (params.type) {
    query.set("type", params.type);
  }

  if (params.cursor) {
    query.set("cursorCreatedAt", params.cursor.createdAt);
    query.set("cursorId", params.cursor.id.toString());
  }

  return `/api/transactions?${query.toString()}`;
}

function dedupeTransactions(items: TransactionWithStudent[]) {
  const seenIds = new Set<number>();

  return items.filter((item) => {
    if (seenIds.has(item.id)) {
      return false;
    }

    seenIds.add(item.id);
    return true;
  });
}

function TransactionRow({
  tx,
  onOpenNotes,
}: {
  tx: TransactionWithStudent;
  onOpenNotes: (tx: TransactionWithStudent) => void;
}) {
  const description = tx.description || "";
  const isTruncated = description.length > 50;
  const sign = tx.amount > 0 ? "+" : tx.amount < 0 ? "-" : "";

  return (
    <TableRow style={{ height: `${ROW_HEIGHT}px` }}>
      <TableCell>
        <div className="flex items-center gap-1 px-2">
          <span className="font-mono text-xs">{tx.id}</span>
          <CopyButton txId={tx.id} />
        </div>
      </TableCell>
      <TableCell>
        <div className="px-2 text-sm">
          {new Date(`${tx.created_at}Z`).toLocaleString("en-US", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: "Asia/Singapore",
          })}
        </div>
      </TableCell>
      <TableCell>
        <div className="px-2">
          <Link href={`/customers/${tx.student_id}`} className="font-medium hover:underline">
            {tx.student_name}
          </Link>
        </div>
      </TableCell>
      <TableCell>
        <Badge
          variant={
            tx.type === "TOPUP"
              ? "default"
              : tx.type === "DEBIT"
                ? "destructive"
                : "secondary"
          }
        >
          {tx.type}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="text-sm text-muted-foreground">{tx.payment_method || "-"}</div>
      </TableCell>
      <TableCell>
        <div className="max-w-[150px] overflow-hidden sm:max-w-[200px] md:max-w-xs">
          {description ? (
            <>
              <p className="truncate break-words text-sm">
                {isTruncated ? `${description.slice(0, 50)}...` : description}
              </p>
              {isTruncated ? (
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 font-medium text-blue-500 hover:text-blue-700"
                  onClick={() => onOpenNotes(tx)}
                >
                  Read more
                </Button>
              ) : null}
            </>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
          {tx.overdraft_component > 0 ? (
            <p className="mt-1 truncate text-xs text-orange-600">
              Overdraft: ¥{formatCurrency(tx.overdraft_component)}
            </p>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        <div className="min-w-[100px] px-2">
          <span
            className={`whitespace-nowrap font-bold ${
              tx.amount >= 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {sign}¥{formatCurrency(Math.abs(tx.amount))}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <div className="text-sm text-muted-foreground">{tx.staff || "-"}</div>
      </TableCell>
    </TableRow>
  );
}

export function TransactionsClient({
  initialData,
  initialCursor,
  initialHasMore,
}: TransactionsClientProps) {
  const [data, setData] = React.useState(initialData);
  const [searchInput, setSearchInput] = React.useState("");
  const deferredSearch = React.useDeferredValue(searchInput.trim());
  const [typeFilter, setTypeFilter] = React.useState<TransactionTypeFilter>("all");
  const [nextCursor, setNextCursor] = React.useState<TransactionListCursor | null>(initialCursor);
  const [hasMore, setHasMore] = React.useState(initialHasMore);
  const [loadingState, setLoadingState] = React.useState<AnimationRequestState>("idle");
  const [loadError, setLoadError] = React.useState("");
  const [selectedDetailsTx, setSelectedDetailsTx] = React.useState<TransactionWithStudent | null>(null);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [viewportHeight, setViewportHeight] = React.useState(0);

  const scrollContainerRef = React.useRef<HTMLDivElement | null>(null);
  const requestVersionRef = React.useRef(0);
  const activeAbortRef = React.useRef<AbortController | null>(null);
  const activeQueryRef = React.useRef({
    search: "",
    type: "all" as TransactionTypeFilter,
  });
  const isFetchingMoreRef = React.useRef(false);
  const hasInitializedFiltersRef = React.useRef(false);

  const fetchBatch = React.useCallback(
    async ({
      cursor,
      replace,
      version,
      mode,
    }: {
      cursor: TransactionListCursor | null;
      replace: boolean;
      version: number;
      mode: AnimationRequestState;
    }) => {
      const controller = new AbortController();

      if (replace) {
        activeAbortRef.current?.abort();
        activeAbortRef.current = controller;
      }

      setLoadingState(mode);
      setLoadError("");

      try {
        const response = await fetch(
          buildTransactionsUrl({
            limit: BATCH_SIZE,
            search: activeQueryRef.current.search || undefined,
            type:
              activeQueryRef.current.type === "all"
                ? undefined
                : activeQueryRef.current.type,
            cursor,
          }),
          {
            signal: controller.signal,
            cache: "no-store",
          },
        );

        const payload = (await response.json()) as TransactionsResponse;

        if (controller.signal.aborted || requestVersionRef.current !== version) {
          return;
        }

        if (!response.ok || !payload.success || !payload.data) {
          throw new Error(payload.error || "Failed to load transactions");
        }

        const responseData = payload.data;

        React.startTransition(() => {
          setData((current) =>
            dedupeTransactions(
              replace
                ? responseData.items
                : [...current, ...responseData.items],
            ),
          );
          setNextCursor(responseData.nextCursor);
          setHasMore(responseData.hasMore);
        });
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }

        if (requestVersionRef.current === version) {
          setLoadError(
            error instanceof Error ? error.message : "Failed to load transactions",
          );
        }
      } finally {
        if (requestVersionRef.current === version) {
          setLoadingState("idle");
        }

        if (!replace) {
          isFetchingMoreRef.current = false;
        }

        if (activeAbortRef.current === controller) {
          activeAbortRef.current = null;
        }
      }
    },
    [],
  );

  const loadMore = React.useCallback(() => {
    if (!hasMore || !nextCursor || isFetchingMoreRef.current || loadingState === "initial") {
      return;
    }

    isFetchingMoreRef.current = true;
    const version = requestVersionRef.current;
    void fetchBatch({
      cursor: nextCursor,
      replace: false,
      version,
      mode: "more",
    });
  }, [fetchBatch, hasMore, loadingState, nextCursor]);

  const handleScroll = React.useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    const nextScrollTop = container.scrollTop;
    setScrollTop(nextScrollTop);

    if (
      container.scrollHeight - (nextScrollTop + container.clientHeight) <=
      LOAD_MORE_THRESHOLD
    ) {
      loadMore();
    }
  }, [loadMore]);

  React.useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    setViewportHeight(container.clientHeight);

    const resizeObserver = new ResizeObserver(() => {
      setViewportHeight(container.clientHeight);
    });

    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  React.useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    if (
      container.scrollHeight <= container.clientHeight + LOAD_MORE_THRESHOLD &&
      hasMore &&
      loadingState === "idle"
    ) {
      loadMore();
    }
  }, [data.length, hasMore, loadMore, loadingState]);

  React.useEffect(() => {
    if (!hasInitializedFiltersRef.current) {
      hasInitializedFiltersRef.current = true;
      return;
    }

    requestVersionRef.current += 1;
    const version = requestVersionRef.current;
    activeQueryRef.current = {
      search: deferredSearch,
      type: typeFilter,
    };
    setData([]);
    setHasMore(true);
    setNextCursor(null);
    setSelectedDetailsTx(null);
    setScrollTop(0);

    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTop = 0;
    }

    void fetchBatch({
      cursor: null,
      replace: true,
      version,
      mode: "initial",
    });
  }, [deferredSearch, fetchBatch, typeFilter]);

  React.useEffect(() => {
    activeQueryRef.current = {
      search: "",
      type: "all",
    };

    return () => {
      activeAbortRef.current?.abort();
    };
  }, []);

  const visibleStartIndex = Math.max(
    0,
    Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS,
  );
  const visibleRowCount = Math.max(
    1,
    Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN_ROWS * 2,
  );
  const visibleEndIndex = Math.min(data.length, visibleStartIndex + visibleRowCount);
  const visibleRows = data.slice(visibleStartIndex, visibleEndIndex);
  const topSpacerHeight = visibleStartIndex * ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(0, (data.length - visibleEndIndex) * ROW_HEIGHT);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="sticky top-0 z-20 flex gap-4 bg-background/95 pb-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Input
          placeholder="Search by customer name..."
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          className="flex-1"
        />
        <Select
          value={typeFilter}
          onValueChange={(value) => setTypeFilter(value as TransactionTypeFilter)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="TOPUP">Top-up</SelectItem>
            <SelectItem value="DEBIT">Debit</SelectItem>
            <SelectItem value="ADJUST">Adjustment</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div
        ref={scrollContainerRef}
        className="relative min-h-0 flex-1 overflow-auto rounded-md border custom-scrollbar"
        onScroll={handleScroll}
      >
        <table className="w-full caption-bottom text-sm">
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Payment Method</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Staff</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {topSpacerHeight > 0 ? (
              <TableRow aria-hidden="true">
                <TableCell colSpan={TABLE_COLUMNS} className="p-0" style={{ height: `${topSpacerHeight}px` }} />
              </TableRow>
            ) : null}

            {visibleRows.length > 0 ? (
              visibleRows.map((tx) => (
                <TransactionRow
                  key={tx.id}
                  tx={tx}
                  onOpenNotes={setSelectedDetailsTx}
                />
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={TABLE_COLUMNS} className="h-24 text-center text-muted-foreground">
                  {loadingState === "initial"
                    ? "Loading transactions..."
                    : loadError || "No transactions found"}
                </TableCell>
              </TableRow>
            )}

            {bottomSpacerHeight > 0 ? (
              <TableRow aria-hidden="true">
                <TableCell colSpan={TABLE_COLUMNS} className="p-0" style={{ height: `${bottomSpacerHeight}px` }} />
              </TableRow>
            ) : null}

            {loadingState === "more" ? (
              <TableRow>
                <TableCell colSpan={TABLE_COLUMNS} className="h-12 text-center text-muted-foreground">
                  Loading more transactions...
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </table>
      </div>

      <Dialog
        open={selectedDetailsTx !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedDetailsTx(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[85vh] w-full flex-col overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Full Notes</DialogTitle>
            <DialogDescription>
              {selectedDetailsTx ? `Transaction #${selectedDetailsTx.id}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <p className="whitespace-pre-wrap break-words rounded-md bg-muted p-4 text-sm">
              {selectedDetailsTx?.description}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
