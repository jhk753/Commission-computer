import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { eur, pct } from "@/lib/format";
import { revalidatePath } from "next/cache";
import Link from "next/link";

async function addComponent(formData: FormData) {
  "use server";
  const s = await readSession();
  if (!s || s.role !== "admin") throw new Error("forbidden");
  const planId = String(formData.get("planId"));

  await prisma.planComponent.create({
    data: {
      planId,
      name: String(formData.get("name") ?? "Commission"),
      kind: String(formData.get("kind") ?? "commission"),
      cadence: String(formData.get("cadence") ?? "quarterly"),
      weight: Number(formData.get("weight") ?? 1),
      quotaAnnual: Number(formData.get("quotaAnnual") ?? 0),
      baseRate: Number(formData.get("baseRate") ?? 0),
      floor: Number(formData.get("floor") ?? 0),
      cap: Number(formData.get("cap") ?? 0),
      kickerAt100: Number(formData.get("kickerAt100") ?? 0),
    },
  });
  revalidatePath(`/admin/plans/${planId}`);
}

async function deleteComponent(formData: FormData) {
  "use server";
  const s = await readSession();
  if (!s || s.role !== "admin") throw new Error("forbidden");
  const id = String(formData.get("id"));
  const planId = String(formData.get("planId"));
  await prisma.planComponent.delete({ where: { id } });
  revalidatePath(`/admin/plans/${planId}`);
}

async function addAccelerator(formData: FormData) {
  "use server";
  const s = await readSession();
  if (!s || s.role !== "admin") throw new Error("forbidden");
  const componentId = String(formData.get("componentId"));
  const planId = String(formData.get("planId"));
  const toRaw = formData.get("toPercent");
  await prisma.accelerator.create({
    data: {
      componentId,
      fromPercent: Number(formData.get("fromPercent") ?? 1),
      toPercent: toRaw ? Number(toRaw) : null,
      multiplier: Number(formData.get("multiplier") ?? 1),
    },
  });
  revalidatePath(`/admin/plans/${planId}`);
}

async function deleteAccelerator(formData: FormData) {
  "use server";
  const s = await readSession();
  if (!s || s.role !== "admin") throw new Error("forbidden");
  const id = String(formData.get("id"));
  const planId = String(formData.get("planId"));
  await prisma.accelerator.delete({ where: { id } });
  revalidatePath(`/admin/plans/${planId}`);
}

async function assignRep(formData: FormData) {
  "use server";
  const s = await readSession();
  if (!s || s.role !== "admin") throw new Error("forbidden");
  const planId = String(formData.get("planId"));
  const userId = String(formData.get("userId"));
  await prisma.planAssignment.upsert({
    where: { userId_planId: { userId, planId } },
    create: { userId, planId },
    update: {},
  });
  revalidatePath(`/admin/plans/${planId}`);
}

async function unassignRep(formData: FormData) {
  "use server";
  const s = await readSession();
  if (!s || s.role !== "admin") throw new Error("forbidden");
  const planId = String(formData.get("planId"));
  const userId = String(formData.get("userId"));
  await prisma.planAssignment.delete({ where: { userId_planId: { userId, planId } } });
  revalidatePath(`/admin/plans/${planId}`);
}

