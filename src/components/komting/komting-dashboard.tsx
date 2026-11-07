"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";

type DashboardSummary = {
  fullName: string;
  classLabel: string;
  pendingBookings: number;
  approvedBookings: number;
  pendingRegistrations: number;
  pendingStudentRequests: number;
  activeStudents: number;
  inactiveStudents: number;
};

const quickActions = [
  {
    title: "Ajukan Booking",
    description: "Ajukan penggunaan ruang untuk kebutuhan kelas.",
    href: "/dashboard/komting/bookings/new",
    action: "Buat pengajuan",
    icon: "calendar",
  },
  {
    title: "Pengajuan Mahasiswa",
    description: "Tinjau kebutuhan ruangan yang dikirim mahasiswa.",
    href: "/dashboard/komting/student-requests",
    action: "Buka kotak masuk",
    icon: "inbox",
  },
  {
    title: "Status Booking",
    description: "Pantau pengajuan, pembatalan, dan pemakaian ruangan.",
    href: "/dashboard/komting/bookings",
    action: "Lihat status",
    icon: "clock",
  },
  {
    title: "Persetujuan Mahasiswa",
    description: "Tinjau pendaftaran mahasiswa ke kelasmu.",
    href: "/dashboard/komting/registrations",
    action: "Tinjau pendaftar",
    icon: "user-check",
  },
  {
    title: "Daftar Mahasiswa",
    description: "Lihat anggota kelas dan kelola status akun.",
    href: "/dashboard/komting/students",
    action: "Buka daftar",
    icon: "users",
  },
  {
    title: "Pengaturan Akun",
    description: "Lihat profil dan ubah password akun.",
    href: "/dashboard/komting/settings",
    action: "Kelola akun",
    icon: "settings",
  },
] as const;

function ActionIcon({ name }: { name: (typeof quickActions)[number]["icon"] }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "calendar") return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18M12 13v5M9.5 15.5h5" /></svg>;
  if (name === "inbox") return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M4 4h16l2 11v4H2v-4L4 4Z" /><path d="M2 15h6l2 2h4l2-2h6" /></svg>;
  if (name === "clock") return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>;
  if (name === "user-check") return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><circle cx="9" cy="7" r="4" /><path d="M2 20v-1.5a4 4 0 0 1 4-4h6a4 4 0 0 1 3.5 2M16 10l2 2 4-4" /></svg>;
  if (name === "settings") return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.5.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.5-.9l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.8L6.3 12l1.4-2.4 1.7.6a8 8 0 0 1 1.5-.9l.3-1.8H14l.3 1.8a8 8 0 0 1 1.5.9l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1-.1 1.9Z" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" /><circle cx="9" cy="7" r="4" /><path d="M18 8a4 4 0 1 1 0 8" /></svg>;
}

