"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { adminMe } from "../lib/api";
import { authConfigured, signOut, useAuth } from "../lib/auth";
import { LoginDialog } from "./LoginDialog";
import styles from "../app/page.module.css";

/** Navbar account links: Log in, or the signed-in email with Admin (admins only) and Log out. */
export function AccountNav() {
  const { user, ready } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [login, setLogin] = useState(false);
  useEffect(() => {
    setIsAdmin(false);
    if (user) adminMe().then(setIsAdmin, () => setIsAdmin(false));
  }, [user]);

  if (!authConfigured || !ready) return null;
  if (!user)
    return (
      <>
        <button type="button" className={styles.navBtn} onClick={() => setLogin(true)}>Log in</button>
        <LoginDialog open={login} reason="Log in to keep your Stories in one place." onDone={() => setLogin(false)} />
      </>
    );
  return (
    <>
      <span className={styles.account} title={user.email ?? ""}>{user.email}</span>
      {isAdmin && <Link href="/admin" className={styles.homeLink}>Admin</Link>}
      <button type="button" className={styles.navBtn} onClick={() => void signOut()}>Log out</button>
    </>
  );
}
