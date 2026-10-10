"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type AdminStats, type LayoutRequest, type RequestStatus, adminMe, adminRequests, adminStats, updateRequest } from "../lib/api";
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

export function AdminDashboard() {
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
  return <Dashboard email={user.email ?? ""} />;
}

function Dashboard({ email }: { email: string }) {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [stats, setStats] = useState<AdminStats | { error: string } | null>(null);
  const [tab, setTab] = useState<RequestStatus | "all">("pending");
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
    <div className={s.dash}>
      <header className={s.head}>
        <h1 className={s.title}>Admin</h1>
        <div className={s.headTools}>
          <div className={s.segment} role="group" aria-label="Date range">
            {RANGES.map((d) => (
              <button key={d} aria-pressed={days === d} className={days === d ? s.segOn : ""} onClick={() => setDays(d)}>
                {d} days
              </button>
            ))}
          </div>
          <span className={s.muted}>{email}</span>
          <button className={s.linkBtn} onClick={() => void signOut()}>Sign out</button>
        </div>
      </header>

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
          <div className={s.tabs} role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? s.tabOn : ""} onClick={() => setTab(t.id)}>
                {t.label}
                {stats && !("error" in stats) && t.id !== "all" && <span className={s.count}>{stats.requests[t.id] ?? 0}</span>}
              </button>
            ))}
          </div>
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
    </div>
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
