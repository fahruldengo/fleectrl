/* ============================================================
   FLEETCTRL — Pengguna (khusus Admin)
   ============================================================ */
const user = Session.guard('users');
const content = UI.shell('users', 'Manajemen Pengguna');
const ROLES = ['Admin','Manager','GA','Driver','Karyawan'];
let users = [];

content.innerHTML = `
  <div class="toolbar">
    <div class="search"><input id="q" placeholder="Cari nama / username…"></div>
    <button class="btn btn-primary" onclick="addUser()">＋ Tambah Pengguna</button>
  </div>
  <div id="list"></div>`;
document.getElementById('q').oninput = e => renderList(e.target.value);

load();
async function load() {
  UI.spinner(document.getElementById('list'));
  const r = await API.list('USERS');
  users = r.ok ? r.data : [];
  renderList('');
}

function renderList(q) {
  q = (q||'').toLowerCase();
  const rows = users.filter(u => [u.Nama,u.Username].join(' ').toLowerCase().includes(q));
  document.getElementById('list').innerHTML = UI.table(rows, [
    { key:'Nama', label:'Nama', render:(v,r)=>`<b>${v}</b><div style="font-size:11px;color:var(--muted)">@${r.Username}</div>` },
    { key:'Role', label:'Role', render:v=>`<span class="badge b-blue">${ROLE_LABEL[v]||v}</span>` },
    { key:'Status', label:'Status', render:v=>UI.statusBadge(v) },
    { key:'_act', label:'', render:(_,r)=>`<button class="btn btn-ghost btn-sm" onclick="editUser('${r.UserID}')">Edit</button>` },
  ]);
}

function userForm(u={}) {
  return `
    <div class="field"><label>Nama Lengkap</label><input id="f_nama" value="${u.Nama||''}"></div>
    <div class="row">
      <div class="field"><label>Username</label><input id="f_user" value="${u.Username||''}"></div>
      <div class="field"><label>Password</label><input id="f_pass" value="${u.Password||''}"></div>
    </div>
    <div class="row">
      <div class="field"><label>Role</label><select id="f_role">${ROLES.map(r=>`<option value="${r}" ${u.Role===r?'selected':''}>${ROLE_LABEL[r]}</option>`).join('')}</select></div>
      <div class="field"><label>Status</label><select id="f_status"><option ${u.Status==='Aktif'?'selected':''}>Aktif</option><option ${u.Status==='Nonaktif'?'selected':''}>Nonaktif</option></select></div>
    </div>
    <div class="hint" style="font-size:11px;color:var(--muted)">Catatan: password disimpan plain text di Sheet untuk kesederhanaan internal. Untuk produksi, pertimbangkan hashing.</div>`;
}
function collectUser() {
  return { Nama:f_nama.value.trim(), Username:f_user.value.trim(), Password:f_pass.value,
           Role:f_role.value, Status:f_status.value };
}

function addUser() {
  UI.modal({ title:'Tambah Pengguna', bodyHtml: userForm(), onOk: async () => {
    const rec = collectUser();
    if (!rec.Nama||!rec.Username||!rec.Password) throw 'Nama, username, dan password wajib diisi.';
    if (users.some(u=>u.Username.toLowerCase()===rec.Username.toLowerCase())) throw 'Username sudah dipakai.';
    const r = await API.insert('USERS', rec, 'UserID', 'U');
    if (!r.ok) throw r.error;
    UI.closeModal(); UI.toast('Pengguna ditambahkan.'); load();
  }});
}
function editUser(id) {
  const u = users.find(x=>x.UserID===id);
  UI.modal({ title:'Edit Pengguna', bodyHtml: userForm(u), onOk: async () => {
    const r = await API.update('USERS','UserID',id,collectUser());
    if (!r.ok) throw r.error;
    UI.closeModal(); UI.toast('Tersimpan.'); load();
  }});
}
