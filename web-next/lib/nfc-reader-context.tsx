"use client";

/**
 * NFC Reader Context
 * 
 * Manages the selected NFC reader for the current user session.
 * Persists selection to localStorage so it survives page reloads.
 * 
 * Usage:
 * ```tsx
 * const { selectedReader, setSelectedReader } = useNFCReader();
 * ```
 */

import React, { createContext, useContext, useState, useEffect } from "react";

type NFCReader = "reader-1" | "reader-2";

interface NFCReaderContextType {
  selectedReader: NFCReader;
  setSelectedReader: (reader: NFCReader) => void;
}

const NFCReaderContext = createContext<NFCReaderContextType | undefined>(undefined);

const STORAGE_KEY = "nfc_reader_lane";
const DEFAULT_READER: NFCReader = "reader-1";

export function NFCReaderProvider({ children }: { children: React.ReactNode }) {
  const [selectedReader, setSelectedReaderState] = useState<NFCReader>(DEFAULT_READER);
  const [mounted, setMounted] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "reader-1" || stored === "reader-2") {
      setSelectedReaderState(stored);
    }
  }, []);

  // Persist to localStorage when changed
  const setSelectedReader = (reader: NFCReader) => {
    setSelectedReaderState(reader);
    if (mounted) {
      localStorage.setItem(STORAGE_KEY, reader);
    }
  };

  return (
    <NFCReaderContext.Provider value={{ selectedReader, setSelectedReader }}>
      {children}
    </NFCReaderContext.Provider>
  );
}

export function useNFCReader() {
  const context = useContext(NFCReaderContext);
  if (context === undefined) {
    throw new Error("useNFCReader must be used within an NFCReaderProvider");
  }
  return context;
}

