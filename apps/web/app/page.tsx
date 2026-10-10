import { HeroExample } from "../components/HeroExample";
import { StoryMaker } from "../components/StoryMaker";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <header className={styles.masthead}>
        <span>Vol. 01 — Story Studio</span>
        <span className={styles.brand}>Tasteframe</span>
        <span>Powered by Qloo taste data</span>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroText}>
          <p className={styles.kicker}>One photo. Three Stories. Your taste.</p>
          <h1 className={styles.headline}>
            Stories that look like <em>you</em>.
          </h1>
          <p className={styles.lede}>
            Upload a photo, name a few favourite artists or films, and get three Instagram Story
            layouts shaped by your photo&apos;s light and colour and by real cultural recommendations
            from Qloo — plus a song to pair with it. Edit, then download a 1080 × 1920 PNG.
          </p>
        </div>
        <HeroExample />
      </section>

      <div className={styles.banner} aria-hidden>
        Make a Story
      </div>

      <main className={styles.main}>
        <StoryMaker />
      </main>

      <footer className={styles.footer}>
        <p>
          How it works: your photo&apos;s palette, light and framing are measured on our server
          (no face or identity analysis). Qloo supplies cultural recommendations from the favourites
          you confirm. Layouts are drawn in your browser from a fixed template set.
        </p>
        <p>
          Privacy: uploads are private, stripped of EXIF/GPS, deleted when you start over and
          expire automatically. Nothing is posted anywhere for you.
        </p>
      </footer>
    </div>
  );
}
