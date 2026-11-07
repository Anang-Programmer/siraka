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
  room_type: Room["room_type"];
  building: string;
  floor: string;
  location: string;
  capacity: string;
  facilities: string;
  description: string;
};

type StatusFilter = "all" | "active" | "inactive";
type TypeFilter = "all" | Room["room_type"];

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

const textFields: {
  key:
    | "room_code"
    | "room_name"
    | "capacity"
    | "building"
    | "floor"
    | "location"
    | "facilities";
  label: string;
  placeholder: string;
  required?: boolean;
  type?: "text" | "number";
}[] = [
  {
    key: "room_code",
    label: "Kode ruangan *",
    placeholder: "Contoh: LAB-01",
    required: true,
  },
  {
    key: "room_name",
    label: "Nama ruangan *",
    placeholder: "Contoh: Laboratorium Komputer",
    required: true,
  },
  {
    key: "capacity",
    label: "Kapasitas *",
    placeholder: "Contoh: 40",
    required: true,
    type: "number",
  },
  {
    key: "building",
    label: "Gedung",
    placeholder: "Contoh: Gedung Teknik",
  },
  {
    key: "floor",
    label: "Lantai",
    placeholder: "Contoh: 2",
  },
  {
    key: "location",
    label: "Lokasi",
    placeholder: "Contoh: Fakultas Teknik",
  },
  {
    key: "facilities",
    label: "Fasilitas",
    placeholder: "AC, Proyektor, Wi-Fi",
  },
];

function BuildingIcon({
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
      <path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16" />
      <path d="M15 9h4a1 1 0 0 1 1 1v11M2 21h20" />
      <path d="M8 8h3M8 12h3M8 16h3" />
    </svg>
  );
}

