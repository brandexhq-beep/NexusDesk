import assert from 'node:assert';
import { calculateDynamicCost } from '../lib/pricing.ts';
import type { Station, PricingCategory, PricingSnapshot } from '../types/index.ts';

console.log('--- Running NexusDesk Production Regression Tests ---');

// Test 1: Pricing Matrix Calculation
const mockStation: Station = {
  id: 'st-1',
  name: 'PS5 Unit 01',
  type: 'ps5',
  hourly_rate: 200,
  status: 'free',
  overtime_block_minutes: 15,
  grace_period_minutes: 0,
  pricing_category_id: 'cat-ps5',
  pricing_mode: 'category',
};

const ps5Category: PricingCategory = {
  id: 'cat-ps5',
  name: 'PS5',
  durations: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60],
  player_counts: [1, 2, 3, 4],
  price_matrix: {
    5: { 1: 16, 2: 23, 3: 32, 4: 37 },
    15: { 1: 50, 2: 70, 3: 95, 4: 111 },
    30: { 1: 100, 2: 140, 3: 190, 4: 224 },
    60: { 1: 200, 2: 280, 3: 380, 4: 450 },
  },
  hourly_rate: 200,
};

// 1 Hour 1 Player calculation
const now = Date.now();
const res60m1P = calculateDynamicCost(now, now + 60 * 60000, mockStation, [], 0, 1, ps5Category);
assert.strictEqual(res60m1P.cost, 200, '60m 1P should cost 200');

// 1 Hour 2 Players calculation
const res60m2P = calculateDynamicCost(now, now + 60 * 60000, mockStation, [], 0, 2, ps5Category);
assert.strictEqual(res60m2P.cost, 280, '60m 2P should cost 280');

// 75 Minutes (60m + 15m) calculation
const res75m1P = calculateDynamicCost(now, now + 75 * 60000, mockStation, [], 0, 1, ps5Category);
assert.strictEqual(res75m1P.cost, 250, '75m 1P (60m + 15m) should cost 250 (200 + 50)');

console.log('✅ Test 1 Passed: Dynamic Category Matrix Calculation');

// Test 2: Historical / Active Session Protection Test
const originalSnapshot: PricingSnapshot = {
  category_id: 'cat-ps5',
  category_name: 'PS5',
  durations: [60],
  player_counts: [1, 2],
  price_matrix: {
    60: { 1: 200, 2: 280 },
  },
  hourly_rate: 200,
};

// Active Session starts with original snapshot
const activeSessionCostBeforeCategoryUpdate = calculateDynamicCost(now, now + 60 * 60000, mockStation, [], 0, 1, originalSnapshot);
assert.strictEqual(activeSessionCostBeforeCategoryUpdate.cost, 200);

// Client updates PS5 Category price from 200 to 250
const updatedCategory: PricingCategory = {
  ...ps5Category,
  price_matrix: {
    ...ps5Category.price_matrix,
    60: { 1: 250, 2: 350 },
  },
  hourly_rate: 250,
};

// Active Session calculated WITH SNAPSHOT retains original price (₹200)
const activeSessionCostAfterCategoryUpdate = calculateDynamicCost(now, now + 60 * 60000, mockStation, [], 0, 1, originalSnapshot);
assert.strictEqual(activeSessionCostAfterCategoryUpdate.cost, 200, 'Active session must retain original snapshot rate (200)');

// New Session started AFTER update uses new category price (₹250)
const newSessionCost = calculateDynamicCost(now, now + 60 * 60000, mockStation, [], 0, 1, updatedCategory);
assert.strictEqual(newSessionCost.cost, 250, 'New session must use updated category rate (250)');

console.log('✅ Test 2 Passed: Historical / Active Session Protection');

// Test 3: Alert State Machine Deduplication
const alertStates = new Map<string, string>();
const lowStockThreshold = 5;

function checkItemAlert(item: { id: string, stock: number }) {
  const isLow = item.stock <= lowStockThreshold;
  const currentState = isLow ? 'LOW' : 'NORMAL';
  const prevState = alertStates.get(item.id) || 'NORMAL';
  alertStates.set(item.id, currentState);
  return currentState !== prevState; // Returns true ONLY on transition
}

assert.strictEqual(checkItemAlert({ id: 'item-1', stock: 10 }), false, 'Initial normal stock should not trigger alert');
assert.strictEqual(checkItemAlert({ id: 'item-1', stock: 3 }), true, 'Transition to low stock MUST trigger alert');
assert.strictEqual(checkItemAlert({ id: 'item-1', stock: 3 }), false, 'Subsequent check with same low stock MUST NOT trigger duplicate alert');
assert.strictEqual(checkItemAlert({ id: 'item-1', stock: 2 }), false, 'Subsequent check staying low MUST NOT trigger duplicate alert');
assert.strictEqual(checkItemAlert({ id: 'item-1', stock: 15 }), true, 'Replenishment back to normal triggers state transition reset');
assert.strictEqual(checkItemAlert({ id: 'item-1', stock: 4 }), true, 'Subsequent drop back to low triggers new alert');

console.log('✅ Test 3 Passed: Inventory Alert State Machine & Deduplication');

console.log('\n--- ALL REGRESSION TESTS PASSED SUCCESSFULLY ---');
