"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/errors";

function PasswordIcon({ visible }: { visible: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {visible ? (
        <>
          <path d="m3 3 18 18" />
          <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
          <path d="M9.9 5.2A11 11 0 0 1 12 5c7 0 10 7 10 7a17 17 0 0 1-3.1 4.1" />
          <path d="M6.6 6.6A17 17 0 0 0 2 12s3 7 10 7a11 11 0 0 0 5.4-1.4" />
        </>
      ) : (
        <>
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState(() =>
    searchParams.get("error") === "auth_callback"
      ? "Konfirmasi email gagal atau tautan sudah kedaluwarsa. Silakan coba login atau minta tautan konfirmasi baru."
      : "",
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) return;

    setError("");
    setLoading(true);

    try {
      const supabase = createClient();

      const { data, error: loginError } =
        await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });

      if (loginError || !data.user) {
        setError(
          loginError?.code === "invalid_credentials"
            ? "Email atau kata sandi tidak valid."
            : getErrorMessage(
              loginError,
              "Login gagal. Silakan coba lagi.",
            ),
        );

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

        setError(
          getErrorMessage(
            profileError,
            "Gagal membaca profil. Silakan coba lagi.",
          ),
        );

        setLoading(false);
        return;
      }

      if (!profile) {
        setError("Profil pengguna tidak ditemukan.");
        setLoading(false);
        return;
      }

      const destination = profile.is_active
        ? "/"
        : "/registration-status";

      setLoading(false);
      router.replace(destination);
    } catch (err) {
      console.error("Login:", err);

      setError(
        getErrorMessage(err, "Login gagal. Silakan coba lagi."),
      );

      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={loading}
      className="space-y-5"
    >
      <div>
        <label htmlFor="login-email" className="form-label">
          Email
        </label>

        <input
          id="login-email"
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Contoh: nama@gmail.com"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          disabled={loading}
          required
          className="input-field min-h-12"
        />
      </div>

      <div>
        <label htmlFor="login-password" className="form-label">
          Kata Sandi
        </label>

        <div className="relative">
          <input
            id="login-password"
            name="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Masukkan kata sandi"
            autoComplete="current-password"
            disabled={loading}
            required
            className="input-field min-h-12 pr-12"
          />

          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            disabled={loading}
            aria-label={
              showPassword
                ? "Sembunyikan kata sandi"
                : "Tampilkan kata sandi"
            }
            aria-pressed={showPassword}
            aria-controls="login-password"
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-lg text-muted transition hover:text-primary focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            <PasswordIcon visible={showPassword} />
          </button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-700"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="btn-primary min-h-12 w-full"
      >
        {loading ? (
          <>
            <svg
              className="h-4 w-4 animate-spin"
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
                className="opacity-25"
              />

              <path
                d="M21 12a9 9 0 0 0-9-9"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>

            <span>Memproses...</span>
          </>
        ) : (
          "Masuk ke SIRAKA"
        )}
      </button>
    </form>
  );
}