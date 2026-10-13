"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { type AdminStats, type AdminUser, type LayoutRequest, type RequestStatus, adminMe, adminRequests, adminStats, adminUsers, updateRequest, updateUser } from "../lib/api";
import { authConfigured, signOut, useAuth } from "../lib/auth";
import { TEMPLATES } from "../lib/story/templates";
import { LoginDialog } from "./LoginDialog";
import s from "./admin.module.css";

const RANGES = [7, 30, 90] as const;
const TABS: { id: RequestStatus | "all"; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "accepted", label: "Accepted" },
  { id: "done", label: "Done" },
  { id: "rejected", label: "Rejected" },
  { id: "all", label: "All" },
];
const fmt = new Intl.NumberFormat("en");
const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const layoutName = (id: string) => (id in TEMPLATES ? TEMPLATES[id as keyof typeof TEMPLATES].name : id);
const VIEWS = [
  { path: "/admin", label: "Overview" },
  { path: "/admin/users", label: "Users" },
] as const;

/** This page's URL with `set` merged into its query (other params, like ?days=, are kept). */
function useHref(): (set: Record<string, string>) => string {
  const path = usePathname();
  const q = useSearchParams();
  return (set) => `${path}?${new URLSearchParams({ ...Object.fromEntries(q), ...set })}`;
}

/** `?days=7|30|90` (default 30), shared by every admin page. */
function useDays(): (typeof RANGES)[number] {
  const d = Number(useSearchParams().get("days"));
  return RANGES.find((r) => r === d) ?? 30;
}

