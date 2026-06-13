/* ============================================================
   FLEETCTRL — Riwayat Penggunaan Kendaraan
   Sumber: sheet Trips berstatus "Selesai".
   Fitur: filter (mobil / driver / rentang tanggal), rekap per mobil
   (total jarak, jumlah trip, jumlah driver), tabel detail, export CSV.
   ============================================================ */
const user = Session.guard('history');
const content = UI.shell('history', 'Riwayat Penggunaan Kendaraan');

let trips = [], cars = [], drivers = [];
let filtered = [];

content.innerHTML = `
  <div class="card" style="margin-bottom:16px">
    <h3>▦ Filter</h3>
    <div class="grid cols-4" style="align-items:end">
      <div class="field" style="margin:0"><label>Mobil</label><select id="fl_car"><option value="">Semua mobil</option></select></div>
      <div class="field" style="margin:0"><label>Driver</label><select id="fl_driver"><option value="">Semua driver</option></select></div>
      <div class="field" style="margin:0"><label>Dari Tanggal</label><input id="fl_start" type="date"></div>
      <div class="field" style="margin:0"><label>Sampai Tanggal</label><input id="fl_end" type="date"></div>
    </div>
    <div style="display:flex;gap:10px;margin-top:14px">
      <button class="btn btn-primary" onclick="applyFilter()">Terapkan Filter</button>
      <button class="btn btn-ghost" onclick="resetFilter()">Reset</button>
      <button class="btn btn-ghost" onclick="exportCsv()" style="margin-left:auto">⤓ Export CSV</button>
    </div>
  </div>
  <div id="kpis" class="grid cols-4" style="margin-bottom:16px"></div>
  <div class="card" style="margin-bottom:16px">
    <h3>⛟ Rekap per Mobil</h3>
    <div id="perCar"></div>
  </div>
  <div class="card">
    <h3>◷ Detail Perjalanan</h3>
    <div id="detail"></div>
  </div>`;

load();
async function load() {
  document.getElementById('detail').innerHTML = '<div class="spinner"></div>';
  const [t,c,d] = await Promise.all([API.list('TRIPS'), API.list('CARS'), API.list('DRIVERS')]);
  cars = c.ok ? c.data : [];
  drivers = d.ok ? d.data : [];
  // hanya trip yang sudah selesai (punya data jarak)
  trips = (t.ok ? t.data : []).filter(x => x.Status === 'Selesai');

  // isi dropdown filter
  const carSel = document.getElementById('fl_car');
  cars.forEach(c => carSel.insertAdjacentHTML('beforeend', `<option value="${c.PlatNomor}">${c.PlatNomor} — ${c.Merek} ${c.Tipe}</option>`));
  const drvSel = document.getElementById('fl_driver');
  const driverNames = [...new Set(trips.map(t => t.NamaDriver || t.Pemohon).filter(Boolean))];
  driverNames.forEach(n => drvSel.insertAdjacentHTML('beforeend', `<option value="${n}">${n}</option>`));

  applyFilter();
}

function applyFilter() {
  const car = document.getElementById('fl_car').value;
  const driver = document.getElementById('fl_driver').value;
  const start = document.getElementById('fl_start').value;
  const end = document.getElementById('fl_end').value;

  filtered = trips.filter(t => {
    if (car && t.PlatNomor !== car) return false;
    if (driver && (t.NamaDriver || t.Pemohon) !== driver) return false;
    const dt = t.JamKembali || t.TanggalRencana;
    if (start && new Date(dt) < new Date(start)) return false;
    if (end && new Date(dt) > new Date(end + 'T23:59:59')) return false;
    return true;
  });

  renderKpis();
  renderPerCar();
  renderDetail();
}

function resetFilter() {
  ['fl_car','fl_driver','fl_start','fl_end'].forEach(id => document.getElementById(id).value = '');
  applyFilter();
}

function km(t) { return Number(t.SelisihKM) || 0; }

function renderKpis() {
  const totalKm = filtered.reduce((s,t)=>s+km(t),0);
  const totalTrips = filtered.length;
  const usedCars = new Set(filtered.map(t=>t.PlatNomor)).size;
  const avgKm = totalTrips ? Math.round(totalKm/totalTrips) : 0;
  document.getElementById('kpis').innerHTML = `
    <div class="kpi green"><div class="bar"></div><div class="label">Total Jarak</div><div class="value">${UI.num(totalKm)}</div><div class="sub">kilometer</div></div>
    <div class="kpi blue"><div class="bar"></div><div class="label">Jumlah Perjalanan</div><div class="value">${UI.num(totalTrips)}</div><div class="sub">trip selesai</div></div>
    <div class="kpi amber"><div class="bar"></div><div class="label">Mobil Terpakai</div><div class="value">${UI.num(usedCars)}</div><div class="sub">dari ${cars.length} unit</div></div>
    <div class="kpi red"><div class="bar"></div><div class="label">Rata-rata / Trip</div><div class="value">${UI.num(avgKm)}</div><div class="sub">km per perjalanan</div></div>`;
}

