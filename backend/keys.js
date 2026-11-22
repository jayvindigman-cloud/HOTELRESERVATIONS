const { createHash } = require("node:crypto");
const express = require("express");
const pool = require("./db");

async function initializeKeys() {
  await pool.query(`CREATE TABLE IF NOT EXISTS key_room_units (
    room_number VARCHAR(60) PRIMARY KEY,
    room_type_id INT NOT NULL
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS physical_keys (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    key_tag VARCHAR(60) NOT NULL UNIQUE,
    room_number VARCHAR(60) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Available',
    holder VARCHAR(150) NULL,
    booking_code VARCHAR(100) NULL,
    issued_at DATETIME NULL
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS physical_key_events (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    key_id INT UNSIGNED NOT NULL,
    key_tag VARCHAR(60) NOT NULL,
    room_number VARCHAR(60) NOT NULL,
    action VARCHAR(30) NOT NULL,
    holder VARCHAR(150) NULL,
    booking_code VARCHAR(100) NULL,
    notes VARCHAR(500) NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);
}

async function ensureRoomKey(connection, value) {
  const number = String(value || "").trim();
  if (!number) return;
  const [[state]] = await connection.query(
    "SELECT EXISTS(SELECT 1 FROM physical_keys WHERE BINARY room_number=BINARY ?) " +
    "OR EXISTS(SELECT 1 FROM physical_key_events WHERE BINARY room_number=BINARY ?) AS alreadyRegistered",
    [number, number]
  );
  if (state.alreadyRegistered) return;

  const suffix = createHash("sha256").update(number).digest("hex").slice(0, 8).toUpperCase();
  const tag = "KEY-" + Array.from(number).slice(0, 47).join("") + "-" + suffix;
  let result;
  try {
    [result] = await connection.query("INSERT INTO physical_keys (key_tag,room_number) VALUES (?,?)", [tag, number]);
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return;
    throw error;
  }
  await connection.query("INSERT INTO physical_key_events (key_id,key_tag,room_number,action) VALUES (?,?,?,'Auto registered')",
    [result.insertId, tag, number]);
}

async function backfillRoomKeys() {
  const [bookings] = await pool.query("SELECT DISTINCT BINARY room_number AS room_number FROM reservations WHERE room_number IS NOT NULL");
  const rooms = new Set(bookings.map((booking) => String(booking.room_number).trim()).filter(Boolean));
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const room of rooms) await ensureRoomKey(connection, room);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

const router = express.Router();
const route = (fn) => (req, res, next) => fn(req, res).catch(next);

async function releaseCheckoutKeys(conn, reservationId) {
  const [keys] = await conn.query(`
    SELECT k.id, k.key_tag, k.room_number, k.holder, k.booking_code, r.actual_check_out
    FROM physical_keys k
    JOIN reservations r ON BINARY r.reservation_code = BINARY k.booking_code
    WHERE k.status IN ('Assigned','Issued') AND r.status = 'Confirmed'
      AND COALESCE(r.actual_check_out, r.check_out) <= DATE(UTC_TIMESTAMP() + INTERVAL 8 HOUR)
      ${reservationId === undefined ? "" : "AND r.id = ?"}
    ORDER BY k.id FOR UPDATE`, reservationId === undefined ? [] : [reservationId]);
  if (!keys.length) return;
  await conn.query(`INSERT INTO physical_key_events
    (key_id,key_tag,room_number,action,holder,booking_code,notes) VALUES ?`, [keys.map((key) => [
    key.id, key.key_tag, key.room_number, "Auto release", key.holder, key.booking_code,
    key.actual_check_out ? "Released after early checkout" : "Released on the scheduled checkout date",
  ])]);
  await conn.query(`UPDATE physical_keys SET status='Available',holder=NULL,booking_code=NULL,issued_at=NULL
    WHERE id IN (?)`, [keys.map((key) => key.id)]);
}

async function sweepCheckoutKeys() {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await releaseCheckoutKeys(conn);
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

router.get("/", route(async (req, res) => {
  const [keys] = await pool.query(`SELECT k.id, k.key_tag AS keyTag, k.room_number AS roomNumber,
    t.name AS roomType,
    k.status, k.holder, k.booking_code AS bookingCode, k.issued_at AS issuedAt,
    r.check_in AS checkIn, COALESCE(r.actual_check_out,r.check_out) AS checkOut,
    CASE WHEN k.status IN ('Assigned','Issued') AND (r.id IS NULL OR r.status <> 'Confirmed'
      OR BINARY TRIM(COALESCE(r.room_number,'')) <> BINARY k.room_number
      OR COALESCE(r.actual_check_out,r.check_out) <= DATE(UTC_TIMESTAMP() + INTERVAL 8 HOUR)) THEN 1 ELSE 0 END AS needsAttention
    FROM physical_keys k LEFT JOIN reservations r ON BINARY r.reservation_code = BINARY k.booking_code
    LEFT JOIN key_room_units u ON BINARY u.room_number = BINARY k.room_number
    LEFT JOIN room_types t ON t.id = u.room_type_id
    ORDER BY k.room_number,k.key_tag`);
  const [history] = await pool.query(`SELECT e.id, e.key_tag AS keyTag, e.room_number AS roomNumber,
    e.action, e.holder, e.booking_code AS bookingCode, e.notes, e.created_at AS createdAt, t.name AS roomType
    FROM physical_key_events e LEFT JOIN key_room_units u ON BINARY u.room_number = BINARY e.room_number
    LEFT JOIN room_types t ON t.id = u.room_type_id ORDER BY e.id DESC LIMIT 200`);
  res.json({ keys, history });
}));

router.post("/", route(async (req, res) => {
  const keyTag = String(req.body.keyTag || "").trim();
  const roomNumber = String(req.body.roomNumber || "").trim();
  if (!keyTag || keyTag.length > 60 || !roomNumber || roomNumber.length > 60)
    return res.status(400).json({ message: "Enter a key tag and room number of up to 60 characters." });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query("INSERT INTO physical_keys (key_tag, room_number) VALUES (?, ?)", [keyTag, roomNumber]);
    await conn.query("INSERT INTO physical_key_events (key_id, key_tag, room_number, action) VALUES (?, ?, ?, 'Registered')", [result.insertId, keyTag, roomNumber]);
    await conn.commit();
    res.status(201).json({ message: "Key registered." });
  } catch (error) {
    await conn.rollback();
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "This key tag is already registered." });
    throw error;
  } finally { conn.release(); }
}));

router.patch("/:id", route(async (req, res) => {
  const { action, reservationId } = req.body;
  const notes = String(req.body.notes || "").trim();
  if (!["Assign", "Issue", "Return", "Release", "Lost", "Maintenance", "Restore", "Delete"].includes(action) || notes.length > 500)
    return res.status(400).json({ message: "Choose a valid action and keep notes within 500 characters." });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[key]] = await conn.query("SELECT * FROM physical_keys WHERE id = ? FOR UPDATE", [req.params.id]);
    const reject = async (message, status = 409) => {
      await conn.rollback();
      return res.status(status).json({ message });
    };
    if (!key) return await reject("Key not found.", 404);
    const allowed = { Assign: ["Available"], Issue: ["Available", "Assigned"], Return: ["Issued"], Release: ["Assigned"], Lost: ["Available", "Assigned", "Issued"], Maintenance: ["Available"], Restore: ["Lost", "Maintenance"], Delete: ["Available", "Lost", "Maintenance"] };
    if (action === "Delete" && !allowed.Delete.includes(key.status)) return await reject("Release or return this key before deleting it.");
    if (!allowed[action].includes(key.status)) return await reject("The key status has changed. Refresh and try again.");
    let holder = key.holder;
    let bookingCode = key.booking_code;
    if (action === "Assign" || action === "Issue") {
      const assigned = key.status === "Assigned";
      const [[booking]] = await conn.query(
        "SELECT guest_name, reservation_code, room_number, status, (check_in <= DATE(UTC_TIMESTAMP() + INTERVAL 8 HOUR)) AS checkedInDate FROM reservations WHERE ?? = ? " +
        "AND COALESCE(actual_check_out, check_out) > DATE(UTC_TIMESTAMP() + INTERVAL 8 HOUR) FOR UPDATE",
        [assigned ? "reservation_code" : "id", assigned ? key.booking_code : reservationId || null]
      );
      if (!booking || booking.status !== "Confirmed" || String(booking.room_number || "").trim() !== key.room_number)
        return await reject("Select an upcoming or active confirmed booking assigned to this key's room.", 400);
      if (action === "Issue" && !booking.checkedInDate) return await reject("This key is for an upcoming stay. Hand it over on or after check-in day.");
      holder = booking.guest_name;
      bookingCode = booking.reservation_code;
    }
    const status = { Assign: "Assigned", Issue: "Issued", Return: "Available", Release: "Available", Lost: "Lost", Maintenance: "Maintenance", Restore: "Available" }[action];
    const hasHolder = status === "Assigned" || status === "Issued";
    await conn.query(`INSERT INTO physical_key_events (key_id, key_tag, room_number, action, holder, booking_code, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, [key.id, key.key_tag, key.room_number, action, holder, bookingCode, notes]);
    if (action === "Delete") {
      await conn.query("DELETE FROM physical_keys WHERE id = ?", [key.id]);
      await conn.commit();
      return res.json({ message: "Key deleted. Its activity history was kept." });
    }
    await conn.query(`UPDATE physical_keys SET status = ?, holder = ?, booking_code = ?,
      issued_at = ${action === "Issue" ? "NOW()" : "NULL"} WHERE id = ?`,
      [status, hasHolder ? holder : null, hasHolder ? bookingCode : null, key.id]);
    await conn.commit();
    res.json({ message: "Key updated." });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally { conn.release(); }
}));

router.use((error, req, res, next) => {
  console.error("Key management failed:", error);
  res.status(500).json({ message: "Unable to save or load keys. Please try again." });
});

module.exports = { router, initializeKeys, ensureRoomKey, backfillRoomKeys, releaseCheckoutKeys, sweepCheckoutKeys };
