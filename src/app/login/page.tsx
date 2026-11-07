
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import Link from "next/link";
import LoginForm from "./login-form";
import { connection } from "next/server";

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
        <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
            <div className="w-full max-w-md rounded-2xl border bg-white p-8 shadow-sm">
                <div className="mb-8 text-center">
                    <h1 className="text-3xl font-bold tracking-tight">
                        SIRAKA
                    </h1>

                    <p className="mt-2 text-sm text-slate-500">
                        Sistem Informasi Penjadwalan dan Peminjaman Ruangan
                    </p>
                </div>

                <div className="mb-6">
                    <h2 className="text-xl font-semibold">
                        Selamat Datang
                    </h2>

                    <p className="mt-1 text-sm text-slate-500">
                        Silakan masuk menggunakan akun terdaftar.
                    </p>
                </div>

                <Suspense
                    fallback={
                        <p className="py-8 text-center text-sm text-slate-500">
                            Memeriksa sesi pengguna...
                        </p>
                    }
                >
                    <LoginContent />
                </Suspense>

                <p className="mt-6 text-center text-xs text-slate-400">
                    SIRAKA · Universitas Negeri Medan
                </p>
                <p className="mt-6 text-center text-sm text-slate-500">
                    Belum mempunyai akun?{" "}
                    <Link
                        href="/register"
                        className="font-medium text-blue-700 hover:underline"
                    >
                        Daftar sekarang
                    </Link>
                </p>    
            </div>
        </main>
    );
}