function renderPerCar() {
  const box = document.getElementById('perCar');
  if (!filtered.length) return UI.empty(box, 'Tidak ada perjalanan pada filter ini.', '▦');

  const map = {};
  filtered.forEach(t => {
    const k = t.PlatNomor;
    if (!map[k]) map[k] = { plat:k, totalKm:0, trips:0, drivers:new Set(), first:null, last:null };
    const m = map[k];
    m.totalKm += km(t); m.trips++;
    if (t.NamaDriver || t.Pemohon) m.drivers.add(t.NamaDriver || t.Pemohon);
    const dt = t.JamKembali || t.TanggalRencana;
    if (dt) {
      const d = new Date(dt);
      if (!m.first || d < m.first) m.first = d;
      if (!m.last || d > m.last) m.last = d;
    }
  });

  const rows = Object.values(map).sort((a,b)=>b.totalKm-a.totalKm);
  const maxKm = Math.max(...rows.map(r=>r.totalKm), 1);

  box.innerHTML = UI.table(rows, [
    { key:'plat', label:'Mobil', render:(v)=>{
        const c = cars.find(x=>x.PlatNomor===v);
        return `<b style="font-family:var(--mono)">${v}</b>${c?`<div style="font-size:11px;color:var(--muted)">${c.Merek} ${c.Tipe}</div>`:''}`;
      }},
    { key:'totalKm', label:'Total Jarak', render:(v)=>`
        <div style="display:flex;align-items:center;gap:8px">
          <b style="font-family:var(--mono);min-width:60px">${UI.num(v)} km</b>
          <div style="flex:1;background:#F1F5F9;border-radius:99px;height:7px;min-width:60px;overflow:hidden"><div style="width:${(v/maxKm*100).toFixed(0)}%;height:100%;background:var(--gauge)"></div></div>
        </div>` },
    { key:'trips', label:'Trip', render:v=>UI.num(v) },
    { key:'drivers', label:'Driver', render:s=>`${s.size} orang<div style="font-size:11px;color:var(--muted)">${[...s].slice(0,2).join(', ')}${s.size>2?'…':''}</div>` },
    { key:'last', label:'Pakai Terakhir', render:v=>v?UI.date(v):'-' },
  ]);
}

function renderDetail() {
  const box = document.getElementById('detail');
  if (!filtered.length) return UI.empty(box, 'Tidak ada perjalanan pada filter ini.', '◷');
  const rows = [...filtered].sort((a,b)=> new Date(b.JamKembali||b.TanggalRencana) - new Date(a.JamKembali||a.TanggalRencana));
  box.innerHTML = UI.table(rows, [
    { key:'JamKembali', label:'Tanggal', render:(v,r)=>UI.date(v||r.TanggalRencana) },
    { key:'PlatNomor', label:'Mobil', render:v=>`<b style="font-family:var(--mono)">${v}</b>` },
    { key:'NamaDriver', label:'Driver', render:(v,r)=>v||r.Pemohon||'-' },
    { key:'Tujuan', label:'Tujuan', render:(v,r)=>`${v}<div style="font-size:11px;color:var(--muted)">${r.Keperluan||''}</div>` },
    { key:'KMKeluar', label:'KM Keluar', render:v=>UI.num(v) },
    { key:'KMKembali', label:'KM Kembali', render:v=> v!==''&&v!=null?UI.num(v):'-' },
    { key:'SelisihKM', label:'Jarak', render:v=> v!==''&&v!=null?`<b style="color:var(--gauge)">${UI.num(v)} km</b>`:'-' },
  ]);
}

function exportCsv() {
  if (!filtered.length) return UI.toast('Tidak ada data untuk diekspor.', 'err');
  const headers = ['Tanggal','PlatNomor','Driver','Pemohon','Tujuan','Keperluan','KMKeluar','KMKembali','JarakKM','JamKeluar','JamKembali'];
  const lines = filtered.map(t => [
    UI.date(t.JamKembali||t.TanggalRencana), t.PlatNomor, t.NamaDriver||'', t.Pemohon||'',
    t.Tujuan||'', t.Keperluan||'', t.KMKeluar||'', t.KMKembali||'', t.SelisihKM||'',
    t.JamKeluar||'', t.JamKembali||''
  ].map(csvCell).join(','));
  const csv = headers.join(',') + '\n' + lines.join('\n');
  const blob = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `riwayat-penggunaan-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  UI.toast('CSV diunduh.');
}
function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
}
