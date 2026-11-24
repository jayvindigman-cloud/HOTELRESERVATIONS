export function reservationGuests(reservation) {
  const names = reservation.guestNames?.length ? reservation.guestNames : [reservation.guestName];
  return names.map((name, index) => {
    const phone = reservation.guestPhones?.[index] || (index === 0 && name === reservation.guestName ? reservation.phone : "");
    return phone ? name + " \u00b7 " + phone : name;
  });
}
