// The Pinterest pin a layout was modelled on: Pinterest's own thumbnail (oEmbed), linked to
// the pin, with the creator credited. Nothing is copied or re-hosted.
import { type Pin, pinUrl } from "../lib/story/pins";
import s from "./maker.module.css";

export function PinSource({ pin, more, moreHref }: { pin: Pin; more?: number; moreHref?: string }) {
  return (
    <figure className={s.pinCard}>
      <a href={pinUrl(pin)} target="_blank" rel="noopener noreferrer" aria-label={`Open the original pin by ${pin.author || "its creator"} on Pinterest`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Pinterest's oEmbed thumbnail, linked to the pin */}
        <img src={pin.thumb} alt="Original Pinterest reference" loading="lazy" width={pin.w} height={pin.h} />
      </a>
      <figcaption>
        <span className={s.pinLogo} aria-hidden>P</span>
        <span>
          Original pin by{" "}
          <a href={pin.authorUrl || pinUrl(pin)} target="_blank" rel="noopener noreferrer">{pin.author || "a Pinterest creator"}</a>.{" "}
          <a href={pinUrl(pin)} target="_blank" rel="noopener noreferrer">View on Pinterest</a>
          {more ? <> · <a href={moreHref}>{more} more</a></> : null}
        </span>
      </figcaption>
    </figure>
  );
}
