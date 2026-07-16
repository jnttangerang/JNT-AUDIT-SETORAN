import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  FileSpreadsheet, 
  RefreshCw, 
  Settings, 
  Database, 
  Copy, 
  Check, 
  Download, 
  Info, 
  Calendar, 
  DollarSign, 
  Wallet, 
  ShieldCheck, 
  HelpCircle, 
  User, 
  Package, 
  FileText,
  FileDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ResiHarian, DetailSerahTerima, AuditItem, AuditSummary, AppSettings } from './types';
import { getMockResiHarian, getMockDetailSerahTerima } from './mockData';

// Helper to convert standard YYYY-MM-DD to DD-MM-YYYY for spreadsheet matching
function convertDateToDDMMYYYY(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

export default function App() {
  // Application State
  const [selectedDate, setSelectedDate] = useState<string>('2026-07-15'); // default to local mock date
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('jnt_audit_settings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // use default
      }
    }
    return {
      spreadsheetId: '1A2B3C4D5E6F7G8H9I0J...',
      appsScriptUrl: '',
      useMockData: true
    };
  });

  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'audit' | 'admin' | 'yoyi' | 'docs'>('audit');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Data State
  const [resiHarian, setResiHarian] = useState<ResiHarian[]>([]);
  const [detailSerahTerima, setDetailSerahTerima] = useState<DetailSerahTerima[]>([]);
  const [auditItems, setAuditItems] = useState<AuditItem[]>([]);
  const [summary, setSummary] = useState<AuditSummary>({
    totalWajibInput: 0,
    totalTerinput: 0,
    totalBelumTerinput: 0,
    setoranTunaiLaporan: 0,
    kasOperasional: 0,
    amplopTotal: 0,
    packingTotal: 0,
    nonTunaiTotal: 0
  });

  // Filters for Audit Tab
  const [auditFilter, setAuditFilter] = useState<'all' | 'match' | 'missing'>('all');

  // Load settings to localStorage
  useEffect(() => {
    localStorage.setItem('jnt_audit_settings', JSON.stringify(settings));
  }, [settings]);

  // Perform audit calculations when data changes
  useEffect(() => {
    calculateAudit(resiHarian, detailSerahTerima);
  }, [resiHarian, detailSerahTerima]);

  // Load initial/mock data on date/mode change
  useEffect(() => {
    fetchData();
  }, [selectedDate, settings.useMockData]);

  const fetchData = async () => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    // If using mock data or no Apps Script URL is configured
    if (settings.useMockData || !settings.appsScriptUrl) {
      const harian = getMockResiHarian(convertDateToDDMMYYYY(selectedDate));
      const serahTerima = getMockDetailSerahTerima(convertDateToDDMMYYYY(selectedDate));
      
      setResiHarian(harian);
      setDetailSerahTerima(serahTerima);
      
      if (!settings.useMockData && !settings.appsScriptUrl) {
        setErrorMsg('Web App URL Apps Script belum diisi. Menggunakan Data Demo (Offline).');
      }
      setLoading(false);
      return;
    }

    // Attempt real fetch from Google Apps Script Web App (proxied through our backend to bypass CORS and iframe redirect blocks)
    try {
      const proxyUrl = `/api/proxy?url=${encodeURIComponent(settings.appsScriptUrl)}&date=${selectedDate}&spreadsheetId=${encodeURIComponent(settings.spreadsheetId)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      
      if (result.status === 'success') {
        setResiHarian(result.resiHarian || []);
        setDetailSerahTerima(result.detailSerahTerima || []);
        setSuccessMsg('Berhasil memuat data real-time dari Google Spreadsheet!');
      } else {
        throw new Error(result.message || 'Gagal memuat data dari Spreadsheet.');
      }
    } catch (e: any) {
      console.error(e);
      setErrorMsg(`Koneksi Gagal: ${e.message}. Menggunakan Data Demo untuk sementara.`);
      // Fallback to mock
      const harian = getMockResiHarian(convertDateToDDMMYYYY(selectedDate));
      const serahTerima = getMockDetailSerahTerima(convertDateToDDMMYYYY(selectedDate));
      setResiHarian(harian);
      setDetailSerahTerima(serahTerima);
    } finally {
      setLoading(false);
    }
  };

  const calculateAudit = (harian: ResiHarian[], yoyiList: DetailSerahTerima[]) => {
    // 1. Identify "Wajib Input" from YoYi: "Metode perhitungan" = "Biaya oleh pengirim"
    const wajibInputList = yoyiList.filter(item => 
      item.metodePerhitungan.trim().toLowerCase() === 'biaya oleh pengirim'
    );

    // Create a map of admin inputs for quick lookup by Resi ID (case-insensitive, whitespace trimmed)
    const adminMap = new Map<string, ResiHarian>();
    harian.forEach(item => {
      if (item.noResi) {
        adminMap.set(item.noResi.trim().toUpperCase(), item);
      }
    });

    // 2. Map all wajib YoYi resi to their match status
    const matchedResis: AuditItem[] = wajibInputList.map(item => {
      const resiId = item.noResi.trim().toUpperCase();
      const adminRec = adminMap.get(resiId);
      
      return {
        noResi: item.noResi,
        waktuPemesanan: item.waktuPemesanan,
        metodePerhitungan: item.metodePerhitungan,
        isWajibInput: true,
        status: adminRec ? 'MATCH' : 'MISSING_IN_ADMIN',
        adminRecord: adminRec
      };
    });

    // Find any unexpected admin inputs (resi in admin sheet that are not "Biaya oleh pengirim" in YoYi list or not in YoYi list at all)
    // For completeness of audit, we can trace these too
    const yoyiResiSet = new Set(yoyiList.map(y => y.noResi.trim().toUpperCase()));
    const unexpectedInputs: AuditItem[] = [];
    
    harian.forEach(adminRec => {
      if (!adminRec.noResi || adminRec.noResi === '-' || adminRec.noResi.toLowerCase().includes('resi blm')) return;
      const resiId = adminRec.noResi.trim().toUpperCase();
      
      // If it's not in the YoYi list, or in YoYi list but not "Biaya oleh pengirim" (e.g. receiver pay, DFOD)
      const matchingYoYi = yoyiList.find(y => y.noResi.trim().toUpperCase() === resiId);
      if (!matchingYoYi) {
        unexpectedInputs.push({
          noResi: adminRec.noResi,
          waktuPemesanan: '-',
          metodePerhitungan: 'Tidak ditemukan di YoYi',
          isWajibInput: false,
          status: 'UNEXPECTED_ADMIN_INPUT',
          adminRecord: adminRec
        });
      } else if (matchingYoYi.metodePerhitungan.trim().toLowerCase() !== 'biaya oleh pengirim') {
        unexpectedInputs.push({
          noResi: adminRec.noResi,
          waktuPemesanan: matchingYoYi.waktuPemesanan,
          metodePerhitungan: matchingYoYi.metodePerhitungan,
          isWajibInput: false,
          status: 'UNEXPECTED_ADMIN_INPUT',
          adminRecord: adminRec
        });
      }
    });

    const finalAuditItems = [...matchedResis, ...unexpectedInputs];
    setAuditItems(finalAuditItems);

    // 3. Summarize Financial Metrics
    let setoranTunaiLaporan = 0;
    let amplopTotal = 0;
    let packingTotal = 0;
    let nonTunaiTotal = 0;

    harian.forEach(item => {
      const isTunai = item.metodeBayarOngkir.trim().toLowerCase() === 'tunai';
      const isTF = item.metodeBayarOngkir.trim().toLowerCase() === 'tf' || item.metodeBayarOngkir.trim().toLowerCase() === 'transfer';
      const isQRIS = item.metodeBayarOngkir.trim().toLowerCase() === 'qris';

      if (isTunai) {
        setoranTunaiLaporan += (item.ongkirFinal || item.ongkirDasar || 0);
      } else if (isTF || isQRIS) {
        nonTunaiTotal += (item.ongkirFinal || item.ongkirDasar || 0);
      }

      amplopTotal += (item.amplop || 0);
      packingTotal += (item.packing || 0);
    });

    const totalWajibInput = wajibInputList.length;
    const totalTerinput = matchedResis.filter(r => r.status === 'MATCH').length;
    const totalBelumTerinput = totalWajibInput - totalTerinput;

    setSummary({
      totalWajibInput,
      totalTerinput,
      totalBelumTerinput,
      setoranTunaiLaporan,
      kasOperasional: amplopTotal + packingTotal,
      amplopTotal,
      packingTotal,
      nonTunaiTotal
    });
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleSaveSettings = () => {
    // Sanitize Apps Script URL
    let cleanedUrl = settings.appsScriptUrl.trim();
    if (cleanedUrl) {
      let deploymentId = "";

      // Check if it is a full Apps Script URL containing /macros/s/
      const macrosMatch = cleanedUrl.match(/macros\/s\/([^\/\?]+)/);
      if (macrosMatch) {
        deploymentId = macrosMatch[1].trim();
      } else {
        // Otherwise, assume they provided the raw Deployment ID or ID with /exec or /dev at the end
        deploymentId = cleanedUrl.replace(/\/+$/, "").replace(/\/exec$/, "").replace(/\/dev$/, "").trim();
        // If it still contains slashes, grab the last portion
        if (deploymentId.includes("/")) {
          const parts = deploymentId.split("/");
          deploymentId = parts[parts.length - 1];
        }
      }

      // Automatically correct common copy-paste errors (like missing 'AKf' or 'AKfy' prefix)
      if (deploymentId && !deploymentId.startsWith("AKfy")) {
        if (deploymentId.startsWith("ycb")) {
          // User missed the "AKf" prefix when copying
          deploymentId = "AKf" + deploymentId;
        } else if (deploymentId.startsWith("cb")) {
          // User missed the "AKfy" prefix when copying
          deploymentId = "AKfy" + deploymentId;
        } else if (deploymentId.length > 25) {
          // Prepend "AKfy" for other long IDs that don't have it
          deploymentId = "AKfy" + deploymentId;
        }
      }

      // Reconstruct the perfect Google Apps Script Web App URL
      if (deploymentId) {
        cleanedUrl = `https://script.google.com/macros/s/${deploymentId}/exec`;
      }
    }

    // Sanitize Spreadsheet ID
    let cleanedSpreadsheetId = settings.spreadsheetId.trim();
    if (cleanedSpreadsheetId === '1A2B3C4D5E6F7G8H9I0J...') {
      cleanedSpreadsheetId = '';
    }

    setSettings(prev => ({
      ...prev,
      appsScriptUrl: cleanedUrl,
      spreadsheetId: cleanedSpreadsheetId,
      useMockData: false // Auto switch to live data mode
    }));

    setShowSettings(false);
    setSuccessMsg('Konfigurasi disimpan! URL Google Apps Script otomatis disesuaikan ke format Web App (/exec) dan mode beralih ke Live Google Sheet.');
  };

  // Google Apps Script source code generator (Code.gs)
  const getAppsScriptCode = () => {
    return `/**
 * Google Apps Script Backend API untuk Audit Setoran J&T Express
 * Database: Google Spreadsheet "J&T Owner - Audit Ai"
 *
 * Pasang script ini di Extensions > Apps Script pada Spreadsheet Anda.
 * Deploy sebagai "Web App" dengan akses "Anyone".
 */

function doGet(e) {
  const action = e.parameter.action;
  const dateStr = e.parameter.date; // Format YYYY-MM-DD dari Web App

  if (!dateStr) {
    return createJsonResponse({ status: "error", message: "Parameter 'date' diperlukan." });
  }

  // Konversi format tanggal YYYY-MM-DD ke DD-MM-YYYY untuk lookup Spreadsheet
  const formattedDate = convertDateFormat(dateStr);

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    if (action === "getData") {
      const resiHarian = getResiHarianData(ss, formattedDate);
      const detailSerahTerima = getDetailSerahTerimaData(ss, formattedDate);
      
      return createJsonResponse({
        status: "success",
        date: dateStr,
        formattedDate: formattedDate,
        resiHarian: resiHarian,
        detailSerahTerima: detailSerahTerima
      });
    }
    
    return createJsonResponse({ status: "error", message: "Action tidak dikenal." });
  } catch (error) {
    return createJsonResponse({ status: "error", message: error.toString() });
  }
}

// Konversi tanggal dari YYYY-MM-DD ke DD-MM-YYYY
function convertDateFormat(dateStr) {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return parts[2] + '-' + parts[1] + '-' + parts[0];
}

// Mengambil Data dari Sheet "Resi Harian" untuk tanggal tertentu
function getResiHarianData(ss, targetDate) {
  const sheet = ss.getSheetByName("Resi Harian");
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  if (data.length < 5) return []; // Skip Header J&T Pasir Jaha
  
  const results = [];
  
  // Baris header aktual ada di baris 4 (Index 3)
  // Tanggal(A), Admin(B), No(C), Tipe Produk(D), No. Resi(E), Nama Barang(F), Ongkir Dasar(G), Ongkir Final(H), Metode Bayar Ongkir(I), Amplop(J), Packing(K), Lainnya(L), Total Biaya(M), Metode Bayar Lainnya(N), Keterangan(O)
  for (let i = 4; i < data.length; i++) {
    const row = data[i];
    let rowDate = "";
    
    if (row[0] instanceof Date) {
      rowDate = Utilities.formatDate(row[0], Session.getScriptTimeZone(), "dd-MM-yyyy");
    } else {
      rowDate = String(row[0]).trim();
    }
    
    if (rowDate === targetDate) {
      results.push({
        tanggal: rowDate,
        admin: String(row[1] || ""),
        no: Number(row[2] || 0),
        tipeProduk: String(row[3] || ""),
        noResi: String(row[4] || "").trim(),
        namaBarang: String(row[5] || ""),
        ongkirDasar: parseNumeric(row[6]),
        ongkirFinal: parseNumeric(row[7]),
        metodeBayarOngkir: String(row[8] || "").trim(),
        amplop: parseNumeric(row[9]),
        packing: parseNumeric(row[10]),
        lainnya: parseNumeric(row[11]),
        totalBiaya: parseNumeric(row[12]),
        metodeBayarLainnya: String(row[13] || ""),
        keterangan: String(row[14] || "")
      });
    }
  }
  return results;
}

// Mengambil Data dari Sheet "Detail Serah Terima" untuk tanggal tertentu
function getDetailSerahTerimaData(ss, targetDate) {
  const sheet = ss.getSheetByName("Detail Serah Terima");
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  
  const results = [];
  
  // Kolom: No. Resi(B / index 1), Waktu pemesanan(D / index 3), Metode perhitungan(E / index 4)
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    let rowDate = "";
    
    const waktuRaw = row[3]; // Kolom D (Waktu pemesanan)
    if (waktuRaw instanceof Date) {
      rowDate = Utilities.formatDate(waktuRaw, Session.getScriptTimeZone(), "dd-MM-yyyy");
    } else {
      // String format, coba extract dd-MM-yyyy di depan
      const match = String(waktuRaw).match(/\\d{2}-\\d{2}-\\d{4}/);
      rowDate = match ? match[0] : "";
    }
    
    if (rowDate === targetDate && row[1]) {
      results.push({
        noResi: String(row[1]).trim(),
        waktuPemesanan: waktuRaw instanceof Date ? Utilities.formatDate(waktuRaw, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss") : String(waktuRaw),
        metodePerhitungan: String(row[4] || "").trim()
      });
    }
  }
  return results;
}

function parseNumeric(val) {
  if (val === "" || val === undefined || val === null) return 0;
  if (typeof val === "number") return val;
  // Handle formatted rupiah e.g. "18.000" -> replace "." and convert
  let str = String(val).replace(/[^0-9,-]/g, "");
  str = str.replace(",", "."); // convert decimal comma to dot if any
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

function createJsonResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  // Bypass CORS
  output.addHeader("Access-Control-Allow-Origin", "*");
  return output;
}`;
  };

  // Google Apps Script independent html frontend (index.html) generator
  const getIndexHtmlCode = () => {
    return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Audit Setoran J&T Express</title>
  <!-- Tailwind CSS CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', sans-serif; }
  </style>
</head>
<body class="bg-slate-50 text-slate-800 min-h-screen">
  <div class="max-w-md mx-auto bg-white min-h-screen shadow-md flex flex-col pb-12">
    <!-- Header -->
    <header class="bg-red-600 text-white p-4 sticky top-0 z-10 shadow-sm">
      <div class="flex justify-between items-center">
        <div>
          <h1 class="font-bold text-lg tracking-tight">J&T Audit Setoran</h1>
          <p class="text-xs text-red-100">Database: Google Spreadsheet</p>
        </div>
        <div class="bg-red-700 text-xs px-2 py-1 rounded-full font-mono font-medium">v1.0</div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="p-4 flex-1">
      <!-- Date Picker -->
      <div class="mb-4 bg-slate-100 p-3 rounded-xl flex items-center justify-between">
        <label for="audit-date" class="text-xs font-semibold uppercase text-slate-500">Pilih Tanggal</label>
        <input type="date" id="audit-date" value="2026-07-15" class="bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-medium focus:ring-2 focus:ring-red-500 focus:outline-none">
      </div>

      <!-- Financial Metrics Deck -->
      <div class="grid grid-cols-2 gap-3 mb-5">
        <div class="bg-slate-50 p-3 rounded-xl border border-slate-100 shadow-sm">
          <p class="text-xs text-slate-500 font-medium">Setoran Tunai (Ongkir)</p>
          <p id="txt-setoran" class="text-lg font-bold text-slate-900">Rp 0</p>
        </div>
        <div class="bg-slate-50 p-3 rounded-xl border border-slate-100 shadow-sm">
          <p class="text-xs text-slate-500 font-medium">Kas Operasional</p>
          <p id="txt-operasional" class="text-lg font-bold text-slate-900">Rp 0</p>
          <p id="txt-operasional-detail" class="text-[10px] text-slate-400">Amplop + Packing</p>
        </div>
      </div>

      <!-- Audit Badge Alert -->
      <div id="audit-alert" class="p-3 rounded-xl mb-5 flex items-start gap-3 bg-emerald-50 text-emerald-800 border border-emerald-100">
        <div class="mt-0.5" id="alert-icon">✅</div>
        <div>
          <p id="alert-title" class="font-bold text-sm">Semua Resi Aman</p>
          <p id="alert-desc" class="text-xs text-slate-600">Admin sudah menginput seluruh resi wajib hari ini.</p>
        </div>
      </div>

      <!-- Core Audit Workspace -->
      <div class="mb-4 flex border-b border-slate-200">
        <button id="tab-btn-audit" class="flex-1 py-2 font-semibold text-sm border-b-2 border-red-600 text-red-600 focus:outline-none">Audit Resi</button>
        <button id="tab-btn-missing" class="flex-1 py-2 font-semibold text-sm border-b-2 border-transparent text-slate-500 focus:outline-none">Daftar Selisih</button>
      </div>

      <!-- Loader -->
      <div id="loader" class="hidden text-center py-12">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mx-auto mb-2"></div>
        <p class="text-xs text-slate-400">Mengunduh data spreadsheet...</p>
      </div>

      <!-- Tab Content: Audit -->
      <div id="tab-audit" class="space-y-3">
        <div class="flex justify-between items-center text-xs text-slate-400 font-semibold uppercase mb-1">
          <span>Resi Wajib Input YoYi</span>
          <span id="txt-match-ratio">0 / 0</span>
        </div>
        <div id="audit-list" class="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          <!-- Dinamis dari JS -->
        </div>
      </div>

      <!-- Tab Content: Missing -->
      <div id="tab-missing" class="hidden space-y-2">
        <div class="text-xs text-slate-400 font-semibold uppercase mb-1">Daftar Resi YoYi Belum Diinput Admin</div>
        <div id="missing-list" class="space-y-2">
          <!-- Dinamis dari JS -->
        </div>
      </div>
    </main>

    <!-- Footer / Credit -->
    <footer class="text-center text-[10px] text-slate-400 mt-auto py-4 border-t border-slate-100">
      J&T Express Audit Setoran App &bull; Powered by Apps Script API
    </footer>
  </div>

  <script>
    // MASUKKAN URL DEPLOYMENT WEB APP APPS SCRIPT ANDA DI SINI
    const APPS_SCRIPT_URL = "YOUR_APPS_SCRIPT_WEB_APP_URL";

    // Elements
    const dateInput = document.getElementById('audit-date');
    const txtSetoran = document.getElementById('txt-setoran');
    const txtOperasional = document.getElementById('txt-operasional');
    const txtOperasionalDetail = document.getElementById('txt-operasional-detail');
    const auditAlert = document.getElementById('audit-alert');
    const alertIcon = document.getElementById('alert-icon');
    const alertTitle = document.getElementById('alert-title');
    const alertDesc = document.getElementById('alert-desc');
    const auditList = document.getElementById('audit-list');
    const missingList = document.getElementById('missing-list');
    const txtMatchRatio = document.getElementById('txt-match-ratio');
    const loader = document.getElementById('loader');
    
    const tabAudit = document.getElementById('tab-audit');
    const tabMissing = document.getElementById('tab-missing');
    const btnTabAudit = document.getElementById('tab-btn-audit');
    const btnTabMissing = document.getElementById('tab-btn-missing');

    // Tab Switchers
    btnTabAudit.addEventListener('click', () => {
      btnTabAudit.className = "flex-1 py-2 font-semibold text-sm border-b-2 border-red-600 text-red-600 focus:outline-none";
      btnTabMissing.className = "flex-1 py-2 font-semibold text-sm border-b-2 border-transparent text-slate-500 focus:outline-none";
      tabAudit.classList.remove('hidden');
      tabMissing.classList.add('hidden');
    });

    btnTabMissing.addEventListener('click', () => {
      btnTabMissing.className = "flex-1 py-2 font-semibold text-sm border-b-2 border-red-600 text-red-600 focus:outline-none";
      btnTabAudit.className = "flex-1 py-2 font-semibold text-sm border-b-2 border-transparent text-slate-500 focus:outline-none";
      tabMissing.classList.remove('hidden');
      tabAudit.classList.add('hidden');
    });

    dateInput.addEventListener('change', fetchData);

    async function fetchData() {
      if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.includes("YOUR_APPS_SCRIPT")) {
        alert("Harap atur URL Apps Script (APPS_SCRIPT_URL) Anda di baris 112 file HTML ini.");
        return;
      }

      loader.classList.remove('hidden');
      tabAudit.classList.add('hidden');
      tabMissing.classList.add('hidden');

      const dateVal = dateInput.value;
      try {
        const response = await fetch(\`\${APPS_SCRIPT_URL}?action=getData&date=\${dateVal}\`);
        const res = await response.json();
        
        if (res.status === 'success') {
          processAudit(res.resiHarian, res.detailSerahTerima);
        } else {
          alert("Gagal: " + res.message);
        }
      } catch (e) {
        console.error(e);
        alert("Gagal koneksi ke server Apps Script: " + e.toString());
      } finally {
        loader.classList.add('hidden');
        if (btnTabAudit.classList.contains('border-red-600')) {
          tabAudit.classList.remove('hidden');
        } else {
          tabMissing.classList.remove('hidden');
        }
      }
    }

    function formatRupiah(num) {
      return "Rp " + Number(num).toLocaleString('id-ID');
    }

    function processAudit(harian, yoyi) {
      // Filter wajib input YoYi: Metode Perhitungan = "Biaya oleh pengirim"
      const wajibYoyi = yoyi.filter(y => y.metodePerhitungan.trim().toLowerCase() === 'biaya oleh pengirim');
      
      // Map admin inputs
      const adminMap = new Map();
      harian.forEach(item => {
        if (item.noResi) adminMap.set(item.noResi.trim().toUpperCase(), item);
      });

      // Audit matching
      const matches = [];
      const missing = [];
      
      wajibYoyi.forEach(y => {
        const resiId = y.noResi.trim().toUpperCase();
        const found = adminMap.get(resiId);
        if (found) {
          matches.push({ y, found, status: 'MATCH' });
        } else {
          missing.push(y);
        }
      });

      // Financial calculations
      let setoranTunai = 0;
      let amplop = 0;
      let packing = 0;

      harian.forEach(h => {
        if (h.metodeBayarOngkir.trim().toLowerCase() === 'tunai') {
          setoranTunai += (h.ongkirFinal || h.ongkirDasar || 0);
        }
        amplop += (h.amplop || 0);
        packing += (h.packing || 0);
      });

      // Update UI
      txtSetoran.textContent = formatRupiah(setoranTunai);
      txtOperasional.textContent = formatRupiah(amplop + packing);
      txtOperasionalDetail.textContent = \`Amplop: \${formatRupiah(amplop)} | Packing: \${formatRupiah(packing)}\`;
      txtMatchRatio.textContent = \`\${matches.length} / \${wajibYoyi.length}\`;

      // Update Alert Banner
      if (missing.length > 0) {
        auditAlert.className = "p-3 rounded-xl mb-5 flex items-start gap-3 bg-amber-50 text-amber-800 border border-amber-100";
        alertIcon.textContent = "⚠️";
        alertTitle.textContent = \`Ada \${missing.length} Resi Selisih!\`;
        alertDesc.textContent = "Owner wajib meminta pertanggungjawaban admin untuk input resi di YoYi.";
      } else {
        auditAlert.className = "p-3 rounded-xl mb-5 flex items-start gap-3 bg-emerald-50 text-emerald-800 border border-emerald-100";
        alertIcon.textContent = "✅";
        alertTitle.textContent = "Audit Setoran Bersih";
        alertDesc.textContent = "Semua resi wajib YoYi hari ini telah terinput di Resi Harian admin.";
      }

      // Render lists
      renderAuditLists(matches, missing);
    }

    function renderAuditLists(matches, missing) {
      auditList.innerHTML = '';
      missingList.innerHTML = '';

      if (matches.length === 0 && missing.length === 0) {
        auditList.innerHTML = '<p class="text-center text-xs text-slate-400 py-6">Tidak ada data transaksi hari ini.</p>';
        missingList.innerHTML = '<p class="text-center text-xs text-slate-400 py-6">Tidak ada data selisih hari ini.</p>';
        return;
      }

      // Populate Audit List (Matches + Missing warning in-line)
      missing.forEach(y => {
        const itemDiv = document.createElement('div');
        itemDiv.className = "bg-red-50 border border-red-100 p-3 rounded-xl text-xs flex justify-between items-center";
        itemDiv.innerHTML = \`
          <div>
            <p class="font-bold text-red-700 text-sm font-mono">\${y.noResi}</p>
            <p class="text-slate-400 text-[10px] mt-0.5">\${y.waktuPemesanan}</p>
          </div>
          <span class="bg-red-200 text-red-800 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase">Belum Diinput</span>
        \`;
        auditList.appendChild(itemDiv);

        // Also copy to missing list tab
        const clone = itemDiv.cloneNode(true);
        missingList.appendChild(clone);
      });

      matches.forEach(m => {
        const itemDiv = document.createElement('div');
        itemDiv.className = "bg-white border border-slate-200 p-3 rounded-xl text-xs flex justify-between items-center shadow-sm";
        const bayarColor = m.found.metodeBayarOngkir.toLowerCase() === 'tunai' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800';
        itemDiv.innerHTML = \`
          <div>
            <p class="font-bold text-slate-800 text-sm font-mono">\${m.found.noResi}</p>
            <p class="text-slate-400 text-[10px] mt-0.5">Admin: \${m.found.admin} | \${m.found.namaBarang || 'Tanpa Nama'}</p>
          </div>
          <div class="text-right">
            <p class="font-semibold text-slate-900">\${formatRupiah(m.found.ongkirFinal || m.found.ongkirDasar)}</p>
            <span class="\${bayarColor} px-2 py-0.5 rounded-full text-[9px] font-bold uppercase">\${m.found.metodeBayarOngkir}</span>
          </div>
        \`;
        auditList.appendChild(itemDiv);
      });

      if (missing.length === 0) {
        missingList.innerHTML = \`
          <div class="text-center py-12 text-slate-400">
            <div class="text-3xl mb-1">🎉</div>
            <p class="text-xs font-semibold text-slate-500">Semua Terinput Sempurna</p>
            <p class="text-[10px]">Tidak ditemukan selisih di YoYi hari ini.</p>
          </div>
        \`;
      }
    }
  </script>
</body>
</html>`;
  };

  const handleDownloadFile = (content: string, filename: string) => {
    const element = document.createElement("a");
    const file = new Blob([content], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = filename;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="bg-slate-50/50 text-slate-800 min-h-screen flex flex-col font-sans select-none antialiased selection:bg-red-500 selection:text-white">
      {/* Red Brand Bar / Modern Header */}
      <header className="bg-slate-900 text-white py-5 px-6 sticky top-0 z-20 border-b border-slate-800 shadow-sm backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-[#f01313] px-3 py-1 rounded-2xl text-white font-extrabold tracking-tighter text-xl flex items-center justify-center shadow-md shadow-red-600/25 font-display">
              J&T
            </div>
            <div>
              <h1 className="font-extrabold text-lg md:text-xl font-display tracking-tight flex items-center gap-2">
                Audit Setoran Harian
              </h1>
              <p className="text-xs text-slate-400 flex items-center gap-1.5 font-medium mt-0.5">
                <Database size={12} className="text-[#f01313]" />
                Google Spreadsheet Database &bull; YoYi Reconciler
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            {/* Quick Date picker */}
            <div className="flex items-center gap-2 bg-slate-800/80 p-1.5 rounded-2xl border border-slate-700/40 w-full md:w-auto focus-within:border-red-500/50 transition-colors">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1.5 hidden sm:inline">Tanggal</span>
              <input 
                type="date" 
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-white text-slate-900 rounded-xl py-1 px-3 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-red-500 border-0 shadow-inner"
              />
            </div>

            {/* Refresh Button */}
            <button 
              onClick={fetchData}
              disabled={loading}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-50 text-slate-100 p-2 md:px-3 md:py-2 rounded-2xl flex items-center gap-1.5 transition-all duration-200 shadow-sm text-xs font-bold font-display cursor-pointer hover:text-white"
              title="Refresh Data"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin text-red-500' : 'text-red-500'} />
              <span className="hidden sm:inline">Sync</span>
            </button>

            {/* Settings Trigger */}
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2 md:px-3 md:py-2 rounded-2xl transition-all duration-200 border text-xs font-bold font-display flex items-center gap-1.5 cursor-pointer ${showSettings ? 'bg-white text-slate-900 border-white shadow-md' : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-100 hover:text-white'}`}
              title="Spreadsheet & API Settings"
            >
              <Settings size={14} className={showSettings ? 'text-red-500' : 'text-slate-400'} />
              <span className="hidden sm:inline">Pengaturan</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto p-4 md:p-6 flex-1 w-full flex flex-col gap-6">
        {/* Status Alerts & Notifications */}
        <AnimatePresence mode="popLayout">
          {errorMsg && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0, y: -10 }}
              className="bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-3xl flex items-start gap-3.5 shadow-bento text-xs"
            >
              <AlertTriangle className="text-amber-600 shrink-0 mt-0.5 animate-bounce" size={18} />
              <div className="flex-1">
                <p className="font-bold uppercase text-[10px] tracking-wider text-amber-700 font-display mb-0.5">Mode Offline / Terbatas</p>
                <p className="font-semibold text-slate-600 leading-relaxed">{errorMsg}</p>
              </div>
              <button onClick={() => setErrorMsg(null)} className="text-amber-500 hover:text-amber-800 font-bold text-lg leading-none cursor-pointer p-1">×</button>
            </motion.div>
          )}

          {successMsg && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0, y: -10 }}
              className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-4 rounded-3xl flex items-start gap-3.5 shadow-bento text-xs"
            >
              <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={18} />
              <div className="flex-1">
                <p className="font-bold uppercase text-[10px] tracking-wider text-emerald-700 font-display mb-0.5">Koneksi Berhasil</p>
                <p className="font-semibold text-slate-600 leading-relaxed">{successMsg}</p>
              </div>
              <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-800 font-bold text-lg leading-none cursor-pointer p-1">×</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Settings Panel */}
        <AnimatePresence>
          {showSettings && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-white rounded-3xl border border-slate-200/80 shadow-bento overflow-hidden"
            >
              <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm md:text-base font-display">
                  <Settings size={18} className="text-red-600 animate-spin-slow" />
                  Konfigurasi Koneksi Google Spreadsheet & Web API
                </h3>
                <span className="text-[10px] bg-slate-200/70 text-slate-600 px-2.5 py-1 rounded-lg font-mono font-bold uppercase tracking-wider">Owner Controls</span>
              </div>
              <div className="p-5 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest font-display mb-2">Mode Sumber Data</label>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button 
                        type="button"
                        onClick={() => setSettings(prev => ({ ...prev, useMockData: true }))}
                        className={`py-2.5 px-3 rounded-2xl font-bold font-display text-xs border transition-all duration-300 cursor-pointer ${settings.useMockData ? 'bg-red-50 text-red-600 border-red-200 shadow-sm' : 'bg-white hover:bg-slate-50 text-slate-500 border-slate-200'}`}
                      >
                        📊 Data Demo (Offline)
                      </button>
                      <button 
                        type="button"
                        onClick={() => setSettings(prev => ({ ...prev, useMockData: false }))}
                        className={`py-2.5 px-3 rounded-2xl font-bold font-display text-xs border transition-all duration-300 cursor-pointer ${!settings.useMockData ? 'bg-emerald-50 text-emerald-600 border-emerald-200 shadow-sm' : 'bg-white hover:bg-slate-50 text-slate-500 border-slate-200'}`}
                      >
                        🌐 Google Sheet (Live)
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                      {settings.useMockData 
                        ? 'Menjalankan aplikasi dengan dataset transaksi J&T Pasir Jaha untuk mendemonstrasikan sistem audit secara langsung.'
                        : 'Menghubungkan langsung ke spreadsheet real-time milik outlet Anda via Google Apps Script Web App.'
                      }
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest font-display mb-1.5">ID Google Spreadsheet</label>
                    <input 
                      type="text" 
                      value={settings.spreadsheetId}
                      onChange={(e) => setSettings(prev => ({ ...prev, spreadsheetId: e.target.value }))}
                      disabled={settings.useMockData}
                      placeholder="Contoh: 1A2B3C4D5E..."
                      className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-2.5 text-xs font-mono focus:ring-2 focus:ring-red-500 focus:border-red-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400 transition-all shadow-inner"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Salin string panjang dari URL Google Spreadsheet Anda.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest font-display mb-1.5">Google Apps Script Web App URL</label>
                    <input 
                      type="text" 
                      value={settings.appsScriptUrl}
                      onChange={(e) => setSettings(prev => ({ ...prev, appsScriptUrl: e.target.value }))}
                      disabled={settings.useMockData}
                      placeholder="https://script.google.com/macros/s/.../exec"
                      className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-2.5 text-xs font-mono focus:ring-2 focus:ring-red-500 focus:border-red-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400 transition-all shadow-inner"
                    />
                    <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                      Masukkan URL hasil "Deploy as Web App" dari Apps Script Anda. Lihat tab <b>Setup Integrasi</b> di bawah untuk mendapatkan instruksi setup dan kodenya.
                    </p>
                  </div>

                  <div className="pt-2">
                    <button 
                      onClick={handleSaveSettings}
                      className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-4 rounded-2xl text-xs transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-slate-900/10 font-display"
                    >
                      <CheckCircle2 size={14} className="text-emerald-400" />
                      Simpan & Terapkan Konfigurasi
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Financial Cards Deck (Bento Grid Theme Layout) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6">
          {/* Bento Card 1: Setoran Tunai */}
          <div className="relative overflow-hidden bg-gradient-to-br from-emerald-50/70 via-emerald-50/10 to-white hover:shadow-bento-hover hover:-translate-y-1 transition-all duration-300 border border-slate-200/80 rounded-3xl p-6 flex flex-col justify-between group shadow-bento">
            <div className="absolute -right-8 -top-8 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:scale-125 transition-transform duration-500" />
            <div className="flex items-start justify-between gap-4">
              <div className="bg-emerald-100/70 text-emerald-700 p-3 rounded-2xl shrink-0 border border-emerald-200/30">
                <Wallet size={18} />
              </div>
              <div className="text-right flex flex-col items-end">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-display">Setoran Tunai</span>
                <span className="bg-emerald-100/80 text-emerald-800 font-bold text-[8px] px-2 py-0.5 rounded-full uppercase tracking-wider font-display mt-1">Wajib Setor</span>
              </div>
            </div>
            <div className="mt-5">
              <p className="text-2xl md:text-3xl font-extrabold text-slate-900 font-display tracking-tight leading-none">
                Rp {summary.setoranTunaiLaporan.toLocaleString('id-ID')}
              </p>
              <p className="text-[10px] text-slate-400 mt-2 font-medium">
                Dihitung dari "Ongkir Final" berbayar Tunai.
              </p>
            </div>
          </div>

          {/* Bento Card 2: Kas Operasional */}
          <div className="relative overflow-hidden bg-gradient-to-br from-amber-50/70 via-amber-50/10 to-white hover:shadow-bento-hover hover:-translate-y-1 transition-all duration-300 border border-slate-200/80 rounded-3xl p-6 flex flex-col justify-between group shadow-bento">
            <div className="absolute -right-8 -top-8 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl group-hover:scale-125 transition-transform duration-500" />
            <div className="flex items-start justify-between gap-4">
              <div className="bg-amber-100/70 text-amber-700 p-3 rounded-2xl shrink-0 border border-amber-200/30">
                <DollarSign size={18} />
              </div>
              <div className="text-right flex flex-col items-end">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-display">Kas Operasional</span>
                <span className="bg-amber-100/80 text-amber-800 font-bold text-[8px] px-2 py-0.5 rounded-full uppercase tracking-wider font-display mt-1">Non Setoran</span>
              </div>
            </div>
            <div className="mt-5">
              <p className="text-2xl md:text-3xl font-extrabold text-slate-900 font-display tracking-tight leading-none">
                Rp {summary.kasOperasional.toLocaleString('id-ID')}
              </p>
              <p className="text-[10px] text-slate-400 mt-2 font-medium truncate">
                Amplop: Rp {summary.amplopTotal.toLocaleString('id-ID')} | Pack: Rp {summary.packingTotal.toLocaleString('id-ID')}
              </p>
            </div>
          </div>

          {/* Bento Card 3: Audit Accuracy Ratio (Dynamic Mismatch warning) */}
          <div className={`relative overflow-hidden hover:shadow-bento-hover hover:-translate-y-1 transition-all duration-300 border rounded-3xl p-6 flex flex-col justify-between group shadow-bento ${summary.totalBelumTerinput > 0 ? 'bg-gradient-to-br from-rose-50/70 via-rose-50/10 to-white border-rose-200/80' : 'bg-gradient-to-br from-teal-50/70 via-teal-50/10 to-white border-slate-200/80'}`}>
            <div className={`absolute -right-8 -top-8 w-24 h-24 rounded-full blur-2xl group-hover:scale-125 transition-transform duration-500 ${summary.totalBelumTerinput > 0 ? 'bg-rose-500/5' : 'bg-teal-500/5'}`} />
            <div className="flex items-start justify-between gap-4">
              <div className={`p-3 rounded-2xl shrink-0 border ${summary.totalBelumTerinput > 0 ? 'bg-rose-100/70 text-rose-600 border-rose-200/30' : 'bg-teal-100/70 text-teal-700 border-teal-200/30'}`}>
                {summary.totalBelumTerinput > 0 ? <AlertTriangle size={18} className="animate-pulse" /> : <ShieldCheck size={18} />}
              </div>
              <div className="text-right flex flex-col items-end">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-display">Akurasi Audit</span>
                <span className={`font-bold text-[8px] px-2 py-0.5 rounded-full uppercase tracking-wider font-display mt-1 ${summary.totalBelumTerinput > 0 ? 'bg-rose-100 text-rose-800 animate-pulse border border-rose-200' : 'bg-teal-100 text-teal-800 border border-teal-200'}`}>
                  {summary.totalBelumTerinput > 0 ? 'Selisih' : 'Sempurna'}
                </span>
              </div>
            </div>
            <div className="mt-5">
              <p className="text-2xl md:text-3xl font-extrabold text-slate-900 font-display tracking-tight leading-none">
                {summary.totalTerinput} / {summary.totalWajibInput} Resi
              </p>
              <p className="text-[10px] text-slate-400 mt-2 font-medium">
                {summary.totalBelumTerinput > 0 
                  ? `${summary.totalBelumTerinput} Resi wajib belum terinput!` 
                  : 'Seluruh resi wajib telah terinput.'
                }
              </p>
            </div>
          </div>

          {/* Bento Card 4: Non-Tunai / Reference */}
          <div className="relative overflow-hidden bg-gradient-to-br from-blue-50/70 via-blue-50/10 to-white hover:shadow-bento-hover hover:-translate-y-1 transition-all duration-300 border border-slate-200/80 rounded-3xl p-6 flex flex-col justify-between group shadow-bento">
            <div className="absolute -right-8 -top-8 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl group-hover:scale-125 transition-transform duration-500" />
            <div className="flex items-start justify-between gap-4">
              <div className="bg-blue-100/70 text-blue-700 p-3 rounded-2xl shrink-0 border border-blue-200/30">
                <Wallet size={18} />
              </div>
              <div className="text-right flex flex-col items-end">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-display">Omset Non-Tunai</span>
                <span className="bg-blue-100/80 text-blue-800 font-bold text-[8px] px-2 py-0.5 rounded-full uppercase tracking-wider font-display mt-1">QRIS / TF</span>
              </div>
            </div>
            <div className="mt-5">
              <p className="text-2xl md:text-3xl font-extrabold text-slate-900 font-display tracking-tight leading-none">
                Rp {summary.nonTunaiTotal.toLocaleString('id-ID')}
              </p>
              <p className="text-[10px] text-slate-400 mt-2 font-medium">
                QRIS, Transfer Bank, atau Pembayaran via App.
              </p>
            </div>
          </div>
        </div>

        {/* Audit Status Banner (Large Bento alert cell) */}
        {summary.totalBelumTerinput > 0 ? (
          <div className="bg-gradient-to-r from-red-600 to-rose-600 text-white rounded-3xl p-5 md:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg shadow-red-600/10 border-0 relative overflow-hidden">
            <div className="absolute -right-12 -bottom-12 w-40 h-40 bg-white/5 rounded-full blur-xl" />
            <div className="flex items-start gap-3.5 relative z-10">
              <AlertTriangle className="text-white shrink-0 mt-0.5 animate-pulse" size={24} />
              <div>
                <h4 className="font-extrabold text-base font-display tracking-tight">Perhatian: Temuan Selisih Resi Transaksi!</h4>
                <p className="text-xs text-red-50 mt-1.5 leading-relaxed font-medium">
                  Sistem mendeteksi ada <b className="font-extrabold text-amber-300">{summary.totalBelumTerinput} Resi wajib input</b> dari sistem YoYi J&T yang <b className="font-extrabold text-amber-300">TIDAK</b> tercantum dalam laporan Resi Harian admin. Ini menunjukkan adanya risiko dana tidak tersetor atau kelalaian administratif.
                </p>
              </div>
            </div>
            <button 
              onClick={() => { setActiveTab('audit'); setAuditFilter('missing'); }}
              className="bg-white hover:bg-slate-50 text-red-600 font-bold font-display py-2.5 px-4 rounded-2xl text-xs transition duration-200 shadow-sm shrink-0 relative z-10 hover:scale-102 cursor-pointer active:scale-98"
            >
              Periksa Daftar Selisih &rarr;
            </button>
          </div>
        ) : (
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-3xl p-5 md:p-6 flex items-start gap-3.5 shadow-lg shadow-emerald-600/10 border-0 relative overflow-hidden">
            <div className="absolute -right-12 -bottom-12 w-40 h-40 bg-white/5 rounded-full blur-xl" />
            <div className="flex items-start gap-3.5 relative z-10">
              <CheckCircle2 className="text-white shrink-0 mt-0.5" size={24} />
              <div>
                <h4 className="font-extrabold text-base font-display tracking-tight">Laporan Setoran Bersih & Akurat</h4>
                <p className="text-xs text-emerald-50 mt-1.5 leading-relaxed font-medium">
                  Sempurna! Seluruh resi wajib input "PP_PM" (Biaya oleh Pengirim) dari YoYi J&T untuk tanggal <b className="font-extrabold text-white">{convertDateToDDMMYYYY(selectedDate)}</b> telah diinput sepenuhnya oleh admin di lembar Resi Harian. Angka estimasi setoran tunai aman untuk divalidasi.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab System Wrapper / Large Bento Container */}
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-bento overflow-hidden flex-1 flex flex-col min-h-[500px]">
          {/* Tabs header */}
          <div className="border-b border-slate-100 bg-slate-50/60 p-3 md:p-4 flex flex-wrap gap-2 justify-between items-center">
            <div className="flex flex-wrap gap-1.5">
              <button 
                onClick={() => setActiveTab('audit')}
                className={`py-2.5 px-4 rounded-2xl font-bold font-display text-xs transition duration-200 flex items-center gap-2 cursor-pointer ${activeTab === 'audit' ? 'bg-slate-900 text-white shadow-md shadow-slate-900/10' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}
              >
                🔍 Temuan Audit ({auditItems.length})
              </button>
              <button 
                onClick={() => setActiveTab('admin')}
                className={`py-2.5 px-4 rounded-2xl font-bold font-display text-xs transition duration-200 flex items-center gap-2 cursor-pointer ${activeTab === 'admin' ? 'bg-slate-900 text-white shadow-md shadow-slate-900/10' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}
              >
                📝 Resi Harian Admin ({resiHarian.length})
              </button>
              <button 
                onClick={() => setActiveTab('yoyi')}
                className={`py-2.5 px-4 rounded-2xl font-bold font-display text-xs transition duration-200 flex items-center gap-2 cursor-pointer ${activeTab === 'yoyi' ? 'bg-slate-900 text-white shadow-md shadow-slate-900/10' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}
              >
                📦 Detail YoYi ({detailSerahTerima.length})
              </button>
              <button 
                onClick={() => setActiveTab('docs')}
                className={`py-2.5 px-4 rounded-2xl font-bold font-display text-xs transition duration-200 flex items-center gap-2 cursor-pointer ${activeTab === 'docs' ? 'bg-slate-900 text-white shadow-md shadow-slate-900/10' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}
              >
                ⚙️ Setup Integrasi Sheets
              </button>
            </div>

            <div className="px-3 py-1.5 bg-white border border-slate-200/80 rounded-xl text-[10px] text-slate-500 font-bold font-mono shadow-sm">
              TANGGAL AUDIT: <span className="text-slate-900">{convertDateToDDMMYYYY(selectedDate)}</span>
            </div>
          </div>

          {/* Loader inside panel */}
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12">
              <RefreshCw className="text-[#f01313] animate-spin mb-3" size={32} />
              <p className="text-sm font-bold text-slate-700 font-display">Sinkronisasi Database...</p>
              <p className="text-xs text-slate-400 mt-1">Mengambil data audit harian J&T...</p>
            </div>
          ) : (
            <div className="p-4 md:p-6 flex-1 flex flex-col">
              {/* Tab 1: Audit */}
              {activeTab === 'audit' && (
                <div className="space-y-5 flex-1 flex flex-col">
                  {/* Filters bar */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50/70 p-3 rounded-2xl border border-slate-100">
                    <div className="flex flex-wrap gap-1.5">
                      <button 
                        onClick={() => setAuditFilter('all')}
                        className={`py-1.5 px-3.5 rounded-xl text-xs font-bold font-display border transition-all duration-200 cursor-pointer ${auditFilter === 'all' ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'bg-transparent text-slate-500 border-transparent hover:bg-slate-200/60'}`}
                      >
                        Semua ({auditItems.length})
                      </button>
                      <button 
                        onClick={() => setAuditFilter('match')}
                        className={`py-1.5 px-3.5 rounded-xl text-xs font-bold font-display border transition-all duration-200 cursor-pointer ${auditFilter === 'match' ? 'bg-emerald-50 text-emerald-800 border-emerald-200 shadow-sm' : 'bg-transparent text-slate-500 border-transparent hover:bg-slate-200/60'}`}
                      >
                        Cocok ({auditItems.filter(i => i.status === 'MATCH').length})
                      </button>
                      <button 
                        onClick={() => setAuditFilter('missing')}
                        className={`py-1.5 px-3.5 rounded-xl text-xs font-bold font-display border transition-all duration-200 cursor-pointer ${auditFilter === 'missing' ? 'bg-rose-50 text-rose-800 border-rose-200 shadow-sm' : 'bg-transparent text-slate-500 border-transparent hover:bg-slate-200/60'}`}
                      >
                        Belum Diinput ({auditItems.filter(i => i.status === 'MISSING_IN_ADMIN').length})
                      </button>
                    </div>

                    <div className="text-xs text-slate-400 font-medium">
                      Menampilkan audit transaksi <span className="font-bold text-slate-600 bg-slate-200/60 px-2 py-0.5 rounded-md font-mono">PP_PM (Wajib Input)</span>
                    </div>
                  </div>

                  {/* List of Audit Items */}
                  <div className="flex-1 overflow-x-auto">
                    {auditItems.length === 0 ? (
                      <div className="text-center py-16 text-slate-400 max-w-md mx-auto">
                        <div className="bg-slate-50 w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-slate-100">
                          <Package size={24} className="text-slate-400" />
                        </div>
                        <p className="text-xs font-bold text-slate-700 font-display">Tidak Ada Data Audit</p>
                        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                          Tidak ditemukan rekaman data pada tanggal yang dipilih. Pilih demo tanggal <span className="font-bold text-slate-600 font-mono">02-05-2026</span> atau <span className="font-bold text-slate-600 font-mono">15-07-2026</span> untuk melihat demo.
                        </p>
                      </div>
                    ) : (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200/80 text-slate-400 font-bold uppercase text-[10px] tracking-wider font-display">
                            <th className="py-3 px-3">No. Resi</th>
                            <th className="py-3 px-3">Status Audit</th>
                            <th className="py-3 px-3">Waktu YoYi</th>
                            <th className="py-3 px-3">Info / Keterangan</th>
                            <th className="py-3 px-3 text-right">Ongkir (Admin)</th>
                            <th className="py-3 px-3 text-right">Bayar</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {auditItems
                            .filter(item => {
                              if (auditFilter === 'match') return item.status === 'MATCH';
                              if (auditFilter === 'missing') return item.status === 'MISSING_IN_ADMIN';
                              return true;
                            })
                            .map((item, index) => {
                              const isMissing = item.status === 'MISSING_IN_ADMIN';
                              const isUnexpected = item.status === 'UNEXPECTED_ADMIN_INPUT';
                              const isMatch = item.status === 'MATCH';

                              let statusBadge = (
                                <span className="bg-emerald-100/80 text-emerald-800 font-bold px-2.5 py-1 rounded-lg text-[9px] uppercase font-display border border-emerald-200/30">
                                  Cocok
                                </span>
                              );
                              if (isMissing) {
                                statusBadge = (
                                  <span className="bg-rose-100/80 text-rose-800 font-bold px-2.5 py-1 rounded-lg text-[9px] uppercase font-display animate-pulse border border-rose-200/30">
                                    Belum Diinput Admin
                                  </span>
                                );
                              } else if (isUnexpected) {
                                statusBadge = (
                                  <span className="bg-purple-100/80 text-purple-800 font-bold px-2.5 py-1 rounded-lg text-[9px] uppercase font-display border border-purple-200/30">
                                    Bukan Wajib (DFOD/App)
                                  </span>
                                );
                              }

                              return (
                                <tr key={index} className={`hover:bg-slate-50/50 transition-colors ${isMissing ? 'bg-rose-50/20' : ''}`}>
                                  <td className="py-3.5 px-3 font-mono font-bold text-slate-800 text-sm tracking-tight">{item.noResi}</td>
                                  <td className="py-3.5 px-3">{statusBadge}</td>
                                  <td className="py-3.5 px-3 text-slate-400 font-mono text-[11px]">{item.waktuPemesanan}</td>
                                  <td className="py-3.5 px-3 text-slate-600 text-[11px]">
                                    {isMissing && <span className="text-rose-600 font-bold">Harus diselidiki! Tidak tercatat di admin.</span>}
                                    {isMatch && item.adminRecord && (
                                      <span>Oleh: <b className="text-slate-800 font-bold">{item.adminRecord.admin || 'Tanpa Nama'}</b> &bull; Barang: {item.adminRecord.namaBarang || '-'}</span>
                                    )}
                                    {isUnexpected && <span className="text-slate-400">Terinput admin tetapi bukan tipe PP_PM di YoYi.</span>}
                                  </td>
                                  <td className="py-3.5 px-3 text-right font-bold font-mono text-slate-900 text-sm">
                                    {isMatch && item.adminRecord 
                                      ? `Rp ${(item.adminRecord.ongkirFinal || item.adminRecord.ongkirDasar || 0).toLocaleString('id-ID')}`
                                      : '-'
                                    }
                                  </td>
                                  <td className="py-3.5 px-3 text-right">
                                    {isMatch && item.adminRecord ? (
                                      <span className={`font-bold font-display uppercase text-[9px] px-2 py-0.5 rounded ${item.adminRecord.metodeBayarOngkir.toLowerCase() === 'tunai' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200/35' : 'bg-blue-100 text-blue-800 border border-blue-200/35'}`}>
                                        {item.adminRecord.metodeBayarOngkir}
                                      </span>
                                    ) : '-'}
                                  </td>
                                </tr>
                              );
                            })
                          }
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 2: Admin Records */}
              {activeTab === 'admin' && (
                <div className="space-y-4 flex-1 flex flex-col">
                  <div className="flex justify-between items-center bg-slate-50/70 p-3.5 rounded-2xl border border-slate-100">
                    <span className="text-xs font-semibold text-slate-600">Daftar lembar kerja "Resi Harian" yang diinput admin</span>
                    <span className="text-[10px] bg-white border border-slate-200 text-slate-400 font-mono font-bold px-2 py-0.5 rounded-lg">LIVE DATE: {convertDateToDDMMYYYY(selectedDate)}</span>
                  </div>

                  <div className="flex-1 overflow-x-auto">
                    {resiHarian.length === 0 ? (
                      <div className="text-center py-16 text-slate-400 max-w-sm mx-auto">
                        <div className="bg-slate-50 w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-slate-100">
                          <FileText size={24} className="text-slate-400" />
                        </div>
                        <p className="text-xs font-bold text-slate-700 font-display">Tidak Ada Data Admin</p>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Admin belum menginput data apapun di sheet Resi Harian untuk tanggal ini.
                        </p>
                      </div>
                    ) : (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200/80 text-slate-400 font-bold uppercase text-[10px] tracking-wider font-display">
                            <th className="py-3 px-3">No.</th>
                            <th className="py-3 px-3">Admin</th>
                            <th className="py-3 px-3">No. Resi</th>
                            <th className="py-3 px-3">Nama Barang</th>
                            <th className="py-3 px-3 text-right">Ongkir Dasar</th>
                            <th className="py-3 px-3 text-right">Ongkir Final</th>
                            <th className="py-3 px-3 text-right">Bayar</th>
                            <th className="py-3 px-3 text-right">Amplop</th>
                            <th className="py-3 px-3 text-right">Packing</th>
                            <th className="py-3 px-3 font-display">Keterangan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {resiHarian.map((item, index) => (
                            <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                              <td className="py-3.5 px-3 text-slate-400 font-mono">{item.no}</td>
                              <td className="py-3.5 px-3 font-bold text-slate-800 font-display text-[13px]">{item.admin || '-'}</td>
                              <td className="py-3.5 px-3 font-mono font-bold text-slate-900 tracking-tight text-sm">{item.noResi}</td>
                              <td className="py-3.5 px-3 text-slate-600 truncate max-w-[150px] font-medium">{item.namaBarang || '-'}</td>
                              <td className="py-3.5 px-3 text-right font-mono text-slate-500">Rp {item.ongkirDasar.toLocaleString('id-ID')}</td>
                              <td className="py-3.5 px-3 text-right font-mono font-bold text-slate-900 text-sm">Rp {item.ongkirFinal.toLocaleString('id-ID')}</td>
                              <td className="py-3.5 px-3 text-right">
                                <span className={`font-bold font-display uppercase text-[9px] px-2 py-0.5 rounded ${item.metodeBayarOngkir.toLowerCase() === 'tunai' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
                                  {item.metodeBayarOngkir || '-'}
                                </span>
                              </td>
                              <td className="py-3.5 px-3 text-right font-mono text-slate-600">
                                {item.amplop > 0 ? `Rp ${item.amplop.toLocaleString('id-ID')}` : '-'}
                              </td>
                              <td className="py-3.5 px-3 text-right font-mono text-slate-600">
                                {item.packing > 0 ? `Rp ${item.packing.toLocaleString('id-ID')}` : '-'}
                              </td>
                              <td className="py-3.5 px-3 text-slate-400 max-w-xs truncate text-[11px] font-medium">{item.keterangan || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 3: YoYi Records */}
              {activeTab === 'yoyi' && (
                <div className="space-y-4 flex-1 flex flex-col">
                  <div className="flex justify-between items-center bg-slate-50/70 p-3.5 rounded-2xl border border-slate-100">
                    <span className="text-xs font-semibold text-slate-600">Data Transaksi YoYi (Serah Terima Paket)</span>
                    <span className="text-[10px] bg-white border border-slate-200 text-slate-400 font-mono font-bold px-2 py-0.5 rounded-lg">TOTAL REKREASI YOYI: {detailSerahTerima.length} BARIS</span>
                  </div>

                  <div className="flex-1 overflow-x-auto">
                    {detailSerahTerima.length === 0 ? (
                      <div className="text-center py-16 text-slate-400 max-w-sm mx-auto">
                        <div className="bg-slate-50 w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-slate-100">
                          <Package size={24} className="text-slate-400" />
                        </div>
                        <p className="text-xs font-bold text-slate-700 font-display">Tidak Ada Data YoYi</p>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Tidak ada data pemesanan diimpor dari sistem YoYi untuk tanggal ini.
                        </p>
                      </div>
                    ) : (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200/80 text-slate-400 font-bold uppercase text-[10px] tracking-wider font-display">
                            <th className="py-3 px-3">No. Resi</th>
                            <th className="py-3 px-3">Waktu Pemesanan YoYi</th>
                            <th className="py-3 px-3">Metode Perhitungan (Sistem YoYi)</th>
                            <th className="py-3 px-3">Status Kewajiban Input</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {detailSerahTerima.map((item, index) => {
                            const isWajib = item.metodePerhitungan.trim().toLowerCase() === 'biaya oleh pengirim';
                            return (
                              <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                                <td className="py-3.5 px-3 font-mono font-bold text-slate-800 tracking-tight text-sm">{item.noResi}</td>
                                <td className="py-3.5 px-3 text-slate-500 font-mono text-[11px]">{item.waktuPemesanan}</td>
                                <td className="py-3.5 px-3 font-bold text-slate-700 font-display">{item.metodePerhitungan}</td>
                                <td className="py-3.5 px-3">
                                  {isWajib ? (
                                    <span className="bg-red-100/90 text-red-800 font-bold px-2.5 py-1 rounded-lg text-[9px] uppercase font-display border border-red-200/30">
                                      WAJIB INPUT (PP_PM)
                                    </span>
                                  ) : (
                                    <span className="bg-slate-100 text-slate-400 font-bold px-2.5 py-1 rounded-lg text-[9px] uppercase font-display">
                                      BUKAN WAJIB (DFOD/Collect)
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 4: Developer setup instructions */}
              {activeTab === 'docs' && (
                <div className="space-y-6 flex-1 text-slate-700 leading-relaxed text-xs max-w-4xl">
                  <div>
                    <h3 className="font-extrabold text-sm md:text-base text-slate-900 flex items-center gap-2 font-display">
                      <FileSpreadsheet className="text-[#f01313]" size={18} />
                      Panduan Integrasi Google Spreadsheet & Apps Script
                    </h3>
                    <p className="text-slate-400 mt-1 font-medium">
                      Ikuti 2 rintangan mudah di bawah untuk menghubungkan aplikasi web ini dengan database Google Spreadsheet real-time Anda:
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="bg-slate-50/50 p-5 rounded-3xl border border-slate-200/80">
                      <h4 className="font-bold font-display text-slate-900 flex items-center gap-1.5 mb-3 text-sm">
                        <span className="bg-slate-900 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono">1</span>
                        Struktur Google Spreadsheet
                      </h4>
                      <p className="text-slate-600 mb-3 font-medium">
                        Buat Google Spreadsheet baru dengan nama bebas (misalnya: <b className="text-slate-900">J&T Owner - Audit Ai</b>), lalu buat dua lembar kerja (Sheet) berikut dengan ejaan nama yang sama persis:
                      </p>
                      <ul className="list-disc list-inside space-y-2 text-slate-500 pl-1 font-medium">
                        <li>Sheet 1: <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded font-mono">Resi Harian</span> (Diisi manual oleh admin)</li>
                        <li>Sheet 2: <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded font-mono">Detail Serah Terima</span> (Diimpor dari YoYi)</li>
                      </ul>
                      <p className="text-slate-600 mt-3.5 leading-relaxed font-medium">
                        Pastikan kolom "No. Resi" berada di kolom <b className="text-slate-900">E (Kolom 5)</b> pada "Resi Harian" dan kolom <b className="text-slate-900">B (Kolom 2)</b> pada "Detail Serah Terima".
                      </p>
                    </div>

                    <div className="bg-slate-50/50 p-5 rounded-3xl border border-slate-200/80">
                      <h4 className="font-bold font-display text-slate-900 flex items-center gap-1.5 mb-3 text-sm">
                        <span className="bg-slate-900 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono">2</span>
                        Konfigurasi Apps Script
                      </h4>
                      <ol className="list-decimal list-inside space-y-2 text-slate-600 pl-1 font-medium">
                        <li>Buka menu <b className="text-slate-800">Extensions &gt; Apps Script</b> di Spreadsheet Anda.</li>
                        <li>Hapus seluruh kode default di file, lalu tempelkan kode <b className="text-slate-800">Code.gs</b> di bawah.</li>
                        <li>Klik ikon simpan 💾.</li>
                        <li>Klik tombol <b className="text-slate-800">Deploy &gt; New Deployment</b>.</li>
                        <li>Pilih jenis deployment: <b className="text-slate-800">Web App</b>.</li>
                        <li>Ubah "Who has access" menjadi <b className="text-slate-900 underline">Anyone</b>.</li>
                        <li>Klik <b className="text-slate-800 font-bold">Deploy</b> dan salin URL Web App yang disediakan untuk dipasang di menu Pengaturan atas.</li>
                      </ol>
                    </div>
                  </div>

                  {/* Copy Code Section */}
                  <div className="space-y-4">
                    {/* Code.gs copy */}
                    <div className="border border-slate-200/80 rounded-2xl overflow-hidden bg-white shadow-sm">
                      <div className="bg-slate-900 text-slate-200 px-4 py-3 flex justify-between items-center text-xs font-mono">
                        <span className="font-bold text-amber-400 font-display">Code.gs (Backend Google Apps Script)</span>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => copyToClipboard(getAppsScriptCode(), 'code_gs')}
                            className="bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-700 text-slate-200 font-bold py-1 px-3 rounded-xl transition flex items-center gap-1.5 cursor-pointer text-[11px]"
                          >
                            {copiedText === 'code_gs' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                            {copiedText === 'code_gs' ? 'Tersalin' : 'Salin Kode'}
                          </button>
                        </div>
                      </div>
                      <pre className="p-4 bg-slate-950 text-emerald-400 text-[10px] font-mono overflow-x-auto max-h-[250px] leading-relaxed">
                        {getAppsScriptCode()}
                      </pre>
                    </div>

                    {/* index.html copy */}
                    <div className="border border-slate-200/80 rounded-2xl overflow-hidden bg-white shadow-sm">
                      <div className="bg-slate-900 text-slate-200 px-4 py-3 flex justify-between items-center text-xs font-mono">
                        <span className="font-bold text-blue-400 font-display">index.html &amp; Fetch (Frontend Standalone Vercel)</span>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => copyToClipboard(getIndexHtmlCode(), 'index_html')}
                            className="bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-700 text-slate-200 font-bold py-1 px-3 rounded-xl transition flex items-center gap-1.5 cursor-pointer text-[11px]"
                          >
                            {copiedText === 'index_html' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                            {copiedText === 'index_html' ? 'Tersalin' : 'Salin Kode'}
                          </button>
                          <button 
                            onClick={() => handleDownloadFile(getIndexHtmlCode(), 'index.html')}
                            className="bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-700 text-slate-200 font-bold py-1 px-3 rounded-xl transition flex items-center gap-1.5 cursor-pointer text-[11px]"
                            title="Unduh File index.html"
                          >
                            <FileDown size={12} />
                            Unduh
                          </button>
                        </div>
                      </div>
                      <pre className="p-4 bg-slate-950 text-blue-300 text-[10px] font-mono overflow-x-auto max-h-[250px] leading-relaxed">
                        {getIndexHtmlCode()}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-6 px-6 mt-12 border-t border-slate-800 text-xs">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="bg-[#f01313] text-white px-3 py-1 rounded-xl font-display font-extrabold tracking-tight">J&T Express</span>
            <span className="text-slate-500">&bull; Google Workspace Ecosystem Solution</span>
          </div>
          <div className="text-slate-500 text-[10px] leading-relaxed text-center md:text-right font-medium">
            Sistem Audit ini dirancang hemat biaya operasional tanpa server VPS, PHP, Laravel, atau SQL RDBMS.<br />
            Seluruh audit dijalankan secara real-time langsung di sisi klien dan Google Apps Script Sandbox.
          </div>
        </div>
      </footer>
    </div>
  );
}
