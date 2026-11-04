import { Suspense } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/auth/logout-button";

async function RegistrationStatusContent() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError && authError.name !== "AuthSessionMissingError") {
    console.error("Load registration session:", authError);
    throw new Error("Gagal memeriksa sesi pengguna. Silakan coba lagi.");
  }

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_active, class_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("Load registration profile:", profileError);
    throw new Error("Gagal membaca profil pengguna. Silakan coba lagi.");
  }

  if (profile?.is_active) {
    redirect("/");
  }

  const { data: request, error } = await supabase
    .from("registration_requests")
    .select(
      "id, requested_role, class_id, status, rejection_reason, created_at"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error("Gagal membaca status pendaftaran.");
  }

  let className = "-";

  if (request) {
    const { data: classData, error: classError } = await supabase
      .from("classes")
      .select("class_code, class_name")
      .eq("id", request.class_id)
      .maybeSingle();

    if (classError) {
      console.error("Load registration class:", classError);
      throw new Error("Gagal membaca informasi kelas. Silakan coba lagi.");
    }

    if (classData) {
      className = `${classData.class_code} - ${classData.class_name}`;
    }
  }

  const isDeactivated = Boolean(profile && (
    profile.class_id || profile.role === "admin" || request?.status === "approved"
  ));
  const isPending = request?.status === "pending";
  const isRejected = request?.status === "rejected";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold">{isDeactivated ? "Akun Nonaktif" : "Status Pendaftaran"}</h1>

        <p className="mt-2 text-sm text-slate-500">
          Halo, {user.user_metadata?.full_name ?? user.email}.
        </p>

        {isDeactivated ? (
          <div role="alert" className="mt-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
            Akun Anda sedang dinonaktifkan. Login ulang tidak akan mengaktifkan akun.
            Silakan hubungi Admin SIRAKA atau Komting kelas untuk informasi dan pengaktifan kembali.
          </div>
        ) : !profile ? (
          <div role="alert" className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-700">
            Profil akun belum tersedia. Silakan hubungi Admin SIRAKA.
          </div>
        ) : !request ? (
          <div className="mt-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
            Belum ditemukan permohonan pendaftaran untuk akun ini.
            Silakan hubungi Admin SIRAKA.
          </div>
        ) : (
          <>
            <div className="mt-6 space-y-4 rounded-xl border p-5">
              <div>
                <p className="text-xs text-slate-500">Jenis Pendaftaran</p>
                <p className="mt-1 font-semibold capitalize">
                  {request.requested_role}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-500">Kelas</p>
                <p className="mt-1 font-semibold">{className}</p>
              </div>

              <div>
                <p className="text-xs text-slate-500">Status</p>
                <span
                  className={`mt-2 inline-block rounded-full px-3 py-1 text-sm font-medium ${
                    isPending
                      ? "bg-amber-100 text-amber-700"
                      : isRejected
                        ? "bg-red-100 text-red-700"
                        : "bg-green-100 text-green-700"
                  }`}
                >
                  {request.status.toUpperCase()}
                </span>
              </div>
            </div>

            {isPending && (
              <div className="mt-5 rounded-lg bg-amber-50 p-4 text-sm leading-relaxed text-amber-800">
                {request.requested_role === "komting"
                  ? "Permohonan Anda sedang menunggu persetujuan Admin SIRAKA."
                  : "Permohonan Anda sedang menunggu persetujuan Komting kelas yang dipilih."}
              </div>
            )}

            {isRejected && (
              <div className="mt-5 rounded-lg bg-red-50 p-4 text-sm text-red-700">
                <p className="font-semibold">Permohonan ditolak.</p>
                <p className="mt-2">
                  Alasan: {request.rejection_reason}
                </p>
                <p className="mt-2">
                  Silakan hubungi pihak yang melakukan peninjauan untuk informasi lebih lanjut.
                </p>
              </div>
            )}

            {request.status === "approved" && (
              <div className="mt-5 rounded-lg bg-green-50 p-4 text-sm text-green-700">
                Pendaftaran telah disetujui, tetapi akun belum aktif.
                Silakan hubungi Admin SIRAKA atau Komting kelas.
              </div>
            )}
          </>
        )}

        <div className="mt-6">
          <LogoutButton />
        </div>
      </div>
    </main>
  );
}

export default function RegistrationStatusPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          Memeriksa status pendaftaran...
        </main>
      }
    >
      <RegistrationStatusContent />
    </Suspense>
  );
}