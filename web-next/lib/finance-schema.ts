import type Database from "better-sqlite3";

export function ensureFinanceSchema(database: Database.Database): void {
  database.transaction(() => database.exec(`
    CREATE TABLE IF NOT EXISTS finance_setup_versions (
      revision INTEGER PRIMARY KEY, start_month TEXT NOT NULL,
      cash INTEGER NOT NULL CHECK(typeof(cash)='integer' AND cash>=0),
      wechat INTEGER NOT NULL CHECK(typeof(wechat)='integer' AND wechat>=0),
      alipay INTEGER NOT NULL CHECK(typeof(alipay)='integer' AND alipay>=0),
      reason TEXT, recorded_by_id TEXT NOT NULL, recorded_by_name TEXT NOT NULL, recorded_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS finance_entry_versions (
      entry_id TEXT NOT NULL, revision INTEGER NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('expense','income','transfer')),
      effective_date TEXT NOT NULL, channel TEXT NOT NULL CHECK(channel IN ('WeChat','Alipay','Cash')),
      to_channel TEXT CHECK(to_channel IN ('WeChat','Alipay','Cash')),
      amount INTEGER NOT NULL CHECK(typeof(amount)='integer' AND amount>0), description TEXT NOT NULL,
      recipient TEXT, reference TEXT, voided INTEGER NOT NULL CHECK(voided IN (0,1)), reason TEXT,
      recorded_by_id TEXT NOT NULL, recorded_by_name TEXT NOT NULL, recorded_at TEXT NOT NULL,
      PRIMARY KEY(entry_id, revision),
      CHECK((kind='transfer' AND to_channel IS NOT NULL AND to_channel<>channel) OR (kind<>'transfer' AND to_channel IS NULL))
    );
    CREATE INDEX IF NOT EXISTS idx_finance_entry_date ON finance_entry_versions(effective_date,entry_id);
    CREATE TABLE IF NOT EXISTS finance_balance_versions (
      month TEXT NOT NULL, revision INTEGER NOT NULL,
      cash INTEGER NOT NULL CHECK(typeof(cash)='integer' AND cash>=0),
      wechat INTEGER NOT NULL CHECK(typeof(wechat)='integer' AND wechat>=0),
      alipay INTEGER NOT NULL CHECK(typeof(alipay)='integer' AND alipay>=0),
      explanation TEXT, recorded_by_id TEXT NOT NULL, recorded_by_name TEXT NOT NULL, recorded_at TEXT NOT NULL,
      PRIMARY KEY(month,revision)
    );
    CREATE TABLE IF NOT EXISTS finance_reports (
      id INTEGER PRIMARY KEY, month TEXT NOT NULL, revision INTEGER NOT NULL, source_hash TEXT NOT NULL,
      snapshot_json TEXT NOT NULL, reason TEXT, recorded_by_id TEXT NOT NULL, recorded_by_name TEXT NOT NULL,
      recorded_at TEXT NOT NULL, UNIQUE(month,revision)
    );
  `)).immediate();
}
