// server.js
require("dotenv").config();
const express = require("express");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the root directory (for upload.html, view.html, etc.)
app.use(express.static(__dirname));

// Multer for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Cloudinary config from environment variables
cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.API_KEY,
    api_secret: process.env.API_SECRET
});

// ---------------------------
// GET ALL CATEGORIES
// ---------------------------
app.get("/api/categories", async (req, res) => {
    try {
        const result = await cloudinary.api.sub_folders("njora-photos");
        const categories = result.folders.map(f => f.name);
        return res.json({ categories });
    } catch (err) {
        console.error("Category fetch error:", err);
        return res.status(500).json({ error: "Failed to load categories" });
    }
});

// ---------------------------
// CREATE NEW CATEGORY
// ---------------------------
app.post("/api/create-category", async (req, res) => {
    const { category } = req.body;
    if (!category) return res.status(400).json({ error: "Category name required" });

    try {
        await cloudinary.api.create_folder(`njora-photos/${category}`);
        return res.json({ message: "Category created" });
    } catch (err) {
        console.error("Create folder error:", err);
        return res.status(500).json({ error: "Failed to create folder" });
    }
});

// ---------------------------
// FILE UPLOAD
// ---------------------------
app.post("/api/upload", upload.single("file"), async (req, res) => {
    const file = req.file;
    const category = req.body.category;
    const name = req.body.name;
    const description = req.body.description;

    if (!file) return res.status(400).json({ error: "File missing" });
    if (!category) return res.status(400).json({ error: "Category missing" });
    if (!name) return res.status(400).json({ error: "Picture Name missing" });

    try {
        const uploaded = await cloudinary.uploader.upload_stream(
            { 
                folder: `njora-photos/${category}`,
                context: `name=${name}|description=${description}`
            },
            async (err, result) => {
                if (err) {
                    console.error("Upload error:", err);
                    return res.status(500).json({ error: "Upload failed" });
                }

                // DB hook (optional)
                console.log(`[DB HOOK] Save metadata for Public ID: ${result.public_id}`);

                return res.json({
                    message: "Uploaded successfully",
                    url: result.secure_url,
                    public_id: result.public_id
                });
            }
        );
        uploaded.end(file.buffer);
    } catch (err) {
        console.error("Upload exception:", err);
        return res.status(500).json({ error: "Upload failed" });
    }
});

// ---------------------------
// LIST IMAGES BY CATEGORY
// ---------------------------
app.get("/api/images", async (req, res) => {
    const category = req.query.category || "";
    const folderPath = category ? `njora-photos/${category}` : "njora-photos";

    try {
        const result = await cloudinary.api.resources({
            type: "upload",
            prefix: folderPath,
            max_results: 500,
            context: true
        });

        const mergedResources = result.resources.map(asset => {
            const context = asset.context ? asset.context.custom : {};
            let assetCategory = "Root";
            if (asset.folder) assetCategory = asset.folder.split('/').pop();
            else if (category) assetCategory = category;

            return {
                public_id: asset.public_id,
                secure_url: asset.secure_url,
                name: context.name || "Untitled Photo",
                description: context.description || "No description provided.",
                category: assetCategory,
                created_at: asset.created_at
            };
        });

        return res.json({ resources: mergedResources, next_cursor: result.next_cursor });
    } catch (err) {
        console.error("Fetch images error:", err);
        console.error(`Failing folder path: ${folderPath}`);
        return res.status(500).json({ error: "Failed to load images" });
    }
});

// ---------------------------
// DELETE IMAGE
// ---------------------------
app.post("/api/delete-image", async (req, res) => {
    const { public_id } = req.body;
    if (!public_id) return res.status(400).json({ error: "public_id is required" });

    try {
        const result = await cloudinary.uploader.destroy(public_id);
        if (result.result !== "ok") throw new Error("Failed to delete image on Cloudinary");

        console.log(`[DB HOOK] Delete metadata for Public ID: ${public_id}`);
        res.json({ message: "Deleted successfully" });
    } catch (err) {
        console.error("Delete image error:", err);
        res.status(500).json({ error: err.message || "Deletion failed" });
    }
});

// ---------------------------
// ROOT ROUTE
// ---------------------------
app.get("/", (req, res) => {
    res.send(`
      Njora backend is working!<br>
      <a href="/upload.html">Upload Page</a><br>
      <a href="/view.html">View Page</a><br>
      <a href="/manage.html">Manage Page</a>
    `);
});

// ---------------------------
// START SERVER
// ---------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
