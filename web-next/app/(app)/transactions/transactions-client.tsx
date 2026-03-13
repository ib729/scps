"use client";

import * as React from "react";
import Link from "next/link";

import { Check, Copy, MoreHorizontal } from "@/lib/icons";
import type {
  TransactionListCursor,
  TransactionNoteHistory,
  TransactionWithStudent,
} from "@/lib/models";
import { formatCurrency } from "@/lib/currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const BATCH_SIZE = 150;
const ROW_HEIGHT = 84;
const OVERSCAN_ROWS = 8;
const PREFETCH_RATIO = 0.65;
const GRID_TEMPLATE =
  "128px 170px minmax(180px,1.5fr) 110px 150px minmax(220px,1.9fr) 120px 140px 56px";

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

type TransactionNotesResponse = {
  success: boolean;
  error?: string;
  data?: {
    transaction: TransactionWithStudent;
    history: TransactionNoteHistory[];
  };
};

type FetchTarget = "replace" | "prefetch" | "append";

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

function mergeTransactions(
  existing: TransactionWithStudent[],
  incoming: TransactionWithStudent[],
) {
  const seenIds = new Set(existing.map((item) => item.id));
  const merged = [...existing];

  for (const item of incoming) {
    if (!seenIds.has(item.id)) {
      seenIds.add(item.id);
      merged.push(item);
    }
  }

  return merged;
}

const rowBaseClass =
  "grid items-center gap-3 border-b px-2 py-2 text-sm transition-colors hover:bg-muted/50";
const mutedCellClass = "truncate text-sm text-muted-foreground";

