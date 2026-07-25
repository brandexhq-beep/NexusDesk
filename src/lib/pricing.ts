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