export default function RoomManagement() {
  const controllerRef = useRef<AbortController | null>(null);
  const mutationLock = useRef(false);
  const formSectionRef = useRef<HTMLElement>(null);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] =
    useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("all");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RoomForm>(initialForm);

  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");

  const busy = saving || busyId !== null;
  const ready = !loading && !loadError;

  const loadRooms = useCallback(async () => {
    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;

    const { signal } = controller;

    setLoading(true);
    setLoadError("");

    try {
      const supabase = createClient();

      const { data, error } = await supabase
        .from("rooms")
        .select(
          "id, room_code, room_name, room_type, building, floor, location, capacity, facilities, description, is_active",
        )
        .order("room_code", { ascending: true });

      if (signal.aborted) return;
      if (error) throw error;

      setRooms(
        ((data ?? []) as Room[]).map((room) => ({
          ...room,
          facilities: Array.isArray(room.facilities)
            ? room.facilities
            : [],
        })),
      );
    } catch (err) {
      if (signal.aborted) return;

      console.error("Load Admin rooms:", err);

      setLoadError(
        getErrorMessage(err, "Gagal mengambil data ruangan."),
      );
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRooms();

    return () => {
      controllerRef.current?.abort();
    };
  }, [loadRooms]);

  useEffect(() => {
    if (!showForm) return;

    formSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [showForm, editingId]);

  function update<K extends keyof RoomForm>(
    key: K,
    value: RoomForm[K],
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function openCreateForm() {
    if (mutationLock.current) return;

    setEditingId(null);
    setForm({ ...initialForm });
    setActionError("");
    setSuccess("");
    setShowForm(true);
  }

  function openEditForm(room: Room) {
    if (mutationLock.current) return;

    setEditingId(room.id);
    setForm({
      room_code: room.room_code,
      room_name: room.room_name,
      room_type: room.room_type,
      building: room.building ?? "",
      floor: room.floor ?? "",
      location: room.location ?? "",
      capacity: String(room.capacity),
      facilities: room.facilities.join(", "),
      description: room.description ?? "",
    });

    setActionError("");
    setSuccess("");
    setShowForm(true);
  }

  function closeForm() {
    if (mutationLock.current) return;

    setShowForm(false);
    setEditingId(null);
    setForm({ ...initialForm });
    setActionError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (mutationLock.current) return;

    setActionError("");
    setSuccess("");

    const roomCode = form.room_code.trim().toUpperCase();
    const roomName = form.room_name.trim();
    const capacity = Number(form.capacity);

    if (!roomCode || !roomName) {
      setActionError("Kode dan nama ruangan wajib diisi.");
      return;
    }

    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      setActionError(
        "Kapasitas harus berupa bilangan bulat minimal 1.",
      );
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
      facilities: [
        ...new Set(
          form.facilities
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      ],
      description: form.description.trim() || null,
    };

    mutationLock.current = true;
    setSaving(true);

    try {
      const supabase = createClient();

      if (editingId) {
        const { error } = await supabase
          .from("rooms")
          .update(payload)
          .eq("id", editingId)
          .select("id")
          .single();

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("rooms")
          .insert(payload)
          .select("id")
          .single();

        if (error) throw error;
      }

      setSuccess(
        editingId
          ? "Data ruangan berhasil diperbarui."
          : "Ruangan berhasil ditambahkan.",
      );

      setShowForm(false);
      setEditingId(null);
      setForm({ ...initialForm });

      await loadRooms();
    } catch (err) {
      console.error("Save room:", err);

      const message = getErrorMessage(
        err,
        "Gagal menyimpan data ruangan.",
      );

      const code =
        typeof err === "object" &&
        err !== null &&
        "code" in err
          ? err.code
          : undefined;

      setActionError(
        code === "23505" || message.includes("duplicate key")
          ? "Kode ruangan sudah digunakan."
          : message,
      );
    } finally {
      mutationLock.current = false;
      setSaving(false);
    }
  }

  async function toggleStatus(room: Room) {
    if (!ready || mutationLock.current) return;

    const nextActive = !room.is_active;

    if (
      !window.confirm(
        nextActive
          ? `Aktifkan kembali ruangan ${room.room_code}?`
          : `Nonaktifkan ruangan ${room.room_code}?`,
      )
    ) {
      return;
    }

    mutationLock.current = true;
    setBusyId(room.id);
    setActionError("");
    setSuccess("");

    try {
      const supabase = createClient();

      const { error } = await supabase
        .from("rooms")
        .update({ is_active: nextActive })
        .eq("id", room.id)
        .select("id")
        .single();

      if (error) throw error;

      setSuccess(
        nextActive
          ? `Ruangan ${room.room_code} berhasil diaktifkan.`
          : `Ruangan ${room.room_code} berhasil dinonaktifkan.`,
      );

      await loadRooms();
    } catch (err) {
      console.error("Update room status:", err);

      setActionError(
        getErrorMessage(err, "Gagal mengubah status ruangan."),
      );
    } finally {
      mutationLock.current = false;
      setBusyId(null);
    }
  }

  async function deleteRoom(room: Room) {
    if (!ready || mutationLock.current) return;

    const confirmed = window.confirm(
      `Hapus permanen ruangan ${room.room_code} - ${room.room_name}?\n\nData yang sudah dihapus tidak dapat dikembalikan.`,
    );

    if (!confirmed) return;

    mutationLock.current = true;
    setBusyId(room.id);
    setActionError("");
    setSuccess("");

    try {
      const supabase = createClient();

      const { error } = await supabase
        .from("rooms")
        .delete()
        .eq("id", room.id)
        .select("id")
        .single();

      if (error) {
        if (error.code === "23503") {
          throw new Error(
            "Ruangan memiliki jadwal atau riwayat booking dan tidak dapat dihapus. Gunakan Nonaktifkan.",
          );
        }

        throw error;
      }

      if (editingId === room.id) {
        setShowForm(false);
        setEditingId(null);
        setForm({ ...initialForm });
      }

      setSuccess(
        `Ruangan ${room.room_code} berhasil dihapus.`,
      );

      await loadRooms();
    } catch (err) {
      console.error("Delete room:", err);

      setActionError(
        getErrorMessage(err, "Gagal menghapus ruangan."),
      );
    } finally {
      mutationLock.current = false;
      setBusyId(null);
    }
  }

  const activeCount = rooms.filter(
    (room) => room.is_active,
  ).length;

  const filteredRooms = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("id");

    return rooms.filter((room) => {
      const matchesType =
        typeFilter === "all" ||
        room.room_type === typeFilter;

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && room.is_active) ||
        (statusFilter === "inactive" && !room.is_active);

      const text = [
        room.room_code,
        room.room_name,
        room.building,
        room.floor,
        room.location,
        ...room.facilities,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("id");

      return (
        matchesType &&
        matchesStatus &&
        (!keyword || text.includes(keyword))
      );
    });
  }, [rooms, search, typeFilter, statusFilter]);

  function resetFilters() {
    setSearch("");
    setTypeFilter("all");
    setStatusFilter("all");
  }

  return (
    <div className="space-y-7">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
            Workspace / Fasilitas Kampus
          </p>

          <h1 className="mt-2 font-heading text-2xl font-extrabold text-primary sm:text-3xl">
            Data Ruangan
          </h1>

          <p className="mt-2 text-sm leading-7 text-muted">
            Kelola ruang kelas, laboratorium, dan fasilitas kampus.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadRooms()}
            disabled={loading || busy}
            className="btn-outline rounded-xl text-xs"
          >
            {loading ? "Memuat..." : "↻ Muat Ulang"}
          </button>

          <button
            type="button"
            onClick={openCreateForm}
            disabled={busy}
            className="btn-primary rounded-xl text-xs"
          >
            + Tambah Ruangan
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

      {actionError && (
        <p
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-7 text-red-700"
        >
          {actionError}
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
              Perubahan berhasil, tetapi daftar terbaru belum dapat
              dimuat. Tekan Muat Ulang.
            </p>
          )}
        </div>
      )}

      <section
        aria-label="Ringkasan data ruangan"
        className="grid gap-4 sm:grid-cols-3"
      >
        {[
          {
            label: "Total Ruangan",
            value: rooms.length,
            color: "bg-slate-100 text-primary",
          },
          {
            label: "Ruangan Aktif",
            value: activeCount,
            color: "bg-emerald-50 text-emerald-700",
          },
          {
            label: "Ruangan Nonaktif",
            value: rooms.length - activeCount,
            color: "bg-amber-50 text-amber-800",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/20 sm:p-6"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xs font-semibold text-muted">
                {stat.label}
              </h2>

              <span className={`rounded-xl p-2 ${stat.color}`}>
                <BuildingIcon className="h-4 w-4" />
              </span>
            </div>

            <p className="mt-4 font-heading text-4xl font-extrabold text-primary">
              {ready ? stat.value : "—"}
            </p>
          </div>
        ))}
      </section>

      {showForm && (
        <section
          ref={formSectionRef}
          className="scroll-mt-28 overflow-hidden rounded-3xl border border-slate-200/80 bg-white"
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5 sm:p-6">
            <div>
              <h2 className="font-heading text-lg font-extrabold text-primary">
                {editingId ? "Edit Ruangan" : "Tambah Ruangan"}
              </h2>

              <p className="mt-2 text-xs leading-6 text-muted">
                Lengkapi informasi ruangan. Kolom bertanda *
                wajib diisi.
              </p>
            </div>

            <button
              type="button"
              onClick={closeForm}
              disabled={busy}
              aria-label="Tutup formulir ruangan"
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
            <fieldset
              disabled={busy}
              className="min-w-0 space-y-5 disabled:opacity-60"
            >
              <legend className="sr-only">
                Informasi ruangan
              </legend>

              <div className="grid gap-5 sm:grid-cols-2">
                {textFields.map((field) => (
                  <div key={field.key} className="min-w-0">
                    <label
                      htmlFor={`room-${field.key}`}
                      className="mb-2.5 block text-xs font-semibold text-primary"
                    >
                      {field.label}
                    </label>

                    <input
                      id={`room-${field.key}`}
                      type={field.type ?? "text"}
                      value={form[field.key]}
                      onChange={(event) =>
                        update(field.key, event.target.value)
                      }
                      placeholder={field.placeholder}
                      required={field.required}
                      min={
                        field.type === "number" ? 1 : undefined
                      }
                      step={
                        field.type === "number" ? 1 : undefined
                      }
                      className="input-field min-h-11 rounded-xl"
                    />

                    {field.key === "facilities" && (
                      <p className="mt-2 text-[10px] leading-6 text-muted">
                        Pisahkan setiap fasilitas dengan koma.
                      </p>
                    )}
                  </div>
                ))}

                <div>
                  <label
                    htmlFor="room-type"
                    className="mb-2.5 block text-xs font-semibold text-primary"
                  >
                    Jenis ruangan *
                  </label>

                  <select
                    id="room-type"
                    value={form.room_type}
                    onChange={(event) =>
                      update(
                        "room_type",
                        event.target.value as Room["room_type"],
                      )
                    }
                    className="input-field min-h-11 rounded-xl"
                  >
                    <option value="kelas">Ruang Kelas</option>
                    <option value="laboratorium">
                      Laboratorium
                    </option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="room-description"
                    className="mb-2.5 block text-xs font-semibold text-primary"
                  >
                    Deskripsi
                  </label>

                  <textarea
                    id="room-description"
                    value={form.description}
                    onChange={(event) =>
                      update("description", event.target.value)
                    }
                    placeholder="Informasi tambahan mengenai ruangan..."
                    rows={3}
                    className="input-field resize-y rounded-xl"
                  />
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
                  {saving
                    ? "Menyimpan..."
                    : editingId
                      ? "Simpan Perubahan"
                      : "Simpan Ruangan"}
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
              Daftar Ruangan
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px_160px]">
            <div>
              <label
                htmlFor="admin-room-search"
                className="mb-2 block text-xs font-semibold text-primary"
              >
                Cari ruangan
              </label>

              <input
                id="admin-room-search"
                type="search"
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Kode, nama, gedung, atau fasilitas..."
                className="input-field min-h-11 rounded-xl"
              />
            </div>

            <div>
              <label
                htmlFor="admin-room-type"
                className="mb-2 block text-xs font-semibold text-primary"
              >
                Jenis
              </label>

              <select
                id="admin-room-type"
                value={typeFilter}
                onChange={(event) =>
                  setTypeFilter(
                    event.target.value as TypeFilter,
                  )
                }
                className="input-field min-h-11 rounded-xl"
              >
                <option value="all">Semua Jenis</option>
                <option value="kelas">Ruang Kelas</option>
                <option value="laboratorium">
                  Laboratorium
                </option>
              </select>
            </div>

            <div>
              <label
                htmlFor="admin-room-status"
                className="mb-2 block text-xs font-semibold text-primary"
              >
                Status
              </label>

              <select
                id="admin-room-status"
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
            Memuat data ruangan...
          </p>
        ) : loadError ? (
          <p className="p-10 text-center text-sm text-muted">
            Data belum dapat dimuat. Silakan tekan Muat Ulang.
          </p>
        ) : filteredRooms.length === 0 ? (
          <div className="p-12 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-primary">
              <BuildingIcon className="h-7 w-7" />
            </span>

            <h3 className="mt-4 text-sm font-bold text-primary">
              {rooms.length === 0
                ? "Belum ada data ruangan"
                : "Ruangan tidak ditemukan"}
            </h3>

            <p className="mt-2 text-xs leading-6 text-muted">
              Tambahkan ruangan atau sesuaikan pencarian.
            </p>

            {(search ||
              typeFilter !== "all" ||
              statusFilter !== "all") && (
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
            <table className="w-full min-w-[1000px] border-collapse text-left">
              <caption className="sr-only">
                Data ruangan dan tindakan pengelolaan
              </caption>

              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-semibold uppercase tracking-wider text-muted">
                  {[
                    "Ruangan",
                    "Jenis",
                    "Kapasitas",
                    "Fasilitas",
                    "Status",
                    "Aksi",
                  ].map((label) => (
                    <th
                      key={label}
                      scope="col"
                      className={`px-5 py-4 ${
                        label === "Aksi" ? "text-right" : ""
                      }`}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredRooms.map((room) => (
                  <tr
                    key={room.id}
                    className="transition hover:bg-slate-50/70"
                  >
                    <th
                      scope="row"
                      className="max-w-xs px-5 py-5 text-left font-normal"
                    >
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
                        {room.room_code}
                      </p>

                      <p className="mt-2 break-words text-sm font-bold text-primary">
                        {room.room_name}
                      </p>

                      <p className="mt-2 text-[11px] leading-6 text-muted">
                        {[
                          room.building,
                          room.floor
                            ? `Lantai ${room.floor}`
                            : null,
                          room.location,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Lokasi belum diisi"}
                      </p>
                    </th>

                    <td className="px-5 py-5 text-xs text-muted">
                      {room.room_type === "kelas"
                        ? "Ruang Kelas"
                        : "Laboratorium"}
                    </td>

                    <td className="whitespace-nowrap px-5 py-5 text-xs font-semibold text-primary">
                      {room.capacity} orang
                    </td>

                    <td className="max-w-56 px-5 py-5">
                      <div className="flex flex-wrap gap-1.5">
                        {room.facilities.length > 0 ? (
                          <>
                            {room.facilities
                              .slice(0, 3)
                              .map((facility, index) => (
                                <span
                                  key={`${facility}-${index}`}
                                  className="break-words rounded-lg border border-slate-200 px-2 py-1 text-[10px] text-primary"
                                >
                                  {facility}
                                </span>
                              ))}

                            {room.facilities.length > 3 && (
                              <span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] text-muted">
                                +{room.facilities.length - 3}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-muted">
                            —
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-5 py-5">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-semibold ${
                          room.is_active
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`h-1.5 w-1.5 rounded-full ${
                            room.is_active
                              ? "bg-emerald-500"
                              : "bg-slate-400"
                          }`}
                        />
                        {room.is_active ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>

                    <td className="px-5 py-5">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditForm(room)}
                          disabled={busy || loading}
                          aria-label={`Edit ruangan ${room.room_code}`}
                          className="min-h-10 rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-semibold text-primary hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => void toggleStatus(room)}
                          disabled={busy || loading}
                          aria-label={`${
                            room.is_active
                              ? "Nonaktifkan"
                              : "Aktifkan"
                          } ruangan ${room.room_code}`}
                          className="min-h-10 whitespace-nowrap rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-semibold text-primary hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
                        >
                          {busyId === room.id
                            ? "Memproses..."
                            : room.is_active
                              ? "Nonaktifkan"
                              : "Aktifkan"}
                        </button>

                        <button
                          type="button"
                          onClick={() => void deleteRoom(room)}
                          disabled={busy || loading}
                          aria-label={`Hapus permanen ruangan ${room.room_code}`}
                          className="min-h-10 rounded-xl border border-red-200 px-3 py-2 text-[11px] font-semibold text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-700 disabled:opacity-50"
                        >
                          Hapus
                        </button>
                      </div>
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
            Menampilkan {filteredRooms.length} dari{" "}
            {rooms.length} ruangan.
          </p>
        )}
      </section>
    </div>
  );
}