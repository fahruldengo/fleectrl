/**
 * ============================================================================
 * FLEETCTRL — Google Apps Script Backend (Web App / API)
 * ============================================================================
 * Deploy: Extensions > Apps Script > Deploy > New deployment > Web app
 *   - Execute as: Me
 *   - Who has access: Anyone
 * Salin URL /exec ke js/config.js (API_URL).
 *
 * CATATAN CORS: GitHub Pages (origin lain) tidak bisa kirim header custom ke
 * Apps Script. Maka SEMUA request memakai method GET dengan query string,
 * dan untuk payload besar (foto) memakai application/x-www-form-urlencoded
 * via "simple request" (tanpa preflight). Lihat doPost.
 * ============================================================================
 */

var SHEET_ID = 'GANTI_DENGAN_SPREADSHEET_ID'; // <-- ISI ID Google Sheet Anda
var FOLDER_ID = 'GANTI_DENGAN_DRIVE_FOLDER_ID'; // <-- folder Drive untuk foto

// Daftar sheet (tab) yang dipakai
var SHEETS = {
  USERS: 'Users',
  CARS: 'Cars',
  CAR_DOCS: 'CarDocs',
  DRIVERS: 'Drivers',
  TRIPS: 'Trips',        // permohonan + log keluar masuk
  KM_LOG: 'KmLog',
  MAINTENANCE: 'Maintenance',
  FUEL: 'Fuel',
  SCHEDULE: 'Schedule'
};

function doGet(e) {
  return handle(e);
}

function doPost(e) {
  return handle(e);
}

function handle(e) {
  var out = { ok: false };
  try {
    var p = (e && e.parameter) ? e.parameter : {};
    // payload JSON bisa dikirim via parameter "payload"
    if (p.payload) {
      try { p = Object.assign(p, JSON.parse(p.payload)); } catch (err) {}
    }
    var action = p.action || '';

    switch (action) {
      case 'login':           out = apiLogin(p); break;
      case 'list':            out = apiList(p); break;
      case 'insert':          out = apiInsert(p); break;
      case 'update':          out = apiUpdate(p); break;
      case 'uploadPhoto':     out = apiUploadPhoto(p); break;
      case 'dashboard':       out = apiDashboard(p); break;
      case 'reminders':       out = apiReminders(p); break;
      default: out = { ok: false, error: 'Unknown action: ' + action };
    }
  } catch (err) {
    out = { ok: false, error: String(err) };
  }
  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ----------------------------- Helpers ---------------------------------- */

function ss() { return SpreadsheetApp.openById(SHEET_ID); }

function sheet(name) {
  var s = ss().getSheetByName(name);
  if (!s) s = ss().insertSheet(name);
  return s;
}

function getRows(name) {
  var s = sheet(name);
  var values = s.getDataRange().getValues();
  if (values.length < 1) return [];
  var headers = values.shift();
  return values.map(function (row) {
    var obj = {};
    headers.forEach(function (h, i) { obj[h] = row[i]; });
    return obj;
  });
}

function getHeaders(name) {
  var s = sheet(name);
  var lastCol = s.getLastColumn();
  if (lastCol < 1) return [];
  return s.getRange(1, 1, 1, lastCol).getValues()[0];
}

function appendRow(name, obj) {
  var s = sheet(name);
  var headers = getHeaders(name);
  if (headers.length === 0) {
    headers = Object.keys(obj);
    s.appendRow(headers);
  }
  var row = headers.map(function (h) { return obj[h] !== undefined ? obj[h] : ''; });
  s.appendRow(row);
  return obj;
}

function updateRowById(name, idField, idValue, patch) {
  var s = sheet(name);
  var values = s.getDataRange().getValues();
  var headers = values[0];
  var idCol = headers.indexOf(idField);
  if (idCol < 0) return { ok: false, error: 'ID field not found' };
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][idCol]) === String(idValue)) {
      headers.forEach(function (h, c) {
        if (patch[h] !== undefined) {
          s.getRange(r + 1, c + 1).setValue(patch[h]);
        }
      });
      return { ok: true };
    }
  }
  return { ok: false, error: 'Row not found' };
}

function uid(prefix) {
  return (prefix || 'ID') + '-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000);
}

