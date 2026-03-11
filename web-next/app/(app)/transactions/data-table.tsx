"use client";

import * as React from "react";
import { useEffectEvent } from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { getTransactionsBatchAction } from "@/app/actions/transactions";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  initialData: TData[];
  initialOffset: number;
  initialHasMore: boolean;
  totalCount: number;
}

export function DataTable<TData, TValue>({
  columns,
  initialData,
  initialOffset,
  initialHasMore,
  totalCount,
}: DataTableProps<TData, TValue>) {
  const [data, setData] = React.useState<TData[]>(initialData);
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "created_at", desc: true }, // Default sort by date descending
  ]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );
  const [typeFilter, setTypeFilter] = React.useState<string>("all");
  const [hasMore, setHasMore] = React.useState(initialHasMore);
  const [nextOffset, setNextOffset] = React.useState(initialOffset);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const scrollContainerRef = React.useRef<HTMLDivElement | null>(null);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting,
      columnFilters,
    },
  });

  // Apply type filter
  React.useEffect(() => {
    if (typeFilter === "all") {
      table.getColumn("type")?.setFilterValue(undefined);
    } else {
      table.getColumn("type")?.setFilterValue(typeFilter);
    }
  }, [typeFilter, table]);

  const loadMore = useEffectEvent(async () => {
    if (loadingMore || !hasMore) {
      return;
    }

    setLoadingMore(true);
    const result = await getTransactionsBatchAction(nextOffset, 100);

    if (result.success && result.data) {
      setData((currentData) => [
        ...currentData,
        ...(result.data.items as TData[]),
      ]);
      setNextOffset(result.data.nextOffset);
      setHasMore(result.data.hasMore);
    }

    setLoadingMore(false);
  });

  React.useEffect(() => {
    const root = scrollContainerRef.current;
    const sentinel = sentinelRef.current;

    if (!root || !sentinel || !hasMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry?.isIntersecting) {
          void loadMore();
        }
      },
      {
        root,
        rootMargin: "0px 0px 240px 0px",
        threshold: 0.1,
      },
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="sticky top-0 z-20 flex gap-4 bg-background/95 pb-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Input
          placeholder="Search by customer name..."
          value={
            (table.getColumn("student_name")?.getFilterValue() as string) ?? ""
          }
          onChange={(event) =>
            table.getColumn("student_name")?.setFilterValue(event.target.value)
          }
          className="flex-1"
        />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
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
      >
        <table className="w-full caption-bottom text-sm">
          <TableHeader className="sticky top-0 bg-background z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No transactions found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </table>
        <div ref={sentinelRef} className="h-12" />
      </div>

      <div className="flex items-center justify-between gap-4 pt-4">
        <div className="text-sm text-muted-foreground">
          Showing {table.getFilteredRowModel().rows.length} of {data.length} loaded transaction(s)
        </div>
        <div className="text-sm text-muted-foreground">
          {loadingMore
            ? "Loading more..."
            : hasMore
              ? `Loaded ${data.length} of ${totalCount}`
              : `All ${totalCount} transactions loaded`}
        </div>
      </div>
    </div>
  );
}
