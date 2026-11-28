export function signInPage(transaction: string, csrf: string) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Sign in to Intra42</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="https://use.typekit.net/qwf8gat.css">
<style>
:root { --main-text-color: #c7c7c7; }
body {
  margin: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #2d3246 url('sign-in-assets/login-background.jpg') no-repeat center fixed;
  background-size: cover;
}
*, a { color: var(--main-text-color); text-decoration: none; font-family: "futura-pt", sans-serif; }
a:hover { text-decoration: underline; }
#kc-content { text-align: center; margin: 100px auto; width: 400px; }
#logo { display: block; width: 100px; margin: 10px auto 75px; }
#username, #password {
  width: calc(100% - 50px);
  height: 25px;
  margin-bottom: 25px;
  background-color: #e8f0fe;
  color: #000;
  border: 1px solid #00babc;
  border-radius: 0;
  font-size: 1.3em;
  padding: 8px 20px 5px 30px;
}
input::placeholder { font-style: italic; }
#kc-form-buttons { display: flex; flex-flow: row nowrap; }
#kc-login {
  width: 100%;
  margin-top: 5px;
  border: none;
  border-radius: 0;
  font-size: 1.8em;
  font-weight: bold;
  height: 53.15px;
  cursor: pointer;
  background-color: #00babc;
  color: #fff;
  padding-left: 10px;
  padding-right: 10px;
  text-transform: uppercase;
}
#kc-login:disabled { opacity: .6; cursor: wait; }
:focus-visible { outline: 2px solid #00babc; outline-offset: 3px; }
#remember-me { text-align: left; padding: 0; margin-bottom: 20px; }
#remember-me input { width: 1.2em; height: 1.2em; margin-right: .5em; }
#remember-me label { cursor: pointer; font-size: 1.4em; }
#remember-me, #reset-password, #change-realm, #legal { user-select: none; display: block; }
#reset-password { margin-top: 20px; }
#change-realm, #legal { margin-top: 5px; }
[role="alert"] { color: #fff; background: #8d3333; padding: 12px; text-align: left; }
@media (max-width: 480px) {
  #kc-content { margin-top: 60px; width: min(19em, calc(100vw - 48px)); }
  #logo { margin: 10px auto 50px; }
}
</style>
<script src="sign-in.js" defer></script>
</head>
<body>
<main id="kc-content" aria-label="Sign in to Intra42">
<img id="logo" src="sign-in-assets/42-logo.svg" alt="42">
<form id="kc-form-login" method="post" action="sign-in" data-transaction="${transaction}" data-csrf="${csrf}">
<div><input id="username" name="username" type="text" aria-label="Login or email" placeholder="Login or email" autocomplete="username" autocapitalize="none" spellcheck="false" required></div>
<div><input id="password" name="password" type="password" aria-label="Password" placeholder="Password" autocomplete="current-password" required></div>
<div id="remember-me"><label><input id="rememberMe" name="rememberMe" type="checkbox"> Remember me</label></div>
<div id="kc-form-buttons"><button id="kc-login" type="submit">Sign In</button></div>
<p id="error" role="alert" hidden></p>
<a id="reset-password" href="https://signin.intra.42.fr/users/password/new" rel="noreferrer">Forgot or change your password?</a>
<a id="change-realm" href="https://admin.intra.42.fr/users/auth/keycloak_admin" rel="noreferrer">Sign in as staff</a>
<a id="legal" href="https://profile.intra.42.fr/legal" rel="noreferrer">Read our terms and conditions</a>
</form>
</main>
</body>
</html>`;
}

export const signInScript = `const form = document.querySelector('form');
const error = document.querySelector('#error');
const submit = form.querySelector('button');
let pending = false;
async function send(body) {
  const response = await fetch('sign-in?transaction=' + form.dataset.transaction, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Intra42-CSRF': form.dataset.csrf },
    body,
    credentials: 'omit',
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Sign-in failed. Try again.');
  return data;
}
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (pending) return;
  pending = true;
  const values = new URLSearchParams(new FormData(form));
  error.hidden = true;
  for (const input of form.elements) input.disabled = true;
  submit.textContent = 'Signing in…';
  submit.setAttribute('aria-busy', 'true');
  try {
    const result = await send(values.toString());
    window.location.assign(result.redirect);
  } catch (reason) {
    error.textContent = reason instanceof Error ? reason.message : 'Sign-in failed. Try again.';
    error.hidden = false;
  } finally {
    pending = false;
    for (const input of form.elements) input.disabled = false;
    submit.textContent = 'Sign in';
    submit.removeAttribute('aria-busy');
  }
});`;
