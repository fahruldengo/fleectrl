/* ============================================================
   FLEETCTRL — API layer (anti-CORS)
   Semua request memakai "simple request":
   - GET dengan query string untuk baca data
   - POST application/x-www-form-urlencoded (payload=JSON) untuk tulis
   Keduanya TIDAK memicu preflight OPTIONS, sehingga aman dari
   GitHub Pages -> Apps Script.
   ============================================================ */
const API = {
  async get(params) {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${CONFIG.API_URL}?${qs}`, { method: 'GET' });
    return res.json();
  },

  async post(action, payload) {
    const body = new URLSearchParams();
    body.set('action', action);
    body.set('payload', JSON.stringify(payload || {}));
    const res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    return res.json();
  },

  login(username, password) {
    return this.post('login', { username, password });
  },

  list(sheet) {
    return this.get({ action: 'list', sheet });
  },

  insert(sheet, record, idField, idPrefix) {
    return this.post('insert', { sheet, record, idField, idPrefix });
  },

  update(sheet, idField, idValue, patch) {
    return this.post('update', { sheet, idField, idValue, patch });
  },

  uploadPhoto(base64, filename, contentType) {
    return this.post('uploadPhoto', { base64, filename, contentType });
  },

  dashboard() {
    return this.get({ action: 'dashboard' });
  },

  reminders(days) {
    return this.get({ action: 'reminders', days: days || 30 });
  },
};
