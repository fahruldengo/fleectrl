/* ============================================================
   FLEETCTRL — Mobil Keluar (Gate Control)
   Alur status: Menunggu Approval -> Disetujui/Ditolak
                -> Berjalan (check-out, KM keluar)
                -> Selesai (check-in, KM kembali, selisih)
   Hak akses:
   - Karyawan/Driver: ajukan permohonan, lihat miliknya
   - Manager/GA/Admin: approve/reject, check-out, check-in
   ============================================================ */
const user = Session.guard('trips');
const content = UI.shell('trips', 'Kontrol Mobil Keluar');
const canApprove = ['Admin','Manager','GA'].includes(user.role);
let trips = [], cars = [], drivers = [];

content.innerHTML = `
  <div class="toolbar">
    <div class="search"><input id="q" placeholder="Cari tujuan / driver / plat…"></div>
    <button class="btn btn-primary" onclick="requestTrip()">＋ Ajukan Peminjaman</button>
  </div>
  <div id="list"></div>`;
document.getElementById('q').oninput = e => renderList(e.target.value);

load();
async function load() {
  UI.spinner(document.getElementById('list'));
  const [t,c,d] = await Promise.all([API.list('TRIPS'), API.list('CARS'), API.list('DRIVERS')]);
  trips = t.ok ? t.data : [];
  cars = c.ok ? c.data : [];
  drivers = d.ok ? d.data : [];
  renderList('');
}

function visibleTrips() {
  // Karyawan/Driver hanya melihat permohonan miliknya
  if (canApprove) return trips;
  return trips.filter(t => t.Pemohon === user.name || t.NamaDriver === user.name);
}

function renderList(q) {
  q = (q||'').toLowerCase();
  const rows = visibleTrips()
    .filter(t => [t.Tujuan,t.NamaDriver,t.PlatNomor,t.Pemohon].join(' ').toLowerCase().includes(q))
    .reverse();
  document.getElementById('list').innerHTML = UI.table(rows, [
    { key:'PlatNomor', label:'Mobil', render:v=>`<b style="font-family:var(--mono)">${v}</b>` },
    { key:'Tujuan', label:'Tujuan / Keperluan', render:(v,r)=>`<b>${v}</b><div style="font-size:11px;color:var(--muted)">${r.Keperluan||''}</div>` },
    { key:'NamaDriver', label:'Driver', render:(v,r)=>`${v||'-'}<div style="font-size:11px;color:var(--muted)">Pemohon: ${r.Pemohon}</div>` },
    { key:'TanggalRencana', label:'Rencana', render:v=>UI.date(v) },
    { key:'_km', label:'KM (keluar→kembali)', render:(_,r)=> r.KMKeluar? `${UI.num(r.KMKeluar)} → ${r.KMKembali?UI.num(r.KMKembali):'…'} ${r.SelisihKM?`<b style="color:var(--gauge)">(+${UI.num(r.SelisihKM)})</b>`:''}` : '-' },
    { key:'Status', label:'Status', render:v=>UI.statusBadge(v) },
    { key:'_act', label:'Aksi', render:(_,r)=>actions(r) },
  ]);
}

function actions(t) {
  let b = '';
  if (canApprove && t.Status === 'Menunggu Approval') {
    b += `<button class="btn btn-primary btn-sm" onclick="decide('${t.TripID}','Disetujui')">Setujui</button>
          <button class="btn btn-danger btn-sm" onclick="decide('${t.TripID}','Ditolak')">Tolak</button>`;
  }
  if (canApprove && t.Status === 'Disetujui') {
    b += `<button class="btn btn-primary btn-sm" onclick="checkOut('${t.TripID}')">Mobil Keluar ▸</button>`;
  }
  if (canApprove && t.Status === 'Berjalan') {
    b += `<button class="btn btn-primary btn-sm" onclick="checkIn('${t.TripID}')">◂ Mobil Kembali</button>`;
  }
  return b || '<span style="color:var(--muted);font-size:12px">—</span>';
}

