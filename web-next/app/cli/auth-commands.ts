import { getDb } from "../../lib/db";
import { hashPassword } from "better-auth/crypto";
import * as p from "@clack/prompts";
import pc from "picocolors";
import crypto from "crypto";

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
      const existing = db.prepare("SELECT id FROM user WHERE email = ? LIMIT 1").get(email);
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
        const hashedPassword = await hashPassword(password);
        const userId = crypto.randomBytes(16).toString("hex");
        const accountId = crypto.randomBytes(16).toString("hex");
        const now = Math.floor(Date.now() / 1000);

        // Run as a single transaction to maintain DB consistency
        db.transaction(() => {
          // 1. Insert into Better-Auth 'user' table
          db.prepare(`
            INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt)
            VALUES (?, ?, ?, 1, ?, ?, ?)
          `).run(userId, name.trim(), email.trim().toLowerCase(), role, now, now);

          // 2. Insert into Better-Auth 'account' table for credential login
          db.prepare(`
            INSERT INTO account (id, userId, accountId, providerId, password, createdAt, updatedAt)
            VALUES (?, ?, ?, 'email', ?, ?, ?)
          `).run(accountId, userId, email.trim().toLowerCase(), hashedPassword, now, now);
        })();

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
        const hashedPassword = await hashPassword(newPassword);
        
        // Update the hashed password in Better-Auth's account table
        const result = db.prepare(`
          UPDATE account 
          SET password = ?, updatedAt = ?
          WHERE userId = ? AND providerId = 'email'
        `).run(hashedPassword, Math.floor(Date.now() / 1000), selectedUser);

        if (result.changes === 0) {
          // If no credential account exists, create one
          const user = db.prepare("SELECT email FROM user WHERE id = ?").get(selectedUser) as { email: string };
          const accountId = crypto.randomBytes(16).toString("hex");
          const now = Math.floor(Date.now() / 1000);

          db.prepare(`
            INSERT INTO account (id, userId, accountId, providerId, password, createdAt, updatedAt)
            VALUES (?, ?, ?, 'email', ?, ?, ?)
          `).run(accountId, selectedUser, user.email, hashedPassword, now, now);
        }

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
