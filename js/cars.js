/* ============================================================
   FLEETCTRL — Data Mobil (master + dokumen + status)
   ============================================================ */
const user = Session.guard('cars');
const content = UI.shell('cars', 'Data Mobil & Dokumen');
const STATUSES = ['Tersedia','Digunakan','Servis','Rusak'];
const BBM = ['Pertalite','Pertamax','Pertamax Turbo','Solar','Dexlite','Pertamina Dex'];
const DOC_TYPES = ['Pajak STNK','Asuransi','KIR'];
let cars = [], docs = [];

content.innerHTML = `
  <div class="toolbar">
    <div class="search"><input id="q" placeholder="Cari plat / merek / tipe…"></div>
    <button class="btn btn-primary" onclick="addCar()">＋ Tambah Mobil</button>
  </div>
  <div id="list"></div>`;
document.getElementById('q').oninput = e => renderList(e.target.value);

load();
async function load() {
  UI.spinner(document.getElementById('list'));
  const [c, d] = await Promise.all([API.list('CARS'), API.list('CAR_DOCS')]);
  cars = c.ok ? c.data : [];
  docs = d.ok ? d.data : [];
  renderList('');
}

function docsFor(plat) { return docs.filter(x => x.PlatNomor === plat); }
function nearestDoc(plat) {
  const today = new Date();
  return docsFor(plat).map(x => ({...x, days: Math.ceil((new Date(x.TanggalKadaluarsa)-today)/86400000)}))
    .sort((a,b)=>a.days-b.days)[0];
}

function renderList(q) {
  q = (q||'').toLowerCase();
  const rows = cars.filter(c =>
    [c.PlatNomor,c.Merek,c.Tipe].join(' ').toLowerCase().includes(q));
  document.getElementById('list').innerHTML = UI.table(rows, [
    { key:'PlatNomor', label:'Plat', render:v=>`<b style="font-family:var(--mono)">${v}</b>` },
    { key:'Merek', label:'Merek / Tipe', render:(v,r)=>`${v} ${r.Tipe}<div style="font-size:11px;color:var(--muted)">${r.Tahun} · ${r.JenisBBM}</div>` },
    { key:'KMTerakhir', label:'KM', render:v=>UI.num(v) },
    { key:'Status', label:'Status', render:v=>UI.statusBadge(v) },
    { key:'_doc', label:'Dokumen Terdekat', render:(_,r)=>{
        const d = nearestDoc(r.PlatNomor);
        if (!d) return '<span class="badge b-gray">—</span>';
        const cls = d.days<=7?'b-red':d.days<=30?'b-amber':'b-green';
        return `<span class="badge ${cls}">${d.JenisDokumen}: ${d.days<0?'lewat':d.days+' hr'}</span>`;
      }},
    { key:'_act', label:'', render:(_,r)=>`
        <button class="btn btn-ghost btn-sm" onclick="editCar('${r.PlatNomor}')">Edit</button>
        <button class="btn btn-ghost btn-sm" onclick="manageDocs('${r.PlatNomor}')">Dokumen</button>` },
  ]);
}

function carForm(c={}) {
  return `
    <div class="row">
      <div class="field"><label>Plat Nomor</label><input id="f_plat" value="${c.PlatNomor||''}" ${c.PlatNomor?'readonly':''} placeholder="DB 1234 XX"></div>
      <div class="field"><label>Tahun</label><input id="f_tahun" type="number" value="${c.Tahun||''}" placeholder="2022"></div>
    </div>
    <div class="row">
      <div class="field"><label>Merek</label><input id="f_merek" value="${c.Merek||''}" placeholder="Toyota"></div>
      <div class="field"><label>Tipe</label><input id="f_tipe" value="${c.Tipe||''}" placeholder="Avanza"></div>
    </div>
    <div class="row">
      <div class="field"><label>Jenis BBM</label><select id="f_bbm">${BBM.map(b=>`<option ${c.JenisBBM===b?'selected':''}>${b}</option>`).join('')}</select></div>
      <div class="field"><label>Status</label><select id="f_status">${STATUSES.map(s=>`<option ${c.Status===s?'selected':''}>${s}</option>`).join('')}</select></div>
    </div>
    <div class="row">
      <div class="field"><label>KM Terakhir</label><input id="f_km" type="number" value="${c.KMTerakhir||0}"></div>
      <div class="field"><label>Interval Servis (KM)</label><input id="f_int" type="number" value="${c.IntervalServisKM||5000}"></div>
    </div>
    <div class="field"><label>KM Servis Terakhir</label><input id="f_kms" type="number" value="${c.KMServisTerakhir||0}"><div class="hint">Dipakai untuk pengingat servis berkala otomatis.</div></div>`;
}

