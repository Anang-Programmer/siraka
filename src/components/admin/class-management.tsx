
"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/errors";

type ClassItem = {
    id: string;
    class_code: string;
    komting: KomtingInfo | null;
    class_name: string;
    study_program: string;
    academic_year: string | null;
    semester: number | null;
    is_active: boolean;
    created_at: string;
};

type KomtingInfo = {
    full_name: string;
    email: string | null;
};

type ClassForm = {
    class_code: string;
    class_name: string;
    study_program: string;
    academic_year: string;
    semester: string;
};

const initialForm: ClassForm = {
    class_code: "",
    class_name: "",
    study_program: "PTIK",
    academic_year: "2026/2027",
    semester: "",
};

export default function ClassManagement() {
    const [classes, setClasses] = useState<ClassItem[]>([]);
    const [form, setForm] = useState<ClassForm>(initialForm);
    const [search, setSearch] = useState("");
    const [showForm, setShowForm] = useState(false);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");


    const loadClasses = useCallback((signal?: AbortSignal) => {
        const request = async () => {
            const supabase = createClient();

            // 1. Ambil seluruh kelas
            const { data: classData, error: classError } = await supabase
                .from("classes")
                .select("*")
                .order("class_code", { ascending: true });

            if (signal?.aborted) return;
            if (classError) throw classError;

            const classIds = (classData ?? []).map((item) => item.id);

            // Jika belum ada kelas
            if (classIds.length === 0) {
                setClasses([]);
                return;
            }

            // 2. Ambil Komting yang sudah disetujui dan aktif
            const { data: komtingData, error: komtingError } = await supabase
                .from("profiles")
                .select("class_id, full_name, email")
                .in("class_id", classIds)
                .eq("role", "komting")
                .eq("is_active", true);

            if (signal?.aborted) return;
            if (komtingError) throw komtingError;

            // 3. Buat mapping class_id -> Komting
            const komtingMap = new Map(
                (komtingData ?? []).map((item) => [
                    item.class_id,
                    {
                        full_name: item.full_name,
                        email: item.email,
                    },
                ])
            );

            // 4. Gabungkan data kelas dan Komting
            const formattedClasses = (classData ?? []).map((item) => ({
                ...item,
                komting: komtingMap.get(item.id) ?? null,
            }));

            setClasses(formattedClasses);
        };

        return request().catch((err: unknown) => {
            if (!signal?.aborted) {
                console.error("Load classes:", err);
                setError(getErrorMessage(err, "Gagal mengambil data kelas dan Komting."));
            }
        }).finally(() => {
            if (!signal?.aborted) setLoading(false);
        });
    }, []);


    useEffect(() => {
        const controller = new AbortController();
        void loadClasses(controller.signal);
        return () => controller.abort();
    }, [loadClasses]);

    async function refreshClasses() {
        setLoading(true);
        setError("");
        await loadClasses();
    }

    const filteredClasses = classes.filter((item) => {
        const keyword = search.toLowerCase().trim();

        return (
            item.class_code.toLowerCase().includes(keyword) ||
            item.class_name.toLowerCase().includes(keyword) ||
            item.study_program.toLowerCase().includes(keyword)
        );
    });

    function updateField<K extends keyof ClassForm>(
        key: K,
        value: ClassForm[K]
    ) {
        setForm((previous) => ({
            ...previous,
            [key]: value,
        }));
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        setError("");
        setSuccess("");

        const code = form.class_code.trim().toUpperCase();
        const name = form.class_name.trim();
        const semester = form.semester
            ? Number(form.semester)
            : null;

        if (!code || !name || !form.study_program.trim()) {
            setError("Kode kelas, nama kelas, dan program studi wajib diisi.");
            return;
        }

        if (
            semester !== null &&
            (!Number.isInteger(semester) || semester < 1 || semester > 14)
        ) {
            setError("Semester harus berada antara 1 sampai 14.");
            return;
        }

        setSaving(true);

        try {
            const supabase = createClient();

            const { error } = await supabase
                .from("classes")
                .insert({
                    class_code: code,
                    class_name: name,
                    study_program: form.study_program.trim(),
                    academic_year: form.academic_year.trim() || null,
                    semester,
                    is_active: true,
                });

            if (error) throw error;

            setSuccess(`Kelas ${code} berhasil ditambahkan.`);
            setForm(initialForm);
            setShowForm(false);

            await refreshClasses();
        } catch (err) {
            console.error("Create class:", err);

            const dbError = err as { code?: string };

            if (dbError?.code === "23505") {
                setError("Kode kelas sudah terdaftar.");
            } else {
                setError(
                    getErrorMessage(err, "Gagal menambahkan kelas.")
                );
            }
        } finally {
            setSaving(false);
        }
    }

    const activeCount = classes.filter((item) => item.is_active).length;

    return (
        <div className="space-y-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">
                        Manajemen Kelas
                    </h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Tambahkan dan lihat daftar kelas yang tersedia di SIRAKA.
                    </p>
                </div>

                <button
                    onClick={() => {
                        setShowForm(!showForm);
                        setError("");
                    }}
                    className="rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-700"
                >
                    + Tambah Kelas
                </button>
            </div>

            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            {success && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                    {success}
                </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border bg-white p-5">
                    <p className="text-sm text-slate-500">Total Kelas</p>
                    <p className="mt-2 text-3xl font-bold">
                        {loading ? "..." : classes.length}
                    </p>
                </div>

                <div className="rounded-xl border bg-white p-5">
                    <p className="text-sm text-slate-500">Kelas Aktif</p>
                    <p className="mt-2 text-3xl font-bold">
                        {loading ? "..." : activeCount}
                    </p>
                </div>
            </div>

            {showForm && (
                <form
                    onSubmit={handleSubmit}
                    className="space-y-5 rounded-xl border bg-white p-5"
                >
                    <div>
                        <h2 className="text-lg font-semibold">
                            Tambah Kelas Baru
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                            Masukkan informasi kelas yang akan dibuka untuk pendaftaran.
                        </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Kode Kelas *">
                            <input
                                required
                                value={form.class_code}
                                onChange={(e) => updateField("class_code", e.target.value)}
                                placeholder="Contoh: PTIK-A-2024"
                                className="input-field"
                            />
                        </Field>

                        <Field label="Nama Kelas *">
                            <input
                                required
                                value={form.class_name}
                                onChange={(e) => updateField("class_name", e.target.value)}
                                placeholder="Contoh: PTIK A"
                                className="input-field"
                            />
                        </Field>

                        <Field label="Program Studi *">
                            <input
                                required
                                value={form.study_program}
                                onChange={(e) => updateField("study_program", e.target.value)}
                                className="input-field"
                            />
                        </Field>

                        <Field label="Tahun Akademik">
                            <input
                                value={form.academic_year}
                                onChange={(e) => updateField("academic_year", e.target.value)}
                                placeholder="2026/2027"
                                className="input-field"
                            />
                        </Field>

                        <Field label="Semester">
                            <select
                                value={form.semester}
                                onChange={(e) => updateField("semester", e.target.value)}
                                className="input-field"
                            >
                                <option value="">Belum ditentukan</option>
                                {Array.from({ length: 14 }, (_, index) => index + 1).map(
                                    (semester) => (
                                        <option key={semester} value={semester}>
                                            Semester {semester}
                                        </option>
                                    )
                                )}
                            </select>
                        </Field>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button
                            type="submit"
                            disabled={saving}
                            className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                        >
                            {saving ? "Menyimpan..." : "Simpan Kelas"}
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                setShowForm(false);
                                setForm(initialForm);
                            }}
                            className="rounded-lg border px-5 py-3 text-sm hover:bg-slate-50"
                        >
                            Batal
                        </button>
                    </div>
                </form>
            )}

            <div className="rounded-xl border bg-white">
                <div className="flex flex-col justify-between gap-3 border-b p-5 sm:flex-row sm:items-center">
                    <div>
                        <h2 className="font-semibold">Daftar Kelas</h2>
                        <p className="mt-1 text-xs text-slate-500">
                            Kelas yang tersedia untuk pendaftaran pengguna.
                        </p>
                    </div>

                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Cari kelas..."
                        className="w-full rounded-lg border px-4 py-2 text-sm outline-none focus:border-slate-500 sm:max-w-xs"
                    />
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500">
                            <tr>
                                <th className="px-5 py-3">Kode Kelas</th>
                                <th className="px-5 py-3">Nama Kelas</th>
                                <th className="px-5 py-3">Program Studi</th>
                                <th className="px-5 py-3">Tahun Akademik</th>
                                <th className="px-5 py-3">Semester</th>
                                <th className="px-5 py-3">Status</th>
                                <th className="px-5 py-3">Komting</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y">
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="px-5 py-10 text-center text-slate-400">
                                        Memuat data kelas...
                                    </td>
                                </tr>
                            ) : filteredClasses.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-5 py-10 text-center text-slate-400">
                                        Belum ada kelas yang ditemukan.
                                    </td>
                                </tr>
                            ) : (
                                filteredClasses.map((item) => (
                                    <tr key={item.id} className="hover:bg-slate-50">
                                        <td className="px-5 py-4 font-semibold">
                                            {item.class_code}
                                        </td>
                                        <td className="px-5 py-4">
                                            {item.class_name}
                                        </td>
                                        <td className="px-5 py-4 text-slate-600">
                                            {item.study_program}
                                        </td>
                                        <td className="px-5 py-4 text-slate-600">
                                            {item.academic_year ?? "-"}
                                        </td>
                                        <td className="px-5 py-4 text-slate-600">
                                            {item.semester ?? "-"}
                                        </td>
                                        <td className="px-5 py-4">
                                            <span
                                                className={`rounded-full px-3 py-1 text-xs font-medium ${item.is_active
                                                    ? "bg-green-100 text-green-700"
                                                    : "bg-slate-100 text-slate-600"
                                                    }`}
                                            >
                                                {item.is_active ? "Aktif" : "Nonaktif"}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4">
                                            {item.komting ? (
                                                <div>
                                                    <p className="font-medium text-slate-800">
                                                        {item.komting.full_name}
                                                    </p>
                                                    <p className="mt-1 text-xs text-slate-500">
                                                        {item.komting.email}
                                                    </p>
                                                </div>
                                            ) : (
                                                <span className="text-sm text-slate-400">
                                                    Belum ada Komting
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="border-t px-5 py-3 text-xs text-slate-400">
                    Menampilkan {filteredClasses.length} dari {classes.length} kelas.
                </div>
            </div>
        </div>
    );
}

function Field({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">
                {label}
            </span>
            {children}
        </label>
    );
}
