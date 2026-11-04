import { redirect } from "next/navigation";
import {
  getCurrentProfile,
  type AppRole,
} from "@/lib/auth/get-current-profile";

export async function requireRole(role: AppRole) {
  const result = await getCurrentProfile();

  if (!result) {
    redirect("/login");
  }

  if (result.profile.role !== role) {
    redirect("/");
  }

  return result.profile;
}