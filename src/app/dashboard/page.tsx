import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeRepYear } from "@/lib/commission-engine";
import { Shell } from "@/components/Shell";
import { eur, pct } from "@/lib/format";

export default async function Dashboard({
  searchParams,
}: { searchParams: Promise<{ year?: string }> }) {
  const session = await readSession();
  if (!session) redirect("/login");

  const sp = await searchParams;
  const year = Number(sp.year ?? new Date().getUTCFullYear());
  const now = new Date();

  const assignments = await prisma.planAssignment.findMany({
    where: { userId: session.sub },
    include: {
      plan: {
        include: {
          components: { include: { accelerators: true } },
        },
      },
    },
  });

  const assignment = assignments.find((a) => a.plan.periodYear === year) ?? assignments[0];

  if (!assignment) {
    return (
      <Shell session={session}>
        <div className="card">
          <h1 className="font-semibold">Aucun plan assigné</h1>
          <p className="text-sm text-gray-600 mt-2">
            Votre administrateur doit vous assigner un plan de commission.
          </p>
        </div>
      </Shell>
    );
  }

  const plan = assignment.plan;
  const deals = await prisma.deal.findMany({
    where: {
      userId: session.sub,
      closeDate: {
        gte: new Date(Date.UTC(plan.periodYear, 0, 1)),
        lt: new Date(Date.UTC(plan.periodYear + 1, 0, 1)),
      },
    },
    orderBy: { closeDate: "asc" },
  });

  const view = computeRepYear({
    components: plan.components,
    deals,
    year: plan.periodYear,
    now,
    ote: plan.ote,
    baseSalary: plan.baseSalary,
  });

  return (
    <Shell session={session}>
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Bonjour {session.name.split(" ")[0]} 👋</h1>
          <p className="text-sm text-gray-600 mt-1">
            Plan <strong>{plan.name}</strong> · FY {plan.periodYear} · OTE {eur(plan.ote)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <BigStat
          title="Acquis à ce jour"
          value={eur(view.totalBooked)}
          sub={`${pct(view.totalBooked / plan.ote)} de l'OTE variable`}
          accent="text-emerald-600"
        />
        <BigStat
          title={`Fin de trimestre (${view.currentQuarter.label})`}
          value={eur(view.currentQuarter.projected)}
          sub={`${eur(view.currentQuarter.booked)} déjà acquis`}
          accent="text-brand-600"
        />
        <BigStat
          title={`Fin d'année (FY ${view.year})`}
          value={eur(view.endOfYear.projected)}
          sub={`Base ${eur(plan.baseSalary)} + var. projetée`}
          accent="text-gray-900"
        />
      </div>

      <section className="space-y-6">
        {view.components.map((cv) => (
          <div key={cv.component.id} className="card">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-semibold">{cv.component.name}</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {cv.component.kind} · cadence {labelCadence(cv.component.cadence)} ·
                  taux {pct(cv.component.baseRate)}
                  {cv.component.kickerAt100 > 0 && <> · kicker {eur(cv.component.kickerAt100)}</>}
                  {cv.component.cap > 0 && <> · cap ×{cv.component.cap}</>}
                </p>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500">Projeté FY</div>
                <div className="text-lg font-semibold">{eur(cv.totalProjected)}</div>
                <div className="text-xs text-emerald-600">{eur(cv.totalBooked)} acquis</div>
              </div>
            </div>

            {cv.component.accelerators.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {cv.component.accelerators.map((a) => (
                  <span key={a.id} className="pill bg-violet-100 text-violet-800">
                    {pct(a.fromPercent)}
                    {a.toPercent != null ? `–${pct(a.toPercent)}` : "+"} · ×{a.multiplier}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
              {cv.periods.map((p) => (
                <PeriodBar key={p.period.key} result={p} />
              ))}
            </div>
          </div>
        ))}
      </section>
    </Shell>
  );
}

function labelCadence(c: string) {
  return c === "monthly" ? "mensuelle" : c === "quarterly" ? "trimestrielle" : "annuelle";
}

function BigStat({
  title, value, sub, accent,
}: { title: string; value: string; sub: string; accent: string }) {
  return (
    <div className="card">
      <div className="text-xs text-gray-500 uppercase tracking-wide">{title}</div>
      <div className={`text-3xl font-semibold mt-1 ${accent}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-2">{sub}</div>
    </div>
  );
}

function PeriodBar({ result }: { result: import("@/lib/commission-engine").ComponentResult }) {
  const attainmentPct = Math.min(result.projectedAttainment, 2);
  const bookedFill = Math.min(result.attainment, 2) / 2 * 100;
  const projectedFill = attainmentPct / 2 * 100;

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium text-gray-700">{result.period.label}</span>
        <span className="text-gray-500">
          {pct(result.projectedAttainment)} · quota {eur(result.quota)}
        </span>
      </div>
      <div className="relative mt-2 h-2 bg-white rounded overflow-hidden border border-gray-200">
        <div
          className="absolute inset-y-0 left-0 bg-brand-200"
          style={{ width: `${projectedFill}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 bg-emerald-500"
          style={{ width: `${bookedFill}%` }}
        />
        <div className="absolute top-0 bottom-0 w-px bg-gray-400" style={{ left: "50%" }} />
      </div>
      <div className="flex items-baseline justify-between text-xs mt-2 text-gray-600">
        <span>
          <span className="text-emerald-600 font-medium">{eur(result.bookedPayout)}</span>
          {" / "}
          <span className="text-brand-700">{eur(result.projectedPayout)}</span>
        </span>
        <span>
          {eur(result.bookedAmount)}
          {result.pipelineAmount > 0 && (
            <span className="text-gray-400"> + {eur(result.pipelineAmount)} pipe</span>
          )}
        </span>
      </div>
    </div>
  );
}
