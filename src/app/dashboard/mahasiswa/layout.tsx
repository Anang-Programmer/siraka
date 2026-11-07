import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import MahasiswaShell from "@/components/mahasiswa/mahasiswa-shell";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";

async function ProtectedMahasiswaShell({ children }: { children: ReactNode }) {
  await connection();
  const result = await getCurrentProfile();

  if (!result) {
    redirect("/registration-status");
  }

  if (result.profile.role !== "mahasiswa") {
    redirect("/");
  }

  return (
    <MahasiswaShell fullName={result.profile.full_name}>{children}</MahasiswaShell>
  );
}

export default function MahasiswaLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Suspense fallback={<p role="status" className="p-6">Memuat dashboard...</p>}>
      <ProtectedMahasiswaShell>{children}</ProtectedMahasiswaShell>
    </Suspense>
  );
}
