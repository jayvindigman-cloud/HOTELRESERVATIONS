function validPhoto(value) {
  if (typeof value !== "string") return false;
  if (!value) return true;
  if (value.startsWith("data:")) {
    return value.length <= 85000 && /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(value);
  }
  if (value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

module.exports = { validPhoto };
