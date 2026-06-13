/* ============================================================
   FLEETCTRL — Servis & KM
   Catat servis berkala; reminder otomatis berdasarkan kelipatan
   interval KM (KMServisTerakhir + IntervalServisKM).
   ============================================================ */
const user = Session.guard('maintenance');
const content = UI.shell('maintenance', 'Servis Berkala & Riwayat KM');
const canManage = ['Admin','GA','Manager','Driver'].includes(user.role);
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
  const rows = maint.filter(m => [m.PlatNomor,m.Bengkel,m.JenisServis,m.Kategori].join(' ').toLowerCase().includes(q)).reverse();
  document.getElementById('list').innerHTML = UI.table(rows, [
    { key:'Tanggal', label:'Tanggal', render:v=>UI.date(v) },
    { key:'PlatNomor', label:'Mobil', render:v=>`<b style="font-family:var(--mono)">${v}</b>` },
    { key:'Kategori', label:'Kategori', render:(v,r)=>{
        const k = v || (r.KMSaatServis ? 'Penggantian Oli' : 'Maintenance');
        return k==='Penggantian Oli' ? '<span class="badge b-blue">Penggantian Oli</span>' : '<span class="badge b-gray">Maintenance</span>';
      }},
    { key:'KMSaatServis', label:'KM', render:v=> v? UI.num(v) : '<span style="color:var(--muted)">—</span>' },
    { key:'JenisServis', label:'Detail' },
    { key:'Bengkel', label:'Bengkel' },
    { key:'Biaya', label:'Biaya', render:v=>UI.rupiah(v) },
    { key:'Status', label:'Status', render:v=> v==='Dibatalkan'? UI.statusBadge('Dibatalkan') : '<span class="badge b-green">Tercatat</span>' },
    { key:'_act', label:'Aksi', render:(_,r)=> maintActions(r) },
  ]);
}

function maintActions(r) {
  if (r.Status === 'Dibatalkan') return '<span style="color:var(--muted);font-size:12px">Dibatalkan</span>';
  if (!canManage) return '<span style="color:var(--muted);font-size:12px">—</span>';
  return `<button class="btn btn-ghost btn-sm" onclick="editMaint('${r.MaintID}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="cancelMaint('${r.MaintID}')">Hapus</button>`;
}

function addMaint(existing) {
  const ed = existing || null;
  const kat = ed ? (ed.Kategori || (ed.KMSaatServis ? 'Penggantian Oli' : 'Maintenance')) : 'Penggantian Oli';
  const body = `
    <div class="field"><label>Mobil</label><select id="f_plat" onchange="fillKm()">${cars.map(c=>`<option value="${c.PlatNomor}" data-km="${c.KMTerakhir||0}" ${ed&&ed.PlatNomor===c.PlatNomor?'selected':''}>${c.PlatNomor} — ${c.Merek} ${c.Tipe}</option>`).join('')}</select></div>
    <div class="row">
      <div class="field"><label>Kategori</label>
        <select id="f_kat" onchange="onKatChange()">
          <option value="Penggantian Oli" ${kat==='Penggantian Oli'?'selected':''}>Penggantian Oli</option>
          <option value="Maintenance" ${kat==='Maintenance'?'selected':''}>Maintenance</option>
        </select>
      </div>
      <div class="field"><label>Tanggal</label><input id="f_tgl" type="date" value="${ed?(ed.Tanggal? new Date(ed.Tanggal).toISOString().slice(0,10):''):new Date().toISOString().slice(0,10)}"></div>
    </div>
    <div class="field"><label>KM Saat Servis <span id="kmReq" style="color:var(--alert)">*</span></label>
      <input id="f_km" type="number" value="${ed?(ed.KMSaatServis||''):''}">
      <div class="hint" id="kmHint">Untuk penggantian oli, KM wajib diisi dan akan me-reset pengingat servis berkala.</div>
    </div>
    <div class="field"><label>Detail Servis</label><input id="f_jenis" value="${ed?(ed.JenisServis||''):''}" placeholder="cth: Ganti oli mesin + filter"></div>
    <div class="row">
      <div class="field"><label>Bengkel</label><input id="f_bengkel" value="${ed?(ed.Bengkel||''):''}"></div>
      <div class="field"><label>Biaya (Rp)</label><input id="f_biaya" type="number" value="${ed?ed.Biaya:''}"></div>
    </div>
    <div class="field"><label>Catatan</label><textarea id="f_cat" rows="2">${ed?(ed.Catatan||''):''}</textarea></div>`;
  UI.modal({ title: ed?'Edit Servis':'Catat Servis', okLabel: ed?'Simpan Perubahan':'Simpan', bodyHtml: body, onOk: async () => {
    const plat = f_plat.value;
    const kategori = f_kat.value;
    const isOli = kategori === 'Penggantian Oli';
    const km = Number(f_km.value)||0;
    if (isOli && !km) throw 'Untuk penggantian oli, KM saat servis wajib diisi.';
    const data = {
      PlatNomor:plat, Tanggal:f_tgl.value, Kategori:kategori,
      KMSaatServis: isOli ? km : '',
      JenisServis:f_jenis.value, Biaya:Number(f_biaya.value)||0,
      Bengkel:f_bengkel.value, Catatan:f_cat.value
    };
    if (ed) {
      const r = await API.update('MAINTENANCE','MaintID',ed.MaintID,data);
      if (!r.ok) throw r.error;
      // hanya penggantian oli yang memperbarui titik servis mobil
      if (isOli && km) await API.update('CARS','PlatNomor',plat,{ KMServisTerakhir:km });
      UI.closeModal(); UI.toast('Perubahan servis disimpan.'); load();
    } else {
      data.Status = 'Tercatat';
      const r = await API.insert('MAINTENANCE', data, 'MaintID', 'MNT');
      if (!r.ok) throw r.error;
      if (isOli && km) {
        // reset pengingat servis berkala + mobil kembali tersedia
        await API.update('CARS','PlatNomor',plat,{ KMServisTerakhir:km, Status:'Tersedia' });
        UI.closeModal(); UI.toast('Penggantian oli tercatat, pengingat di-reset.'); load();
      } else {
        await API.update('CARS','PlatNomor',plat,{ Status:'Tersedia' });
        UI.closeModal(); UI.toast('Maintenance tercatat.'); load();
      }
    }
  }});
  setTimeout(()=>{ onKatChange(); fillKm(); }, 50);
}

