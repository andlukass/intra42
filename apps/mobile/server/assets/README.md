# Login theme assets

The hosted sign-in page uses the public 42 student login theme as its visual
reference. The app's browser still displays the Intra42 server origin.

- `login-background.jpg`: `https://auth.42.fr/auth/resources/vh5yw/login/students/img/bkgrnd.jpg`
- `42-logo.svg`: `https://auth.42.fr/auth/resources/vh5yw/login/students/img/42_logo.svg`
- Futura PT loads through the reference page's Adobe Fonts stylesheet at
  `https://use.typekit.net/qwf8gat.css`, with a sans-serif fallback if unavailable.

These resources were inspected on November 26, 2026. Password reset, staff
sign-in, and legal links navigate to their official destinations in the current
authentication browser, without opening a popup or a new tab. The app's
existing session persistence policy is unchanged; Remember me is passed to the
official sign-in form when selected.
