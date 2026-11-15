import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import tapBroadcaster from "./tap-events";
import type { TapEvent } from "./tap-events";

test("separate module graphs share tap listeners and deduplication", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps-tap-graphs-"));
  const received: TapEvent[] = [];
  const unsubscribe = tapBroadcaster.subscribe(event => received.push(event));
  try {
    fs.writeFileSync(path.join(directory, "package.json"), '{"type":"module"}');
    const copy = path.join(directory, "tap-events.ts");
    fs.copyFileSync(path.join(import.meta.dirname, "tap-events.ts"), copy);
    // A second source file exercises the independent server/Next module-loading boundary.
    const { default: otherGraph } = await import(pathToFileURL(copy).href) as { default: typeof tapBroadcaster };
    assert.equal(otherGraph, tapBroadcaster);
    const event = { card_uid: "GRAPH01", timestamp: new Date().toISOString() };
    assert.equal(otherGraph.broadcast(event), true);
    assert.equal(tapBroadcaster.broadcast(event), false);
    assert.deepEqual(received, [event]);
  } finally {
    unsubscribe();
    tapBroadcaster.clearHistory();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
