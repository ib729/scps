import { getDb } from "../../lib/db";
import { hashPassword } from "better-auth/crypto";
import * as p from "@clack/prompts";
import pc from "picocolors";
import crypto from "crypto";
import type Database from "better-sqlite3";

export async function createCliUser(database: Database.Database, name: string, email: string, password: string, role: "staff" | "admin"): Promise<string> {
  const hashedPassword = await hashPassword(password);
  const userId = crypto.randomBytes(16).toString("hex");
  const accountId = crypto.randomBytes(16).toString("hex");
  const now = new Date().toISOString();
  database.transaction(() => {
    database.prepare(`
      INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt)
      VALUES (?, ?, ?, 1, ?, ?, ?)
    `).run(userId, name.trim(), email.trim().toLowerCase(), role, now, now);
    database.prepare(`
      INSERT INTO account (id, userId, accountId, providerId, password, createdAt, updatedAt)
      VALUES (?, ?, ?, 'credential', ?, ?, ?)
    `).run(accountId, userId, userId, hashedPassword, now, now);
  })();
  return userId;
}

export async function resetCliPassword(database: Database.Database, userId: string, password: string): Promise<void> {
  const hashedPassword = await hashPassword(password);
  const now = new Date().toISOString();
  database.transaction(() => {
    const result = database.prepare(`
      UPDATE account SET password = ?, updatedAt = ?
      WHERE userId = ? AND providerId = 'credential'
    `).run(hashedPassword, now, userId);
    if (result.changes === 0) {
      database.prepare(`
        INSERT INTO account (id, userId, accountId, providerId, password, createdAt, updatedAt)
        VALUES (?, ?, ?, 'credential', ?, ?, ?)
      `).run(crypto.randomBytes(16).toString("hex"), userId, userId, hashedPassword, now, now);
    }
  })();
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
}

export async function handleManageUsers() {
  const db = getDb();
  
  while (true) {
    const action = await p.select({
      message: "User Management Options",
      options: [
        { value: "list", label: "List registered users" },
        { value: "create", label: "Create a new user" },
        { value: "password", label: "Reset a user's password" },
        { value: "delete", label: "Delete a user" },
        { value: "back", label: "← Go back" },
      ],
    });

    if (p.isCancel(action) || action === "back") {
      break;
    }

    if (action === "list") {
      const users = db.prepare("SELECT id, name, email, COALESCE(role, 'staff') AS role FROM user").all() as UserRow[];
      
      if (users.length === 0) {
        p.note("No users registered yet.");
        continue;
      }

      const tableData = users.map((u) => {
        const roleColor = u.role === "admin" ? pc.red(u.role) : pc.blue(u.role);
        return `• ${pc.bold(u.name)} (${pc.cyan(u.email)}) - Role: ${roleColor}`;
      });

      p.note(tableData.join("\n"), "Registered Users");
    }

    if (action === "create") {
      const name = await p.text({
        message: "Full Name",
        placeholder: "e.g. Jason Kang",
        validate: (v) => (!v.trim() ? "Name is required" : undefined),
      });
      if (p.isCancel(name)) continue;

      const email = await p.text({
        message: "Email Address",
        placeholder: "e.g. jason@qiss.org.cn",
        validate: (v) => (!v.trim() || !v.includes("@") ? "Enter a valid email" : undefined),
      });
      if (p.isCancel(email)) continue;

      // Check if user already exists
      const existing = db.prepare("SELECT id FROM user WHERE email = ? LIMIT 1").get(email.trim().toLowerCase());
      if (existing) {
        p.log.error(`User with email ${email} already exists!`);
        continue;
      }

      const password = await p.password({
        message: "Password (min 8 chars)",
        validate: (v) => (v.length < 8 ? "Password must be at least 8 characters" : undefined),
      });
      if (p.isCancel(password)) continue;

      const role = await p.select({
        message: "Select Role",
        options: [
          { value: "staff", label: "Staff (Regular access)" },
          { value: "admin", label: "Admin (Full control)" },
        ],
      }) as "staff" | "admin";
      if (p.isCancel(role)) continue;

      const s = p.spinner();
      s.start("Hashing password and registering user...");
      
      try {
        await createCliUser(db, name, email, password, role);

        s.stop(`✓ User ${pc.green(name)} (${email}) created successfully!`);
      } catch (err) {
        s.stop("Failed to create user");
        p.log.error(err instanceof Error ? err.message : "Unknown error");
      }
    }

    if (action === "password") {
      const users = db.prepare("SELECT id, name, email FROM user").all() as UserRow[];
      
      if (users.length === 0) {
        p.log.warn("No users available to reset passwords.");
        continue;
      }

      const selectedUser = await p.select({
        message: "Select a user to reset their password",
        options: users.map((u) => ({
          value: u.id,
          label: `${u.name} (${u.email})`,
        })),
      });

      if (p.isCancel(selectedUser)) continue;

      const newPassword = await p.password({
        message: "Enter new password (min 8 chars)",
        validate: (v) => (v.length < 8 ? "Password must be at least 8 characters" : undefined),
      });

      if (p.isCancel(newPassword)) continue;

      const s = p.spinner();
      s.start("Hashing password and updating credentials...");

      try {
        await resetCliPassword(db, selectedUser, newPassword);

        s.stop("✓ Password reset successfully!");
      } catch (err) {
        s.stop("Failed to reset password");
        p.log.error(err instanceof Error ? err.message : "Unknown error");
      }
    }

    if (action === "delete") {
      const users = db.prepare("SELECT id, name, email FROM user").all() as UserRow[];
      
      if (users.length === 0) {
        p.log.warn("No users available to delete.");
        continue;
      }

      const selectedUser = await p.select({
        message: "Select user to delete",
        options: users.map((u) => ({
          value: u.id,
          label: `${u.name} (${u.email})`,
        })),
      });

      if (p.isCancel(selectedUser)) continue;

      const confirm = await p.confirm({
        message: pc.red(pc.bold("WARNING: This will permanently delete this user's account and session logs. Are you sure?")),
      });

      if (!confirm || p.isCancel(confirm)) continue;

      const s = p.spinner();
      s.start("Deleting user account...");

      try {
        db.prepare("DELETE FROM user WHERE id = ?").run(selectedUser);
        s.stop("✓ User deleted successfully!");
      } catch (err) {
        s.stop("Failed to delete user");
        p.log.error(err instanceof Error ? err.message : "Unknown error");
      }
    }
  }
}
