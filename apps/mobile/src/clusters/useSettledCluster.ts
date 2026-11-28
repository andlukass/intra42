import { useEffect, useState } from "react";

export function useSettledCluster(id?: number) {
  const [settled, setSettled] = useState<number>();
  useEffect(() => {
    if (id === undefined) return;
    // A selection that needs no scrolling has no momentum-end event.
    const timer = setTimeout(() => setSettled(id), 350);
    return () => clearTimeout(timer);
  }, [id]);
  return { ready: id === settled, onSettled: () => setSettled(id) };
}
