import type { Station, Customer, Session, Transaction, MenuItem, AppSettings, PricingRule, Game } from '../types';

// The 'api' object is exposed via preload.cjs
// @ts-ignore
const rawApi = typeof window !== 'undefined' ? window.api : undefined;

// In-memory / LocalStorage fallback for browser development & preview
const createBrowserMockStorage = () => {
  const getStored = (key: string, defaultVal: any) => {
    try {
      const val = localStorage.getItem(`mock_db_${key}`);
      if (!val) return defaultVal;
      const parsed = JSON.parse(val);
      
      // If table is cached as empty array in localStorage but has defaults, merge/fallback
      if (Array.isArray(parsed) && parsed.length === 0 && Array.isArray(defaultVal) && defaultVal.length > 0) {
        return defaultVal;
      }

      // If stations were cached in localStorage before installed_games was added, merge defaults
      if (key === 'stations' && Array.isArray(parsed) && Array.isArray(defaultVal)) {
        return parsed.map((st: any) => {
          const matchedDefault = defaultVal.find((d: any) => d.id === st.id || d.name?.toLowerCase() === st.name?.toLowerCase());
          if (matchedDefault && (!st.installed_games || st.installed_games.length === 0)) {
            return { ...st, installed_games: matchedDefault.installed_games };
          }
          return st;
        });
      }
      return parsed;
    } catch {
      return defaultVal;
    }
  };
  const setStored = (key: string, val: any) => {
    try {
      localStorage.setItem(`mock_db_${key}`, JSON.stringify(val));
    } catch {}
  };

  const defaultSettings: AppSettings = {
    cafe_name: 'Sara Gaming Zone',
    currency_symbol: '₹',
    loyalty_conversion_rate: 10,
    loyalty_expiry_enabled: false,
    loyalty_expiry_days: 30,
    session_start_delay_sec: 0,
    station_layout_version: 2,
    admin_password: 'admin',
    google_review_url: 'https://g.page/r/YOUR_UNIQUE_LINK/review',
    review_delay_mins: 30,
  };

  const defaultStations: Station[] = [
    { id: '1', name: 'PS5 Unit 1', type: 'ps5', hourly_rate: 200, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5, installed_games: ['g1', 'g2', 'g3', 'g4', 'g9', 'g10'] },
    { id: '2', name: 'PS5 Unit 2', type: 'ps5', hourly_rate: 200, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5, installed_games: ['g1', 'g2', 'g3', 'g4', 'g9', 'g10'] },
    { id: '3', name: 'PS5 Unit 3', type: 'ps5', hourly_rate: 200, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5, installed_games: [
      'g1',  // WWE 2K26
      'g2',  // Asphalt Legends
      'g3',  // Split Fiction
      'g4',  // GTA 5
      'g5',  // God of War
      'g6',  // Spider-Man 2
      'g7',  // Ghost of Yōtei
      'g9',  // Mortal Kombat 2
      'g10', // FC 26
      'g11'  // Unravel Two (Unique)
    ] },
    { id: '4', name: 'PS5 Unit 4', type: 'ps5', hourly_rate: 200, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5, installed_games: [
      'g1',  // WWE 2K26
      'g2',  // Asphalt Legends
      'g3',  // Split Fiction
      'g4',  // GTA 5
      'g5',  // God of War
      'g6',  // Spider-Man 2
      'g7',  // Ghost of Yōtei
      'g8',  // Gran Turismo 7
      'g12', // It Takes Two (Unique)
      'g13'  // Uncharted (Unique)
    ] },
    { id: '5', name: 'PS5 Unit 5', type: 'ps5', hourly_rate: 200, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5, installed_games: [
      'g1',  // WWE 2K26
      'g2',  // Asphalt Legends
      'g3',  // Split Fiction
      'g4',  // GTA 5
      'g8',  // Gran Turismo 7
      'g9',  // Mortal Kombat 2
      'g10', // FC 26
      'g14', // Mortal Kombat 1 (Unique)
      'g15', // A Way Out (Unique)
      'g16'  // MotoGP (Unique)
    ] },
    { id: '6', name: 'Sim Racing',  type: 'ps5_simracing', hourly_rate: 300, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5 },
    { id: '7', name: 'Snooker 1',  type: 'snooker', hourly_rate: 150, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5 },
  ];

  const defaultGames: Game[] = [
    { id: 'g1', name: 'WWE 2K26', total_copies: 3, active: true },
    { id: 'g2', name: 'Asphalt Legends', total_copies: 3, active: true },
    { id: 'g3', name: 'Split Fiction', total_copies: 3, active: true },
    { id: 'g4', name: 'GTA 5', total_copies: 3, active: true },
    { id: 'g5', name: 'God of War', total_copies: 2, active: true },
    { id: 'g6', name: 'Spider-Man 2', total_copies: 2, active: true },
    { id: 'g7', name: 'Ghost of Yōtei', total_copies: 2, active: true },
    { id: 'g8', name: 'Gran Turismo 7', total_copies: 2, active: true },
    { id: 'g9', name: 'Mortal Kombat 2', total_copies: 2, active: true },
    { id: 'g10', name: 'FC 26', total_copies: 2, active: true },
    { id: 'g11', name: 'Unravel Two', total_copies: 1, active: true },
    { id: 'g12', name: 'It Takes Two', total_copies: 1, active: true },
    { id: 'g13', name: 'Uncharted', total_copies: 1, active: true },
    { id: 'g14', name: 'Mortal Kombat 1', total_copies: 1, active: true },
    { id: 'g15', name: 'A Way Out', total_copies: 1, active: true },
    { id: 'g16', name: 'MotoGP', total_copies: 1, active: true },
  ];

  const defaultMenu: MenuItem[] = [
    // GAMING SERVICES (Packages)
    { id: 'm1', seed_id: 'ps5-solo-1hr',        name: 'Solo',              category: 'package', subcategory: 'PS5 GAMING',   package_minutes: 60,  price: 200, player_count: 1, active: true },
    { id: 'm2', seed_id: 'ps5-multi-2-1hr',     name: 'Multi (2)',         category: 'package', subcategory: 'PS5 GAMING',   package_minutes: 60,  price: 280, player_count: 2, active: true },
    { id: 'm3', seed_id: 'ps5-multi-3-1hr',     name: 'Multi (3)',         category: 'package', subcategory: 'PS5 GAMING',   package_minutes: 60,  price: 380, player_count: 3, active: true },
    { id: 'm4', seed_id: 'ps5-multi-4-1hr',     name: 'Multi (4)',         category: 'package', subcategory: 'PS5 GAMING',   package_minutes: 60,  price: 450, player_count: 4, active: true },
    { id: 'm5', seed_id: 'vr-standard-30min',   name: 'Standard (30 Min)', category: 'package', subcategory: 'VR GAMING',    package_minutes: 30,  price: 200, player_count: 1, active: true },
    { id: 'm6', seed_id: 'vr-standard-1hr',     name: 'Standard',          category: 'package', subcategory: 'VR GAMING',    package_minutes: 60,  price: 300, player_count: 1, active: true },
    { id: 'm7', seed_id: 'sim-racing-30min',    name: 'Standard (30 Min)', category: 'package', subcategory: 'SIM RACING',   package_minutes: 30,  price: 200, player_count: 1, active: true },
    { id: 'm8', seed_id: 'sim-racing-1hr',      name: 'Standard',          category: 'package', subcategory: 'SIM RACING',   package_minutes: 60,  price: 300, player_count: 1, active: true },
    { id: 'm9', seed_id: 'snooker-pair-1hr',    name: 'Pair',              category: 'package', subcategory: 'SNOOKER',      package_minutes: 60,  price: 200, player_count: 2, active: true },
    { id: 'm10', seed_id: 'snooker-group-1hr',   name: 'Group',             category: 'package', subcategory: 'SNOOKER',      package_minutes: 60,  price: 300, player_count: 4, active: true },
    { id: 'm11', seed_id: 'pool-pair-1hr',       name: 'Pair',              category: 'package', subcategory: 'POOL TABLE',   package_minutes: 60,  price: 180, player_count: 2, active: true },
    { id: 'm12', seed_id: 'pool-group-1hr',      name: 'Group',             category: 'package', subcategory: 'POOL TABLE',   package_minutes: 60,  price: 250, player_count: 4, active: true },
    { id: 'm13', seed_id: 'board-games-pair-1hr',name: 'Pair',              category: 'package', subcategory: 'BOARD GAMES',  package_minutes: 60,  price: 150, player_count: 2, active: true },
    { id: 'm14', seed_id: 'board-games-group-1hr',name:'Group',             category: 'package', subcategory: 'BOARD GAMES',  package_minutes: 60,  price: 250, player_count: 4, active: true },

    // FOOD MENU
    { id: 'm15', seed_id: 'food-french-fries',        name: 'French Fries',       category: 'snack', subcategory: 'FRIES / SNACKS',    price: 80,  stock_quantity: 100, active: true },
    { id: 'm16', seed_id: 'food-peri-peri-fries',     name: 'Peri Peri Fries',    category: 'snack', subcategory: 'FRIES / SNACKS',    price: 100, stock_quantity: 100, active: true },
    { id: 'm17', seed_id: 'food-potato-wedges',       name: 'Potato Wedges',      category: 'snack', subcategory: 'FRIES / SNACKS',    price: 80,  stock_quantity: 100, active: true },
    { id: 'm18', seed_id: 'food-corn-soup',           name: 'Corn Soup',          category: 'snack', subcategory: 'SOUPS',             price: 80,  stock_quantity: 100, active: true },
    { id: 'm19', seed_id: 'food-veg-samosa',          name: 'Veg Samosa',         category: 'snack', subcategory: 'VEG SNACKS',        price: 80,  stock_quantity: 100, active: true },
    { id: 'm20', seed_id: 'food-veg-spring-roll',     name: 'Veg Spring Roll',    category: 'snack', subcategory: 'VEG SNACKS',        price: 80,  stock_quantity: 100, active: true },
    { id: 'm21', seed_id: 'food-veg-cheese-nuggets',  name: 'Veg Cheese Nuggets', category: 'snack', subcategory: 'VEG SNACKS',        price: 80,  stock_quantity: 100, active: true },
    { id: 'm22', seed_id: 'food-chicken-samosa',      name: 'Chicken Samosa',     category: 'snack', subcategory: 'NON-VEG SNACKS',   price: 120, stock_quantity: 100, active: true },
    { id: 'm23', seed_id: 'food-chicken-spring-roll', name: 'Chicken Spring Roll',category: 'snack', subcategory: 'NON-VEG SNACKS',   price: 120, stock_quantity: 100, active: true },
    { id: 'm24', seed_id: 'food-chicken-nuggets',     name: 'Chicken Nuggets',    category: 'snack', subcategory: 'NON-VEG SNACKS',   price: 120, stock_quantity: 100, active: true },
    { id: 'm25', seed_id: 'food-chicken-popcorn',     name: 'Chicken Popcorn',    category: 'snack', subcategory: 'NON-VEG SNACKS',   price: 120, stock_quantity: 100, active: true },
    { id: 'm26', seed_id: 'food-chicken-fingers',     name: 'Chicken Fingers',    category: 'snack', subcategory: 'NON-VEG SNACKS',   price: 120, stock_quantity: 100, active: true },
    { id: 'm27', seed_id: 'food-masala-omelette',     name: 'Masala Omelette',    category: 'snack', subcategory: 'EGG',               price: 50,  stock_quantity: 100, active: true },
    { id: 'm28', seed_id: 'food-veg-maggie',          name: 'Veg Maggie',         category: 'snack', subcategory: 'MAGGIE / NOODLES',  price: 50,  stock_quantity: 100, active: true },
    { id: 'm29', seed_id: 'food-egg-maggie',          name: 'Egg Maggie',         category: 'snack', subcategory: 'MAGGIE / NOODLES',  price: 70,  stock_quantity: 100, active: true },
  ];

  const createTableHandlers = <T extends { id: string }>(key: string, defaults: T[] = []) => ({
    getAll: async (): Promise<T[]> => getStored(key, defaults),
    getById: async (id: string): Promise<T | undefined> => getStored(key, defaults).find((i: T) => i.id === id),
    add: async (item: T): Promise<T> => {
      const items = getStored(key, defaults);
      const next = [...items, item];
      setStored(key, next);
      return item;
    },
    update: async (id: string, data: Partial<T>): Promise<void> => {
      const items = getStored(key, defaults);
      const next = items.map((i: T) => i.id === id ? { ...i, ...data } : i);
      setStored(key, next);
    },
    delete: async (id: string): Promise<void> => {
      const items = getStored(key, defaults);
      const next = items.filter((i: T) => i.id !== id);
      setStored(key, next);
    },
  });

  return {
    db: {
      stations: createTableHandlers<Station>('stations', defaultStations),
      customers: createTableHandlers<Customer>('customers', []),
      sessions: {
        ...createTableHandlers<Session>('sessions', []),
        getActiveByStation: async (stId: string): Promise<Session | undefined> => {
          const sessions = getStored('sessions', []) as Session[];
          return sessions.find(s => s.station_id === stId && s.status === 'active');
        }
      },
      menu: createTableHandlers<MenuItem>('menu', defaultMenu),
      transactions: createTableHandlers<Transaction>('transactions', []),
      pricingRules: createTableHandlers<PricingRule>('pricingRules', []),
      reviewRequests: {
        getAll: async () => getStored('review_requests', []),
        add: async (req: any) => {
          const cur = getStored('review_requests', []);
          setStored('review_requests', [...cur, req]);
        },
        markSent: async (id: string) => {
          const cur = getStored('review_requests', []);
          setStored('review_requests', cur.map((r: any) => r.id === id ? { ...r, sent: true } : r));
        }
      },
      templates: createTableHandlers<any>('templates', []),
      games: createTableHandlers<Game>('games', defaultGames),
      expenses: createTableHandlers<any>('expenses', []),
      whatsappQueue: {
        getAll: async () => getStored('wa_queue', []),
        add: async (it: any) => { const cur = getStored('wa_queue', []); setStored('wa_queue', [...cur, it]); },
        update: async (id: string, d: any) => { const cur = getStored('wa_queue', []); setStored('wa_queue', cur.map((i: any) => i.id === id ? { ...i, ...d } : i)); },
        delete: async (id: string) => { const cur = getStored('wa_queue', []); setStored('wa_queue', cur.filter((i: any) => i.id !== id)); },
        clear: async () => { setStored('wa_queue', []); },
        resend: async () => {},
      },
      whatsappPromotions: createTableHandlers<any>('wa_promos', []),
      settings: {
        get: async (): Promise<AppSettings> => getStored('settings', defaultSettings),
        update: async (data: Partial<AppSettings>): Promise<void> => {
          const cur = getStored('settings', defaultSettings);
          setStored('settings', { ...cur, ...data });
        }
      },
      backup: {
        export: async () => ({}),
        restore: async () => ({ success: true }),
        writeExportFile: async () => {},
        readImportFile: async () => ({}),
      }
    },
    whatsapp: {
      getStatus: async () => ({ ready: false, qr: null }),
      sendInvoice: async () => {},
      reconnect: async () => {},
    },
    updater: {
      checkForUpdates: () => {},
      installUpdate: () => {},
      onUpdateChecking: () => {},
      onUpdateAvailable: () => {},
      onUpdateNotAvailable: () => {},
      onUpdateDownloaded: () => {},
      onUpdateProgress: () => {},
      onUpdateError: () => {},
      removeListeners: () => {},
    },
    dialog: {
      showSaveDialog: async () => '',
      showOpenDialog: async () => null,
    },
    auth: {
      login: async () => true,
      check: async () => true,
      logout: async () => true,
    }
  };
};

