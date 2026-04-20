// Helpers to slice the fiscal year into monthly / quarterly / annual windows.

export type Cadence = "monthly" | "quarterly" | "annually";

export interface Period {
  key: string;             // "2026-Q1", "2026-03", "2026"
  label: string;           // "Q1 2026"
  start: Date;
  end: Date;               // exclusive
  cadence: Cadence;
}

function utc(y: number, m: number, d = 1): Date {
  return new Date(Date.UTC(y, m, d));
}

export function yearPeriod(year: number): Period {
  return {
    key: `${year}`,
    label: `FY ${year}`,
    start: utc(year, 0, 1),
    end: utc(year + 1, 0, 1),
    cadence: "annually",
  };
}

export function quarterPeriods(year: number): Period[] {
  return [0, 1, 2, 3].map((q) => ({
    key: `${year}-Q${q + 1}`,
    label: `Q${q + 1} ${year}`,
    start: utc(year, q * 3, 1),
    end: utc(year, q * 3 + 3, 1),
    cadence: "quarterly",
  }));
}

export function monthPeriods(year: number): Period[] {
  return Array.from({ length: 12 }).map((_, m) => ({
    key: `${year}-${String(m + 1).padStart(2, "0")}`,
    label: `${["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc"][m]} ${year}`,
    start: utc(year, m, 1),
    end: utc(year, m + 1, 1),
    cadence: "monthly",
  }));
}

export function periodsFor(cadence: Cadence, year: number): Period[] {
  if (cadence === "monthly") return monthPeriods(year);
  if (cadence === "quarterly") return quarterPeriods(year);
  return [yearPeriod(year)];
}

export function currentPeriod(cadence: Cadence, now: Date): Period {
  const year = now.getUTCFullYear();
  return periodsFor(cadence, year).find((p) => now >= p.start && now < p.end)!;
}

// Fraction of the period already elapsed (0..1). Useful for run-rate estimates.
export function elapsedFraction(p: Period, now: Date): number {
  if (now <= p.start) return 0;
  if (now >= p.end) return 1;
  return (now.getTime() - p.start.getTime()) / (p.end.getTime() - p.start.getTime());
}