const TransactionRow = React.memo(function TransactionRow({
  tx,
  top,
  onOpenNotes,
  onEditNotes,
}: {
  tx: TransactionWithStudent;
  top: number;
  onOpenNotes: (tx: TransactionWithStudent) => void;
  onEditNotes: (tx: TransactionWithStudent) => void;
}) {
  const description = tx.description || "";
  const isTruncated = description.length > 50;
  const sign = tx.amount > 0 ? "+" : tx.amount < 0 ? "-" : "";
  const paymentMethodLabel =
    tx.type === "DEBIT" ? "Balance" : tx.payment_method || "-";

  return (
    <div
      className={`${rowBaseClass} absolute left-0 right-0`}
      style={{
        top: `${top}px`,
        height: `${ROW_HEIGHT}px`,
        gridTemplateColumns: GRID_TEMPLATE,
      }}
    >
      <div className="flex items-center gap-1 pl-2">
        <span className="font-mono text-xs">{tx.id}</span>
        <CopyButton txId={tx.id} />
      </div>

      <div className="truncate px-2 text-sm">
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

      <div className="truncate px-2">
        <Link href={`/customers/${tx.student_id}`} className="font-medium hover:underline">
          {tx.student_name}
        </Link>
      </div>

      <div>
        <Badge
          variant={tx.type === "TOPUP" ? "default" : "secondary"}
          className={
            tx.type === "DEBIT"
              ? "border-red-200 bg-red-50 text-red-600 dark:border-red-950 dark:bg-red-950/30 dark:text-red-400"
              : undefined
          }
        >
          {tx.type}
        </Badge>
      </div>

      <div className={mutedCellClass}>{paymentMethodLabel}</div>

      <div className="max-w-full overflow-hidden">
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

      <div className="min-w-[100px] px-2">
        <span
          className={`whitespace-nowrap font-bold ${
            tx.amount >= 0 ? "text-green-600" : "text-red-600"
          }`}
        >
          {sign}¥{formatCurrency(Math.abs(tx.amount))}
        </span>
      </div>

      <div className={mutedCellClass}>{tx.staff || "-"}</div>

      <div className="flex justify-end pr-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Open transaction actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEditNotes(tx)}>
              Edit notes
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
});

export function TransactionsClient({
  initialData,
  initialCursor,
  initialHasMore,
}: TransactionsClientProps) {
  const [visibleItems, setVisibleItems] = React.useState(initialData);
  const [prefetchedItems, setPrefetchedItems] = React.useState<TransactionWithStudent[]>([]);
  const [searchInput, setSearchInput] = React.useState("");
  const deferredSearch = React.useDeferredValue(searchInput.trim());
  const [typeFilter, setTypeFilter] = React.useState<TransactionTypeFilter>("all");
  const [nextCursor, setNextCursor] = React.useState<TransactionListCursor | null>(initialCursor);
  const [hasMore, setHasMore] = React.useState(initialHasMore);
  const [loadingInitial, setLoadingInitial] = React.useState(false);
  const [loadingMoreVisible, setLoadingMoreVisible] = React.useState(false);
  const [prefetchInFlight, setPrefetchInFlight] = React.useState(false);
  const [loadError, setLoadError] = React.useState("");
  const [selectedDetailsTx, setSelectedDetailsTx] = React.useState<TransactionWithStudent | null>(null);
  const [editingNotesTx, setEditingNotesTx] = React.useState<TransactionWithStudent | null>(null);
  const [noteDraft, setNoteDraft] = React.useState("");
  const [noteHistory, setNoteHistory] = React.useState<TransactionNoteHistory[]>([]);
  const [noteHistoryLoading, setNoteHistoryLoading] = React.useState(false);
  const [noteSaving, setNoteSaving] = React.useState(false);
  const [noteError, setNoteError] = React.useState("");
  const [scrollTop, setScrollTop] = React.useState(0);
  const [viewportHeight, setViewportHeight] = React.useState(0);

  const scrollContainerRef = React.useRef<HTMLDivElement | null>(null);
  const activeAbortRef = React.useRef<AbortController | null>(null);
  const requestVersionRef = React.useRef(0);
  const scrollFrameRef = React.useRef<number | null>(null);
  const hasInitializedFiltersRef = React.useRef(false);
  const activeQueryRef = React.useRef({
    search: "",
    type: "all" as TransactionTypeFilter,
  });
  const scrollMetricsRef = React.useRef({
    top: 0,
    viewport: 0,
  });
  const visibleItemsRef = React.useRef(initialData);
  const prefetchedItemsRef = React.useRef<TransactionWithStudent[]>([]);
  const nextCursorRef = React.useRef(initialCursor);
  const hasMoreRef = React.useRef(initialHasMore);
  const prefetchInFlightRef = React.useRef(false);
  const loadingMoreVisibleRef = React.useRef(false);

  const applyTransactionUpdate = React.useCallback((updated: TransactionWithStudent) => {
    const apply = (items: TransactionWithStudent[]) =>
      items.map((item) => (item.id === updated.id ? updated : item));

    visibleItemsRef.current = apply(visibleItemsRef.current);
    prefetchedItemsRef.current = apply(prefetchedItemsRef.current);

    React.startTransition(() => {
      setVisibleItems((current) => apply(current));
      setPrefetchedItems((current) => apply(current));
      setSelectedDetailsTx((current) => (current?.id === updated.id ? updated : current));
      setEditingNotesTx((current) => (current?.id === updated.id ? updated : current));
    });
  }, []);

  const loadNoteHistory = React.useCallback(async (transactionId: number) => {
    setNoteHistoryLoading(true);
    setNoteError("");

    try {
      const response = await fetch(`/api/transactions/${transactionId}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as TransactionNotesResponse;

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || "Failed to load note history");
      }

      setNoteHistory(payload.data.history);
      setNoteDraft(payload.data.transaction.description ?? "");
      applyTransactionUpdate(payload.data.transaction);
    } catch (error) {
      setNoteError(error instanceof Error ? error.message : "Failed to load note history");
      setNoteHistory([]);
    } finally {
      setNoteHistoryLoading(false);
    }
  }, [applyTransactionUpdate]);

  const openNoteEditor = React.useCallback((transaction: TransactionWithStudent) => {
    setEditingNotesTx(transaction);
    setNoteDraft(transaction.description ?? "");
    setNoteHistory([]);
    void loadNoteHistory(transaction.id);
  }, [loadNoteHistory]);

  const handleSaveNotes = React.useCallback(async () => {
    if (!editingNotesTx || noteSaving) {
      return;
    }

    setNoteSaving(true);
    setNoteError("");

    try {
      const response = await fetch(`/api/transactions/${editingNotesTx.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          description: noteDraft.trim() || null,
        }),
      });
      const payload = (await response.json()) as TransactionNotesResponse;

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || "Failed to save notes");
      }

      applyTransactionUpdate(payload.data.transaction);
      setNoteHistory(payload.data.history);
      setNoteDraft(payload.data.transaction.description ?? "");
    } catch (error) {
      setNoteError(error instanceof Error ? error.message : "Failed to save notes");
    } finally {
      setNoteSaving(false);
    }
  }, [applyTransactionUpdate, editingNotesTx, noteDraft, noteSaving]);

  const fetchBatch = React.useCallback(
    async ({
      cursor,
      target,
      version,
    }: {
      cursor: TransactionListCursor | null;
      target: FetchTarget;
      version: number;
    }) => {
      const controller = new AbortController();

      if (target === "replace") {
        activeAbortRef.current?.abort();
        activeAbortRef.current = controller;
        setLoadingInitial(true);
        setLoadError("");
        setLoadingMoreVisible(false);
        loadingMoreVisibleRef.current = false;
      } else if (target === "prefetch") {
        setPrefetchInFlight(true);
        prefetchInFlightRef.current = true;
      } else {
        setLoadingMoreVisible(true);
        loadingMoreVisibleRef.current = true;
      }

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
          if (target === "replace") {
            visibleItemsRef.current = responseData.items;
            prefetchedItemsRef.current = [];
            nextCursorRef.current = responseData.nextCursor;
            hasMoreRef.current = responseData.hasMore;

            setVisibleItems(responseData.items);
            setPrefetchedItems([]);
            setNextCursor(responseData.nextCursor);
            setHasMore(responseData.hasMore);
          } else if (target === "prefetch") {
            const dedupedBuffer = mergeTransactions(
              visibleItemsRef.current,
              responseData.items,
            ).slice(visibleItemsRef.current.length);

            prefetchedItemsRef.current = dedupedBuffer;
            nextCursorRef.current = responseData.nextCursor;
            hasMoreRef.current = responseData.hasMore;

            setPrefetchedItems(dedupedBuffer);
            setNextCursor(responseData.nextCursor);
            setHasMore(responseData.hasMore);
          } else {
            const merged = mergeTransactions(visibleItemsRef.current, responseData.items);

            visibleItemsRef.current = merged;
            prefetchedItemsRef.current = [];
            nextCursorRef.current = responseData.nextCursor;
            hasMoreRef.current = responseData.hasMore;

            setVisibleItems(merged);
            setPrefetchedItems([]);
            setNextCursor(responseData.nextCursor);
            setHasMore(responseData.hasMore);
          }
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        if (requestVersionRef.current === version) {
          setLoadError(
            error instanceof Error ? error.message : "Failed to load transactions",
          );
        }
      } finally {
        if (target === "replace") {
          if (requestVersionRef.current === version) {
            setLoadingInitial(false);
          }

          if (activeAbortRef.current === controller) {
            activeAbortRef.current = null;
          }
        } else if (target === "prefetch") {
          if (requestVersionRef.current === version) {
            setPrefetchInFlight(false);
          }
          prefetchInFlightRef.current = false;
        } else {
          if (requestVersionRef.current === version) {
            setLoadingMoreVisible(false);
          }
          loadingMoreVisibleRef.current = false;
        }
      }
    },
    [],
  );

  const appendPrefetched = React.useCallback(() => {
    if (prefetchedItemsRef.current.length === 0) {
      return false;
    }

    const merged = mergeTransactions(visibleItemsRef.current, prefetchedItemsRef.current);
    visibleItemsRef.current = merged;
    prefetchedItemsRef.current = [];

    React.startTransition(() => {
      setVisibleItems(merged);
      setPrefetchedItems([]);
      setLoadingMoreVisible(false);
    });

    loadingMoreVisibleRef.current = false;
    return true;
  }, []);

  const maybeLoadAhead = React.useCallback(() => {
    const viewport = scrollMetricsRef.current.viewport;
    const scrollBottom = scrollMetricsRef.current.top + viewport;
    const loadedHeight = visibleItemsRef.current.length * ROW_HEIGHT;
    const visibleLoadThreshold = Math.max(viewport * 1.1, ROW_HEIGHT * 6);
    const appendThreshold = Math.max(viewport * 1.4, ROW_HEIGHT * 8);

    if (prefetchedItemsRef.current.length > 0) {
      const shouldAppend =
        scrollBottom >= loadedHeight - appendThreshold ||
        loadedHeight <= viewport * 1.4;

      if (shouldAppend) {
        const appended = appendPrefetched();
        if (appended) {
          return;
        }
      }
    }

    if (
      hasMoreRef.current &&
      nextCursorRef.current &&
      prefetchedItemsRef.current.length === 0 &&
      !prefetchInFlightRef.current &&
      !loadingMoreVisibleRef.current
    ) {
      const shouldPrefetch =
        loadedHeight <= viewport * 1.8 ||
        scrollBottom >= loadedHeight * PREFETCH_RATIO;

      if (shouldPrefetch) {
        void fetchBatch({
          cursor: nextCursorRef.current,
          target: "prefetch",
          version: requestVersionRef.current,
        });
        return;
      }
    }

    if (
      hasMoreRef.current &&
      nextCursorRef.current &&
      prefetchedItemsRef.current.length === 0 &&
      !prefetchInFlightRef.current &&
      !loadingMoreVisibleRef.current &&
      scrollBottom >= loadedHeight - visibleLoadThreshold
    ) {
      void fetchBatch({
        cursor: nextCursorRef.current,
        target: "append",
        version: requestVersionRef.current,
      });
    }
  }, [appendPrefetched, fetchBatch]);

  const syncScrollState = React.useCallback(() => {
    if (scrollFrameRef.current !== null) {
      return;
    }

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const nextTop = scrollMetricsRef.current.top;
      const nextViewport = scrollMetricsRef.current.viewport;
      setScrollTop(nextTop);
      setViewportHeight(nextViewport);
      maybeLoadAhead();
    });
  }, [maybeLoadAhead]);

  const handleScroll = React.useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    scrollMetricsRef.current.top = container.scrollTop;
    scrollMetricsRef.current.viewport = container.clientHeight;
    syncScrollState();
  }, [syncScrollState]);

  React.useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    scrollMetricsRef.current.viewport = container.clientHeight;
    setViewportHeight(container.clientHeight);
    maybeLoadAhead();

    const resizeObserver = new ResizeObserver(() => {
      scrollMetricsRef.current.viewport = container.clientHeight;
      syncScrollState();
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, [maybeLoadAhead, syncScrollState]);

  React.useEffect(() => {
    maybeLoadAhead();
  }, [visibleItems.length, prefetchedItems.length, hasMore, maybeLoadAhead]);

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

    visibleItemsRef.current = [];
    prefetchedItemsRef.current = [];
    nextCursorRef.current = null;
    hasMoreRef.current = true;
    prefetchInFlightRef.current = false;
    loadingMoreVisibleRef.current = false;
    setVisibleItems([]);
    setPrefetchedItems([]);
    setNextCursor(null);
    setHasMore(true);
    setPrefetchInFlight(false);
    setLoadingMoreVisible(false);
    setSelectedDetailsTx(null);
    setEditingNotesTx(null);
    setScrollTop(0);
    setLoadError("");

    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTop = 0;
      scrollMetricsRef.current.top = 0;
      scrollMetricsRef.current.viewport = container.clientHeight;
    }

    void fetchBatch({
      cursor: null,
      target: "replace",
      version,
    });
  }, [deferredSearch, fetchBatch, typeFilter]);

  React.useEffect(() => {
    activeQueryRef.current = {
      search: "",
      type: "all",
    };

    return () => {
      activeAbortRef.current?.abort();
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
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
  const visibleEndIndex = Math.min(
    visibleItems.length,
    visibleStartIndex + visibleRowCount,
  );
  const renderedRows = visibleItems.slice(visibleStartIndex, visibleEndIndex);
  const totalHeight = visibleItems.length * ROW_HEIGHT;
  const shouldShowVisibleLoader =
    loadingMoreVisible ||
    (prefetchInFlight &&
      scrollTop + viewportHeight >= totalHeight - Math.max(viewportHeight, ROW_HEIGHT * 6));

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="sticky top-0 z-20 flex gap-4 bg-background/95 pb-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Input
          placeholder="Search by customer or transaction ID..."
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
        <div className="min-w-[1280px]">
          <div className="sticky top-0 z-10 border-b bg-background">
            <div
              className="grid h-10 items-center gap-3 px-2 text-left text-sm font-medium text-muted-foreground"
              style={{ gridTemplateColumns: GRID_TEMPLATE }}
            >
              <div className="pl-2">ID</div>
              <div>Date</div>
              <div>Customer</div>
              <div>Type</div>
              <div>Payment Method</div>
              <div>Notes</div>
              <div>Amount</div>
              <div>Staff</div>
              <div className="sr-only">Actions</div>
            </div>
          </div>

          {loadingInitial && visibleItems.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              Loading transactions...
            </div>
          ) : loadError && visibleItems.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              {loadError}
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              No transactions found
            </div>
          ) : (
            <div className="relative" style={{ height: `${totalHeight}px` }}>
              {renderedRows.map((tx, index) => (
                <TransactionRow
                  key={tx.id}
                  tx={tx}
                  top={(visibleStartIndex + index) * ROW_HEIGHT}
                  onOpenNotes={setSelectedDetailsTx}
                  onEditNotes={openNoteEditor}
                />
              ))}
            </div>
          )}

          {shouldShowVisibleLoader ? (
            <div className="border-t px-4 py-3 text-center text-sm text-muted-foreground">
              Loading more transactions...
            </div>
          ) : null}
        </div>
      </div>

      <Dialog
        open={selectedDetailsTx !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedDetailsTx(null);
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="w-full max-w-2xl p-4 sm:max-w-2xl"
        >
          <p className="whitespace-pre-wrap break-words rounded-md bg-muted p-4 text-sm">
            {selectedDetailsTx?.description}
          </p>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editingNotesTx !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingNotesTx(null);
            setNoteDraft("");
            setNoteHistory([]);
            setNoteError("");
          }
        }}
      >
        <DialogContent showCloseButton={false} className="w-full max-w-2xl p-5 sm:max-w-2xl">
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">
                Edit notes for transaction #{editingNotesTx?.id}
              </h3>
              <p className="text-sm text-muted-foreground">
                {editingNotesTx?.student_name} • {editingNotesTx?.type}
              </p>
            </div>

            <Textarea
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              placeholder="Add or update notes"
              className="min-h-[120px]"
            />

            {noteError ? (
              <div className="rounded-md border border-red-200 bg-red-50/70 px-3 py-2 text-sm text-red-700 dark:border-red-950 dark:bg-red-950/20 dark:text-red-300">
                {noteError}
              </div>
            ) : null}

            <div className="space-y-2">
              <div className="text-sm font-medium">Version history</div>
              <div
                data-lenis-prevent
                className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-3"
              >
                {noteHistoryLoading ? (
                  <p className="text-sm text-muted-foreground">Loading history...</p>
                ) : noteHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No note edits yet.</p>
                ) : (
                  noteHistory.map((entry) => (
                    <div key={entry.id} className="space-y-1 rounded-md border bg-muted/40 p-3">
                      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span>{entry.edited_by || "Unknown staff"}</span>
                        <span>
                          {new Date(`${entry.edited_at}Z`).toLocaleString("en-US", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                            timeZone: "Asia/Singapore",
                          })}
                        </span>
                      </div>
                      <p className="text-sm">
                        <span className="font-medium text-muted-foreground">Previous:</span>{" "}
                        {entry.previous_description || "—"}
                      </p>
                      <p className="text-sm">
                        <span className="font-medium text-muted-foreground">Updated:</span>{" "}
                        {entry.new_description || "—"}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingNotesTx(null)}
              >
                Close
              </Button>
              <Button type="button" onClick={() => void handleSaveNotes()} disabled={noteSaving}>
                {noteSaving ? "Saving..." : "Save notes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
