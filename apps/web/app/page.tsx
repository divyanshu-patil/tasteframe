import Link from "next/link";
import { BackendStatus } from "../components/BackendStatus";
import { HeroExample } from "../components/HeroExample";
import { RequestLayout } from "../components/RequestLayout";
import styles from "./page.module.css";

const STEPS = [
  { no: "01", title: "Your photo", body: "We read its palette, light and framing on our server — no face or identity analysis." },
  { no: "02", title: "Your taste", body: "Name a few favourite artists, films or brands. Qloo finds related culture that fits you." },
  { no: "03", title: "Three Stories", body: "Distinct layouts ranked for your photo and taste, plus a song to pair. Edit, then download." },
];

export default function Home() {
  return (
    <div className={styles.page}>
      <header className={styles.masthead}>
        <span>Vol. 01 — Story Studio</span>
        <span className={styles.brand}>Tasteframe</span>
        <nav className={styles.nav} aria-label="Main">
          <BackendStatus />
          <RequestLayout />
          <Link href="/gallery" className={styles.homeLink}>Gallery</Link>
          <Link href="/create" className={styles.homeLink}>Open the studio</Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroText}>
          <p className={styles.kicker}>One photo. Three Stories. Your taste.</p>
          <h1 className={styles.headline}>
            Stories that look like <em>you</em>.
          </h1>
          <p className={styles.lede}>
            Upload a photo, name a few favourite artists or films, and get three Instagram Story
            layouts shaped by your photo&apos;s light and colour and by real cultural
            recommendations from Qloo — plus a song to pair with it. Edit, then download a
            1080 × 1920 PNG.
          </p>
          <div className={styles.ctaRow}>
            <Link href="/create" className={styles.cta}>Start creating</Link>
            <Link href="/gallery" className={styles.homeLink}>Browse the layout gallery</Link>
            <span className={styles.ctaNote}>No account needed to create or download.</span>
          </div>
        </div>
        <HeroExample />
      </section>

      <Link href="/create" className={styles.banner}>
        Make a Story →
      </Link>

      <section className={styles.steps} aria-label="How it works">
        {STEPS.map((step) => (
          <article key={step.no}>
            <p className={styles.stepNo}>{step.no}</p>
            <h2 className={styles.stepTitle}>{step.title}</h2>
            <p>{step.body}</p>
          </article>
        ))}
      </section>

      <footer className={styles.footer}>
        <p>
          How it works: your photo&apos;s palette, light and framing are measured on our server (no
          face or identity analysis). Qloo supplies cultural recommendations from the favourites you
          confirm. Layouts are drawn in your browser from a fixed template set.
        </p>
        <p>
          Privacy: uploads are private, stripped of EXIF/GPS, deleted when you start over and
          expire automatically. Log in only if you want to save Stories to your account. Nothing
          is posted anywhere for you.
        </p>
      </footer>
    </div>
  );
}
