"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/errors";

type UserRole = "mahasiswa" | "komting" | "admin";

type UserProfile = {
  id: string;
  full_name: string;
  email: string | null;
  student_number: string | null;
  role: UserRole;
  class_id: string | null;
  is_active: boolean;
  created_at: string;
};

type ClassInfo = {
  id: string;
  class_code: string;
  class_name: string;
};

type RegistrationInfo = {
  user_id: string;
  requested_role: "mahasiswa" | "komting";
  class_id: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

type AccountStatus = "active" | "inactive" | "pending" | "rejected";
type RoleFilter = "all" | UserRole;
type StatusFilter = "all" | AccountStatus;

const roleLabel: Record<UserRole, string> = {
  admin: "Admin",
  komting: "Komting",
  mahasiswa: "Mahasiswa",
};

const statusConfig: Record<
  AccountStatus,
  { label: string; style: string }
> = {
  active: {
    label: "Aktif",
    style: "bg-emerald-50 text-emerald-700",
  },
  inactive: {
    label: "Nonaktif",
    style: "bg-slate-100 text-slate-600",
  },
  pending: {
    label: "Menunggu Persetujuan",
    style: "bg-amber-50 text-amber-700",
  },
  rejected: {
    label: "Pendaftaran Ditolak",
    style: "bg-rose-50 text-rose-700",
  },
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

export default function UserManagement() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [registrations, setRegistrations] = useState<RegistrationInfo[]>([]);

  const [currentUserId, setCurrentUserId] = useState("");

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [classFilter, setClassFilter] = useState("all");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadUsers = useCallback((signal?: AbortSignal) => {
    const request = async () => {
      const supabase = createClient();

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (signal?.aborted) return;
      if (authError) throw authError;
      if (!user) throw new Error("Sesi Admin tidak ditemukan.");

      setCurrentUserId(user.id);

      const [
        { data: profileData, error: profileError },
        { data: registrationData, error: registrationError },
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "id, full_name, email, student_number, role, class_id, is_active, created_at"
          )
          .order("created_at", { ascending: false }),

        supabase
          .from("registration_requests")
          .select("user_id, requested_role, class_id, status, created_at")
          .order("created_at", { ascending: false }),
      ]);

      if (signal?.aborted) return;
      if (profileError) throw profileError;
      if (registrationError) throw registrationError;

      const profileRows = (profileData ?? []) as UserProfile[];
      const registrationRows = (registrationData ?? []) as RegistrationInfo[];

      const classIds = [
        ...new Set([
          ...profileRows.map((item) => item.class_id),
          ...registrationRows.map((item) => item.class_id),
        ].filter((id): id is string => Boolean(id))),
      ];

      let classRows: ClassInfo[] = [];

      if (classIds.length > 0) {
        const { data: classData, error: classError } = await supabase
          .from("classes")
          .select("id, class_code, class_name")
          .in("id", classIds);

        if (signal?.aborted) return;
        if (classError) throw classError;

        classRows = (classData ?? []) as ClassInfo[];
      }

      setUsers(profileRows);
      setRegistrations(registrationRows);
      setClasses(classRows);
    };

    return request().catch((err: unknown) => {
      if (!signal?.aborted) {
        console.error("Load admin users:", err);
        setError(getErrorMessage(err, "Gagal mengambil data pengguna."));
      }
    }).finally(() => {
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadUsers(controller.signal);
    return () => controller.abort();
  }, [loadUsers]);

  async function refreshUsers() {
    setRefreshing(true);
    setError("");
    await loadUsers();
  }

  // Ambil permohonan pendaftaran paling baru dari setiap pengguna.
  const registrationMap = useMemo(() => {
    const map = new Map<string, RegistrationInfo>();

    for (const registration of registrations) {
      if (!map.has(registration.user_id)) {
        map.set(registration.user_id, registration);
      }
    }

    return map;
  }, [registrations]);

  const classMap = useMemo(
    () => new Map(classes.map((item) => [item.id, item])),
    [classes]
  );

  const getDisplayedRole = useCallback((profile: UserProfile): UserRole => {
    const registration = registrationMap.get(profile.id);

    if (
      !profile.is_active &&
      !profile.class_id &&
      registration &&
      registration.status !== "approved"
    ) {
      return registration.requested_role;
    }

    return profile.role;
  }, [registrationMap]);

  const getAccountStatus = useCallback((profile: UserProfile): AccountStatus => {
    if (profile.is_active) return "active";

    const registration = registrationMap.get(profile.id);

    if (registration?.status === "pending") return "pending";

    if (
      registration?.status === "rejected" &&
      !profile.class_id
    ) {
      return "rejected";
    }

    return "inactive";
  }, [registrationMap]);

  const getEffectiveClassId = useCallback((profile: UserProfile) => {
    return (
      profile.class_id ??
      registrationMap.get(profile.id)?.class_id ??
      null
    );
  }, [registrationMap]);

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return users.filter((profile) => {
      const role = getDisplayedRole(profile);
      const status = getAccountStatus(profile);
      const assignedClass = classMap.get(getEffectiveClassId(profile) ?? "");

      const matchesRole =
        roleFilter === "all" || role === roleFilter;

      const matchesStatus =
        statusFilter === "all" || status === statusFilter;

      const matchesClass =
        classFilter === "all" ||
        getEffectiveClassId(profile) === classFilter;

      const searchable = [
        profile.full_name,
        profile.email,
        profile.student_number,
        roleLabel[role],
        assignedClass?.class_code,
        assignedClass?.class_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        matchesRole &&
        matchesStatus &&
        matchesClass &&
        (!keyword || searchable.includes(keyword))
      );
    });
  }, [
    users,
    search,
    roleFilter,
    statusFilter,
    classFilter,
    getDisplayedRole,
    getAccountStatus,
    getEffectiveClassId,
    classMap,
  ]);

  const statistics = useMemo(() => ({
    total: users.length,
    active: users.filter((user) => user.is_active).length,
    inactive: users.filter(
      (user) => getAccountStatus(user) === "inactive"
    ).length,
    pending: users.filter(
      (user) => getAccountStatus(user) === "pending"
    ).length,
  }), [users, getAccountStatus]);

  function canManageUser(profile: UserProfile) {
    const status = getAccountStatus(profile);
    const role = getDisplayedRole(profile);

    if (profile.id === currentUserId) return false;
    if (status === "pending" || status === "rejected") return false;

    // Mahasiswa dan Komting harus memiliki kelas yang ditetapkan.
    if (role !== "admin" && !profile.class_id) return false;

    return true;
  }

  async function toggleUserStatus(profile: UserProfile) {
    const nextStatus = !profile.is_active;
    const action = nextStatus ? "mengaktifkan" : "menonaktifkan";

    const confirmed = window.confirm(
      `Yakin ingin ${action} akun ${profile.full_name}?`
    );

    if (!confirmed) return;

    setBusyId(profile.id);
    setError("");
    setSuccess("");

    try {
      const supabase = createClient();

      const { error: rpcError } = await supabase.rpc(
        "admin_set_user_active",
        {
          p_user_id: profile.id,
          p_is_active: nextStatus,
        }
      );

      if (rpcError) throw rpcError;

      setSuccess(
        `Akun ${profile.full_name} berhasil ${
          nextStatus ? "diaktifkan" : "dinonaktifkan"
        }.`
      );

      await refreshUsers();
    } catch (err) {
      console.error("Update user status:", err);

      setError(
        getErrorMessage(err, "Gagal mengubah status pengguna.")
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-slate-500">
            Administrasi Sistem
          </p>

          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            Manajemen Pengguna
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Kelola akun Mahasiswa, Komting, dan Admin.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void refreshUsers()}
          disabled={loading || refreshing}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {refreshing ? "Memuat..." : "Muat Ulang"}
        </button>
      </section>

      {/* Notifications */}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {success && (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700"
        >
          {success}
        </div>
      )}

      {/* Summary */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Total Akun</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {loading ? "-" : statistics.total}
          </p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-white p-5">
          <p className="text-sm text-slate-500">Akun Aktif</p>
          <p className="mt-2 text-3xl font-bold text-emerald-700">
            {loading ? "-" : statistics.active}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Akun Nonaktif</p>
          <p className="mt-2 text-3xl font-bold text-slate-700">
            {loading ? "-" : statistics.inactive}
          </p>
        </div>

        <div className="rounded-xl border border-amber-200 bg-white p-5">
          <p className="text-sm text-slate-500">Menunggu Pendaftaran</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">
            {loading ? "-" : statistics.pending}
          </p>
        </div>
      </section>

      {/* Filters */}
      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <div>
          <label
            htmlFor="user-search"
            className="mb-2 block text-sm font-semibold text-slate-700"
          >
            Cari Pengguna
          </label>

          <input
            id="user-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nama, NIM, email, atau kelas..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500 focus:bg-white"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label
              htmlFor="role-filter"
              className="mb-2 block text-sm font-semibold text-slate-700"
            >
              Role
            </label>

            <select
              id="role-filter"
              value={roleFilter}
              onChange={(event) =>
                setRoleFilter(event.target.value as RoleFilter)
              }
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-500"
            >
              <option value="all">Semua Role</option>
              <option value="mahasiswa">Mahasiswa</option>
              <option value="komting">Komting</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="status-filter"
              className="mb-2 block text-sm font-semibold text-slate-700"
            >
              Status Akun
            </label>

            <select
              id="status-filter"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as StatusFilter)
              }
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-500"
            >
              <option value="all">Semua Status</option>
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
              <option value="pending">Menunggu Persetujuan</option>
              <option value="rejected">Pendaftaran Ditolak</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="class-filter"
              className="mb-2 block text-sm font-semibold text-slate-700"
            >
              Kelas
            </label>

            <select
              id="class-filter"
              value={classFilter}
              onChange={(event) => setClassFilter(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-500"
            >
              <option value="all">Semua Kelas</option>
              {classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.class_code} - {item.class_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          <p className="text-xs text-slate-500">
            Menampilkan {filteredUsers.length} dari {users.length} akun
          </p>

          <button
            type="button"
            onClick={() => {
              setSearch("");
              setRoleFilter("all");
              setStatusFilter("all");
              setClassFilter("all");
            }}
            className="text-xs font-semibold text-blue-700 hover:underline"
          >
            Reset Filter
          </button>
        </div>
      </section>

      {/* User list */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-5">
          <h2 className="font-semibold text-slate-900">
            Daftar Pengguna
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Riwayat akun terdaftar dalam sistem SIRAKA.
          </p>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500">
            Memuat data pengguna...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center">
            <p className="font-semibold text-slate-800">
              Pengguna tidak ditemukan.
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Coba ubah kata kunci atau filter.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredUsers.map((profile) => {
              const role = getDisplayedRole(profile);
              const accountStatus = getAccountStatus(profile);
              const registration = registrationMap.get(profile.id);
              const assignedClass = classMap.get(
                getEffectiveClassId(profile) ?? ""
              );
              const status = statusConfig[accountStatus];
              const manageable = canManageUser(profile);

              return (
                <article
                  key={profile.id}
                  className="space-y-4 p-5"
                >
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-700">
                        {profile.full_name.charAt(0).toUpperCase()}
                      </div>

                      <div className="min-w-0">
                        <h3 className="font-semibold text-slate-900">
                          {profile.full_name}
                        </h3>

                        <p className="mt-0.5 break-all text-sm text-slate-500">
                          {profile.email ?? "Email tidak tersedia"}
                        </p>

                        {profile.student_number && (
                          <p className="mt-1 text-xs text-slate-500">
                            NIM: {profile.student_number}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                        {roleLabel[role]}
                      </span>

                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status.style}`}>
                        {status.label}
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-slate-400">
                        Kelas
                      </p>
                      <p className="mt-1 text-sm font-medium text-slate-800">
                        {assignedClass
                          ? `${assignedClass.class_code} - ${assignedClass.class_name}`
                          : role === "admin"
                            ? "Administrator"
                            : "Belum ditetapkan"}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-400">
                        Terdaftar
                      </p>
                      <p className="mt-1 text-sm font-medium text-slate-800">
                        {formatDate(profile.created_at)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-400">
                        Status pendaftaran
                      </p>
                      <p className="mt-1 text-sm font-medium text-slate-800">
                        {registration
                          ? registration.status === "approved"
                            ? "Disetujui"
                            : registration.status === "rejected"
                              ? "Ditolak"
                              : "Menunggu persetujuan"
                          : "Tidak ada permohonan"}
                      </p>
                    </div>
                  </div>

                  {accountStatus === "pending" && (
                    <div className="flex flex-col gap-2 rounded-lg border border-amber-100 bg-amber-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs leading-5 text-amber-800">
                        {registration?.requested_role === "komting"
                          ? "Pendaftaran Komting perlu diproses melalui Persetujuan Komting."
                          : "Pendaftaran Mahasiswa menunggu persetujuan Komting kelas."}
                      </p>

                      {registration?.requested_role === "komting" && (
                        <Link
                          href="/dashboard/admin/registrations"
                          className="shrink-0 text-xs font-semibold text-amber-900 underline"
                        >
                          Buka Persetujuan Komting
                        </Link>
                      )}
                    </div>
                  )}

                  {profile.id === currentUserId && (
                    <p className="text-xs text-slate-400">
                      Ini adalah akun Admin yang sedang kamu gunakan.
                    </p>
                  )}

                  <div className="flex justify-end border-t border-slate-100 pt-3">
                    {manageable ? (
                      <button
                        type="button"
                        onClick={() => void toggleUserStatus(profile)}
                        disabled={busyId !== null}
                        className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${
                          profile.is_active
                            ? "border border-rose-200 text-rose-700 hover:bg-rose-50"
                            : "bg-slate-900 text-white hover:bg-slate-700"
                        }`}
                      >
                        {busyId === profile.id
                          ? "Memproses..."
                          : profile.is_active
                            ? "Nonaktifkan Akun"
                            : "Aktifkan Akun"}
                      </button>
                    ) : accountStatus === "pending" ||
                      accountStatus === "rejected" ? (
                      <span className="text-xs text-slate-400">
                        Gunakan alur persetujuan pendaftaran.
                      </span>
                    ) : profile.id === currentUserId ? null : (
                      <span className="text-xs text-slate-400">
                        Kelas akun belum ditetapkan.
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <p className="text-xs leading-relaxed text-slate-400">
        Penonaktifan akun tidak menghapus profil, riwayat booking,
        maupun pengajuan. Pengguna yang dinonaktifkan tidak dapat
        menggunakan fitur yang membutuhkan akun aktif. Perubahan
        role dan kelas tetap dilakukan melalui alur persetujuan yang
        sudah ditetapkan.
      </p>
    </div>
  );
}