import RegisterForm from "./register-form";

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-900">
            SIRAKA
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Sistem Informasi Penjadwalan dan Peminjaman Ruangan
          </p>
        </div>

        <h2 className="text-xl font-semibold">Buat Akun</h2>
        <p className="mb-6 mt-1 text-sm text-slate-500">
          Daftarkan akun untuk mulai menggunakan SIRAKA.
        </p>

        <RegisterForm />
      </div>
    </main>
  );
}