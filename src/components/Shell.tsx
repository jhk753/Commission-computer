import Link from "next/link";
import type { SessionPayload } from "@/lib/auth";

export function Shell({
  session,
  children,
}: { session: SessionPayload; children: React.ReactNode }) {
  const isAdmin = session.role === "admin";
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-brand-600" />
              <span className="font-semibold">Commission Computer</span>
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <NavLink href="/dashboard" label="Mon tableau" />
              {isAdmin && <NavLink href="/admin/plans" label="Plans" />}
              {isAdmin && <NavLink href="/admin/users" label="Équipe" />}
              {isAdmin && <NavLink href="/admin/integrations" label="Intégrations" />}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-600">{session.name}</span>
            <span className="pill bg-gray-100 text-gray-700">{isAdmin ? "Admin" : "Rep"}</span>
            <form action="/logout" method="post">
              <button className="btn-secondary" type="submit">Déconnexion</button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">{children}</main>
    </div>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-md text-gray-700 hover:bg-gray-100"
    >
      {label}
    </Link>
  );
}
