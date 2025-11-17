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
  isInitialized: boolean;
}

const NFCReaderContext = createContext<NFCReaderContextType | undefined>(undefined);

const STORAGE_KEY = "nfc_reader_lane";
const DEFAULT_READER: NFCReader = "reader-1";

export function NFCReaderProvider({ children }: { children: React.ReactNode }) {
  const [selectedReader, setSelectedReaderState] = useState<NFCReader>(DEFAULT_READER);
  const [mounted, setMounted] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(STORAGE_KEY);
    console.log('[NFCReaderContext] Initializing - stored value:', stored);
    if (stored === "reader-1" || stored === "reader-2") {
      console.log('[NFCReaderContext] Setting reader from localStorage:', stored);
      setSelectedReaderState(stored);
    } else {
      console.log('[NFCReaderContext] No valid stored value, using default:', DEFAULT_READER);
      // Also save default to localStorage
      localStorage.setItem(STORAGE_KEY, DEFAULT_READER);
    }
    // Mark as initialized after loading from storage
    setIsInitialized(true);
  }, []);

  // Persist to localStorage when changed
  const setSelectedReader = (reader: NFCReader) => {
    console.log('[NFCReaderContext] setSelectedReader called with:', reader);
    setSelectedReaderState(reader);
    if (mounted) {
      localStorage.setItem(STORAGE_KEY, reader);
      console.log('[NFCReaderContext] Saved to localStorage:', reader);
    } else {
      console.log('[NFCReaderContext] Not mounted yet, skipping localStorage save');
    }
  };

  return (
    <NFCReaderContext.Provider value={{ selectedReader, setSelectedReader, isInitialized }}>
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

