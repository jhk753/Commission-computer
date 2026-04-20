import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Shell } from "@/components/Shell";
import Link from "next/link";
import { eur } from "@/lib/format";
import { revalidatePath } from "next/cache";

async function createPlan(formData: FormData) {
  "use server";
  const s = await readSession();
  if (!s || s.role !== "admin") throw new Error("forbidden");
  const name = String(formData.get("name") ?? "").trim();
  const periodYear = Number(formData.get("periodYear") ?? new Date().getUTCFullYear());
  const ote = Number(formData.get("ote") ?? 0);
  const baseSalary = Number(formData.get("baseSalary") ?? 0);
  if (!name) throw new Error("name required");
  const plan = await prisma.plan.create({
    data: { name, periodYear, ote, baseSalary },
  });
  revalidatePath("/admin/plans");
  redirect(`/admin/plans/${plan.id}`);
}

export default async function Plans() {
  const session = await readSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/dashboard");

  const plans = await prisma.plan.findMany({
    include: {
      components: true,
      assignments: { include: { user: true } },
    },
    orderBy: [{ periodYear: "desc" }, { createdAt: "desc" }],
  });

  return (
    <Shell session={session}>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Plans de commission</h1>
          <p className="text-sm text-gray-600 mt-1">
            Créez un plan, ajoutez-y des composantes avec cadences, accélérateurs, kickers.
          </p>
        </div>
      </div>

      <div className="card mb-6">
        <h2 className="font-semibold mb-3">Nouveau plan</h2>
        <form action={createPlan} className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="label">Nom</label>
            <input name="name" required className="input" placeholder="AE Enterprise FY26" />
          </div>
          <div>
            <label className="label">Année fiscale</label>
            <input name="periodYear" type="number" className="input" defaultValue={new Date().getUTCFullYear()} />
          </div>
          <div>
            <label className="label">OTE (EUR)</label>
            <input name="ote" type="number" className="input" defaultValue={100000} />
          </div>
          <div>
            <label className="label">Base (EUR)</label>
            <input name="baseSalary" type="number" className="input" defaultValue={60000} />
          </div>
          <div className="md:col-span-4">
            <button type="submit" className="btn-primary">Créer le plan</button>
          </div>
        </form>
      </div>

      <div className="space-y-3">
        {plans.map((p) => (
          <Link key={p.id} href={`/admin/plans/${p.id}`} className="card flex items-center justify-between hover:border-brand-500">
            <div>
              <div className="font-semibold">{p.name}</div>
              <div className="text-xs text-gray-500">
                FY {p.periodYear} · OTE {eur(p.ote)} · {p.components.length} composante(s) ·
                {" "}{p.assignments.length} rep(s) assigné(s)
              </div>
            </div>
            <div className="text-sm text-brand-600">Configurer →</div>
          </Link>
        ))}
        {plans.length === 0 && (
          <p className="text-sm text-gray-500">Aucun plan pour l’instant.</p>
        )}
      </div>
    </Shell>
  );
}
