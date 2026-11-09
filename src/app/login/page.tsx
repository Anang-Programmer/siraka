import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import LoginForm from "./login-form";

async function LoginContent() {
  await connection();

  const result = await getCurrentProfile();

  if (result) {
    redirect("/");
  }

  return <LoginForm />;
}

export default function LoginPage() {
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-2">
      <section className="relative hidden flex-col justify-start overflow-hidden bg-primary px-4 py-12 text-white sm:px-12 lg:flex lg:px-16 lg:py-20">
        

        

        <div className="relative mx-auto w-full max-w-xl pt-8 lg:pt-12">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-white p-2.5">
              <Image
                src="/images/logo/logo.png"
                alt="Logo SIRAKA"
                width={48}
                height={48}
                className="h-full w-full object-contain"
                priority
              />
            </div>

            <div>
              <p className="font-heading text-2xl font-bold tracking-tight">
                SIRAKA
              </p>

              <p className="mt-1 max-w-sm text-xs leading-relaxed text-white/85 sm:text-sm">
                Sistem Informasi Penjadwalan &amp; Peminjaman Ruang
                Kelas dan Laboratorium
              </p>
            </div>
          </div>

          <p className="mt-7 max-w-lg text-sm leading-7 text-white/80">
            Solusi cerdas tata kelola sarana perkuliahan dan riset
            terpadu Universitas Negeri Medan. Mewujudkan efisiensi
            logistik kampus dengan verifikasi dan manajemen yang
            transparan.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#login-email"
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-action px-4 py-3 text-xs font-bold text-ink transition hover:bg-action/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              MULAI SEKARANG
            </a>

            <Link
              href="/register"
              className="btn-secondary px-4 text-xs"
            >
              DAFTAR SEKARANG
            </Link>
          </div>

          <div className="mt-9">
            <p className="text-[10px] font-semibold tracking-wide text-white/70">
              ANDA DAPAT MENGAKSES:
            </p>

            <ul className="mt-3 flex flex-wrap gap-2">
              {[
                "Informasi Ruangan",
                "Jadwal & Ketersediaan Ruangan",
                "Pengajuan Kebutuhan",
              ].map((feature) => (
                <li
                  key={feature}
                  className="rounded-md border border-white/10 bg-white/10 px-3 py-2 text-xs font-medium text-white/90"
                >
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="flex min-w-0 flex-col px-4 py-10 sm:px-12 lg:px-16">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-5 lg:py-12">
          <Link
            href="/login"
            aria-label="SIRAKA — halaman login"
            className="mb-9 inline-flex w-fit items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          >
            <Image
              src="/images/logo/logo.png"
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 object-contain"
            />

            <div>
              <p className="font-heading text-lg font-bold tracking-wide text-primary">
                SIRAKA
              </p>

              <p className="text-[9px] font-semibold tracking-[0.12em] text-muted">
                UNIVERSITAS NEGERI MEDAN
              </p>
            </div>
          </Link>

          <div className="mb-7">
            <h1 className="text-2xl font-bold text-ink">
              Selamat Datang
            </h1>

            <p className="mt-2 text-sm leading-relaxed text-muted">
              Silakan login untuk akses penjadwalan dan reservasi
              ruang kelas serta laboratorium UNIMED.
            </p>
          </div>

          <Suspense
            fallback={
              <p
                role="status"
                className="rounded-lg bg-slate-50 px-4 py-5 text-center text-sm text-muted"
              >
                Memeriksa sesi pengguna...
              </p>
            }
          >
            <LoginContent />
          </Suspense>

          <p className="mt-6 text-center text-sm text-muted">
            Belum punya akun?{" "}
            <Link
              href="/register"
              className="rounded-sm font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Daftar Sekarang
            </Link>
          </p>
        </div>

        <footer className="mx-auto mt-8 w-full max-w-md border-t border-slate-100 pt-5">
          <p className="text-center text-[10px] leading-relaxed text-muted">
            © 2026 SIRAKA · Sistem Informasi Penjadwalan dan
            Peminjaman Ruang Kelas dan Laboratorium
          </p>
        </footer>
      </section>
    </main>
  );
}