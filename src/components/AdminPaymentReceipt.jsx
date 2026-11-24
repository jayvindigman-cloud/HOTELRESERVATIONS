import { useEffect, useState } from "react";
import { API_BASE, accountFetch, readJson } from "../hotel-api";

export default function AdminPaymentReceipt({ reservationId }) {
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let url;
    async function load() {
      try {
        const response = await accountFetch(API_BASE + "/reservations/" + reservationId + "/payment-receipt", { signal: controller.signal });
        if (!response.ok) await readJson(response);
        const image = await response.blob();
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(image);
        setPhoto(url);
      } catch (err) {
        if (!controller.signal.aborted) setError(err.message);
      }
    }
    load();
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [open, reservationId]);

  return <div className="payment-receipt-view">
    <button type="button" className="hotel-action secondary" aria-expanded={open} onClick={() => {
      setPhoto("");
      setError("");
      setOpen(!open);
    }}>{open ? "Close GCash receipt" : "View GCash receipt"}</button>
    {open && (photo ? <a href={photo} target="_blank" rel="noopener noreferrer" aria-label="Open full-size GCash receipt">
      <img src={photo} alt="Uploaded GCash receipt" />
    </a> : <p role="status">{error || "Loading receipt..."}</p>)}
  </div>;
}
