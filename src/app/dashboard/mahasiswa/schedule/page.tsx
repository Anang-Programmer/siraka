
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/errors";
import { useCurrentTime } from "@/lib/hooks/use-current-time";

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
};

type Occupancy = {
  room_id: string;
  starts_at: string;
  ends_at: string;
};

type ClassBooking = {
  id: string;
  room_id: string;
  title: string;
  purpose: string | null;
  activity_type: string | null;
  starts_at: string;
  ends_at: string;
};

type RoomFilter = "semua" | "kelas" | "laboratorium";
type AvailabilityFilter =
  | "semua"
  | "tersedia"
  | "ada_jadwal"
  | "sedang_digunakan";

function getTodayWIB(now: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(now));

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function getDayBounds(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const start = new Date(`${date}T00:00:00+07:00`);
  if (!Number.isFinite(start.getTime()) || getTodayWIB(start.getTime()) !== date) return null;
  const end = new Date(start);

  end.setUTCDate(end.getUTCDate() + 1);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function formatDate(value: string) {
  if (!getDayBounds(value)) return "Pilih tanggal yang valid.";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00+07:00`));
}

function getRoomOccupancies(occupancies: Occupancy[], roomId: string) {
  return occupancies
    .filter((item) => item.room_id === roomId)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

function getRoomStatus(schedules: Occupancy[], isToday: boolean, now: number | null) {
  const currentlyUsed = isToday && now !== null && schedules.some(
    (item) => now >= Date.parse(item.starts_at) && now < Date.parse(item.ends_at)
  );
  if (currentlyUsed) return "sedang_digunakan" as const;
  if (schedules.length > 0) return "ada_jadwal" as const;
  return "tersedia" as const;
}

export default function MahasiswaSchedulePage() {
  const now = useCurrentTime();
  const loadController = useRef<AbortController | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [occupancies, setOccupancies] = useState<Occupancy[]>([]);
  const [classBookings, setClassBookings] = useState<ClassBooking[]>([]);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [roomFilter, setRoomFilter] = useState<RoomFilter>("semua");
  const [availabilityFilter, setAvailabilityFilter] =
    useState<AvailabilityFilter>("semua");
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const today = now === null ? "" : getTodayWIB(now);
  const date = selectedDate ?? today;
  const validDate = getDayBounds(date) !== null;

  const loadSchedule = useCallback(() => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    const { signal } = controller;
    const request = async () => {
      if (!date) return;
      const bounds = getDayBounds(date);
      if (!bounds) throw new Error("Pilih tanggal yang valid.");
      const supabase = createClient();
      const { start, end } = bounds;

      const [roomResult, occupancyResult, bookingResult] = await Promise.all([
        supabase
          .from("rooms")
          .select(
            "id, room_code, room_name, room_type, building, floor, location, capacity, facilities"
          )
          .eq("is_active", true)
          .order("room_code", { ascending: true }),

        supabase
          .from("room_occupancy")
          .select("room_id, starts_at, ends_at")
          .lt("starts_at", end)
          .gt("ends_at", start)
          .order("starts_at", { ascending: true }),

        supabase
          .from("bookings")
          .select(
            "id, room_id, title, purpose, activity_type, starts_at, ends_at"
          )
          .eq("status", "approved")
          .lt("starts_at", end)
          .gt("ends_at", start)
          .order("starts_at", { ascending: true }),
      ]);

      if (signal?.aborted) return;
      if (roomResult.error) throw roomResult.error;
      if (occupancyResult.error) throw occupancyResult.error;

      setError("");
      setRooms((roomResult.data ?? []) as Room[]);
      setOccupancies((occupancyResult.data ?? []) as Occupancy[]);
      setClassBookings((bookingResult.data ?? []) as ClassBooking[]);
    };
    return request().catch((err: unknown) => {
      if (signal?.aborted) return;
      console.error("Load room schedule:", err);
      setError(getErrorMessage(err, "Gagal mengambil jadwal dan ketersediaan ruangan."));
    }).finally(() => {
      if (!signal?.aborted) setLoading(false);
    });
  }, [date]);

  useEffect(() => {
    void loadSchedule();
    return () => loadController.current?.abort();
  }, [loadSchedule]);

  const roomSchedules = useMemo(() => (validDate ? rooms : []).map((room) => {
    const schedules = getRoomOccupancies(occupancies, room.id);
    return { room, schedules, status: getRoomStatus(schedules, date === today, now) };
  }), [rooms, occupancies, validDate, date, today, now]);

  const filteredRooms = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return roomSchedules.filter(({ room, status }) => {
      const matchesType =
        roomFilter === "semua" || room.room_type === roomFilter;

      const searchable = [
        room.room_code,
        room.room_name,
        room.building,
        room.floor,
        room.location,
        ...room.facilities,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !keyword || searchable.includes(keyword);


      const matchesAvailability =
        availabilityFilter === "semua" ||
        status === availabilityFilter;

      return matchesType && matchesSearch && matchesAvailability;
    });
  }, [
    roomSchedules,
    search,
    roomFilter,
    availabilityFilter,
  ]);

  const summary = useMemo(() => {
    let available = 0;
    let scheduled = 0;
    let currentlyUsed = 0;

    for (const { status } of roomSchedules) {

      if (status === "tersedia") available++;
      if (status === "ada_jadwal") scheduled++;
      if (status === "sedang_digunakan") currentlyUsed++;
    }

    return {
      total: roomSchedules.length,
      available,
      scheduled,
      currentlyUsed,
    };
  }, [roomSchedules]);

  function statusInfo(status: string) {
    switch (status) {
      case "sedang_digunakan":
        return {
          label: "Sedang Digunakan",
          className: "bg-red-50 text-red-700 border-red-100",
          dot: "bg-red-500",
        };

      case "ada_jadwal":
        return {
          label: "Ada Jadwal",
          className: "bg-amber-50 text-amber-700 border-amber-100",
          dot: "bg-amber-500",
        };

      default:
        return {
          label: "Tersedia",
          className: "bg-green-50 text-green-700 border-green-100",
          dot: "bg-green-500",
        };
    }
  }

  return (
    <div className="space-y-7 pb-10">
      {/* Header */}
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-slate-500">
            Informasi Penggunaan Ruangan
          </p>

          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Jadwal & Ketersediaan
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Periksa ruangan yang tersedia dan waktu penggunaannya.
          </p>
        </div>

        <button
          onClick={() => {
            setLoading(true);
            setError("");
            void loadSchedule();
          }}
          disabled={loading || !validDate}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? "Memuat..." : "Muat Ulang"}
        </button>
      </section>

      {/* Date selector */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex-1">
            <label
              htmlFor="schedule-date"
              className="mb-2 block text-sm font-semibold text-slate-700"
            >
              Pilih Tanggal
            </label>

            <input
              id="schedule-date"
              type="date"
              min={today || undefined}
              value={date}
              onChange={(event) => {
                setSelectedDate(event.target.value);
                setLoading(true);
                setError("");
              }}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500 focus:bg-white sm:max-w-xs"
            />

            <p className="mt-2 text-sm text-slate-500">
              {formatDate(date)}
            </p>
          </div>

          <button
            onClick={() => {
              setSelectedDate(today);
              setLoading(true);
              setError("");
            }}
            disabled={!today || date === today}
            className="rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Hari Ini
          </button>
        </div>
      </section>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-semibold">Gagal memuat data</p>
          <p className="mt-1">{error}</p>
        </div>
      )}

      {/* Summary */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Total Ruangan</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {loading ? "..." : summary.total}
          </p>
        </div>

        <div className="rounded-xl border border-green-100 bg-white p-5">
          <p className="text-sm text-slate-500">Tersedia</p>
          <p className="mt-2 text-3xl font-bold text-green-700">
            {loading ? "..." : summary.available}
          </p>
        </div>

        <div className="rounded-xl border border-amber-100 bg-white p-5">
          <p className="text-sm text-slate-500">Ada Jadwal</p>
          <p className="mt-2 text-3xl font-bold text-amber-600">
            {loading ? "..." : summary.scheduled}
          </p>
        </div>

        <div className="rounded-xl border border-red-100 bg-white p-5">
          <p className="text-sm text-slate-500">Sedang Digunakan</p>
          <p className="mt-2 text-3xl font-bold text-red-600">
            {loading ? "..." : summary.currentlyUsed}
          </p>
        </div>
      </section>

      {/* Filters */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <label
              htmlFor="room-search"
              className="mb-2 block text-sm font-semibold text-slate-700"
            >
              Cari Ruangan
            </label>

            <input
              id="room-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Kode, nama, gedung, atau lokasi..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500 focus:bg-white"
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-slate-700">
              Jenis Ruangan
            </p>

            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["semua", "Semua"],
                  ["kelas", "Ruang Kelas"],
                  ["laboratorium", "Laboratorium"],
                ] as [RoomFilter, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setRoomFilter(value)}
                  className={`rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                    roomFilter === value
                      ? "bg-slate-900 text-white"
                      : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 border-t border-slate-100 pt-4">
          <p className="mb-2 text-sm font-semibold text-slate-700">
            Status Ketersediaan
          </p>

          <div className="flex flex-wrap gap-2">
            {(
              [
                ["semua", "Semua Status"],
                ["tersedia", "Tersedia"],
                ["ada_jadwal", "Ada Jadwal"],
                ["sedang_digunakan", "Sedang Digunakan"],
              ] as [AvailabilityFilter, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setAvailabilityFilter(value)}
                className={`rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                  availabilityFilter === value
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Jadwal Kelas Mahasiswa pada tanggal ini */}
      {validDate && !loading && classBookings.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-blue-200 bg-blue-50/60 p-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                  ✓
                </span>
                <h2 className="text-base font-bold text-blue-950">
                  Jadwal Kelas Anda ({formatDate(date)})
                </h2>
              </div>
              <p className="mt-1 text-xs text-blue-700">
                Ada {classBookings.length} kegiatan kelas yang telah disetujui Admin untuk tanggal ini.
              </p>
            </div>
            <span className="w-fit rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
              Disetujui Admin
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {classBookings.map((booking) => {
              const room = rooms.find((r) => r.id === booking.room_id);
              return (
                <div
                  key={booking.id}
                  className="flex flex-col justify-between rounded-lg border border-blue-200 bg-white p-4 shadow-xs"
                >
                  <div>
                    <h3 className="font-bold text-slate-900">{booking.title}</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {booking.activity_type ?? booking.purpose ?? "Kegiatan kelas"}
                    </p>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                    <span className="font-semibold text-blue-800">
                      {room ? `${room.room_code} - ${room.room_name}` : "Ruangan"}
                    </span>
                    <span className="font-bold tabular-nums text-slate-800">
                      {formatTime(booking.starts_at)} - {formatTime(booking.ends_at)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Room cards */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Ketersediaan Ruangan
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              {validDate ? `Jadwal pemakaian pada ${formatDate(date)}.` : "Pilih tanggal yang valid untuk melihat jadwal."}
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
              Memuat ketersediaan ruangan...
            </p>
          </div>
        ) : !validDate ? (
          <p className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
            Pilih tanggal yang valid untuk melihat ketersediaan ruangan.
          </p>
        ) : error ? null : filteredRooms.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
            <h3 className="font-semibold text-slate-800">
              Tidak ada ruangan ditemukan
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              Coba ubah kata kunci atau filter yang digunakan.
            </p>

            <button
              onClick={() => {
                setSearch("");
                setRoomFilter("semua");
                setAvailabilityFilter("semua");
              }}
              className="mt-4 text-sm font-semibold text-slate-800 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-800"
            >
              Reset semua filter
            </button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredRooms.map(({ room, schedules, status }) => {
              const info = statusInfo(status);

              return (
                <article
                  key={room.id}
                  className="rounded-xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        {room.room_code}
                      </p>

                      <h3 className="mt-1 text-lg font-bold text-slate-900">
                        {room.room_name}
                      </h3>

                      <p className="mt-1 text-sm text-slate-500">
                        {room.room_type === "kelas"
                          ? "Ruang Kelas"
                          : "Laboratorium"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${info.className}`}
                    >
                      <span className={`h-2 w-2 rounded-full ${info.dot}`} />
                      {info.label}
                    </span>

                    <span className="text-xs text-slate-500">
                      {room.capacity} orang
                    </span>
                  </div>

                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Lokasi
                    </p>

                    <p className="mt-1 text-sm text-slate-700">
                      {[room.building, room.floor, room.location]
                        .filter(Boolean)
                        .join(" - ") || "Belum diisi"}
                    </p>
                  </div>

                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Jadwal Pemakaian
                      </p>

                      <span className="text-xs text-slate-400">
                        {schedules.length} reservasi
                      </span>
                    </div>

                    {schedules.length === 0 ? (
                      <div className="mt-3 rounded-lg bg-green-50 p-3">
                        <p className="text-sm font-medium text-green-700">
                          Belum ada reservasi aktif
                        </p>
                        <p className="mt-1 text-xs text-green-600">
                          Ruangan tidak memiliki reservasi aktif pada tanggal ini.
                        </p>
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {schedules.map((item, index) => {
                          const matchedBooking = classBookings.find(
                            (b) =>
                              b.room_id === item.room_id &&
                              b.starts_at === item.starts_at
                          );

                          if (matchedBooking) {
                            return (
                              <div
                                key={`${item.room_id}-${item.starts_at}-${index}`}
                                className="flex flex-col gap-1 rounded-lg border border-blue-200 bg-blue-50/80 p-3"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-bold text-blue-950">
                                    {matchedBooking.title}
                                  </span>
                                  <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                                    Kelas Anda
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-xs text-blue-700">
                                  <span>
                                    {matchedBooking.activity_type ??
                                      matchedBooking.purpose ??
                                      "Kegiatan kelas"}
                                  </span>
                                  <span className="font-semibold tabular-nums">
                                    {formatTime(item.starts_at)} - {formatTime(item.ends_at)}
                                  </span>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div
                              key={`${item.room_id}-${item.starts_at}-${index}`}
                              className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5"
                            >
                              <span className="text-xs text-slate-500">
                                Pemakaian {index + 1}
                              </span>

                              <span className="text-sm font-semibold tabular-nums text-slate-800">
                                {formatTime(item.starts_at)}
                                {" - "}
                                {formatTime(item.ends_at)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {room.facilities.length > 0 && (
                    <div className="mt-4 border-t border-slate-100 pt-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
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
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Legend */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="font-semibold text-slate-900">
          Keterangan Status
        </h3>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
            <span className="text-sm text-slate-600">Tersedia</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            <span className="text-sm text-slate-600">Ada Jadwal</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
            <span className="text-sm text-slate-600">
              Sedang Digunakan
            </span>
          </div>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-slate-400">
          Status berdasarkan reservasi aktif yang telah disetujui.
          Pengajuan yang masih Pending tidak dianggap sebagai pemakaian
          ruangan. Data diperbarui ketika halaman dimuat, tanggal berubah,
          atau tombol Muat Ulang ditekan.
        </p>
      </section>
    </div>
  );
}
