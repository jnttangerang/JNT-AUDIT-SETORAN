import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route to proxy the Google Apps Script Web App
  app.get("/api/proxy", async (req, res) => {
    const { url, date, spreadsheetId } = req.query;

    if (!url || typeof url !== "string") {
      return res.status(400).json({ status: "error", message: "Parameter 'url' diperlukan." });
    }

    if (!date || typeof date !== "string") {
      return res.status(400).json({ status: "error", message: "Parameter 'date' diperlukan." });
    }

    try {
      // Robust Google Apps Script Web App URL normalization and ID correction
      let targetBaseUrl = url.trim();
      let deploymentId = "";

      // Check if it is a full Apps Script URL containing /macros/s/
      const macrosMatch = targetBaseUrl.match(/macros\/s\/([^\/\?]+)/);
      if (macrosMatch) {
        deploymentId = macrosMatch[1].trim();
      } else {
        // Otherwise, assume they provided the raw Deployment ID or ID with /exec or /dev at the end
        deploymentId = targetBaseUrl.replace(/\/+$/, "").replace(/\/exec$/, "").replace(/\/dev$/, "").trim();
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
        targetBaseUrl = `https://script.google.com/macros/s/${deploymentId}/exec`;
      }

      // Build the target Apps Script URL
      let targetUrl = `${targetBaseUrl}?action=getData&date=${date}`;
      if (spreadsheetId && typeof spreadsheetId === "string" && spreadsheetId.trim() !== "") {
        targetUrl += `&spreadsheetId=${encodeURIComponent(spreadsheetId.trim())}`;
      }
      console.log(`[Proxy] Fetching from Apps Script: ${targetUrl}`);

      // We do a standard server-to-server fetch
      const response = await fetch(targetUrl);
      
      if (!response.ok) {
        // If the upstream returned a 404, we provide a super detailed explanation
        let helpfulMessage = `Google Apps Script returned HTTP status ${response.status}`;
        if (response.status === 404) {
          helpfulMessage = "Google Apps Script mengembalikan status 404 (Not Found). Ini biasanya terjadi jika ID Deployment Web App salah, deployment belum dipublikasikan, atau URL yang Anda masukkan tidak valid.";
        }
        return res.status(response.status).json({
          status: "error",
          message: helpfulMessage
        });
      }

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await response.json();
        return res.json(data);
      } else {
        // Sometimes Apps Script returns HTML error page (e.g. if authentication is required or not deployed as Anyone)
        const text = await response.text();
        console.error(`[Proxy] Unexpected content type: ${contentType}`, text.substring(0, 500));
        
        if (text.includes("accounts.google.com") || text.includes("Google Accounts")) {
          return res.status(400).json({
            status: "error",
            message: "Apps Script memerlukan login Google. Pastikan pilihan 'Who has access' diatur ke 'Anyone' saat men-deploy Web App."
          });
        }

        // Try to extract the error message from the standard Google Apps Script error page layout
        let extractedError = "";
        const classMatch = text.match(/class=["']?errorMessage["']?/i);
        if (classMatch && classMatch.index !== undefined) {
          const classIndex = classMatch.index;
          const tagCloseIndex = text.indexOf('>', classIndex);
          if (tagCloseIndex !== -1) {
            const nextTagOpen = text.indexOf('<', tagCloseIndex);
            if (nextTagOpen !== -1) {
              extractedError = text.substring(tagCloseIndex + 1, nextTagOpen).trim().replace(/<[^>]+>/g, "");
            }
          }
        }
        
        if (!extractedError) {
          const errorMatch = text.match(/class="errorMessage"[^>]*>([\s\S]*?)<\/div>/i) || 
                             text.match(/class="errorMessage">([\s\S]*?)<\/td>/i) ||
                             text.match(/<div[^>]*class="errorMessage"[^>]*>([\s\S]*?)<\/div>/i);
          if (errorMatch && errorMatch[1]) {
            extractedError = errorMatch[1].trim().replace(/<[^>]+>/g, ""); // strip any nested tags
          }
        }

        if (!extractedError) {
          if (text.includes("Authorization is required to perform that action")) {
            extractedError = "Authorization is required to perform that action. (Otorisasi Diperlukan: Buka Apps Script editor, klik tombol 'Run' sekali untuk memberikan izin akses ke Spreadsheet Anda).";
          } else if (text.includes("Script function not found")) {
            extractedError = "Script function not found: doGet. (Fungsi doGet tidak ditemukan di Apps Script Anda).";
          }
        }

        if (extractedError) {
          return res.status(400).json({
            status: "error",
            message: `Error dari Google Apps Script: "${extractedError}". Silakan ikuti instruksi 'Setup Integrasi Sheets' di tab bantuan bawah untuk memberikan izin otorisasi script.`
          });
        }
        
        return res.status(400).json({
          status: "error",
          message: "Tanggapan dari Apps Script bukan format JSON. Silakan periksa kembali URL Web App atau izin deployment Anda (Pastikan 'Who has access' = 'Anyone')."
        });
      }
    } catch (error: any) {
      console.error("[Proxy] Error fetching from Apps Script:", error);
      return res.status(500).json({
        status: "error",
        message: `Gagal menghubungi Google Apps Script: ${error.message}`
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
