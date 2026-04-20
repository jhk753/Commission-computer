import Link from "next/link";
import { readSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const s = await readSession();
  if (s) redirect("/dashboard");
  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand-600" />
          <span className="font-semibold text-lg">Commission Computer</span>
        </div>
        <Link href="/login" className="btn-primary">Se connecter</Link>
      </header>

      <section className="flex-1 px-8 py-16 max-w-5xl mx-auto">
        <h1 className="text-5xl font-semibold tracking-tight text-gray-900 leading-tight">
          Pilotez vos commissions<br />avec la précision d’un CFO.
        </h1>
        <p className="text-lg text-gray-600 mt-6 max-w-2xl">
          Branchez HubSpot ou Salesforce, configurez vos plans — commission
          trimestrielle, bonus annuel, accélérateurs, kickers — et laissez
          vos commerciaux voir leur estimation fin de trimestre et fin
          d’année en temps réel.
        </p>
        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Feature title="Plans composables"
            body="Mélangez commissions et bonus dans un même plan. Chaque composante a sa cadence, sa cible, son taux." />
          <Feature title="Accélérateurs & kickers"
            body="Paliers au-delà de 100% de quota, multiplicateurs, bonus fixes, floor et cap." />
          <Feature title="Connecté au CRM"
            body="Synchronise deals HubSpot et opportunities Salesforce. Revenus pipeline pondérés." />
        </div>
      </section>

      <footer className="px-8 py-6 text-sm text-gray-500 border-t border-gray-200">
        Demo — Sonnet-powered commission engine.
      </footer>
    </main>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="card">
      <h3 className="font-semibold text-gray-900">{title}</h3>
      <p className="text-sm text-gray-600 mt-2">{body}</p>
    </div>
  );
}
