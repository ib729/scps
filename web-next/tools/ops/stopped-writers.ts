import { execFileSync } from "node:child_process";

export function assertWebStopped(): void {
  for (const unit of ["scps.service", "stuco-web.service"]) {
    const load = execFileSync("systemctl", ["show", "--property=LoadState", "--value", unit], { encoding: "utf8", timeout: 5000 }).trim();
    if (unit === "stuco-web.service" && load === "not-found") continue;
    if (load !== "loaded") throw new Error(`Cannot establish ${unit} load state (${load || "empty response"})`);
    const state = execFileSync("systemctl", ["show", "--property=ActiveState", "--value", unit], { encoding: "utf8", timeout: 5000 }).trim();
    if (state !== "inactive" && state !== "failed") throw new Error(`Stop ${unit} before destructive maintenance; stopped state is unverified (${state || "empty response"})`);
  }
  console.warn("Cannot detect arbitrary external writers; --writers-stopped asserts every writer is stopped.");
}
