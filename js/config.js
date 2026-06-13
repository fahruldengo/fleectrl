/* ============================================================
   FLEETCTRL — Konfigurasi global
   GANTI API_URL dengan URL deployment Apps Script (.../exec)
   ============================================================ */
const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbzfcgSQF84-z160xpIw-V8gnGixIJ-12gRdpUR1usIEh1tkjdAeFmNwxwh2XiqWH6bP/exec',
  APP_NAME: 'FleetCtrl',
};

/* Definisi menu + role yang boleh mengakses */
const MENUS = [
  { group: 'Operasional', items: [
    { id: 'dashboard',  label: 'Dashboard',        ic: '▤', href: 'dashboard.html',  roles: ['Admin','Manager','GA'] },
    { id: 'trips',      label: 'Mobil Keluar',     ic: '⛢', href: 'trips.html',      roles: ['Admin','Manager','GA','Driver','Karyawan'] },
    { id: 'fuel',       label: 'Bensin & Klaim',   ic: '⛽', href: 'fuel.html',       roles: ['Admin','Manager','GA','Driver'] },
    { id: 'inspection', label: 'Kontrol Kendaraan',ic: '☑', href: 'inspection.html', roles: ['Admin','Manager','GA','Driver'] },
    { id: 'schedule',   label: 'Jadwal Driver',    ic: '◷', href: 'schedule.html',   roles: ['Admin','Manager','GA','Driver'] },
  ]},
  { group: 'Laporan', items: [
    { id: 'history',    label: 'Riwayat Penggunaan',ic: '▦', href: 'history.html',    roles: ['Admin','Manager','GA'] },
  ]},
  { group: 'Master Data', items: [
    { id: 'cars',       label: 'Data Mobil',       ic: '⛟', href: 'cars.html',       roles: ['Admin','GA'] },
    { id: 'drivers',    label: 'Data Driver',      ic: '☺', href: 'drivers.html',    roles: ['Admin','GA'] },
    { id: 'maintenance',label: 'Servis & KM',      ic: '⚙', href: 'maintenance.html',roles: ['Admin','GA','Driver'] },
    { id: 'users',      label: 'Pengguna',         ic: '⚿', href: 'users.html',      roles: ['Admin'] },
  ]},
];

const ROLE_LABEL = {
  Admin:'Admin', Manager:'Manajer Ops', GA:'General Affairs', Driver:'Driver', Karyawan:'Karyawan'
};