/** Admin gate + nav around the admin pages (it lives in the layout, so access is checked once). */
export function AdminDashboard({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const [login, setLogin] = useState(false);
  const [role, setRole] = useState<"checking" | "admin" | "denied" | { error: string }>("checking");

  useEffect(() => {
    if (!user) return;
    setRole("checking");
    adminMe()
      .then((ok) => setRole(ok ? "admin" : "denied"))
      .catch((e) => setRole({ error: e instanceof Error ? e.message : "Couldn't check your access." }));
  }, [user]);

  if (!authConfigured) return <p className={s.note}>Accounts aren&apos;t configured on this deployment, so there&apos;s no admin area.</p>;
  if (!ready) return <p className={s.note}>Loading…</p>;
  if (!user)
    return (
      <div className={s.gate}>
        <h1 className={s.title}>Admin</h1>
        <p>Sign in with an admin account to see analytics and layout requests.</p>
        <button className={s.primary} onClick={() => setLogin(true)}>Sign in</button>
        <LoginDialog open={login} reason="Sign in to the admin dashboard" onDone={() => setLogin(false)} />
      </div>
    );
  if (role === "checking") return <p className={s.note}>Checking access…</p>;
  if (role === "denied")
    return (
      <div className={s.gate}>
        <h1 className={s.title}>Admin</h1>
        <p>{user.email} isn&apos;t an admin account.</p>
        <button className={s.secondary} onClick={() => void signOut()}>Sign out</button>
      </div>
    );
  if (typeof role === "object") return <p className={s.error}>{role.error}</p>;
  return (
    <div className={s.dash}>
      <AdminNav email={user.email ?? ""} />
      {children}
    </div>
  );
}

/** Pages and date range are links: /admin, /admin/users, each with ?days=. */
function AdminNav({ email }: { email: string }) {
  const path = usePathname();
  const days = useDays();
  const href = useHref();
  return (
    <header className={s.head}>
      <h1 className={s.title}>Admin</h1>
      <div className={s.headTools}>
        <nav className={s.segment} aria-label="Admin pages">
          {VIEWS.map((v) => (
            <Link key={v.path} href={`${v.path}?days=${days}`} aria-current={path === v.path ? "page" : undefined} className={path === v.path ? s.segOn : ""}>
              {v.label}
            </Link>
          ))}
        </nav>
        <nav className={s.segment} aria-label="Date range">
          {RANGES.map((d) => (
            <Link key={d} href={href({ days: String(d) })} aria-current={days === d ? "true" : undefined} className={days === d ? s.segOn : ""}>
              {d} days
            </Link>
          ))}
        </nav>
        <span className={s.muted}>{email}</span>
        <button className={s.linkBtn} onClick={() => void signOut()}>Sign out</button>
      </div>
    </header>
  );
}

/** /admin: traffic, layouts and the layout-request queue. */
export function AdminOverview() {
  const days = useDays();
  const href = useHref();
  const status = useSearchParams().get("status");
  const tab = TABS.find((t) => t.id === status)?.id ?? "pending"; // ?status=, default pending
  const [stats, setStats] = useState<AdminStats | { error: string } | null>(null);
  const [rows, setRows] = useState<LayoutRequest[] | { error: string } | null>(null);
  const [open, setOpen] = useState<LayoutRequest | null>(null);

  const loadStats = useCallback(() => {
    setStats(null);
    adminStats(days).then(setStats).catch((e) => setStats({ error: e instanceof Error ? e.message : "Couldn't load analytics." }));
  }, [days]);
  const loadRows = useCallback(() => {
    setRows(null);
    adminRequests(tab === "all" ? undefined : tab).then(setRows).catch((e) => setRows({ error: e instanceof Error ? e.message : "Couldn't load requests." }));
  }, [tab]);
  useEffect(loadStats, [loadStats]);
  useEffect(loadRows, [loadRows]);

  const onUpdated = (r: LayoutRequest) => {
    setOpen(r);
    setRows((cur) => (Array.isArray(cur) ? (tab === "all" || r.status === tab ? cur.map((x) => (x.id === r.id ? r : x)) : cur.filter((x) => x.id !== r.id)) : cur));
    loadStats();
  };

  return (
    <>
      {stats === null && <p className={s.note}>Loading analytics…</p>}
      {stats && "error" in stats && (
        <p className={s.error}>
          {stats.error} <button className={s.linkBtn} onClick={loadStats}>Try again</button>
        </p>
      )}
      {stats && !("error" in stats) && <Overview stats={stats} days={days} />}

      <section className={s.queue} aria-labelledby="queue-title">
        <div className={s.queueHead}>
          <h2 id="queue-title">Layout requests</h2>
          <nav className={s.tabs} aria-label="Request status">
            {TABS.map((t) => (
              <Link key={t.id} href={href({ status: t.id })} scroll={false} aria-current={tab === t.id ? "page" : undefined} className={tab === t.id ? s.tabOn : ""}>
                {t.label}
                {stats && !("error" in stats) && t.id !== "all" && <span className={s.count}>{stats.requests[t.id] ?? 0}</span>}
              </Link>
            ))}
          </nav>
        </div>
        {rows === null && <p className={s.note}>Loading requests…</p>}
        {rows && "error" in rows && (
          <p className={s.error}>
            {rows.error} <button className={s.linkBtn} onClick={loadRows}>Try again</button>
          </p>
        )}
        {Array.isArray(rows) && rows.length === 0 && <p className={s.note}>No {tab === "all" ? "" : `${tab} `}requests yet.</p>}
        {Array.isArray(rows) && rows.length > 0 && (
          <ul className={s.reqList}>
            {rows.map((r) => (
              <li key={r.id}>
                <button className={s.reqRow} onClick={() => setOpen(r)} aria-label={`Open request from ${ago(r.created_at)}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- Pinterest thumbnail */}
                  {r.pin_thumb ? <img src={r.pin_thumb} alt="" loading="lazy" /> : <span className={s.noThumb} />}
                  <span className={s.reqMain}>
                    <span className={s.reqNote}>{r.note || <em className={s.muted}>No note</em>}</span>
                    <span className={s.muted}>
                      Pin by {r.pin_author || "unknown"} · {ago(r.created_at)}
                      {r.email ? " · wants an email" : ""}
                    </span>
                  </span>
                  <span className={`${s.status} ${s[`st_${r.status}`]}`}>{r.status}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <RequestDetail request={open} onClose={() => setOpen(null)} onUpdated={onUpdated} />
    </>
  );
}

/** /admin/users: accounts ranked by what they did while signed in, with the layouts each uses most. */
export function AdminUsers() {
  const days = useDays();
  const me = useAuth().user?.id;
  const [rows, setRows] = useState<AdminUser[] | { error: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const change = async ({ u, patch }: Ask) => {
    setAsk(null);
    setBusy(u.id);
    setActionError(null);
    try {
      const next = await updateUser(u.id, patch);
      setRows((cur) => (Array.isArray(cur) ? cur.map((x) => (x.id === u.id ? { ...x, ...next } : x)) : cur));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't update that account.");
    } finally {
      setBusy(null);
    }
  };
  const load = useCallback(() => {
    setRows(null);
    adminUsers(days).then(setRows).catch((e) => setRows({ error: e instanceof Error ? e.message : "Couldn't load users." }));
  }, [days]);
  useEffect(load, [load]);

  if (rows === null) return <p className={s.note}>Loading users…</p>;
  if ("error" in rows)
    return (
      <p className={s.error}>
        {rows.error} <button className={s.linkBtn} onClick={load}>Try again</button>
      </p>
    );
  const active = rows.filter((u) => u.events > 0).length;
  return (
    <section className={s.panel} aria-labelledby="users-title">
      <h2 id="users-title">Users, last {days} days</h2>
      <p className={s.muted}>
        {fmt.format(rows.length)} accounts, {fmt.format(active)} active. Counts only what people do while signed in; guests stay anonymous.
      </p>
      {actionError && <p role="alert" className={s.error}>{actionError}</p>}
      {rows.length === 0 ? (
        <p className={s.note}>No accounts yet.</p>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Account</th><th>Activity</th><th>Stories made</th><th>Layouts opened</th><th>Downloads</th><th>Saves</th><th>Top layouts</th><th>Last seen</th><th>Joined</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className={u.suspended ? s.muted : undefined}>
                  <td>
                    {u.email ?? <em className={s.muted}>no email</em>}
                    {u.role === "admin" && <span className={s.muted}> · admin</span>}
                    {u.suspended && <span className={s.error}> · suspended</span>}
                  </td>
                  <td>{fmt.format(u.events)}</td>
                  <td>{fmt.format(u.analyses)}</td>
                  <td>{fmt.format(u.layout_opens)}</td>
                  <td>{fmt.format(u.exports)}</td>
                  <td>{fmt.format(u.saves)}</td>
                  <td>{u.layouts.length ? u.layouts.map((l) => `${layoutName(l.name)} (${l.count})`).join(", ") : <span className={s.muted}>—</span>}</td>
                  <td>{u.last_seen ? ago(u.last_seen) : <span className={s.muted}>—</span>}</td>
                  <td>{when(u.created_at)}</td>
                  <td>
                    {u.id === me ? (
                      <span className={s.muted}>you</span>
                    ) : (
                      <span className={s.actions}>
                        <button className={s.linkBtn} disabled={busy === u.id} onClick={() => setAsk({ u, patch: { role: u.role === "admin" ? "user" : "admin" } })}>
                          {u.role === "admin" ? "Remove admin" : "Make admin"}
                        </button>
                        <button className={u.suspended ? s.linkBtn : s.suspend} disabled={busy === u.id} onClick={() => setAsk({ u, patch: { suspended: !u.suspended } })}>
                          {busy === u.id ? "Saving…" : u.suspended ? "Unsuspend" : "Suspend"}
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog ask={ask} onCancel={() => setAsk(null)} onConfirm={(a) => void change(a)} />
    </section>
  );
}

type Ask = { u: AdminUser; patch: { role?: "user" | "admin"; suspended?: boolean } };

/** "Are you sure?" for account changes; suspending gets the red button. */
function ConfirmDialog({ ask, onCancel, onConfirm }: { ask: Ask | null; onCancel: () => void; onConfirm: (a: Ask) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (ask && d && !d.open) d.showModal();
    if (!ask && d?.open) d.close();
  }, [ask]);
  const who = ask?.u.email ?? "this account";
  const [title, body, action] =
    ask?.patch.suspended === true
      ? [`Suspend ${who}?`, "They're signed out everywhere and can't log in until you unsuspend them. The app still works for them as a guest.", "Suspend account"]
      : ask?.patch.suspended === false
        ? [`Unsuspend ${who}?`, "They can log in again straight away.", "Unsuspend"]
        : ask?.patch.role === "admin"
          ? [`Make ${who} an admin?`, "They'll see analytics, layout requests and every account, and can change other accounts.", "Make admin"]
          : [`Remove admin from ${who}?`, "They'll keep their account but lose the admin dashboard.", "Remove admin"];
  return (
    <dialog ref={ref} className={s.confirm} onClose={onCancel} aria-labelledby="confirm-title">
      {ask && (
        <>
          <h2 id="confirm-title">{title}</h2>
          <p>{body}</p>
          <div className={s.actions}>
            <button className={ask.patch.suspended ? s.suspend : s.primary} onClick={() => onConfirm(ask)}>{action}</button>
            <button className={s.secondary} onClick={onCancel} autoFocus>Cancel</button>
          </div>
        </>
      )}
    </dialog>
  );
}

function Overview({ stats, days }: { stats: AdminStats; days: number }) {
  const t = stats.totals;
  const cards: [string, number][] = [
    ["Visitors", t.visitors],
    ["Page views", t.pageviews],
    ["Stories made", t.analyses],
    ["Layouts opened", t.layout_opens],
    ["Downloads", t.exports],
    ["Saves", t.saves],
    ["Requests", t.requests],
    ["Accounts", stats.accounts.users],
    ["New accounts", stats.accounts.new],
  ];
  const deviceTotal = Object.values(stats.devices).reduce((a, b) => a + b, 0) || 1;
  return (
    <>
      <dl className={s.cards}>
        {cards.map(([label, n]) => (
          <div key={label} className={s.card}>
            <dt>{label}</dt>
            <dd>{fmt.format(n ?? 0)}</dd>
          </div>
        ))}
      </dl>
      <section className={s.panel} aria-labelledby="traffic-title">
        <h2 id="traffic-title">Traffic, last {days} days</h2>
        <DailyChart daily={stats.daily} days={days} />
      </section>
      <div className={s.grid}>
        <BarList title="Where visitors come from" rows={stats.referrers.map((r) => ({ name: r.name === "direct" ? "Direct or unknown" : r.name, value: r.count }))} empty="No referrals yet." />
        <BarList title="Pages" rows={stats.pages.map((r) => ({ name: r.name, value: r.count }))} empty="No page views yet." />
        <BarList title="Layouts downloaded" rows={stats.layouts.map((r) => ({ name: layoutName(r.name), value: r.exports, sub: `${r.opens} opened` }))} empty="No downloads yet." />
        <section className={s.panel}>
          <h2>Devices</h2>
          {Object.keys(stats.devices).length === 0 ? (
            <p className={s.note}>No visits yet.</p>
          ) : (
            <ul className={s.bars}>
              {Object.entries(stats.devices).sort((a, b) => b[1] - a[1]).map(([d, n]) => (
                <li key={d}>
                  <span className={s.barLabel}>{d}</span>
                  <span className={s.barTrack}><span className={s.barFill} style={{ width: `${(n / deviceTotal) * 100}%` }} /></span>
                  <span className={s.barValue}>{Math.round((n / deviceTotal) * 100)}%</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function DailyChart({ daily, days }: { daily: AdminStats["daily"]; days: number }) {
  // Fill missing days so the axis is continuous.
  const byDay = new Map(daily.map((d) => [d.day, d]));
  const series = Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().slice(0, 10);
    return byDay.get(d) ?? { day: d, pageviews: 0, visitors: 0, exports: 0 };
  });
  const max = Math.max(1, ...series.map((d) => d.pageviews));
  const W = 900;
  const H = 220;
  const bw = W / series.length;
  const y = (v: number) => H - 24 - (v / max) * (H - 44);
  const line = series.map((d, i) => `${i ? "L" : "M"}${(i + 0.5) * bw},${y(d.visitors)}`).join(" ");
  return (
    <figure className={s.chart}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Daily page views and visitors over ${days} days`}>
        {series.map((d, i) => (
          <rect key={d.day} x={i * bw + bw * 0.15} y={y(d.pageviews)} width={bw * 0.7} height={H - 24 - y(d.pageviews)} className={s.chartBar}>
            <title>{`${d.day}: ${d.pageviews} views, ${d.visitors} visitors, ${d.exports} downloads`}</title>
          </rect>
        ))}
        <path d={line} className={s.chartLine} />
        <text x={0} y={H - 6} className={s.chartAxis}>{series[0]?.day}</text>
        <text x={W} y={H - 6} textAnchor="end" className={s.chartAxis}>{series.at(-1)?.day}</text>
        <text x={0} y={12} className={s.chartAxis}>{max} views</text>
      </svg>
      <figcaption className={s.legend}>
        <span><i className={s.keyBar} /> Page views</span>
        <span><i className={s.keyLine} /> Visitors</span>
      </figcaption>
    </figure>
  );
}

function BarList({ title, rows, empty }: { title: string; rows: { name: string; value: number; sub?: string }[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className={s.panel}>
      <h2>{title}</h2>
      {rows.length === 0 ? (
        <p className={s.note}>{empty}</p>
      ) : (
        <ul className={s.bars}>
          {rows.map((r) => (
            <li key={r.name}>
              <span className={s.barLabel} title={r.sub}>{r.name}</span>
              <span className={s.barTrack}><span className={s.barFill} style={{ width: `${(r.value / max) * 100}%` }} /></span>
              <span className={s.barValue}>{fmt.format(r.value)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RequestDetail({ request, onClose, onUpdated }: { request: LayoutRequest | null; onClose: () => void; onUpdated: (r: LayoutRequest) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<RequestStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (request && !d.open) d.showModal();
    if (!request && d.open) d.close();
    setNote(request?.admin_note ?? "");
    setError(null);
  }, [request]);

  const set = async (status: RequestStatus) => {
    if (!request) return;
    setBusy(status);
    setError(null);
    try {
      onUpdated(await updateRequest(request.id, status, note));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update the request.");
    } finally {
      setBusy(null);
    }
  };

  const r = request;
  return (
    <dialog ref={ref} className={s.drawer} onClose={onClose} aria-labelledby="req-detail-title">
      {r && (
        <div className={s.drawerBody}>
          <div className={s.drawerHead}>
            <h2 id="req-detail-title">Request</h2>
            <span className={`${s.status} ${s[`st_${r.status}`]}`}>{r.status}</span>
            <button className={s.linkBtn} onClick={onClose}>Close</button>
          </div>
          {r.pin_thumb && (
            <a href={r.pin_url} target="_blank" rel="noopener noreferrer" className={s.drawerPin}>
              {/* eslint-disable-next-line @next/next/no-img-element -- Pinterest thumbnail, links to the pin */}
              <img src={r.pin_thumb} alt="Requested pin" width={r.pin_width ?? undefined} height={r.pin_height ?? undefined} />
            </a>
          )}
          <dl className={s.facts}>
            <dt>Pin</dt>
            <dd><a href={r.pin_url} target="_blank" rel="noopener noreferrer">{r.pin_url.replace("https://www.", "")}</a></dd>
            <dt>Creator</dt>
            <dd>{r.pin_author_url ? <a href={r.pin_author_url} target="_blank" rel="noopener noreferrer">{r.pin_author || "Profile"}</a> : r.pin_author || "Unknown"}</dd>
            {r.pin_title && (<><dt>Pin title</dt><dd>{r.pin_title}</dd></>)}
            <dt>Their note</dt>
            <dd>{r.note || <em className={s.muted}>None</em>}</dd>
            <dt>Email</dt>
            <dd>{r.email ? <a href={`mailto:${r.email}`}>{r.email}</a> : <em className={s.muted}>Not given</em>}</dd>
            <dt>Submitted</dt>
            <dd>{when(r.created_at)} ({ago(r.created_at)})</dd>
            <dt>Came from</dt>
            <dd>{r.referrer || "Direct or unknown"}</dd>
            <dt>Device</dt>
            <dd>{r.device || "Unknown"}</dd>
            <dt>Account</dt>
            <dd>{r.signed_in ? "Signed in" : "Guest"}</dd>
            {r.reviewed_at && (<><dt>Reviewed</dt><dd>{when(r.reviewed_at)}</dd></>)}
          </dl>
          <label className={s.field}>
            <span>Internal note</span>
            <textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          {error && <p role="alert" className={s.error}>{error}</p>}
          <div className={s.actions}>
            <button className={s.primary} disabled={busy !== null} onClick={() => void set("accepted")}>{busy === "accepted" ? "Accepting…" : "Accept"}</button>
            <button className={s.secondary} disabled={busy !== null} onClick={() => void set("done")}>{busy === "done" ? "Saving…" : "Mark built"}</button>
            <button className={s.danger} disabled={busy !== null} onClick={() => void set("rejected")}>{busy === "rejected" ? "Rejecting…" : "Reject"}</button>
            {r.status !== "pending" && (
              <button className={s.linkBtn} disabled={busy !== null} onClick={() => void set("pending")}>Move back to pending</button>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}
