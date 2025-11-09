"use client";

import { useState, useEffect } from "react";
import { AddCardDialog } from "./add-card-dialog";

interface AddCardDialogWrapperProps {
  studentId: number;
}

export function AddCardDialogWrapper({ studentId }: AddCardDialogWrapperProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return <AddCardDialog studentId={studentId} />;
}

