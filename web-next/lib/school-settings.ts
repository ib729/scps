import type Database from "better-sqlite3";
import { z } from "zod";

export type SchoolSettings = { schoolYear: string; logo: string | null };

const settingsSchema = z.object({
  schoolYear: z.string().trim().min(1).max(40).refine((value) => !/[\x00-\x1f\x7f]/.test(value)),
  logo: z.string().nullable(),
}).strict();

export function getSchoolSettings(db: Database.Database): SchoolSettings {
  const get = db.prepare("SELECT value FROM app_meta WHERE key = ?").pluck();
  const schoolYear = get.get("school_year");
  const logo = get.get("school_logo");
  const year = new Date().getFullYear();
  return {
    schoolYear: typeof schoolYear === "string" ? schoolYear : `${year}-${year + 1}`,
    logo: typeof logo === "string" ? logo : null,
  };
}

export function saveSchoolSettings(db: Database.Database, input: unknown): SchoolSettings {
  const settings = settingsSchema.parse(input);
  if (settings.logo !== null) {
    const match = settings.logo.length <= 700000 && /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(settings.logo);
    if (!match) throw new Error("Choose a PNG, JPEG, or WebP image up to 512 KB");
    const bytes = Buffer.from(match[2], "base64");
    const validSignature = match[1] === "png"
      ? bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : match[1] === "jpeg"
        ? bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
        : bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
    if (!validSignature || bytes.length > 512 * 1024 || bytes.toString("base64") !== match[2]) {
      throw new Error("Choose a PNG, JPEG, or WebP image up to 512 KB");
    }
  }

  db.transaction(() => {
    const put = db.prepare("INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
    put.run("school_year", settings.schoolYear);
    if (settings.logo === null) db.prepare("DELETE FROM app_meta WHERE key = 'school_logo'").run();
    else put.run("school_logo", settings.logo);
  }).immediate();
  return settings;
}
