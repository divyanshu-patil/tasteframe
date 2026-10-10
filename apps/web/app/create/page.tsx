import type { Metadata } from "next";
import Link from "next/link";
import { StoryMaker } from "../../components/StoryMaker";
import styles from "../page.module.css";

export const metadata: Metadata = {
  title: "Create a Story — Tasteframe",
  description: "Upload a photo, add your taste, and get three editable Instagram Story layouts.",
};

/** The MVP, on its own route: upload → mood → taste → three Stories → edit → export. */
export default function CreatePage() {
  return (
    <div className={styles.page}>
      <header className={styles.masthead}>
        <Link href="/" className={styles.homeLink}>← Tasteframe</Link>
        <span className={styles.brand}>Story Studio</span>
        <span>1080 × 1920 · PNG</span>
      </header>
      <main className={styles.appMain}>
        <StoryMaker />
      </main>
    </div>
  );
}
