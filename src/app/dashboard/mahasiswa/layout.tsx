import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import MahasiswaShell from "@/components/mahasiswa/mahasiswa-shell";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";

async function ProtectedMahasiswaShell({
  children,
}: {
  children: ReactNode;
}) {
  await connection();

  const result = await getCurrentProfile();

  if (!result) {
    redirect("/registration-status");
  }

  if (result.profile.role !== "mahasiswa") {
    redirect("/");
  }

  return (
    <MahasiswaShell fullName={result.profile.full_name}>
      {children}
    </MahasiswaShell>
  );
}

function DashboardLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6">
      <div
        role="status"
        className="flex items-center gap-3 text-sm font-medium text-primary"
      >
        <svg
          className="h-5 w-5 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeWidth="3"
            className="opacity-20"
          />

          <path
            d="M21 12a9 9 0 0 0-9-9"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>

        <span>Memuat dashboard...</span>
      </div>
    </div>
  );
}

export default function MahasiswaLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <ProtectedMahasiswaShell>
        {children}
      </ProtectedMahasiswaShell>
    </Suspense>
  );
}