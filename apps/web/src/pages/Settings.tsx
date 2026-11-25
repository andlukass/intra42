import { useQuery } from "@tanstack/react-query";
import { dashboardQuery, object, string } from "@/features/dashboard/queries";
import type { Session } from "@/lib/intra";

export default function Settings({
  session,
  onSignOut,
}: {
  session: Session;
  onSignOut: () => void;
}) {
  const summary = useQuery(dashboardQuery(session, "summary", object));
  const profile = useQuery(dashboardQuery(session, "profile", object));
  const login = string(profile.data?.login) || string(summary.data?.login);
  const email = string(profile.data?.email) || string(summary.data?.email);

  return (
    <main className="mx-auto grid max-w-3xl gap-5 p-4 sm:p-8">
      <h1 className="text-2xl font-bold">Settings</h1>
      <section aria-labelledby="settings-account" className="panel dashboard-panel">
        <h2 id="settings-account" className="mb-4 text-lg font-bold">
          Account
        </h2>
        {login || email ? (
          <dl className="grid gap-4">
            {login && (
              <div>
                <dt className="font-bold">42 login</dt>
                <dd className="wrap-anywhere">{login}</dd>
              </div>
            )}
            {email && (
              <div>
                <dt className="font-bold">Email</dt>
                <dd className="wrap-anywhere">{email}</dd>
              </div>
            )}
          </dl>
        ) : summary.isPending || profile.isPending ? (
          <p role="status">Loading account…</p>
        ) : (
          <p>Account details are unavailable.</p>
        )}
      </section>
      <section aria-labelledby="settings-session" className="panel dashboard-panel">
        <h2 id="settings-session" className="mb-4 text-lg font-bold">
          Session
        </h2>
        <button
          type="button"
          className="account-logout rounded-md border border-current px-3 py-2 hover:bg-rose-50"
          onClick={onSignOut}
        >
          Logout
        </button>
      </section>
    </main>
  );
}
