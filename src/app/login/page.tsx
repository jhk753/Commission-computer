import { redirect } from "next/navigation";
import { login, readSession } from "@/lib/auth";

async function loginAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const session = await login(email, password);
  if (!session) redirect("/login?error=1");
  redirect("/dashboard");
}

export default async function LoginPage({
  searchParams,
}: { searchParams: Promise<{ error?: string }> }) {
  if (await readSession()) redirect("/dashboard");
  const sp = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="card w-full max-w-md">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-lg bg-brand-600" />
          <span className="font-semibold text-lg">Commission Computer</span>
        </div>
        <h1 className="text-xl font-semibold mb-1">Se connecter</h1>
        <p className="text-sm text-gray-500 mb-6">
          Comptes de démo : <code>admin@demo.io</code> / <code>admin123</code> ·{" "}
          <code>alice@demo.io</code> / <code>rep12345</code>
        </p>
        <form action={loginAction} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input name="email" type="email" required className="input" defaultValue="alice@demo.io" />
          </div>
          <div>
            <label className="label">Mot de passe</label>
            <input name="password" type="password" required className="input" defaultValue="rep12345" />
          </div>
          {sp.error && (
            <p className="text-sm text-red-600">Identifiants invalides.</p>
          )}
          <button type="submit" className="btn-primary w-full">Entrer</button>
        </form>
      </div>
    </main>
  );
}
