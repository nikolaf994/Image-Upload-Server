const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const { validateCompanyUser } = require("./functions/uploadFunctions");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3001;
const UPLOADS = path.join(process.cwd(), "uploads");

app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

const baseURL = process.env.BASE_URL || "http://localhost:3001";

// Multer (memory storage)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// In-memory map za "in-flight" generacije cache fajlova
const generating = new Map();

/**
 * Helper: osiguraj folder postoji
 */
async function ensureDir(dir) {
  try {
    await fsPromises.mkdir(dir, { recursive: true });
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
  }
}

/**
 * UPLOAD ruta
 * - prima form-data "image"
 * - snima u /uploads/:username/<timestamp>.webp (quality 80)
 */
app.post("/:username/upload", (req, res) => {
  const uploadSingle = upload.single("image");

    const { username } = req.params;

    if (!username) {
      console.log("Forbidden upload attempt:", req.params.username, req.body.userSecret, req.ip);
      return res.status(403).json({ error: "Forbidden" });
    }

  uploadSingle(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: "Expected field 'image' in form-data" });
    } else if (err) {
      return res.status(500).json({ error: "Upload error" });
    }

      const userSecret = req.body.userSecret;

    // Jednostavna autentifikacija u formdata polju pod imenom "userSecret"
      if (!userSecret) {
        console.log("Forbidden upload attempt:", req.params.username, userSecret, req.ip);
        return res.status(403).json({ error: "Forbidden" });
      }


    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {

      const existingUser = await validateCompanyUser(username, userSecret);

      if (!existingUser || !existingUser.success || existingUser.error) {
        console.log("Forbidden upload attempt:", req.params.username, req.body.userSecret, req.ip);
        return res.status(403).json({ error: existingUser.error || "Forbidden" });
      }

      console.log(existingUser)

      const userFolder = path.join(UPLOADS, existingUser.companyName);
      if (!fs.existsSync(userFolder)) fs.mkdirSync(userFolder, { recursive: true });

      // Sačuvaj originalni fajl sa originalnom ekstenzijom
      const ext = path.extname(req.file.originalname) || ".png"; // fallback na png
      const filename = `${path.parse(req.file.originalname).name}-${Date.now()}`;
      const fileNameWithtExt = `${filename}${ext}`;
      const filepath = path.join(userFolder, fileNameWithtExt);

      await fsPromises.writeFile(filepath, req.file.buffer);

      console.log(`Image successfully Upload by ${existingUser.companyName} with IP:(${req.ip}) and filename: ${fileNameWithtExt} at ${new Date().toLocaleString("en-UK", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}`);
      res.json({ url: `${baseURL}/${username}/${filename}` });
    } catch (err) {
      console.error("Upload error:", err);
      res.status(500).json({ error: "Upload error" });
    }
  });
});

/**
 * SERVE ruta sa cache-om
 * Query params: w, h, f, grey, invert, q, blur
 */
app.get("/:username/:image", async (req, res) => {
  try {
    const { username, image } = req.params;
    const { w, h, f, grey, invert, q, blur } = req.query;

    const userFolder = path.join(UPLOADS, username);

    // Izdvoji baseName i traženi format
    const baseName = path.parse(image).name;
    const requestedExt = path.extname(image).slice(1) || "webp";

    // Pronađi originalni fajl (bilo koja ekstenzija)
    const files = await fsPromises.readdir(userFolder);
    let origFile = null;
    for (const f of files) {
      if (path.parse(f).name === baseName) {
        origFile = path.join(userFolder, f);
        break;
      }
    }
    if (!origFile) return res.status(404).send("Image not found");

    // Parse query parametre
    let width = w ? Math.max(1, parseInt(w, 10) || 0) : null;
    let height = h ? Math.max(1, parseInt(h, 10) || 0) : null;
    if (width && !height) height = width;
    if (!width && height) width = height;

    const fitAllowed = ["cover", "contain", "fill", "inside", "outside"];
    if (f && !fitAllowed.includes(f)) return res.status(400).send("Invalid fit mode");
    const fitMode = f || "inside";

    let quality = q ? parseInt(q, 10) : 80;
    if (Number.isNaN(quality)) quality = 80;
    quality = Math.min(100, Math.max(1, quality));

    const g = grey ? parseFloat(grey) : 0;
    const inv = String(invert) === "1";
    const blurValue = blur ? parseFloat(blur) : null;

    // Ako ništa ne traži osim originalnog formata
    const origExt = path.extname(origFile).slice(1);
    const isOriginalRequest =
      width === null && height === null &&
      !g && !inv && !blurValue &&
      quality === 80 && fitMode === "inside" &&
      requestedExt === origExt;

    if (isOriginalRequest) {
      res.set("Content-Type", `image/${origExt}`);
      res.set("Cache-Control", "public, max-age=31536000, immutable");
      return res.sendFile(origFile);
    }

    // Cache folder i ime
    const cacheFolder = path.join(userFolder, "cache");
    await ensureDir(cacheFolder);

    const cacheName =
      `${baseName}_w${width ?? "auto"}_h${height ?? "auto"}_f${fitMode}` +
      `_g${g ?? 0}_i${inv ? 1 : 0}_b${blurValue ?? 0}_q${quality}.${requestedExt}`;
    const cachePath = path.join(cacheFolder, cacheName);

    if (fs.existsSync(cachePath)) {
      res.set("Content-Type", `image/${requestedExt}`);
      res.set("Cache-Control", "public, max-age=31536000, immutable");
      return res.sendFile(cachePath);
    }

    if (generating.has(cachePath)) {
      try {
        await generating.get(cachePath);
        if (fs.existsSync(cachePath)) {
          res.set("Content-Type", `image/${requestedExt}`);
          res.set("Cache-Control", "public, max-age=31536000, immutable");
          return res.sendFile(cachePath);
        }
      } catch (err) { console.warn("Previous generation failed for", cachePath, err); }
    }

    const tmpPath = cachePath + ".tmp-" + Math.random().toString(36).slice(2, 8);

    const genPromise = (async () => {
      try {
        let pipeline = sharp(origFile).resize({
          width: width || undefined,
          height: height || undefined,
          fit: fitMode
        });

        if (g) pipeline = pipeline.grayscale();
        if (inv) pipeline = pipeline.negate();
        if (blurValue) pipeline = pipeline.blur(blurValue);

        // Generiši u traženom formatu
        if (requestedExt === "webp") await pipeline.webp({ quality }).toFile(tmpPath);
        else if (requestedExt === "png") await pipeline.png({ quality }).toFile(tmpPath);
        else if (requestedExt === "jpg" || requestedExt === "jpeg") await pipeline.jpeg({ quality }).toFile(tmpPath);
        else await pipeline.toFile(tmpPath); // fallback

        await fsPromises.rename(tmpPath, cachePath);
      } finally {
        try { if (fs.existsSync(tmpPath)) await fsPromises.unlink(tmpPath); } catch (_) {}
      }
    })();

    generating.set(cachePath, genPromise);

    try { await genPromise; } catch (err) {
      console.error("Cache generation error:", err);
      generating.delete(cachePath);
      return res.status(500).send("Image processing failed");
    }

    generating.delete(cachePath);

    res.set("Content-Type", `image/${requestedExt}`);
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    return res.sendFile(cachePath);

  } catch (err) {
    console.error("Serve error:", err);
    return res.status(500).send("Server error");
  }
});


app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
