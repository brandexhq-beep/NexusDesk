export type StationType = 'ps5' | 'ps5_vr' | 'ps5_simracing' | 'snooker' | 'pc' | string;

export interface ReviewRequest {
  id: string;
  customer_id: string;
  session_id: string;
  scheduled_for: number; // timestamp when it should be sent (e.g. 30 mins after checkout)
  sent: boolean;
  created_at: number;
}

export type StationStatus = 'free' | 'occupied' | 'maintenance';

export interface Station {
  id: string;
  name: string;
  type: StationType;
  hourly_rate: number;
  status: StationStatus;
  overtime_block_minutes: number;
  grace_period_minutes: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  wallet_balance: number;
  available_minutes: number;
  amount_owed: number;
  loyalty_points: number;
  created_at: number | Date; // Depending on Firestore timestamp vs JS Date
}

export type PaymentMode = 'wallet' | 'tab' | 'cash' | 'mixed';

export type SessionStatus = 'active' | 'completed';

export interface SessionOrder {
  item_id: string;
  name: string;
  quantity: number;
  price_at_order: number;
}

export interface Session {
  id: string;
  station_id: string;
  customer_id: string | null;
  start_time: number | Date;
  end_time: number | Date | null;
  prepaid_duration_mins: number | null;
  combo_id: string | null;
  orders: SessionOrder[];
  base_amount: number;
  overtime_amount: number;
  food_amount: number;
  total_amount: number;
  payment_mode: PaymentMode | null;
  status: SessionStatus;
  extended_minutes?: number;
  warning_sent?: boolean;
}

export type MenuCategory = 'snack' | 'drink' | 'combo' | 'package';

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: MenuCategory;
  active: boolean;
  package_minutes?: number; // Only used for 'package' category
  stock_quantity?: number; // Inventory tracking for snack/drink
}

export type TransactionType = 'session_payment' | 'food_order' | 'wallet_topup' | 'wallet_deduction' | 'session_charge' | 'food_charge' | 'points_redeemed' | 'points_earned' | 'tab_settled';

export interface Transaction {
  id: string;
  customer_id: string;
  type: TransactionType;
  amount: number;
  points: number;
  timestamp: number | Date;
  note: string;
}

export interface AppSettings {
  cafe_name: string;
  cafe_logo_url?: string;
  currency_symbol: string;
  tax_rate_percent: number;
  loyalty_conversion_rate: number; // e.g. 10 means 10 points = 1 currency unit
  session_start_delay_sec?: number;
  admin_password?: string;
  google_review_url?: string;
  review_delay_mins?: number; // Configurable delay for automated WhatsApp review requests
}

export interface PricingRule {
  id: string;
  name: string;
  days: number[]; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  start_time: string; // HH:mm format, e.g., "10:00"
  end_time: string; // HH:mm format, e.g., "16:00"
  fixed_hourly_rate: number;
  active: boolean;
}
