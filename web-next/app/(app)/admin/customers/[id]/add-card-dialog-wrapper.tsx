"use client";

import { useState, useEffect } from "react";
import { AddCardDialog } from "./add-card-dialog";

interface AddCardDialogWrapperProps {
  customerId: number;
}

export function AddCardDialogWrapper({ customerId }: AddCardDialogWrapperProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return <AddCardDialog customerId={customerId} />;
}

