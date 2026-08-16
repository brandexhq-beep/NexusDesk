const Database = require('better-sqlite3');
const path = require('path');
const { app, ipcMain } = require('electron');
const crypto = require('crypto');

let db;

// ─── JSON Store Helper ────────────────────────────────────────────────────────
// Must be declared before initDatabase so seed functions can use it.
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

// ─── Sara Gaming Zone Seed ────────────────────────────────────────────────────
// Idempotent: only inserts records whose seed_id does not yet exist.
// Runs once at startup only when the cafe name matches.
// Does NOT overwrite user edits and will NOT recreate deleted records.
function runSaraGamingSeed() {
  const seedMenu = [
    // GAMING SERVICES (Packages)
    { seed_id: 'ps5-solo-1hr',        name: 'Solo',              category: 'package', subcategory: 'PS5 GAMING',   package_minutes: 60,  price: 200, player_count: 1, active: true },
    { seed_id: 'ps5-multi-2-1hr',     name: 'Multi (2)',         category: 'package', subcategory: 'PS5 GAMING',   package_minutes: 60,  price: 280, player_count: 2, active: true },
    { seed_id: 'ps5-multi-3-1hr',     name: 'Multi (3)',         category: 'package', subcategory: 'PS5 GAMING',   package_minutes: 60,  price: 380, player_count: 3, active: true },
    { seed_id: 'ps5-multi-4-1hr',     name: 'Multi (4)',         category: 'package', subcategory: 'PS5 GAMING',   package_minutes: 60,  price: 450, player_count: 4, active: true },
    { seed_id: 'vr-standard-30min',   name: 'Standard (30 Min)', category: 'package', subcategory: 'VR GAMING',    package_minutes: 30,  price: 200, player_count: 1, active: true },
    { seed_id: 'vr-standard-1hr',     name: 'Standard',          category: 'package', subcategory: 'VR GAMING',    package_minutes: 60,  price: 300, player_count: 1, active: true },
    { seed_id: 'sim-racing-30min',    name: 'Standard (30 Min)', category: 'package', subcategory: 'SIM RACING',   package_minutes: 30,  price: 200, player_count: 1, active: true },
    { seed_id: 'sim-racing-1hr',      name: 'Standard',          category: 'package', subcategory: 'SIM RACING',   package_minutes: 60,  price: 300, player_count: 1, active: true },
    { seed_id: 'snooker-pair-1hr',    name: 'Pair',              category: 'package', subcategory: 'SNOOKER',      package_minutes: 60,  price: 200, player_count: 2, active: true },
    { seed_id: 'snooker-group-1hr',   name: 'Group',             category: 'package', subcategory: 'SNOOKER',      package_minutes: 60,  price: 300, player_count: 4, active: true },
    { seed_id: 'pool-pair-1hr',       name: 'Pair',              category: 'package', subcategory: 'POOL TABLE',   package_minutes: 60,  price: 180, player_count: 2, active: true },
    { seed_id: 'pool-group-1hr',      name: 'Group',             category: 'package', subcategory: 'POOL TABLE',   package_minutes: 60,  price: 250, player_count: 4, active: true },
    { seed_id: 'board-games-pair-1hr',name: 'Pair',              category: 'package', subcategory: 'BOARD GAMES',  package_minutes: 60,  price: 150, player_count: 2, active: true },
    { seed_id: 'board-games-group-1hr',name:'Group',             category: 'package', subcategory: 'BOARD GAMES',  package_minutes: 60,  price: 250, player_count: 4, active: true },

    // FOOD MENU
    { seed_id: 'food-french-fries',        name: 'French Fries',       category: 'snack', subcategory: 'FRIES / SNACKS',    price: 80,  stock_quantity: 100, active: true },
    { seed_id: 'food-peri-peri-fries',     name: 'Peri Peri Fries',    category: 'snack', subcategory: 'FRIES / SNACKS',    price: 100, stock_quantity: 100, active: true },
    { seed_id: 'food-potato-wedges',       name: 'Potato Wedges',      category: 'snack', subcategory: 'FRIES / SNACKS',    price: 80,  stock_quantity: 100, active: true },
    { seed_id: 'food-corn-soup',           name: 'Corn Soup',          category: 'snack', subcategory: 'SOUPS',             price: 80,  stock_quantity: 100, active: true },
    { seed_id: 'food-veg-samosa',          name: 'Veg Samosa',         category: 'snack', subcategory: 'VEG SNACKS',        price: 80,  stock_quantity: 100, active: true },
    { seed_id: 'food-veg-spring-roll',     name: 'Veg Spring Roll',    category: 'snack', subcategory: 'VEG SNACKS',        price: 80,  stock_quantity: 100, active: true },
    { seed_id: 'food-veg-cheese-nuggets',  name: 'Veg Cheese Nuggets', category: 'snack', subcategory: 'VEG SNACKS',        price: 80,  stock_quantity: 100, active: true },
    { seed_id: 'food-chicken-samosa',      name: 'Chicken Samosa',     category: 'snack', subcategory: 'NON-VEG SNACKS',   price: 120, stock_quantity: 100, active: true },
    { seed_id: 'food-chicken-spring-roll', name: 'Chicken Spring Roll',category: 'snack', subcategory: 'NON-VEG SNACKS',   price: 120, stock_quantity: 100, active: true },
    { seed_id: 'food-chicken-nuggets',     name: 'Chicken Nuggets',    category: 'snack', subcategory: 'NON-VEG SNACKS',   price: 120, stock_quantity: 100, active: true },
    { seed_id: 'food-chicken-popcorn',     name: 'Chicken Popcorn',    category: 'snack', subcategory: 'NON-VEG SNACKS',   price: 120, stock_quantity: 100, active: true },
    { seed_id: 'food-chicken-fingers',     name: 'Chicken Fingers',    category: 'snack', subcategory: 'NON-VEG SNACKS',   price: 120, stock_quantity: 100, active: true },
    { seed_id: 'food-masala-omelette',     name: 'Masala Omelette',    category: 'snack', subcategory: 'EGG',               price: 50,  stock_quantity: 100, active: true },
    { seed_id: 'food-veg-maggie',          name: 'Veg Maggie',         category: 'snack', subcategory: 'MAGGIE / NOODLES',  price: 50,  stock_quantity: 100, active: true },
    { seed_id: 'food-egg-maggie',          name: 'Egg Maggie',         category: 'snack', subcategory: 'MAGGIE / NOODLES',  price: 70,  stock_quantity: 100, active: true },
  ];

  const seedGames = [
    { seed_id: 'game-asphalt-legends',             name: 'Asphalt Legends',              category: 'MULTIPLAYER',  total_copies: 1, active: true },
    { seed_id: 'game-mortal-kombat-1',             name: 'Mortal Kombat 1',              category: 'MULTIPLAYER',  total_copies: 1, active: true },
    { seed_id: 'game-mortal-kombat-2',             name: 'Mortal Kombat 2',              category: 'MULTIPLAYER',  total_copies: 1, active: true },
    { seed_id: 'game-fc-26',                       name: 'FC 26',                        category: 'MULTIPLAYER',  total_copies: 1, active: true },
    { seed_id: 'game-wwe-2k26',                    name: 'WWE 2K26',                     category: 'MULTIPLAYER',  total_copies: 1, active: true },
    { seed_id: 'game-split-fiction',               name: 'Split Fiction',                category: 'MULTIPLAYER',  total_copies: 1, active: true },
    { seed_id: 'game-sackboy',                     name: 'Sackboy',                      category: 'MULTIPLAYER',  total_copies: 1, active: true },
    { seed_id: 'game-gran-turismo-7',              name: 'Gran Turismo 7',               category: 'MULTIPLAYER',  total_copies: 1, active: true },
    { seed_id: 'game-it-takes-two',                name: 'It Takes Two',                 category: 'MULTIPLAYER',  total_copies: 1, active: true },
    { seed_id: 'game-unravel-two',                 name: 'Unravel Two',                  category: 'MULTIPLAYER',  total_copies: 1, active: true },
    { seed_id: 'game-a-way-out',                   name: 'A Way Out',                    category: 'MULTIPLAYER',  total_copies: 1, active: true },
    { seed_id: 'game-gta-5',                       name: 'GTA 5',                        category: 'SINGLE PLAYER',total_copies: 1, active: true },
    { seed_id: 'game-ghost-of-yotei',              name: 'Ghost of Yotei',               category: 'SINGLE PLAYER',total_copies: 1, active: true },
    { seed_id: 'game-uncharted',                   name: 'Uncharted',                    category: 'SINGLE PLAYER',total_copies: 1, active: true },
    { seed_id: 'game-god-of-war-ragnarok',         name: 'God of War Ragnarök',          category: 'SINGLE PLAYER',total_copies: 1, active: true },
    { seed_id: 'game-spider-man-2',                name: 'Spider-Man 2',                 category: 'SINGLE PLAYER',total_copies: 1, active: true },
    { seed_id: 'game-horizon-call-of-the-mountain',name: 'Horizon Call of the Mountain', category: 'VR GAMES',     total_copies: 1, active: true },
    { seed_id: 'game-forza-horizon-5',             name: 'Forza Horizon 5',              category: 'SIM RACING',   total_copies: 1, active: true },
    { seed_id: 'game-assetto-corsa',               name: 'Assetto Corsa Competizione',   category: 'SIM RACING',   total_copies: 1, active: true },
    { seed_id: 'game-asphalt-legends-sim',         name: 'Asphalt Legends',              category: 'SIM RACING',   total_copies: 1, active: true },
    { seed_id: 'game-dirt-5',                      name: 'Dirt 5',                       category: 'SIM RACING',   total_copies: 1, active: true },
  ];

  const existingMenu  = jsonStore.getAll('menu');
  const existingGames = jsonStore.getAll('games');

  const menuSeedIds  = new Set(existingMenu.map(m => m.seed_id).filter(Boolean));
  for (const item of seedMenu) {
    if (!menuSeedIds.has(item.seed_id)) {
      item.id = crypto.randomUUID();
      jsonStore.add('menu', item);
    }
  }

  const gameSeedIds = new Set(existingGames.map(g => g.seed_id).filter(Boolean));
  for (const game of seedGames) {
    if (!gameSeedIds.has(game.seed_id)) {
      game.id = crypto.randomUUID();
      jsonStore.add('games', game);
    }
  }

  console.log('[Seed] Sara Gaming Zone data check complete.');
}

