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
      // Build the target Apps Script URL
      let targetUrl = `${url}?action=getData&date=${date}`;
      if (spreadsheetId && typeof spreadsheetId === "string" && spreadsheetId.trim() !== "") {
        targetUrl += `&spreadsheetId=${encodeURIComponent(spreadsheetId.trim())}`;
      }
      console.log(`[Proxy] Fetching from Apps Script: ${targetUrl}`);

      // We do a standard server-to-server fetch
      const response = await fetch(targetUrl);
      
      if (!response.ok) {
        return res.status(response.status).json({
          status: "error",
          message: `Google Apps Script returned HTTP status ${response.status}`
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
