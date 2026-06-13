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
  const rows = fuel.filter(f => [f.PlatNomor,f.LokasiSPBU].join(' ').toLowerCase().includes(q)).reverse();
  document.getElementById('list').innerHTML = UI.table(rows, [
    { key:'Tanggal', label:'Tanggal', render:v=>UI.date(v) },
    { key:'PlatNomor', label:'Mobil', render:v=>`<b style="font-family:var(--mono)">${v}</b>` },
    { key:'JenisBBM', label:'BBM', render:(v,r)=>`${v}<div style="font-size:11px;color:var(--muted)">${UI.num(r.Liter)} L · ${r.LokasiSPBU||''}</div>` },
    { key:'Biaya', label:'Biaya', render:v=>UI.rupiah(v) },
    { key:'KMPerLiter', label:'Efisiensi', render:v=> v? `<span class="badge b-green">${v} km/L</span>` : '<span class="badge b-gray">—</span>' },
    { key:'_foto', label:'Bukti', render:(_,r)=>`
        ${r.FotoStruk?`<img class="thumb" src="${r.FotoStruk}" onclick="window.open('${r.FotoStruk}')" title="Struk">`:''}
        ${r.FotoIndikator?`<img class="thumb" src="${r.FotoIndikator}" onclick="window.open('${r.FotoIndikator}')" title="Indikator">`:''}` },
    { key:'Status', label:'Status', render:v=>UI.statusBadge(v) },
    { key:'_act', label:'', render:(_,r)=> (canValidate && r.Status==='Pending')?
        `<button class="btn btn-primary btn-sm" onclick="validate('${r.FuelID}','Approved')">Setujui</button>
         <button class="btn btn-danger btn-sm" onclick="validate('${r.FuelID}','Rejected')">Tolak</button>` : '' },
  ]);
}

function addFuel() {
  fotoStruk=''; fotoInd='';
  const body = `
    <div class="row">
      <div class="field"><label>Mobil</label><select id="f_plat">${cars.map(c=>`<option>${c.PlatNomor}</option>`).join('')}</select></div>
      <div class="field"><label>Jenis BBM</label><select id="f_bbm">${BBM.map(b=>`<option>${b}</option>`).join('')}</select></div>
    </div>
    <div class="row">
      <div class="field"><label>Liter</label><input id="f_liter" type="number" step="0.01" oninput="calcEff()"></div>
      <div class="field"><label>Biaya (Rp)</label><input id="f_biaya" type="number"></div>
    </div>
    <div class="row">
      <div class="field"><label>Lokasi SPBU</label><input id="f_spbu" placeholder="SPBU 7x.xxx"></div>
      <div class="field"><label>Jarak sejak isi terakhir (KM)</label><input id="f_km" type="number" oninput="calcEff()"><div class="hint">Untuk hitung km/L.</div></div>
    </div>
    <div class="rem warn"><span class="badge b-amber">Estimasi Efisiensi</span><b id="effPreview">— km/L</b></div>
    <div class="row" style="margin-top:6px">
      <div class="field"><label>Foto Struk Bensin</label><input id="f_struk" type="file" accept="image/*" onchange="pick(this,'struk')"><div class="hint" id="hStruk">Wajib.</div></div>
      <div class="field"><label>Foto Indikator/Odometer</label><input id="f_ind" type="file" accept="image/*" onchange="pick(this,'ind')"><div class="hint" id="hInd">Wajib.</div></div>
    </div>`;
  UI.modal({ title:'Pengajuan Pengisian BBM', okLabel:'Kirim Klaim', bodyHtml: body, onOk: async () => {
    const liter = Number(f_liter.value), biaya = Number(f_biaya.value), km = Number(f_km.value)||0;
    if (!liter || !biaya) throw 'Liter dan biaya wajib diisi.';
    if (!fotoStruk || !fotoInd) throw 'Foto struk dan foto indikator wajib diunggah.';
    const kmPerLiter = (km>0 && liter>0) ? +(km/liter).toFixed(2) : '';
    const rec = {
      PlatNomor:f_plat.value, DriverID:'', Tanggal:new Date().toISOString(), JenisBBM:f_bbm.value,
      Liter:liter, Biaya:biaya, LokasiSPBU:f_spbu.value, SelisihKM:km, KMPerLiter:kmPerLiter,
      FotoStruk:fotoStruk, FotoIndikator:fotoInd, Status:'Pending', ApprovedBy:''
    };
    const r = await API.insert('FUEL', rec, 'FuelID', 'FUEL');
    if (!r.ok) throw r.error;
    UI.closeModal(); UI.toast('Klaim BBM terkirim.'); load();
  }});
}

function calcEff() {
  const liter = Number(document.getElementById('f_liter').value);
  const km = Number(document.getElementById('f_km').value);
  document.getElementById('effPreview').textContent =
    (liter>0 && km>0) ? (km/liter).toFixed(2)+' km/L' : '— km/L';
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
