import type { Station, Customer, Session, Transaction, MenuItem, AppSettings, PricingRule, Game } from '../types';

// Mock Data
const ps5PlayerRates = { 1: 200, 2: 280, 3: 380, 4: 450 };

let stations: Station[] = [
  { id: '1', name: 'Unit 1', type: 'ps5', hourly_rate: 200, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5, installed_games: ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7'], player_rates: ps5PlayerRates },
  { id: '2', name: 'Unit 2', type: 'ps5', hourly_rate: 200, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5, installed_games: ['g2', 'g8', 'g9', 'g10', 'g3', 'g11', 'g7', 'g1'], player_rates: ps5PlayerRates },
  { id: '3', name: 'Unit 3', type: 'ps5', hourly_rate: 200, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5, installed_games: ['g8', 'g12', 'g3', 'g7', 'g4', 'g1', 'g13', 'g14', 'g11', 'g15'], player_rates: ps5PlayerRates },
  { id: '4', name: 'Unit 4', type: 'ps5', hourly_rate: 200, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5, installed_games: ['g16', 'g14', 'g2', 'g12', 'g1', 'g7', 'g8', 'g4', 'g17', 'g13'], player_rates: ps5PlayerRates },
  { id: '5', name: 'Unit 5', type: 'ps5', hourly_rate: 200, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5, installed_games: ['g2', 'g11', 'g4', 'g10', 'g3', 'g14', 'g5', 'g7', 'g1', 'g18'], player_rates: ps5PlayerRates },
  { id: '6', name: 'Unit 6 (VR)', type: 'ps5_vr', hourly_rate: 200, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5, installed_games: ['g19'] },
  { id: '7', name: 'Unit 7 (Sim Racing)', type: 'ps5_simracing', hourly_rate: 300, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5, installed_games: ['g20', 'g7'] },
  { id: '8', name: 'Snooker Table 1', type: 'snooker', hourly_rate: 150, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5, installed_games: [] },
  { id: '9', name: 'Snooker Table 2', type: 'snooker', hourly_rate: 150, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5, installed_games: [] }
];

let customers: Customer[] = [
  { id: '101', name: 'Alice Smith', phone: '555-0101', wallet_balance: 0, available_minutes: 0, loyalty_points: 50, created_at: Date.now(), loyalty_points_updated_at: Date.now(), loyalty_reminder_sent: false },
  { id: '102', name: 'Bob Johnson', phone: '555-0102', wallet_balance: 0, available_minutes: 120, loyalty_points: 120, created_at: Date.now(), loyalty_points_updated_at: Date.now(), loyalty_reminder_sent: false },
];
let sessions: Session[] = [];
let transactions: Transaction[] = [];
let expenses: import('../types').Expense[] = [];
let menuItems: MenuItem[] = [
  { id: '1', name: 'Coke', price: 50, category: 'drink', active: true, stock_quantity: 20 },
  { id: '2', name: 'Chips', price: 30, category: 'snack', active: true, stock_quantity: 15 },
  { id: '3', name: '2hr PS5 + Coke', price: 180, category: 'combo', active: true },
  { id: 'pkg-5', name: '5 Hour Package', price: 400, category: 'package', active: true, package_minutes: 300 },
  { id: 'pkg-10', name: '10 Hour Package', price: 750, category: 'package', active: true, package_minutes: 600 },
  { id: 'pkg-15', name: '15 Hour Package', price: 1000, category: 'package', active: true, package_minutes: 900 },
];

let games: Game[] = [
  { id: 'g1', name: 'WWE 2K26', total_copies: 5, active: true },
  { id: 'g2', name: 'Gran Turismo 7', total_copies: 4, active: true },
  { id: 'g3', name: 'FC 26', total_copies: 4, active: true },
  { id: 'g4', name: 'GTA V', total_copies: 4, active: true },
  { id: 'g5', name: 'A Way Out', total_copies: 2, active: true },
  { id: 'g6', name: 'Dirt 5', total_copies: 1, active: true },
  { id: 'g7', name: 'Asphalt Legends', total_copies: 6, active: true },
  { id: 'g8', name: 'God of War', total_copies: 3, active: true },
  { id: 'g9', name: 'Sackboy', total_copies: 1, active: true },
  { id: 'g10', name: 'Mortal Kombat 1', total_copies: 2, active: true },
  { id: 'g11', name: 'Mortal Kombat 2', total_copies: 3, active: true },
  { id: 'g12', name: 'Spider-Man 2', total_copies: 2, active: true },
  { id: 'g13', name: 'Ghost of Yotei', total_copies: 2, active: true },
  { id: 'g14', name: 'Split Fiction', total_copies: 3, active: true },
  { id: 'g15', name: 'Unravel Two', total_copies: 1, active: true },
  { id: 'g16', name: 'It Takes Two', total_copies: 1, active: true },
  { id: 'g17', name: 'Uncharted', total_copies: 1, active: true },
  { id: 'g18', name: 'MotoGP', total_copies: 1, active: true },
  { id: 'g19', name: 'Horizon Call of the Mountain', total_copies: 1, active: true },
  { id: 'g20', name: 'Assetto Corsa', total_copies: 1, active: true },
];

let pricingRules: PricingRule[] = [
  { id: '1', name: 'Weekday Happy Hour', days: [1, 2, 3, 4, 5], start_time: '10:00', end_time: '16:00', fixed_hourly_rate: 80, active: true }
];

let settings: AppSettings = {
  cafe_name: 'Saara Gaming Zone',
  currency_symbol: '₹',
  loyalty_conversion_rate: 10,
  loyalty_expiry_enabled: false,
  loyalty_expiry_days: 30,
  admin_password: 'admin',
  google_review_url: 'https://g.page/r/YOUR_UNIQUE_LINK/review',
  review_delay_mins: 30,
  station_layout_version: 2
};

let reviewRequests: import('../types').ReviewRequest[] = [];
let templates: import('../types').MessageTemplate[] = [
  { id: 't1', name: 'Diwali Offer', content: 'Happy Diwali! Show this message at Saara Gaming Zone for 20% extra wallet balance on your next recharge.' },
  { id: 't2', name: 'Weekend Tournament', content: 'FIFA 24 Tournament this Saturday! Entry fee ₹200. Winner gets ₹2000 wallet balance. Reply to register.' },
  { id: 't3', name: 'Christmas Special', content: 'Merry Christmas! Enjoy flat 10% off on all snacks and drinks this weekend at Saara Gaming Zone.' },
  { id: 't4', name: 'Test Promotion', content: 'This is a test message from Saara Gaming Zone.' },
];

function saveToStorage() {
  localStorage.setItem('brandex_db', JSON.stringify({ 
    stations, customers, sessions, transactions, expenses, menuItems, pricingRules, settings, reviewRequests, games, templates
  }));
}

const hydrate = () => {
    try {
      const stored = localStorage.getItem('brandex_db');
      if (!stored) {
        saveToStorage();
        return;
      }
      const data = JSON.parse(stored);
      if (data.stations) stations = data.stations;
      if (data.customers) customers = data.customers;
      
      // Upgrade logic for existing customers without loyalty properties
      let customersUpgraded = false;
      customers = customers.map(c => {
        if (c.loyalty_points_updated_at === undefined) {
           customersUpgraded = true;
           return { ...c, loyalty_points_updated_at: Number(c.created_at), loyalty_reminder_sent: false };
        }
        return c;
      });
      if (customersUpgraded) saveToStorage();
      
      if (data.sessions) sessions = data.sessions;
      if (data.transactions) transactions = data.transactions;
      if (data.expenses) expenses = data.expenses;
      if (data.menuItems) menuItems = data.menuItems;
      if (data.pricingRules) pricingRules = data.pricingRules;
      if (data.settings) {
        settings = data.settings;
        settings.cafe_name = 'Saara Gaming Zone'; // Hardcoded per request
      }
      if (data.reviewRequests) reviewRequests = data.reviewRequests;
      if (data.games) games = data.games;
      if (data.templates) templates = data.templates;

      // Force migration for station layout
      if (!settings.station_layout_version || settings.station_layout_version < 2) {
        stations = [
          { id: '1', name: 'Unit 1', type: 'ps5', hourly_rate: 200, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5, installed_games: ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7'], player_rates: ps5PlayerRates },
          { id: '2', name: 'Unit 2', type: 'ps5', hourly_rate: 200, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5, installed_games: ['g2', 'g8', 'g9', 'g10', 'g3', 'g11', 'g7', 'g1'], player_rates: ps5PlayerRates },
          { id: '3', name: 'Unit 3', type: 'ps5', hourly_rate: 200, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5, installed_games: ['g8', 'g12', 'g3', 'g7', 'g4', 'g1', 'g13', 'g14', 'g11', 'g15'], player_rates: ps5PlayerRates },
          { id: '4', name: 'Unit 4', type: 'ps5', hourly_rate: 200, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5, installed_games: ['g16', 'g14', 'g2', 'g12', 'g1', 'g7', 'g8', 'g4', 'g17', 'g13'], player_rates: ps5PlayerRates },
          { id: '5', name: 'Unit 5', type: 'ps5', hourly_rate: 200, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5, installed_games: ['g2', 'g11', 'g4', 'g10', 'g3', 'g14', 'g5', 'g7', 'g1', 'g18'], player_rates: ps5PlayerRates },
          { id: '6', name: 'Unit 6 (VR)', type: 'ps5_vr', hourly_rate: 200, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5, installed_games: ['g19'] },
          { id: '7', name: 'Unit 7 (Sim Racing)', type: 'ps5_simracing', hourly_rate: 300, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5, installed_games: ['g20', 'g7'] },
          { id: '8', name: 'Snooker Table 1', type: 'snooker', hourly_rate: 150, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5, installed_games: [] },
          { id: '9', name: 'Snooker Table 2', type: 'snooker', hourly_rate: 150, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5, installed_games: [] }
        ];
        games = [
          { id: 'g1', name: 'WWE 2K26', total_copies: 5, active: true },
          { id: 'g2', name: 'Gran Turismo 7', total_copies: 4, active: true },
          { id: 'g3', name: 'FC 26', total_copies: 4, active: true },
          { id: 'g4', name: 'GTA V', total_copies: 4, active: true },
          { id: 'g5', name: 'A Way Out', total_copies: 2, active: true },
          { id: 'g6', name: 'Dirt 5', total_copies: 1, active: true },
          { id: 'g7', name: 'Asphalt Legends', total_copies: 6, active: true },
          { id: 'g8', name: 'God of War', total_copies: 3, active: true },
          { id: 'g9', name: 'Sackboy', total_copies: 1, active: true },
          { id: 'g10', name: 'Mortal Kombat 1', total_copies: 2, active: true },
          { id: 'g11', name: 'Mortal Kombat 2', total_copies: 3, active: true },
          { id: 'g12', name: 'Spider-Man 2', total_copies: 2, active: true },
          { id: 'g13', name: 'Ghost of Yotei', total_copies: 2, active: true },
          { id: 'g14', name: 'Split Fiction', total_copies: 3, active: true },
          { id: 'g15', name: 'Unravel Two', total_copies: 1, active: true },
          { id: 'g16', name: 'It Takes Two', total_copies: 1, active: true },
          { id: 'g17', name: 'Uncharted', total_copies: 1, active: true },
          { id: 'g18', name: 'MotoGP', total_copies: 1, active: true },
          { id: 'g19', name: 'Horizon Call of the Mountain', total_copies: 1, active: true },
          { id: 'g20', name: 'Assetto Corsa', total_copies: 1, active: true },
        ];
        settings.station_layout_version = 2;
        saveToStorage();
      }
    } catch (e) {
      console.error('Failed to parse local DB', e);
    }
};

hydrate();

// Helper to simulate network delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const db = {
  stations: {
    getAll: async (): Promise<Station[]> => {
      hydrate();
      await delay(200);
      return [...stations];
    },
    update: async (id: string, data: Partial<Station>): Promise<void> => {
      hydrate();
      await delay(200);
      stations = stations.map(s => s.id === id ? { ...s, ...data } : s);
      saveToStorage();
    },
    add: async (station: Omit<Station, 'id'>): Promise<Station> => {
      hydrate();
      await delay(200);
      const newStation = { ...station, id: crypto.randomUUID() };
      stations.push(newStation);
      saveToStorage();
      return newStation;
    },
    delete: async (id: string): Promise<void> => {
      hydrate();
      await delay(200);
      stations = stations.filter(s => s.id !== id);
      saveToStorage();
    }
  },
  customers: {
    getAll: async (): Promise<Customer[]> => {
      hydrate();
      await delay(200);
      return [...customers];
    },
    getById: async (id: string): Promise<Customer | undefined> => {
      hydrate();
      await delay(200);
      return customers.find(c => c.id === id);
    },
    add: async (customer: Omit<Customer, 'id' | 'created_at'>): Promise<Customer> => {
      hydrate();
      await delay(200);
      const newCustomer: Customer = {
        ...customer,
        id: crypto.randomUUID(),
        created_at: Date.now(),
        loyalty_points_updated_at: Date.now(),
        loyalty_reminder_sent: false
      };
      customers.push(newCustomer);
      saveToStorage();
      return newCustomer;
    },
    update: async (id: string, data: Partial<Customer>): Promise<void> => {
      hydrate();
      await delay(200);
      customers = customers.map(c => c.id === id ? { ...c, ...data } : c);
      saveToStorage();
    }
  },
  sessions: {
    getAll: async (): Promise<Session[]> => {
      hydrate();
      await delay(200);
      return [...sessions];
    },
    getActiveByStation: async (stationId: string): Promise<Session | undefined> => {
      hydrate();
      await delay(200);
      return sessions.find(s => s.station_id === stationId && s.status === 'active');
    },
    add: async (session: Omit<Session, 'id'>): Promise<Session> => {
      hydrate();
      await delay(200);
      const newSession = { ...session, id: crypto.randomUUID() };
      sessions.push(newSession);
      saveToStorage();
      return newSession;
    },
    update: async (id: string, data: Partial<Session>): Promise<void> => {
      hydrate();
      await delay(200);
      sessions = sessions.map(s => s.id === id ? { ...s, ...data } : s);
      saveToStorage();
    }
  },
  menu: {
    getAll: async (): Promise<MenuItem[]> => {
      hydrate();
      await delay(200);
      return [...menuItems];
    },
    add: async (item: Omit<MenuItem, 'id'>): Promise<MenuItem> => {
      hydrate();
      await delay(200);
      const newItem = { ...item, id: crypto.randomUUID() };
      menuItems.push(newItem);
      saveToStorage();
      return newItem;
    },
    update: async (id: string, data: Partial<MenuItem>): Promise<void> => {
      hydrate();
      await delay(200);
      menuItems = menuItems.map(m => m.id === id ? { ...m, ...data } : m);
      saveToStorage();
    },
    delete: async (id: string): Promise<void> => {
      hydrate();
      await delay(200);
      menuItems = menuItems.filter(m => m.id !== id);
      saveToStorage();
    }
  },
  transactions: {
    getAll: async (): Promise<Transaction[]> => {
      hydrate();
      await delay(200);
      return [...transactions];
    },
    add: async (transaction: Omit<Transaction, 'id' | 'timestamp'>): Promise<Transaction> => {
      hydrate();
      await delay(200);
      const newTransaction: Transaction = {
        ...transaction,
        id: crypto.randomUUID(),
        timestamp: Date.now()
      };
      transactions.push(newTransaction);
      saveToStorage();
      return newTransaction;
    }
  },
  settings: {
    get: async (): Promise<AppSettings> => {
      hydrate();
      await delay(200);
      return { ...settings };
    },
    update: async (data: Partial<AppSettings>): Promise<void> => {
      hydrate();
      await delay(200);
      settings = { ...settings, ...data };
      saveToStorage();
    }
  },
  pricingRules: {
    getAll: async (): Promise<PricingRule[]> => {
      hydrate();
      await delay(200);
      return [...pricingRules];
    },
    add: async (rule: Omit<PricingRule, 'id'>): Promise<PricingRule> => {
      hydrate();
      await delay(200);
      const newRule = { ...rule, id: crypto.randomUUID() };
      pricingRules.push(newRule);
      saveToStorage();
      return newRule;
    },
    update: async (id: string, data: Partial<PricingRule>): Promise<void> => {
      hydrate();
      await delay(200);
      pricingRules = pricingRules.map(r => r.id === id ? { ...r, ...data } : r);
      saveToStorage();
    },
    delete: async (id: string): Promise<void> => {
      hydrate();
      await delay(200);
      pricingRules = pricingRules.filter(r => r.id !== id);
      saveToStorage();
    }
  },
  reviewRequests: {
    getAll: async (): Promise<import('../types').ReviewRequest[]> => {
      hydrate();
      await delay(200);
      return [...reviewRequests];
    },
    add: async (request: Omit<import('../types').ReviewRequest, 'id' | 'created_at' | 'sent'>): Promise<void> => {
      hydrate();
      await delay(200);
      const newRequest = {
        ...request,
        id: crypto.randomUUID(),
        sent: false,
        created_at: Date.now()
      };
      reviewRequests.push(newRequest);
      saveToStorage();
    },
    markSent: async (id: string): Promise<void> => {
      hydrate();
      await delay(200);
      reviewRequests = reviewRequests.map(r => r.id === id ? { ...r, sent: true } : r);
      saveToStorage();
    }
  },
  templates: {
    getAll: async () => templates,
    add: async (template: Omit<import('../types').MessageTemplate, 'id'>) => {
      const newTemplate = {
        ...template,
        id: Math.random().toString(36).substr(2, 9),
      };
      templates.push(newTemplate);
      saveToStorage();
      return newTemplate;
    },
    update: async (id: string, template: Partial<import('../types').MessageTemplate>) => {
      const index = templates.findIndex(t => t.id === id);
      if (index !== -1) {
        templates[index] = { ...templates[index], ...template };
        saveToStorage();
      }
    },
    delete: async (id: string) => {
      templates = templates.filter(t => t.id !== id);
      saveToStorage();
    }
  },
  games: {
    getAll: async (): Promise<Game[]> => {
      hydrate();
      await delay(200);
      return [...games];
    },
    add: async (game: Omit<Game, 'id'>): Promise<Game> => {
      hydrate();
      await delay(200);
      const newGame = { ...game, id: crypto.randomUUID() };
      games.push(newGame);
      saveToStorage();
      return newGame;
    },
    update: async (id: string, data: Partial<Game>): Promise<void> => {
      hydrate();
      await delay(200);
      games = games.map(g => g.id === id ? { ...g, ...data } : g);
      saveToStorage();
    },
    delete: async (id: string): Promise<void> => {
      hydrate();
      await delay(200);
      games = games.filter(g => g.id !== id);
      saveToStorage();
    }
  },
  expenses: {
    getAll: async (): Promise<import('../types').Expense[]> => {
      hydrate();
      await delay(200);
      return [...expenses];
    },
    add: async (expense: Omit<import('../types').Expense, 'id' | 'timestamp'>): Promise<import('../types').Expense> => {
      hydrate();
      await delay(200);
      const newExpense = { ...expense, id: crypto.randomUUID(), timestamp: Date.now() };
      expenses.push(newExpense);
      saveToStorage();
      return newExpense;
    },
    delete: async (id: string): Promise<void> => {
      hydrate();
      await delay(200);
      expenses = expenses.filter(e => e.id !== id);
      saveToStorage();
    }
  }
};
