function ensureCurrencyScale(database) {
  database.transaction(() => {
    const scale = database.prepare("SELECT value FROM app_meta WHERE key='currency_scale'").pluck().get();
    if (scale === '100') return;
    if (scale !== undefined && scale !== '10') throw new Error(`Unknown currency scale: ${scale}`);
    database.exec(`
      UPDATE accounts SET balance=balance*10, max_overdraft_week=max_overdraft_week*10;
      UPDATE transactions SET amount=amount*10, overdraft_component=overdraft_component*10;
      UPDATE overdraft_weeks SET used=used*10;
    `);
    for (const [table, columns] of [
      ['accounts', ['balance', 'max_overdraft_week']],
      ['transactions', ['amount', 'overdraft_component']],
      ['overdraft_weeks', ['used']],
    ]) {
      const invalid = columns.map(column => `typeof(${column}) <> 'integer' OR ${column} NOT BETWEEN -9007199254740991 AND 9007199254740991`).join(' OR ');
      if (database.prepare(`SELECT 1 FROM ${table} WHERE ${invalid} LIMIT 1`).get()) {
        throw new Error(`Invalid or unsafe currency in ${table}; conversion rolled back`);
      }
    }
    database.prepare("INSERT INTO app_meta(key,value) VALUES('currency_scale','100') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run();
  }).immediate();
}

module.exports = { ensureCurrencyScale };