function StatCard({ label, value, detail, href, tone = "slate" }: {
  label: string;
  value: number | string;
  detail: string;
  href?: string;
  tone?: "slate" | "amber" | "emerald" | "blue";
}) {
  const toneClass = {
    slate: "border-slate-200 text-slate-900",
    amber: "border-amber-200 text-amber-700",
    emerald: "border-emerald-200 text-emerald-700",
    blue: "border-blue-200 text-blue-700",
  }[tone];
  const content = (
    <div className={`h-full rounded-xl border bg-white p-5 ${toneClass} ${href ? "transition hover:-translate-y-0.5 hover:shadow-sm" : ""}`}>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
  return href ? <Link href={href} className="block">{content}</Link> : content;
}

export default function KomtingDashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadDashboard = useCallback((signal?: AbortSignal) => {
    const request = async () => {
      const supabase = createClient();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) throw new Error("Sesi login tidak ditemukan. Silakan login ulang.");

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("full_name, class_id")
        .eq("id", authData.user.id)
        .single();
      if (profileError) throw profileError;
      if (!profile.class_id) throw new Error("Akun Komting belum memiliki kelas.");

      const [
        { data: classData, error: classError },
        { count: pendingBookings, error: pendingBookingError },
        { count: approvedBookings, error: approvedBookingError },
        { count: pendingRegistrations, error: registrationError },
        { count: pendingStudentRequests, error: studentRequestError },
        { data: students, error: studentsError },
      ] = await Promise.all([
        supabase.from("classes").select("class_code, class_name").eq("id", profile.class_id).single(),
        supabase.from("bookings").select("id", { count: "exact", head: true }).eq("requester_id", authData.user.id).in("status", ["pending", "under_review"]),
        supabase.from("bookings").select("id", { count: "exact", head: true }).eq("requester_id", authData.user.id).eq("status", "approved"),
        supabase.from("registration_requests").select("id", { count: "exact", head: true }).eq("class_id", profile.class_id).eq("requested_role", "mahasiswa").eq("status", "pending"),
        supabase.from("student_room_requests").select("id", { count: "exact", head: true }).eq("class_id", profile.class_id).eq("status", "pending"),
        supabase.rpc("get_komting_student_directory"),
      ]);

      const firstError = classError || pendingBookingError || approvedBookingError || registrationError || studentRequestError || studentsError;
      if (firstError) throw firstError;

      const directory = (students ?? []) as Array<{ is_active: boolean }>;
      const activeStudents = directory.filter((student) => student.is_active).length;
      if (signal?.aborted) return;
      setSummary({
        fullName: profile.full_name,
        classLabel: classData ? `${classData.class_code} - ${classData.class_name}` : "Kelas Komting",
        pendingBookings: pendingBookings ?? 0,
        approvedBookings: approvedBookings ?? 0,
        pendingRegistrations: pendingRegistrations ?? 0,
        pendingStudentRequests: pendingStudentRequests ?? 0,
        activeStudents,
        inactiveStudents: directory.length - activeStudents,
      });
    };
    return request().catch((err: unknown) => {
      console.error("Load Komting dashboard:", err);
      if (!signal?.aborted) setError(getErrorMessage(err, "Gagal memuat dashboard Komting."));
    }).finally(() => {
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadDashboard(controller.signal);
    return () => controller.abort();
  }, [loadDashboard]);

  const displayName = summary?.fullName?.trim().split(/\s+/)[0] ?? "Komting";

  return (
    <div className="space-y-7">
      <section className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-slate-500">Dashboard Komting</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            {loading ? "Selamat datang" : `Halo, ${displayName}!`}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {summary?.classLabel ?? "Ringkasan aktivitas kelas dan peminjaman ruangan."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
                      setRefreshing(true);
                      setError("");
                      void loadDashboard();
                    }}
          disabled={loading || refreshing}
          className="shrink-0 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {refreshing ? "Memuat..." : "Perbarui Ringkasan"}
        </button>
      </section>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Ringkasan Aktivitas</h2>
            <p className="mt-1 text-sm text-slate-500">Hal yang perlu kamu pantau sebagai Komting.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Saran Mahasiswa Menunggu" value={loading ? "-" : summary?.pendingStudentRequests ?? 0} detail="Perlu ditinjau" href="/dashboard/komting/student-requests" tone="amber" />
          <StatCard label="Pendaftaran Mahasiswa" value={loading ? "-" : summary?.pendingRegistrations ?? 0} detail="Menunggu persetujuan kelas" href="/dashboard/komting/registrations" tone="blue" />
          <StatCard label="Booking Menunggu" value={loading ? "-" : summary?.pendingBookings ?? 0} detail="Menunggu atau sedang ditinjau" href="/dashboard/komting/bookings" tone="amber" />
          <StatCard label="Booking Disetujui" value={loading ? "-" : summary?.approvedBookings ?? 0} detail="Booking milikmu" href="/dashboard/komting/bookings" tone="emerald" />
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Aksi Cepat</h2>
          <p className="mt-1 text-sm text-slate-500">Pilih pekerjaan yang ingin kamu lakukan sekarang.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="group flex min-h-40 flex-col rounded-xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 p-2.5 text-slate-700">
                  <ActionIcon name={action.icon} />
                </span>
                <h3 className="font-semibold text-slate-900">{action.title}</h3>
              </div>
              <p className="mt-3 flex-1 text-sm leading-5 text-slate-500">{action.description}</p>
              <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                {action.action}<span aria-hidden="true" className="transition group-hover:translate-x-1">→</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Keanggotaan Kelas</h2>
            <p className="mt-1 text-sm text-slate-500">Ringkasan mahasiswa yang berada di bawah koordinasimu.</p>
          </div>
          <Link href="/dashboard/komting/students" className="text-sm font-semibold text-slate-800 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-800">Kelola daftar mahasiswa</Link>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
          <div><p className="text-xs text-slate-500">Mahasiswa aktif</p><p className="mt-1 text-xl font-bold text-emerald-700">{loading ? "-" : summary?.activeStudents ?? 0}</p></div>
          <div><p className="text-xs text-slate-500">Mahasiswa nonaktif</p><p className="mt-1 text-xl font-bold text-slate-700">{loading ? "-" : summary?.inactiveStudents ?? 0}</p></div>
        </div>
      </section>
    </div>
  );
}
