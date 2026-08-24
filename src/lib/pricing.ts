import type { PricingRule, Station } from '../types';

const PS5_PRICING_MATRIX: Record<number, Record<number, number>> = {
  5: { 1: 16, 2: 23, 3: 32, 4: 37 },
  10: { 1: 32, 2: 46, 3: 64, 4: 74 },
  15: { 1: 50, 2: 70, 3: 95, 4: 111 },
  20: { 1: 66, 2: 93, 3: 127, 4: 150 },
  25: { 1: 82, 2: 116, 3: 158, 4: 187 },
  30: { 1: 100, 2: 140, 3: 190, 4: 224 },
  35: { 1: 116, 2: 163, 3: 222, 4: 261 },
  40: { 1: 132, 2: 186, 3: 253, 4: 300 },
  45: { 1: 150, 2: 210, 3: 285, 4: 337 },
  50: { 1: 164, 2: 233, 3: 317, 4: 374 },
  55: { 1: 180, 2: 256, 3: 348, 4: 411 },
  60: { 1: 200, 2: 280, 3: 380, 4: 450 }
};

export function calculateDynamicCost(
  startTimeMs: number, 
  endTimeMs: number, 
  station: Station, 
  rules: PricingRule[],
  freeMinutes: number = 0,
  numPlayers: number = 1
): { cost: number, minutesUsed: number } {
  let cost = 0;
  let minutesUsed = 0;
  
  const startMins = Math.floor(startTimeMs / 60000);
  const totalDurationMins = Math.ceil((endTimeMs - startTimeMs) / 60000);
  const endMins = startMins + totalDurationMins;

  const graceMins = station.grace_period_minutes || 0;
  if (totalDurationMins <= graceMins) {
    return { cost: 0, minutesUsed: 0 }; // Free within grace period
  }

  // Grace period is free time, start billing after grace period
  const startAfterGraceMins = startMins + graceMins;
  const remainingDurationAfterGrace = endMins - startAfterGraceMins;

  // Fast-forward free minutes from packages/customer credit
  const minsToSkip = Math.min(freeMinutes, remainingDurationAfterGrace);
  let effectiveStartMins = startAfterGraceMins + minsToSkip;
  minutesUsed += minsToSkip;

  const billableMins = endMins - effectiveStartMins;
  if (billableMins <= 0) {
    return { cost: 0, minutesUsed };
  }

  // Dynamic PS5 / Multi-player Pricing Matrix Calculation
  if (station.type.startsWith('ps5') || station.player_rates) {
    const players = Math.min(Math.max(1, numPlayers), 4);
    const customHourly = station.player_rates?.[players] || (players === 1 ? station.hourly_rate : null);
    const defaultHourly = PS5_PRICING_MATRIX[60][players] || 200;
    const effectiveHourly = customHourly || defaultHourly;

    const hours = Math.floor(billableMins / 60);
    const remainingMins = billableMins % 60;
    
    let totalCost = hours * effectiveHourly;
    
    if (remainingMins > 0) {
      // Find the next available 5-min chunk
      const chunks = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
      const matchedChunk = chunks.find(c => c >= remainingMins) || 60;

      if (customHourly && customHourly !== defaultHourly) {
        const defaultChunk = PS5_PRICING_MATRIX[matchedChunk]?.[players] || (matchedChunk / 60) * defaultHourly;
        const ratio = customHourly / defaultHourly;
        totalCost += Math.round(defaultChunk * ratio);
      } else {
        totalCost += PS5_PRICING_MATRIX[matchedChunk]?.[players] || Math.round((matchedChunk / 60) * effectiveHourly);
      }
    }
    
    return { cost: totalCost, minutesUsed };
  }

  // Calculate chunks of time instead of iterating minute by minute
  let currMins = effectiveStartMins;
  
  while (currMins < endMins) {
    const currentMs = currMins * 60000;
    const date = new Date(currentMs);
    const dayOfWeek = date.getDay();
    const hour = date.getHours();
    const minute = date.getMinutes();
    const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

    // Find if any active rule applies for this exact minute (handling overnight spans)
    const activeRule = rules.find(rule => {
      if (!rule.active) return false;
      if (!rule.days.includes(dayOfWeek)) return false;
      if (rule.start_time <= rule.end_time) {
        return timeString >= rule.start_time && timeString < rule.end_time;
      } else {
        // Overnight rule (e.g. 22:00 to 03:00)
        return timeString >= rule.start_time || timeString < rule.end_time;
      }
    });

    let nextChangeMins = endMins;
    
    // Boundary: End of current day
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    const endOfDayMins = Math.floor(endOfDay.getTime() / 60000) + 1;
    nextChangeMins = Math.min(nextChangeMins, endOfDayMins);

    if (activeRule) {
      // Boundary: End of active rule
      const [endH, endM] = activeRule.end_time.split(':').map(Number);
      const endOfRuleDate = new Date(date);
      if (activeRule.start_time > activeRule.end_time && timeString >= activeRule.start_time) {
        endOfRuleDate.setDate(endOfRuleDate.getDate() + 1);
      }
      endOfRuleDate.setHours(endH, endM, 0, 0);
      const endOfRuleMins = Math.floor(endOfRuleDate.getTime() / 60000);
      if (endOfRuleMins > currMins) {
        nextChangeMins = Math.min(nextChangeMins, endOfRuleMins);
      }
    } else {
      // Boundary: Start of next applicable rule today
      const futureRulesToday = rules.filter(rule => 
        rule.active && 
        rule.days.includes(dayOfWeek) && 
        rule.start_time > timeString
      );
      
      if (futureRulesToday.length > 0) {
        futureRulesToday.sort((a, b) => a.start_time.localeCompare(b.start_time));
        const nextRule = futureRulesToday[0];
        const [startH, startM] = nextRule.start_time.split(':').map(Number);
        const startOfRuleDate = new Date(date);
        startOfRuleDate.setHours(startH, startM, 0, 0);
        const startOfRuleMins = Math.floor(startOfRuleDate.getTime() / 60000);
        if (startOfRuleMins > currMins) {
          nextChangeMins = Math.min(nextChangeMins, startOfRuleMins);
        }
      }
    }

    // Failsafe to ensure progress
    if (nextChangeMins <= currMins) {
      nextChangeMins = currMins + 1;
    }

    const chunkDurationMins = Math.min(nextChangeMins - currMins, endMins - currMins);
    const hourlyRateForThisChunk = activeRule ? activeRule.fixed_hourly_rate : station.hourly_rate;
    const costPerMinute = hourlyRateForThisChunk / 60;
    
    cost += costPerMinute * chunkDurationMins;
    currMins += chunkDurationMins;
  }

  return { cost, minutesUsed };
}
