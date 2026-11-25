import type { Page, Response } from "playwright";

const cdnOrigin = "https://cdn.intra.42.fr";
const avatarTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const maxAvatarBytes = 2 * 1024 * 1024;

export function watchPortalAvatar(page: Page) {
  const images = new Map<string, Response>();

  function collect(response: Response) {
    const url = new URL(response.url());
    if (
      url.origin === cdnOrigin &&
      url.pathname.startsWith("/users/") &&
      response.request().resourceType() === "image" &&
      response.ok()
    ) {
      images.set(url.href, response);
    }
  }

  page.on("response", collect);

  return async function readAvatar() {
    try {
      const image = await page.waitForFunction(
        () => {
          if (location.origin !== "https://profile-v3.intra.42.fr") return null;
          const account = document.querySelector("[data-login]")?.parentElement;
          const avatar = account?.querySelector("img");
          return avatar?.complete && avatar.naturalWidth > 0 ? avatar.currentSrc : null;
        },
        undefined,
        { timeout: 4_000 },
      );
      const source = await image.jsonValue();
      const response = source ? images.get(source) : undefined;
      if (!response) return undefined;

      const headers = response.headers();
      const type = headers["content-type"]?.split(";", 1)[0].trim().toLowerCase();
      if (!type || !avatarTypes.has(type) || Number(headers["content-length"]) > maxAvatarBytes) {
        return undefined;
      }

      const body = await response.body();
      if (body.length === 0 || body.length > maxAvatarBytes) return undefined;
      return `data:${type};base64,${body.toString("base64")}`;
    } catch {
      return undefined;
    } finally {
      page.off("response", collect);
    }
  };
}
