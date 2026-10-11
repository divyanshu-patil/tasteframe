import type { Metadata } from "next";
import Link from "next/link";
import { AccountNav } from "../../components/AccountNav";
import { Gallery } from "../../components/Gallery";
import { TEMPLATE_IDS, type TemplateId } from "../../lib/story/types";
import styles from "../page.module.css";

export const metadata: Metadata = {
  title: "Layout gallery — Tasteframe",
  description: "Every Story layout and the Pinterest pin it was modelled on. Pick one and drop your photo in.",
};

/** All layouts + their Pinterest references; picking one opens the studio with it. */
export default async function GalleryPage({ searchParams }: { searchParams: Promise<{ layout?: string }> }) {
  const { layout } = await searchParams;
  const focus = (TEMPLATE_IDS as readonly string[]).includes(layout ?? "") ? (layout as TemplateId) : undefined;
  return (
    <div className={styles.page}>
      <header className={styles.masthead}>
        <Link href="/" className={styles.homeLink}>Tasteframe</Link>
        <span className={styles.brand}>Layout gallery</span>
        <nav className={styles.nav} aria-label="Main">
          <Link href="/create" className={styles.homeLink}>Open the studio</Link>
          <AccountNav />
        </nav>
      </header>
      <main className={styles.appMain}>
        <Gallery focus={focus} />
      </main>
    </div>
  );
}
