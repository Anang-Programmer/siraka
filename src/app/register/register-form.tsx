"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/errors";

type AppRole = "mahasiswa" | "komting";

type RegistrationClass = {
    id: string;
    class_code: string;
    class_name: string;
    study_program: string;
    academic_year: string | null;
    semester: number | null;
};

export default function RegisterForm() {
    const router = useRouter();

    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const [role, setRole] = useState<AppRole>("mahasiswa");
    const [classId, setClassId] = useState("");
    const [classes, setClasses] = useState<RegistrationClass[]>([]);
    const [studentNumber, setStudentNumber] = useState("");

    const [loadingClasses, setLoadingClasses] = useState(true);
    const [registering, setRegistering] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    useEffect(() => {
        let mounted = true;

        async function loadClasses() {
            setLoadingClasses(true);
            setClasses([]);
            setClassId("");
            setError("");

            try {
                const supabase = createClient();

                const { data, error } = await supabase.rpc(
                    "get_registration_classes",
                    {
                        p_requested_role: role,
                    }
                );

                if (error) throw error;

                if (mounted) {
                    setClasses((data ?? []) as RegistrationClass[]);
                }
            } catch (err) {
                console.error("Load registration classes:", err);

                if (mounted) {
                    setError(getErrorMessage(err, "Gagal mengambil daftar kelas."));
                }
            } finally {
                if (mounted) {
                    setLoadingClasses(false);
                }
            }
        }

        loadClasses();

        return () => {
            mounted = false;
        };
    }, [role]);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        setError("");
        setSuccess("");

        if (!fullName.trim()) {
            setError("Nama lengkap wajib diisi.");
            return;
        }

        if (!classId) {
            setError("Silakan pilih kelas terlebih dahulu.");
            return;
        }

        if (!studentNumber.trim()) {
            setError("NIM wajib diisi.");
            return;
        }

        if (password.length < 8) {
            setError("Password minimal 8 karakter.");
            return;
        }

        if (password !== confirmPassword) {
            setError("Konfirmasi password tidak cocok.");
            return;
        }

        setRegistering(true);

        try {
            const supabase = createClient();

            const { data, error } = await supabase.auth.signUp({
                email: email.trim().toLowerCase(),
                password,
                options: {
                    data: {
                        full_name: fullName.trim(),
                        student_number: studentNumber.trim(),
                        requested_role: role,
                        requested_class_id: classId,
                    },
                    emailRedirectTo: `${window.location.origin}/auth/callback`,
                },
            });

            if (error) {
                throw error;
            }

            if (!data.user) {
                throw new Error("Registrasi belum berhasil dibuat.");
            }

            if (data.session) {
                router.replace("/registration-status");
                router.refresh();
                return;
            }

            setSuccess(
                "Registrasi berhasil dikirim. Silakan periksa email untuk melakukan konfirmasi sebelum melihat status pendaftaran."
            );

            setPassword("");
            setConfirmPassword("");
        } catch (err) {
            console.error("Registration:", err);

            setError(getErrorMessage(err, "Registrasi gagal. Periksa kembali data Anda."));
        } finally {
            setRegistering(false);
        }
    }

    if (success) {
        return (
            <div className="space-y-5">
                <div className="rounded-xl border border-green-200 bg-green-50 p-5">
                    <h3 className="font-semibold text-green-800">
                        Registrasi Berhasil
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-green-700">
                        {success}
                    </p>
                </div>

                <Link
                    href="/login"
                    className="block rounded-lg bg-slate-900 px-4 py-3 text-center text-sm font-medium text-white hover:bg-slate-700"
                >
                    Kembali ke Login
                </Link>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div>
                <label className="mb-2 block text-sm font-medium">
                    Nama Lengkap
                </label>

                <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Masukkan nama lengkap"
                    autoComplete="name"
                    required
                    className="w-full rounded-lg border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-400"
                />
            </div>
            <div>
                <label className="mb-2 block text-sm font-medium">
                    NIM
                </label>

                <input
                    type="text"
                    inputMode="numeric"
                    value={studentNumber}
                    onChange={(e) => setStudentNumber(e.target.value)}
                    placeholder="Masukkan NIM"
                    maxLength={30}
                    required
                    className="w-full rounded-lg border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-400"
                />
            </div>

            <div>
                <label className="mb-2 block text-sm font-medium">
                    Email
                </label>

                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@email.com"
                    autoComplete="email"
                    required
                    className="w-full rounded-lg border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-400"
                />
            </div>

            <div>
                <label className="mb-2 block text-sm font-medium">
                    Daftar Sebagai
                </label>

                <select
                    value={role}
                    onChange={(e) => {
                        setRole(e.target.value as AppRole);
                        setError("");
                    }}
                    className="w-full rounded-lg border bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-400"
                >
                    <option value="mahasiswa">Mahasiswa</option>
                    <option value="komting">Komting</option>
                </select>

                <p className="mt-2 text-xs text-slate-500">
                    Pilih sesuai peran Anda di kelas.
                </p>
            </div>

            <div>
                <label className="mb-2 block text-sm font-medium">
                    Pilih Kelas
                </label>

                <select
                    value={classId}
                    onChange={(e) => setClassId(e.target.value)}
                    disabled={loadingClasses || classes.length === 0}
                    required
                    className="w-full rounded-lg border bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-100"
                >
                    <option value="">
                        {loadingClasses
                            ? "Memuat daftar kelas..."
                            : "Pilih kelas"}
                    </option>

                    {classes.map((item) => (
                        <option key={item.id} value={item.id}>
                            {item.class_code} - {item.class_name}
                            {item.academic_year
                                ? ` (${item.academic_year})`
                                : ""}
                        </option>
                    ))}
                </select>

                {!loadingClasses && classes.length === 0 && (
                    <p className="mt-2 text-xs text-amber-600">
                        {role === "mahasiswa"
                            ? "Belum tersedia kelas yang memiliki Komting aktif."
                            : "Belum tersedia kelas yang membutuhkan Komting."}
                    </p>
                )}
            </div>

            <div>
                <label className="mb-2 block text-sm font-medium">
                    Password
                </label>

                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimal 8 karakter"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    className="w-full rounded-lg border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-400"
                />
            </div>

            <div>
                <label className="mb-2 block text-sm font-medium">
                    Konfirmasi Password
                </label>

                <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Ulangi password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    className="w-full rounded-lg border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-400"
                />
            </div>

            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            <button
                type="submit"
                disabled={
                    registering ||
                    loadingClasses ||
                    classes.length === 0
                }
                className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {registering ? "Mendaftarkan..." : "Daftar Sekarang"}
            </button>

            <p className="text-center text-sm text-slate-500">
                Sudah punya akun?{" "}
                <Link
                    href="/login"
                    className="font-medium text-blue-700 hover:underline"
                >
                    Login
                </Link>
            </p>
        </form>
    );
}