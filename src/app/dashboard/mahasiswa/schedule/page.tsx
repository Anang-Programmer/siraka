"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  starts_at: string;
  ends_at: string;
};

type RoomFilter = "semua" | Room["room_type"];

type Status =
  | "tersedia"
  | "ada_jadwal"
  | "sedang_digunakan";

type StatusFilter = "semua" | Status;

const roomOptions: { value: RoomFilter; label: string }[] = [
  { value: "semua", label: "Semua" },
  { value: "kelas", label: "Ruang Kelas" },
  { value: "laboratorium", label: "Laboratorium" },
];

const statusOptions: { value: StatusFilter; label: string }[] = [
  { value: "semua", label: "Semua Status" },
  { value: "tersedia", label: "Tersedia" },
  { value: "ada_jadwal", label: "Ada Jadwal" },
  { value: "sedang_digunakan", label: "Sedang Digunakan" },
];

const statusConfig: Record<
  Status,
  { label: string; badge: string; dot: string }
> = {
  tersedia: {
    label: "Tersedia",
    badge: "bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
  },
  ada_jadwal: {
    label: "Ada Jadwal",
    badge: "bg-amber-50 text-amber-800",
    dot: "bg-amber-500",
  },
  sedang_digunakan: {
    label: "Sedang Digunakan",
    badge: "bg-red-50 text-red-700",
    dot: "bg-red-500",
  },
};

function CalendarIcon({
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
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M7 3v4M17 3v4M3 11h18M8 15h2M14 15h2" />
    </svg>
  );
}

function jakartaDate(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));

  return ["year", "month", "day"]
    .map((type) => parts.find((part) => part.type === type)?.value)
    .join("-");
}

