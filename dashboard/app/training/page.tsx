"use client";

import { useLive } from "@/components/LiveDataProvider";
import { Sparkline } from "@/components/Sparkline";
import { UsersIcon } from "@/components/icons";
import { Tooltip } from "@/components/Tooltip";
import { formatRelative, riskLabel } from "@/lib/format";

function recommendation(score: number): string {
  if (score >= 70) return "Assign phishing refresher";
  if (score >= 40) return "Nudge micro-lesson";
  if (score >= 20) return "Monitor next campaign";
  return "On track";
}

export default function TrainingPage() {
  const { snapshot } = useLive();

  if (!snapshot) {
    return (
      <div className="stack">
        <div className="skeleton skeleton-panel" />
      </div>
    );
  }

  const { training } = snapshot;
  const highRisk = training.filter((user) => user.risk_score >= 70).length;
  const totalEvents = training.reduce((sum, user) => sum + user.event_count, 0);

  return (
    <div className="stack">
      <section className="page-head">
        <div>
          <div className="eyebrow-row">
            <p className="eyebrow">Human Vulnerability Index</p>
            <Tooltip
              title="Adaptive Risk Analytics"
              content="Real-time behavioral telemetry analyzing simulation interactions, credential prompts, and awareness module completions."
            />
          </div>
          <h2>Organizational Human Risk Intelligence</h2>
          <p className="hero-sub">
            Continuous behavioral assessment measuring employee susceptibility to social engineering and targeted campaigns.
          </p>
        </div>
        <div className="head-badges">
          <span className="count-chip">{training.length} users</span>
          <span className="count-chip danger">{highRisk} high risk</span>
        </div>
      </section>

      <section className="stat-grid training-stats">
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-label">Tracked users</span>
            <Tooltip
              title="Active Cohort"
              content="Enrolled organizational users undergoing periodic security simulations."
            />
          </div>
          <strong>{training.length}</strong>
          <span className="stat-sub">monitored personnel</span>
        </div>
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-label">High risk</span>
            <Tooltip
              title="Elevated Risk Level"
              content="Users with risk index >= 70 due to repeated simulation clicks or uncompleted remediations."
            />
          </div>
          <strong>{highRisk}</strong>
          <span className="stat-sub">score at or above 70</span>
        </div>
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-label">Training events</span>
            <Tooltip
              title="Interaction Volume"
              content="Total recorded events including phishing simulations, credential tests, and training completions."
            />
          </div>
          <strong>{totalEvents}</strong>
          <span className="stat-sub">simulation & lesson activity</span>
        </div>
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-label">Campaign coverage</span>
            <Tooltip
              title="Participation Rate"
              content="Proportion of users who have engaged with at least one active awareness assessment."
            />
          </div>
          <strong>
            {training.filter((user) => user.event_count > 0).length}/
            {training.length}
          </strong>
          <span className="stat-sub">users with recorded events</span>
        </div>
      </section>

      <section className="card">
        <div className="card-heading">
          <div>
            <div className="heading-with-tooltip">
              <p className="eyebrow">Risk leaderboard</p>
              <Tooltip
                title="Prioritization Matrix"
                content="Personnel ranked by calculated threat susceptibility to guide targeted training intervention."
              />
            </div>
            <h2>Users by risk score</h2>
          </div>
          <span className="card-icon">
            <UsersIcon size={18} />
          </span>
        </div>

        <div className="table-scroll">
          <table className="data-table training-table">
            <thead>
              <tr>
                <th>User</th>
                <th>
                  Risk score
                  <Tooltip
                    title="Risk Metric"
                    content="Composite score calculated from past compromise events minus credit for timely training completions."
                    inline
                  />
                </th>
                <th>
                  Risk trend
                  <Tooltip
                    title="Historical Trajectory"
                    content="Cumulative risk trend line: simulation clicks increase risk slope, completed remediation modules decrease it."
                    inline
                  />
                </th>
                <th>Events</th>
                <th>Last activity</th>
                <th>Recommended next step</th>
              </tr>
            </thead>
            <tbody>
              {training.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="user-cell">
                      <span className="user-avatar">
                        {user.name
                          .split(" ")
                          .map((part) => part[0])
                          .join("")
                          .slice(0, 2)}
                      </span>
                      <div>
                        <strong>{user.name}</strong>
                        <span>{riskLabel(user.risk_score)}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="risk-cell">
                      <strong>{user.risk_score}</strong>
                      <div className="risk-meter" aria-hidden="true">
                        <span
                          className={`risk-fill${
                            user.risk_score >= 70
                              ? " is-high"
                              : user.risk_score >= 40
                                ? " is-medium"
                                : ""
                          }`}
                          style={{ width: `${Math.min(100, user.risk_score)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td>
                    <Sparkline points={user.trend} />
                  </td>
                  <td>{user.event_count}</td>
                  <td>{formatRelative(user.last_event_at)}</td>
                  <td>
                    <span
                      className={`recommend${
                        user.risk_score >= 70 ? " is-urgent" : ""
                      }`}
                    >
                      {recommendation(user.risk_score)}
                    </span>
                  </td>
                </tr>
              ))}
              {training.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty-cell">
                    No simulation personnel telemetry recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
