// Core commission engine.
// Inputs:  a plan component + its accelerators + a list of deals in a period.
// Outputs: attainment, booked commission, weighted pipeline projection, and
// the final estimated payout for the period.
//
// The model is intentionally deal-level (not aggregated), so that each deal
// can later be traced back to a payout for the rep's dashboard.

import type { Accelerator, Deal, PlanComponent } from "@prisma/client";
import {
  Cadence,
  Period,
  elapsedFraction,
  periodsFor,
  quarterPeriods,
} from "./period";

export interface ComponentWithAccelerators extends PlanComponent {
  accelerators: Accelerator[];
}

export interface DealContribution {
  dealId: string;
  name: string;
  amount: number;      // deal amount counted towards quota
  weighted: number;    // amount × probability (0 for won deals = full amount)
  stage: string;
  commission: number;  // commission earned from this specific deal
}

export interface ComponentResult {
  componentId: string;
  componentName: string;
  cadence: Cadence;
  period: Period;

  quota: number;               // quota allocated to this period
  bookedAmount: number;        // sum of won deals
  pipelineAmount: number;      // sum of probability-weighted open deals
  projectedAmount: number;     // booked + pipeline (+ run-rate top-up)

  attainment: number;          // bookedAmount / quota
  projectedAttainment: number; // projectedAmount / quota

  bookedPayout: number;        // payout earned today
  projectedPayout: number;     // payout expected at period end

  contributions: DealContribution[];
}

// Allocate the annual quota to the period based on cadence.
function quotaFor(component: PlanComponent, period: Period): number {
  if (period.cadence === "annually") return component.quotaAnnual;
  if (period.cadence === "quarterly") return component.quotaAnnual / 4;
  return component.quotaAnnual / 12;
}

// Apply tiered accelerators. Returns the effective commission amount on the
// given attainment bracket (attainment fraction → payout on quota).
// We integrate rate by slicing attainment in the accelerator bands.
function commissionOnAmount(
  attainmentAmount: number,
  quota: number,
  baseRate: number,
  accelerators: Accelerator[],
  floor: number,
  cap: number,
): number {
  if (quota <= 0) return 0;
  const attainment = attainmentAmount / quota;
  if (attainment < floor) return 0;

  // Sort accelerators by fromPercent ascending. Each bracket multiplies the
  // rate for attainment in [fromPercent, toPercent).
  const tiers = [...accelerators].sort((a, b) => a.fromPercent - b.fromPercent);

  // Build a piecewise list: below the first accelerator → base rate.
  const bands: Array<{ from: number; to: number; rate: number }> = [];
  let cursor = 0;
  for (const t of tiers) {
    if (t.fromPercent > cursor) {
      bands.push({ from: cursor, to: t.fromPercent, rate: baseRate });
    }
    const to = t.toPercent ?? Number.POSITIVE_INFINITY;
    bands.push({ from: Math.max(cursor, t.fromPercent), to, rate: baseRate * t.multiplier });
    cursor = to;
  }
  if (cursor < Number.POSITIVE_INFINITY) {
    bands.push({ from: cursor, to: Number.POSITIVE_INFINITY, rate: baseRate });
  }

  let payout = 0;
  for (const band of bands) {
    const lo = Math.max(band.from, floor);
    const hi = Math.min(band.to, attainment);
    if (hi > lo) payout += (hi - lo) * quota * band.rate;
  }

  if (cap > 0) {
    const capAmount = quota * baseRate * cap;
    if (payout > capAmount) payout = capAmount;
  }
  return payout;
}

interface ComputeArgs {
  component: ComponentWithAccelerators;
  deals: Deal[];          // deals for THIS rep (all year — filtered here)
  period: Period;
  now: Date;
  kickerAt100?: number;   // override (tests)
}

