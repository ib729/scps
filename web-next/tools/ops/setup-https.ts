import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { installConfig } from "./install-config";

const caddyfile = "/etc/caddy/Caddyfile";
export const httpsDropIn = "/etc/systemd/system/scps.service.d/90-scps-https.conf";

interface HttpsDraft {
  config: string;
  binding: string;
  changed: boolean;
}

export function httpsOrigin(input: string): URL {
  const host = input.toLowerCase();
  const ip = isIP(host);
  if (ip === 4) {
    const [a, b, c] = host.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)))) ||
        (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113)) {
      throw new Error("HTTPS requires a public IP, not a private or reserved address");
    }
  } else if (ip === 6) {
    if (!/^[23][a-f0-9]{3}:[a-f0-9:]+$/.test(host) || /^2001:0?db8:/i.test(host)) throw new Error("HTTPS requires a public IPv6 address");
    return new URL(`https://[${host}]`);
  } else if (host.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(host) ||
      /(?:\.(?:localhost|internal|local|lan|test|invalid|example)|\.home\.arpa|\.ts\.net)$/.test(host)) {
    throw new Error("Specify a public DNS hostname or IP without a scheme, port, or path");
  }
  return new URL(`https://${host}`);
}

export function prepareHttps(url: URL, port: string): HttpsDraft {
  if (!/^\d{4,5}$/.test(port) || Number(port) < 1024 || Number(port) > 65535) throw new Error("HTTPS setup needs an app PORT from 1024 to 65535");
  let version: string;
  try { version = execFileSync("caddy", ["version"], { encoding: "utf8" }); }
  catch { throw new Error("Install the official Caddy 2.11.4 or newer Debian package, then rerun HTTPS setup"); }
  const release = version.match(/^v?(\d+)\.(\d+)\.(\d+)(?=\s|$)/);
  if (!release || Number(release[1]) !== 2 || Number(release[2]) < 11 || (Number(release[2]) === 11 && Number(release[3]) < 4)) {
    throw new Error("HTTPS setup requires the official Caddy 2.11.4 or newer 2.x Debian package");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const ip = isIP(host);
  // Clients omit TLS SNI for IP URLs, including the local readiness probe.
  const config = `# Managed by SCPS setup\n${ip ? `{\n\tdefault_sni ${host}\n}\n` : ""}${url.hostname} {\n\ttls {\n\t\tissuer acme {\n\t\t\tdir https://acme-v02.api.letsencrypt.org/directory\n${ip ? "\t\t\tprofile shortlived\n" : ""}\t\t}\n\t}\n\treverse_proxy 127.0.0.1:${Number(port)} {\n\t\theader_up X-Forwarded-For {remote_host}\n\t}\n}\n`;
  const current = execFileSync("sudo", ["cat", caddyfile]);
  const changed = current.toString() !== config;
  if (changed) {
    const conffiles = execFileSync("dpkg-query", ["-W", "-f=${Conffiles}", "caddy"], { encoding: "utf8" });
    const packagedHash = conffiles.match(/^\s*\/etc\/caddy\/Caddyfile\s+([a-f0-9]{32})\s*$/m)?.[1];
    if (!packagedHash || createHash("md5").update(current).digest("hex") !== packagedHash) {
      throw new Error("Refusing to replace an existing Caddyfile. HTTPS setup requires the default package configuration or a matching SCPS configuration");
    }
  }
  const binding = `[Service]\nEnvironment="HOSTNAME=127.0.0.1" "PORT=${Number(port)}" "NEXT_PUBLIC_APP_URL=${url.origin}" "TRUSTED_ORIGINS=${url.origin}" "TRUST_PROXY=true"\n`;
  if (fs.existsSync(httpsDropIn) && fs.readFileSync(httpsDropIn, "utf8") !== binding) throw new Error(`Refusing to replace ${httpsDropIn}`);
  execFileSync("caddy", ["validate", "--config", "-", "--adapter", "caddyfile"], { input: config, stdio: ["pipe", "inherit", "inherit"] });
  return { config, binding, changed };
}

export function startHttps(url: URL, draft: HttpsDraft) {
  if (draft.changed) {
    installConfig(caddyfile, draft.config, "0644");
  }
  execFileSync("sudo", ["systemctl", "reload-or-restart", "caddy.service"], { stdio: "inherit" });
  execFileSync("sudo", ["systemctl", "enable", "--now", "caddy.service"], { stdio: "inherit" });
  let status = "";
  try {
    status = execFileSync("curl", ["--disable", "--noproxy", "*", "--connect-to", "::127.0.0.1:443", "--fail", "--silent", "--max-time", "5", "--retry", "24", "--retry-all-errors", "--retry-delay", "5", "--retry-max-time", "120", "--output", "/dev/null", "--write-out", "%{http_code}", `${url.origin}/login`], { encoding: "utf8" });
  } catch { /* Caddy may still be waiting for ACME validation. */ }
  if (status !== "200") throw new Error(`HTTPS is not ready at ${url.origin}. Check public DNS/IP, inbound ports 80 and 443, and sudo journalctl -u caddy.service, then rerun with the same host`);
  console.log(`SCPS HTTPS ready: ${url.origin}`);
}
