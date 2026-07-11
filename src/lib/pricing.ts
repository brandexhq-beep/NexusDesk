import type { PricingRule, Station } from '../types';

export function calculateDynamicCost(
  startTimeMs: number, 
  endTimeMs: number, 
  station: Station, 
  rules: PricingRule[],
  freeMinutes: number = 0
): { cost: number, minutesUsed: number } {
  let cost = 0;
  let minutesUsed = 0;
  
  const startMins = Math.floor(startTimeMs / 60000);
  const endMins = Math.floor(endTimeMs / 60000);
  const totalDurationMins = endMins - startMins;

  if (totalDurationMins <= station.grace_period_minutes) {
    return { cost: 0, minutesUsed: 0 }; // Free within grace period
  }

  // Fast-forward free minutes
  const minsToSkip = Math.min(freeMinutes, endMins - startMins);
  let effectiveStartMins = startMins + minsToSkip;
  minutesUsed += minsToSkip;

  // Calculate chunks of time instead of iterating minute by minute
  let currMins = effectiveStartMins;
  
  while (currMins < endMins) {
    const currentMs = currMins * 60000;
    const date = new Date(currentMs);
    const dayOfWeek = date.getDay();
    const hour = date.getHours();
    const minute = date.getMinutes();
    const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

    // Find if any active rule applies for this exact minute
    const activeRule = rules.find(rule => {
      if (!rule.active) return false;
      if (!rule.days.includes(dayOfWeek)) return false;
      return timeString >= rule.start_time && timeString < rule.end_time;
    });

    let nextChangeMins = endMins;
    
    // Find when the current state changes (either the active rule ends, or a new rule starts, or the day ends)
    // To simplify, we'll find the minimum boundary.
    
    // 1. Boundary: End of the current day
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    const endOfDayMins = Math.floor(endOfDay.getTime() / 60000) + 1; // Start of next day
    nextChangeMins = Math.min(nextChangeMins, endOfDayMins);

    if (activeRule) {
      // 2. Boundary: End of active rule
      const [endH, endM] = activeRule.end_time.split(':').map(Number);
      const endOfRuleDate = new Date(date);
      endOfRuleDate.setHours(endH, endM, 0, 0);
      const endOfRuleMins = Math.floor(endOfRuleDate.getTime() / 60000);
      nextChangeMins = Math.min(nextChangeMins, endOfRuleMins);
    } else {
      // 3. Boundary: Start of next applicable rule today
      const futureRulesToday = rules.filter(rule => 
        rule.active && 
        rule.days.includes(dayOfWeek) && 
        rule.start_time > timeString
      );
      
      if (futureRulesToday.length > 0) {
        // Sort by start_time
        futureRulesToday.sort((a, b) => a.start_time.localeCompare(b.start_time));
        const nextRule = futureRulesToday[0];
        const [startH, startM] = nextRule.start_time.split(':').map(Number);
        const startOfRuleDate = new Date(date);
        startOfRuleDate.setHours(startH, startM, 0, 0);
        const startOfRuleMins = Math.floor(startOfRuleDate.getTime() / 60000);
        nextChangeMins = Math.min(nextChangeMins, startOfRuleMins);
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
