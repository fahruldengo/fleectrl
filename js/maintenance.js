/* ============================================================
   FLEETCTRL — Servis & KM
   Catat servis berkala; reminder otomatis berdasarkan kelipatan
   interval KM (KMServisTerakhir + IntervalServisKM).
   ============================================================ */
const user = Session.guard('maintenance');
const content = UI.shell('maintenance', 'Servis Berkala & Riwayat KM');
let maint = [], cars = [], kmlog = [];

content.innerHTML = `
  <div class="card" style="margin-bottom:16px">
    <h3>⚙ Status Servis Berkala</h3>
    <div id="svcStatus"></div>
  </div>
  <div class="toolbar">
    <div class="search"><input id="q" placeholder="Cari plat / bengkel…"></div>
    <button class="btn btn-primary" onclick="addMaint()">＋ Catat Servis</button>
  </div>
  <div id="list"></div>`;
document.getElementById('q').oninput = e => renderList(e.target.value);

load();
async function load() {
  UI.spinner(document.getElementById('list'));
  const [m,c,k] = await Promise.all([API.list('MAINTENANCE'), API.list('CARS'), API.list('KM_LOG')]);
  maint = m.ok ? m.data : []; cars = c.ok ? c.data : []; kmlog = k.ok ? k.data : [];
  renderSvc(); renderList('');
}

function renderSvc() {
  const box = document.getElementById('svcStatus');
  if (!cars.length) return UI.empty(box, 'Belum ada mobil.', '⛟');
  box.innerHTML = `<div class="grid cols-3">` + cars.map(c => {
    const km = Number(c.KMTerakhir)||0;
    const interval = Number(c.IntervalServisKM)||5000;
    const last = Number(c.KMServisTerakhir)||0;
    const next = last + interval;
    const sisa = next - km;
    const pct = Math.min(100, Math.max(0, ((km-last)/interval*100)));
    const cls = sisa<=0?'alert':sisa<=500?'signal':'gauge';
    return `<div style="border:1px solid var(--line);border-radius:10px;padding:14px">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <b style="font-family:var(--mono)">${c.PlatNomor}</b>
        <span class="badge ${sisa<=0?'b-red':sisa<=500?'b-amber':'b-green'}">${sisa<=0?'Servis sekarang':sisa+' KM lagi'}</span>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:6px">KM ${UI.num(km)} / target ${UI.num(next)}</div>
      <div style="background:#F1F5F9;border-radius:99px;height:8px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:var(--${cls})"></div>
      </div>
    </div>`;
  }).join('') + `</div>`;
}

function renderList(q) {
  q = (q||'').toLowerCase();
  const rows = maint.filter(m => [m.PlatNomor,m.Bengkel,m.JenisServis].join(' ').toLowerCase().includes(q)).reverse();
  document.getElementById('list').innerHTML = UI.table(rows, [
    { key:'Tanggal', label:'Tanggal', render:v=>UI.date(v) },
    { key:'PlatNomor', label:'Mobil', render:v=>`<b style="font-family:var(--mono)">${v}</b>` },
    { key:'KMSaatServis', label:'KM', render:v=>UI.num(v) },
    { key:'JenisServis', label:'Jenis Servis' },
    { key:'Bengkel', label:'Bengkel' },
    { key:'Biaya', label:'Biaya', render:v=>UI.rupiah(v) },
  ]);
}

function addMaint() {
  const body = `
    <div class="field"><label>Mobil</label><select id="f_plat" onchange="fillKm()">${cars.map(c=>`<option value="${c.PlatNomor}" data-km="${c.KMTerakhir||0}">${c.PlatNomor} — ${c.Merek} ${c.Tipe}</option>`).join('')}</select></div>
    <div class="row">
      <div class="field"><label>Tanggal</label><input id="f_tgl" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
      <div class="field"><label>KM Saat Servis</label><input id="f_km" type="number"></div>
    </div>
    <div class="field"><label>Jenis Servis</label><input id="f_jenis" placeholder="cth: Ganti oli + filter"></div>
    <div class="row">
      <div class="field"><label>Bengkel</label><input id="f_bengkel"></div>
      <div class="field"><label>Biaya (Rp)</label><input id="f_biaya" type="number"></div>
    </div>
    <div class="field"><label>Catatan</label><textarea id="f_cat" rows="2"></textarea></div>`;
  UI.modal({ title:'Catat Servis', bodyHtml: body, onOk: async () => {
    const plat = f_plat.value, km = Number(f_km.value)||0;
    if (!km) throw 'KM saat servis wajib diisi.';
    const r = await API.insert('MAINTENANCE', {
      PlatNomor:plat, Tanggal:f_tgl.value, KMSaatServis:km, JenisServis:f_jenis.value,
      Biaya:Number(f_biaya.value)||0, Bengkel:f_bengkel.value, Catatan:f_cat.value
    }, 'MaintID', 'MNT');
    if (!r.ok) throw r.error;
    // reset titik servis berkala mobil + status kembali tersedia
    await API.update('CARS','PlatNomor',plat,{ KMServisTerakhir:km, Status:'Tersedia' });
    UI.closeModal(); UI.toast('Servis tercatat, pengingat di-reset.'); load();
  }});
  setTimeout(fillKm, 50);
}
function fillKm() {
  const sel = document.getElementById('f_plat');
  const km = sel.options[sel.selectedIndex].dataset.km;
  document.getElementById('f_km').value = km;
}
