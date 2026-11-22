import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { formatPeso, hotelDate, hotelToday } from "../hotel-api";

const periods = [
  [1, "Today"],
  [7, "Last 7 days"],
  [30, "Last 30 days"],
  [365, "Last 365 days"],
];

export default function BookingReport({ reservations, rooms }) {
  const [days, setDays] = useState(1);
  const [room, setRoom] = useState("");
  useEffect(() => {
    document.body.classList.add("has-booking-report");
    return () => document.body.classList.remove("has-booking-report");
  }, []);

  const today = hotelToday();
  const firstDate = new Date(today + "T00:00:00Z");
  firstDate.setUTCDate(firstDate.getUTCDate() - (days - 1));
  const start = firstDate.toISOString().slice(0, 10);
  const withDate = reservations.map((booking) => ({
    ...booking,
    bookedOn: booking.createdEpoch ? hotelDate(new Date(booking.createdEpoch * 1000)) : String(booking.createdAt || "").slice(0, 10),
  }));
  const results = withDate.filter((booking) => booking.bookedOn >= start && booking.bookedOn <= today && (!room || booking.roomType === room));
  const roomOptions = [...new Set([...rooms.map((item) => item.name), ...reservations.map((booking) => booking.roomType)])].filter(Boolean).sort();
  const roomCounts = results.reduce((counts, item) => ({ ...counts, [item.roomType]: (counts[item.roomType] || 0) + 1 }), {});
  const guests = results.reduce((sum, booking) => sum + Number(booking.guests || 0), 0);

  return (
    <section className="booking-report" aria-labelledby="booking-report-title">
      <h3 id="booking-report-title">Print booking report</h3>
      <div className="booking-report-controls">
        <label>Booked during<select value={days} onChange={(event) => setDays(Number(event.target.value))}>
          {periods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label>Room type<select value={room} onChange={(event) => setRoom(event.target.value)}>
          <option value="">All room types</option>
          {roomOptions.map((name) => <option key={name}>{name}</option>)}
        </select></label>
        <button type="button" className="hotel-action" onClick={() => window.print()}>Print report</button>
      </div>
      <p><strong>{results.length}</strong> reservations {"·"} <strong>{guests}</strong> guests</p>
      {createPortal(
        <section className="booking-print">
          <h1>Hytech Hotel &amp; Bistro</h1>
          <h2>Booking report</h2>
          <p>Booked from {start} to {today} {"·"} {room || "All room types"}</p>
          <p><strong>{results.length} reservations {"·"} {guests} guests</strong></p>
          <ul>{Object.entries(roomCounts).map(([name, count]) => <li key={name}>{name} {"·"} {count} reservations</li>)}</ul>
          {!results.length && <p>No reservations in this period.</p>}
          {results.map((booking) => (
            <article key={booking.id}>
              <h3>{booking.id} {"·"} {booking.roomType} {"·"} {booking.status}</h3>
              <p>Booked {booking.bookedOn} {"·"} Room number {booking.roomNumber || "Unassigned"}</p>
              <p>Contact: {booking.guestName} {"·"} {booking.email} {"·"} {booking.phone}</p>
              <p>Guests: {booking.guests}{booking.guestNames.length > 0 && (" (" + booking.guestNames.join(", ") + ")")}</p>
              <p>Stay: {booking.checkIn} to {booking.checkOut}{booking.actualCheckOut && (" | Checked out " + booking.actualCheckOut)}</p>
              <p>Amount: {formatPeso(booking.totalAmount)} {"·"} {booking.paymentMethod} {"·"} {booking.paymentStatus}
                {booking.paymentReference && (" | Reference " + booking.paymentReference)}</p>
              {booking.voucherCode && <p>Discount: {booking.voucherCode} ({formatPeso(booking.discountAmount)})</p>}
              {booking.notes && <p>Notes: {booking.notes}</p>}
              <p>Extras: {booking.extras.length ? booking.extras.map((item) =>
                item.name + (item.quantity ? " × " + item.quantity : "") + " (" + formatPeso(item.amount) + ")").join(", ") : "None"}</p>
            </article>
          ))}
        </section>, document.body
      )}
    </section>
  );
}
