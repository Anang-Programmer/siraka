
"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/errors";

type Room = {
    id: string;
    room_code: string;
    room_name: string;
    room_type: "kelas" | "laboratorium";
    building: string | null;
    floor: string | null;
    location: string | null;
    capacity: number;
    facilities: string[];
    description: string | null;
    is_active: boolean;
};

type RoomForm = {
    room_code: string;
    room_name: string;
    room_type: "kelas" | "laboratorium";
    building: string;
    floor: string;
    location: string;
    capacity: string;
    facilities: string;
    description: string;
};

const initialForm: RoomForm = {
    room_code: "",
    room_name: "",
    room_type: "kelas",
    building: "",
    floor: "",
    location: "",
    capacity: "",
    facilities: "",
    description: "",
};

export default function RoomManagement() {
    const [rooms, setRooms] = useState<Room[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    const [search, setSearch] = useState("");
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    const [form, setForm] = useState<RoomForm>(initialForm);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const loadRooms = useCallback((signal?: AbortSignal) => {
        const request = async () => {
            const supabase = createClient();

            const { data, error } = await supabase
                .from("rooms")
                .select("*")
                .order("room_code", { ascending: true });

            if (signal?.aborted) return;
            if (error) throw error;

            setRooms((data ?? []) as Room[]);
        };

        return request().catch((err: unknown) => {
            if (!signal?.aborted) {
                console.error("Load rooms:", err);
                setError(getErrorMessage(err, "Gagal mengambil data ruangan dari database."));
            }
        }).finally(() => {
            if (!signal?.aborted) setLoading(false);
        });
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        void loadRooms(controller.signal);
        return () => controller.abort();
    }, [loadRooms]);

    async function refreshRooms() {
        setLoading(true);
        setError("");
        await loadRooms();
    }

    const filteredRooms = useMemo(() => {
        const keyword = search.trim().toLowerCase();

        if (!keyword) return rooms;

        return rooms.filter((room) =>
            [
                room.room_code,
                room.room_name,
                room.room_type,
                room.building ?? "",
                room.location ?? "",
            ].some((value) => value.toLowerCase().includes(keyword))
        );
    }, [rooms, search]);

    const activeCount = rooms.filter((room) => room.is_active).length;
    const inactiveCount = rooms.length - activeCount;

    function updateField<K extends keyof RoomForm>(
        key: K,
        value: RoomForm[K]
    ) {
        setForm((previous) => ({
            ...previous,
            [key]: value,
        }));
    }

    function openCreateForm() {
        setEditingId(null);
        setForm(initialForm);
        setError("");
        setSuccess("");
        setShowForm(true);
    }

    function openEditForm(room: Room) {
        setEditingId(room.id);

        setForm({
            room_code: room.room_code,
            room_name: room.room_name,
            room_type: room.room_type,
            building: room.building ?? "",
            floor: room.floor ?? "",
            location: room.location ?? "",
            capacity: String(room.capacity),
            facilities: (room.facilities ?? []).join(", "),
            description: room.description ?? "",
        });

        setError("");
        setSuccess("");
        setShowForm(true);
    }

    function closeForm() {
        setShowForm(false);
        setEditingId(null);
        setForm(initialForm);
        setError("");
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        setError("");
        setSuccess("");

        const roomCode = form.room_code.trim().toUpperCase();
        const roomName = form.room_name.trim();
        const capacity = Number(form.capacity);

        if (!roomCode || !roomName) {
            setError("Kode dan nama ruangan wajib diisi.");
            return;
        }

        if (!Number.isInteger(capacity) || capacity < 1) {
            setError("Kapasitas harus berupa bilangan bulat minimal 1.");
            return;
        }

        const payload = {
            room_code: roomCode,
            room_name: roomName,
            room_type: form.room_type,
            building: form.building.trim() || null,
            floor: form.floor.trim() || null,
            location: form.location.trim() || null,
            capacity,
            facilities: form.facilities
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
            description: form.description.trim() || null,
        };

        setSaving(true);

        try {
            const supabase = createClient();

            if (editingId) {
                const { error } = await supabase
                    .from("rooms")
                    .update(payload)
                    .eq("id", editingId);

                if (error) throw error;

                setSuccess("Data ruangan berhasil diperbarui.");
            } else {
                const { error } = await supabase
                    .from("rooms")
                    .insert(payload);

                if (error) throw error;

                setSuccess("Ruangan berhasil ditambahkan.");
            }

            setShowForm(false);
            setEditingId(null);
            setForm(initialForm);

            await refreshRooms();
        } catch (err: unknown) {
            console.error("Save room:", err);

            const message = getErrorMessage(err, "Gagal menyimpan data ruangan.");

            if (message.includes("duplicate key") ||
                (err as { code?: string })?.code === "23505") {
                setError("Kode ruangan sudah digunakan.");
            } else {
                setError(message);
            }
        } finally {
            setSaving(false);
        }
    }


    async function deleteRoom(room: Room) {
        const confirmed = window.confirm(
            `Hapus permanen ruangan ${room.room_code} - ${room.room_name}?\n\nData yang sudah dihapus tidak dapat dikembalikan.`
        );

        if (!confirmed) return;

        setBusyId(room.id);
        setError("");
        setSuccess("");

        try {
            const supabase = createClient();

            const { error } = await supabase
                .from("rooms")
                .delete()
                .eq("id", room.id);

            if (error) {
                if (error.code === "23503") {
                    throw new Error(
                        "Ruangan tidak dapat dihapus karena sudah memiliki jadwal atau riwayat booking. Silakan nonaktifkan ruangan."
                    );
                }

                throw error;
            }

            setSuccess(`Ruangan ${room.room_code} berhasil dihapus.`);
            await refreshRooms();
        } catch (err) {
            console.error("Delete room:", err);

            setError(
                getErrorMessage(err, "Gagal menghapus ruangan.")
            );
        } finally {
            setBusyId(null);
        }
    }


    async function toggleRoomStatus(room: Room) {
        const nextStatus = !room.is_active;

        const confirmed = window.confirm(
            nextStatus
                ? `Aktifkan kembali ruangan ${room.room_code}?`
                : `Nonaktifkan ruangan ${room.room_code}?`
        );

        if (!confirmed) return;

        setBusyId(room.id);
        setError("");
        setSuccess("");

        try {
            const supabase = createClient();

            const { error } = await supabase
                .from("rooms")
                .update({ is_active: nextStatus })
                .eq("id", room.id);

            if (error) throw error;

            setSuccess(
                nextStatus
                    ? "Ruangan berhasil diaktifkan."
                    : "Ruangan berhasil dinonaktifkan."
            );

            await refreshRooms();
        } catch (err) {
            console.error("Update room status:", err);
            setError(getErrorMessage(err, "Gagal mengubah status ruangan."));
        } finally {
            setBusyId(null);
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">
                        Manajemen Ruangan
                    </h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Kelola data ruang kelas dan laboratorium.
                    </p>
                </div>

                <button
                    onClick={openCreateForm}
                    className="rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-700"
                >
                    + Tambah Ruangan
                </button>
            </div>

            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            {success && (
                <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                    {success}
                </div>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
                {[
                    { label: "Total Ruangan", value: rooms.length },
                    { label: "Ruangan Aktif", value: activeCount },
                    { label: "Ruangan Nonaktif", value: inactiveCount },
                ].map((item) => (
                    <div key={item.label} className="rounded-xl border bg-white p-5">
                        <p className="text-sm text-slate-500">{item.label}</p>
                        <p className="mt-2 text-3xl font-bold text-slate-900">
                            {loading ? "..." : item.value}
                        </p>
                    </div>
                ))}
            </div>

            {showForm && (
                <form
                    onSubmit={handleSubmit}
                    className="space-y-5 rounded-xl border bg-white p-5"
                >
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">
                            {editingId ? "Edit Ruangan" : "Tambah Ruangan"}
                        </h2>

                        <button
                            type="button"
                            onClick={closeForm}
                            className="text-sm text-slate-500 hover:text-slate-900"
                        >
                            Tutup
                        </button>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Kode Ruangan *">
                            <input
                                required
                                value={form.room_code}
                                onChange={(e) => updateField("room_code", e.target.value)}
                                placeholder="Contoh: LAB-01"
                                className="input-field"
                            />
                        </Field>

                        <Field label="Nama Ruangan *">
                            <input
                                required
                                value={form.room_name}
                                onChange={(e) => updateField("room_name", e.target.value)}
                                placeholder="Contoh: Laboratorium Komputer 1"
                                className="input-field"
                            />
                        </Field>

                        <Field label="Jenis Ruangan *">
                            <select
                                value={form.room_type}
                                onChange={(e) =>
                                    updateField(
                                        "room_type",
                                        e.target.value as RoomForm["room_type"]
                                    )
                                }
                                className="input-field"
                            >
                                <option value="kelas">Ruang Kelas</option>
                                <option value="laboratorium">Laboratorium</option>
                            </select>
                        </Field>

                        <Field label="Kapasitas *">
                            <input
                                required
                                type="number"
                                min="1"
                                step="1"
                                value={form.capacity}
                                onChange={(e) => updateField("capacity", e.target.value)}
                                placeholder="Contoh: 40"
                                className="input-field"
                            />
                        </Field>

                        <Field label="Gedung">
                            <input
                                value={form.building}
                                onChange={(e) => updateField("building", e.target.value)}
                                placeholder="Contoh: Gedung Teknik"
                                className="input-field"
                            />
                        </Field>

                        <Field label="Lantai">
                            <input
                                value={form.floor}
                                onChange={(e) => updateField("floor", e.target.value)}
                                placeholder="Contoh: 2"
                                className="input-field"
                            />
                        </Field>

                        <Field label="Lokasi">
                            <input
                                value={form.location}
                                onChange={(e) => updateField("location", e.target.value)}
                                placeholder="Contoh: Fakultas Teknik"
                                className="input-field"
                            />
                        </Field>

                        <Field label="Fasilitas">
                            <input
                                value={form.facilities}
                                onChange={(e) => updateField("facilities", e.target.value)}
                                placeholder="AC, Proyektor, Wi-Fi"
                                className="input-field"
                            />
                            <p className="mt-1 text-xs text-slate-400">
                                Pisahkan fasilitas menggunakan koma.
                            </p>
                        </Field>

                        <div className="sm:col-span-2">
                            <Field label="Deskripsi">
                                <textarea
                                    rows={3}
                                    value={form.description}
                                    onChange={(e) => updateField("description", e.target.value)}
                                    placeholder="Informasi tambahan mengenai ruangan..."
                                    className="input-field"
                                />
                            </Field>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button
                            type="submit"
                            disabled={saving}
                            className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                        >
                            {saving
                                ? "Menyimpan..."
                                : editingId
                                    ? "Simpan Perubahan"
                                    : "Simpan Ruangan"}
                        </button>

                        <button
                            type="button"
                            onClick={closeForm}
                            className="rounded-lg border px-5 py-3 text-sm font-medium hover:bg-slate-50"
                        >
                            Batal
                        </button>
                    </div>
                </form>
            )}

            <div className="rounded-xl border bg-white">
                <div className="flex flex-col justify-between gap-3 border-b p-5 sm:flex-row sm:items-center">
                    <div>
                        <h2 className="font-semibold text-slate-900">
                            Daftar Ruangan
                        </h2>
                        <p className="mt-1 text-xs text-slate-500">
                            Data ruangan dari database SIRAKA.
                        </p>
                    </div>

                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Cari ruangan..."
                        className="w-full rounded-lg border px-4 py-2 text-sm outline-none focus:border-slate-500 sm:max-w-xs"
                    />
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500">
                            <tr>
                                <th className="px-5 py-3 font-medium">Ruangan</th>
                                <th className="px-5 py-3 font-medium">Jenis</th>
                                <th className="px-5 py-3 font-medium">Kapasitas</th>
                                <th className="px-5 py-3 font-medium">Fasilitas</th>
                                <th className="px-5 py-3 font-medium">Status</th>
                                <th className="px-5 py-3 text-right font-medium">Aksi</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-5 py-10 text-center text-slate-400">
                                        Memuat data ruangan...
                                    </td>
                                </tr>
                            ) : filteredRooms.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-5 py-10 text-center text-slate-400">
                                        {search
                                            ? "Ruangan tidak ditemukan."
                                            : "Belum ada data ruangan."}
                                    </td>
                                </tr>
                            ) : (
                                filteredRooms.map((room) => (
                                    <tr key={room.id} className="hover:bg-slate-50">
                                        <td className="px-5 py-4">
                                            <p className="font-semibold text-slate-800">
                                                {room.room_code}
                                            </p>
                                            <p className="mt-1 text-slate-500">
                                                {room.room_name}
                                            </p>
                                            {room.building && (
                                                <p className="mt-1 text-xs text-slate-400">
                                                    {room.building}
                                                    {room.floor ? ` · Lantai ${room.floor}` : ""}
                                                </p>
                                            )}
                                        </td>

                                        <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                                            {room.room_type === "kelas" ? "Ruang Kelas" : "Laboratorium"}
                                        </td>

                                        <td className="px-5 py-4 text-slate-600">
                                            {room.capacity} orang
                                        </td>

                                        <td className="px-5 py-4 text-slate-600">
                                            <div className="max-w-48">
                                                {room.facilities?.length
                                                    ? room.facilities.join(", ")
                                                    : "-"}
                                            </div>
                                        </td>

                                        <td className="px-5 py-4">
                                            <span
                                                className={`rounded-full px-3 py-1 text-xs font-medium ${room.is_active
                                                    ? "bg-green-100 text-green-700"
                                                    : "bg-slate-100 text-slate-600"
                                                    }`}
                                            >
                                                {room.is_active ? "Aktif" : "Nonaktif"}
                                            </span>
                                        </td>


                                        <td className="whitespace-nowrap px-5 py-4 text-right">
                                            <div className="flex justify-end gap-3">
                                                <button
                                                    disabled={busyId === room.id}
                                                    onClick={() => openEditForm(room)}
                                                    className="font-medium text-blue-700 hover:underline disabled:opacity-50"
                                                >
                                                    Edit
                                                </button>

                                                <button
                                                    disabled={busyId === room.id}
                                                    onClick={() => toggleRoomStatus(room)}
                                                    className={`font-medium hover:underline disabled:opacity-50 ${room.is_active ? "text-slate-600" : "text-green-700"
                                                        }`}
                                                >
                                                    {busyId === room.id
                                                        ? "Memproses..."
                                                        : room.is_active
                                                            ? "Nonaktifkan"
                                                            : "Aktifkan"}
                                                </button>

                                                <button
                                                    disabled={busyId === room.id}
                                                    onClick={() => deleteRoom(room)}
                                                    className="font-medium text-red-600 hover:underline disabled:opacity-50"
                                                >
                                                    {busyId === room.id ? "Memproses..." : "Hapus"}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="border-t px-5 py-3 text-xs text-slate-400">
                    Menampilkan {filteredRooms.length} dari {rooms.length} ruangan.
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
