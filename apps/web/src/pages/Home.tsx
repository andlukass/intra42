import { useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { dateText, timeZone } from "@/features/dashboard/dates";
import { Icon } from "@/features/dashboard/Icon";
import { dashboardQuery, number, object, rows, string } from "@/features/dashboard/queries";
import { Action, EventCard, Logtime, Panel, Result } from "@/features/dashboard/widgets";
import type { Session } from "@/lib/intra";

const dayFormat = { day: "2-digit", month: "2-digit", year: "numeric" } as const;

export default function Home({ session }: { session: Session }) {
  const [now] = useState(Date.now);
  const [showEvaluations, setShowEvaluations] = useState(true);
  const [selectedCursus, setSelectedCursus] = useState("");
  const summary = useQuery(dashboardQuery(session, "summary", object));
  const agenda = useQuery(dashboardQuery(session, "agenda", rows));
  const evaluations = useQuery(dashboardQuery(session, "evaluations", rows));
  const feedback = useQuery(dashboardQuery(session, "feedback", rows));
  const profile = useQuery(dashboardQuery(session, "profile", object));
  const rawId = profile.data?.id ?? summary.data?.id ?? summary.data?.user_id;
  const id = typeof rawId === "number" || typeof rawId === "string" ? String(rawId) : "";
  const userParams = { id };
  const enabled = /^\d+$/.test(id);
  const campuses = useQuery({ ...dashboardQuery(session, "campus", rows, userParams), enabled });
  const cursus = useQuery({ ...dashboardQuery(session, "cursus", rows, userParams), enabled });
  const alumni = useQuery({ ...dashboardQuery(session, "alumni", object, userParams), enabled });
  const initialLogtime = session.logtime?.id === id ? session.logtime?.data : undefined;
  const logtime = useQuery({
    ...dashboardQuery(session, "logtime", object, userParams),
    enabled,
    initialData: initialLogtime,
    staleTime: initialLogtime === undefined ? 60_000 : Infinity,
  });
  const achievements = useQuery({
    ...dashboardQuery(session, "achievements", rows, userParams),
    enabled,
  });
  const current =
    cursus.data?.find((item) => String(item.id) === selectedCursus) ?? cursus.data?.[0];
  const cursusId = current?.id == null ? "" : String(current.id);
  const cursusSlug = string(current?.slug);
  const coalitionKey = cursusSlug || cursusId;
  const initialCoalition =
    session.coalition?.id === id && session.coalition?.cursus === coalitionKey
      ? session.coalition?.data
      : undefined;
  const coalition = useQuery({
    ...dashboardQuery(session, "coalition", object, { id, cursus: coalitionKey }),
    initialData: initialCoalition,
    staleTime: initialCoalition === undefined ? 60_000 : Infinity,
    enabled: enabled && Boolean(coalitionKey),
  });
  const projects = useQuery({
    ...dashboardQuery(session, "projects", rows, { id, cursus: cursusId }),
    enabled: enabled && Boolean(cursusId),
  });

  const user = { ...summary.data, ...profile.data };
  const login = string(user.login);
  const name =
    [string(user.first_name), string(user.last_name)].filter(Boolean).join(" ") ||
    string(user.displayname) ||
    login;
  const picture = session.avatar;
  const position = string(user.location);
  const campus = campuses.data?.find((item) => item.is_primary === true) ?? campuses.data?.[0];
  const zone = timeZone(campus?.time_zone);
  const member = object(coalition.data?.coalitions_user);
  const team = object(member.coalition);
  const bloc = rows(coalition.data?.available_blocs)[0];
  const badge = string(team.image_url);
  const coalitionPath =
    bloc?.id && team.id ? `https://profile.intra.42.fr/blocs/${bloc.id}/coalitions/${team.id}` : "";
  const cover = string(team.cover_url);
  const color = string(team.color);
  const title = rows(user.titles).find((item) => item.selected === true);
  const displayedLogin = string(title?.name) || string(user.displayed_login) || login;
  const deadline = string(user.alumnized_at) || string(alumni.data?.deadline);
  const deadlineText = dateText(deadline, dayFormat, zone);
  const months = Math.ceil((Date.parse(deadline) - now) / (30.44 * 86_400_000));
  const level = number(current?.level);
  const progress = Math.min(
    100,
    Math.max(0, number(current?.progress) ?? ((level ?? 0) % 1) * 100),
  );

  if (summary.isError && profile.isError) {
    return (
      <main className="centered-page">
        <Result query={summary}>{null}</Result>
      </main>
    );
  }
  if (!summary.isPending && !profile.isPending && !enabled) {
    return (
      <main className="centered-page">
        <p role="alert">42 did not return a profile ID.</p>
      </main>
    );
  }

  return (
    <main className="dashboard">
      <section
        className="profile-banner"
        aria-label="Profile"
        style={
          cover.startsWith("https://")
            ? { backgroundImage: `url("${encodeURI(cover)}")` }
            : undefined
        }
      >
        <div
          className="profile-card profile-overview"
          style={color ? ({ "--coalition": color } as CSSProperties) : undefined}
        >
          <div className="profile-identity">
            {badge && (
              <div className="coalition-badge">
                {coalitionPath ? (
                  <a href={coalitionPath} aria-label="Coalition">
                    <img src={badge} alt="" referrerPolicy="no-referrer" />
                  </a>
                ) : (
                  <img src={badge} alt="" referrerPolicy="no-referrer" />
                )}
              </div>
            )}
            <span className="availability">
              <i />
              {position || "unavailable"}
            </span>
            <div className="profile-avatar">
              {picture ? <img src={picture} alt="" /> : <Icon name="user" />}
            </div>
            <div className="profile-name">
              <h1 title={name || undefined}>{name || "Loading profile…"}</h1>
              <p>{displayedLogin.replace("%login", login)}</p>
            </div>
          </div>
          <div className="level">
            <strong>
              {level === undefined ? "—" : String(Math.floor(level)).padStart(2, "0")}
            </strong>
            <div className="level-detail">
              <div className="level-label">
                <b>{Math.floor(progress)}%</b>
                {(cursus.data?.length ?? 0) > 1 ? (
                  <label className="cursus-select">
                    <select
                      aria-label="Cursus"
                      value={cursusId}
                      onChange={(event) => setSelectedCursus(event.target.value)}
                    >
                      {cursus.data?.map((item) => (
                        <option key={String(item.id)} value={String(item.id)}>
                          {[string(item.grade), string(item.name)].filter(Boolean).join(" at ")}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <b>
                    {[string(current?.grade), string(current?.name)].filter(Boolean).join(" at ")}
                  </b>
                )}
              </div>
              <progress aria-label="Level progress" value={progress} max={100} />
            </div>
          </div>
          <dl className="profile-stats">
            <div>
              <dt>₳</dt>
              <dd>{number(user.wallet) ?? "—"}</dd>
            </div>
            <div>
              <dt>Rank</dt>
              <dd>{number(member.rank ?? team.rank) ?? "—"}</dd>
            </div>
            <div>
              <dt>Score</dt>
              <dd>{number(member.score ?? team.score) ?? "—"}</dd>
            </div>
            <div>
              <dt>Ev.P</dt>
              <dd>{number(user.evaluation_points) ?? "—"}</dd>
            </div>
          </dl>
        </div>
        <section className="profile-card alumnization">
          <h2>Alumnization</h2>
          <Result
            query={alumni}
            empty={!deadlineText ? "No alumnization date available." : undefined}
          >
            <p className="alumni-date" style={color ? { color } : undefined}>
              {deadlineText}
            </p>
            <p className="alumni-caption">
              {months > 0
                ? `${months} ${months === 1 ? "month" : "months"} left before alumnization`
                : "Alumnization date"}
            </p>
          </Result>
          <Link to="/alumni" className="solid-button">
            Learn more about benefits
          </Link>
        </section>
        <div className="profile-side">
          <div className="profile-card quick-links">
            <Link to="/projects" aria-label="Projects">
              <Icon name="network" />
            </Link>
            <Link to="/settings" aria-label="Account settings">
              <Icon name="user" />
            </Link>
          </div>
          <div
            className="profile-card contact"
            style={color ? ({ "--coalition": color } as CSSProperties) : undefined}
          >
            {string(user.phone) && (
              <a href={`tel:${string(user.phone)}`}>
                <Icon name="phone" />
                {string(user.phone)}
              </a>
            )}
            {string(user.email) && (
              <a href={`mailto:${string(user.email)}`}>
                <Icon name="mail" />
                {string(user.email)}
              </a>
            )}
            {string(campus?.name) && (
              <p>
                <Icon name="pin" />
                {string(campus?.name)}
              </p>
            )}
            {dateText(user.data_erasure_date, dayFormat, zone) && (
              <p>
                <Icon name="calendar" />
                {dateText(user.data_erasure_date, dayFormat, zone)}
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="dashboard-grid">
        <Panel
          title="Agenda"
          className="agenda-panel"
          actions={
            <>
              <Action to="/events">All events</Action>
              <Action to="/events/marks">Event marks</Action>
            </>
          }
        >
          <Result
            query={agenda}
            empty={agenda.data?.length === 0 ? "No upcoming events." : undefined}
          >
            <ul className="agenda-list">
              {agenda.data?.map((event, index) => (
                <EventCard key={String(event.id ?? index)} event={event} zone={zone} now={now} />
              ))}
            </ul>
          </Result>
        </Panel>

        <Panel
          title="Pending evaluations"
          className="evaluations-panel"
          actions={
            <>
              <button
                type="button"
                className="outline-button"
                aria-expanded={showEvaluations}
                aria-controls="evaluations"
                onClick={() => setShowEvaluations((visible) => !visible)}
              >
                {showEvaluations ? "Hide" : "Show"}
              </button>
              <Action to="/feedbacks">Feedback logs</Action>
              <Action to="/slots">Manage slots</Action>
            </>
          }
        >
          <div id="evaluations" hidden={!showEvaluations}>
            <Result query={feedback}>
              {feedback.data?.map((event, index) => (
                <p className="evaluation-row" key={String(event.id ?? index)}>
                  Feedback due for <b>{string(event.name)}</b>
                </p>
              ))}
            </Result>
            <Result
              query={evaluations}
              empty={
                evaluations.data?.length === 0 && feedback.data?.length === 0
                  ? "No pending evaluations."
                  : undefined
              }
            >
              {evaluations.data?.map((item, index) => (
                <p className="evaluation-row" key={String(item.id ?? index)}>
                  {item.kind === "evaluator" ? "You will evaluate" : "You will be evaluated by"}{" "}
                  <b>{string(item.user) || "another student"}</b> on{" "}
                  {string(item.project_name) || "a project"}{" "}
                  {dateText(item.begin_at, { dateStyle: "medium", timeStyle: "short" }, zone)}
                </p>
              ))}
            </Result>
          </div>
        </Panel>

        <Panel title="Logtime">
          <Result query={logtime}>
            {logtime.data && <Logtime stats={logtime.data} zone={zone} now={now} />}
          </Result>
        </Panel>

        <Panel
          title="Last achievements"
          actions={<Action to="/achievements">See all achievements</Action>}
        >
          <Result
            query={achievements}
            empty={achievements.data?.length === 0 ? "No achievements yet." : undefined}
          >
            <ul className="achievement-list">
              {achievements.data?.slice(0, 3).map((item, index) => (
                <li key={String(item.id ?? index)}>
                  <div>
                    <h3>{string(item.name)}</h3>
                    <p>{string(item.description)}</p>
                  </div>
                  {string(item.svg).startsWith("https://") && (
                    <img src={string(item.svg)} alt="" referrerPolicy="no-referrer" />
                  )}
                </li>
              ))}
            </ul>
          </Result>
        </Panel>

        <Panel
          title="Projects"
          actions={
            <>
              <Action to="/feedbacks">Feedback logs</Action>
              <Action to="/projects">All projects</Action>
            </>
          }
        >
          {cursus.isSuccess && !cursusId ? (
            <p className="panel-status">No active cursus.</p>
          ) : (
            <Result
              query={projects}
              empty={projects.data?.length === 0 ? "No ongoing projects." : undefined}
            >
              <ul className="project-list">
                {projects.data?.map((item, index) => (
                  <li key={String(item.project_slug ?? index)}>{string(item.project_name)}</li>
                ))}
              </ul>
            </Result>
          )}
        </Panel>
      </div>
    </main>
  );
}
