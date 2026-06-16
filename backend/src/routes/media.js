const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { verifyToken } = require('../middleware/auth');
const env = require('../config/env');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, env.uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

router.post('/upload', verifyToken, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const relativeUrl = `/uploads/${req.file.filename}`;
    const fullUrl = `${env.baseUrl}${relativeUrl}`;

    // Insert record in db using Prisma
    const media = await db.mediaFile.create({
      data: {
        originalName: req.file.originalname,
        storedName: req.file.filename,
        url: fullUrl,
        mimeType: req.file.mimetype,
        size: req.file.size,
        uploadedBy: req.user.id
      }
    });

    res.status(201).json({
      id: media.id,
      original_name: media.originalName,
      stored_name: media.storedName,
      url: media.url,
      mime_type: media.mimeType,
      size: media.size,
      created_at: media.createdAt
    });
  } catch (err) {
    console.error('Error uploading media file:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
