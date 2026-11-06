import Link from "next/link";
import { readLeads } from "../lib/db";
import { due, today, dateLabel } from "../lib/leads";
import { Arrow } from "../../components/halenn/Brand";
export default async function Overview() {
  const leads = await readLeads();
  const now = today();
  const follow = leads
    .filter((l) => due(l, now))
    .sort((a, b) => a.follow_up!.localeCompare(b.follow_up!));
  return (
    <section className="hw-enter">
      <h1>Overview</h1>
      <div className="hw-metrics">
        {[
          [
            leads.filter((l) => l.status === "New").length,
            "New leads",
            "status=New",
          ],
          [follow.length, "Follow-ups due", "due=1"],
        ].map(([n, label, q]) => (
          <Link href={"/admin/leads?" + q} key={label}>
            <strong>{n}</strong>
            <span>
              {label} <Arrow />
            </span>
          </Link>
        ))}
      </div>
      <div className="hw-section-title">
        <h2>Follow-ups due</h2>
        <Link href="/admin/leads">
          View all leads <Arrow />
        </Link>
      </div>
      {follow.length ? (
        <div>
          {follow.slice(0, 8).map((l) => (
            <Link
              key={l.id}
              className="hw-follow"
              href={"/admin/leads?lead=" + l.id}
            >
              <b>{l.company}</b>
              <span>{l.opportunity}</span>
              <time>{dateLabel(l.follow_up, now)}</time>
              <Arrow />
            </Link>
          ))}
        </div>
      ) : (
        <div className="hw-empty">
          <h3>You’re all caught up</h3>
          <p>
            Leads with a follow-up scheduled for today or earlier will appear
            here.
          </p>
        </div>
      )}
    </section>
  );
}
