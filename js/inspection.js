/* ============================================================
   FLEETCTRL — Kontrol Kendaraan (FM-001-GA)
   Checklist inspeksi mobil oleh DRIVER, per mobil + periode + minggu.
   - Driver: isi & kirim form, lihat riwayat miliknya
   - Admin/GA/Manager: lihat rekap semua, buka detail
   Penyimpanan:
   - Inspections      : 1 baris per form (header + ringkasan)
   - InspectionItems  : 1 baris per item checklist (untuk audit/rekap)
   ============================================================ */
const user = Session.guard('inspection');
const content = UI.shell('inspection', 'Form Kontrol Kendaraan');
const isDriver = user.role === 'Driver';
const canRecap = ['Admin','Manager','GA'].includes(user.role);

/* Daftar item checklist — disusun persis dari form FM-001-GA */
const CHECKLIST = {
  'Bagian Dalam': [
    'Rem Tangan','Engine Break','Rem Kaki','Klakson',
    'Flasher Signal Kanan','Flasher Signal Kiri','Kaca Spion Dalam','Speedometer',
    'Kursi / Jok Pengemudi','Kursi / Jok Samping Pengemudi','Sabuk Pengaman',
    'Kotak P3K','Alat Pemadam Kebakaran (APAR)','Segitiga Pengaman','Kaca Film','Radio/Casset/CD'
  ],
  'Cairan & Body': [
    'Oli Stearing','Air Radiator','Minyak Rem','Air Wiper','Bahan Bakar',
    'Body Kendaraan (penyok/tidak)','Body & Ban dalam keadaan bersih','Oli Mesin'
  ],
  'Bagian Luar': [
    'Lampu Depan Kanan & Kiri','Kaca Spion Kanan & Kiri','Wiper / Penghapus Kaca',
    'Lampu Signal Depan Kanan & Kiri','Lampu Signal Belakang Kanan & Kiri','Lampu Hazard',
    'Lampu Kota Belakang Kanan & Kiri','Ban Depan Kanan & Kiri','Ban Belakang Kanan & Kiri',
    'Pintu Depan / Belakang Kanan & Kiri','Dinding Bak Kanan, Kiri & Belakang','Lampu Mundur',
    'Alarm Mundur','Lampu Rem Kanan & Kiri','Tempat Duduk Belakang','Surat-Surat Kendaraan',
    'Kunci Roda + Dongkrak','Ban Serep / Ban Pengganti','Air Conditioner'
  ]
};

let cars = [], inspections = [];

content.innerHTML = `
  <div class="toolbar">
    <div class="search"><input id="q" placeholder="Cari plat / driver / periode…"></div>
    ${(isDriver || user.role==='Admin') ? '<button class="btn btn-primary" onclick="newForm()">＋ Isi Form Kontrol</button>' : ''}
  </div>
  <div id="list"></div>`;
document.getElementById('q').oninput = e => renderList(e.target.value);

load();
async function load() {
  UI.spinner(document.getElementById('list'));
  const [c, i] = await Promise.all([API.list('CARS'), API.list('INSPECTIONS')]);
  cars = c.ok ? c.data : [];
  inspections = i.ok ? i.data : [];
  renderList('');
}

function visible() {
  // Driver hanya melihat form miliknya; Admin/GA/Manager melihat semua
  if (canRecap) return inspections;
  return inspections.filter(x => x.DriverID === user.id || x.NamaDriver === user.name);
}

function renderList(q) {
  q = (q||'').toLowerCase();
  const rows = visible()
    .filter(x => [x.PlatNomor,x.NamaDriver,x.Periode,x.KodeInv].join(' ').toLowerCase().includes(q))
    .reverse();
  document.getElementById('list').innerHTML = UI.table(rows, [
    { key:'TanggalCek', label:'Tanggal', render:v=>UI.date(v) },
    { key:'PlatNomor', label:'Mobil', render:(v,r)=>`<b style="font-family:var(--mono)">${v}</b><div style="font-size:11px;color:var(--muted)">${r.KodeInv||''}</div>` },
    { key:'NamaDriver', label:'Driver' },
    { key:'Periode', label:'Periode', render:(v,r)=>`${v} · ${r.MingguKe}` },
    { key:'JumlahNotOk', label:'Temuan', render:v=> Number(v)>0? `<span class="badge b-red">${v} Not OK</span>` : `<span class="badge b-green">Semua OK</span>` },
    { key:'FinalStatus', label:'Status Akhir', render:v=>UI.statusBadge(v==='OK'?'Disetujui':'Ditolak').replace('Disetujui','OK').replace('Ditolak','Not OK') },
    { key:'_act', label:'', render:(_,r)=>`<button class="btn btn-ghost btn-sm" onclick="viewForm('${r.InspeksiID}')">Detail</button>` },
  ]);
}