/* ------------------------------- API ------------------------------------ */

function apiLogin(p) {
  var users = getRows(SHEETS.USERS);
  var u = users.filter(function (x) {
    return String(x.Username).toLowerCase() === String(p.username).toLowerCase()
        && String(x.Password) === String(p.password)
        && String(x.Status).toLowerCase() === 'aktif';
  })[0];
  if (!u) return { ok: false, error: 'Username, password, atau status akun tidak valid.' };
  return { ok: true, user: { id: u.UserID, name: u.Nama, role: u.Role, username: u.Username } };
}

function apiList(p) {
  var name = SHEETS[p.sheet] || p.sheet;
  return { ok: true, data: getRows(name) };
}

function apiInsert(p) {
  var name = SHEETS[p.sheet] || p.sheet;
  var record = p.record || {};
  if (typeof record === 'string') record = JSON.parse(record);
  if (!record[p.idField || 'ID']) {
    record[p.idField || 'ID'] = uid(p.idPrefix || 'ID');
  }
  appendRow(name, record);
  return { ok: true, record: record };
}

function apiUpdate(p) {
  var name = SHEETS[p.sheet] || p.sheet;
  var patch = p.patch || {};
  if (typeof patch === 'string') patch = JSON.parse(patch);
  return updateRowById(name, p.idField, p.idValue, patch);
}

function apiUploadPhoto(p) {
  var folder = DriveApp.getFolderById(FOLDER_ID);
  var data = p.base64;
  var contentType = p.contentType || 'image/jpeg';
  var bytes = Utilities.base64Decode(data.replace(/^data:[^;]+;base64,/, ''));
  var blob = Utilities.newBlob(bytes, contentType, p.filename || ('photo-' + Date.now() + '.jpg'));
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var url = 'https://drive.google.com/uc?export=view&id=' + file.getId();
  return { ok: true, url: url, fileId: file.getId() };
}

function apiDashboard(p) {
  var cars = getRows(SHEETS.CARS);
  var trips = getRows(SHEETS.TRIPS);
  var fuel = getRows(SHEETS.FUEL);
  var drivers = getRows(SHEETS.DRIVERS);

  var statusCount = { Tersedia: 0, Digunakan: 0, Servis: 0, Rusak: 0 };
  cars.forEach(function (c) { if (statusCount[c.Status] !== undefined) statusCount[c.Status]++; });

  var now = new Date();
  var month = now.getMonth(), year = now.getFullYear();
  var fuelCostMonth = 0, litersMonth = 0;
  fuel.forEach(function (f) {
    var d = f.Tanggal ? new Date(f.Tanggal) : null;
    if (d && d.getMonth() === month && d.getFullYear() === year) {
      fuelCostMonth += Number(f.Biaya) || 0;
      litersMonth += Number(f.Liter) || 0;
    }
  });

  var pending = trips.filter(function (t) { return String(t.Status) === 'Menunggu Approval'; }).length;
  var active = trips.filter(function (t) { return String(t.Status) === 'Berjalan'; }).length;

  // KM/Liter per mobil (rata-rata sederhana dari fuel log)
  var effByCar = {};
  fuel.forEach(function (f) {
    var km = Number(f.SelisihKM) || 0, l = Number(f.Liter) || 0;
    if (km > 0 && l > 0) {
      if (!effByCar[f.PlatNomor]) effByCar[f.PlatNomor] = { km: 0, l: 0 };
      effByCar[f.PlatNomor].km += km;
      effByCar[f.PlatNomor].l += l;
    }
  });
  var efficiency = Object.keys(effByCar).map(function (plat) {
    return { plat: plat, kmPerLiter: +(effByCar[plat].km / effByCar[plat].l).toFixed(2) };
  });

  return {
    ok: true,
    data: {
      totalCars: cars.length,
      totalDrivers: drivers.length,
      statusCount: statusCount,
      fuelCostMonth: fuelCostMonth,
      litersMonth: litersMonth,
      pendingApproval: pending,
      activeTrips: active,
      efficiency: efficiency
    }
  };
}

