"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { adminMe } from "../lib/api";
import { authConfigured, signOut, useAuth } from "../lib/auth";
import { LoginDialog } from "./LoginDialog";
import styles from "../app/page.module.css";

/** Navbar account control: "Log in" when signed out; a profile dropdown (email, Admin dashboard
 *  for admins, Log out) when signed in. */
export function AccountNav() {
  const { user, ready } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [login, setLogin] = useState(false);
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    setIsAdmin(false);
    if (user) adminMe().then(setIsAdmin, () => setIsAdmin(false));
  }, [user]);
  // Close the dropdown on an outside click or Escape.
  useEffect(() => {
    const close = (e: Event) => {
      const d = menu.current;
      if (!d?.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !d.contains(e.target as Node)) d.open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  if (!authConfigured || !ready) return null;
  if (!user)
    return (
      <>
        <button type="button" className={styles.navBtn} onClick={() => setLogin(true)}>Log in</button>
        <LoginDialog open={login} reason="Log in to keep your Stories in one place." onDone={() => setLogin(false)} />
      </>
    );
  const email = user.email ?? "Account";
  return (
    <details ref={menu} className={styles.profile}>
      <summary aria-label={`Account menu for ${email}`}>
        <span className={styles.avatar} aria-hidden>{email.slice(0, 1).toUpperCase()}</span>
        <span className={styles.caret} aria-hidden>▾</span>
      </summary>
      <div className={styles.menu} role="menu">
        <p className={styles.menuEmail} title={email}>Signed in as<br /><strong>{email}</strong></p>
        {isAdmin && (
          <Link href="/admin" role="menuitem" className={styles.menuItem}>Admin dashboard</Link>
        )}
        <button type="button" role="menuitem" className={styles.menuItem} onClick={() => void signOut()}>Log out</button>
      </div>
    </details>
  );
}
