/* ============================================================
   FLEETCTRL — Dashboard (KPI & monitoring)
   ============================================================ */
const user = Session.guard('dashboard');
const content = UI.shell('dashboard', 'Dashboard Operasional');

(async function init() {
  UI.spinner(content);
  try {
    const [d, rem, t] = await Promise.all([API.dashboard(), API.reminders(30), API.list('TRIPS')]);
    if (!d.ok) throw new Error(d.error);
    render(d.data, rem.ok ? rem.data : [], t.ok ? t.data : []);
  } catch (e) {
    UI.empty(content, 'Gagal memuat dashboard: ' + e.message, '⚠');
  }
})();

function render(d, reminders, allTrips) {
  const sc = d.statusCount;
  const crit = reminders.filter(r => (r.sisaHari!=null && r.sisaHari <= 7) || (r.sisaKM!=null && r.sisaKM <= 0));

  content.innerHTML = `
    <div class="grid cols-4" style="margin-bottom:16px">
      <div class="kpi green"><div class="bar"></div>
        <div class="label">Total Armada</div>
        <div class="value">${d.totalCars}</div>
        <div class="sub">${sc.Tersedia} tersedia · ${sc.Digunakan} dipakai</div>
      </div>
      <div class="kpi blue"><div class="bar"></div>
        <div class="label">Perjalanan Aktif</div>
        <div class="value">${d.activeTrips}</div>
        <div class="sub">${d.pendingApproval} menunggu approval</div>
      </div>
      <div class="kpi amber"><div class="bar"></div>
        <div class="label">Biaya BBM Bulan Ini</div>
        <div class="value" style="font-size:22px">${UI.rupiah(d.fuelCostMonth)}</div>
        <div class="sub">${UI.num(d.litersMonth)} liter terisi</div>
      </div>
      <div class="kpi red"><div class="bar"></div>
        <div class="label">Perlu Perhatian</div>
        <div class="value">${reminders.length}</div>
        <div class="sub">${crit.length} kritis (≤7 hari / lewat)</div>
      </div>
    </div>

    <div class="grid cols-3">
      <div class="card" style="grid-column:span 2">
        <h3>⏰ Pengingat — Dokumen, SIM & Servis</h3>
        <div id="remBox"></div>
      </div>
      <div class="card">
        <h3>⛟ Status Armada</h3>
        ${statusRow('Tersedia', sc.Tersedia, d.totalCars, 'b-green')}
        ${statusRow('Digunakan', sc.Digunakan, d.totalCars, 'b-blue')}
        ${statusRow('Servis', sc.Servis, d.totalCars, 'b-amber')}
        ${statusRow('Rusak', sc.Rusak, d.totalCars, 'b-red')}
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <h3>⛽ Efisiensi BBM per Kendaraan (KM / Liter)</h3>
      <div id="effBox"></div>
    </div>

    <div class="card" style="margin-top:16px">
      <h3 style="justify-content:space-between"><span>▦ Penggunaan per Mobil (30 hari terakhir)</span>
        <a href="history.html" style="font-size:12px;font-weight:600">Lihat riwayat lengkap →</a></h3>
      <div id="usageBox"></div>
    </div>`;

  // Reminders
  const remBox = document.getElementById('remBox');
  if (!reminders.length) {
    UI.empty(remBox, 'Tidak ada pengingat dalam 30 hari ke depan. 👍', '✓');
  } else {
    remBox.innerHTML = reminders.slice(0, 8).map(r => {
      const isKm = r.sisaKM != null;
      const val = isKm ? r.sisaKM : r.sisaHari;
      const crit = isKm ? val <= 0 : val <= 7;
      const cls = crit ? 'crit' : 'warn';
      const when = isKm
        ? (val <= 0 ? 'LEWAT!' : val + ' KM lagi')
        : (val < 0 ? Math.abs(val)+' hr lewat' : val + ' hari lagi');
      return `<div class="rem ${cls}">
        <span class="badge ${crit?'b-red':'b-amber'}">${r.tipe}</span>
        <div><b>${r.ref}</b> — ${r.detail}</div>
        <span class="when">${when}</span>
      </div>`;
    }).join('');
  }

  // Efficiency
  const effBox = document.getElementById('effBox');
  if (!d.efficiency.length) {
    UI.empty(effBox, 'Belum ada data konsumsi BBM untuk dihitung.', '⛽');
  } else {
    const max = Math.max(...d.efficiency.map(e => e.kmPerLiter));
    effBox.innerHTML = d.efficiency.sort((a,b)=>b.kmPerLiter-a.kmPerLiter).map(e => `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
        <div style="width:110px;font-weight:700;font-family:var(--mono)">${e.plat}</div>
        <div style="flex:1;background:#F1F5F9;border-radius:99px;height:22px;overflow:hidden">
          <div style="width:${(e.kmPerLiter/max*100).toFixed(0)}%;height:100%;background:linear-gradient(90deg,var(--gauge),#22c55e);border-radius:99px;display:flex;align-items:center;justify-content:flex-end;padding-right:8px;color:#fff;font-size:11px;font-weight:700">${e.kmPerLiter}</div>
        </div>
        <div style="width:70px;text-align:right;font-size:12px;color:var(--muted)">km/L</div>
      </div>`).join('');
  }

  // Penggunaan per mobil — 30 hari terakhir, dari trip Selesai
  const usageBox = document.getElementById('usageBox');
  const since = new Date(); since.setDate(since.getDate() - 30);
  const done = (allTrips||[]).filter(t => {
    if (t.Status !== 'Selesai') return false;
    const dt = new Date(t.JamKembali || t.TanggalRencana);
    return !isNaN(dt) && dt >= since;
  });
  if (!done.length) {
    UI.empty(usageBox, 'Belum ada perjalanan selesai dalam 30 hari terakhir.', '▦');
  } else {
    const map = {};
    done.forEach(t => {
      const k = t.PlatNomor;
      if (!map[k]) map[k] = { plat:k, km:0, trips:0, drivers:new Set() };
      map[k].km += Number(t.SelisihKM)||0;
      map[k].trips++;
      if (t.NamaDriver||t.Pemohon) map[k].drivers.add(t.NamaDriver||t.Pemohon);
    });
    const rows = Object.values(map).sort((a,b)=>b.km-a.km);
    const maxKm = Math.max(...rows.map(r=>r.km), 1);
    usageBox.innerHTML = rows.slice(0,6).map(r => `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
        <div style="width:110px;font-weight:700;font-family:var(--mono)">${r.plat}</div>
        <div style="flex:1;background:#F1F5F9;border-radius:99px;height:22px;overflow:hidden">
          <div style="width:${(r.km/maxKm*100).toFixed(0)}%;height:100%;background:linear-gradient(90deg,var(--sea),#3b82f6);border-radius:99px;display:flex;align-items:center;justify-content:flex-end;padding-right:8px;color:#fff;font-size:11px;font-weight:700">${UI.num(r.km)} km</div>
        </div>
        <div style="width:120px;text-align:right;font-size:12px;color:var(--muted)">${r.trips} trip · ${r.drivers.size} driver</div>
      </div>`).join('');
  }
}

function statusRow(label, n, total, cls) {
  const pct = total ? (n/total*100).toFixed(0) : 0;
  return `<div style="margin-bottom:12px">
    <div style="display:flex;justify-content:space-between;margin-bottom:5px">
      <span class="badge ${cls}">${label}</span><b>${n}</b>
    </div>
    <div style="background:#F1F5F9;border-radius:99px;height:7px;overflow:hidden">
      <div style="width:${pct}%;height:100%;background:var(--${cls==='b-green'?'gauge':cls==='b-blue'?'sea':cls==='b-amber'?'signal':'alert'})"></div>
    </div>
  </div>`;
}
