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
      // Robust Google Apps Script Web App URL normalization
      let targetBaseUrl = url.trim();
      
      // If the user pasted just the Deployment ID (e.g. starting with AKfy...) or a path without the full origin
      if (!targetBaseUrl.startsWith("http://") && !targetBaseUrl.startsWith("https://")) {
        const cleanId = targetBaseUrl.replace(/\/exec$/, "").replace(/\/dev$/, "").trim();
        // Apps Script deployment IDs are long alphanumeric strings usually starting with "AKfy"
        if (cleanId.startsWith("AKfy") || cleanId.length > 30) {
          targetBaseUrl = `https://script.google.com/macros/s/${cleanId}/exec`;
        } else if (targetBaseUrl.includes("script.google.com")) {
          targetBaseUrl = "https://" + targetBaseUrl;
        }
      }

      // Remove trailing slashes and query parameters if any
      targetBaseUrl = targetBaseUrl.replace(/\/+$/, "");
      
      if (targetBaseUrl.includes("script.google.com/macros/s/")) {
        // If they copied the editor URL ending with /edit, convert to /exec
        if (targetBaseUrl.endsWith("/edit")) {
          targetBaseUrl = targetBaseUrl.substring(0, targetBaseUrl.length - 5) + "/exec";
        } else if (targetBaseUrl.includes("/edit?")) {
          targetBaseUrl = targetBaseUrl.split("/edit?")[0] + "/exec";
        }
        
        // Ensure it ends with /exec (or /dev for script development)
        if (!targetBaseUrl.endsWith("/exec") && !targetBaseUrl.endsWith("/dev")) {
          targetBaseUrl += "/exec";
        }
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
