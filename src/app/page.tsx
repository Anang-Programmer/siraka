
import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";


async function HomeRedirect(): Promise<ReactNode> {
  await connection();
  const result = await getCurrentProfile();

  if (!result) {
    redirect("/login");
  }

  const routes = {
    admin: "/dashboard/admin",
    komting: "/dashboard/komting",
    mahasiswa: "/dashboard/mahasiswa",
  };

  redirect(routes[result.profile.role]);

  return null;
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          Memuat dashboard...
        </main>
      }
    >
      <HomeRedirect />
    </Suspense>
  );
}
