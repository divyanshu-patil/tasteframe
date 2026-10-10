"use client";

import { useEffect, useRef, useState } from "react";
import { type PinPreview, previewPin, requestLayout } from "../lib/api";
import { device, externalReferrer, visitorId } from "../lib/analytics";
import s from "./maker.module.css";

const LOOKS_LIKE_PIN = /(pinterest\.[a-z.]+\/pin\/|pin\.it\/)/i;

/** Navbar button + dialog: paste a Pinterest pin, see it instantly, ask for it as a layout. */
export function RequestLayout() {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [email, setEmail] = useState("");
  const [preview, setPreview] = useState<{ kind: "idle" | "loading" } | { kind: "error"; msg: string } | { kind: "ok"; pin: PinPreview }>({ kind: "idle" });
  const [send, setSend] = useState<{ kind: "idle" | "busy" | "sent" } | { kind: "error"; msg: string }>({ kind: "idle" });

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // Instant preview: debounce typing/pasting, cancel stale lookups.
  useEffect(() => {
    const value = url.trim();
    if (!value) return setPreview({ kind: "idle" });
    if (!LOOKS_LIKE_PIN.test(value)) return setPreview({ kind: "error", msg: "Paste a Pinterest pin link, like pinterest.com/pin/… or pin.it/…" });
    const ctrl = new AbortController();
    setPreview({ kind: "loading" });
    const t = setTimeout(() => {
      previewPin(value, ctrl.signal)
        .then((pin) => setPreview({ kind: "ok", pin }))
        .catch((e) => (e as Error).name !== "AbortError" && setPreview({ kind: "error", msg: e instanceof Error ? e.message : "Couldn't load that pin." }));
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [url]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (preview.kind !== "ok") return;
    setSend({ kind: "busy" });
    try {
      await requestLayout({ pin_url: preview.pin.pin_url, note: note.trim() || undefined, email: email.trim() || undefined, visitor: visitorId(), referrer: externalReferrer(), device: device() });
      setSend({ kind: "sent" });
    } catch (err) {
      setSend({ kind: "error", msg: err instanceof Error ? err.message : "Couldn't send the request." });
    }
  };
  const reset = () => {
    setUrl("");
    setNote("");
    setEmail("");
    setSend({ kind: "idle" });
  };

  return (
    <>
      <button type="button" className={s.navButton} onClick={() => setOpen(true)}>
        Request a layout
      </button>
      <dialog ref={ref} className={`${s.dialog} ${s.requestDialog}`} onClose={() => setOpen(false)} aria-labelledby="req-title">
        <form className={s.dialogBody} onSubmit={submit} method="dialog">
          <div className={s.row}>
            <h2 id="req-title" className={s.dialogTitle}>Request a layout</h2>
            <button type="button" className={s.linkBtn} onClick={() => setOpen(false)}>Close</button>
          </div>
          {send.kind === "sent" ? (
            <>
              <p>Thanks! Your pin is in the queue. {email ? "We'll email you when the layout is live." : "Check the gallery soon."}</p>
              <div className={s.row}>
                <button type="button" className={s.primary} onClick={reset}>Request another</button>
                <a className={s.linkBtn} href="/gallery">Browse the gallery</a>
              </div>
            </>
          ) : (
            <>
              <p className={s.small}>Paste a Pinterest pin you&apos;d love as a Story layout. We&apos;ll review it and build the good ones.</p>
              <label className={s.field}>
                <span>Pinterest link</span>
                <input className={s.input} type="url" inputMode="url" autoComplete="off" required placeholder="https://pinterest.com/pin/…" value={url} onChange={(e) => setUrl(e.target.value)} />
              </label>
              <div className={s.pinPreview} aria-live="polite">
                {preview.kind === "loading" && <p className={s.small}>Looking up the pin…</p>}
                {preview.kind === "error" && <p className={s.error}>{preview.msg}</p>}
                {preview.kind === "ok" && (
                  <figure>
                    {/* eslint-disable-next-line @next/next/no-img-element -- Pinterest's own thumbnail */}
                    <img src={preview.pin.thumbnail_url} alt="Pin preview" width={preview.pin.width} height={preview.pin.height} />
                    <figcaption className={s.small}>
                      {preview.pin.author ? <>Pin by {preview.pin.author}. </> : null}
                      <a href={preview.pin.pin_url} target="_blank" rel="noopener noreferrer">Open on Pinterest</a>
                    </figcaption>
                  </figure>
                )}
              </div>
              <label className={s.field}>
                <span>What do you like about it? (optional)</span>
                <textarea className={s.input} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
              <label className={s.field}>
                <span>Email, to hear when it&apos;s live (optional)</span>
                <input className={s.input} type="email" autoComplete="email" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              {send.kind === "error" && <p role="alert" className={s.error}>{send.msg}</p>}
              <button type="submit" className={s.primary} disabled={preview.kind !== "ok" || send.kind === "busy"}>
                {send.kind === "busy" ? "Sending…" : "Send request"}
              </button>
            </>
          )}
        </form>
      </dialog>
    </>
  );
}
