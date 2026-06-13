/* ============================================================
   FLEETCTRL — Dashboard (KPI & monitoring)
   ============================================================ */
const user = Session.guard('dashboard');
const content = UI.shell('dashboard', 'Dashboard Operasional');

(async function init() {
  UI.spinner(content);
  try {
    const [d, rem] = await Promise.all([API.dashboard(), API.reminders(30)]);
    if (!d.ok) throw new Error(d.error);
    render(d.data, rem.ok ? rem.data : []);
  } catch (e) {
    UI.empty(content, 'Gagal memuat dashboard: ' + e.message, '⚠');
  }
})();

function render(d, reminders) {
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
