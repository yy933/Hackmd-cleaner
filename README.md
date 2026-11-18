# HackMD-to-Astro-Paper Notes Cleaner

A Node.js tool that automates fetching notes from HackMD via API, cleaning and transforming Markdown formatting, downloading remote images locally, and exporting them directly to an [Astro Paper](https://github.com/satnaing/astro-paper) blog repository [Technote-blog-Astropaper](https://github.com/yy933/Technote-blog-Astropaper).

## Overview

This project streamlines the workflow of publishing HackMD notes to an Astro Paper–powered blog. It:

1. Reads Markdown notes from a local source directory (`./my_notes`).
2. Loads a HackMD note catalog (`hackmd_catalog.json`) to resolve cross-article links by note title/ID.
3. Cleans and transforms Markdown content — Shiki code fences, line breaks, and HackMD `::: alert` boxes are converted to Astro-compatible HTML.
4. Downloads remote images using `curl` (with `Referer` and `User-Agent` headers) to bypass 403 hotlinking restrictions.
5. Generates YAML frontmatter (title, publication/modification dates, tags, excerpts, and HackMD note ID).
6. Writes the cleaned Markdown files directly into the Astro Paper blog's `src/content/posts` directory and images into `public/images`.

---

## Key Features

| Feature                            | Description                                                                                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **HackMD API integration**         | `format-catalog.js` fetches your full note list from `https://api.hackmd.io/v1/notes` and builds `hackmd_catalog.json` (title → URL mapping).                                  |
| **Catalog-based link mapping**     | `clean-local.js` reads `hackmd_catalog.json` to translate HackMD internal note links into Astro blog post paths (`/posts/<slug>/`).                                            |
| **Remote image downloading**       | Images are downloaded with system `curl` using a spoofed `Referer: https://hackmd.io/` header and Chrome User-Agent to bypass 403 hotlink protection and follow 302 redirects. |
| **Cross-article link translation** | HackMD note URLs in your Markdown are rewritten to point to the corresponding Astro blog post based on note titles/IDs.                                                        |
| **Markdown syntax cleaning**       | Strips Shiki highlight fences, normalizes line breaks, and converts `::: warning`, `::: success`, `::: danger`, and `::: info` alert boxes into styled HTML blockquotes.       |
| **YAML Frontmatter generation**    | Automatically creates frontmatter with `title`, `pubDatetime`, `modDatetime`, `tags`, `description` (excerpt), and optional `hackmd_id`.                                       |
| **Force overwrite mode**           | Pass `--force` to overwrite existing blog posts instead of skipping them.                                                                                                      |

## Prerequisites & Setup

### 1. Node.js

Make sure you have [Node.js](https://nodejs.org/) installed (v16+ recommended).

### 2. Install dependencies

```bash
npm install
```

### 3. Configure your HackMD API token

Create a `.env.local` file in the project root with your HackMD API token:

```env
HACKMD_API_TOKEN=your_hackmd_api_token_here
```

> **How to get a token:** Log in to HackMD, go to **Account Settings → API**, and generate a new token. Copy it into `.env.local` as shown above.

> ⚠️ `.env.local` is already listed in `.gitignore` and should **not** be committed to version control.

## Project Structure

```
Hackmd-cleaner/
├── clean-local.js          # Main cleaning & export script
├── format-catalog.js       # HackMD API catalog builder
├── hackmd_catalog.json     # Generated note catalog (title → URL)
├── .env.local              # HackMD API token (gitignored)
├── .gitignore              # Git ignore rules
├── package.json            # Node.js dependencies
├── package-lock.json
├── my_notes/               # SOURCE_DIR — your local HackMD Markdown exports
└── README.md
```

### Key directories

| Variable           | Path                                            | Purpose                                                       |
| ------------------ | ----------------------------------------------- | ------------------------------------------------------------- |
| `SOURCE_DIR`       | `./my_notes`                                    | Input directory containing your exported HackMD `.md` files.  |
| `OUTPUT_DIR`       | `../technote-blog-astropaper/src/content/posts` | Destination for cleaned Astro-compatible Markdown blog posts. |
| `IMAGE_OUTPUT_DIR` | `../technote-blog-astropaper/public/images`     | Destination for downloaded images referenced by the posts.    |

> Adjust these paths at the top of `clean-local.js` if your blog repository is located elsewhere.

## Usage

### Step 1: Build the HackMD note catalog

Fetch your notes from the HackMD API and generate `hackmd_catalog.json`:

```bash
node format-catalog.js
```

This reads `HACKMD_API_TOKEN` from `.env.local`, queries `https://api.hackmd.io/v1/notes`, and saves the title/URL mapping to `hackmd_catalog.json`.

### Step 2: Clean and export notes

Run the main cleaning script:

```bash
node clean-local.js
```

This will:

- Read all `.md` files from `./my_notes`.
- Load `hackmd_catalog.json` for cross-article link resolution.
- Download referenced images to `IMAGE_OUTPUT_DIR`.
- Transform Markdown syntax and generate YAML frontmatter.
- Write the cleaned posts to `OUTPUT_DIR`.

### Step 3: Force overwrite existing files

By default, the script skips files that already exist in the output directory. To overwrite them:

```bash
node clean-local.js --force
```

## License

MIT