function collectCar() {
  return {
    PlatNomor: f_plat.value.trim(), Merek: f_merek.value.trim(), Tipe: f_tipe.value.trim(),
    Tahun: f_tahun.value, JenisBBM: f_bbm.value, Status: f_status.value,
    KMTerakhir: Number(f_km.value)||0, KMServisTerakhir: Number(f_kms.value)||0,
    IntervalServisKM: Number(f_int.value)||5000
  };
}

function addCar() {
  UI.modal({ title:'Tambah Mobil', bodyHtml: carForm(), onOk: async () => {
    const rec = collectCar();
    if (!rec.PlatNomor) throw 'Plat nomor wajib diisi.';
    const r = await API.insert('CARS', rec, 'PlatNomor');
    if (!r.ok) throw r.error;
    UI.closeModal(); UI.toast('Mobil ditambahkan.'); load();
  }});
}

function editCar(plat) {
  const c = cars.find(x=>x.PlatNomor===plat);
  UI.modal({ title:'Edit Mobil — '+plat, bodyHtml: carForm(c), onOk: async () => {
    const rec = collectCar();
    const r = await API.update('CARS', 'PlatNomor', plat, rec);
    if (!r.ok) throw r.error;
    UI.closeModal(); UI.toast('Perubahan disimpan.'); load();
  }});
}

function manageDocs(plat) {
  const list = docsFor(plat);
  const today = new Date();
  const rows = list.map(d => {
    const days = Math.ceil((new Date(d.TanggalKadaluarsa)-today)/86400000);
    const cls = days<=7?'b-red':days<=30?'b-amber':'b-green';
    return `<tr><td>${d.JenisDokumen}</td><td>${d.NomorDokumen||'-'}</td><td>${UI.date(d.TanggalKadaluarsa)}</td>
      <td><span class="badge ${cls}">${days<0?'Lewat':days+' hari'}</span></td></tr>`;
  }).join('');
  const body = `
    <div class="table-wrap" style="margin-bottom:16px">
      <table><thead><tr><th>Jenis</th><th>Nomor</th><th>Kadaluarsa</th><th>Sisa</th></tr></thead>
      <tbody>${rows||'<tr><td colspan=4 style="text-align:center;color:var(--muted)">Belum ada dokumen</td></tr>'}</tbody></table>
    </div>
    <h3 style="font-size:13px;margin-bottom:10px">Tambah / Perbarui Dokumen</h3>
    <div class="row">
      <div class="field"><label>Jenis</label><select id="d_jenis">${DOC_TYPES.map(t=>`<option>${t}</option>`).join('')}</select></div>
      <div class="field"><label>Nomor</label><input id="d_no"></div>
    </div>
    <div class="field"><label>Tanggal Kadaluarsa</label><input id="d_exp" type="date"></div>`;
  UI.modal({ title:'Dokumen — '+plat, okLabel:'Simpan Dokumen', bodyHtml: body, onOk: async () => {
    if (!d_exp.value) throw 'Tanggal kadaluarsa wajib diisi.';
    const r = await API.insert('CAR_DOCS', {
      PlatNomor: plat, JenisDokumen: d_jenis.value, NomorDokumen: d_no.value,
      TanggalKadaluarsa: d_exp.value, Catatan:''
    }, 'DocID', 'DOC');
    if (!r.ok) throw r.error;
    UI.closeModal(); UI.toast('Dokumen tersimpan.'); load();
  }});
}
