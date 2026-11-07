"use client";

import { useCallback, useEffect, useState } from "react";
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

export default function KomtingSettings() {
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  const loadProfile = useCallback((signal: AbortSignal) => {
    const request = async () => {
      const supabase = createClient();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) throw new Error("Sesi login tidak ditemukan. Silakan login ulang.");
      if (signal.aborted) return;
      setAuthEmail(authData.user.email ?? "");

      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, email, student_number, role, class_id")
        .eq("id", authData.user.id)
        .single();
      if (error) throw error;
      if (signal.aborted) return;
      setProfile(data as ProfileInfo);

      if (data.class_id) {
        const { data: classData, error: classError } = await supabase
          .from("classes")
          .select("class_code, class_name, study_program")
          .eq("id", data.class_id)
          .single();
        if (classError) throw classError;
        if (signal.aborted) return;
        setClassInfo(classData as ClassInfo);
      } else {
        setClassInfo(null);
      }
    };
    return request().catch((err: unknown) => {
      console.error("Load Komting profile:", err);
      if (!signal.aborted) setLoadError(getErrorMessage(err, "Gagal memuat profil."));
    }).finally(() => {
      if (!signal.aborted) setLoading(false);
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadProfile(controller.signal);
    return () => controller.abort();
  }, [loadProfile]);

  async function handlePasswordUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (newPassword.length < 8) {
      setPasswordError("Password baru minimal 8 karakter.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Konfirmasi password tidak sama.");
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError("Password baru harus berbeda dari password saat ini.");
      return;
    }

    setSavingPassword(true);
    try {
      const supabase = createClient();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user?.email) throw new Error("Email akun tidak ditemukan.");

      // Verify the current password before changing it.
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: authData.user.email,
        password: currentPassword,
      });
      if (verifyError) throw new Error("Password saat ini tidak sesuai.");

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccess("Password berhasil diperbarui.");
    } catch (err) {
      console.error("Update Komting password:", err);
      setPasswordError(getErrorMessage(err, "Gagal memperbarui password."));
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-sm font-medium text-slate-500">Akun Komting</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Pengaturan</h1>
        <p className="mt-2 text-sm text-slate-500">Lihat informasi akun dan perbarui password login.</p>
      </div>

      {loadError && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</div>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Profil Saya</h2>
          <p className="mt-1 text-sm text-slate-500">Informasi akun yang terdaftar di SIRAKA.</p>
        </div>
        {loading ? (
          <div className="p-8 text-sm text-slate-500">Memuat profil...</div>
        ) : profile ? (
          <div className="grid gap-x-8 gap-y-5 p-5 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Nama Lengkap</p>
              <p className="mt-1 font-semibold text-slate-900">{profile.full_name || "-"}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Email</p>
              <p className="mt-1 break-all font-semibold text-slate-900">{authEmail || profile.email || "-"}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">NIM</p>
              <p className="mt-1 font-semibold tabular-nums text-slate-900">{profile.student_number || "-"}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Peran</p>
              <p className="mt-1 font-semibold text-slate-900">Komting</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Kelas</p>
              <p className="mt-1 font-semibold text-slate-900">
                {classInfo ? `${classInfo.class_code} - ${classInfo.class_name}` : "Belum ditetapkan"}
              </p>
              {classInfo && <p className="mt-1 text-sm text-slate-500">{classInfo.study_program}</p>}
            </div>
          </div>
        ) : (
          <div className="p-8 text-sm text-slate-500">Profil tidak ditemukan.</div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Ubah Password</h2>
          <p className="mt-1 text-sm text-slate-500">Gunakan password baru minimal 8 karakter.</p>
        </div>
        <form onSubmit={handlePasswordUpdate} className="space-y-4 p-5">
          {passwordError && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{passwordError}</div>
          )}
          {passwordSuccess && (
            <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{passwordSuccess}</div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="current-password" className="mb-1.5 block text-sm font-medium text-slate-700">Password Saat Ini</label>
              <input
                id="current-password"
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </div>
            <div>
              <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-slate-700">Password Baru</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-slate-700">Konfirmasi Password Baru</label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">Password tidak ditampilkan atau disimpan di database profil.</p>
            <button
              type="submit"
              disabled={savingPassword || loading}
              className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingPassword ? "Menyimpan..." : "Simpan Password Baru"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
