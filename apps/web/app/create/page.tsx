import type { Metadata } from "next";
import Link from "next/link";
import { StoryMaker } from "../../components/StoryMaker";
import { TEMPLATE_IDS, type TemplateId } from "../../lib/story/types";
import styles from "../page.module.css";

export const metadata: Metadata = {
  title: "Create a Story — Tasteframe",
  description: "Upload a photo, add your taste, and get three editable Instagram Story layouts.",
};

/** The MVP, on its own route: upload → mood → taste → three Stories → edit → export. */
export default async function CreatePage({ searchParams }: { searchParams: Promise<{ layout?: string }> }) {
  const { layout } = await searchParams;
  const preset = (TEMPLATE_IDS as readonly string[]).includes(layout ?? "") ? (layout as TemplateId) : undefined;
  return (
    <div className={styles.page}>
      <header className={styles.masthead}>
        <Link href="/" className={styles.homeLink}>← Tasteframe</Link>
        <span className={styles.brand}>Story Studio</span>
        <Link href="/gallery">Layout gallery</Link>
      </header>
      <main className={styles.appMain}>
        <StoryMaker preset={preset} />
      </main>
    </div>
  );
}
