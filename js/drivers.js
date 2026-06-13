/* ============================================================
   FLEETCTRL — Data Driver
   ============================================================ */
const user = Session.guard('drivers');
const content = UI.shell('drivers', 'Data Driver');
let drivers = [];

content.innerHTML = `
  <div class="toolbar">
    <div class="search"><input id="q" placeholder="Cari nama / no SIM…"></div>
    <button class="btn btn-primary" onclick="addDriver()">＋ Tambah Driver</button>
  </div>
  <div id="list"></div>`;
document.getElementById('q').oninput = e => renderList(e.target.value);

load();
async function load() {
  UI.spinner(document.getElementById('list'));
  const r = await API.list('DRIVERS');
  drivers = r.ok ? r.data : [];
  renderList('');
}

function renderList(q) {
  q = (q||'').toLowerCase();
  const today = new Date();
  const rows = drivers.filter(d => [d.Nama,d.NoSIM].join(' ').toLowerCase().includes(q));
  document.getElementById('list').innerHTML = UI.table(rows, [
    { key:'Nama', label:'Nama', render:(v,r)=>`<b>${v}</b><div style="font-size:11px;color:var(--muted)">${r.NoHP||''}</div>` },
    { key:'NoSIM', label:'No SIM', render:v=>`<span style="font-family:var(--mono)">${v||'-'}</span>` },
    { key:'MasaBerlakuSIM', label:'Masa Berlaku SIM', render:v=>{
        if(!v) return '-';
        const days = Math.ceil((new Date(v)-today)/86400000);
        const cls = days<=30?'b-red':days<=90?'b-amber':'b-green';
        return `${UI.date(v)} <span class="badge ${cls}">${days<0?'lewat':days+' hr'}</span>`;
      }},
    { key:'Status', label:'Ketersediaan', render:v=>UI.statusBadge(v) },
    { key:'_act', label:'', render:(_,r)=>`<button class="btn btn-ghost btn-sm" onclick="editDriver('${r.DriverID}')">Edit</button>` },
  ]);
}

function driverForm(d={}) {
  const statuses = ['Aktif','Bertugas','Cuti','Nonaktif'];
  return `
    <div class="field"><label>Nama Lengkap</label><input id="f_nama" value="${d.Nama||''}"></div>
    <div class="row">
      <div class="field"><label>No SIM</label><input id="f_sim" value="${d.NoSIM||''}"></div>
      <div class="field"><label>Masa Berlaku SIM</label><input id="f_simexp" type="date" value="${d.MasaBerlakuSIM? new Date(d.MasaBerlakuSIM).toISOString().slice(0,10):''}"></div>
    </div>
    <div class="row">
      <div class="field"><label>No HP</label><input id="f_hp" value="${d.NoHP||''}"></div>
      <div class="field"><label>Status</label><select id="f_status">${statuses.map(s=>`<option ${d.Status===s?'selected':''}>${s}</option>`).join('')}</select></div>
    </div>`;
}
function collectDriver() {
  return { Nama:f_nama.value.trim(), NoSIM:f_sim.value.trim(), MasaBerlakuSIM:f_simexp.value,
           NoHP:f_hp.value.trim(), Status:f_status.value };
}

function addDriver() {
  UI.modal({ title:'Tambah Driver', bodyHtml: driverForm(), onOk: async () => {
    const rec = collectDriver();
    if (!rec.Nama) throw 'Nama wajib diisi.';
    const r = await API.insert('DRIVERS', rec, 'DriverID', 'DRV');
    if (!r.ok) throw r.error;
    UI.closeModal(); UI.toast('Driver ditambahkan.'); load();
  }});
}
function editDriver(id) {
  const d = drivers.find(x=>x.DriverID===id);
  UI.modal({ title:'Edit Driver', bodyHtml: driverForm(d), onOk: async () => {
    const r = await API.update('DRIVERS','DriverID',id,collectDriver());
    if (!r.ok) throw r.error;
    UI.closeModal(); UI.toast('Tersimpan.'); load();
  }});
}