export function computeComponent({ component, deals, period, now }: ComputeArgs): ComponentResult {
  const quota = quotaFor(component, period);

  const inPeriod = deals.filter(
    (d) => d.closeDate >= period.start && d.closeDate < period.end,
  );

  const won = inPeriod.filter((d) => d.stage === "won");
  const open = inPeriod.filter((d) => d.stage === "open");

  const bookedAmount = won.reduce((s, d) => s + d.amount, 0);
  const pipelineAmount = open.reduce((s, d) => s + d.amount * d.probability, 0);

  // Run-rate top-up: if the period isn't over yet, extrapolate booked amount
  // at today's pace. Conservative — we only add the extrapolation if it
  // exceeds the weighted pipeline already (avoids double-counting).
  const elapsed = elapsedFraction(period, now);
  const runRate = elapsed > 0 ? bookedAmount / elapsed : 0;
  const runRateProjection = Math.max(runRate - bookedAmount - pipelineAmount, 0);

  const projectedAmount = bookedAmount + pipelineAmount + runRateProjection;

  const attainment = quota > 0 ? bookedAmount / quota : 0;
  const projectedAttainment = quota > 0 ? projectedAmount / quota : 0;

  const bookedBase = commissionOnAmount(
    bookedAmount, quota, component.baseRate, component.accelerators,
    component.floor, component.cap,
  );
  const projectedBase = commissionOnAmount(
    projectedAmount, quota, component.baseRate, component.accelerators,
    component.floor, component.cap,
  );

  const kicker = component.kickerAt100 || 0;
  const bookedPayout = bookedBase + (attainment >= 1 ? kicker : 0);
  const projectedPayout = projectedBase + (projectedAttainment >= 1 ? kicker : 0);

  // Per-deal attribution for the rep's dashboard. We approximate by
  // distributing the booked commission proportionally to won deals.
  const contributions: DealContribution[] = inPeriod.map((d) => {
    const weighted = d.stage === "won" ? d.amount : d.amount * d.probability;
    const share = bookedAmount > 0 && d.stage === "won" ? d.amount / bookedAmount : 0;
    return {
      dealId: d.id,
      name: d.name,
      amount: d.amount,
      weighted,
      stage: d.stage,
      commission: share * bookedBase,
    };
  });

  return {
    componentId: component.id,
    componentName: component.name,
    cadence: component.cadence as Cadence,
    period,
    quota,
    bookedAmount,
    pipelineAmount,
    projectedAmount,
    attainment,
    projectedAttainment,
    bookedPayout,
    projectedPayout,
    contributions,
  };
}

// Compute a full year snapshot for one component: period-by-period results
// plus total booked and projected payouts for the rep.
export interface ComponentYearView {
  component: ComponentWithAccelerators;
  periods: ComponentResult[];
  totalBooked: number;
  totalProjected: number;
}

export function computeComponentYear(
  component: ComponentWithAccelerators,
  deals: Deal[],
  year: number,
  now: Date,
): ComponentYearView {
  const cadence = component.cadence as Cadence;
  const periods = periodsFor(cadence, year);
  const results = periods.map((period) =>
    computeComponent({ component, deals, period, now }),
  );

  return {
    component,
    periods: results,
    totalBooked: results.reduce((s, r) => s + r.bookedPayout, 0),
    totalProjected: results.reduce((s, r) => s + r.projectedPayout, 0),
  };
}

// Full rep view: every component for the year, roll-up totals, and focus
// on the current quarter and full-year targets (the two things Qobra-style
// tools highlight most prominently).
export interface RepYearView {
  year: number;
  now: Date;
  components: ComponentYearView[];
  ote: number;
  baseSalary: number;

  totalBooked: number;
  totalProjected: number;

  currentQuarter: {
    key: string;
    label: string;
    booked: number;
    projected: number;
  };
  endOfYear: {
    booked: number;
    projected: number;
  };
}

export function computeRepYear(args: {
  components: ComponentWithAccelerators[];
  deals: Deal[];
  year: number;
  now: Date;
  ote: number;
  baseSalary: number;
}): RepYearView {
  const { components, deals, year, now, ote, baseSalary } = args;

  const views = components.map((c) => computeComponentYear(c, deals, year, now));
  const totalBooked = views.reduce((s, v) => s + v.totalBooked, 0);
  const totalProjected = views.reduce((s, v) => s + v.totalProjected, 0);

  // Current quarter: sum of each component's current quarter result. For
  // components whose cadence is NOT quarterly we slice the year into
  // quarters just for display (they still pay on their own cadence).
  const qPeriods = quarterPeriods(year);
  const currentQ = qPeriods.find((p) => now >= p.start && now < p.end) ?? qPeriods[0];

  let qBooked = 0;
  let qProjected = 0;
  for (const comp of components) {
    const res = computeComponent({ component: comp, deals, period: currentQ, now });
    qBooked += res.bookedPayout;
    qProjected += res.projectedPayout;
  }

  return {
    year,
    now,
    components: views,
    ote,
    baseSalary,
    totalBooked,
    totalProjected,
    currentQuarter: {
      key: currentQ.key,
      label: currentQ.label,
      booked: qBooked,
      projected: qProjected,
    },
    endOfYear: {
      booked: totalBooked,
      projected: totalProjected,
    },
  };
}

// Exposed for tests
export const __internal = { commissionOnAmount };
