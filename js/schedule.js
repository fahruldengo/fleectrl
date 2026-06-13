/* ============================================================
   FLEETCTRL — Jadwal Driver (anti-overbooking)
   Menyimpan rentang tanggal penugasan tiap driver; saat membuat
   jadwal baru sistem memeriksa tumpang tindih (bentrok).
   ============================================================ */
const user = Session.guard('schedule');
const content = UI.shell('schedule', 'Jadwal & Penugasan Driver');
let sched = [], drivers = [], cars = [];

content.innerHTML = `
  <div class="toolbar">
    <div class="search"><input id="q" placeholder="Cari driver / plat…"></div>
    <button class="btn btn-primary" onclick="addSched()">＋ Tambah Penugasan</button>
  </div>
  <div class="card" style="margin-bottom:16px">
    <h3>◷ Timeline 14 Hari ke Depan</h3>
    <div id="timeline"></div>
  </div>
  <div id="list"></div>`;
document.getElementById('q').oninput = e => renderList(e.target.value);

load();
async function load() {
  UI.spinner(document.getElementById('list'));
  const [s,d,c] = await Promise.all([API.list('SCHEDULE'), API.list('DRIVERS'), API.list('CARS')]);
  sched = s.ok ? s.data : []; drivers = d.ok ? d.data : []; cars = c.ok ? c.data : [];
  renderTimeline(); renderList('');
}

function overlap(aStart,aEnd,bStart,bEnd) {
  return new Date(aStart) <= new Date(bEnd) && new Date(bStart) <= new Date(aEnd);
}

function renderTimeline() {
  const tl = document.getElementById('timeline');
  const days = [...Array(14)].map((_,i)=>{ const d=new Date(); d.setDate(d.getDate()+i); return d; });
  const driverList = drivers.filter(d=>d.Status!=='Nonaktif');
  if (!driverList.length) return UI.empty(tl, 'Belum ada driver.', '☺');

  const header = `<div style="display:grid;grid-template-columns:130px repeat(14,1fr);gap:2px;margin-bottom:4px">
    <div></div>${days.map(d=>`<div style="font-size:10px;text-align:center;color:var(--muted);font-weight:700">${d.getDate()}/${d.getMonth()+1}</div>`).join('')}</div>`;

  const rows = driverList.map(dr => {
    const cells = days.map(day => {
      const busy = sched.some(s => s.DriverID===dr.DriverID && overlap(day,day,s.TanggalMulai,s.TanggalSelesai));
      return `<div style="height:22px;border-radius:4px;background:${busy?'var(--sea)':'#F1F5F9'}"></div>`;
    }).join('');
    return `<div style="display:grid;grid-template-columns:130px repeat(14,1fr);gap:2px;margin-bottom:3px;align-items:center">
      <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${dr.Nama}</div>${cells}</div>`;
  }).join('');
  tl.innerHTML = header + rows + `<div style="margin-top:10px;font-size:11px;color:var(--muted)"><span style="display:inline-block;width:12px;height:12px;background:var(--sea);border-radius:3px;vertical-align:middle"></span> Bertugas &nbsp; <span style="display:inline-block;width:12px;height:12px;background:#F1F5F9;border-radius:3px;vertical-align:middle"></span> Tersedia</div>`;
}

function renderList(q) {
  q = (q||'').toLowerCase();
  const rows = sched.filter(s => [s.NamaDriver,s.PlatNomor,s.Keterangan].join(' ').toLowerCase().includes(q))
    .sort((a,b)=> new Date(a.TanggalMulai)-new Date(b.TanggalMulai));
  document.getElementById('list').innerHTML = UI.table(rows, [
    { key:'NamaDriver', label:'Driver', render:v=>`<b>${v}</b>` },
    { key:'PlatNomor', label:'Mobil', render:v=>`<span style="font-family:var(--mono)">${v||'-'}</span>` },
    { key:'TanggalMulai', label:'Mulai', render:v=>UI.date(v) },
    { key:'TanggalSelesai', label:'Selesai', render:v=>UI.date(v) },
    { key:'Keterangan', label:'Keterangan' },
  ]);
}

function addSched() {
  const body = `
    <div class="field"><label>Driver</label><select id="f_driver">${drivers.filter(d=>d.Status!=='Nonaktif').map(d=>`<option value="${d.DriverID}|${d.Nama}">${d.Nama}</option>`).join('')}</select></div>
    <div class="field"><label>Mobil (opsional)</label><select id="f_plat"><option value="">—</option>${cars.map(c=>`<option>${c.PlatNomor}</option>`).join('')}</select></div>
    <div class="row">
      <div class="field"><label>Tanggal Mulai</label><input id="f_start" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
      <div class="field"><label>Tanggal Selesai</label><input id="f_end" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
    </div>
    <div class="field"><label>Keterangan</label><input id="f_ket" placeholder="cth: Dinas luar kota"></div>`;
  UI.modal({ title:'Tambah Penugasan Driver', bodyHtml: body, onOk: async () => {
    const [did,dname] = f_driver.value.split('|');
    const start = f_start.value, end = f_end.value;
    if (new Date(end) < new Date(start)) throw 'Tanggal selesai sebelum tanggal mulai.';
    // deteksi bentrok
    const clash = sched.find(s => s.DriverID===did && overlap(start,end,s.TanggalMulai,s.TanggalSelesai));
    if (clash) throw `Bentrok! ${dname} sudah bertugas ${UI.date(clash.TanggalMulai)}–${UI.date(clash.TanggalSelesai)}.`;
    const r = await API.insert('SCHEDULE', {
      DriverID:did, NamaDriver:dname, PlatNomor:f_plat.value,
      TanggalMulai:start, TanggalSelesai:end, TripID:'', Keterangan:f_ket.value
    }, 'SchedID', 'SCH');
    if (!r.ok) throw r.error;
    UI.closeModal(); UI.toast('Penugasan tersimpan.'); load();
  }});
}