function dayBounds(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const start = new Date(`${date}T00:00:00+07:00`);

  if (
    !Number.isFinite(start.getTime()) ||
    jakartaDate(start.getTime()) !== date
  ) {
    return null;
  }

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function dateLabel(date: string) {
  if (!dayBounds(date)) return "Pilih tanggal yang valid";

  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00+07:00`));
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function timeRange(item: Occupancy, date: string) {
  const start =
    jakartaDate(Date.parse(item.starts_at)) === date
      ? timeLabel(item.starts_at)
      : "00.00";

  const end =
    jakartaDate(Date.parse(item.ends_at)) === date
      ? timeLabel(item.ends_at)
      : "24.00";

  return `${start} - ${end} WIB`;
}

function roomStatus(
  schedules: Occupancy[],
  isToday: boolean,
  now: number | null,
): Status {
  if (
    isToday &&
    now !== null &&
    schedules.some(
      (item) =>
        now >= Date.parse(item.starts_at) &&
        now < Date.parse(item.ends_at),
    )
  ) {
    return "sedang_digunakan";
  }

  return schedules.length > 0 ? "ada_jadwal" : "tersedia";
}

function filterClass(active: boolean) {
  return `min-h-10 rounded-md px-3 py-2 text-[11px] font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
    active
      ? "bg-white text-primary shadow-none"
      : "text-muted hover:bg-white/70 hover:text-primary"
  }`;
}

export default function MahasiswaSchedulePage() {
  const now = useCurrentTime();
  const controllerRef = useRef<AbortController | null>(null);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [occupancies, setOccupancies] = useState<Occupancy[]>([]);
  const [classBookings, setClassBookings] =
    useState<ClassBooking[]>([]);

  const [selectedDate, setSelectedDate] = useState<string | null>(
    null,
  );
  const [loadedDate, setLoadedDate] = useState("");

  const [search, setSearch] = useState("");
  const [roomFilter, setRoomFilter] =
    useState<RoomFilter>("semua");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("semua");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  const today = now === null ? "" : jakartaDate(now);
  const date = selectedDate ?? today;
  const validDate = dayBounds(date) !== null;

  const loadSchedule = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const { signal } = controller;

    const fetchSchedule = async () => {
      const bounds = dayBounds(date);
      if (!bounds) return;
      const supabase = createClient();

      const [roomResult, occupancyResult] = await Promise.all([
        supabase
          .from("rooms")
          .select(
            "id, room_code, room_name, room_type, building, floor, location, capacity, facilities",
          )
          .eq("is_active", true)
          .order("room_code", { ascending: true }),

        supabase
          .from("room_occupancy")
          .select("room_id, starts_at, ends_at")
          .lt("starts_at", bounds.end)
          .gt("ends_at", bounds.start)
          .order("starts_at", { ascending: true }),
      ]);

      if (signal.aborted) return;
      if (roomResult.error) throw roomResult.error;
      if (occupancyResult.error) throw occupancyResult.error;

      let nextBookings: ClassBooking[] = [];
      let nextWarning = "";

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (signal.aborted) return;
        if (authError) throw authError;

        if (!user) {
          throw new Error("Sesi login tidak ditemukan.");
        }

        const { data: profile, error: profileError } =
          await supabase
            .from("profiles")
            .select("class_id")
            .eq("id", user.id)
            .maybeSingle();

        if (signal.aborted) return;
        if (profileError) throw profileError;

        if (!profile) {
          throw new Error("Profil tidak ditemukan.");
        }

        if (profile.class_id) {
          const { data, error: bookingError } = await supabase
            .from("bookings")
            .select("id, room_id, title, starts_at, ends_at")
            .eq("class_id", profile.class_id)
            .eq("status", "approved")
            .lt("starts_at", bounds.end)
            .gt("ends_at", bounds.start)
            .order("starts_at", { ascending: true });

          if (signal.aborted) return;
          if (bookingError) throw bookingError;

          nextBookings = (data ?? []) as ClassBooking[];
        }
      } catch (err) {
        if (signal.aborted) return;

        console.error("Load class schedule:", err);

        nextWarning =
          "Detail kegiatan kelas belum dapat dimuat. Data ketersediaan ruangan tetap tersedia.";
      }

      if (signal.aborted) return;

      return {
        rooms: ((roomResult.data ?? []) as Room[]).map((room) => ({
          ...room,
          facilities: Array.isArray(room.facilities) ? room.facilities : [],
        })),
        occupancies: (occupancyResult.data ?? []) as Occupancy[],
        bookings: nextBookings,
        warning: nextWarning,
      };
    };

    return fetchSchedule()
      .then((result) => {
        if (signal.aborted) return;
        setError("");
        setWarning(result?.warning ?? "");
        if (!result) return;
        setRooms(result.rooms);
        setOccupancies(result.occupancies);
        setClassBookings(result.bookings);
        setLoadedDate(date);
      })
      .catch((err: unknown) => {
        if (signal.aborted) return;
        console.error("Load schedule:", err);
        setWarning("");
        setError(getErrorMessage(err, "Gagal memuat jadwal dan ketersediaan ruangan."));
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });
  }, [date]);

  function refreshSchedule() {
    setLoading(true);
    setError("");
    setWarning("");
    return loadSchedule();
  }

  useEffect(() => {
    void loadSchedule();

    return () => {
      controllerRef.current?.abort();
    };
  }, [loadSchedule]);

  const ready =
    validDate &&
    loadedDate === date &&
    !loading &&
    !error;

  const roomSchedules = useMemo(() => {
    if (!ready) return [];

    return rooms.map((room) => {
      const schedules = occupancies
        .filter((item) => item.room_id === room.id)
        .sort(
          (a, b) =>
            Date.parse(a.starts_at) - Date.parse(b.starts_at),
        );

      return {
        room,
        schedules,
        status: roomStatus(schedules, date === today, now),
      };
    });
  }, [rooms, occupancies, ready, date, today, now]);

  const filteredRooms = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("id");

    return roomSchedules.filter(({ room, status }) => {
      const matchesType =
        roomFilter === "semua" ||
        room.room_type === roomFilter;

      const matchesStatus =
        statusFilter === "semua" || status === statusFilter;

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
  }, [roomSchedules, search, roomFilter, statusFilter]);

  const stats = [
    {
      label: "Total Ruangan",
      value: roomSchedules.length,
      note: "Ruangan aktif dalam sistem",
      color: "bg-slate-100 text-primary",
    },
    {
      label: "Tersedia",
      value: roomSchedules.filter(
        (item) => item.status === "tersedia",
      ).length,
      note: "Tanpa reservasi pada tanggal ini",
      color: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "Ada Jadwal",
      value: roomSchedules.filter(
        (item) => item.status === "ada_jadwal",
      ).length,
      note: "Memiliki reservasi pada tanggal ini",
      color: "bg-amber-50 text-amber-800",
    },
    {
      label: "Sedang Digunakan",
      value: roomSchedules.filter(
        (item) => item.status === "sedang_digunakan",
      ).length,
      note: "Reservasi berlangsung saat ini",
      color: "bg-red-50 text-red-700",
    },
  ];

  const hasFilter =
    search.trim() !== "" ||
    roomFilter !== "semua" ||
    statusFilter !== "semua";

  function resetFilters() {
    setSearch("");
    setRoomFilter("semua");
    setStatusFilter("semua");
  }

  function changeDate(value: string | null) {
    controllerRef.current?.abort();
    setSelectedDate(value);
    setLoading(true);
    setError("");
    setWarning("");
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
            Workspace / Jadwal Ruangan
          </p>

          <h1 className="mt-2 font-heading text-2xl font-bold text-primary sm:text-2xl">
            Jadwal &amp; Ketersediaan
          </h1>

          <p className="mt-2 text-sm leading-7 text-muted">
            Temukan waktu dan ruangan yang sesuai untuk kegiatanmu.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void refreshSchedule()}
          disabled={loading || !validDate}
          className="btn-outline w-fit shrink-0 rounded-md text-xs shadow-none"
        >
          {loading ? "Memuat..." : "↻ Muat Ulang"}
        </button>
      </section>

      <section className="rounded-lg border border-slate-200/80 bg-white p-4 shadow-none shadow-slate-200/30 sm:p-4">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-primary">
              <CalendarIcon className="h-6 w-6" />
            </span>

            <div>
              <label
                htmlFor="schedule-date"
                className="text-[10px] font-bold uppercase tracking-widest text-muted"
              >
                Tanggal Pemantauan
              </label>

              <p className="mt-1 text-sm font-bold text-primary">
                {today ? dateLabel(date) : "Memuat tanggal..."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              id="schedule-date"
              type="date"
              min={today || undefined}
              value={date}
              onChange={(event) =>
                changeDate(event.target.value)
              }
              className="input-field min-h-11 w-auto max-w-full rounded-md"
            />

            <button
              type="button"
              onClick={() => changeDate(null)}
              disabled={!today || date === today}
              className="btn-outline rounded-md text-xs"
            >
              Hari Ini
            </button>
          </div>
        </div>
      </section>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700"
        >
          {error}
        </p>
      )}

      {ready && warning && (
        <p
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-800"
        >
          {warning}
        </p>
      )}

      <section
        aria-label="Ringkasan ketersediaan"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-slate-200/80 bg-white p-4 shadow-none shadow-slate-200/20"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xs font-semibold text-muted">
                {stat.label}
              </h2>

              <span className={`rounded-md p-2 ${stat.color}`}>
                <CalendarIcon className="h-4 w-4" />
              </span>
            </div>

            <p className="mt-4 font-heading text-3xl font-bold text-primary">
              {ready ? stat.value : "—"}
            </p>

            <p className="mt-2 text-[10px] leading-5 text-muted">
              {stat.note}
            </p>
          </div>
        ))}
      </section>

      <section className="space-y-5 rounded-lg border border-slate-200/80 bg-white p-4 shadow-none shadow-slate-200/20 sm:p-4">
        <div>
          <label
            htmlFor="schedule-search"
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
              id="schedule-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari kode, nama, gedung, atau fasilitas..."
              className="input-field min-h-11 rounded-md pl-11"
            />
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          <fieldset className="min-w-0">
            <legend className="mb-3 text-xs font-bold text-primary">
              Jenis ruangan
            </legend>

            <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
              {roomOptions.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setRoomFilter(item.value)}
                  aria-pressed={roomFilter === item.value}
                  className={filterClass(
                    roomFilter === item.value,
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="min-w-0">
            <legend className="mb-3 text-xs font-bold text-primary">
              Status ketersediaan
            </legend>

            <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
              {statusOptions.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setStatusFilter(item.value)}
                  aria-pressed={statusFilter === item.value}
                  className={filterClass(
                    statusFilter === item.value,
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        {hasFilter && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <p className="text-xs text-muted">
              {ready
                ? `${filteredRooms.length} ruangan sesuai filter`
                : "Hasil belum tersedia"}
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

      {ready && classBookings.length > 0 && (
        <section className="rounded-lg border border-slate-200/80 bg-white p-4 sm:p-4">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="h-6 w-1 rounded-full bg-secondary"
            />
            <h2 className="font-heading text-base font-bold text-primary">
              Jadwal Kelas Anda
            </h2>
          </div>

          <p className="mt-2 text-xs leading-6 text-muted">
            Kegiatan kelas yang disetujui pada tanggal pilihanmu.
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {classBookings.map((booking) => {
              const room = rooms.find(
                (item) => item.id === booking.room_id,
              );

              return (
                <article
                  key={booking.id}
                  className="rounded-lg border border-slate-200 p-4"
                >
                  <h3 className="break-words text-sm font-bold text-primary">
                    {booking.title}
                  </h3>

                  <p className="mt-2 text-xs leading-6 text-muted">
                    {room
                      ? `${room.room_code} · ${room.room_name}`
                      : "Informasi ruangan tidak tersedia"}
                  </p>

                  <p className="mt-3 text-xs font-bold text-primary">
                    {timeRange(booking, date)}
                  </p>

                  <span className="mt-3 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
                    Disetujui Admin
                  </span>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="h-6 w-1 rounded-full bg-secondary"
            />

            <h2 className="font-heading text-lg font-bold text-primary">
              Ketersediaan Ruangan
            </h2>
          </div>

          {ready && (
            <span
              role="status"
              className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-muted"
            >
              {filteredRooms.length} ruangan
            </span>
          )}
        </div>

        {!today || loading ? (
          <div
            role="status"
            className="rounded-lg border border-slate-200 bg-white p-12 text-center"
          >
            <div
              aria-hidden="true"
              className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-100 border-t-primary"
            />

            <p className="mt-4 text-sm text-muted">
              Memuat ketersediaan ruangan...
            </p>
          </div>
        ) : !validDate ? (
          <p className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-muted">
            Pilih tanggal yang valid untuk melihat jadwal.
          </p>
        ) : error ? (
          <p className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-muted">
            Data belum dapat dimuat. Silakan tekan Muat Ulang.
          </p>
        ) : !ready ? (
          <p role="status" className="text-sm text-muted">
            Menyiapkan jadwal...
          </p>
        ) : filteredRooms.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-10 text-center">
            <h3 className="text-sm font-bold text-primary">
              {hasFilter
                ? "Ruangan tidak ditemukan"
                : "Belum ada ruangan aktif"}
            </h3>

            <p className="mt-2 text-xs leading-6 text-muted">
              {hasFilter
                ? "Coba ubah kata kunci atau filter yang digunakan."
                : "Ruangan aktif yang ditambahkan Admin akan muncul di sini."}
            </p>

            {hasFilter && (
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
          <div className="grid gap-3 md:grid-cols-2">
            {filteredRooms.map(
              ({ room, schedules, status }) => {
                const info = statusConfig[status];

                return (
                  <article
                    key={room.id}
                    className="min-w-0 rounded-lg border border-slate-200/80 bg-white p-4 shadow-none shadow-slate-200/20 transition hover:border-secondary/40 sm:p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-[10px] font-bold text-primary">
                        {room.room_type === "kelas"
                          ? "Ruang Kelas"
                          : "Laboratorium"}
                      </span>

                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-semibold ${info.badge}`}
                      >
                        <span
                          aria-hidden="true"
                          className={`h-1.5 w-1.5 rounded-full ${info.dot}`}
                        />
                        {info.label}
                      </span>
                    </div>

                    <p className="mt-5 text-[10px] font-bold uppercase tracking-widest text-muted">
                      {room.room_code}
                    </p>

                    <h3 className="mt-2 break-words font-heading text-xl font-bold text-primary">
                      {room.room_name}
                    </h3>

                    <p className="mt-2 text-xs leading-7 text-muted">
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

                    <p className="mt-3 text-xs font-semibold text-primary">
                      Kapasitas {room.capacity} orang
                    </p>

                    <div className="mt-5 border-t border-slate-100 pt-5">
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="text-xs font-bold text-primary">
                          Jadwal Pemakaian
                        </h4>

                        <span className="text-[10px] text-muted">
                          {schedules.length} reservasi
                        </span>
                      </div>

                      {schedules.length === 0 ? (
                        <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-white p-4 text-center">
                          <CalendarIcon className="mx-auto h-6 w-6 text-slate-400" />

                          <p className="mt-3 text-xs font-semibold text-primary">
                            Belum ada reservasi
                          </p>

                          <p className="mt-2 text-[11px] leading-6 text-muted">
                            Tidak ada reservasi aktif pada
                            tanggal yang dipilih.
                          </p>
                        </div>
                      ) : (
                        <ul className="mt-3 space-y-2">
                          {schedules.map((item, index) => {
                            const booking = classBookings.find(
                              (candidate) =>
                                candidate.room_id === item.room_id &&
                                Date.parse(candidate.starts_at) ===
                                  Date.parse(item.starts_at) &&
                                Date.parse(candidate.ends_at) ===
                                  Date.parse(item.ends_at),
                            );

                            const active =
                              date === today &&
                              now !== null &&
                              now >= Date.parse(item.starts_at) &&
                              now < Date.parse(item.ends_at);

                            return (
                              <li
                                key={`${item.starts_at}-${item.ends_at}-${index}`}
                                className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3"
                              >
                                <span
                                  aria-hidden="true"
                                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                                    active
                                      ? "bg-red-500"
                                      : "bg-secondary"
                                  }`}
                                />

                                <div className="min-w-0 flex-1">
                                  <p className="break-words text-xs font-bold text-primary">
                                    {booking?.title ||
                                      `Pemakaian ${index + 1}`}
                                  </p>

                                  <p className="mt-2 text-xs tabular-nums text-muted">
                                    {timeRange(item, date)}
                                  </p>

                                  {(booking || active) && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {booking && (
                                        <span className="rounded-md bg-slate-100 px-2 py-1 text-[9px] font-semibold text-primary">
                                          Kelas Anda
                                        </span>
                                      )}

                                      {active && (
                                        <span className="rounded-md bg-red-50 px-2 py-1 text-[9px] font-semibold text-red-700">
                                          Sedang berlangsung
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>

                    <div className="mt-5 border-t border-slate-100 pt-4">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted">
                        Fasilitas
                      </h4>

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
                  </article>
                );
              },
            )}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200/80 bg-white p-4 sm:p-4">
        <h2 className="text-sm font-bold text-primary">
          Memahami Status Ruangan
        </h2>

        <ul className="mt-4 flex flex-wrap gap-4">
          {Object.entries(statusConfig).map(([key, info]) => (
            <li
              key={key}
              className="flex items-center gap-2 text-xs text-muted"
            >
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${info.dot}`}
              />
              {info.label}
            </li>
          ))}
        </ul>

        <p className="mt-4 text-xs leading-7 text-muted">
          Tersedia berarti tidak ada reservasi pada tanggal pilihan.
          Ada Jadwal berarti ruangan memiliki reservasi pada tanggal
          tersebut. Sedang Digunakan menunjukkan reservasi yang
          sedang berlangsung saat ini pada hari ini.
        </p>

        <p className="mt-3 text-xs leading-7 text-muted">
          Pengajuan pending belum dihitung sebagai pemakaian.
          Data dimuat ulang saat halaman dibuka, tanggal diubah,
          atau tombol Muat Ulang ditekan. Indikator waktu mengikuti
          jam perangkat dalam zona WIB.
        </p>
      </section>
    </div>
  );
}