import { useEffect, useRef, useState } from "react";
import RoomAvailabilityCalendar from "./RoomAvailabilityCalendar";

export default function BookingRoomCalendar({ room, api, today, checkIn, onClose, onDatePick }) {
  const dialog = useRef(null);
  const [selectedDate, setSelectedDate] = useState("");

  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);

  return (
    <dialog ref={dialog} className="room-details booking-room-calendar"
      aria-labelledby="booking-room-calendar-title" onCancel={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="room-details-content">
        <button type="button" className="room-details-close" aria-label="Close availability calendar" onClick={onClose}>{"\u00d7"}</button>
        <h2 id="booking-room-calendar-title">{room.name}</h2>
        <RoomAvailabilityCalendar room={room} api={api} today={today}
          initialDate={checkIn >= today ? checkIn : today}
          selectedDate={selectedDate} setSelectedDate={setSelectedDate} onDatePick={onDatePick} />
      </div>
    </dialog>
  );
}
