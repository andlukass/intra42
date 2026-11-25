import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AccountHeader } from "@/features/dashboard/AccountHeader";
import { Icon } from "@/features/dashboard/Icon";
import { navigation, pages } from "@/features/dashboard/navigation";
import {
  persistSession,
  releaseSession,
  renewSession,
  restoreSession,
  type Session,
} from "@/lib/intra";
import Home from "@/pages/Home";
import Settings from "@/pages/Settings";
import SignIn from "@/pages/SignIn";
import Slots from "@/pages/Slots";

function Brand() {
  return (
    <svg aria-hidden="true" viewBox="0 0 137.6 96.6" fill="currentColor">
      <path
        transform="translate(-229.2 -372.7)"
        d="M229.2 443.9h50.7v25.4h25.3v-45.9h-50.6l50.6-50.7h-25.3l-50.7 50.7zM316.1 398.1l25.3-25.4h-25.3z"
      />
      <path
        transform="translate(-229.2 -372.7)"
        d="m341.4 398.1-25.3 25.3v25.3h25.3v-25.3l25.4-25.3v-25.4h-25.4zM366.8 423.4l-25.4 25.3h25.4z"
      />
    </svg>
  );
}

function SidebarLinks({
  onNavigate,
  onSignOut,
}: {
  onNavigate?: () => void;
  onSignOut?: () => void;
}) {
  return (
    <>
      <nav aria-label="Main navigation">
        {navigation.map(({ path, title, icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === "/"}
            aria-label={title}
            title={title}
            onClick={onNavigate}
          >
            <Icon name={icon} />
            <span>{title}</span>
          </NavLink>
        ))}
      </nav>
      {onSignOut && (
        <button
          className="sidebar-sign-out"
          type="button"
          onClick={onSignOut}
          aria-label="Sign out"
          title="Sign out"
        >
          <Icon name="logout" />
          <span>Sign out</span>
        </button>
      )}
    </>
  );
}

function MobileNavigation({ onSignOut }: { onSignOut?: () => void }) {
  const drawer = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 700px)");
    function closeOnDesktop(event: MediaQueryListEvent) {
      if (!event.matches) drawer.current?.close();
    }
    function closeOnHistoryNavigation() {
      drawer.current?.close();
    }
    mobile.addEventListener("change", closeOnDesktop);
    window.addEventListener("popstate", closeOnHistoryNavigation);
    return () => {
      mobile.removeEventListener("change", closeOnDesktop);
      window.removeEventListener("popstate", closeOnHistoryNavigation);
    };
  }, []);

  function close() {
    drawer.current?.close();
  }

  return (
    <>
      <button
        className="mobile-menu-button"
        type="button"
        aria-label="Open navigation"
        aria-haspopup="dialog"
        aria-controls="mobile-navigation"
        aria-expanded={open}
        onClick={() => {
          drawer.current?.showModal();
          closeButton.current?.focus();
          setOpen(true);
        }}
      >
        <Icon name="menu" />
      </button>
      <dialog
        id="mobile-navigation"
        className="mobile-drawer"
        aria-label="Navigation"
        ref={drawer}
        onClose={() => setOpen(false)}
      >
        <button
          className="mobile-drawer-backdrop"
          type="button"
          tabIndex={-1}
          aria-label="Dismiss navigation"
          onClick={close}
        />
        <div className="mobile-drawer-panel">
          <div className="mobile-drawer-header">
            <Link to="/" aria-label="Intra42 home" className="brand" onClick={close}>
              <Brand />
            </Link>
            <button ref={closeButton} type="button" aria-label="Close navigation" onClick={close}>
              <Icon name="close" />
            </button>
          </div>
          <SidebarLinks
            onNavigate={close}
            onSignOut={
              onSignOut &&
              (() => {
                close();
                onSignOut();
              })
            }
          />
        </div>
      </dialog>
    </>
  );
}

export default function App() {
  const { key: locationKey } = useLocation();
  const navigate = useNavigate();
  const [session, setSession] = useState(restoreSession);
  const [restoring, setRestoring] = useState(() =>
    Boolean(session?.refreshSession && session.expiresAt <= Date.now()),
  );
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!session) return;
    let canceled = false;
    let timeout: number;
    const current = session;
    const remaining = Math.max(0, current.expiresAt - Date.now());
    const early = current.refreshSession ? Math.min(30_000, remaining / 2) : 0;

    async function updateSession() {
      try {
        const next = current.refreshSession ? await renewSession(current) : null;
        if (canceled) return;
        setRestoring(false);
        if (next) {
          persistSession(next);
          setSession(next);
          return;
        }
        persistSession(null);
        queryClient.removeQueries({ queryKey: ["intra", current.cacheKey] });
        setSession(null);
      } catch {
        if (!canceled) {
          if (Date.now() >= current.expiresAt) setRestoring(true);
          timeout = window.setTimeout(updateSession, 5_000);
        }
      }
    }

    timeout = window.setTimeout(updateSession, remaining - early);
    return () => {
      canceled = true;
      window.clearTimeout(timeout);
    };
  }, [queryClient, session]);

  function signOut() {
    persistSession(null);
    setRestoring(false);
    if (session) {
      void releaseSession(session);
      queryClient.removeQueries({ queryKey: ["intra", session.cacheKey] });
    }
    setSession(null);
    navigate("/", { replace: true });
  }

  function onSignIn(nextSession: Session) {
    persistSession(nextSession);
    setSession(nextSession);
  }

  function authenticatedPage(page: ReactNode) {
    if (restoring)
      return (
        <main className="centered-page" role="status">
          Restoring your 42 session…
        </main>
      );
    return session ? page : <SignIn onSignIn={onSignIn} />;
  }

  return (
    <div className="site-shell">
      <aside className="sidebar">
        <Link to="/" aria-label="Intra42 home" className="brand">
          <Brand />
        </Link>
        <SidebarLinks onSignOut={session ? signOut : undefined} />
      </aside>
      <div className="site-content">
        <header className={session ? "topbar" : "topbar topbar-guest"}>
          <MobileNavigation onSignOut={session ? signOut : undefined} />
          {session && !restoring && (
            <AccountHeader key={locationKey} session={session} onSignOut={signOut} />
          )}
        </header>
        <Routes>
          <Route path="/" element={authenticatedPage(session && <Home session={session} />)} />
          <Route
            path="/slots"
            element={authenticatedPage(session && <Slots session={session} />)}
          />
          <Route
            path="/settings"
            element={authenticatedPage(
              session && <Settings session={session} onSignOut={signOut} />,
            )}
          />
          {pages.map(({ path, title }) => (
            <Route
              key={path}
              path={path}
              element={
                <main className="centered-page">
                  <h1>{title}</h1>
                </main>
              }
            />
          ))}
          <Route
            path="*"
            element={
              <main className="centered-page">
                <h1>Page not found</h1>
              </main>
            }
          />
        </Routes>
      </div>
    </div>
  );
}
