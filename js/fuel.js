/* ============================================================
   FLEETCTRL — Bensin & Klaim
   Driver mengajukan pengisian + foto struk + foto indikator.
   GA/Manager/Admin memvalidasi (Approve/Reject).
   KM/Liter dihitung otomatis dari SelisihKM / Liter.
   ============================================================ */
const user = Session.guard('fuel');
const content = UI.shell('fuel', 'Bensin & Klaim BBM');
const canValidate = ['Admin','Manager','GA'].includes(user.role);
const BBM = ['Pertalite','Pertamax','Pertamax Turbo','Solar','Dexlite','Pertamina Dex'];
let fuel = [], cars = [], drivers = [];
let fotoStruk = '', fotoInd = '';

content.innerHTML = `
  <div class="toolbar">
    <div class="search"><input id="q" placeholder="Cari plat / SPBU…"></div>
    <button class="btn btn-primary" onclick="addFuel()">＋ Ajukan Pengisian</button>
  </div>
  <div id="list"></div>`;
document.getElementById('q').oninput = e => renderList(e.target.value);

load();
async function load() {
  UI.spinner(document.getElementById('list'));
  const [f,c,d] = await Promise.all([API.list('FUEL'), API.list('CARS'), API.list('DRIVERS')]);
  fuel = f.ok ? f.data : []; cars = c.ok ? c.data : []; drivers = d.ok ? d.data : [];
  renderList('');
}

function renderList(q) {
  q = (q||'').toLowerCase();
  // Driver hanya melihat klaim miliknya; Admin/GA/Manager melihat semua
  let base = canValidate ? fuel : fuel.filter(f => f.DriverID === user.id);
  const rows = base.filter(f => [f.PlatNomor,f.LokasiSPBU].join(' ').toLowerCase().includes(q)).reverse();
  document.getElementById('list').innerHTML = UI.table(rows, [
    { key:'Tanggal', label:'Tanggal', render:v=>UI.date(v) },
    { key:'PlatNomor', label:'Mobil', render:v=>`<b style="font-family:var(--mono)">${v}</b>` },
    { key:'JenisBBM', label:'BBM', render:(v,r)=>`${v}<div style="font-size:11px;color:var(--muted)">${UI.num(r.Liter)} L · ${r.LokasiSPBU||''}</div>` },
    { key:'Biaya', label:'Biaya', render:v=>UI.rupiah(v) },
    { key:'_odo', label:'Odometer', render:(_,r)=> (r.OdoTerakhir!==''&&r.OdoTerakhir!=null)||r.OdoSekarang ?
        `${UI.num(r.OdoTerakhir||0)} → ${UI.num(r.OdoSekarang||0)}<div style="font-size:11px;color:var(--muted)">${r.SelisihKM?UI.num(r.SelisihKM)+' km':'—'}</div>` : '-' },
    { key:'KMPerLiter', label:'Efisiensi', render:v=> v? `<span class="badge b-green">${v} km/L</span>` : '<span class="badge b-gray">—</span>' },
    { key:'_foto', label:'Bukti', render:(_,r)=>`
        ${r.FotoStruk?`<img class="thumb" src="${r.FotoStruk}" onclick="window.open('${r.FotoStruk}')" title="Struk">`:''}
        ${r.FotoIndikator?`<img class="thumb" src="${r.FotoIndikator}" onclick="window.open('${r.FotoIndikator}')" title="Indikator">`:''}` },
    { key:'Status', label:'Status', render:v=>UI.statusBadge(v) },
    { key:'_act', label:'Aksi', render:(_,r)=> fuelActions(r) },
  ]);
}

function fuelActions(r) {
  if (r.Status === 'Dibatalkan') return '<span style="color:var(--muted);font-size:12px">Dibatalkan</span>';
  let b = '';
  // Validasi (Approve/Reject) untuk Admin/GA/Manager saat Pending
  if (canValidate && r.Status === 'Pending') {
    b += `<button class="btn btn-primary btn-sm" onclick="validate('${r.FuelID}','Approved')">Setujui</button>
          <button class="btn btn-danger btn-sm" onclick="validate('${r.FuelID}','Rejected')">Tolak</button>`;
  }
  // Edit: Admin/GA/Manager kapan saja; Driver hanya miliknya & masih Pending
  const ownPending = (r.DriverID === user.id && r.Status === 'Pending');
  if (canValidate || ownPending) {
    b += `<button class="btn btn-ghost btn-sm" onclick="editFuel('${r.FuelID}')">Edit</button>`;
  }
  // Hapus (soft delete): hanya Admin/GA/Manager
  if (canValidate) {
    b += `<button class="btn btn-danger btn-sm" onclick="cancelFuel('${r.FuelID}')">Hapus</button>`;
  }
  return b || '<span style="color:var(--muted);font-size:12px">—</span>';
}

