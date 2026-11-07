import Image from "next/image";
import Link from "next/link";
import RegisterForm from "./register-form";

export default function RegisterPage() {
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-2">
      <section className="relative flex flex-col justify-center overflow-hidden bg-primary px-6 py-12 text-white sm:px-12 lg:px-16 lg:py-20">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-white/5"
        />

        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-40 -left-32 h-96 w-96 rounded-full bg-secondary/10"
        />

        <div className="relative mx-auto w-full max-w-xl">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white p-2.5">
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
              <p className="font-heading text-3xl font-extrabold tracking-tight">
                SIRAKA
              </p>

              <p className="mt-1 max-w-sm text-xs leading-relaxed text-white/85 sm:text-sm">
                Sistem Informasi Penjadwalan &amp; Peminjaman Ruang Kelas dan
                Laboratorium
              </p>
            </div>
          </div>

          <p className="mt-7 max-w-lg text-sm leading-7 text-white/80">
            Solusi cerdas tata kelola sarana perkuliahan dan riset terpadu
            Universitas Negeri Medan. Mewujudkan efisiensi logistik kampus
            dengan verifikasi dan manajemen yang transparan.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-action px-6 py-3 text-xs font-bold text-ink transition hover:bg-action/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              MULAI SEKARANG
            </Link>

            <a
              href="#register-name"
              className="btn-secondary px-6 text-xs"
            >
              DAFTAR SEKARANG
            </a>
          </div>

          <div className="mt-9">
            <p className="text-[10px] font-semibold tracking-[0.2em] text-white/70">
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

      <section className="flex min-w-0 flex-col px-6 py-10 sm:px-12 lg:px-16">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-4">
          <Link
            href="/login"
            aria-label="SIRAKA — halaman login"
            className="mb-8 inline-flex w-fit items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          >
            <Image
              src="/images/logo/logo.png"
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 object-contain"
            />

            <div>
              <p className="font-heading text-lg font-extrabold tracking-wide text-primary">
                SIRAKA
              </p>

              <p className="text-[9px] font-semibold tracking-[0.12em] text-muted">
                UNIVERSITAS NEGERI MEDAN
              </p>
            </div>
          </Link>

          <div className="mb-7">
            <h1 className="text-2xl font-extrabold text-ink">
              Buat Akun
            </h1>

            <p className="mt-2 text-sm leading-relaxed text-muted">
              Silakan registrasi akun Anda sebelum menjelajahi fitur SIRAKA.
            </p>
          </div>

          <RegisterForm />
        </div>

        <footer className="mx-auto mt-8 w-full max-w-md border-t border-slate-100 pt-5">
          <p className="text-center text-[10px] leading-relaxed text-muted">
            © 2026 SIRAKA · Sistem Informasi Penjadwalan dan Peminjaman Ruang
            Kelas dan Laboratorium
          </p>
        </footer>
      </section>
    </main>
  );
}