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
      lerp: 0.08,
      prevent: (node) => {
        if (!(node instanceof HTMLElement)) {
          return false;
        }

        return node.closest("[data-native-scroll]") !== null;
      },
    });

    return () => {
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}
