import type Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import type { CreateUser, UpdateUserProfile, UpdateUserPassword, User } from "../models";

export class UsersRepository {
  constructor(private db: Database.Database) {}

  create(data: CreateUser): User {
    const passwordHash = bcrypt.hashSync(data.password, 10);
    
    const stmt = this.db.prepare(`
      INSERT INTO users (name, email, password_hash, avatar)
      VALUES (?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      data.name,
      data.email,
      passwordHash,
      data.avatar || null
    );
    
    return this.findById(Number(result.lastInsertRowid))!;
  }

  findById(id: number): User | null {
    const stmt = this.db.prepare(`
      SELECT id, name, email, password_hash, avatar, created_at, updated_at
      FROM users
      WHERE id = ?
    `);
    
    const row = stmt.get(id) as User | undefined;
    return row || null;
  }

  findByEmail(email: string): User | null {
    const stmt = this.db.prepare(`
      SELECT id, name, email, password_hash, avatar, created_at, updated_at
      FROM users
      WHERE email = ?
    `);
    
    const row = stmt.get(email) as User | undefined;
    return row || null;
  }

  findAll(): User[] {
    const stmt = this.db.prepare(`
      SELECT id, name, email, password_hash, avatar, created_at, updated_at
      FROM users
      ORDER BY created_at DESC
    `);
    
    return stmt.all() as User[];
  }

  updateProfile(id: number, data: UpdateUserProfile): User | null {
    const updates: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) {
      updates.push("name = ?");
      values.push(data.name);
    }
    if (data.email !== undefined) {
      updates.push("email = ?");
      values.push(data.email);
    }
    if (data.avatar !== undefined) {
      updates.push("avatar = ?");
      values.push(data.avatar || null);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push("updated_at = datetime('now')");
    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE users
      SET ${updates.join(", ")}
      WHERE id = ?
    `);

    stmt.run(...values);
    return this.findById(id);
  }

  updatePassword(id: number, data: UpdateUserPassword): boolean {
    const user = this.findById(id);
    if (!user) return false;

    // Verify current password
    const isValid = bcrypt.compareSync(data.current_password, user.password_hash);
    if (!isValid) return false;

    // Hash and update new password
    const newPasswordHash = bcrypt.hashSync(data.new_password, 10);
    
    const stmt = this.db.prepare(`
      UPDATE users
      SET password_hash = ?, updated_at = datetime('now')
      WHERE id = ?
    `);

    stmt.run(newPasswordHash, id);
    return true;
  }

  delete(id: number): boolean {
    const stmt = this.db.prepare("DELETE FROM users WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }

  verifyPassword(email: string, password: string): User | null {
    const user = this.findByEmail(email);
    if (!user) return null;

    const isValid = bcrypt.compareSync(password, user.password_hash);
    return isValid ? user : null;
  }
}

