import { useCallback, useEffect, useState } from "react";
import { accountFetch, hotelToday, readJson } from "../hotel-api";

function alertKeys(kind, records) {
  const today = hotelToday();
  return records.flatMap((item) => {
    if (kind === "reservations" ? item.status === "Confirmed" && item.checkOut >= today
      : ["Preparing", "Served"].includes(item.status)) {
      return [kind + ":" + item.id + ":" + item.status];
    }
    return [];
  });
}

export default function useGuestUpdates(api, user) {
  const storageKey = user ? "hytech.guest.updates." + user.uid : null;
  const [seen, setSeen] = useState(() => {
    if (!storageKey) return [];
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey));
      return Array.isArray(stored) ? stored : [];
    } catch {
      return [];
    }
  });
  const [keys, setKeys] = useState({ reservations: [], orders: [] });

  useEffect(() => {
    if (!user?.email) return;
    const controller = new AbortController();
    const query = "?" + new URLSearchParams({ email: user.email });
    async function refresh() {
      const kinds = ["reservations", "orders"];
      const results = await Promise.allSettled(kinds.map((kind) =>
        accountFetch(api + "/" + kind + query, { signal: controller.signal }).then(readJson)));
      if (!controller.signal.aborted) {
        setKeys((previous) => {
          const current = { ...previous };
          results.forEach((result, index) => {
            if (result.status === "fulfilled" && Array.isArray(result.value)) current[kinds[index]] = alertKeys(kinds[index], result.value);
          });
          return current;
        });
      }
    }
    refresh();
    const timer = setInterval(refresh, 20000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [api, storageKey, user?.email]);

  const markViewed = useCallback((kind, records) => {
    if (!storageKey) return;
    const viewed = alertKeys(kind, records);
    setSeen((previous) => {
      const next = [...new Set([...previous, ...viewed])];
      if (next.length === previous.length && next.every((key, index) => key === previous[index])) return previous;
      return next;
    });
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify(seen)); } catch {}
  }, [storageKey, seen]);

  return {
    reservations: keys.reservations.some((key) => !seen.includes(key)),
    orders: keys.orders.some((key) => !seen.includes(key)),
    markViewed,
  };
}