const api = rawApi || createBrowserMockStorage();

export const db = {
  stations: {
    getAll:  async (): Promise<Station[]>  => api.db.stations.getAll(),
    update:  async (id: string, data: Partial<Station>): Promise<void> => api.db.stations.update(id, data),
    add:     async (station: Omit<Station, 'id'>): Promise<Station> => {
      const newStation = { ...station, id: crypto.randomUUID() };
      return api.db.stations.add(newStation);
    },
    delete: async (id: string): Promise<void> => api.db.stations.delete(id),
  },
  customers: {
    getAll:  async (): Promise<Customer[]> => api.db.customers.getAll(),
    getById: async (id: string): Promise<Customer | undefined> => api.db.customers.getById(id),
    add:     async (customer: Omit<Customer, 'id' | 'created_at'>): Promise<Customer> => {
      const newCustomer: Customer = {
        ...customer,
        id: crypto.randomUUID(),
        created_at: Date.now(),
        loyalty_points_updated_at: Date.now(),
        loyalty_reminder_sent: false,
      };
      return api.db.customers.add(newCustomer);
    },
    update: async (id: string, data: Partial<Customer>): Promise<void> => api.db.customers.update(id, data),
  },
  sessions: {
    getAll:              async (): Promise<Session[]>                      => api.db.sessions.getAll(),
    getActiveByStation:  async (stationId: string): Promise<Session | undefined> => api.db.sessions.getActiveByStation(stationId),
    add:                 async (session: Omit<Session, 'id'>): Promise<Session>  => {
      const newSession = { ...session, id: crypto.randomUUID() };
      return api.db.sessions.add(newSession);
    },
    update: async (id: string, data: Partial<Session>): Promise<void> => api.db.sessions.update(id, data),
  },
  menu: {
    getAll:  async (): Promise<MenuItem[]> => api.db.menu.getAll(),
    add:     async (item: Omit<MenuItem, 'id'>): Promise<MenuItem> => {
      const newItem = { ...item, id: crypto.randomUUID() };
      return api.db.menu.add(newItem);
    },
    update:  async (id: string, data: Partial<MenuItem>): Promise<void> => api.db.menu.update(id, data),
    delete:  async (id: string): Promise<void>                          => api.db.menu.delete(id),
  },
  transactions: {
    getAll: async (): Promise<Transaction[]> => api.db.transactions.getAll(),
    add:    async (transaction: Omit<Transaction, 'id' | 'timestamp'>): Promise<Transaction> => {
      const newTransaction: Transaction = {
        ...transaction,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
      };
      return api.db.transactions.add(newTransaction);
    },
  },
  settings: {
    get:    async (): Promise<AppSettings>               => api.db.settings.get(),
    update: async (data: Partial<AppSettings>): Promise<void> => api.db.settings.update(data),
  },
  pricingRules: {
    getAll:  async (): Promise<PricingRule[]>                    => api.db.pricingRules.getAll(),
    add:     async (rule: Omit<PricingRule, 'id'>): Promise<PricingRule> => {
      const newRule = { ...rule, id: crypto.randomUUID() };
      return api.db.pricingRules.add(newRule);
    },
    update:  async (id: string, data: Partial<PricingRule>): Promise<void> => api.db.pricingRules.update(id, data),
    delete:  async (id: string): Promise<void>                             => api.db.pricingRules.delete(id),
  },
  reviewRequests: {
    getAll:   async (): Promise<import('../types').ReviewRequest[]> => api.db.reviewRequests.getAll(),
    add:      async (request: Omit<import('../types').ReviewRequest, 'id' | 'created_at' | 'sent'>): Promise<void> => {
      const newRequest = { ...request, id: crypto.randomUUID(), sent: false, created_at: Date.now() };
      return api.db.reviewRequests.add(newRequest);
    },
    markSent: async (id: string): Promise<void> => api.db.reviewRequests.markSent(id),
  },
  templates: {
    getAll:  async (): Promise<import('../types').MessageTemplate[]> => api.db.templates.getAll(),
    add:     async (template: Omit<import('../types').MessageTemplate, 'id'>) => {
      const newTemplate = { ...template, id: crypto.randomUUID() };
      return api.db.templates.add(newTemplate);
    },
    update:  async (id: string, template: Partial<import('../types').MessageTemplate>) => api.db.templates.update(id, template),
    delete:  async (id: string) => api.db.templates.delete(id),
  },
  games: {
    getAll:  async (): Promise<Game[]> => api.db.games.getAll(),
    add:     async (game: Omit<Game, 'id'>): Promise<Game> => {
      const newGame = { ...game, id: crypto.randomUUID() };
      return api.db.games.add(newGame);
    },
    update:  async (id: string, data: Partial<Game>): Promise<void> => api.db.games.update(id, data),
    delete:  async (id: string): Promise<void>                      => api.db.games.delete(id),
  },
  expenses: {
    getAll:  async (): Promise<import('../types').Expense[]> => api.db.expenses.getAll(),
    add:     async (expense: Omit<import('../types').Expense, 'id' | 'timestamp'>): Promise<import('../types').Expense> => {
      const newExpense = { ...expense, id: crypto.randomUUID(), timestamp: Date.now() };
      return api.db.expenses.add(newExpense);
    },
    delete: async (id: string): Promise<void> => api.db.expenses.delete(id),
  },
  whatsappQueue: {
    getAll:  async () => api.db.whatsappQueue.getAll(),
    add:     async (item: any) => api.db.whatsappQueue.add(item),
    update:  async (id: string, data: any) => api.db.whatsappQueue.update(id, data),
    delete:  async (id: string) => api.db.whatsappQueue.delete(id),
    clear:   async () => api.db.whatsappQueue.clear(),
    resend:  async (id: string) => api.db.whatsappQueue.resend(id),
  },
  whatsappPromotions: {
    getAll:  async () => api.db.whatsappPromotions.getAll(),
    add:     async (item: any) => api.db.whatsappPromotions.add(item),
    update:  async (id: string, data: any) => api.db.whatsappPromotions.update(id, data),
    delete:  async (id: string) => api.db.whatsappPromotions.delete(id),
    cancel:  async (id: string) => api.db.whatsappPromotions.cancel(id),
  },
  backup: {
    exportBackup:    async () => api.db.backup.export(),
    restoreBackup:   async (data: any) => api.db.backup.restore(data),
    writeExportFile: async (filePath: string, data: any) => api.db.backup.writeExportFile(filePath, data),
    readImportFile:  async (filePath: string) => api.db.backup.readImportFile(filePath),
  },
};

export const whatsapp = {
  getStatus:   async () => api.whatsapp.getStatus(),
  sendInvoice: async (data: any) => api.whatsapp.sendInvoice(data),
  reconnect:   async () => api.whatsapp.reconnect(),
};

export const updater = {
  checkForUpdates:      () => api.updater.checkForUpdates(),
  installUpdate:        () => api.updater.installUpdate(),
  onUpdateChecking:     (cb: () => void) => api.updater.onUpdateChecking(cb),
  onUpdateAvailable:    (cb: (info: any) => void) => api.updater.onUpdateAvailable(cb),
  onUpdateNotAvailable: (cb: (info: any) => void) => api.updater.onUpdateNotAvailable(cb),
  onUpdateDownloaded:   (cb: (info: any) => void) => api.updater.onUpdateDownloaded(cb),
  onUpdateProgress:     (cb: (info: any) => void) => api.updater.onUpdateProgress(cb),
  onUpdateError:        (cb: (err: any) => void) => api.updater.onUpdateError(cb),
  removeListeners:      () => api.updater.removeListeners(),
};

export const dialog = {
  showSaveDialog: (filename: string) => api.dialog.showSaveDialog(filename),
  showOpenDialog: () => api.dialog.showOpenDialog(),
};
