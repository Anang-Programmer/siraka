
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";

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

type FilterType = "semua" | "kelas" | "laboratorium";

export default function MahasiswaRoomsPage() {
  const loadController = useRef<AbortController | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("semua");
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadRooms = useCallback(() => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    const { signal } = controller;
    const request = async () => {
      const supabase = createClient();

      const { data, error: queryError } = await supabase
        .from("rooms")
        .select(
          "id, room_code, room_name, room_type, building, floor, location, capacity, facilities, description"
        )
        .eq("is_active", true)
        .order("room_code", { ascending: true });

      if (signal?.aborted) return;
      if (queryError) throw queryError;

      setRooms((data ?? []) as Room[]);
    };
    return request().catch((err: unknown) => {
      if (signal?.aborted) return;
      console.error("Load rooms:", err);
      setError(getErrorMessage(err, "Gagal mengambil data ruangan."));
    }).finally(() => {
      if (!signal?.aborted) setLoading(false);
    });
  }, []);

  useEffect(() => {
    void loadRooms();
    return () => loadController.current?.abort();
  }, [loadRooms]);

  const filteredRooms = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("id");

    return rooms.filter((room) => {
      const matchesType =
        filter === "semua" || room.room_type === filter;

      const searchableText = [
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

      const matchesSearch =
        !keyword || searchableText.includes(keyword);

      return matchesType && matchesSearch;
    });
  }, [rooms, search, filter]);

  const classCount = rooms.filter(
    (room) => room.room_type === "kelas"
  ).length;

  const laboratoryCount = rooms.filter(
    (room) => room.room_type === "laboratorium"
  ).length;

  return (
    <div className="space-y-7 pb-10">
      {/* Header */}
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-slate-500">
            Informasi Fasilitas Kampus
          </p>

          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Informasi Ruangan
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Temukan informasi ruang kelas dan laboratorium di lingkungan kampus.
          </p>
        </div>

        <button
          onClick={() => {
            setLoading(true);
            setError("");
            void loadRooms();
          }}
          disabled={loading}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? "Memuat..." : "Muat Ulang"}
        </button>
      </section>

      {/* Summary */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Total Ruangan Aktif</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {loading ? "..." : rooms.length}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Ruang Kelas</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {loading ? "..." : classCount}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Laboratorium</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {loading ? "..." : laboratoryCount}
          </p>
        </div>
      </section>

      {/* Search and Filter */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex-1">
            <label
              htmlFor="room-search"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Cari Ruangan
            </label>

            <input
              id="room-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari kode, nama, gedung, lokasi, atau fasilitas..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-500 focus:bg-white focus:ring-2 focus:ring-slate-100"
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">
              Jenis Ruangan
            </p>

            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["semua", "Semua"],
                  ["kelas", "Ruang Kelas"],
                  ["laboratorium", "Laboratorium"],
                ] as [FilterType, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setFilter(value)}
                  className={`rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                    filter === value
                      ? "bg-slate-900 text-white"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {(search || filter !== "semua") && (
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
            <p className="text-xs text-slate-500">
              Menampilkan {filteredRooms.length} dari {rooms.length} ruangan
            </p>

            <button
              onClick={() => {
                setSearch("");
                setFilter("semua");
              }}
              className="text-xs font-medium text-blue-700 hover:underline"
            >
              Reset filter
            </button>
          </div>
        )}
      </section>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Room List */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Daftar Ruangan
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Informasi ruangan yang tersedia dalam sistem.
            </p>
          </div>

          {!loading && (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {filteredRooms.length} ruangan
            </span>
          )}
        </div>

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-800" />
            <p className="mt-4 text-sm text-slate-500">
              Mengambil data ruangan...
            </p>
          </div>
        ) : error ? null : filteredRooms.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
            <h3 className="font-semibold text-slate-800">
              Ruangan tidak ditemukan
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              Coba gunakan kata kunci atau filter yang berbeda.
            </p>

            <button
              onClick={() => {
                setSearch("");
                setFilter("semua");
              }}
              className="mt-4 text-sm font-semibold text-slate-800 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-800"
            >
              Tampilkan semua ruangan
            </button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredRooms.map((room) => (
              <article
                key={room.id}
                className="group flex flex-col rounded-xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      room.room_type === "kelas"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-violet-50 text-violet-700"
                    }`}
                  >
                    {room.room_type === "kelas"
                      ? "Ruang Kelas"
                      : "Laboratorium"}
                  </span>
                </div>

                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {room.room_code}
                  </p>

                  <h3 className="mt-1 text-lg font-bold text-slate-900">
                    {room.room_name}
                  </h3>

                  <p className="mt-2 text-sm text-slate-500">
                    {[room.building, room.floor, room.location]
                      .filter(Boolean)
                      .join(" - ") || "Lokasi belum diisi"}
                  </p>
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                  <div>
                    <p className="text-xs text-slate-400">
                      Kapasitas
                    </p>

                    <p className="mt-1 font-semibold text-slate-800">
                      {room.capacity} orang
                    </p>
                  </div>

                  <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                    Ruangan Aktif
                  </span>
                </div>

                {room.facilities.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-medium text-slate-500">
                      Fasilitas
                    </p>

                    <div className="flex flex-wrap gap-1.5">
                      {room.facilities.slice(0, 3).map((facility, index) => (
                        <span
                          key={`${facility}-${index}`}
                          className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600"
                        >
                          {facility}
                        </span>
                      ))}

                      {room.facilities.length > 3 && (
                        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-500">
                          +{room.facilities.length - 3} lainnya
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setSelectedRoom(room)}
                  className="mt-5 w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-900 hover:bg-slate-900 hover:text-white"
                >
                  Lihat Detail Ruangan
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Room Detail Modal */}
      {selectedRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4">
          <button
            aria-label="Tutup detail ruangan"
            onClick={() => setSelectedRoom(null)}
            className="fixed inset-0 bg-black/50"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="room-detail-title"
            className="relative z-10 my-auto w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <div className="border-b border-slate-100 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      selectedRoom.room_type === "kelas"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-violet-50 text-violet-700"
                    }`}
                  >
                    {selectedRoom.room_type === "kelas"
                      ? "Ruang Kelas"
                      : "Laboratorium"}
                  </span>

                  <h2
                    id="room-detail-title"
                    className="mt-3 text-xl font-bold text-slate-900"
                  >
                    {selectedRoom.room_name}
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    {selectedRoom.room_code}
                  </p>
                </div>

                <button
                  onClick={() => setSelectedRoom(null)}
                  aria-label="Tutup"
                  className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Tutup
                </button>
              </div>
            </div>

            <div className="space-y-6 p-6">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">Kapasitas</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">
                    {selectedRoom.capacity} orang
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">Status Data</p>
                  <p className="mt-1 text-lg font-bold text-green-700">
                    Aktif
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Lokasi Ruangan
                </h3>

                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <p>
                    <span className="text-slate-400">Gedung:</span>{" "}
                    {selectedRoom.building || "-"}
                  </p>

                  <p>
                    <span className="text-slate-400">Lantai:</span>{" "}
                    {selectedRoom.floor || "-"}
                  </p>

                  <p>
                    <span className="text-slate-400">Lokasi:</span>{" "}
                    {selectedRoom.location || "-"}
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Fasilitas Ruangan
                </h3>

                {selectedRoom.facilities.length > 0 ? (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {selectedRoom.facilities.map((facility, index) => (
                      <div
                        key={`${facility}-${index}`}
                        className="flex items-center gap-2 rounded-lg border border-slate-100 p-3 text-sm text-slate-700"
                      >
                        {facility}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-400">
                    Belum ada informasi fasilitas.
                  </p>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Deskripsi
                </h3>

                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {selectedRoom.description ||
                    "Belum ada deskripsi tambahan untuk ruangan ini."}
                </p>
              </div>
            </div>

            <div className="border-t border-slate-100 bg-slate-50 p-4">
              <button
                onClick={() => setSelectedRoom(null)}
                className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Tutup Detail
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
