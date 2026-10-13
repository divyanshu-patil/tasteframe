import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminDashboard } from "../../components/AdminDashboard";
import styles from "../page.module.css";

export const metadata: Metadata = {
  title: "Admin — Tasteframe",
  robots: { index: false, follow: false },
};

/** Admin pages (/admin, /admin/users, each with ?days=). Access is enforced by the API and
 *  database (admins only); the client gate lives here so switching pages doesn't re-check it. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.page}>
      <header className={styles.masthead}>
        <Link href="/" className={styles.homeLink}>Back to the site</Link>
        <span className={styles.brand}>Tasteframe</span>
        <Link href="/gallery">Layout gallery</Link>
      </header>
      <main className={styles.appMain}>
        {/* ?days= is read on the client (useSearchParams), so it renders under Suspense. */}
        <Suspense fallback={<p>Loading…</p>}>
          <AdminDashboard>{children}</AdminDashboard>
        </Suspense>
      </main>
    </div>
  );
}
