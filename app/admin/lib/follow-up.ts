// Calendar arithmetic keeps the same weekday across DST, month and year changes.
export function nextWeek(date: string) {
  const day = new Date(date + "T12:00:00Z");
  day.setUTCDate(day.getUTCDate() + 7);
  return day.toISOString().slice(0, 10);
}
