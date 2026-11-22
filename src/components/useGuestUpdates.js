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

function readSeen(storageKey) {
  if (!storageKey) return [];
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey));
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

export default function useGuestUpdates(api, user) {
  const storageKey = user ? "hytech.guest.updates." + user.uid : null;
  const [seenState, setSeen] = useState(() => ({ storageKey, values: readSeen(storageKey) }));
  const [updates, setUpdates] = useState(null);
  const seen = seenState.storageKey === storageKey ? seenState.values : readSeen(storageKey);

  useEffect(() => {
    if (!user?.email) return;
    const controller = new AbortController();
    const query = "?" + new URLSearchParams({ email: user.email });
    async function refresh() {
      const kinds = ["reservations", "orders"];
      const results = await Promise.allSettled(kinds.map((kind) =>
        accountFetch(api + "/" + kind + query, { signal: controller.signal }).then(readJson)));
      if (!controller.signal.aborted) {
        setUpdates((previous) => {
          const current = previous?.storageKey === storageKey
            ? { ...previous } : { storageKey, reservations: [], orders: [] };
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
      const current = previous.storageKey === storageKey ? previous.values : readSeen(storageKey);
      const next = [...new Set([...current, ...viewed])];
      if (previous.storageKey === storageKey && next.length === current.length) return previous;
      return { storageKey, values: next };
    });
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || seenState.storageKey !== storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify(seenState.values)); } catch {}
  }, [storageKey, seenState]);

  const current = storageKey && updates?.storageKey === storageKey ? updates : null;
  return {
    reservations: Boolean(current?.reservations.some((key) => !seen.includes(key))),
    orders: Boolean(current?.orders.some((key) => !seen.includes(key))),
    markViewed,
  };
}
