"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";

type Student = {
  id: string;
  full_name: string;
  student_number: string | null;
  created_at: string;
  is_active: boolean;
};

type ClassInfo = {
  class_code: string;
  class_name: string;
  study_program: string;
};

type StudentFilter = "all" | "active" | "inactive";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

export default function StudentList() {
  const [students, setStudents] = useState<Student[]>([]);
  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StudentFilter>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyStudentId, setBusyStudentId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadStudents = useCallback((signal?: AbortSignal) => {
    const request = async () => {
      const supabase = createClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!userData.user) throw new Error("Sesi login tidak ditemukan. Silakan login ulang.");

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("class_id")
        .eq("id", userData.user.id)
        .single();
      if (profileError) throw profileError;
      if (!profile?.class_id) throw new Error("Akun Komting belum memiliki kelas.");

      const [{ data: classData, error: classError }, { data: studentData, error: studentError }] =
        await Promise.all([
          supabase
            .from("classes")
            .select("class_code, class_name, study_program")
            .eq("id", profile.class_id)
            .single(),
          supabase.rpc("get_komting_student_directory"),
        ]);

      if (classError) throw classError;
      if (studentError) throw studentError;

      if (signal?.aborted) return;
      setClassInfo(classData as ClassInfo);
      setStudents((studentData ?? []) as Student[]);
    };
    return request().catch((err: unknown) => {
      console.error("Load Komting student directory:", err);
      if (!signal?.aborted) setError(getErrorMessage(err, "Gagal memuat daftar mahasiswa."));
    }).finally(() => {
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadStudents(controller.signal);
    return () => controller.abort();
  }, [loadStudents]);

  const activeCount = students.filter((student) => student.is_active).length;
  const inactiveCount = students.length - activeCount;

  const filteredStudents = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("id-ID");
    return students.filter((student) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "active" && student.is_active) ||
        (filter === "inactive" && !student.is_active);
      const matchesSearch =
        !keyword ||
        [student.full_name, student.student_number ?? ""]
          .join(" ")
          .toLocaleLowerCase("id-ID")
          .includes(keyword);
      return matchesFilter && matchesSearch;
    });
  }, [students, search, filter]);

  async function toggleStudentStatus(student: Student) {
    const nextActive = !student.is_active;
    const action = nextActive ? "mengaktifkan kembali" : "menonaktifkan";
    const confirmed = window.confirm(
      `Yakin ingin ${action} akun ${student.full_name}?\n\n${
        nextActive
          ? "Mahasiswa akan dapat masuk kembali ke SIRAKA."
          : "Mahasiswa tidak dapat masuk ke SIRAKA sampai diaktifkan kembali. Riwayatnya tetap disimpan."
      }`,
    );
    if (!confirmed) return;

    setBusyStudentId(student.id);
    setError("");
    setSuccess("");

    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc("set_komting_student_active", {
        p_student_id: student.id,
        p_is_active: nextActive,
      });
      if (rpcError) throw rpcError;

      setSuccess(
        nextActive
          ? `${student.full_name} berhasil diaktifkan kembali.`
          : `${student.full_name} berhasil dinonaktifkan.`,
      );
      setRefreshing(true);
      await loadStudents();
    } catch (err) {
      console.error("Update student status:", err);
      setError(getErrorMessage(err, "Gagal mengubah status mahasiswa."));
    } finally {
      setBusyStudentId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-slate-500">Komting</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Daftar Mahasiswa</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Lihat mahasiswa di kelasmu dan atur status akun. Akun dinonaktifkan, bukan dihapus permanen,
            agar riwayat dan data akademik tetap terjaga.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
                      setRefreshing(true);
                      setError("");
                      void loadStudents();
                    }}
          disabled={loading || refreshing}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {refreshing ? "Memuat..." : "Muat Ulang"}
        </button>
      </div>

      {classInfo && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Kelas yang diwakili</p>
          <h2 className="mt-1 text-lg font-bold text-slate-900">
            {classInfo.class_code} - {classInfo.class_name}
          </h2>
          <p className="mt-1 text-sm text-slate-500">{classInfo.study_program}</p>
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {success}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Total mahasiswa</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{loading ? "-" : students.length}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-white p-5">
          <p className="text-sm text-slate-500">Akun aktif</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-emerald-700">{loading ? "-" : activeCount}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-white p-5">
          <p className="text-sm text-slate-500">Akun nonaktif</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-amber-700">{loading ? "-" : inactiveCount}</p>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Anggota Kelas</h2>
              <p className="mt-1 text-xs text-slate-500">Nonaktifkan akun bila mahasiswa sudah tidak menjadi anggota kelas.</p>
            </div>
            <div className="w-full sm:max-w-xs">
              <label htmlFor="student-search" className="text-xs font-medium text-slate-500">Cari nama atau NIM</label>
              <input
                id="student-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Ketik nama atau NIM..."
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter status mahasiswa">
            {([
              ["all", `Semua (${students.length})`],
              ["active", `Aktif (${activeCount})`],
              ["inactive", `Nonaktif (${inactiveCount})`],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  filter === value ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">Memuat daftar mahasiswa...</div>
        ) : filteredStudents.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-semibold text-slate-800">Tidak ada mahasiswa pada filter ini.</p>
            <p className="mt-1 text-sm text-slate-500">Ubah filter atau kata pencarian.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-3xl border-collapse text-left">
              <thead className="bg-slate-50">
                <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3">No.</th>
                  <th className="px-5 py-3">NIM</th>
                  <th className="px-5 py-3">Nama Mahasiswa</th>
                  <th className="px-5 py-3">Terdaftar Sejak</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.map((student, index) => (
                  <tr key={student.id} className="text-sm text-slate-700 hover:bg-slate-50/70">
                    <td className="px-5 py-3.5 text-slate-400">{index + 1}</td>
                    <td className="px-5 py-3.5 font-medium tabular-nums text-slate-800">{student.student_number || "-"}</td>
                    <td className="px-5 py-3.5 font-medium text-slate-900">{student.full_name}</td>
                    <td className="px-5 py-3.5 text-slate-500">{formatDate(student.created_at)}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${student.is_active ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-100 text-slate-600 ring-slate-200"}`}>
                        {student.is_active ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => void toggleStudentStatus(student)}
                        disabled={busyStudentId !== null}
                        className={`rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${student.is_active ? "border-amber-200 text-amber-700 hover:bg-amber-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}
                      >
                        {busyStudentId === student.id ? "Memproses..." : student.is_active ? "Nonaktifkan" : "Aktifkan kembali"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
