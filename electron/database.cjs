const Database = require('better-sqlite3');
const path = require('path');
const { app, ipcMain } = require('electron');

let db;

function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'database.sqlite');
  db = new Database(dbPath);

  // Initialize Tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS stations (
      id TEXT PRIMARY KEY,
      data TEXT
    );
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      data TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      data TEXT
    );
    CREATE TABLE IF NOT EXISTS menu (
      id TEXT PRIMARY KEY,
      data TEXT
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      data TEXT
    );
    CREATE TABLE IF NOT EXISTS pricing_rules (
      id TEXT PRIMARY KEY,
      data TEXT
    );
    CREATE TABLE IF NOT EXISTS review_requests (
      id TEXT PRIMARY KEY,
      data TEXT
    );
    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      data TEXT
    );
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      data TEXT
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      data TEXT
    );
    CREATE TABLE IF NOT EXISTS whatsapp_queue (
      id TEXT PRIMARY KEY,
      data TEXT
    );
    CREATE TABLE IF NOT EXISTS whatsapp_promotions (
      id TEXT PRIMARY KEY,
      data TEXT
    );
  `);
  
  // Seed initial settings if empty
  const settingsCount = db.prepare('SELECT COUNT(*) as count FROM settings').get();
  if (settingsCount.count === 0) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('app_settings', JSON.stringify({
      cafe_name: 'Saara Gaming Zone',
      currency_symbol: '₹',
      loyalty_conversion_rate: 10,
      loyalty_expiry_enabled: false,
      loyalty_expiry_days: 30,
      admin_password: 'admin',
      google_review_url: 'https://g.page/r/YOUR_UNIQUE_LINK/review',
      review_delay_mins: 30,
      station_layout_version: 2
    }));
  }

  // Seed initial stations if empty
  const stationsCount = db.prepare('SELECT COUNT(*) as count FROM stations').get();
  if (stationsCount.count === 0) {
    const ps5Rates = { 1: 200, 2: 280, 3: 380, 4: 450 };
    const initialStations = [
      { id: '1', name: 'PS5 Unit 1', type: 'ps5', hourly_rate: 200, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5, player_rates: ps5Rates },
      { id: '2', name: 'PS5 Unit 2', type: 'ps5', hourly_rate: 200, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5, player_rates: ps5Rates },
      { id: '3', name: 'PS5 Unit 3', type: 'ps5', hourly_rate: 200, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5, player_rates: ps5Rates },
      { id: '4', name: 'Sim Racing', type: 'ps5_simracing', hourly_rate: 300, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5 },
      { id: '5', name: 'Snooker 1', type: 'snooker', hourly_rate: 150, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5 },
      { id: '6', name: 'Snooker 2', type: 'snooker', hourly_rate: 150, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5 }
    ];
    for (const station of initialStations) {
      db.prepare('INSERT INTO stations (id, data) VALUES (?, ?)').run(station.id, JSON.stringify(station));
    }
  }
}

// Helper to interact with table containing JSON data column
const jsonStore = {
  getAll: (table) => {
    return db.prepare(`SELECT data FROM ${table}`).all().map(row => JSON.parse(row.data));
  },
  getById: (table, id) => {
    const row = db.prepare(`SELECT data FROM ${table} WHERE id = ?`).get(id);
    return row ? JSON.parse(row.data) : null;
  },
  add: (table, item) => {
    db.prepare(`INSERT INTO ${table} (id, data) VALUES (?, ?)`).run(item.id, JSON.stringify(item));
    return item;
  },
  update: (table, id, itemPartial) => {
    const current = jsonStore.getById(table, id);
    if (current) {
      const updated = { ...current, ...itemPartial };
      db.prepare(`UPDATE ${table} SET data = ? WHERE id = ?`).run(JSON.stringify(updated), id);
      return updated;
    }
  },
  delete: (table, id) => {
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
  }
};

function setupIpcHandlers() {
  initDatabase();

  // STATIONS
  ipcMain.handle('db:stations:getAll', () => jsonStore.getAll('stations'));
  ipcMain.handle('db:stations:add', (_, item) => jsonStore.add('stations', item));
  ipcMain.handle('db:stations:update', (_, id, data) => jsonStore.update('stations', id, data));
  ipcMain.handle('db:stations:delete', (_, id) => jsonStore.delete('stations', id));

  // CUSTOMERS
  ipcMain.handle('db:customers:getAll', () => jsonStore.getAll('customers'));
  ipcMain.handle('db:customers:getById', (_, id) => jsonStore.getById('customers', id));
  ipcMain.handle('db:customers:add', (_, item) => jsonStore.add('customers', item));
  ipcMain.handle('db:customers:update', (_, id, data) => jsonStore.update('customers', id, data));

  // SESSIONS
  ipcMain.handle('db:sessions:getAll', () => jsonStore.getAll('sessions'));
  ipcMain.handle('db:sessions:add', (_, item) => jsonStore.add('sessions', item));
  ipcMain.handle('db:sessions:update', (_, id, data) => jsonStore.update('sessions', id, data));
  ipcMain.handle('db:sessions:getActiveByStation', (_, stationId) => {
    const sessions = jsonStore.getAll('sessions');
    return sessions.find(s => s.station_id === stationId && s.status === 'active');
  });

  // MENU
  ipcMain.handle('db:menu:getAll', () => jsonStore.getAll('menu'));
  ipcMain.handle('db:menu:add', (_, item) => jsonStore.add('menu', item));
  ipcMain.handle('db:menu:update', (_, id, data) => jsonStore.update('menu', id, data));
  ipcMain.handle('db:menu:delete', (_, id) => jsonStore.delete('menu', id));

  // TRANSACTIONS
  ipcMain.handle('db:transactions:getAll', () => jsonStore.getAll('transactions'));
  ipcMain.handle('db:transactions:add', (_, item) => jsonStore.add('transactions', item));

  // SETTINGS
  ipcMain.handle('db:settings:get', () => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('app_settings');
    return row ? JSON.parse(row.value) : {};
  });
  ipcMain.handle('db:settings:update', (_, data) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('app_settings');
    const current = row ? JSON.parse(row.value) : {};
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(JSON.stringify({ ...current, ...data }), 'app_settings');
  });

  // PRICING RULES
  ipcMain.handle('db:pricingRules:getAll', () => jsonStore.getAll('pricing_rules'));
  ipcMain.handle('db:pricingRules:add', (_, item) => jsonStore.add('pricing_rules', item));
  ipcMain.handle('db:pricingRules:update', (_, id, data) => jsonStore.update('pricing_rules', id, data));
  ipcMain.handle('db:pricingRules:delete', (_, id) => jsonStore.delete('pricing_rules', id));

  // REVIEW REQUESTS
  ipcMain.handle('db:reviewRequests:getAll', () => jsonStore.getAll('review_requests'));
  ipcMain.handle('db:reviewRequests:add', (_, item) => jsonStore.add('review_requests', item));
  ipcMain.handle('db:reviewRequests:markSent', (_, id) => jsonStore.update('review_requests', id, { sent: true }));

  // TEMPLATES
  ipcMain.handle('db:templates:getAll', () => jsonStore.getAll('templates'));
  ipcMain.handle('db:templates:add', (_, item) => jsonStore.add('templates', item));
  ipcMain.handle('db:templates:update', (_, id, data) => jsonStore.update('templates', id, data));
  ipcMain.handle('db:templates:delete', (_, id) => jsonStore.delete('templates', id));

  // GAMES
  ipcMain.handle('db:games:getAll', () => jsonStore.getAll('games'));
  ipcMain.handle('db:games:add', (_, item) => jsonStore.add('games', item));
  ipcMain.handle('db:games:update', (_, id, data) => jsonStore.update('games', id, data));
  ipcMain.handle('db:games:delete', (_, id) => jsonStore.delete('games', id));

  // EXPENSES
  ipcMain.handle('db:expenses:getAll', () => jsonStore.getAll('expenses'));
  ipcMain.handle('db:expenses:add', (_, item) => jsonStore.add('expenses', item));
  ipcMain.handle('db:expenses:delete', (_, id) => jsonStore.delete('expenses', id));

  // WHATSAPP QUEUE
  ipcMain.handle('db:whatsappQueue:getAll', () => jsonStore.getAll('whatsapp_queue'));
  ipcMain.handle('db:whatsappQueue:add', (_, item) => jsonStore.add('whatsapp_queue', item));
  ipcMain.handle('db:whatsappQueue:update', (_, id, data) => jsonStore.update('whatsapp_queue', id, data));
  ipcMain.handle('db:whatsappQueue:delete', (_, id) => jsonStore.delete('whatsapp_queue', id));
  ipcMain.handle('db:whatsappQueue:clear', () => {
    db.prepare('DELETE FROM whatsapp_queue').run();
  });

  // WHATSAPP PROMOTIONS
  ipcMain.handle('db:whatsappPromotions:getAll', () => jsonStore.getAll('whatsapp_promotions'));
  ipcMain.handle('db:whatsappPromotions:add', (_, item) => jsonStore.add('whatsapp_promotions', item));
  ipcMain.handle('db:whatsappPromotions:update', (_, id, data) => jsonStore.update('whatsapp_promotions', id, data));
  ipcMain.handle('db:whatsappPromotions:delete', (_, id) => jsonStore.delete('whatsapp_promotions', id));

  // AUTH
  let isAuth = false;
  ipcMain.handle('auth:login', (_, password) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('app_settings');
    const settings = row ? JSON.parse(row.value) : {};
    const correctPassword = settings.admin_password || 'admin';
    if (password === correctPassword) {
      isAuth = true;
      return true;
    }
    return false;
  });
  ipcMain.handle('auth:check', () => isAuth);
  ipcMain.handle('auth:logout', () => { isAuth = false; return true; });
}

module.exports = { setupIpcHandlers, jsonStore };
