import type { Metadata } from "next";
import Link from "next/link";
import { AdminDashboard } from "../../components/AdminDashboard";
import styles from "../page.module.css";

export const metadata: Metadata = {
  title: "Admin — Tasteframe",
  robots: { index: false, follow: false },
};

/** Analytics + layout-request queue. Access is enforced by the API and database (admins only). */
export default function AdminPage() {
  return (
    <div className={styles.page}>
      <header className={styles.masthead}>
        <Link href="/" className={styles.homeLink}>Back to the site</Link>
        <span className={styles.brand}>Tasteframe</span>
        <Link href="/gallery">Layout gallery</Link>
      </header>
      <main className={styles.appMain}>
        <AdminDashboard />
      </main>
    </div>
  );
}
