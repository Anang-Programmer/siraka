"use client";

import {
  useEffect,
  useState,
  type ComponentProps,
  type FormEvent,
} from "react";
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

type PasswordFieldProps = Omit<
  ComponentProps<"input">,
  "type" | "className"
> & {
  id: string;
  label: string;
};

function PasswordField({
  id,
  label,
  disabled,
  ...inputProps
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="form-label">
        {label}
      </label>

      <div className="relative">
        <input
          {...inputProps}
          id={id}
          type={visible ? "text" : "password"}
          disabled={disabled}
          className="input-field min-h-12 pr-12"
        />

        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          disabled={disabled}
          aria-label={
            visible ? `Sembunyikan ${label}` : `Tampilkan ${label}`
          }
          aria-pressed={visible}
          aria-controls={id}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-lg text-muted transition hover:text-primary focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
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
        </button>
      </div>
    </div>
  );
}

export default function RegisterForm() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("mahasiswa");
  const [classId, setClassId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [classes, setClasses] = useState<RegistrationClass[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [classesError, setClassesError] = useState("");
  const [reloadClasses, setReloadClasses] = useState(0);

  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadClasses() {
      setLoadingClasses(true);
      setClasses([]);
      setClassId("");
      setClassesError("");

      try {
        const supabase = createClient();

        const { data, error: queryError } = await supabase.rpc(
          "get_registration_classes",
          {
            p_requested_role: role,
          },
        );

        if (queryError) throw queryError;

        if (mounted) {
          setClasses((data ?? []) as RegistrationClass[]);
        }
      } catch (err) {
        console.error("Load registration classes:", err);

        if (mounted) {
          setClassesError(
            getErrorMessage(err, "Gagal mengambil daftar kelas."),
          );
        }
      } finally {
        if (mounted) {
          setLoadingClasses(false);
        }
      }
    }

    void loadClasses();

    return () => {
      mounted = false;
    };
  }, [role, reloadClasses]);

  function handleRoleChange(nextRole: AppRole) {
    setRole(nextRole);
    setClassId("");
    setClasses([]);
    setLoadingClasses(true);
    setClassesError("");
    setError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (registering) return;

    setError("");
    setSuccess("");

    if (!fullName.trim()) {
      setError("Nama lengkap wajib diisi.");
      return;
    }

    if (!studentNumber.trim()) {
      setError("NIM wajib diisi.");
      return;
    }

    if (!email.trim()) {
      setError("Email wajib diisi.");
      return;
    }

    if (
      loadingClasses ||
      classesError ||
      !classes.some((item) => item.id === classId)
    ) {
      setError("Silakan pilih kelas yang tersedia terlebih dahulu.");
      return;
    }

    if (password.length < 8) {
      setError("Kata sandi minimal 8 karakter.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Konfirmasi kata sandi tidak cocok.");
      return;
    }

    setRegistering(true);

    try {
      const supabase = createClient();

      const { data, error: registrationError } =
        await supabase.auth.signUp({
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

      if (registrationError) {
        throw registrationError;
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
        "Registrasi berhasil dikirim. Silakan periksa email untuk melakukan konfirmasi sebelum melihat status pendaftaran.",
      );

      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      console.error("Registration:", err);

      setError(
        getErrorMessage(
          err,
          "Registrasi gagal. Periksa kembali data Anda.",
        ),
      );
    } finally {
      setRegistering(false);
    }
  }

  if (success) {
    return (
      <div className="space-y-5">
        <div
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 p-4"
        >
          <h2 className="text-lg font-bold text-emerald-800">
            Periksa Email Anda
          </h2>

          <p className="mt-2 text-sm leading-relaxed text-emerald-700">
            {success}
          </p>
        </div>

        <Link href="/login" className="btn-primary w-full">
          Kembali ke Login
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={registering}
      className="space-y-5"
    >
      <div>
        <label htmlFor="register-name" className="form-label">
          Nama Lengkap
        </label>

        <input
          id="register-name"
          name="fullName"
          type="text"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          placeholder="Masukkan nama lengkap"
          autoComplete="name"
          disabled={registering}
          required
          className="input-field min-h-12"
        />
      </div>

      <div>
        <label htmlFor="register-nim" className="form-label">
          NIM
        </label>

        <input
          id="register-nim"
          name="studentNumber"
          type="text"
          inputMode="numeric"
          value={studentNumber}
          onChange={(event) => setStudentNumber(event.target.value)}
          placeholder="Masukkan NIM"
          maxLength={30}
          disabled={registering}
          required
          className="input-field min-h-12"
        />
      </div>

      <div>
        <label htmlFor="register-email" className="form-label">
          Email
        </label>

        <input
          id="register-email"
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Contoh: nama@gmail.com"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          disabled={registering}
          required
          className="input-field min-h-12"
        />
      </div>

      <div>
        <label htmlFor="register-role" className="form-label">
          Daftar Sebagai
        </label>

        <select
          id="register-role"
          name="role"
          value={role}
          onChange={(event) =>
            handleRoleChange(event.target.value as AppRole)
          }
          disabled={registering}
          aria-describedby="register-role-help"
          className="input-field min-h-12"
        >
          <option value="mahasiswa">Mahasiswa</option>
          <option value="komting">Komting</option>
        </select>

        <p
          id="register-role-help"
          className="mt-2 text-xs leading-relaxed text-muted"
        >
          {role === "mahasiswa"
            ? "Pendaftaran mahasiswa akan ditinjau oleh Komting kelas."
            : "Pendaftaran Komting akan ditinjau oleh Admin."}
        </p>
      </div>

      <div>
        <label htmlFor="register-class" className="form-label">
          Pilih Kelas
        </label>

        <select
          id="register-class"
          name="classId"
          value={classId}
          onChange={(event) => setClassId(event.target.value)}
          disabled={
            registering ||
            loadingClasses ||
            Boolean(classesError) ||
            classes.length === 0
          }
          aria-describedby="register-class-help"
          required
          className="input-field min-h-12"
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

        <div
          id="register-class-help"
          className="mt-2 text-xs leading-relaxed"
        >
          {loadingClasses ? (
            <p role="status" className="text-muted">
              Mengambil kelas yang tersedia untuk peran Anda.
            </p>
          ) : classesError ? (
            <div role="alert" className="text-red-700">
              <p>{classesError}</p>

              <button
                type="button"
                disabled={registering}
                onClick={() => {
                  setLoadingClasses(true);
                  setReloadClasses((current) => current + 1);
                }}
                className="mt-2 rounded-sm font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Coba muat ulang
              </button>
            </div>
          ) : classes.length === 0 ? (
            <p className="text-amber-800">
              {role === "mahasiswa"
                ? "Belum tersedia kelas yang memiliki Komting aktif."
                : "Belum tersedia kelas yang membutuhkan Komting."}
            </p>
          ) : (
            <p className="text-muted">
              Pilih kelas sesuai data akademik Anda.
            </p>
          )}
        </div>
      </div>

      <PasswordField
        id="register-password"
        name="password"
        label="Kata Sandi"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="Minimal 8 karakter"
        autoComplete="new-password"
        minLength={8}
        disabled={registering}
        required
      />

      <PasswordField
        id="register-confirm-password"
        name="confirmPassword"
        label="Konfirmasi Kata Sandi"
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        placeholder="Ulangi kata sandi"
        autoComplete="new-password"
        minLength={8}
        disabled={registering}
        required
      />

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-xs leading-relaxed text-muted">
          Akun dapat digunakan sesuai status verifikasi email dan
          persetujuan pendaftaran.
        </p>
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
        disabled={
          registering ||
          loadingClasses ||
          Boolean(classesError) ||
          classes.length === 0 ||
          !classId
        }
        className="btn-primary min-h-12 w-full"
      >
        {registering ? "Mendaftarkan..." : "Daftar Sekarang"}
      </button>

      <p className="text-center text-sm text-muted">
        Sudah punya akun?{" "}
        <Link
          href="/login"
          className="rounded-sm font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Login Sekarang
        </Link>
      </p>
    </form>
  );
}