import { useIsFetching } from "@tanstack/react-query";
import { File, Paths } from "expo-file-system";
import { useGlobalSearchParams, usePathname } from "expo-router";
import { useEffect } from "react";

export function ScreenshotReady() {
  const { screenshot } = useGlobalSearchParams<{ screenshot?: string }>();
  const path = usePathname();
  const fetching = useIsFetching();

  useEffect(() => {
    if (fetching) return;
    const receipt =
      typeof screenshot === "string" && /^\d+-\d+-\d+$/.test(screenshot)
        ? `${screenshot}:${path}`
        : "ready";
    // Give dependent reads and the native route transition time to settle.
    const timer = setTimeout(() => {
      const ready = new File(Paths.document, "intra42-screenshot-ready");
      ready.create({ overwrite: true });
      ready.write(receipt);
    }, 1200);
    return () => clearTimeout(timer);
  }, [fetching, path, screenshot]);

  return null;
}
