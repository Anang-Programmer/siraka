import { Suspense } from "react";
import { connection } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import UserManagement from "@/components/admin/user-management";

async function UsersPageContent() {
  await connection();
  await requireRole("admin");
  return <UserManagement />;
}

export default function AdminUsersPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-slate-500">
          Memuat manajemen pengguna...
        </div>
      }
    >
      <UsersPageContent />
    </Suspense>
  );
}