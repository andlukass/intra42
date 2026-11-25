import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@/features/dashboard/Icon";
import { dashboardQuery, number, object, rows, string } from "@/features/dashboard/queries";
import type { Session } from "@/lib/intra";

export function AccountHeader({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const summary = useQuery(dashboardQuery(session, "summary", object));
  const profile = useQuery(dashboardQuery(session, "profile", object));
  const notifications = useQuery(dashboardQuery(session, "notifications", object));
  const count = number(notifications.data?.count) ?? rows(notifications.data?.notifications).length;
  const login = string(profile.data?.login) || string(summary.data?.login);
  const [open, setOpen] = useState(false);
  const account = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: Event) {
      if (event.target instanceof Node && !account.current?.contains(event.target)) setOpen(false);
    }
    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("focusin", dismiss);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("focusin", dismiss);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [open]);

  function closeMenu() {
    setOpen(false);
  }

  return (
    <>
      <Link className="topbar-search" to="/search">
        <Icon name="search" />
        Search
      </Link>
      <div className="topbar-account">
        <Link
          className="notification"
          to="/notifications"
          aria-label={`Notifications, ${count} unread`}
        >
          <Icon name="bell" />
          <span>{count}</span>
        </Link>
        <div className="account-menu" ref={account}>
          <button
            className="account-link"
            type="button"
            ref={trigger}
            aria-controls="account-menu"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            {login || "Account"}
            {session.avatar && <img src={session.avatar} alt="" />}
          </button>
          <nav id="account-menu" className="account-popup" aria-label="Account" hidden={!open}>
            <Link to="/slots" onClick={closeMenu}>
              Manage slots
            </Link>
            <Link to="/" onClick={closeMenu}>
              View my profile
            </Link>
            <Link to="/settings" onClick={closeMenu}>
              Settings
            </Link>
            <button className="account-logout" type="button" onClick={onSignOut}>
              Logout
            </button>
          </nav>
        </div>
      </div>
    </>
  );
}
