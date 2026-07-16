/**
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
      const match = String(waktuRaw).match(/\d{2}-\d{2}-\d{4}/);
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
  // Ubah format Rupiah lokal "18.000" menjadi angka murni
  let str = String(val).replace(/[^0-9,-]/g, "");
  str = str.replace(",", ".");
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

function createJsonResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  output.addHeader("Access-Control-Allow-Origin", "*");
  return output;
}