// ─── Database Initialiser ─────────────────────────────────────────────────────
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
      cafe_name: 'Sara Gaming Zone',
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
      { id: '4', name: 'Sim Racing',  type: 'ps5_simracing', hourly_rate: 300, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5 },
      { id: '5', name: 'Snooker 1',  type: 'snooker', hourly_rate: 150, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5 },
      { id: '6', name: 'Snooker 2',  type: 'snooker', hourly_rate: 150, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5 },
    ];
    for (const station of initialStations) {
      db.prepare('INSERT INTO stations (id, data) VALUES (?, ?)').run(station.id, JSON.stringify(station));
    }
  }

  // Run the Sara Gaming Zone idempotent seed
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('app_settings');
    if (row) {
      const settings = JSON.parse(row.value);
      if (
        settings.cafe_name === 'Sara Gaming Zone' ||
        settings.cafe_name === 'SARA GAMING ZONE'
      ) {
        runSaraGamingSeed();
      }
    }
  } catch (err) {
    console.error('[Seed] Sara Gaming Zone seed failed:', err.message);
  }
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────
function setupIpcHandlers() {
  initDatabase();

  const handleSafe = (channel, handler) => {
    ipcMain.handle(channel, async (...args) => {
      try {
        return await handler(...args);
      } catch (err) {
        console.error(`[DB Error] ${channel}:`, err);
        throw err; // Bubbles up to frontend safely
      }
    });
  };

  // STATIONS
  handleSafe('db:stations:getAll',    ()          => jsonStore.getAll('stations'));
  handleSafe('db:stations:add',       (_, item)   => jsonStore.add('stations', item));
  handleSafe('db:stations:update',    (_, id, d)  => jsonStore.update('stations', id, d));
  handleSafe('db:stations:delete',    (_, id)     => jsonStore.delete('stations', id));

  // CUSTOMERS
  handleSafe('db:customers:getAll',   ()          => jsonStore.getAll('customers'));
  handleSafe('db:customers:getById',  (_, id)     => jsonStore.getById('customers', id));
  handleSafe('db:customers:add',      (_, item)   => jsonStore.add('customers', item));
  handleSafe('db:customers:update',   (_, id, d)  => jsonStore.update('customers', id, d));

  // SESSIONS
  handleSafe('db:sessions:getAll',    ()          => jsonStore.getAll('sessions'));
  handleSafe('db:sessions:add',       (_, item)   => jsonStore.add('sessions', item));
  handleSafe('db:sessions:update',    (_, id, d)  => jsonStore.update('sessions', id, d));
  handleSafe('db:sessions:getActiveByStation', (_, stationId) => {
    const sessions = jsonStore.getAll('sessions');
    return sessions.find(s => s.station_id === stationId && s.status === 'active');
  });

  // MENU
  handleSafe('db:menu:getAll',        ()          => jsonStore.getAll('menu'));
  handleSafe('db:menu:add',           (_, item)   => jsonStore.add('menu', item));
  handleSafe('db:menu:update',        (_, id, d)  => jsonStore.update('menu', id, d));
  handleSafe('db:menu:delete',        (_, id)     => jsonStore.delete('menu', id));

  // TRANSACTIONS
  handleSafe('db:transactions:getAll',()          => jsonStore.getAll('transactions'));
  handleSafe('db:transactions:add',   (_, item)   => jsonStore.add('transactions', item));

  // SETTINGS
  handleSafe('db:settings:get', () => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('app_settings');
    return row ? JSON.parse(row.value) : {};
  });
  handleSafe('db:settings:update', (_, data) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('app_settings');
    const current = row ? JSON.parse(row.value) : {};
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(JSON.stringify({ ...current, ...data }), 'app_settings');
  });

  // PRICING RULES
  handleSafe('db:pricingRules:getAll',    ()          => jsonStore.getAll('pricing_rules'));
  handleSafe('db:pricingRules:add',       (_, item)   => jsonStore.add('pricing_rules', item));
  handleSafe('db:pricingRules:update',    (_, id, d)  => jsonStore.update('pricing_rules', id, d));
  handleSafe('db:pricingRules:delete',    (_, id)     => jsonStore.delete('pricing_rules', id));

  // REVIEW REQUESTS
  handleSafe('db:reviewRequests:getAll',  ()          => jsonStore.getAll('review_requests'));
  handleSafe('db:reviewRequests:add',     (_, item)   => jsonStore.add('review_requests', item));
  handleSafe('db:reviewRequests:markSent',(_, id)     => jsonStore.update('review_requests', id, { sent: true }));

  // TEMPLATES
  handleSafe('db:templates:getAll',   ()          => jsonStore.getAll('templates'));
  handleSafe('db:templates:add',      (_, item)   => jsonStore.add('templates', item));
  handleSafe('db:templates:update',   (_, id, d)  => jsonStore.update('templates', id, d));
  handleSafe('db:templates:delete',   (_, id)     => jsonStore.delete('templates', id));

  // GAMES
  handleSafe('db:games:getAll',       ()          => jsonStore.getAll('games'));
  handleSafe('db:games:add',          (_, item)   => jsonStore.add('games', item));
  handleSafe('db:games:update',       (_, id, d)  => jsonStore.update('games', id, d));
  handleSafe('db:games:delete',       (_, id)     => jsonStore.delete('games', id));

  // EXPENSES
  handleSafe('db:expenses:getAll',    ()          => jsonStore.getAll('expenses'));
  handleSafe('db:expenses:add',       (_, item)   => jsonStore.add('expenses', item));
  handleSafe('db:expenses:delete',    (_, id)     => jsonStore.delete('expenses', id));

  // WHATSAPP QUEUE
  handleSafe('db:whatsappQueue:getAll',   ()         => jsonStore.getAll('whatsapp_queue'));
  handleSafe('db:whatsappQueue:add',      (_, item)  => jsonStore.add('whatsapp_queue', item));
  handleSafe('db:whatsappQueue:update',   (_, id, d) => jsonStore.update('whatsapp_queue', id, d));
  handleSafe('db:whatsappQueue:delete',   (_, id)    => jsonStore.delete('whatsapp_queue', id));
  handleSafe('db:whatsappQueue:clear',    ()         => { db.prepare('DELETE FROM whatsapp_queue').run(); });
  // Resend: reset a failed/sent item back to pending with 0 retries
  handleSafe('db:whatsappQueue:resend',   (_, id)    => {
    jsonStore.update('whatsapp_queue', id, { status: 'pending', retryCount: 0, completedAt: null, error: null });
  });

  // WHATSAPP PROMOTIONS
  handleSafe('db:whatsappPromotions:getAll',   ()         => jsonStore.getAll('whatsapp_promotions'));
  handleSafe('db:whatsappPromotions:add',      (_, item)  => jsonStore.add('whatsapp_promotions', item));
  handleSafe('db:whatsappPromotions:update',   (_, id, d) => jsonStore.update('whatsapp_promotions', id, d));
  handleSafe('db:whatsappPromotions:delete',   (_, id)    => jsonStore.delete('whatsapp_promotions', id));
  // Cancel a scheduled promotion before it fires
  handleSafe('db:whatsappPromotions:cancel',   (_, id)    => {
    jsonStore.update('whatsapp_promotions', id, { status: 'cancelled', cancelledAt: Date.now() });
  });

  // AUTH
  let isAuth = false;
  ipcMain.handle('auth:login', (_, password) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('app_settings');
    const settings = row ? JSON.parse(row.value) : {};
    const correctPassword = settings.admin_password || 'admin';
    if (password === correctPassword) { isAuth = true; return true; }
    return false;
  });
  ipcMain.handle('auth:check',  () => isAuth);
  ipcMain.handle('auth:logout', () => { isAuth = false; return true; });
}

module.exports = { setupIpcHandlers, jsonStore };
