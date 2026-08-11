import type { Station, Customer, Session, Transaction, MenuItem, AppSettings, PricingRule, Game } from '../types';

// The 'api' object is exposed via preload.cjs
// @ts-ignore
const api = window.api;

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
};

export const whatsapp = {
  getStatus:   async () => api.whatsapp.getStatus(),
  sendInvoice: async (data: any) => api.whatsapp.sendInvoice(data),
  reconnect:   async () => api.whatsapp.reconnect(),
};

export const updater = {
  checkForUpdates: () => api.updater.checkForUpdates(),
  installUpdate:   () => api.updater.installUpdate(),
  onUpdateAvailable:  (cb: (info: any) => void) => api.updater.onUpdateAvailable(cb),
  onUpdateDownloaded: (cb: (info: any) => void) => api.updater.onUpdateDownloaded(cb),
  onUpdateProgress:   (cb: (info: any) => void) => api.updater.onUpdateProgress(cb),
  removeListeners: () => api.updater.removeListeners(),
};
