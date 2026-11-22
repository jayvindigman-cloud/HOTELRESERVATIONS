import { useEffect, useRef, useState } from "react";
import { API_BASE, accountFetch, hotelToday, readJson } from "../hotel-api";
import { createPortal } from "react-dom";
import AdminIcon from "./AdminIcon";
import { roomDescriptions } from "../data/hotelCatalog";
import "./AdminKeysTab.css";

const API = API_BASE + "/keys";
const actionsByStatus = {
  Available: ["Assign", "Issue", "Lost", "Maintenance", "Delete"],
  Assigned: ["Issue", "Release", "Lost"],
  Issued: ["Return", "Lost"],
  Lost: ["Restore", "Delete"],
  Maintenance: ["Restore", "Delete"],
};
const actionLabels = {
  Assign: "Assign to guest", Issue: "Hand over", Return: "Record return", Release: "Release assignment",
  Lost: "Mark lost", Maintenance: "Mark damaged", Restore: "Mark available", Delete: "Delete key",
};
const statusLabel = (status) => status === "Maintenance" ? "Damaged" : status;
const emptyForm = { keyTag: "", roomNumber: "" };
const formatTime = (value) => value ? new Date(value.replace(" ", "T")).toLocaleString("en-PH") : "";

export default function AdminKeysTab({ reservations, roomTypes }) {
  const [data, setData] = useState({ keys: [], history: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [roomFilter, setRoomFilter] = useState("");
  const [bookedOnly, setBookedOnly] = useState(false);
  const [expandedRoom, setExpandedRoom] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [selected, setSelected] = useState(null);
  const [reservationId, setReservationId] = useState("");
  const [notes, setNotes] = useState("");
  const dialog = useRef(null);

  async function load() {
    setLoading(true);
    try {
      setData(await readJson(await accountFetch(API)));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load().catch((failure) => setError(failure.message)); }, []);

  function open(key, action, roomNumber = "", bookingId = "") {
    setSelected({ key, action });
    setForm({ ...emptyForm, roomNumber });
    setReservationId(String(bookingId));
    setNotes("");
    setError("");
    setMessage("");
    dialog.current.showModal();
  }

  async function save(event) {
    event.preventDefault();
    if (busy) return;
    const { key, action } = selected;
    setBusy(true);
    setError("");
    try {
      const result = await readJson(await accountFetch(key ? API + "/" + key.id : API, {
        method: key ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(key ? { action, reservationId, notes } : form),
      }));
      dialog.current.close();
      setSelected(null);
      if (action === "Return") {
        setExpandedRoom(key.roomNumber);
        setBookedOnly(false);
        setRoomFilter("");
        setStatus("All");
        setQuery(key.keyTag);
        setMessage(`${key.keyTag} returned to Room ${key.roomNumber} and is available again.`);
      } else {
        setMessage(action === "Assign" ? "Key assigned to the guest." : result.message);
      }
      await load();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  const today = hotelToday();
  const guestsByRoom = new Map();
  for (const booking of reservations) {
    const number = String(booking.roomNumber || "").trim();
    if (!number || booking.status !== "Confirmed" || (booking.actualCheckOut || booking.checkOut) <= today) continue;
    if (!guestsByRoom.has(number)) guestsByRoom.set(number, []);
    guestsByRoom.get(number).push(booking);
  }
  for (const guests of guestsByRoom.values()) guests.sort((first, second) => first.checkIn.localeCompare(second.checkIn));

  const needsBooking = selected?.action === "Assign" || (selected?.action === "Issue" && selected.key.status === "Available");
  const eligible = needsBooking ? (guestsByRoom.get(selected.key.roomNumber) || [])
    .filter((booking) => selected.action !== "Issue" || booking.checkIn <= today) : [];
  const search = query.trim().toLowerCase();
  const rooms = new Map();
  const latestStayByRoom = new Map();
  const registeredTypeByRoom = new Map();
  for (const reservation of reservations) {
    const number = String(reservation.roomNumber || "").trim();
    if (!number) continue;
    if (!rooms.has(number)) rooms.set(number, []);
    const previous = latestStayByRoom.get(number);
    if (!previous || reservation.checkIn > previous.checkIn) latestStayByRoom.set(number, reservation);
  }
  for (const key of data.keys) {
    const number = key.roomNumber.trim();
    if (key.roomType) registeredTypeByRoom.set(number, key.roomType);
    if (!rooms.has(number)) rooms.set(number, []);
    rooms.get(number).push(key);
  }
  const roomOptions = [...rooms.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  const pictures = new Map();
  for (const room of roomTypes) {
    const catalogRoom = roomDescriptions.find((item) =>
      item.name === room.name || item.name.toLowerCase().replaceAll(" ", "-") === room.slug);
    pictures.set(room.name, room.image || catalogRoom?.image);
  }
  const selectedRoom = pictures.has(roomFilter) ? roomFilter : "";
  const roomTypeFor = (number) => registeredTypeByRoom.get(number) || latestStayByRoom.get(number)?.roomType;
  const roomPanels = roomOptions.flatMap(([number, keys]) => {
      if (selectedRoom && roomTypeFor(number) !== selectedRoom) return [];
      if (bookedOnly && !guestsByRoom.has(number)) return [];
      const visible = keys.filter((key) => (status === "All" || key.status === status) &&
        [key.keyTag, number, key.holder, key.bookingCode, ...(guestsByRoom.get(number) || []).map((booking) => booking.guestName + " " + booking.id)]
          .join(" ").toLowerCase().includes(search));
      const showEmpty = !keys.length && status === "All" && number.toLowerCase().includes(search);
      return visible.length || showEmpty ? [{ number, total: keys.length, visible }] : [];
    });
  const history = data.history.filter((item) =>
    !selectedRoom || (item.roomType || roomTypeFor(item.roomNumber.trim())) === selectedRoom);
  const printableKeys = roomOptions.flatMap(([number, keys]) =>
    (!selectedRoom || roomTypeFor(number) === selectedRoom) && (!bookedOnly || guestsByRoom.has(number)) ? keys : []);
  const summaries = [
    ["Total keys", "Key Management", data.keys.length],
    ["Available", "Check", data.keys.filter((key) => key.status === "Available").length],
    ["Assigned / issued", "Clients", data.keys.filter((key) => ["Assigned", "Issued"].includes(key.status)).length],
    ["Lost / damaged", "Extras", data.keys.filter((key) => ["Lost", "Maintenance"].includes(key.status)).length],
  ];

  return (
    <section className="key-management" aria-label="Key management">
      <header className="key-hero hotel-glass">
        <div>
          <h3><AdminIcon name="Key Management" /> Key Management</h3>
          <p>Assign keys to upcoming guests and track handovers and returns.</p>
        </div>
        <div className="key-hero-actions">
          <button type="button" className="hotel-action" disabled={loading || !printableKeys.length} onClick={() => window.print()}>
            {selectedRoom || bookedOnly ? "Print room labels" : "Print all key labels"}
          </button>
          <button type="button" className="hotel-action key-add" onClick={() => open(null, "Add")}><AdminIcon name="Add" /> Add key</button>
        </div>
      </header>
      {error && !selected && <p role="alert" className="account-notice">{error}</p>}
      {message && <p role="status" className="account-notice">{message}</p>}
      <div className="key-summary">
        {summaries.map(([label, icon, value]) => <div key={label} className="hotel-glass">
          <span>{label} <AdminIcon name={icon} /></span><strong>{value}</strong>
        </div>)}
      </div>
      <div className="key-room-filter" role="group" aria-label="Show rooms by booking">
        <button type="button" aria-pressed={!bookedOnly} onClick={() => setBookedOnly(false)}>All key rooms</button>
        <button type="button" aria-pressed={bookedOnly} onClick={() => {
          setBookedOnly(true);
          setRoomFilter("");
          setStatus("All");
          setQuery("");
        }}>Booked guests ({guestsByRoom.size} rooms)</button>
      </div>
      {pictures.size > 0 && <div className="key-room-filter" role="group" aria-label="Filter by room name">
        <button type="button" aria-pressed={!selectedRoom} onClick={() => setRoomFilter("")}>All rooms</button>
        {[...pictures].map(([name, photo]) => (
          <button type="button" key={name} aria-pressed={selectedRoom === name} onClick={() => setRoomFilter(name)}>
            {photo ? <img src={photo} alt="" loading="lazy" /> : <AdminIcon name="Rooms" />}
            <strong>{name}</strong>
          </button>
        ))}
      </div>}
      <div className="key-filters">
        <input aria-label="Search keys" placeholder="Search key, room, guest or booking" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select aria-label="Filter key status" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="All">All statuses</option>
          {Object.keys(actionsByStatus).map((value) => <option value={value} key={value}>{statusLabel(value)}</option>)}
        </select>
        <button type="button" className="hotel-action secondary" disabled={loading} onClick={() => load().catch((failure) => setError(failure.message))}>Refresh</button>
      </div>
      <div className="key-room-panels">
        {!roomPanels.length && <p>{loading ? "Loading keys..." : bookedOnly && !guestsByRoom.size
          ? "No confirmed upcoming or active bookings have an assigned room." : "No rooms or keys match these filters."}</p>}
        {roomPanels.map(({ number, total, visible }) => {
          const guests = guestsByRoom.get(number) || [];
          const availableKey = visible.find((key) => key.status === "Available");
          const roomType = roomTypeFor(number);
          const photo = pictures.get(roomType);
          const expanded = expandedRoom === number;
          const detailsId = "key-room-" + encodeURIComponent(number);
          return (
          <section className="key-room-panel hotel-glass" key={number} data-booked={guests.length > 0} aria-label={"Keys for room " + number}>
            <header className="key-room-heading">
              <button type="button" className="key-room-toggle" aria-expanded={expanded} aria-controls={detailsId}
                onClick={() => setExpandedRoom(expanded ? "" : number)}>
              <span className="key-room-identity">
                {photo && <img className="key-room-photo" src={photo} alt="" loading="lazy" width={52} height={38} />}
                <span className="key-room-label"><strong>Room {number}</strong>
                  <small>{roomType || "Room type unlinked"} · {total} {total === 1 ? "key" : "keys"}</small>
                </span>
              </span>
              {guests.length > 0 && <span className="key-room-booked">Booked</span>}
              <span aria-hidden="true">{expanded ? "−" : "+"}</span>
              </button>
            </header>
            <div id={detailsId} className="key-room-body" hidden={!expanded}>
            <button type="button" className="hotel-action secondary" onClick={() => open(null, "Add", number)}>Add key</button>
            {guests.length > 0 && <ul className="key-room-guests" aria-label="Confirmed guests">
              {guests.map((booking) => <li key={booking.id}>
                <div>
                  <strong>{booking.guestName}</strong>
                  <small>{booking.checkIn} to {booking.checkOut} · {booking.id}</small>
                </div>
                {bookedOnly && availableKey && <button type="button" className="hotel-action key-assign" disabled={busy}
                  onClick={() => open(availableKey, "Assign", number, booking.dbId)}>Assign key</button>}
              </li>)}
            </ul>}
            {!total && <p className="key-room-empty">No keys registered for this room.</p>}
            {!!visible.length && <div className="key-grid">
              {visible.map((key) => {
                const actions = (actionsByStatus[key.status] || []).filter((action) => {
                  if (action === "Assign") return bookedOnly && key.id !== availableKey?.id && guests.length > 0;
                  if (action !== "Issue") return true;
                  if (key.status === "Assigned") return !key.needsAttention && key.checkIn && key.checkIn <= today;
                  return guests.some((booking) => booking.checkIn <= today);
                });
                const quick = actions.filter((action) => ["Assign", "Issue", "Return", "Release", "Restore"].includes(action));
                const secondary = actions.filter((action) => !quick.includes(action));
                return <article key={key.id} className="key-card hotel-glass" data-status={key.status}>
                  <header>
                    <span className="key-card-icon"><AdminIcon name="Key Management" /></span>
                    <div><h4>{key.keyTag}</h4></div>
                    <span className="key-state">{statusLabel(key.status)}</span>
                  </header>
                  {key.holder && <p><strong>{key.holder}</strong> {"\u00b7"} {key.bookingCode}</p>}
                  {key.checkIn && <p>Stay {key.checkIn} to {key.checkOut}</p>}
                  {!!key.needsAttention && <p className="account-notice">{key.status === "Issued" ? "Verify the key was returned before making it available." : "Booking ended, was cancelled, or changed rooms. Review and release this assignment."}</p>}
                  {key.issuedAt && <p>Handed over {formatTime(key.issuedAt)}</p>}
                  {quick.length > 0 && <div className="key-card-actions">
                    {quick.map((action) => <button type="button" className={action === "Assign" ? "hotel-action key-assign" : "hotel-action"} key={action}
                      disabled={busy} onClick={() => open(key, action)}>{actionLabels[action]}</button>)}
                  </div>}
                  {secondary.length > 0 && <details className="key-more-actions">
                    <summary>More actions</summary>
                    <div className="key-card-actions">
                      {secondary.map((action) => <button type="button" className={"hotel-action " + (action === "Delete" ? "danger" : "secondary")}
                        key={action} disabled={busy} onClick={() => open(key, action)}>{actionLabels[action]}</button>)}
                    </div>
                  </details>}
                </article>;
              })}
            </div>}
            </div>
          </section>
        ); })}
      </div>
      <details className="key-history hotel-glass">
        <summary>Recent activity</summary>
        {!history.length && <p>No key activity recorded.</p>}
        {history.length > 0 && <ul>{history.map((item) => <li key={item.id}>
          <strong>{item.action} {"\u00b7"} {item.keyTag}</strong>
          <span>Room {item.roomNumber}{item.holder && " \u00b7 " + item.holder}</span>
          {item.notes && <span>{item.notes}</span>}
          <small>{formatTime(item.createdAt)}</small>
        </li>)}</ul>}
      </details>
      <dialog ref={dialog} className="key-dialog" data-action={selected?.action} aria-labelledby="key-dialog-title"
        onCancel={(event) => { if (busy) event.preventDefault(); }}
        onClose={() => setSelected(null)}>
        <div>
          <h3 id="key-dialog-title">{selected?.key ? actionLabels[selected.action] : "Add key"}</h3>
          {selected?.key && <p>{selected.key.keyTag} {"\u00b7"} Room {selected.key.roomNumber}</p>}
          {error && <p role="alert" className="account-notice">{error}</p>}
          {selected && <form onSubmit={save}>
            {!selected.key && <>
              <label>Key tag<input required maxLength={60} value={form.keyTag} onChange={(event) => setForm({ ...form, keyTag: event.target.value })} /></label>
              <label>Room number<input required maxLength={60} value={form.roomNumber} onChange={(event) => setForm({ ...form, roomNumber: event.target.value })} /></label>
            </>}
            {needsBooking && <label>Guest reservation
              <select required value={reservationId} onChange={(event) => setReservationId(event.target.value)}>
                <option value="">Select a guest</option>
                {eligible.map((booking) => <option key={booking.dbId} value={booking.dbId}>{booking.guestName} {"\u00b7"} {booking.checkIn} {"\u00b7"} {booking.id}</option>)}
              </select>
              {!eligible.length && <small>No eligible booking for this room. Confirm a reservation and check its assigned room and dates.</small>}
            </label>}
            {selected.action === "Delete" && <p>Remove this key from the register? Its activity history will be kept.</p>}
            {selected.action === "Return" && <p>Recording the return makes this key available again for Room {selected.key.roomNumber}.</p>}
            {selected.key?.holder && <p>Guest: <strong>{selected.key.holder}</strong></p>}
            {selected.key && <label>Notes (optional)<textarea rows={2} maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>}
            <div className="key-card-actions">
              <button type="submit" className={"hotel-action" + (selected.action === "Delete" ? " danger" : "")} disabled={busy || (needsBooking && !reservationId)}>
                {busy ? "Saving..." : selected.action === "Delete" ? "Delete key" : selected.action === "Return" ? "Confirm return" : "Save"}
              </button>
              <button type="button" className="hotel-action secondary" disabled={busy} onClick={() => dialog.current.close()}>Cancel</button>
            </div>
          </form>}
        </div>
      </dialog>
      {createPortal(
        <section className="key-print-sheet" aria-label="Printable key labels">
          {printableKeys.map((key) => <div className="key-print-label" key={key.id}>
            <span>{roomTypeFor(key.roomNumber.trim())}</span>
            <strong>{key.roomNumber}</strong>
            <span>{key.keyTag}</span>
          </div>)}
        </section>,
        document.body
      )}
    </section>
  );
}
