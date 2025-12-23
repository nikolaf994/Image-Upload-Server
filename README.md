
# Image Upload & Dynamic Processing Server

A lightweight, high-performance **Node.js image upload and delivery server** built with **Express, Multer, and Sharp**.

This server allows authenticated users to upload images and instantly serve them with **on-the-fly transformations**, **smart caching**, and **CDN-friendly headers**.

Designed for modern web apps that need fast, scalable image handling without relying on third-party services.

---

## Features

- Secure image uploads
  - Multipart/form-data uploads
  - Simple per-user authentication via `userSecret`
  - Company-based image isolation

- Dynamic image transformations
  - Resize by width and height
  - Multiple fit modes (`cover`, `contain`, `fill`, `inside`, `outside`)
  - Format conversion (`webp`, `jpg`, `png`)
  - Grayscale, invert colors, blur
  - Quality control

- Smart filesystem caching
  - Generated images are cached on disk
  - Cache keys based on transformation parameters
  - Concurrent generation lock to prevent duplicate processing

- Production-ready delivery
  - Immutable cache headers
  - Optimized Sharp pipeline
  - Memory-based uploads (no temporary files)

- CORS enabled
  - Ready for usage from any frontend or client

---

## Tech Stack

- Node.js
- Express
- Multer (memory storage)
- Sharp
- Filesystem-based cache

---

## Folder Structure

```

uploads/
└── companyName/
├── image-name.png
├── image-name.jpg
└── cache/
├── image-name_w300_h300_finside_q80.webp
└── ...

````

Each company or user has an isolated upload directory.

---

## Authentication

Uploads require simple credential-based authentication.

Each upload request must include:
- `:username` as a URL parameter
- `userSecret` provided via form-data

The server validates the provided credentials against its internal user store.
Unauthorized or invalid requests are rejected with a `403 Forbidden` response.

---

## Upload Endpoint

```
POST /:username/upload
```

### Form Data

| Field      | Type   |
| ---------- | ------ |
| image      | File   |
| userSecret | String |

### Response

```json
{
  "url": "https://your-domain.com/username/image-name"
}
```

The uploaded file is stored in its original format.

---

## Image Serve and Transform Endpoint

```
GET /:username/:image
```

### Query Parameters

| Parameter | Description                 |
| --------- | --------------------------- |
| w         | Width                       |
| h         | Height                      |
| f         | Fit mode                    |
| q         | Quality (1–100)             |
| grey      | Grayscale                   |
| invert    | Invert colors (use `1`)     |
| blur      | Blur intensity              |
| Format    | Output format via extension |

### Example

```
/john/photo.webp?w=400&h=400&f=cover&q=75&grey=1
```

---

## Caching Strategy

* Transformed images are cached on disk
* Cache filenames are generated from transformation parameters
* Identical requests reuse existing cache files
* Concurrent requests for the same transformation wait for a single generation

---

## HTTP Cache Headers

All served images include:

```
Cache-Control: public, max-age=31536000, immutable
```

This makes the server suitable for CDN usage and aggressive browser caching.

---

## Environment Variables

```
PORT=3001
BASE_URL=http://localhost:3001
```

---

## Getting Started

```
npm install
node server.js
```

The server will start on:

```
http://localhost:3001
```

---

## License

MIT License with Attribution Requirement.

You are free to use, modify, and distribute this software, provided that proper credit is given to the original author.

Attribution must include:

* The author’s name
* A link to the original repository
* A clear statement that the project is based on this work