/* ---------------- Form pengisian (Driver) ---------------- */
function newForm() {
  const now = new Date();
  const bulan = now.toLocaleDateString('id-ID',{month:'long',year:'numeric'});
  const itemsHtml = Object.keys(CHECKLIST).map(cat => `
    <div style="margin-top:16px">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--sea);margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid var(--sea-soft)">${cat}</div>
      ${CHECKLIST[cat].map((item,idx) => {
        const id = cat.replace(/\W/g,'')+'_'+idx;
        return `<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--line)">
          <div style="flex:1;font-size:13px">${item}</div>
          <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:12px;font-weight:600;color:#15803d">
            <input type="radio" name="${id}" value="Ok" checked data-cat="${cat}" data-item="${item.replace(/"/g,'')}"> OK</label>
          <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:12px;font-weight:600;color:#b91c1c">
            <input type="radio" name="${id}" value="Not Ok" data-cat="${cat}" data-item="${item.replace(/"/g,'')}"> Not OK</label>
        </div>`;
      }).join('')}
    </div>`).join('');

  const body = `
    <div class="row">
      <div class="field"><label>Mobil</label>
        <select id="f_plat">${cars.map(c=>`<option value="${c.PlatNomor}">${c.PlatNomor} — ${c.Merek} ${c.Tipe}</option>`).join('')}</select></div>
      <div class="field"><label>Kode Inventaris</label><input id="f_kode" placeholder="cth: DM-01"></div>
    </div>
    <div class="row">
      <div class="field"><label>Periode Bulan</label><input id="f_periode" value="${bulan}"></div>
      <div class="field"><label>Kontrol Minggu Ke</label>
        <select id="f_minggu"><option>M1</option><option>M2</option><option>M3</option><option>M4</option></select></div>
    </div>
    <div style="max-height:340px;overflow-y:auto;border:1px solid var(--line);border-radius:10px;padding:0 14px 14px">${itemsHtml}</div>
    <div class="field" style="margin-top:14px"><label>Catatan / Lain-Lain</label><textarea id="f_catatan" rows="2" placeholder="Temuan tambahan, kondisi khusus…"></textarea></div>`;

  UI.modal({ title:'Form Kontrol Kendaraan — FM-001-GA', okLabel:'Kirim Form', bodyHtml: body, onOk: async () => {
    const plat = document.getElementById('f_plat').value;
    if (!plat) throw 'Pilih mobil terlebih dahulu.';
    const periode = document.getElementById('f_periode').value.trim();
    const minggu = document.getElementById('f_minggu').value;

    // kumpulkan semua jawaban
    const inputs = document.querySelectorAll('input[type=radio]:checked');
    const items = [...inputs].map(inp => ({
      Kategori: inp.dataset.cat, Item: inp.dataset.item, Status: inp.value
    }));
    const notOk = items.filter(i => i.Status === 'Not Ok').length;
    const finalStatus = notOk === 0 ? 'OK' : 'Not OK';
    const inspeksiId = 'INSP-' + Date.now();

    // header
    const header = {
      InspeksiID: inspeksiId, PlatNomor: plat, KodeInv: document.getElementById('f_kode').value,
      NamaDriver: user.name, DriverID: user.id, Periode: periode, MingguKe: minggu,
      TanggalCek: new Date().toISOString(), FinalStatus: finalStatus, JumlahNotOk: notOk,
      Catatan: document.getElementById('f_catatan').value
    };
    const r1 = await API.insert('INSPECTIONS', header, 'InspeksiID');
    if (!r1.ok) throw r1.error;

    // detail item (batch — 1 panggilan untuk ~45 baris)
    const itemRecords = items.map(it => ({
      InspeksiID: inspeksiId, PlatNomor: plat, Periode: periode, MingguKe: minggu,
      Kategori: it.Kategori, Item: it.Item, Status: it.Status, Keterangan: ''
    }));
    const r2 = await API.insertBatch('INSPECTION_ITEMS', itemRecords, 'ItemID', 'ITM');
    if (!r2.ok) throw r2.error;

    UI.closeModal();
    UI.toast(`Form terkirim. ${notOk===0?'Semua OK ✓':notOk+' item Not OK'}.`);
    load();
  }});
}

/* ---------------- Detail / rekap ---------------- */
async function viewForm(id) {
  const insp = inspections.find(x => x.InspeksiID === id);
  UI.modal({ title:'Detail Kontrol — '+insp.PlatNomor, okLabel:'Tutup', okClass:'btn-ghost',
    bodyHtml: '<div class="spinner"></div>',
    onOk: async () => UI.closeModal() });

  const r = await API.list('INSPECTION_ITEMS');
  const items = (r.ok ? r.data : []).filter(x => x.InspeksiID === id);

  const byCat = {};
  items.forEach(it => { (byCat[it.Kategori] = byCat[it.Kategori] || []).push(it); });
  const catHtml = Object.keys(byCat).map(cat => `
    <div style="margin-top:14px">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--sea);margin-bottom:6px">${cat}</div>
      ${byCat[cat].map(it => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--line);font-size:13px">
        <span>${it.Item}</span>${it.Status==='Ok'?'<span class="badge b-green">OK</span>':'<span class="badge b-red">Not OK</span>'}</div>`).join('')}
    </div>`).join('');

  const head = `
    <div class="grid cols-2" style="margin-bottom:6px">
      <div><b>Driver:</b> ${insp.NamaDriver}</div>
      <div><b>Kode Inv:</b> ${insp.KodeInv||'-'}</div>
      <div><b>Periode:</b> ${insp.Periode} · ${insp.MingguKe}</div>
      <div><b>Tanggal:</b> ${UI.date(insp.TanggalCek)}</div>
    </div>
    <div class="rem ${insp.FinalStatus==='OK'?'':'crit'}" style="${insp.FinalStatus==='OK'?'background:var(--gauge-soft);border-color:#bbf7d0':''}">
      <span class="badge ${insp.FinalStatus==='OK'?'b-green':'b-red'}">Status Akhir: ${insp.FinalStatus}</span>
      <span class="when">${insp.JumlahNotOk} Not OK</span>
    </div>
    ${insp.Catatan?`<div style="margin-top:8px;font-size:13px"><b>Catatan:</b> ${insp.Catatan}</div>`:''}`;

  document.querySelector('#modalBg .modal-body').innerHTML = head + catHtml;
}