async function cancelFuel(id) {
  const r = fuel.find(x=>x.FuelID===id);
  UI.modal({ title:'Hapus Klaim BBM', okLabel:'Ya, Hapus', okClass:'btn-danger',
    bodyHtml: `<p style="color:var(--ink-2)">Klaim BBM <b>${r.PlatNomor}</b> sebesar <b>${UI.rupiah(r.Biaya)}</b> akan ditandai <b>Dibatalkan</b>.</p>
      <div class="rem warn" style="margin-top:12px"><span class="badge b-amber">Catatan</span>Data tetap tersimpan di Sheet untuk audit, hanya tidak dihitung lagi.</div>`,
    onOk: async () => {
      const res = await API.cancel('FUEL','FuelID',id,user.name);
      if (!res.ok) throw res.error;
      UI.closeModal(); UI.toast('Klaim ditandai dibatalkan.'); load();
    }});
}

function addFuel(existing) {
  const ed = existing || null;
  fotoStruk = ed ? (ed.FotoStruk||'') : '';
  fotoInd   = ed ? (ed.FotoIndikator||'') : '';
  const body = `
    <div class="row">
      <div class="field"><label>Mobil</label><select id="f_plat" onchange="onCarChange()">${cars.map(c=>`<option ${ed&&ed.PlatNomor===c.PlatNomor?'selected':''}>${c.PlatNomor}</option>`).join('')}</select></div>
      <div class="field"><label>Jenis BBM</label><select id="f_bbm">${BBM.map(b=>`<option ${ed&&ed.JenisBBM===b?'selected':''}>${b}</option>`).join('')}</select></div>
    </div>
    <div class="row">
      <div class="field"><label>Liter</label><input id="f_liter" type="number" step="0.01" value="${ed?ed.Liter:''}" oninput="calcEff()"></div>
      <div class="field"><label>Biaya (Rp)</label><input id="f_biaya" type="number" value="${ed?ed.Biaya:''}"></div>
    </div>
    <div class="field"><label>Lokasi SPBU</label><input id="f_spbu" value="${ed?(ed.LokasiSPBU||''):''}" placeholder="SPBU 7x.xxx"></div>

    <div style="border:1px solid var(--line);border-radius:10px;padding:14px;margin-bottom:14px;background:#FAFBFD">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <input type="checkbox" id="f_auto" ${ed?'':'checked'} onchange="toggleAuto()" style="width:auto">
        <label for="f_auto" style="margin:0;cursor:pointer;font-size:12px;font-weight:600">Isi odometer terakhir otomatis (dari pengisian sebelumnya)</label>
      </div>
      <div class="row">
        <div class="field" style="margin:0"><label>Odometer Terakhir Isi</label>
          <input id="f_odoLast" type="number" value="${ed?(ed.OdoTerakhir||''):''}" ${ed?'':'readonly'} oninput="calcEff()">
          <div class="hint" id="hOdoLast">Otomatis dari data sebelumnya.</div>
        </div>
        <div class="field" style="margin:0"><label>Odometer Sekarang</label>
          <input id="f_odoNow" type="number" value="${ed?(ed.OdoSekarang||''):''}" oninput="calcEff()">
          <div class="hint">Angka odometer mobil saat ini.</div>
        </div>
      </div>
    </div>

    <div class="rem warn"><span class="badge b-amber">Jarak & Efisiensi</span><b id="effPreview">— km · — km/L</b></div>
    <div class="row" style="margin-top:6px">
      <div class="field"><label>Foto Struk Bensin</label><input id="f_struk" type="file" accept="image/*" onchange="pick(this,'struk')"><div class="hint" id="hStruk">${ed&&ed.FotoStruk?'<span style="color:var(--gauge)">✓ Sudah ada (unggah lagi untuk ganti)</span>':'Wajib.'}</div></div>
      <div class="field"><label>Foto Indikator/Odometer</label><input id="f_ind" type="file" accept="image/*" onchange="pick(this,'ind')"><div class="hint" id="hInd">${ed&&ed.FotoIndikator?'<span style="color:var(--gauge)">✓ Sudah ada (unggah lagi untuk ganti)</span>':'Wajib.'}</div></div>
    </div>`;
  UI.modal({ title: ed?'Edit Klaim BBM':'Pengajuan Pengisian BBM', okLabel: ed?'Simpan Perubahan':'Kirim Klaim', bodyHtml: body, onOk: async () => {
    const liter = Number(f_liter.value), biaya = Number(f_biaya.value);
    const odoLast = Number(f_odoLast.value)||0, odoNow = Number(f_odoNow.value)||0;
    if (!liter || !biaya) throw 'Liter dan biaya wajib diisi.';
    if (!odoNow) throw 'Odometer sekarang wajib diisi.';
    if (odoLast && odoNow < odoLast) throw 'Odometer sekarang tidak boleh lebih kecil dari odometer terakhir.';
    if (!fotoStruk || !fotoInd) throw 'Foto struk dan foto indikator wajib diunggah.';
    const km = (odoLast && odoNow) ? (odoNow - odoLast) : 0;
    const kmPerLiter = (km>0 && liter>0) ? +(km/liter).toFixed(2) : '';
    const data = {
      PlatNomor:f_plat.value, JenisBBM:f_bbm.value,
      Liter:liter, Biaya:biaya, LokasiSPBU:f_spbu.value,
      OdoTerakhir:odoLast||'', OdoSekarang:odoNow, SelisihKM:km, KMPerLiter:kmPerLiter,
      FotoStruk:fotoStruk, FotoIndikator:fotoInd
    };
    if (ed) {
      const r = await API.update('FUEL','FuelID',ed.FuelID,data);
      if (!r.ok) throw r.error;
      UI.closeModal(); UI.toast('Perubahan klaim disimpan.'); load();
    } else {
      data.DriverID = user.id; data.Tanggal = new Date().toISOString();
      data.Status = 'Pending'; data.ApprovedBy = '';
      const r = await API.insert('FUEL', data, 'FuelID', 'FUEL');
      if (!r.ok) throw r.error;
      UI.closeModal(); UI.toast('Klaim BBM terkirim.'); load();
    }
  }});
  // isi otomatis untuk mobil pertama (hanya saat tambah baru)
  if (!ed) setTimeout(onCarChange, 50);
  else setTimeout(calcEff, 50);
}