/* ---------- Permohonan ---------- */
function requestTrip() {
  const availCars = cars.filter(c => c.Status === 'Tersedia');
  const availDrivers = drivers.filter(d => d.Status === 'Aktif');
  const body = `
    <div class="field"><label>Mobil</label>
      <select id="f_plat">${availCars.length? availCars.map(c=>`<option value="${c.PlatNomor}">${c.PlatNomor} — ${c.Merek} ${c.Tipe}</option>`).join('') : '<option value="">(tidak ada mobil tersedia)</option>'}</select>
    </div>
    <div class="field"><label>Driver</label>
      <select id="f_driver"><option value="">— Tanpa driver / setir sendiri —</option>${availDrivers.map(d=>`<option value="${d.DriverID}|${d.Nama}">${d.Nama}</option>`).join('')}</select>
    </div>
    <div class="field"><label>Tujuan</label><input id="f_tujuan" placeholder="cth: Kantor Cabang Tomohon"></div>
    <div class="field"><label>Keperluan</label><input id="f_perlu" placeholder="cth: Antar dokumen"></div>
    <div class="row">
      <div class="field"><label>Tanggal Rencana</label><input id="f_tgl" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
      <div class="field"><label>Penumpang (opsional)</label><input id="f_pnp" placeholder="Nama penumpang"></div>
    </div>`;
  UI.modal({ title:'Permohonan Peminjaman Mobil', okLabel:'Kirim Permohonan', bodyHtml: body, onOk: async () => {
    if (!f_plat.value) throw 'Tidak ada mobil tersedia.';
    if (!f_tujuan.value.trim()) throw 'Tujuan wajib diisi.';
    const [did, dname] = (f_driver.value||'|').split('|');
    const rec = {
      PlatNomor:f_plat.value, DriverID:did||'', NamaDriver:dname||'', Pemohon:user.name,
      Penumpang:f_pnp.value, Tujuan:f_tujuan.value.trim(), Keperluan:f_perlu.value,
      TanggalRencana:f_tgl.value, Status:'Menunggu Approval',
      JamKeluar:'', KMKeluar:'', JamKembali:'', KMKembali:'', SelisihKM:'', ApprovedBy:'', Catatan:''
    };
    const r = await API.insert('TRIPS', rec, 'TripID', 'TRP');
    if (!r.ok) throw r.error;
    UI.closeModal(); UI.toast('Permohonan terkirim, menunggu approval.'); load();
  }});
}

/* ---------- Approval ---------- */
async function decide(id, status) {
  const patch = { Status: status, ApprovedBy: user.name };
  const r = await API.update('TRIPS','TripID',id,patch);
  if (!r.ok) return UI.toast(r.error,'err');
  UI.toast(status==='Disetujui'?'Permohonan disetujui.':'Permohonan ditolak.');
  load();
}

/* ---------- Check-out (gate keluar) ---------- */
function checkOut(id) {
  const t = trips.find(x=>x.TripID===id);
  const car = cars.find(c=>c.PlatNomor===t.PlatNomor);
  const km0 = car ? Number(car.KMTerakhir)||0 : 0;
  const body = `
    <p style="margin-bottom:14px;color:var(--muted)">Mobil <b>${t.PlatNomor}</b> ke <b>${t.Tujuan}</b>.</p>
    <div class="row">
      <div class="field"><label>Jam Keluar</label><input id="f_jam" type="datetime-local" value="${nowLocal()}"></div>
      <div class="field"><label>KM Keluar</label><input id="f_km" type="number" value="${km0}"><div class="hint">KM odometer saat ini.</div></div>
    </div>`;
  UI.modal({ title:'Catat Mobil Keluar', okLabel:'Konfirmasi Keluar', bodyHtml: body, onOk: async () => {
    const patch = { Status:'Berjalan', JamKeluar:f_jam.value, KMKeluar:Number(f_km.value)||0 };
    const r = await API.update('TRIPS','TripID',id,patch);
    if (!r.ok) throw r.error;
    await API.update('CARS','PlatNomor',t.PlatNomor,{ Status:'Digunakan' });
    UI.closeModal(); UI.toast('Mobil tercatat keluar.'); load();
  }});
}

/* ---------- Check-in (gate masuk) ---------- */
function checkIn(id) {
  const t = trips.find(x=>x.TripID===id);
  const body = `
    <p style="margin-bottom:14px;color:var(--muted)">KM keluar tercatat: <b>${UI.num(t.KMKeluar)}</b></p>
    <div class="row">
      <div class="field"><label>Jam Kembali</label><input id="f_jam" type="datetime-local" value="${nowLocal()}"></div>
      <div class="field"><label>KM Kembali</label><input id="f_km" type="number" value="${t.KMKeluar}" oninput="document.getElementById('selisih').textContent=Math.max(0,(this.value-${t.KMKeluar})).toLocaleString('id-ID')"></div>
    </div>
    <div class="rem warn"><span class="badge b-amber">Jarak Tempuh</span><b id="selisih">0</b> KM otomatis dihitung.</div>`;
  UI.modal({ title:'Catat Mobil Kembali', okLabel:'Konfirmasi Kembali', bodyHtml: body, onOk: async () => {
    const kmIn = Number(f_km.value)||0;
    if (kmIn < Number(t.KMKeluar)) throw 'KM kembali tidak boleh lebih kecil dari KM keluar.';
    const selisih = kmIn - Number(t.KMKeluar);
    const patch = { Status:'Selesai', JamKembali:f_jam.value, KMKembali:kmIn, SelisihKM:selisih };
    const r = await API.update('TRIPS','TripID',id,patch);
    if (!r.ok) throw r.error;
    // update KM mobil + status tersedia + log KM
    await API.update('CARS','PlatNomor',t.PlatNomor,{ KMTerakhir:kmIn, Status:'Tersedia' });
    await API.insert('KM_LOG', { PlatNomor:t.PlatNomor, TripID:id, KMKeluar:t.KMKeluar, KMKembali:kmIn, SelisihKM:selisih, Tanggal:new Date().toISOString() }, 'LogID', 'KM');
    UI.closeModal(); UI.toast(`Selesai. Jarak tempuh ${UI.num(selisih)} KM.`); load();
  }});
}

function nowLocal() {
  const d = new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset());
  return d.toISOString().slice(0,16);
}