/** Aktif/nonaktifkan kolom KM sesuai kategori. */
function onKatChange() {
  const isOli = document.getElementById('f_kat').value === 'Penggantian Oli';
  const km = document.getElementById('f_km');
  const req = document.getElementById('kmReq');
  const hint = document.getElementById('kmHint');
  km.disabled = !isOli;
  req.style.display = isOli ? 'inline' : 'none';
  if (isOli) {
    km.style.background = '';
    hint.textContent = 'Untuk penggantian oli, KM wajib diisi dan akan me-reset pengingat servis berkala.';
    if (!km.value) fillKm();
  } else {
    km.value = '';
    km.style.background = '#F1F5F9';
    hint.textContent = 'Maintenance tidak memerlukan KM — kolom dinonaktifkan dan pengingat servis tidak berubah.';
  }
}

function editMaint(id) {
  if (!canManage) return UI.toast('Anda tidak berhak mengedit.', 'err');
  const r = maint.find(x=>x.MaintID===id);
  if (r) addMaint(r);
}

function cancelMaint(id) {
  if (!canManage) return UI.toast('Anda tidak berhak menghapus.', 'err');
  const r = maint.find(x=>x.MaintID===id);
  UI.modal({ title:'Hapus Data Servis', okLabel:'Ya, Hapus', okClass:'btn-danger',
    bodyHtml: `<p style="color:var(--ink-2)">Data servis <b>${r.PlatNomor}</b> (${UI.date(r.Tanggal)}) akan ditandai <b>Dibatalkan</b>.</p>
      <div class="rem warn" style="margin-top:12px"><span class="badge b-amber">Catatan</span>Data tetap tersimpan di Sheet untuk audit.</div>`,
    onOk: async () => {
      const res = await API.cancel('MAINTENANCE','MaintID',id,user.name);
      if (!res.ok) throw res.error;
      UI.closeModal(); UI.toast('Data servis ditandai dibatalkan.'); load();
    }});
}

function fillKm() {
  const katSel = document.getElementById('f_kat');
  if (katSel && katSel.value !== 'Penggantian Oli') return; // KM nonaktif untuk Maintenance
  const sel = document.getElementById('f_plat');
  const km = sel.options[sel.selectedIndex].dataset.km;
  const kmField = document.getElementById('f_km');
  if (!kmField.value) kmField.value = km; // jangan timpa nilai yang sudah ada
}
