import { preparePhoto } from "./preparePhoto";

export default function AdminPhotoUpload({ value, onChange, onBusy, onError, disabled }) {
  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    onBusy(true);
    onError("");
    try {
      onChange(await preparePhoto(file));
    } catch (error) {
      onError(error.message);
    } finally {
      onBusy(false);
    }
  }

  return <div>
    <label>Upload photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} disabled={disabled} /></label>
    {value?.startsWith("data:image/") && <div>
      <img src={value} width="96" alt="Uploaded photo preview" />
      <button type="button" className="hotel-action secondary" onClick={() => onChange("")} disabled={disabled}>Remove photo</button>
    </div>}
  </div>;
}