export default async function PlanDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await readSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/dashboard");

  const { id } = await params;
  const plan = await prisma.plan.findUnique({
    where: { id },
    include: {
      components: { include: { accelerators: true }, orderBy: { name: "asc" } },
      assignments: { include: { user: true } },
    },
  });

  if (!plan) return <Shell session={session}><p>Plan introuvable. <Link href="/admin/plans">Retour</Link></p></Shell>;

  const reps = await prisma.user.findMany({ where: { role: "rep" }, orderBy: { name: "asc" } });
  const assignedIds = new Set(plan.assignments.map((a) => a.userId));

  return (
    <Shell session={session}>
      <Link href="/admin/plans" className="text-sm text-brand-600">← Tous les plans</Link>
      <h1 className="text-2xl font-semibold mt-2">{plan.name}</h1>
      <p className="text-sm text-gray-600 mt-1">
        FY {plan.periodYear} · OTE {eur(plan.ote)} · Base {eur(plan.baseSalary)}
      </p>

      <section className="mt-8">
        <h2 className="font-semibold mb-3">Composantes du plan</h2>

        <div className="space-y-4">
          {plan.components.map((c) => (
            <div key={c.id} className="card">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{c.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {c.kind} · cadence {c.cadence} · poids {pct(c.weight)} · quota annuel {eur(c.quotaAnnual)} ·
                    taux {pct(c.baseRate)}
                    {c.floor > 0 && <> · floor {pct(c.floor)}</>}
                    {c.cap > 0 && <> · cap ×{c.cap}</>}
                    {c.kickerAt100 > 0 && <> · kicker {eur(c.kickerAt100)}</>}
                  </div>
                </div>
                <form action={deleteComponent}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="planId" value={plan.id} />
                  <button className="text-xs text-red-600" type="submit">Supprimer</button>
                </form>
              </div>

              <div className="mt-3 border-t border-gray-100 pt-3">
                <div className="text-xs font-medium text-gray-700 mb-2">Accélérateurs</div>
                <div className="flex flex-wrap gap-2">
                  {c.accelerators.map((a) => (
                    <form key={a.id} action={deleteAccelerator} className="inline-flex">
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="planId" value={plan.id} />
                      <button
                        type="submit"
                        className="pill bg-violet-100 text-violet-800 hover:bg-red-100 hover:text-red-800"
                        title="Cliquer pour supprimer"
                      >
                        {pct(a.fromPercent)}
                        {a.toPercent != null ? `–${pct(a.toPercent)}` : "+"} · ×{a.multiplier}
                      </button>
                    </form>
                  ))}
                  {c.accelerators.length === 0 && (
                    <span className="text-xs text-gray-400">Aucun accélérateur</span>
                  )}
                </div>
                <form action={addAccelerator} className="mt-3 grid grid-cols-4 gap-2 max-w-2xl">
                  <input type="hidden" name="componentId" value={c.id} />
                  <input type="hidden" name="planId" value={plan.id} />
                  <input name="fromPercent" type="number" step="0.01" defaultValue={1} className="input" placeholder="de (1.0)" />
                  <input name="toPercent" type="number" step="0.01" className="input" placeholder="à (optionnel)" />
                  <input name="multiplier" type="number" step="0.1" defaultValue={1.5} className="input" placeholder="×multiplier" />
                  <button type="submit" className="btn-secondary">Ajouter un palier</button>
                </form>
              </div>
            </div>
          ))}
          {plan.components.length === 0 && (
            <p className="text-sm text-gray-500">Aucune composante. Ajoutez-en une ci-dessous.</p>
          )}
        </div>

        <div className="card mt-6">
          <h3 className="font-semibold mb-3">Nouvelle composante</h3>
          <form action={addComponent} className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <input type="hidden" name="planId" value={plan.id} />
            <div>
              <label className="label">Nom</label>
              <input name="name" required className="input" placeholder="New ARR" />
            </div>
            <div>
              <label className="label">Type</label>
              <select name="kind" className="input">
                <option value="commission">Commission</option>
                <option value="bonus">Bonus</option>
                <option value="sdr_meeting">Meeting (SDR)</option>
                <option value="mbo">MBO</option>
              </select>
            </div>
            <div>
              <label className="label">Cadence</label>
              <select name="cadence" className="input" defaultValue="quarterly">
                <option value="monthly">Mensuelle</option>
                <option value="quarterly">Trimestrielle</option>
                <option value="annually">Annuelle</option>
              </select>
            </div>
            <div>
              <label className="label">Poids (part variable 0–1)</label>
              <input name="weight" type="number" step="0.05" defaultValue={1} className="input" />
            </div>
            <div>
              <label className="label">Quota annuel (EUR ou #)</label>
              <input name="quotaAnnual" type="number" defaultValue={500000} className="input" />
            </div>
            <div>
              <label className="label">Taux de base (ex 0.08 = 8%)</label>
              <input name="baseRate" type="number" step="0.01" defaultValue={0.08} className="input" />
            </div>
            <div>
              <label className="label">Floor (ex 0.5)</label>
              <input name="floor" type="number" step="0.05" defaultValue={0} className="input" />
            </div>
            <div>
              <label className="label">Cap (×base, 0 = aucun)</label>
              <input name="cap" type="number" step="0.1" defaultValue={0} className="input" />
            </div>
            <div>
              <label className="label">Kicker à 100% (EUR)</label>
              <input name="kickerAt100" type="number" defaultValue={0} className="input" />
            </div>
            <div className="md:col-span-4">
              <button className="btn-primary">Ajouter la composante</button>
            </div>
          </form>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-semibold mb-3">Reps assignés</h2>
        <div className="card">
          <div className="flex flex-wrap gap-2 mb-4">
            {plan.assignments.map((a) => (
              <form key={a.id} action={unassignRep} className="inline-flex">
                <input type="hidden" name="planId" value={plan.id} />
                <input type="hidden" name="userId" value={a.userId} />
                <button className="pill bg-brand-100 text-brand-700 hover:bg-red-100 hover:text-red-700" type="submit">
                  {a.user.name} ({a.user.email}) ×
                </button>
              </form>
            ))}
            {plan.assignments.length === 0 && <span className="text-sm text-gray-400">Aucun rep assigné.</span>}
          </div>
          <form action={assignRep} className="flex gap-2">
            <input type="hidden" name="planId" value={plan.id} />
            <select name="userId" className="input max-w-md" defaultValue="">
              <option value="" disabled>Choisir un rep…</option>
              {reps.filter((r) => !assignedIds.has(r.id)).map((r) => (
                <option key={r.id} value={r.id}>{r.name} · {r.email}</option>
              ))}
            </select>
            <button className="btn-secondary">Assigner</button>
          </form>
        </div>
      </section>
    </Shell>
  );
}