function apiReminders(p) {
  var today = new Date();
  var horizon = Number(p.days) || 30;
  var items = [];

  // Dokumen mobil (pajak, asuransi, kir)
  getRows(SHEETS.CAR_DOCS).forEach(function (d) {
    if (!d.TanggalKadaluarsa) return;
    var exp = new Date(d.TanggalKadaluarsa);
    var diff = Math.ceil((exp - today) / 86400000);
    if (diff <= horizon) {
      items.push({ tipe: 'Dokumen Mobil', ref: d.PlatNomor, detail: d.JenisDokumen, sisaHari: diff, tanggal: d.TanggalKadaluarsa });
    }
  });

  // SIM driver
  getRows(SHEETS.DRIVERS).forEach(function (dr) {
    if (!dr.MasaBerlakuSIM) return;
    var exp = new Date(dr.MasaBerlakuSIM);
    var diff = Math.ceil((exp - today) / 86400000);
    if (diff <= horizon) {
      items.push({ tipe: 'SIM Driver', ref: dr.Nama, detail: dr.NoSIM, sisaHari: diff, tanggal: dr.MasaBerlakuSIM });
    }
  });

  // Servis berkala (KM)
  var cars = getRows(SHEETS.CARS);
  cars.forEach(function (c) {
    var km = Number(c.KMTerakhir) || 0;
    var interval = Number(c.IntervalServisKM) || 5000;
    var lastService = Number(c.KMServisTerakhir) || 0;
    var nextService = lastService + interval;
    var sisaKM = nextService - km;
    if (sisaKM <= 500) {
      items.push({ tipe: 'Servis Berkala', ref: c.PlatNomor, detail: 'Servis pada ' + nextService + ' KM', sisaKM: sisaKM, kmSekarang: km });
    }
  });

  items.sort(function (a, b) { return (a.sisaHari || a.sisaKM || 0) - (b.sisaHari || b.sisaKM || 0); });
  return { ok: true, data: items };
}

/* ------------------------- Setup awal (sekali) -------------------------- */
function setupSheets() {
  var defs = {
    Users: ['UserID','Nama','Username','Password','Role','Status'],
    Cars: ['PlatNomor','Merek','Tipe','Tahun','JenisBBM','Status','KMTerakhir','KMServisTerakhir','IntervalServisKM'],
    CarDocs: ['DocID','PlatNomor','JenisDokumen','NomorDokumen','TanggalKadaluarsa','Catatan'],
    Drivers: ['DriverID','Nama','NoSIM','MasaBerlakuSIM','NoHP','Status'],
    Trips: ['TripID','PlatNomor','DriverID','NamaDriver','Pemohon','Penumpang','Tujuan','Keperluan','TanggalRencana','Status','JamKeluar','KMKeluar','JamKembali','KMKembali','SelisihKM','ApprovedBy','Catatan'],
    KmLog: ['LogID','PlatNomor','TripID','KMKeluar','KMKembali','SelisihKM','Tanggal'],
    Maintenance: ['MaintID','PlatNomor','Tanggal','KMSaatServis','JenisServis','Biaya','Bengkel','Catatan'],
    Fuel: ['FuelID','PlatNomor','DriverID','Tanggal','JenisBBM','Liter','Biaya','LokasiSPBU','SelisihKM','KMPerLiter','FotoStruk','FotoIndikator','Status','ApprovedBy'],
    Schedule: ['SchedID','DriverID','NamaDriver','PlatNomor','TanggalMulai','TanggalSelesai','TripID','Keterangan']
  };
  Object.keys(defs).forEach(function (name) {
    var s = ss().getSheetByName(name) || ss().insertSheet(name);
    if (s.getLastRow() === 0) s.appendRow(defs[name]);
  });
  // seed admin
  var u = sheet('Users');
  if (u.getLastRow() <= 1) {
    u.appendRow(['U-ADMIN','Administrator','admin','admin123','Admin','Aktif']);
    u.appendRow(['U-GA','Staff GA','ga','ga123','GA','Aktif']);
    u.appendRow(['U-MGR','Manajer Operasional','manager','mgr123','Manager','Aktif']);
    u.appendRow(['U-DRV','Budi Driver','budi','drv123','Driver','Aktif']);
    u.appendRow(['U-KRY','Karyawan Satu','karyawan','kry123','Karyawan','Aktif']);
  }
}
