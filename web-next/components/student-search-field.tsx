"use client";

import { useEffect, useState } from "react";

import { searchStudentsAction } from "@/app/actions/students";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { StudentWithAccount } from "@/lib/models";
import { formatCurrency } from "@/lib/currency";

type StudentSearchFieldProps = {
  id: string;
  label: string;
  placeholder: string;
  selectedStudent: StudentWithAccount | null;
  onSelect: (student: StudentWithAccount | null) => void;
};

export function StudentSearchField({
  id,
  label,
  placeholder,
  selectedStudent,
  onSelect,
}: StudentSearchFieldProps) {
  const [query, setQuery] = useState(selectedStudent?.name ?? "");
  const [results, setResults] = useState<StudentWithAccount[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  useEffect(() => {
    setQuery(selectedStudent?.name ?? "");
  }, [selectedStudent?.id, selectedStudent?.name]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 1) {
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      setIsSearching(true);
      const result = await searchStudentsAction(trimmedQuery, 8);
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

    return () => window.clearTimeout(timeoutId);
  }, [isOpen, query]);

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-base font-medium">
        {label}
      </label>
      <div className="relative">
        <Input
          id={id}
          value={query}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            setIsOpen(true);
            if (nextQuery.trim().length < 1) {
              setResults([]);
              setHighlightedIndex(-1);
            }
            if (selectedStudent && nextQuery !== selectedStudent.name) {
              onSelect(null);
            }
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setIsOpen(false), 120);
          }}
          onKeyDown={(event) => {
            if (!isOpen || results.length === 0) {
              if (event.key === "Enter" && results.length === 1) {
                event.preventDefault();
                const student = results[0];
                onSelect(student);
                setQuery(student.name);
                setResults([]);
                setHighlightedIndex(-1);
                setIsOpen(false);
              }
              return;
            }

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

            if (event.key === "Enter") {
              const student =
                results[highlightedIndex] ??
                (results.length === 1 ? results[0] : null);

              if (!student) {
                return;
              }

              event.preventDefault();
              onSelect(student);
              setQuery(student.name);
              setResults([]);
              setHighlightedIndex(-1);
              setIsOpen(false);
              return;
            }

            if (event.key === "Escape") {
              setIsOpen(false);
            }
          }}
          placeholder={placeholder}
          className="h-12 text-base"
          autoComplete="off"
        />
        {selectedStudent ? (
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
                {results.map((student, index) => (
                  <button
                    key={student.id}
                    type="button"
                    className={`flex w-full items-center justify-between px-3 py-2 text-left ${
                      highlightedIndex === index
                        ? "bg-muted"
                        : "hover:bg-muted"
                    }`}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => {
                      onSelect(student);
                      setQuery(student.name);
                      setResults([]);
                      setHighlightedIndex(-1);
                      setIsOpen(false);
                    }}
                  >
                    <span className="font-medium">{student.name}</span>
                    <span className="text-sm text-muted-foreground">
                      ¥{formatCurrency(student.balance)}
                    </span>
                  </button>
                ))}
              </div>
            ) : query.trim().length >= 1 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">No students found</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
