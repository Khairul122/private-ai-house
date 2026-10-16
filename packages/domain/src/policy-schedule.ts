import type { AutonomyPolicy } from './types.js';

export function validPolicyTimezone(timezone: string): boolean {
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(); return true; } catch { return false; }
}

export function policySchedule(policy: Pick<AutonomyPolicy, 'timezone' | 'activeHours' | 'activeDays'>, now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: policy.timezone, hour: 'numeric', hourCycle: 'h23', weekday: 'short' }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.find((part) => part.type === 'weekday')?.value ?? '');
  const { start, end } = policy.activeHours;
  const overnight = end < start;
  const activeHour = overnight ? hour >= start || hour < end : hour >= start && hour < end;
  const operatingDay = overnight && hour < end ? (weekday + 6) % 7 : weekday;
  const activeDay = policy.activeDays === undefined || policy.activeDays.includes(operatingDay);
  return { active: Number.isInteger(hour) && weekday >= 0 && activeHour && activeDay, hour, weekday, operatingDay, activeHour, activeDay };
}
