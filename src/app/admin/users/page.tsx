import { redirect } from "next/navigation";
import { readSession, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { revalidatePath } from "next/cache";

async function createUser(formData: FormData) {
  "use server";
  const s = await readSession();
  if (!s || s.role !== "admin") throw new Error("forbidden");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "rep");
  const crmOwnerId = String(formData.get("crmOwnerId") ?? "").trim() || null;
  if (!email || !name || !password) throw new Error("missing fields");
  await prisma.user.create({
    data: {
      email, name,
      passwordHash: await hashPassword(password),
      role,
      crmOwnerId,
    },
  });
  revalidatePath("/admin/users");
}

async function deleteUser(formData: FormData) {
  "use server";
  const s = await readSession();
  if (!s || s.role !== "admin") throw new Error("forbidden");
  const id = String(formData.get("id"));
  if (id === s.sub) return; // don't let admin delete themselves
  await prisma.user.delete({ where: { id } });
  revalidatePath("/admin/users");
}

export default async function Users() {
  const session = await readSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/dashboard");

  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });

  return (
    <Shell session={session}>
      <h1 className="text-2xl font-semibold mb-6">Équipe</h1>

      <div className="card mb-6">
        <h2 className="font-semibold mb-3">Ajouter un utilisateur</h2>
        <form action={createUser} className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="label">Nom</label>
            <input name="name" required className="input" />
          </div>
          <div>
            <label className="label">Email</label>
            <input name="email" type="email" required className="input" />
          </div>
          <div>
            <label className="label">Mot de passe</label>
            <input name="password" type="text" required className="input" />
          </div>
          <div>
            <label className="label">Rôle</label>
            <select name="role" className="input">
              <option value="rep">Rep</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label className="label">CRM Owner ID</label>
            <input name="crmOwnerId" className="input" placeholder="HubSpot / SF id" />
          </div>
          <div className="md:col-span-5">
            <button className="btn-primary">Créer</button>
          </div>
        </form>
      </div>

      <div className="card">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-gray-500">
            <tr><th className="py-2">Nom</th><th>Email</th><th>Rôle</th><th>CRM Owner ID</th><th></th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-gray-100">
                <td className="py-2 font-medium">{u.name}</td>
                <td>{u.email}</td>
                <td><span className="pill bg-gray-100 text-gray-700">{u.role}</span></td>
                <td className="font-mono text-xs">{u.crmOwnerId ?? "—"}</td>
                <td className="text-right">
                  {u.id !== session.sub && (
                    <form action={deleteUser}>
                      <input type="hidden" name="id" value={u.id} />
                      <button className="text-red-600 text-xs">Supprimer</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
