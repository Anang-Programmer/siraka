"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/errors";

type KomtingInfo = {
  full_name: string;
  email: string | null;
};

type ClassRow = {
  id: string;
  class_code: string;
  class_name: string;
  study_program: string;
  academic_year: string | null;
  semester: number | null;
  is_active: boolean;
  created_at: string;
};

type ClassItem = ClassRow & {
  komting: KomtingInfo | null;
};

type ClassForm = {
  class_code: string;
  class_name: string;
  study_program: string;
  academic_year: string;
  semester: string;
};

type StatusFilter = "all" | "active" | "inactive";

const initialForm: ClassForm = {
  class_code: "",
  class_name: "",
  study_program: "PTIK",
  academic_year: "",
  semester: "",
};

const fields: {
  key: Exclude<keyof ClassForm, "semester">;
  label: string;
  placeholder: string;
  required?: boolean;
}[] = [
  {
    key: "class_code",
    label: "Kode kelas *",
    placeholder: "Contoh: PTIK-A-2024",
    required: true,
  },
  {
    key: "class_name",
    label: "Nama kelas *",
    placeholder: "Contoh: PTIK A 2024",
    required: true,
  },
  {
    key: "study_program",
    label: "Program studi *",
    placeholder: "Contoh: PTIK",
    required: true,
  },
  {
    key: "academic_year",
    label: "Tahun akademik",
    placeholder: "Contoh: 2026/2027",
  },
];

function ClassIcon({
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
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </svg>
  );
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word.charAt(0))
      .join("")
      .toUpperCase() || "K"
  );
}

