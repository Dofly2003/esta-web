import { tasks, users as userRepo } from "@/lib/data";
import { requireUser } from "@/lib/auth";
import { deleteUser, logout } from "@/lib/actions";
import { ROLES } from "@/lib/constants";
import { Avatar, PageHeader } from "@/components/dash";
import { ConfirmButton } from "@/components/ui";
import { ChangePasswordForm, CreateUserForm } from "./forms";

export default async function TeamPage() {
  const me = await requireUser();
  const [allUsers, allTasks] = await Promise.all([userRepo.list(), tasks.list()]);
  const users = allUsers.map((u) => ({
    ...u,
    _count: { tasks: allTasks.filter((t) => t.assigneeId === u.id && t.status !== "DONE").length },
  }));
  const isAdmin = me.role === "ADMIN";

  return (
    <>
      <PageHeader title="Tim & Akun" subtitle="Anggota tim yang bisa login ke dashboard.">
        <form action={logout}>
          <button className="btn-ghost">Keluar</button>
        </form>
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="card overflow-hidden xl:col-span-2">
          <ul className="divide-y divide-zinc-100">
            {users.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 p-4">
                <Avatar name={u.name} size="h-10 w-10" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {u.name} {u.id === me.id && <span className="text-xs font-normal text-zinc-400">(Anda)</span>}
                  </p>
                  <p className="truncate text-xs text-zinc-500">{u.email}</p>
                </div>
                <span className="badge bg-zinc-100 text-zinc-600">{ROLES[u.role]}</span>
                <span className="text-xs text-zinc-500">{u._count.tasks} tugas terbuka</span>
                {isAdmin && u.id !== me.id && (
                  <form action={deleteUser}>
                    <input type="hidden" name="id" value={u.id} />
                    <ConfirmButton className="btn-danger px-2 py-1 text-xs" message={`Hapus akun ${u.name}?`}>
                      Hapus
                    </ConfirmButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>

        <div className="space-y-6">
          {isAdmin && (
            <section className="card p-5">
              <h2 className="mb-4 font-bold">Tambah anggota</h2>
              <CreateUserForm />
            </section>
          )}
          <section className="card p-5">
            <h2 className="mb-4 font-bold">Ganti password saya</h2>
            <ChangePasswordForm email={me.email} />
          </section>
        </div>
      </div>
    </>
  );
}
