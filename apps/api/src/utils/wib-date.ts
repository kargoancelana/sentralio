export function lastNDaysWIB(daysBack: number): { startDate: string; endDate: string } {
  const formatWIB = (d: Date) => {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  };

  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - daysBack);

  return {
    startDate: formatWIB(start),
    endDate: formatWIB(end),
  };
}
