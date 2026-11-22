import { useCallback, useEffect, useState } from "react";
import { accountFetch, readJson, formatPeso, extraUnits } from "../hotel-api";

const emptyExtra = { name: "", description: "", price: "", unit: "stay", active: true, image: "" };

async function preparePhoto(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
    throw new Error("Choose a JPG, PNG, or WebP photo up to 10 MB.");
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 640 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    context.fillStyle = "#f9f7ef";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.8, 0.64, 0.46, 0.28]) {
      const photo = canvas.toDataURL("image/jpeg", quality);
      if (photo.length <= 85000) return photo;
    }
    throw new Error("This photo is too detailed to save. Choose a smaller photo.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function AdminExtras({ api }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setItems(await readJson(await accountFetch(api + "/admin/extras")));
    } catch (error) {
      setMessage(error.message);
    }
  }, [api]);
  useEffect(() => { load(); }, [load]);
  const set = (field, value) => setForm((previous) => ({ ...previous, [field]: value }));

  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setMessage("");
    setBusy(true);
    try {
      await readJson(await accountFetch(api + "/admin/extras" + (form.id ? "/" + form.id : ""), {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, price: Number(form.price), active: Boolean(form.active) }),
      }));
      setForm(null);
      setMessage("Service saved.");
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function pickPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setMessage("");
    try {
      set("image", await preparePhoto(file));
    } catch (error) {
      setMessage(error.message || "Could not open this photo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="hotel-glass admin-extras">
      <h3>Extras &amp; services</h3>
      <p>Available services appear in the guest reservation form.</p>
      <button type="button" className="hotel-action" disabled={busy} onClick={() => setForm(emptyExtra)}>Add service</button>
      {message && <p role="status">{message}</p>}
      {form && (
        <form className="hotel-glass admin-extra-form" onSubmit={save}>
          <h4>{form.id ? "Edit service" : "New service"}</h4>
          <label>Name<input required maxLength={100} value={form.name} onChange={(event) => set("name", event.target.value)} /></label>
          <label>Description<textarea maxLength={1000} value={form.description} onChange={(event) => set("description", event.target.value)} /></label>
          <label>Service photo<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={pickPhoto} /></label>
          {form.image && <div className="admin-extra-photo-preview">
            <img src={form.image} alt="Service photo preview" />
            <button type="button" className="hotel-action secondary" disabled={busy} onClick={() => set("image", "")}>Remove photo</button>
          </div>}
          <label>Price (PHP)<input type="number" min="0" max="999999" step=".01" required value={form.price} onChange={(event) => set("price", event.target.value)} /></label>
          <label>Billing unit<select value={form.unit} onChange={(event) => set("unit", event.target.value)}>
            {Object.entries(extraUnits).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <label><input type="checkbox" checked={Boolean(form.active)} onChange={(event) => set("active", event.target.checked)} /> Available to guests</label>
          <div><button className="hotel-action" disabled={busy}>Save service</button> <button type="button" className="hotel-action secondary" disabled={busy} onClick={() => setForm(null)}>Cancel</button></div>
        </form>
      )}
      <div className="admin-extra-list">
        {items.map((item) => (
          <article key={item.id} className="admin-room-card admin-extra-card" data-photo={Boolean(item.image)}>
            {item.image && <img className="admin-room-photo" src={item.image} alt="" loading="lazy" />}
            <div className="admin-room-glass">
              <h4>{item.name}</h4>
              {item.description && <p>{item.description}</p>}
              <p><strong>{formatPeso(item.price)}</strong> · {extraUnits[item.unit]} · {item.active ? "Available" : "Hidden"}</p>
              <button type="button" className="hotel-action secondary" disabled={busy} onClick={() => setForm({ ...item, image: item.image || "" })}>Edit service</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
