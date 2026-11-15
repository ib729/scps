import { execFileSync } from "node:child_process";

export function assertWebStopped(): void {
  const state = execFileSync("systemctl", ["show", "--property=ActiveState", "--value", "stuco-web.service"], { encoding: "utf8", timeout: 5000 }).trim();
  if (state !== "inactive" && state !== "failed") throw new Error(`Stop stuco-web.service before destructive maintenance; stopped state is unverified (${state || "empty response"})`);
  console.warn("Cannot detect arbitrary external writers; --writers-stopped asserts every writer is stopped.");
}
