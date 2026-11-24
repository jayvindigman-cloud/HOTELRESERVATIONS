import { useEffect, useRef, useState } from "react";
import { ROOMS_DATA } from "../data/room";
import RoomAvailabilityCalendar from "./RoomAvailabilityCalendar";

const dateFormat = new Intl.DateTimeFormat("en-PH", { dateStyle: "long", timeZone: "UTC" });

export default function RoomDetails({ room, rooms, api, today, onClose, onSelectRoom, onReserve }) {
  const dialog = useRef(null);
  const [selectedDate, setSelectedDate] = useState("");
  const details = ROOMS_DATA.find((item) => item.name === room.name);

  useEffect(() => {
    const element = dialog.current;
    if (!element.open) element.showModal();
    return () => element.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="room-details"
      aria-labelledby="room-details-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="room-details-content">
        <button type="button" className="room-details-close" onClick={onClose} aria-label="Close room details">
          {"\u00d7"}
        </button>
        <img className="room-details-photo" src={room.image} alt={room.name} />
        <div className="room-details-body">
          <div className="room-details-columns">
            <section>
              <p className="room-details-category">{room.category}</p>
              <h2 id="room-details-title">{room.name}</h2>
              <p className="room-details-price">{"\u20b1"}{room.price.toLocaleString("en-PH")} / night</p>
              <p>{room.description}</p>
              <dl className="room-details-facts">
                <div><dt>Guests</dt><dd>Up to {room.capacity}</dd></div>
                <div><dt>Bedding</dt><dd>{room.bed}</dd></div>
                {details?.view && <div><dt>View</dt><dd>{details.view}</dd></div>}
              </dl>
              {details?.amenities?.length > 0 && (
                <ul className="room-details-amenities" aria-label="Amenities">
                  {details.amenities.map((amenity) => <li key={amenity}>{amenity}</li>)}
                </ul>
              )}
            </section>
            <RoomAvailabilityCalendar room={room} api={api} today={today} selectedDate={selectedDate} setSelectedDate={setSelectedDate} />
          </div>
          <div className="room-details-reserve">
            <span aria-live="polite">{selectedDate ? "Check-in " + dateFormat.format(new Date(selectedDate)) : "Choose dates in the reservation form."}</span>
            <button type="button" onClick={() => onReserve(selectedDate)}>Reserve now</button>
          </div>
          {rooms.length > 1 && (
            <section className="room-details-related">
              <h3>Other rooms</h3>
              <div>
                {rooms.filter((item) => item.name !== room.name).map((item) => (
                  <button type="button" key={item.name} onClick={() => onSelectRoom(item)}>
                    <img src={item.image} alt="" loading="lazy" />
                    <span><strong>{item.name}</strong>{"\u20b1"}{item.price.toLocaleString("en-PH")} / night</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </dialog>
  );
}
