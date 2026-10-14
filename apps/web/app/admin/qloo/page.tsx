import type { Metadata } from "next";
import { AdminQloo } from "../../../components/AdminDashboard";

export const metadata: Metadata = { title: "Qloo — Admin — Tasteframe" };

/** Qloo on/off for everyone, credits left this month and calls per day. */
export default function AdminQlooPage() {
  return <AdminQloo />;
}