function editFuel(id) {
  const r = fuel.find(x=>x.FuelID===id);
  if (!r) return;
  // penjaga peran: driver hanya boleh edit miliknya & Pending
  const ownPending = (r.DriverID === user.id && r.Status === 'Pending');
  if (!canValidate && !ownPending) return UI.toast('Klaim ini tidak bisa Anda edit.', 'err');
  addFuel(r);
}

/** Cari odometer pengisian terakhir untuk sebuah mobil (OdoSekarang terbaru). */
function lastOdometer(plat) {
  const recs = fuel
    .filter(f => f.PlatNomor === plat && f.OdoSekarang !== '' && f.OdoSekarang != null)
    .sort((a,b)=> new Date(b.Tanggal) - new Date(a.Tanggal));
  return recs.length ? Number(recs[0].OdoSekarang) : '';
}

/** Saat ganti mobil: bila mode otomatis, isi odometer terakhir dari data. */
function onCarChange() {
  const auto = document.getElementById('f_auto').checked;
  if (auto) fillLastOdo();
  calcEff();
}

function fillLastOdo() {
  const plat = document.getElementById('f_plat').value;
  const last = lastOdometer(plat);
  const inp = document.getElementById('f_odoLast');
  inp.value = last !== '' ? last : '';
  document.getElementById('hOdoLast').textContent = last !== ''
    ? 'Otomatis dari pengisian terakhir mobil ini.'
    : 'Belum ada data sebelumnya — isi manual bila tahu.';
}

/** Toggle checkbox otomatis/manual. */
function toggleAuto() {
  const auto = document.getElementById('f_auto').checked;
  const inp = document.getElementById('f_odoLast');
  if (auto) {
    inp.readOnly = true;
    fillLastOdo();
  } else {
    inp.readOnly = false;
    inp.value = '';
    document.getElementById('hOdoLast').textContent = 'Mode manual — ketik sendiri odometer terakhir isi.';
    inp.focus();
  }
  calcEff();
}

function calcEff() {
  const liter = Number(document.getElementById('f_liter').value);
  const odoLast = Number(document.getElementById('f_odoLast').value);
  const odoNow = Number(document.getElementById('f_odoNow').value);
  const km = (odoLast && odoNow && odoNow >= odoLast) ? (odoNow - odoLast) : 0;
  const eff = (liter>0 && km>0) ? (km/liter).toFixed(2)+' km/L' : '— km/L';
  document.getElementById('effPreview').textContent =
    (km>0 ? UI.num(km)+' km' : '— km') + ' · ' + eff;
}

async function pick(input, which) {
  const file = input.files[0]; if (!file) return;
  const hint = document.getElementById(which==='struk'?'hStruk':'hInd');
  hint.textContent = 'Mengompres & mengunggah…';
  try {
    const b64 = await UI.compressImage(file);
    const r = await API.uploadPhoto(b64, `${which}-${Date.now()}.jpg`, 'image/jpeg');
    if (!r.ok) throw r.error;
    if (which==='struk') fotoStruk = r.url; else fotoInd = r.url;
    hint.innerHTML = '<span style="color:var(--gauge)">✓ Terunggah</span>';
  } catch (e) { hint.innerHTML = '<span style="color:var(--alert)">Gagal: '+e+'</span>'; }
}

async function validate(id, status) {
  const r = await API.update('FUEL','FuelID',id,{ Status:status, ApprovedBy:user.name });
  if (!r.ok) return UI.toast(r.error,'err');
  UI.toast(status==='Approved'?'Klaim disetujui.':'Klaim ditolak.'); load();
}
