import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { revalidatePath } from "next/cache";
import { syncProvider } from "@/lib/integrations";

async function saveHubspot(formData: FormData) {
  "use server";
  const s = await readSession();
  if (!s || s.role !== "admin") throw new Error("forbidden");
  const token = String(formData.get("token") ?? "").trim();
  await prisma.integration.upsert({
    where: { provider: "hubspot" },
    create: { provider: "hubspot", accessToken: token || null },
    update: { accessToken: token || null },
  });
  revalidatePath("/admin/integrations");
}

async function saveSalesforce(formData: FormData) {
  "use server";
  const s = await readSession();
  if (!s || s.role !== "admin") throw new Error("forbidden");
  const token = String(formData.get("token") ?? "").trim();
  const instanceUrl = String(formData.get("instanceUrl") ?? "").trim();
  await prisma.integration.upsert({
    where: { provider: "salesforce" },
    create: { provider: "salesforce", accessToken: token || null, metadata: JSON.stringify({ instanceUrl }) },
    update: { accessToken: token || null, metadata: JSON.stringify({ instanceUrl }) },
  });
  revalidatePath("/admin/integrations");
}

async function runSync(formData: FormData) {
  "use server";
  const s = await readSession();
  if (!s || s.role !== "admin") throw new Error("forbidden");
  const provider = String(formData.get("provider")) as "hubspot" | "salesforce";
  const year = Number(formData.get("year") ?? new Date().getUTCFullYear());
  try {
    await syncProvider(provider, year);
  } catch (err) {
    console.error(err);
  }
  revalidatePath("/admin/integrations");
}

export default async function Integrations() {
  const session = await readSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/dashboard");

  const [hubspot, salesforce] = await Promise.all([
    prisma.integration.findUnique({ where: { provider: "hubspot" } }),
    prisma.integration.findUnique({ where: { provider: "salesforce" } }),
  ]);
  const sfMeta = salesforce?.metadata ? JSON.parse(salesforce.metadata) : {};

  const dealsByProvider = await prisma.deal.groupBy({
    by: ["source"],
    _count: { _all: true },
  });
  const dealCounts = Object.fromEntries(dealsByProvider.map((d) => [d.source, d._count._all]));

  return (
    <Shell session={session}>
      <h1 className="text-2xl font-semibold mb-1">Intégrations CRM</h1>
      <p className="text-sm text-gray-600 mb-6">
        Branchez HubSpot ou Salesforce pour synchroniser automatiquement les deals des commerciaux.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">HubSpot</h2>
            <span className={`pill ${hubspot?.accessToken ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"}`}>
              {hubspot?.accessToken ? "Connecté" : "Non connecté"}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Collez un <em>Private App access token</em> (Portal Settings → Integrations → Private Apps).
          </p>
          <form action={saveHubspot} className="mt-3 space-y-2">
            <input
              name="token"
              className="input font-mono text-xs"
              defaultValue={hubspot?.accessToken ?? ""}
              placeholder="pat-na1-…"
            />
            <button className="btn-secondary w-full">Enregistrer</button>
          </form>
          <form action={runSync} className="mt-2">
            <input type="hidden" name="provider" value="hubspot" />
            <input type="hidden" name="year" value={new Date().getUTCFullYear()} />
            <button className="btn-primary w-full" disabled={!hubspot?.accessToken}>
              Synchroniser les deals {new Date().getUTCFullYear()}
            </button>
          </form>
          <p className="text-xs text-gray-500 mt-3">
            {dealCounts["hubspot"] ?? 0} deals synchronisés.
          </p>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Salesforce</h2>
            <span className={`pill ${salesforce?.accessToken ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"}`}>
              {salesforce?.accessToken ? "Connecté" : "Non connecté"}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Collez un access token OAuth et l’instance URL (ex <code>https://mycorp.my.salesforce.com</code>).
          </p>
          <form action={saveSalesforce} className="mt-3 space-y-2">
            <input
              name="instanceUrl"
              className="input"
              defaultValue={sfMeta.instanceUrl ?? ""}
              placeholder="https://mycorp.my.salesforce.com"
            />
            <input
              name="token"
              className="input font-mono text-xs"
              defaultValue={salesforce?.accessToken ?? ""}
              placeholder="00D…"
            />
            <button className="btn-secondary w-full">Enregistrer</button>
          </form>
          <form action={runSync} className="mt-2">
            <input type="hidden" name="provider" value="salesforce" />
            <input type="hidden" name="year" value={new Date().getUTCFullYear()} />
            <button className="btn-primary w-full" disabled={!salesforce?.accessToken}>
              Synchroniser les deals {new Date().getUTCFullYear()}
            </button>
          </form>
          <p className="text-xs text-gray-500 mt-3">
            {dealCounts["salesforce"] ?? 0} deals synchronisés.
          </p>
        </div>
      </div>

      <div className="card mt-6">
        <h3 className="font-semibold">Mapping rep ↔ CRM</h3>
        <p className="text-sm text-gray-600 mt-1">
          Chaque utilisateur doit avoir un <code>CRM Owner ID</code> (HubSpot <code>hubspot_owner_id</code>
          ou Salesforce <code>OwnerId</code>) pour que les deals soient attribués. Configurez-le dans{" "}
          <a href="/admin/users" className="text-brand-600">Équipe</a>.
        </p>
      </div>
    </Shell>
  );
}
