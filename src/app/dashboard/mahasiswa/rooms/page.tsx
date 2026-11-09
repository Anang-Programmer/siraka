"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
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
};

type Filter = "semua" | Room["room_type"];

const filters: { value: Filter; label: string }[] = [
  { value: "semua", label: "Semua Ruangan" },
  { value: "kelas", label: "Ruang Kelas" },
  { value: "laboratorium", label: "Laboratorium" },
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

function typeLabel(type: Room["room_type"]) {
  return type === "kelas" ? "Ruang Kelas" : "Laboratorium";
}

function locationLabel(room: Room) {
  return (
    [
      room.building,
      room.floor ? `Lantai ${room.floor}` : null,
      room.location,
    ]
      .filter(Boolean)
      .join(" · ") || "Lokasi belum diisi"
  );
}

function RoomDetail({
  room,
  onClose,
}: {
  room: Room | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) return;

    if (room && !dialog.open) dialog.showModal();
    if (!room && dialog.open) dialog.close();
  }, [room]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="room-detail-title"
      onCancel={onClose}
      onClose={onClose}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;

        const rect = event.currentTarget.getBoundingClientRect();

        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        ) {
          onClose();
        }
      }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-lg border-0 bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/60 backdrop:backdrop-blur-sm"
    >
      {room && (
        <>
          <div className="relative overflow-hidden bg-[#173A56] p-4 text-white">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full border border-white/10"
            />

            <div className="relative flex items-start justify-between gap-4">
              <div className="min-w-0">
                <span className="inline-flex rounded-lg bg-white/10 px-3 py-1.5 text-[10px] font-semibold text-cyan-100">
                  {typeLabel(room.room_type)}
                </span>

                <h2
                  id="room-detail-title"
                  className="mt-4 break-words font-heading text-2xl font-bold"
                >
                  {room.room_name}
                </h2>

                <p className="mt-2 text-xs tracking-wider text-slate-300">
                  {room.room_code}
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup detail ruangan"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white/10 text-xl transition hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
          </div>

          <div className="space-y-6 p-4">
            <dl className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-200 p-4">
                <dt className="text-xs text-muted">
                  Kapasitas
                </dt>
                <dd className="mt-2 text-lg font-bold text-primary">
                  {room.capacity} orang
                </dd>
              </div>

              <div className="rounded-lg border border-slate-200 p-4">
                <dt className="text-xs text-muted">
                  Status Data
                </dt>
                <dd className="mt-2 text-lg font-bold text-emerald-700">
                  Aktif
                </dd>
              </div>
            </dl>

            <section>
              <h3 className="text-sm font-bold text-primary">
                Lokasi Ruangan
              </h3>
              <p className="mt-2 text-sm leading-7 text-muted">
                {locationLabel(room)}
              </p>
            </section>

            <section>
              <h3 className="text-sm font-bold text-primary">
                Fasilitas Tersedia
              </h3>

              {room.facilities.length > 0 ? (
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {room.facilities.map((facility, index) => (
                    <li
                      key={`${facility}-${index}`}
                      className="flex items-start gap-2 rounded-md border border-slate-200 px-3 py-3 text-xs text-primary"
                    >
                      <span
                        aria-hidden="true"
                        className="font-bold text-teal-700"
                      >
                        ✓
                      </span>
                      <span className="break-words">
                        {facility}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted">
                  Belum ada informasi fasilitas.
                </p>
              )}
            </section>

            <section>
              <h3 className="text-sm font-bold text-primary">
                Tentang Ruangan
              </h3>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-muted">
                {room.description ||
                  "Belum ada deskripsi tambahan untuk ruangan ini."}
              </p>
            </section>

            <p className="rounded-lg bg-slate-50 p-4 text-xs leading-6 text-muted">
              Status aktif menunjukkan ruangan terdaftar aktif
              dalam sistem. Periksa jadwal untuk mengetahui
              ketersediaannya pada waktu tertentu.
            </p>

            <Link
              href="/dashboard/mahasiswa/schedule"
              className="btn-primary w-full rounded-md"
            >
              Lihat Jadwal &amp; Ketersediaan
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </>
      )}
    </dialog>
  );
}

export default function MahasiswaRoomsPage() {
  const loadController = useRef<AbortController | null>(null);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("semua");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

    const loadRooms = useCallback(() => {
    loadController.current?.abort();

    const controller = new AbortController();
    loadController.current = controller;

    const { signal } = controller;

    const fetchRooms = async () => {
      const supabase = createClient();

      const { data, error: queryError } = await supabase
        .from("rooms")
        .select(
          "id, room_code, room_name, room_type, building, floor, location, capacity, facilities, description",
        )
        .eq("is_active", true)
        .order("room_code", { ascending: true });

      if (signal.aborted) return;
      if (queryError) throw queryError;

      return ((data ?? []) as Room[]).map((room) => ({
        ...room,
        facilities: Array.isArray(room.facilities)
          ? room.facilities
          : [],
      }));
    };

    return fetchRooms()
      .then((result) => {
        if (signal.aborted || !result) return;

        setRooms(result);
        setError("");

        setSelectedRoom((current) =>
          current
            ? result.find((room) => room.id === current.id) ?? null
            : null,
        );
      })
      .catch((err: unknown) => {
        if (signal.aborted) return;

        console.error("Load rooms:", err);

        setError(
          getErrorMessage(err, "Gagal mengambil data ruangan."),
        );
      })
      .finally(() => {
        if (!signal.aborted) {
          setLoading(false);
        }
      });
  }, []);

  function refreshRooms() {
    setLoading(true);
    setError("");

    return loadRooms();
  }

  useEffect(() => {
    void loadRooms();

    return () => {
      loadController.current?.abort();
    };
  }, [loadRooms]);

  const filteredRooms = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("id");

    return rooms.filter((room) => {
      const matchesType =
        filter === "semua" || room.room_type === filter;

      const text = [
        room.room_code,
        room.room_name,
        room.building,
        room.floor,
        room.location,
        room.description,
        ...room.facilities,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("id");

      return matchesType && (!keyword || text.includes(keyword));
    });
  }, [rooms, search, filter]);

  const ready = !loading && !error;
  const hasFilter = search.trim() !== "" || filter !== "semua";

  function resetFilters() {
    setSearch("");
    setFilter("semua");
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
            Workspace / Fasilitas Kampus
          </p>

          <h1 className="mt-2 font-heading text-2xl font-bold text-primary sm:text-2xl">
            Informasi Ruangan
          </h1>

          <p className="mt-2 text-sm leading-7 text-muted">
            Temukan ruang yang sesuai untuk kegiatan kelasmu.
          </p>
        </div>

        <button
          type="button"
         onClick={() => void refreshRooms()}
          disabled={loading}
          className="btn-outline w-fit shrink-0 rounded-md text-xs shadow-none"
        >
          {loading ? "Memuat..." : "↻ Muat Ulang"}
        </button>
      </section>

      <section
        aria-label="Statistik ruangan"
        className="grid gap-4 sm:grid-cols-3"
      >
        {[
          {
            label: "Total Ruangan Aktif",
            value: rooms.length,
            note: "Terdaftar dalam sistem",
            color: "bg-teal-50 text-teal-700",
          },
          {
            label: "Ruang Kelas",
            value: rooms.filter(
              (room) => room.room_type === "kelas",
            ).length,
            note: "Untuk kegiatan perkuliahan",
            color: "bg-sky-50 text-sky-700",
          },
          {
            label: "Laboratorium",
            value: rooms.filter(
              (room) => room.room_type === "laboratorium",
            ).length,
            note: "Untuk praktikum dan riset",
            color: "bg-indigo-50 text-indigo-700",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-slate-200/80 bg-white p-4 shadow-none shadow-slate-200/30 sm:p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xs font-semibold text-muted">
                {stat.label}
              </h2>

              <span className={`rounded-md p-2 ${stat.color}`}>
                <BuildingIcon />
              </span>
            </div>

            <p className="mt-4 font-heading text-3xl font-bold text-primary">
              {ready
                ? String(stat.value).padStart(2, "0")
                : "—"}
            </p>

            <p className="mt-2 text-[11px] text-muted">
              {stat.note}
            </p>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-slate-200/80 bg-white p-4 shadow-none shadow-slate-200/20 sm:p-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
          <div>
            <label
              htmlFor="room-search"
              className="mb-3 block text-xs font-bold text-primary"
            >
              Cari ruangan
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
                id="room-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari nama, kode, gedung, atau fasilitas..."
                className="input-field min-h-11 rounded-md pl-11"
              />
            </div>
          </div>

          <fieldset>
            <legend className="mb-3 text-xs font-bold text-primary">
              Jenis ruangan
            </legend>

            <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
              {filters.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={filter === item.value}
                  onClick={() => setFilter(item.value)}
                  className={`min-h-10 rounded-md px-3 py-2 text-[11px] font-semibold transition focus-visible:outline-2 focus-visible:outline-primary ${
                    filter === item.value
                      ? "bg-white text-primary shadow-none"
                      : "text-muted hover:text-primary"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        {hasFilter && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <p className="text-xs text-muted">
              {ready
                ? `${filteredRooms.length} ruangan sesuai pencarian`
                : "Hasil pencarian belum tersedia"}
            </p>

            <button
              type="button"
              onClick={resetFilters}
              className="rounded-md text-xs font-bold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
            >
              Reset filter
            </button>
          </div>
        )}
      </section>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <section>
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="h-6 w-1 rounded-full bg-secondary"
            />

            <h2 className="font-heading text-lg font-bold text-primary">
              Jelajahi Ruangan
            </h2>
          </div>

          {ready && (
            <span
              role="status"
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-muted"
            >
              {filteredRooms.length} ruangan
            </span>
          )}
        </div>

        {loading ? (
          <div
            role="status"
            className="rounded-lg border border-slate-200 bg-white p-12 text-center"
          >
            <div
              aria-hidden="true"
              className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-100 border-t-primary"
            />

            <p className="mt-4 text-sm text-muted">
              Mengambil data ruangan...
            </p>
          </div>
        ) : error ? (
          <p className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-muted">
            Data belum dapat dimuat. Silakan tekan Muat Ulang.
          </p>
        ) : filteredRooms.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-12 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-slate-50 text-primary">
              <BuildingIcon className="h-7 w-7" />
            </span>

            <h3 className="mt-4 text-sm font-bold text-primary">
              {hasFilter
                ? "Ruangan tidak ditemukan"
                : "Belum ada ruangan aktif"}
            </h3>

            <p className="mt-2 text-xs leading-6 text-muted">
              {hasFilter
                ? "Coba kata kunci atau jenis ruangan yang berbeda."
                : "Ruangan aktif yang ditambahkan Admin akan muncul di sini."}
            </p>

            {hasFilter && (
              <button
                type="button"
                onClick={resetFilters}
                className="btn-outline mt-5 rounded-md text-xs"
              >
                Tampilkan Semua
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {filteredRooms.map((room) => (
              <article
                key={room.id}
                className="group flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-none shadow-slate-200/20 transition hover:border-secondary/40 hover:shadow-md hover:shadow-slate-200/40"
              >
                <div className="relative overflow-hidden bg-[#173A56] px-5 py-5 sm:px-4">
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-8 -top-12 h-40 w-40 rounded-full border border-white/10"
                  />

                  <div className="relative flex items-center justify-between gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/10 text-cyan-100">
                      <BuildingIcon className="h-6 w-6" />
                    </span>

                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-semibold text-emerald-100">
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 rounded-full bg-emerald-300"
                      />
                      Ruangan Aktif
                    </span>
                  </div>

                  <p className="relative mt-4 text-[10px] font-semibold uppercase tracking-[0.15em] text-cyan-100/80">
                    {typeLabel(room.room_type)}
                  </p>

                  <h3 className="relative mt-2 break-words font-heading text-xl font-bold text-white">
                    {room.room_name}
                  </h3>
                </div>

                <div className="flex flex-1 flex-col p-4 sm:p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-[11px] font-bold tracking-wide text-primary">
                      {room.room_code}
                    </span>

                    <span className="text-xs font-semibold text-muted">
                      {room.capacity} orang
                    </span>
                  </div>

                  <p className="mt-4 text-xs leading-7 text-muted">
                    {locationLabel(room)}
                  </p>

                  <div className="mb-5 mt-5 border-t border-slate-100 pt-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted">
                      Fasilitas
                    </p>

                    {room.facilities.length > 0 ? (
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {room.facilities
                          .slice(0, 4)
                          .map((facility, index) => (
                            <li
                              key={`${facility}-${index}`}
                              className="max-w-full break-words rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-medium text-primary"
                            >
                              {facility}
                            </li>
                          ))}

                        {room.facilities.length > 4 && (
                          <li className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[10px] text-muted">
                            +{room.facilities.length - 4} lainnya
                          </li>
                        )}
                      </ul>
                    ) : (
                      <p className="mt-3 text-xs text-muted">
                        Informasi fasilitas belum tersedia.
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedRoom(room)}
                    aria-haspopup="dialog"
                    aria-label={`Lihat detail ${room.room_name}`}
                    className="mt-auto inline-flex min-h-11 items-center justify-between gap-3 rounded-md bg-slate-50 px-4 py-3 text-xs font-bold text-primary transition hover:bg-primary hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    Lihat Detail Ruangan
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <RoomDetail
        room={selectedRoom}
        onClose={() => setSelectedRoom(null)}
      />
    </div>
  );
}