import { type SubmitEvent, useState } from "react";
import { requestError, type Session, signIn } from "@/lib/intra";

export default function SignIn({ onSignIn }: { onSignIn: (session: Session) => void }) {
  const [errorMessage, setErrorMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function login(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const username = String(values.get("username") ?? "").trim();
    const password = String(values.get("password") ?? "");
    setErrorMessage("");
    setPending(true);
    try {
      onSignIn(await signIn(username, password));
    } catch (error) {
      setErrorMessage(requestError(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="centered-page">
      <section className="panel sign-in">
        <h1>Sign in to Intra42</h1>
        <p>Sign in with your 42 account through the local Intra42 server.</p>
        <form onSubmit={login}>
          <label>
            42 login or email
            <input name="username" autoComplete="username" required disabled={pending} />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={pending}
            />
          </label>
          <button
            className="solid-button inline-flex items-center justify-center gap-2"
            type="submit"
            disabled={pending}
            aria-busy={pending}
          >
            {pending && (
              <span
                aria-hidden="true"
                className="size-4 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin"
              />
            )}
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
        {errorMessage && <p role="alert">{errorMessage}</p>}
      </section>
    </main>
  );
}
