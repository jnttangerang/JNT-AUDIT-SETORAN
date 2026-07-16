/**
 * Google Apps Script Backend API untuk Audit Setoran J&T Express
 * Database: Google Spreadsheet "J&T Owner - Audit Ai"
 *
 * Pasang script ini di Extensions > Apps Script pada Spreadsheet Anda.
 * Deploy sebagai "Web App" dengan akses "Anyone".
 */

function doGet(e) {
  // Jika dijalankan langsung dari tombol "Run" di editor Apps Script, parameter e akan undefined
  if (!e || !e.parameter) {
    return createJsonResponse({ 
      status: "success", 
      message: "Koneksi Otorisasi Berhasil! Anda berhasil menjalankan fungsi doGet dari dalam Editor Apps Script secara manual. Izin akses file Spreadsheet Anda telah disetujui. Untuk melihat integrasi real-time penuh, silakan salin URL Web App (/exec) dari tombol Deploy Anda dan masukkan ke Pengaturan Aplikasi Web." 
    });
  }

  // Ambil parameter
  const action = e.parameter.action;
  const dateStr = e.parameter.date; // Format YYYY-MM-DD dari Web App
  const spreadsheetId = e.parameter.spreadsheetId; // ID Spreadsheet opsional

  if (!dateStr) {
    return createJsonResponse({ 
      status: "error", 
      message: "Parameter 'date' diperlukan." 
    });
  }

  // Konversi format tanggal YYYY-MM-DD ke DD-MM-YYYY untuk lookup Spreadsheet
  const formattedDate = convertDateFormat(dateStr);

  try {
    let ss = null;

    // 1. Coba buka dengan Spreadsheet ID jika disediakan
    if (spreadsheetId && spreadsheetId.trim() !== "") {
      try {
        ss = SpreadsheetApp.openById(spreadsheetId.trim());
      } catch (err) {
        return createJsonResponse({
          status: "error",
          message: "Gagal membuka Spreadsheet dengan ID yang Anda masukkan. Pastikan ID benar dan Apps Script ini dijalankan dengan izin akun Anda. Detail error: " + err.toString()
        });
      }
    }

    // 2. Jika tidak ada ID atau gagal, coba getActiveSpreadsheet (khusus jika container-bound script)
    if (!ss) {
      try {
        ss = SpreadsheetApp.getActiveSpreadsheet();
      } catch (err) {
        // Abaikan error di sini, akan divalidasi di bawah
      }
    }

    // 3. Validasi apakah Spreadsheet berhasil diakses
    if (!ss) {
      return createJsonResponse({ 
        status: "error", 
        message: "Spreadsheet tidak terdeteksi. Solusi: Masukkan ID Google Spreadsheet Anda di panel Pengaturan aplikasi, atau pastikan script ini terpasang di menu 'Extensions > Apps Script' pada spreadsheet bersangkutan." 
      });
    }

    if (action === "getData") {
      const resiHarian = getResiHarianData(ss, formattedDate);
      const detailSerahTerima = getDetailSerahTerimaData(ss, formattedDate);
      
      return createJsonResponse({
        status: "success",
        date: dateStr,
        formattedDate: formattedDate,
        spreadsheetName: ss.getName(),
        resiHarian: resiHarian,
        detailSerahTerima: detailSerahTerima
      });
    }
    
    return createJsonResponse({ 
      status: "error", 
      message: "Action '" + action + "' tidak dikenal." 
    });
  } catch (error) {
    return createJsonResponse({ 
      status: "error", 
      message: "Terjadi kesalahan internal pada Apps Script: " + error.toString() 
    });
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
  try {
    const sheet = ss.getSheetByName("Resi Harian");
    if (!sheet) {
      return [];
    }
    
    const data = sheet.getDataRange().getValues();
    if (data.length < 5) return []; // Skip Header J&T Pasir Jaha
    
    const results = [];
    
    for (let i = 4; i < data.length; i++) {
      const row = data[i];
      if (!row[0]) continue; // Lewati baris kosong
      
      let rowDate = "";
      if (row[0] instanceof Date) {
        rowDate = Utilities.formatDate(row[0], Session.getScriptTimeZone() || "GMT+7", "dd-MM-yyyy");
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
  } catch (err) {
    Logger.log("Error reading Resi Harian: " + err.toString());
    return [];
  }
}

// Mengambil Data dari Sheet "Detail Serah Terima" untuk tanggal tertentu
function getDetailSerahTerimaData(ss, targetDate) {
  try {
    const sheet = ss.getSheetByName("Detail Serah Terima");
    if (!sheet) {
      return [];
    }
    
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return [];
    
    const results = [];
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[1]) continue; // Lewati baris kosong jika resi tidak ada
      
      let rowDate = "";
      const waktuRaw = row[3]; // Kolom D (Waktu pemesanan)
      
      if (waktuRaw instanceof Date) {
        rowDate = Utilities.formatDate(waktuRaw, Session.getScriptTimeZone() || "GMT+7", "dd-MM-yyyy");
      } else {
        const match = String(waktuRaw).match(/\d{2}-\d{2}-\d{4}/);
        rowDate = match ? match[0] : "";
      }
      
      if (rowDate === targetDate && row[1]) {
        results.push({
          noResi: String(row[1]).trim(),
          waktuPemesanan: waktuRaw instanceof Date ? Utilities.formatDate(waktuRaw, Session.getScriptTimeZone() || "GMT+7", "yyyy-MM-dd HH:mm:ss") : String(waktuRaw),
          metodePerhitungan: String(row[4] || "").trim()
        });
      }
    }
    return results;
  } catch (err) {
    Logger.log("Error reading Detail Serah Terima: " + err.toString());
    return [];
  }
}

function parseNumeric(val) {
  if (val === "" || val === undefined || val === null) return 0;
  if (typeof val === "number") return val;
  let str = String(val).replace(/[^0-9,-]/g, "");
  str = str.replace(",", ".");
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

function createJsonResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}