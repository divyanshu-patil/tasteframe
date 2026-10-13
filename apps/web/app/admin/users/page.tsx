import type { Metadata } from "next";
import { AdminUsers } from "../../../components/AdminDashboard";

export const metadata: Metadata = { title: "Users — Admin — Tasteframe" };

/** Accounts by activity, with role and suspension controls. */
export default function AdminUsersPage() {
  return <AdminUsers />;
}
