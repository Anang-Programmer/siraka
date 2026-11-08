"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

const filterOptions: {
  value: StudentFilter;
  label: string;
}[] = [
  { value: "all", label: "Semua" },
  { value: "active", label: "Aktif" },
  { value: "inactive", label: "Nonaktif" },
];

function UsersIcon({
  className = "h-5 w-5",
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="9" cy="7" r="3" />
      <path d="M3 21v-2a6 6 0 0 1 12 0v2" />
      <path d="M16 4a3 3 0 0 1 0 6M21 21v-2a6 6 0 0 0-4-5.7" />
    </svg>
  );
}

function dateLabel(value: string) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) return "—";

  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
  }).format(date);
}

function getInitials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word.charAt(0))
      .join("")
      .toUpperCase() || "M"
  );
}

export default function StudentList() {
  const controllerRef = useRef<AbortController | null>(null);
  const mutationLock = useRef(false);

  const [students, setStudents] = useState<Student[]>([]);
  const [classInfo, setClassInfo] = useState<ClassInfo | null>(
    null,
  );

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StudentFilter>("all");

  const [loading, setLoading] = useState(true);
  const [busyStudentId, setBusyStudentId] = useState<
    string | null
  >(null);

  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");

    const loadStudents = useCallback(() => {
    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;

    const { signal } = controller;

    const fetchStudents = async () => {
      const supabase = createClient();

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (signal.aborted) return;
      if (userError) throw userError;

      if (!user) {
        throw new Error(
          "Sesi login tidak ditemukan. Silakan login ulang.",
        );
      }

      const { data: profile, error: profileError } =
        await supabase
          .from("profiles")
          .select("class_id")
          .eq("id", user.id)
          .single();

      if (signal.aborted) return;
      if (profileError) throw profileError;

      if (!profile.class_id) {
        throw new Error("Akun Komting belum memiliki kelas.");
      }

      const [classResult, studentResult] = await Promise.all([
        supabase
          .from("classes")
          .select("class_code, class_name, study_program")
          .eq("id", profile.class_id)
          .single(),

        supabase.rpc("get_komting_student_directory"),
      ]);

      if (signal.aborted) return;
      if (classResult.error) throw classResult.error;
      if (studentResult.error) throw studentResult.error;

      return {
        classInfo: classResult.data as ClassInfo,
        students: [
          ...((studentResult.data ?? []) as Student[]),
        ].sort((a, b) =>
          a.full_name.localeCompare(b.full_name, "id"),
        ),
      };
    };

    return fetchStudents()
      .then((result) => {
        if (signal.aborted || !result) return;

        setClassInfo(result.classInfo);
        setStudents(result.students);
        setLoadError("");
      })
      .catch((err: unknown) => {
        if (signal.aborted) return;

        console.error("Load student directory:", err);

        setLoadError(
          getErrorMessage(err, "Gagal memuat daftar mahasiswa."),
        );
      })
      .finally(() => {
        if (!signal.aborted) {
          setLoading(false);
        }
      });
  }, []);

  function refreshStudents() {
    setLoading(true);
    setLoadError("");

    return loadStudents();
  }

  useEffect(() => {
    void loadStudents();

    return () => {
      controllerRef.current?.abort();
    };
  }, [loadStudents]);

  const ready = !loading && !loadError;

  const activeCount = students.filter(
    (student) => student.is_active,
  ).length;

  const inactiveCount = students.length - activeCount;

  const filteredStudents = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("id");

    return students.filter((student) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "active" && student.is_active) ||
        (filter === "inactive" && !student.is_active);

      const text = [
        student.full_name,
        student.student_number,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("id");

      return (
        matchesFilter &&
        (!keyword || text.includes(keyword))
      );
    });
  }, [students, search, filter]);

  async function toggleStudentStatus(student: Student) {
    if (!ready || mutationLock.current) return;

    const nextActive = !student.is_active;

    const confirmed = window.confirm(
      nextActive
        ? `Aktifkan kembali akun ${student.full_name}?`
        : `Nonaktifkan akun ${student.full_name}?\n\nMahasiswa tidak dapat mengakses dashboard sampai diaktifkan kembali. Riwayat tetap disimpan.`,
    );

    if (!confirmed) return;

    mutationLock.current = true;
    setBusyStudentId(student.id);
    setActionError("");
    setSuccess("");

    try {
      const supabase = createClient();

      const { error } = await supabase.rpc(
        "set_komting_student_active",
        {
          p_student_id: student.id,
          p_is_active: nextActive,
        },
      );

      if (error) throw error;

      setSuccess(
        nextActive
          ? `${student.full_name} berhasil diaktifkan kembali.`
          : `${student.full_name} berhasil dinonaktifkan.`,
      );

      await refreshStudents();
    } catch (err) {
      console.error("Update student status:", err);

      setActionError(
        getErrorMessage(
          err,
          "Gagal mengubah status mahasiswa.",
        ),
      );
    } finally {
      mutationLock.current = false;
      setBusyStudentId(null);
    }
  }

  function resetFilters() {
    setSearch("");
    setFilter("all");
  }

  const stats = [
    {
      label: "Total Mahasiswa",
      value: students.length,
      note: "Anggota kelas terdaftar",
      color: "bg-slate-100 text-primary",
    },
    {
      label: "Akun Aktif",
      value: activeCount,
      note: "Dapat mengakses dashboard",
      color: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "Akun Nonaktif",
      value: inactiveCount,
      note: "Akses dashboard dinonaktifkan",
      color: "bg-amber-50 text-amber-800",
    },
  ];

  return (
    <div className="space-y-5">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
            Workspace / Keanggotaan Kelas
          </p>

          <h1 className="mt-2 font-heading text-2xl font-bold text-primary sm:text-2xl">
            Daftar Mahasiswa
          </h1>

          <p className="mt-2 text-sm leading-7 text-muted">
            Kenali anggota kelas dan kelola status akses akun
            mahasiswa.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void refreshStudents()}
          disabled={loading || busyStudentId !== null}
          className="btn-outline w-fit shrink-0 rounded-md text-xs shadow-none"
        >
          {loading ? "Memuat..." : "↻ Muat Ulang"}
        </button>
      </section>

      <section className="flex flex-col justify-between gap-4 rounded-lg border border-slate-200/80 bg-white p-4 sm:flex-row sm:items-center sm:p-4">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-primary">
            <UsersIcon className="h-6 w-6" />
          </span>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
              Kelas yang Dikoordinasikan
            </p>

            <h2 className="mt-2 font-heading text-lg font-bold text-primary">
              {ready
                ? classInfo?.class_name || "Kelas belum tersedia"
                : "—"}
            </h2>

            <p className="mt-1 text-xs leading-6 text-muted">
              {ready
                ? [
                    classInfo?.class_code,
                    classInfo?.study_program,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "Memuat informasi kelas"}
            </p>
          </div>
        </div>

        {ready && (
          <span className="w-fit shrink-0 rounded-full border border-slate-200 px-3 py-1.5 text-[10px] font-semibold text-primary">
            {students.length} anggota kelas
          </span>
        )}
      </section>

      {loadError && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm leading-7 text-red-700"
        >
          {loadError}
        </p>
      )}

      {actionError && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm leading-7 text-red-700"
        >
          {actionError}
        </p>
      )}

      {success && (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm leading-7 text-emerald-700"
        >
          <p>{success}</p>

          {loadError && (
            <p className="mt-2">
              Perubahan berhasil, tetapi daftar terbaru belum dapat
              dimuat. Tekan Muat Ulang.
            </p>
          )}
        </div>
      )}

      <section
        aria-label="Ringkasan anggota kelas"
        className="grid gap-4 sm:grid-cols-3"
      >
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-slate-200/80 bg-white p-4 shadow-none shadow-slate-200/20 sm:p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xs font-semibold text-muted">
                {stat.label}
              </h2>

              <span className={`rounded-md p-2 ${stat.color}`}>
                <UsersIcon className="h-4 w-4" />
              </span>
            </div>

            <p className="mt-4 font-heading text-3xl font-bold text-primary">
              {ready ? stat.value : "—"}
            </p>

            <p className="mt-2 text-[10px] leading-6 text-muted">
              {stat.note}
            </p>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-none shadow-slate-200/20">
        <div className="space-y-5 border-b border-slate-100 p-4 sm:p-4">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="h-6 w-1 rounded-full bg-secondary"
                />

                <h2 className="font-heading text-lg font-bold text-primary">
                  Anggota Kelas
                </h2>
              </div>

              <p className="mt-2 text-xs leading-6 text-muted">
                Cari anggota berdasarkan nama atau Nomor Induk
                Mahasiswa.
              </p>
            </div>

            <div className="w-full lg:max-w-sm">
              <label
                htmlFor="student-search"
                className="sr-only"
              >
                Cari nama atau NIM
              </label>

              <div className="relative">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  aria-hidden="true"
                  className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-muted"
                >
                  <circle cx="10.5" cy="10.5" r="6.5" />
                  <path d="m16 16 5 5" />
                </svg>

                <input
                  id="student-search"
                  type="search"
                  value={search}
                  onChange={(event) =>
                    setSearch(event.target.value)
                  }
                  placeholder="Cari nama atau NIM..."
                  className="input-field min-h-11 rounded-md pl-11"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              role="group"
              aria-label="Filter status mahasiswa"
              className="flex w-fit flex-wrap gap-1 rounded-lg bg-slate-100 p-1"
            >
              {filterOptions.map((option) => {
                const count =
                  option.value === "all"
                    ? students.length
                    : option.value === "active"
                      ? activeCount
                      : inactiveCount;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFilter(option.value)}
                    aria-pressed={filter === option.value}
                    className={`inline-flex min-h-10 items-center gap-2 rounded-md px-3 py-2 text-[11px] font-semibold transition focus-visible:outline-2 focus-visible:outline-primary ${
                      filter === option.value
                        ? "bg-white text-primary shadow-none"
                        : "text-muted hover:bg-white/70 hover:text-primary"
                    }`}
                  >
                    {option.label}

                    {ready && (
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] text-muted">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {ready && (
              <p
                role="status"
                className="text-[11px] text-muted"
              >
                Menampilkan {filteredStudents.length} dari{" "}
                {students.length} mahasiswa
              </p>
            )}
          </div>
        </div>

        {loading ? (
          <div role="status" className="p-12 text-center">
            <div
              aria-hidden="true"
              className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-100 border-t-primary"
            />

            <p className="mt-4 text-sm text-muted">
              Memuat daftar mahasiswa...
            </p>
          </div>
        ) : loadError ? (
          <p className="p-10 text-center text-sm text-muted">
            Daftar belum dapat dimuat. Silakan tekan Muat Ulang.
          </p>
        ) : filteredStudents.length === 0 ? (
          <div className="p-12 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-slate-100 text-primary">
              <UsersIcon className="h-7 w-7" />
            </span>

            <h3 className="mt-4 text-sm font-bold text-primary">
              {students.length === 0
                ? "Belum ada mahasiswa terdaftar"
                : "Mahasiswa tidak ditemukan"}
            </h3>

            <p className="mt-2 text-xs leading-6 text-muted">
              {students.length === 0
                ? "Mahasiswa yang sudah menjadi anggota kelas akan muncul di sini."
                : "Coba ubah kata kunci atau filter status akun."}
            </p>

            {(search || filter !== "all") && (
              <button
                type="button"
                onClick={resetFilters}
                className="btn-outline mt-5 rounded-md text-xs"
              >
                Reset Filter
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse text-left">
              <caption className="sr-only">
                Daftar mahasiswa kelas dan status akses akun
              </caption>

              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-semibold uppercase tracking-wider text-muted">
                  <th scope="col" className="px-5 py-4">
                    No.
                  </th>

                  <th scope="col" className="px-5 py-4">
                    Mahasiswa
                  </th>

                  <th scope="col" className="px-5 py-4">
                    NIM
                  </th>

                  <th scope="col" className="px-5 py-4">
                    Terdaftar Sejak
                  </th>

                  <th scope="col" className="px-5 py-4">
                    Status
                  </th>

                  <th
                    scope="col"
                    className="px-5 py-4 text-right"
                  >
                    Aksi
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredStudents.map((student, index) => (
                  <tr
                    key={student.id}
                    className="transition hover:bg-slate-50/70"
                  >
                    <td className="px-5 py-4 text-xs text-muted">
                      {index + 1}
                    </td>

                    <th
                      scope="row"
                      className="px-5 py-4 text-left font-normal"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          aria-hidden="true"
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[11px] font-bold text-primary"
                        >
                          {getInitials(student.full_name)}
                        </span>

                        <span className="text-xs font-bold leading-6 text-primary">
                          {student.full_name || "Mahasiswa"}
                        </span>
                      </div>
                    </th>

                    <td className="px-5 py-4 text-xs font-semibold tabular-nums text-primary">
                      {student.student_number || "—"}
                    </td>

                    <td className="px-5 py-4 text-xs text-muted">
                      {dateLabel(student.created_at)}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-semibold ${
                          student.is_active
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`h-1.5 w-1.5 rounded-full ${
                            student.is_active
                              ? "bg-emerald-500"
                              : "bg-slate-400"
                          }`}
                        />

                        {student.is_active
                          ? "Aktif"
                          : "Nonaktif"}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          void toggleStudentStatus(student)
                        }
                        disabled={
                          busyStudentId !== null || loading
                        }
                        aria-label={`${
                          student.is_active
                            ? "Nonaktifkan"
                            : "Aktifkan kembali"
                        } akun ${student.full_name}`}
                        className={`inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-md border px-3 py-2 text-[11px] font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 ${
                          student.is_active
                            ? "border-amber-200 text-amber-800 hover:bg-amber-50"
                            : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                        }`}
                      >
                        {busyStudentId === student.id
                          ? "Memproses..."
                          : student.is_active
                            ? "Nonaktifkan"
                            : "Aktifkan Kembali"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex items-start gap-3 rounded-lg border border-dashed border-slate-300 bg-white p-4">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-primary"
        >
          i
        </span>

        <div>
          <h2 className="text-xs font-bold text-primary">
            Pengelolaan Status Akun
          </h2>

          <p className="mt-2 text-xs leading-7 text-muted">
            Menonaktifkan akun membatasi akses mahasiswa ke
            dashboard. Data dan riwayat tetap disimpan. Akun dapat
            diaktifkan kembali melalui tombol pada daftar.
          </p>
        </div>
      </section>
    </div>
  );
}