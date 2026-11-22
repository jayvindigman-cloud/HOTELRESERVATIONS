import { useEffect, useRef, useState } from "react";
import { API_BASE, accountFetch, readJson } from "../hotel-api";
import { roomDescriptions } from "../data/hotelCatalog";

const formatter = new Intl.DateTimeFormat("en-PH", { year: "numeric", month: "long", timeZone: "UTC" });
const dayFormatter = new Intl.DateTimeFormat("en-PH", { dateStyle: "full", timeZone: "UTC" });
const dayLabels = { empty: "No bookings", pending: "Pending", booked: "Partly booked", full: "Fully booked" };

export default function AdminCalendar({ reservations, rooms, today, onOpenBooking, onDecision, onEarlyCheckout }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(null);
  const [guestPhotos, setGuestPhotos] = useState({});
  const panel = useRef(null);
  const [decision, setDecision] = useState(null);
  const [roomNumber, setRoomNumber] = useState("");
  const [roomChoices, setRoomChoices] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [saving, setSaving] = useState(false);
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const occupied = (date) => reservations.filter((item) =>
    ["Pending", "Confirmed", "Checked out"].includes(item.status) && item.checkIn <= date && (item.actualCheckOut || item.checkOut) > date);

  const bookings = selected ? occupied(selected) : [];
  const inventory = rooms.filter((room) => room.is_active && Number(room.total_units) > 0);
  const emailList = JSON.stringify([...new Set(bookings.map((item) => item.email?.trim().toLowerCase()).filter(Boolean))].sort());

  useEffect(() => {
    const controller = new AbortController();
    const emails = JSON.parse(emailList);
    Promise.allSettled(emails.map(async (email) => {
      const params = new URLSearchParams({ email });
      const { profile } = await accountFetch(API_BASE + "/admin/client-profile?" + params, { signal: controller.signal }).then(readJson);
      return [email, profile?.photoURL || ""];
    })).then((results) => {
      if (!controller.signal.aborted) setGuestPhotos(Object.fromEntries(results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [])));
    });
    return () => controller.abort();
  }, [emailList]);

  const confirmed = bookings.filter((item) => item.status !== "Pending").length;
  const approvalId = decision?.status === "Confirmed" ? decision.bookingId : null;

  useEffect(() => {
    if (!approvalId) return;
    const controller = new AbortController();
    accountFetch(API_BASE + "/reservations/" + encodeURIComponent(approvalId) + "/available-key-rooms", { signal: controller.signal })
      .then(readJson)
      .then(({ rooms }) => { if (!controller.signal.aborted) setRoomChoices(rooms); })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setRoomChoices([]);
        setFeedback({ text: error.message, error: true });
      });
    return () => controller.abort();
  }, [approvalId]);

  function move(offset) {
    setMonth(new Date(Date.UTC(year, monthNumber - 1 + offset, 1)).toISOString().slice(0, 7));
    setSelected(null);
  }

  function showDay(date) {
    setSelected(date);
    setDecision(null);
    setFeedback(null);
    panel.current.showModal();
  }

  function choose(item, status) {
    setRoomNumber("");
    setRoomChoices(null);
    setFeedback(null);
    setDecision({ id: item.id, bookingId: item.dbId || item.id, status });
  }

  async function submitDecision(event, item) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      if (decision.status === "Checked out") {
        await onEarlyCheckout(item);
        setFeedback({ text: "Early checkout recorded. The remaining nights are available." });
      } else {
        await onDecision(item, decision.status, roomNumber.trim());
        setFeedback({ text: decision.status === "Confirmed" ? "Reservation approved." : "Reservation declined." });
      }
      setDecision(null);
    } catch (error) {
      setFeedback({ text: error.message, error: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="hotel-glass admin-calendar">
      <h3>Room occupancy calendar</h3>
      <p>Select a date to see reservations for that night.</p>
      <div className="admin-calendar-controls">
        <button className="hotel-action secondary" type="button" aria-label="Previous month" onClick={() => move(-1)}>{"\u2039"}</button>
        <strong aria-live="polite">{formatter.format(first)}</strong>
        <button className="hotel-action secondary" type="button" aria-label="Next month" onClick={() => move(1)}>{"\u203a"}</button>
        <button className="hotel-action secondary" type="button" onClick={() => { setMonth(today.slice(0, 7)); showDay(today); }}>Today</button>
      </div>
      <ul className="admin-calendar-legend" aria-label="Calendar colors">
        {Object.entries(dayLabels).map(([status, label]) => <li key={status} data-occupancy={status}>{label}</li>)}
      </ul>
      <div className="admin-calendar-grid">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <strong key={day}>{day}</strong>)}
        {Array.from({ length: first.getUTCDay() }, (_, index) => <span key={"blank" + index} />)}
        {Array.from({ length: count }, (_, index) => {
          const day = index + 1;
          const date = month + "-" + String(day).padStart(2, "0");
          const stays = occupied(date);
          const confirmedStays = stays.filter((item) => item.status !== "Pending");
          const pending = stays.length - confirmedStays.length;
          const full = inventory.length > 0 && inventory.every((room) =>
            confirmedStays.filter((item) => item.roomType === room.name).length >= Number(room.total_units));
          const occupancy = full ? "full" : pending ? "pending" : confirmedStays.length ? "booked" : "empty";
          return (
            <button type="button" key={date} data-occupancy={occupancy}
              aria-current={date === selected ? "date" : undefined} aria-haspopup="dialog"
              aria-label={date + ", " + dayLabels[occupancy] + ", " + confirmedStays.length + " booked, " + pending + " pending"}
              onClick={() => showDay(date)}>
              <strong>{day}</strong><small>{occupancy === "pending" ? pending + " pending" : dayLabels[occupancy]}</small>
            </button>
          );
        })}
      </div>
      <dialog ref={panel} className="admin-calendar-day" aria-labelledby="admin-calendar-selected" onClose={() => setSelected(null)}
        onCancel={(event) => { if (saving) event.preventDefault(); }}
        onClick={(event) => { if (!saving && event.target === event.currentTarget) panel.current.close(); }}>
        <div className="admin-calendar-day-content">
          <header>
            <div>
              <p>Reservations</p>
              <h4 id="admin-calendar-selected">{selected ? dayFormatter.format(new Date(selected)) : "Selected date"}</h4>
              {bookings.length > 0 && <p>{confirmed} confirmed {"\u00b7"} {bookings.length - confirmed} pending</p>}
            </div>
            <button className="hotel-action secondary" type="button" autoFocus disabled={saving} onClick={() => panel.current.close()}>Close</button>
          </header>
          {feedback && <p className="account-notice" role={feedback.error ? "alert" : "status"}>{feedback.text}</p>}
          {bookings.length ? (
            <div className="admin-calendar-bookings">
              {bookings.map((item) => {
                const avatar = guestPhotos[item.email?.trim().toLowerCase()];
                const room = rooms.find((entry) => entry.name === item.roomType);
                const photo = room?.image || roomDescriptions.find((entry) => entry.name === item.roomType)?.image;
                return <article key={item.id}>
                  <div className="calendar-booking-identity">
                    {avatar ? <img className="calendar-guest-avatar" src={avatar} alt="" referrerPolicy="no-referrer" />
                      : <span className="calendar-guest-avatar" aria-hidden="true">{item.guestName?.charAt(0).toUpperCase() || "G"}</span>}
                    <strong>{item.guestName}</strong><span data-status={item.status}>{item.status}</span>
                  </div>
                  {photo && <img className="calendar-room-photo" src={photo} alt={item.roomType} loading="lazy" />}
                  <p>{item.roomType}{item.roomNumber && " \u00b7 Room " + item.roomNumber}</p>
                  {decision?.id === item.id ? (
                    <form className="admin-calendar-decision" onSubmit={(event) => submitDecision(event, item)}>
                      {decision.status === "Confirmed" ? <>
                        <label>Available room and key
                          <select required value={roomNumber} onChange={(event) => setRoomNumber(event.target.value)} disabled={saving || !roomChoices?.length}>
                            <option value="">{roomChoices === null ? "Loading available rooms…" : "Choose a room"}</option>
                            {roomChoices?.map((room) => <option key={room.roomNumber} value={room.roomNumber}>
                              {room.roomNumber} · {room.keyTag}
                            </option>)}
                          </select>
                        </label>
                        {roomChoices?.length === 0 && !feedback?.error && <p>No rooms of this type have an available key for these dates.</p>}
                        {item.paymentMethod === "GCash" && <p>Verify GCash reference <strong>{item.paymentReference || "on file"}</strong> before approving.</p>}
                      </> : decision.status === "Checked out" ? <p>Check out {item.guestName} today and release the remaining nights?</p> : <p>Decline this reservation for {item.guestName}?</p>}
                      <div className="admin-calendar-actions">
                        <button type="submit" className={"hotel-action" + (decision.status === "Cancelled" ? " danger" : "")}
                          disabled={saving || (decision.status === "Confirmed" && !roomNumber.trim())}>
                          {saving ? "Saving..." : decision.status === "Confirmed" ? "Confirm approval" : decision.status === "Checked out" ? "Confirm early checkout" : "Confirm decline"}
                        </button>
                        <button type="button" className="hotel-action secondary" disabled={saving} onClick={() => setDecision(null)}>Back</button>
                      </div>
                    </form>
                  ) : (
                    <div className="admin-calendar-actions">
                      {item.status === "Pending" && <>
                        <button type="button" className="hotel-action" disabled={saving} onClick={() => choose(item, "Confirmed")}>Approve</button>
                        <button type="button" className="hotel-action danger" disabled={saving} onClick={() => choose(item, "Cancelled")}>Decline</button>
                      </>}
                      {item.status === "Confirmed" && item.checkIn <= today && item.checkOut > today && (
                        <button type="button" className="hotel-action" disabled={saving} onClick={() => choose(item, "Checked out")}>Check out early</button>
                      )}
                      <button type="button" className="hotel-action secondary" disabled={saving} onClick={() => {
                        panel.current.close();
                        onOpenBooking(item.id);
                      }}>Open booking</button>
                    </div>
                  )}
                </article>;
              })}
            </div>
          ) : <p className="admin-calendar-empty">No reservations for this night.</p>}
        </div>
      </dialog>
    </section>
  );
}
