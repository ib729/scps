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

import React, { createContext, useContext, useState } from "react";
import type { NFCReader } from "./pos-preferences";
import { DEFAULT_NFC_READER } from "./pos-preferences";

interface NFCReaderContextType {
  selectedReader: NFCReader;
  setSelectedReader: (reader: NFCReader) => void;
  isInitialized: boolean;
}

const NFCReaderContext = createContext<NFCReaderContextType | undefined>(undefined);

export function NFCReaderProvider({
  children,
  initialSelectedReader = DEFAULT_NFC_READER,
}: {
  children: React.ReactNode;
  initialSelectedReader?: NFCReader;
}) {
  const [selectedReader, setSelectedReaderState] =
    useState<NFCReader>(initialSelectedReader);

  const setSelectedReader = (reader: NFCReader) => {
    setSelectedReaderState(reader);
  };

  return (
    <NFCReaderContext.Provider value={{ selectedReader, setSelectedReader, isInitialized: true }}>
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
