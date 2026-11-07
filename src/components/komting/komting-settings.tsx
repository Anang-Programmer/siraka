"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { getErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";

type ProfileInfo = {
  full_name: string;
  email: string | null;
  student_number: string | null;
  role: string;
  class_id: string | null;
};

type ClassInfo = {
  class_code: string;
  class_name: string;
  study_program: string;
};

type PasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  placeholder: string;
  minLength?: number;
  disabled: boolean;
};

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  minLength,
  disabled,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="min-w-0">
      <label
        htmlFor={id}
        className="mb-2.5 block text-xs font-semibold text-primary"
      >
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          minLength={minLength}
          disabled={disabled}
          required
          className="input-field min-h-12 rounded-xl pr-12"
        />

        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          disabled={disabled}
          aria-label={
            visible
              ? `Sembunyikan ${label}`
              : `Tampilkan ${label}`
          }
          aria-pressed={visible}
          aria-controls={id}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-muted transition hover:text-primary focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="h-5 w-5"
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
        </button>
      </div>
    </div>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-5 w-5"
    >
      <rect x="4" y="10" width="16" height="11" rx="3" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 15v2" />
    </svg>
  );
}

export default function KomtingSettings() {
  const controllerRef = useRef<AbortController | null>(null);
  const passwordLock = useRef(false);

  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [classInfo, setClassInfo] = useState<ClassInfo | null>(
    null,
  );

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  const loadProfile = useCallback(async () => {
    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;

    const { signal } = controller;

    setLoading(true);
    setLoadError("");

    try {
      const supabase = createClient();

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (signal.aborted) return;
      if (authError) throw authError;

      if (!user) {
        throw new Error(
          "Sesi login tidak ditemukan. Silakan login ulang.",
        );
      }

      const { data, error: profileError } = await supabase
        .from("profiles")
        .select(
          "full_name, email, student_number, role, class_id",
        )
        .eq("id", user.id)
        .single();

      if (signal.aborted) return;
      if (profileError) throw profileError;

      let nextClass: ClassInfo | null = null;

      if (data.class_id) {
        const { data: classData, error: classError } =
          await supabase
            .from("classes")
            .select("class_code, class_name, study_program")
            .eq("id", data.class_id)
            .single();

        if (signal.aborted) return;
        if (classError) throw classError;

        nextClass = classData as ClassInfo;
      }

      if (signal.aborted) return;

      setAuthEmail(user.email ?? "");
      setProfile(data as ProfileInfo);
      setClassInfo(nextClass);
    } catch (err) {
      if (signal.aborted) return;

      console.error("Load Komting profile:", err);

      setLoadError(
        getErrorMessage(err, "Gagal memuat profil."),
      );
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();

    return () => {
      controllerRef.current?.abort();
    };
  }, [loadProfile]);

  const ready = !loading && !loadError && profile !== null;

  async function handlePasswordUpdate(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!ready || passwordLock.current) return;

    setPasswordError("");
    setPasswordSuccess("");

    if (!currentPassword) {
      setPasswordError("Masukkan kata sandi saat ini.");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError("Kata sandi baru minimal 8 karakter.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("Konfirmasi kata sandi tidak sama.");
      return;
    }

    if (newPassword === currentPassword) {
      setPasswordError(
        "Kata sandi baru harus berbeda dari kata sandi saat ini.",
      );
      return;
    }

    passwordLock.current = true;
    setSavingPassword(true);

    try {
      const supabase = createClient();

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!user?.email) {
        throw new Error("Email akun tidak ditemukan.");
      }

      const { error: verifyError } =
        await supabase.auth.signInWithPassword({
          email: user.email,
          password: currentPassword,
        });

      if (verifyError) {
        if (verifyError.code === "invalid_credentials") {
          throw new Error("Kata sandi saat ini tidak sesuai.");
        }

        throw verifyError;
      }

      const { error: updateError } =
        await supabase.auth.updateUser({
          password: newPassword,
        });

      if (updateError) throw updateError;

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      setPasswordSuccess(
        "Kata sandi berhasil diperbarui. Gunakan kata sandi baru saat login berikutnya.",
      );
    } catch (err) {
      console.error("Update Komting password:", err);

      setPasswordError(
        getErrorMessage(
          err,
          "Gagal memperbarui kata sandi.",
        ),
      );
    } finally {
      passwordLock.current = false;
      setSavingPassword(false);
    }
  }

  const name = profile?.full_name?.trim() || "Komting";

  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase();

  const profileFields = [
    {
      label: "Nama Lengkap",
      value: profile?.full_name || "—",
    },
    {
      label: "Email",
      value: authEmail || profile?.email || "—",
    },
    {
      label: "Nomor Induk Mahasiswa",
      value: profile?.student_number || "—",
    },
    {
      label: "Peran",
      value: "Komting",
    },
  ];

  return (
    <div className="space-y-7">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
            Workspace / Akun Komting
          </p>

          <h1 className="mt-2 font-heading text-2xl font-extrabold text-primary sm:text-3xl">
            Pengaturan Akun
          </h1>

          <p className="mt-2 text-sm leading-7 text-muted">
            Periksa informasi profil dan kelola kata sandi akunmu.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadProfile()}
          disabled={loading || savingPassword}
          className="btn-outline w-fit shrink-0 rounded-xl text-xs shadow-sm"
        >
          {loading ? "Memuat..." : "↻ Muat Ulang"}
        </button>
      </section>

      {loadError && (
        <p
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-7 text-red-700"
        >
          {loadError}
        </p>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/20">
            <div className="h-24 bg-[#173A56]" />

            <div className="px-6 pb-6">
              <div
                aria-hidden="true"
                className="relative -mt-9 flex h-20 w-20 items-center justify-center rounded-3xl border-[6px] border-white bg-slate-100 font-heading text-xl font-extrabold text-primary"
              >
                {ready ? initials : "—"}
              </div>

              <h2 className="mt-4 break-words font-heading text-lg font-extrabold text-primary">
                {ready ? name : "Memuat profil..."}
              </h2>

              <p className="mt-2 break-all text-xs leading-6 text-muted">
                {ready
                  ? authEmail || profile?.email || "—"
                  : "Informasi akun"}
              </p>

              <span className="mt-4 inline-flex rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-semibold text-primary">
                Komisaris Tingkat
              </span>

              <div className="mt-5 border-t border-slate-100 pt-5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                  Kelas
                </p>

                <p className="mt-2 text-sm font-bold leading-7 text-primary">
                  {ready
                    ? classInfo?.class_name ||
                      "Belum ditetapkan"
                    : "—"}
                </p>

                <p className="mt-2 text-xs leading-6 text-muted">
                  {ready
                    ? classInfo?.study_program || "—"
                    : "—"}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-5">
            <h2 className="text-xs font-bold text-primary">
              Informasi Profil
            </h2>

            <p className="mt-2 text-xs leading-7 text-muted">
              Data profil ditampilkan sesuai informasi akun yang
              terdaftar. Hubungi Admin jika data akademik atau
              penetapan kelas perlu diperiksa.
            </p>
          </section>
        </aside>

        <div className="min-w-0 space-y-6">
          <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/20">
            <div className="border-b border-slate-100 p-5 sm:p-6">
              <h2 className="font-heading text-base font-extrabold text-primary">
                Profil Saya
              </h2>

              <p className="mt-2 text-xs leading-6 text-muted">
                Informasi akun yang terdaftar di SIRAKA.
              </p>
            </div>

            {loading ? (
              <p
                role="status"
                className="p-8 text-center text-sm text-muted"
              >
                Memuat informasi profil...
              </p>
            ) : !ready ? (
              <p className="p-8 text-center text-sm text-muted">
                Profil belum dapat ditampilkan. Silakan muat ulang.
              </p>
            ) : (
              <dl className="grid gap-6 p-5 sm:grid-cols-2 sm:p-6">
                {profileFields.map((field) => (
                  <div key={field.label} className="min-w-0">
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                      {field.label}
                    </dt>

                    <dd className="mt-2 break-words text-sm font-semibold leading-7 text-primary">
                      {field.value}
                    </dd>
                  </div>
                ))}

                <div className="border-t border-slate-100 pt-5 sm:col-span-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                    Kelas Terdaftar
                  </dt>

                  <dd className="mt-2 text-sm font-semibold leading-7 text-primary">
                    {classInfo
                      ? `${classInfo.class_code} · ${classInfo.class_name}`
                      : "Belum ditetapkan"}
                  </dd>
                </div>
              </dl>
            )}
          </section>

          <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/20">
            <div className="flex items-start gap-3 border-b border-slate-100 p-5 sm:p-6">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-primary">
                <LockIcon />
              </span>

              <div>
                <h2 className="font-heading text-base font-extrabold text-primary">
                  Ubah Kata Sandi
                </h2>

                <p className="mt-2 text-xs leading-6 text-muted">
                  Gunakan kata sandi baru minimal 8 karakter.
                </p>
              </div>
            </div>

            <form
              onSubmit={handlePasswordUpdate}
              aria-busy={savingPassword}
              className="space-y-5 p-5 sm:p-6"
            >
              {passwordError && (
                <p
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs leading-7 text-red-700"
                >
                  {passwordError}
                </p>
              )}

              {passwordSuccess && (
                <p
                  role="status"
                  className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs leading-7 text-emerald-700"
                >
                  {passwordSuccess}
                </p>
              )}

              <PasswordField
                id="current-password"
                label="Kata sandi saat ini"
                value={currentPassword}
                onChange={setCurrentPassword}
                autoComplete="current-password"
                placeholder="Masukkan kata sandi saat ini"
                disabled={!ready || savingPassword}
              />

              <div className="grid gap-5 md:grid-cols-2">
                <PasswordField
                  id="new-password"
                  label="Kata sandi baru"
                  value={newPassword}
                  onChange={setNewPassword}
                  autoComplete="new-password"
                  placeholder="Minimal 8 karakter"
                  minLength={8}
                  disabled={!ready || savingPassword}
                />

                <PasswordField
                  id="confirm-password"
                  label="Konfirmasi kata sandi baru"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  autoComplete="new-password"
                  placeholder="Ulangi kata sandi baru"
                  minLength={8}
                  disabled={!ready || savingPassword}
                />
              </div>

              <div className="flex flex-col justify-between gap-4 border-t border-slate-100 pt-5 sm:flex-row sm:items-center">
                <p className="max-w-sm text-[11px] leading-6 text-muted">
                  Kata sandi saat ini akan diverifikasi sebelum
                  perubahan disimpan.
                </p>

                <button
                  type="submit"
                  disabled={!ready || savingPassword}
                  className="btn-primary shrink-0 rounded-xl text-xs"
                >
                  {savingPassword
                    ? "Menyimpan..."
                    : "Simpan Kata Sandi"}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}