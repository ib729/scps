"use client";

import * as React from "react";
import Lenis from "lenis";

export function LenisProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    const lenis = new Lenis({
      autoRaf: true,
      anchors: true,
      smoothWheel: true,
      allowNestedScroll: true,
      lerp: 0.08,
    });

    return () => {
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}