export default function ClassManagement() {
  const controllerRef = useRef<AbortController | null>(null);
  const saveLock = useRef(false);
  const formRef = useRef<HTMLElement>(null);

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [form, setForm] = useState<ClassForm>(initialForm);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("all");
  const [showForm, setShowForm] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");

  const loadClasses = useCallback(async () => {
    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;

    const { signal } = controller;

    setLoading(true);
    setLoadError("");

    try {
      const supabase = createClient();

      const { data, error: classError } = await supabase
        .from("classes")
        .select(
          "id, class_code, class_name, study_program, academic_year, semester, is_active, created_at",
        )
        .order("class_code", { ascending: true });

      if (signal.aborted) return;
      if (classError) throw classError;

      const rows = (data ?? []) as ClassRow[];
      const classIds = rows.map((item) => item.id);

      const komtingMap = new Map<string, KomtingInfo>();

      if (classIds.length > 0) {
        const { data: komtingData, error: komtingError } =
          await supabase
            .from("profiles")
            .select("class_id, full_name, email")
            .in("class_id", classIds)
            .eq("role", "komting")
            .eq("is_active", true);

        if (signal.aborted) return;
        if (komtingError) throw komtingError;

        for (const komting of komtingData ?? []) {
          if (komting.class_id) {
            komtingMap.set(komting.class_id, {
              full_name: komting.full_name,
              email: komting.email,
            });
          }
        }
      }

      if (signal.aborted) return;

      setClasses(
        rows.map((item) => ({
          ...item,
          komting: komtingMap.get(item.id) ?? null,
        })),
      );
    } catch (err) {
      if (signal.aborted) return;

      console.error("Load classes:", err);

      setLoadError(
        getErrorMessage(
          err,
          "Gagal mengambil data kelas dan Komting.",
        ),
      );
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadClasses();

    return () => {
      controllerRef.current?.abort();
    };
  }, [loadClasses]);

  useEffect(() => {
    if (!showForm) return;

    formRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [showForm]);

  const ready = !loading && !loadError;

  const activeCount = classes.filter(
    (item) => item.is_active,
  ).length;

  const withKomtingCount = classes.filter(
    (item) => item.komting !== null,
  ).length;

  const filteredClasses = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("id");

    return classes.filter((item) => {
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && item.is_active) ||
        (statusFilter === "inactive" && !item.is_active);

      const text = [
        item.class_code,
        item.class_name,
        item.study_program,
        item.academic_year,
        item.komting?.full_name,
        item.komting?.email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("id");

      return (
        matchesStatus &&
        (!keyword || text.includes(keyword))
      );
    });
  }, [classes, search, statusFilter]);

  function update<K extends keyof ClassForm>(
    key: K,
    value: ClassForm[K],
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function openForm() {
    if (saveLock.current) return;

    setForm({ ...initialForm });
    setFormError("");
    setSuccess("");
    setShowForm(true);
  }

  function closeForm() {
    if (saveLock.current) return;

    setShowForm(false);
    setForm({ ...initialForm });
    setFormError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saveLock.current) return;

    setFormError("");
    setSuccess("");

    const code = form.class_code.trim().toUpperCase();
    const name = form.class_name.trim();
    const studyProgram = form.study_program.trim();

    const semester = form.semester
      ? Number(form.semester)
      : null;

    if (!code || !name || !studyProgram) {
      setFormError(
        "Kode kelas, nama kelas, dan program studi wajib diisi.",
      );
      return;
    }

    if (
      semester !== null &&
      (!Number.isInteger(semester) ||
        semester < 1 ||
        semester > 14)
    ) {
      setFormError("Semester harus antara 1 sampai 14.");
      return;
    }

    saveLock.current = true;
    setSaving(true);

    try {
      const supabase = createClient();

      const { error } = await supabase
        .from("classes")
        .insert({
          class_code: code,
          class_name: name,
          study_program: studyProgram,
          academic_year: form.academic_year.trim() || null,
          semester,
          is_active: true,
        })
        .select("id")
        .single();

      if (error) throw error;

      setSuccess(`Kelas ${code} berhasil ditambahkan.`);
      setForm({ ...initialForm });
      setShowForm(false);

      await loadClasses();
    } catch (err) {
      console.error("Create class:", err);

      const code =
        typeof err === "object" &&
        err !== null &&
        "code" in err
          ? err.code
          : undefined;

      setFormError(
        code === "23505"
          ? "Kode kelas sudah terdaftar."
          : getErrorMessage(err, "Gagal menambahkan kelas."),
      );
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  function resetFilters() {
    setSearch("");
    setStatusFilter("all");
  }

  const stats = [
    {
      label: "Total Kelas",
      value: classes.length,
      note: "Seluruh kelas terdaftar",
      color: "bg-slate-100 text-primary",
    },
    {
      label: "Kelas Aktif",
      value: activeCount,
      note: "Kelas berstatus aktif",
      color: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "Memiliki Komting",
      value: withKomtingCount,
      note: "Kelas dengan Komting aktif",
      color: "bg-sky-50 text-sky-700",
    },
  ];

  return (
    <div className="space-y-7">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
            Workspace / Data Akademik
          </p>

          <h1 className="mt-2 font-heading text-2xl font-extrabold text-primary sm:text-3xl">
            Data Kelas
          </h1>

          <p className="mt-2 text-sm leading-7 text-muted">
            Tambahkan kelas dan pantau informasi Komting yang
            mengoordinasikannya.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadClasses()}
            disabled={loading || saving}
            className="btn-outline rounded-xl text-xs"
          >
            {loading ? "Memuat..." : "↻ Muat Ulang"}
          </button>

          <button
            type="button"
            onClick={openForm}
            disabled={saving}
            className="btn-primary rounded-xl text-xs"
          >
            + Tambah Kelas
          </button>
        </div>
      </section>

      {loadError && (
        <p
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-7 text-red-700"
        >
          {loadError}
        </p>
      )}

      {success && (
        <div
          role="status"
          className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-7 text-emerald-700"
        >
          <p>{success}</p>

          {loadError && (
            <p className="mt-2">
              Kelas berhasil disimpan, tetapi daftar terbaru belum
              dapat dimuat. Tekan Muat Ulang.
            </p>
          )}
        </div>
      )}

      <section
        aria-label="Ringkasan data kelas"
        className="grid gap-4 sm:grid-cols-3"
      >
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/20 sm:p-6"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xs font-semibold text-muted">
                {stat.label}
              </h2>

              <span className={`rounded-xl p-2 ${stat.color}`}>
                <ClassIcon className="h-4 w-4" />
              </span>
            </div>

            <p className="mt-4 font-heading text-4xl font-extrabold text-primary">
              {ready ? stat.value : "—"}
            </p>

            <p className="mt-2 text-[10px] leading-6 text-muted">
              {stat.note}
            </p>
          </div>
        ))}
      </section>

      {showForm && (
        <section
          ref={formRef}
          className="scroll-mt-28 overflow-hidden rounded-3xl border border-slate-200/80 bg-white"
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5 sm:p-6">
            <div>
              <h2 className="font-heading text-lg font-extrabold text-primary">
                Tambah Kelas Baru
              </h2>

              <p className="mt-2 text-xs leading-6 text-muted">
                Isi informasi kelas. Kolom bertanda * wajib diisi.
              </p>
            </div>

            <button
              type="button"
              onClick={closeForm}
              disabled={saving}
              aria-label="Tutup formulir tambah kelas"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-xl text-muted hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>

          <form
            onSubmit={handleSubmit}
            aria-busy={saving}
            className="p-5 sm:p-6"
          >
            {formError && (
              <p
                role="alert"
                className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-xs leading-7 text-red-700"
              >
                {formError}
              </p>
            )}

            <fieldset
              disabled={saving}
              className="min-w-0 space-y-5 disabled:opacity-60"
            >
              <legend className="sr-only">
                Informasi kelas baru
              </legend>

              <div className="grid gap-5 sm:grid-cols-2">
                {fields.map((field) => (
                  <div key={field.key} className="min-w-0">
                    <label
                      htmlFor={`class-${field.key}`}
                      className="mb-2.5 block text-xs font-semibold text-primary"
                    >
                      {field.label}
                    </label>

                    <input
                      id={`class-${field.key}`}
                      value={form[field.key]}
                      onChange={(event) =>
                        update(field.key, event.target.value)
                      }
                      placeholder={field.placeholder}
                      required={field.required}
                      className="input-field min-h-11 rounded-xl"
                    />
                  </div>
                ))}

                <div>
                  <label
                    htmlFor="class-semester"
                    className="mb-2.5 block text-xs font-semibold text-primary"
                  >
                    Semester
                  </label>

                  <select
                    id="class-semester"
                    value={form.semester}
                    onChange={(event) =>
                      update("semester", event.target.value)
                    }
                    className="input-field min-h-11 rounded-xl"
                  >
                    <option value="">
                      Belum ditentukan
                    </option>

                    {Array.from(
                      { length: 14 },
                      (_, index) => index + 1,
                    ).map((semester) => (
                      <option key={semester} value={semester}>
                        Semester {semester}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-5">
                <button
                  type="button"
                  onClick={closeForm}
                  className="btn-outline rounded-xl text-xs"
                >
                  Batal
                </button>

                <button
                  type="submit"
                  className="btn-primary rounded-xl text-xs"
                >
                  {saving ? "Menyimpan..." : "Simpan Kelas"}
                </button>
              </div>
            </fieldset>
          </form>
        </section>
      )}

      <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/20">
        <div className="space-y-5 border-b border-slate-100 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="h-6 w-1 rounded-full bg-secondary"
            />

            <h2 className="font-heading text-lg font-extrabold text-primary">
              Daftar Kelas
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
            <div>
              <label
                htmlFor="class-search"
                className="mb-2 block text-xs font-semibold text-primary"
              >
                Cari kelas atau Komting
              </label>

              <input
                id="class-search"
                type="search"
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Kode, nama kelas, prodi, atau Komting..."
                className="input-field min-h-11 rounded-xl"
              />
            </div>

            <div>
              <label
                htmlFor="class-status"
                className="mb-2 block text-xs font-semibold text-primary"
              >
                Status kelas
              </label>

              <select
                id="class-status"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(
                    event.target.value as StatusFilter,
                  )
                }
                className="input-field min-h-11 rounded-xl"
              >
                <option value="all">Semua Status</option>
                <option value="active">Aktif</option>
                <option value="inactive">Nonaktif</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <p
            role="status"
            className="p-12 text-center text-sm text-muted"
          >
            Memuat data kelas...
          </p>
        ) : loadError ? (
          <p className="p-10 text-center text-sm text-muted">
            Data belum dapat dimuat. Silakan tekan Muat Ulang.
          </p>
        ) : filteredClasses.length === 0 ? (
          <div className="p-12 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-primary">
              <ClassIcon className="h-7 w-7" />
            </span>

            <h3 className="mt-4 text-sm font-bold text-primary">
              {classes.length === 0
                ? "Belum ada kelas terdaftar"
                : "Kelas tidak ditemukan"}
            </h3>

            <p className="mt-2 text-xs leading-6 text-muted">
              Tambahkan kelas atau sesuaikan pencarian.
            </p>

            {(search || statusFilter !== "all") && (
              <button
                type="button"
                onClick={resetFilters}
                className="btn-outline mt-5 rounded-xl text-xs"
              >
                Reset Filter
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] border-collapse text-left">
              <caption className="sr-only">
                Daftar kelas beserta informasi Komting aktif
              </caption>

              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-semibold uppercase tracking-wider text-muted">
                  {[
                    "Kelas",
                    "Program Studi",
                    "Tahun Akademik",
                    "Semester",
                    "Status",
                    "Komting Aktif",
                  ].map((label) => (
                    <th
                      key={label}
                      scope="col"
                      className="px-5 py-4"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredClasses.map((item) => (
                  <tr
                    key={item.id}
                    className="transition hover:bg-slate-50/70"
                  >
                    <th
                      scope="row"
                      className="max-w-xs px-5 py-5 text-left font-normal"
                    >
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
                        {item.class_code}
                      </p>

                      <p className="mt-2 break-words text-sm font-bold text-primary">
                        {item.class_name}
                      </p>
                    </th>

                    <td className="px-5 py-5 text-xs leading-6 text-muted">
                      {item.study_program}
                    </td>

                    <td className="whitespace-nowrap px-5 py-5 text-xs text-muted">
                      {item.academic_year || "—"}
                    </td>

                    <td className="px-5 py-5 text-xs font-semibold text-primary">
                      {item.semester ?? "—"}
                    </td>

                    <td className="px-5 py-5">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-semibold ${
                          item.is_active
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`h-1.5 w-1.5 rounded-full ${
                            item.is_active
                              ? "bg-emerald-500"
                              : "bg-slate-400"
                          }`}
                        />
                        {item.is_active ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>

                    <td className="px-5 py-5">
                      {item.komting ? (
                        <div className="flex items-center gap-3">
                          <span
                            aria-hidden="true"
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[10px] font-bold text-primary"
                          >
                            {initials(item.komting.full_name)}
                          </span>

                          <div className="min-w-0">
                            <p className="text-xs font-bold leading-6 text-primary">
                              {item.komting.full_name}
                            </p>

                            <p className="mt-1 break-all text-[10px] text-muted">
                              {item.komting.email || "—"}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted">
                          Belum ada Komting aktif
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {ready && (
          <p
            role="status"
            className="border-t border-slate-100 px-5 py-4 text-[11px] text-muted"
          >
            Menampilkan {filteredClasses.length} dari{" "}
            {classes.length} kelas.
          </p>
        )}
      </section>
    </div>
  );
}