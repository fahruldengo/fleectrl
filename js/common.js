/* ============================================================
   FLEETCTRL — Session, shell builder, & UI helpers
   ============================================================ */
const Session = {
  KEY: 'fleetctrl_user',
  get() { try { return JSON.parse(sessionStorage.getItem(this.KEY)); } catch { return null; } },
  set(u) { sessionStorage.setItem(this.KEY, JSON.stringify(u)); },
  clear() { sessionStorage.removeItem(this.KEY); },
  /** Panggil di tiap halaman terproteksi. Redirect ke login jika tak ada / tak berhak. */
  guard(pageId) {
    const u = this.get();
    if (!u) { location.href = 'index.html'; return null; }
    if (pageId) {
      const allowed = MENUS.flatMap(g => g.items).find(i => i.id === pageId);
      if (allowed && !allowed.roles.includes(u.role)) {
        alert('Anda tidak memiliki akses ke halaman ini.');
        location.href = 'dashboard.html';
        return null;
      }
    }
    return u;
  }
};

const UI = {
  /** Bangun sidebar + topbar. Mengembalikan elemen .content untuk diisi halaman. */
  shell(pageId, title) {
    const u = Session.get();
    const initials = (u.name || 'U').split(' ').map(s => s[0]).slice(0,2).join('').toUpperCase();

    const navHtml = MENUS.map(group => {
      const items = group.items.filter(i => i.roles.includes(u.role));
      if (!items.length) return '';
      return `<div class="nav-group">${group.group}</div>
        <div class="nav">${items.map(i =>
          `<a href="${i.href}" class="${i.id===pageId?'active':''}"><span class="ic">${i.ic}</span>${i.label}</a>`
        ).join('')}</div>`;
    }).join('');

    document.body.innerHTML = `
      <div class="shell">
        <aside class="sidebar" id="sidebar">
          <div class="brand">
            <div class="logo">F</div>
            <div><b>FleetCtrl</b><small>Kontrol Armada</small></div>
          </div>
          ${navHtml}
          <div class="nav" style="margin-top:20px;border-top:1px solid rgba(255,255,255,.08);padding-top:12px">
            <a href="#" onclick="UI.logout();return false"><span class="ic">⏻</span>Keluar</a>
          </div>
        </aside>
        <div class="main">
          <header class="topbar">
            <div style="display:flex;align-items:center;gap:12px">
              <button class="menu-toggle" onclick="document.getElementById('sidebar').classList.toggle('open')">☰</button>
              <h1>${title}</h1>
            </div>
            <div class="who">
              <div style="text-align:right">
                <div style="font-weight:700;font-size:13px">${u.name}</div>
                <span class="role-pill">${ROLE_LABEL[u.role]||u.role}</span>
              </div>
              <div class="avatar">${initials}</div>
            </div>
          </header>
          <div class="content" id="content"></div>
        </div>
      </div>
      <div class="modal-bg" id="modalBg"></div>`;
    return document.getElementById('content');
  },

  logout() { Session.clear(); location.href = 'index.html'; },

  toast(msg, type='ok') {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<span>${type==='ok'?'✓':'⚠'}</span>${msg}`;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
  },

  modal({ title, bodyHtml, okLabel='Simpan', onOk, okClass='btn-primary' }) {
    const bg = document.getElementById('modalBg');
    bg.innerHTML = `<div class="modal">
      <div class="modal-head"><h2>${title}</h2><button class="x" onclick="UI.closeModal()">×</button></div>
      <div class="modal-body">${bodyHtml}</div>
      <div class="modal-foot">
        <button class="btn btn-ghost" onclick="UI.closeModal()">Batal</button>
        <button class="btn ${okClass}" id="modalOk">${okLabel}</button>
      </div>
    </div>`;
    bg.classList.add('show');
    document.getElementById('modalOk').onclick = async () => {
      const btn = document.getElementById('modalOk');
      btn.disabled = true; btn.textContent = 'Memproses…';
      try { await onOk(); } catch (e) { UI.toast(String(e), 'err'); btn.disabled=false; btn.textContent=okLabel; }
    };
  },
  closeModal() { document.getElementById('modalBg').classList.remove('show'); },

  spinner(el) { el.innerHTML = '<div class="spinner"></div>'; },
  empty(el, msg, ic='∅') { el.innerHTML = `<div class="empty"><div class="ic">${ic}</div>${msg}</div>`; },

  /* ---- Format helpers ---- */
  rupiah(n) { return 'Rp ' + (Number(n)||0).toLocaleString('id-ID'); },
  date(d) { if(!d) return '-'; const x=new Date(d); return isNaN(x)?d:x.toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}); },
  num(n) { return (Number(n)||0).toLocaleString('id-ID'); },

  statusBadge(s) {
    const m = {
      'Tersedia':'b-green','Digunakan':'b-blue','Servis':'b-amber','Rusak':'b-red',
      'Menunggu Approval':'b-amber','Disetujui':'b-green','Berjalan':'b-blue','Selesai':'b-gray','Ditolak':'b-red',
      'Aktif':'b-green','Nonaktif':'b-gray','Pending':'b-amber','Approved':'b-green','Rejected':'b-red'
    };
    return `<span class="badge ${m[s]||'b-gray'}">${s||'-'}</span>`;
  },

  /** Kompres gambar di sisi klien sebelum upload (hemat kuota Drive & cepat). */
  compressImage(file, maxW=1280, quality=0.7) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, maxW / img.width);
          const c = document.createElement('canvas');
          c.width = img.width * scale; c.height = img.height * scale;
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject; img.src = e.target.result;
      };
      reader.onerror = reject; reader.readAsDataURL(file);
    });
  },

  /** Render tabel sederhana dari array of objects + kolom. */
  table(rows, cols) {
    if (!rows.length) return `<div class="empty"><div class="ic">∅</div>Belum ada data.</div>`;
    const head = cols.map(c => `<th>${c.label}</th>`).join('');
    const body = rows.map(r => `<tr>${cols.map(c =>
      `<td>${c.render ? c.render(r[c.key], r) : (r[c.key] ?? '-')}</td>`).join('')}</tr>`).join('');
    return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  },
};
