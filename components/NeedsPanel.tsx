import { extraLimitations, needsList, type RequirementsT } from "@/lib/needs";

/** Banner for tasks a small wheeled robot cannot really do. Sits above the checks. */
export function InfeasibleBanner({ requirements }: { requirements?: RequirementsT }) {
  if (!requirements || requirements.feasible) return null;
  return (
    <div className="infeasible" role="note">
      <b>A small wheeled robot can’t fully do this task.</b>
      {requirements.notes && <span>{requirements.notes}</span>}
    </div>
  );
}

/** "What this task needs" and "Limitations", shown under the checks. Renders nothing for older results. */
export function NeedsPanel({ requirements, limitations }: { requirements?: RequirementsT; limitations?: string[] }) {
  const needs = requirements ? needsList(requirements) : [];
  const limits = extraLimitations(requirements, limitations);
  const notes = requirements?.feasible ? requirements.notes.trim() : ""; // infeasible notes are in the banner
  return (
    <>
      {requirements && (needs.length > 0 || notes) && (
        <section className="needs" aria-labelledby="needs-h">
          <h3 id="needs-h">What this task needs</h3>
          {needs.length > 0 && (
            <dl>
              {needs.map((n) => (
                <div key={n.key}>
                  <dt>{n.label}</dt>
                  <dd className={n.key === "actions" ? undefined : "mono"}>{n.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {notes && <p>{notes}</p>}
        </section>
      )}
      {limits.length > 0 && (
        <section className="needs" aria-labelledby="limits-h">
          <h3 id="limits-h">Limitations</h3>
          <ul>{limits.map((l) => <li key={l}>{l}</li>)}</ul>
        </section>
      )}
    </>
  );
}
