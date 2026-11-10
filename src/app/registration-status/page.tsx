import { Suspense } from "react";
import Image from "next/image";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/auth/logout-button";

type StatusNotice = {
  title: string;
  description: string;
  badge: string;
  color: string;
};

function StatusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-7 w-7"
    >
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V2h6v2M9 10h6M9 14h6M9 18h3" />
    </svg>
  );
}

async function RegistrationStatusContent() {
  await connection();

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError && authError.name !== "AuthSessionMissingError") {
    console.error("Load registration session:", authError);

    throw new Error(
      "Gagal memeriksa sesi pengguna. Silakan coba lagi.",
    );
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

    throw new Error(
      "Gagal membaca profil pengguna. Silakan coba lagi.",
    );
  }

  if (profile?.is_active) {
    redirect("/");
  }

  const { data: request, error: requestError } = await supabase
    .from("registration_requests")
    .select(
      "id, requested_role, class_id, status, rejection_reason, created_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (requestError) {
    console.error("Load registration request:", requestError);

    throw new Error("Gagal membaca status pendaftaran.");
  }

  let className = "Belum tersedia";

  if (request?.class_id) {
    const { data: classData, error: classError } = await supabase
      .from("classes")
      .select("class_code, class_name")
      .eq("id", request.class_id)
      .maybeSingle();

    if (classError) {
      console.error("Load registration class:", classError);

      throw new Error(
        "Gagal membaca informasi kelas. Silakan coba lagi.",
      );
    }

    if (classData) {
      className = `${classData.class_code} · ${classData.class_name}`;
    }
  }

  const isDeactivated = Boolean(
    profile &&
      (profile.class_id ||
        profile.role === "admin" ||
        request?.status === "approved"),
  );

  let notice: StatusNotice;

  if (isDeactivated) {
    notice = {
      title: "Akun sedang nonaktif",
      description:
        "Hubungi Admin SIRAKA atau Komting kelas untuk informasi dan pengaktifan kembali. Login ulang tidak akan mengaktifkan akun.",
      badge: "Akun Nonaktif",
      color: "bg-amber-50 text-amber-800",
    };
  } else if (!profile) {
    notice = {
      title: "Profil belum tersedia",
      description:
        "Profil akun Anda belum ditemukan. Silakan hubungi Admin SIRAKA untuk pemeriksaan lebih lanjut.",
      badge: "Perlu Pemeriksaan",
      color: "bg-red-50 text-red-700",
    };
  } else if (!request) {
    notice = {
      title: "Permohonan belum ditemukan",
      description:
        "Belum ada permohonan pendaftaran untuk akun ini. Hubungi Admin SIRAKA untuk mendapatkan bantuan.",
      badge: "Data Belum Tersedia",
      color: "bg-slate-100 text-slate-600",
    };
  } else if (request.status === "pending") {
    notice = {
      title: "Pendaftaran sedang ditinjau",
      description:
        request.requested_role === "komting"
          ? "Permohonan Anda sedang menunggu persetujuan Admin SIRAKA. Periksa kembali status setelah proses peninjauan."
          : "Permohonan Anda sedang menunggu persetujuan Komting kelas yang dipilih. Periksa kembali status setelah proses peninjauan.",
      badge: "Menunggu Persetujuan",
      color: "bg-amber-50 text-amber-800",
    };
  } else if (request.status === "rejected") {
    notice = {
      title: "Pendaftaran belum disetujui",
      description:
        "Permohonan Anda ditolak. Periksa alasan penolakan di bawah dan hubungi pihak peninjau untuk informasi lebih lanjut.",
      badge: "Ditolak",
      color: "bg-red-50 text-red-700",
    };
  } else {
    notice = {
      title: "Status perlu diperiksa",
      description:
        "Akun belum aktif. Silakan hubungi Admin SIRAKA atau Komting kelas untuk memeriksa status akun.",
      badge: "Belum Aktif",
      color: "bg-slate-100 text-slate-600",
    };
  }

  const metadataName = user.user_metadata?.full_name;

  const displayName =
    typeof metadataName === "string" && metadataName.trim()
      ? metadataName.trim()
      : user.email || "Pengguna SIRAKA";

  const createdAt = request
    ? new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta",
        dateStyle: "long",
        timeStyle: "short",
      }).format(new Date(request.created_at))
    : "—";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F3F6FA] px-4 py-10 sm:py-14">
      <div className="w-full max-w-xl">
        <div className="mb-7 flex items-center justify-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white p-2 shadow-none">
            <Image
              src="/images/logo/logo.png"
              alt="Logo SIRAKA"
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
              priority
            />
          </div>

          <div>
            <p className="font-heading text-xl font-bold tracking-[0.08em] text-primary">
              SIRAKA
            </p>

            <p className="mt-0.5 text-[9px] font-semibold tracking-wider text-muted">
              UNIVERSITAS NEGERI MEDAN
            </p>
          </div>
        </div>

        <section className="overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-xl shadow-slate-200/40">
          <div className="relative overflow-hidden bg-[#173A56] p-4 text-white sm:p-5">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-14 -top-20 h-64 w-64 rounded-full border border-white/10"
            />

            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-28 right-10 h-56 w-56 rounded-full border border-white/10"
            />

            <div className="relative">
              <span className="inline-flex rounded-lg bg-white/10 p-3 text-cyan-100">
                <StatusIcon />
              </span>

              <p className="mt-5 text-[10px] font-bold uppercase tracking-wide text-cyan-100/80">
                Informasi Akun
              </p>

              <h1 className="mt-2 font-heading text-2xl font-bold">
                Status Pendaftaran
              </h1>

              <p className="mt-3 wrap-break-word text-sm leading-7 text-slate-200">
                Halo, {displayName}.
              </p>
            </div>
          </div>

          <div className="space-y-6 p-4 sm:p-5">
            <div>
              <span
                className={`inline-flex rounded-full px-3 py-1.5 text-[10px] font-bold ${notice.color}`}
              >
                {notice.badge}
              </span>

              <h2 className="mt-4 font-heading text-xl font-bold text-primary">
                {notice.title}
              </h2>

              <p className="mt-3 text-sm leading-7 text-muted">
                {notice.description}
              </p>
            </div>

            {request && (
              <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200 px-4">
                <div className="py-4">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                    Jenis Pendaftaran
                  </dt>

                  <dd className="mt-2 text-sm font-bold capitalize text-primary">
                    {request.requested_role}
                  </dd>
                </div>

                <div className="py-4">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                    Kelas
                  </dt>

                  <dd className="mt-2 wrap-break-word text-sm font-semibold leading-7 text-primary">
                    {className}
                  </dd>
                </div>

                <div className="py-4">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                    Tanggal Pengajuan
                  </dt>

                  <dd className="mt-2 text-xs leading-6 text-primary">
                    {createdAt} WIB
                  </dd>
                </div>
              </dl>
            )}

            {!isDeactivated && request?.status === "rejected" && (
              <div className="rounded-lg border border-red-200 bg-white p-4">
                <h3 className="text-xs font-bold text-red-700">
                  Alasan Penolakan
                </h3>

                <p className="mt-2 whitespace-pre-wrap wrap-break-word text-sm leading-7 text-muted">
                  {request.rejection_reason ||
                    "Alasan belum tersedia. Silakan hubungi pihak peninjau."}
                </p>
              </div>
            )}

            <div className="border-t border-slate-100 pt-6">
              <a
                href="/registration-status"
                className="btn-primary w-full rounded-md"
              >
                ↻ Periksa Status Terbaru
              </a>

              <p className="mt-3 text-center text-[10px] leading-6 text-muted">
                Status diperiksa kembali ketika tombol di atas
                ditekan. Akun aktif akan diarahkan ke dashboard.
              </p>
            </div>

            <div className="border-t border-slate-100 pt-5">
              <LogoutButton />
            </div>
          </div>
        </section>

        <p className="mt-6 text-center text-[10px] leading-6 text-muted">
          © 2026 SIRAKA. Universitas Negeri Medan.
        </p>
      </div>
    </main>
  );
}

export default function RegistrationStatusPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#F3F6FA] px-4">
          <div
            role="status"
            className="rounded-lg border border-slate-200 bg-white px-8 py-10 text-center shadow-none"
          >
            <div
              aria-hidden="true"
              className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-100 border-t-primary"
            />

            <p className="mt-4 text-sm text-muted">
              Memeriksa status pendaftaran...
            </p>
          </div>
        </main>
      }
    >
      <RegistrationStatusContent />
    </Suspense>
  );
}