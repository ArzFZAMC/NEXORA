export function startOfMonthDay(iso: string): number {
  return Number(iso.slice(8, 10)) || 1;
}
