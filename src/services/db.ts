import type { Station, Customer, Session, Transaction, MenuItem, AppSettings, PricingRule } from '../types';

// Mock Data
let stations: Station[] = [
  { id: '1', name: 'PS5 - 01', type: 'ps5', hourly_rate: 100, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5 },
  { id: '2', name: 'PS5 - 02', type: 'ps5', hourly_rate: 100, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5 },
  { id: '3', name: 'VR - 01', type: 'ps5_vr', hourly_rate: 200, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5 },
  { id: '4', name: 'Sim Rig', type: 'ps5_simracing', hourly_rate: 300, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5 },
  { id: '5', name: 'Snooker Table', type: 'snooker', hourly_rate: 150, status: 'free', overtime_block_minutes: 15, grace_period_minutes: 5 },
];

let customers: Customer[] = [
  { id: '101', name: 'Alice Smith', phone: '555-0101', wallet_balance: 0, available_minutes: 0, amount_owed: 0, loyalty_points: 50, created_at: Date.now() },
  { id: '102', name: 'Bob Johnson', phone: '555-0102', wallet_balance: 0, available_minutes: 120, amount_owed: 0, loyalty_points: 120, created_at: Date.now() },
];
let sessions: Session[] = [];
let transactions: Transaction[] = [];
let menuItems: MenuItem[] = [
  { id: '1', name: 'Coke', price: 50, category: 'drink', active: true, stock_quantity: 20 },
  { id: '2', name: 'Chips', price: 30, category: 'snack', active: true, stock_quantity: 15 },
  { id: '3', name: '2hr PS5 + Coke', price: 180, category: 'combo', active: true },
  { id: 'pkg-5', name: '5 Hour Package', price: 400, category: 'package', active: true, package_minutes: 300 },
  { id: 'pkg-10', name: '10 Hour Package', price: 750, category: 'package', active: true, package_minutes: 600 },
  { id: 'pkg-15', name: '15 Hour Package', price: 1000, category: 'package', active: true, package_minutes: 900 },
];

let pricingRules: PricingRule[] = [
  { id: '1', name: 'Weekday Happy Hour', days: [1, 2, 3, 4, 5], start_time: '10:00', end_time: '16:00', fixed_hourly_rate: 80, active: true }
];

let settings: AppSettings = {
  cafe_name: 'Brandex Cafe',
  currency_symbol: '₹',
  tax_rate_percent: 18,
  loyalty_conversion_rate: 10,
  admin_password: 'admin',
  google_review_url: 'https://g.page/r/YOUR_UNIQUE_LINK/review',
  review_delay_mins: 30
};

let reviewRequests: import('../types').ReviewRequest[] = [];

// Helper to sync with localStorage
const saveToStorage = () => {
  localStorage.setItem('brandex_db', JSON.stringify({
    stations, customers, sessions, transactions, menuItems, pricingRules, settings, reviewRequests
  }));
};

// Initialize from localStorage or use defaults
const hydrate = () => {
  const saved = localStorage.getItem('brandex_db');
  if (saved) {
    try {
      const data = JSON.parse(saved);
      if (data.stations) stations = data.stations;
      if (data.customers) customers = data.customers;
      if (data.sessions) sessions = data.sessions;
      if (data.transactions) transactions = data.transactions;
      if (data.menuItems) menuItems = data.menuItems;
      if (data.pricingRules) pricingRules = data.pricingRules;
      if (data.settings) settings = data.settings;
      if (data.reviewRequests) reviewRequests = data.reviewRequests;
    } catch (e) {
      console.error('Failed to parse local DB', e);
    }
  } else {
    // First time setup, save defaults
    saveToStorage();
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
        created_at: Date.now()
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
  }
};
