"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/errors";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState(() =>
        searchParams.get("error") === "auth_callback"
            ? "Konfirmasi email gagal atau tautan sudah kedaluwarsa. Silakan coba login atau minta tautan konfirmasi baru."
            : ""
    );
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();

        setError("");
        setLoading(true);

        try {
            const supabase = createClient();

            const { data, error } = await supabase.auth.signInWithPassword({
                email: email.trim().toLowerCase(),
                password,
            });

            if (error || !data.user) {
                setError(error?.code === "invalid_credentials"
                    ? "Email atau password tidak valid."
                    : getErrorMessage(error, "Login gagal. Silakan coba lagi."));
                setLoading(false);
                return;
            }

            const { data: profile, error: profileError } = await supabase
                .from("profiles")
                .select("is_active")
                .eq("id", data.user.id)
                .maybeSingle();

            if (profileError) {
                console.error("Load login profile:", profileError);
                setError(getErrorMessage(profileError, "Gagal membaca profil. Silakan coba lagi."));
                setLoading(false);
                return;
            }

            if (!profile) {
                setError("Profil pengguna tidak ditemukan.");
                setLoading(false);
                return;
            }

            router.replace(profile.is_active ? "/" : "/registration-status");
            router.refresh();
        } catch (err) {
            console.error("Login:", err);
            setError(getErrorMessage(err, "Login gagal. Silakan coba lagi."));
            setLoading(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
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
                    className="w-full rounded-lg border px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>

            <div>
                <label className="mb-2 block text-sm font-medium">
                    Password
                </label>

                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Masukkan password"
                    autoComplete="current-password"
                    required
                    className="w-full rounded-lg border px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>

            {error && (
                <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                    {error}
                </p>
            )}

            <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-slate-900 px-4 py-3 font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
            >
                {loading ? "Memproses..." : "Masuk"}
            </button>
        </form>
    );
}