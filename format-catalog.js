import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// Get __dirname (ES modules do not have __dirname by default)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read .env.local
dotenv.config({ path: path.join(__dirname, ".env.local") });

// =================== 🔑  HackMD API Token ===================
const HACKMD_API_TOKEN = process.env.HACKMD_API_TOKEN;
// ===================================================================

async function fetchAndFormatCatalog() {
  if (!HACKMD_API_TOKEN) {
    console.error(
      "❌ Please set your valid HACKMD_API_TOKEN in .env.local first!",
    );
    return;
  }

  console.log("📡 Fetching full note list from the official HackMD API...");

  try {
    // Call the official standard API endpoint
    const response = await fetch("https://api.hackmd.io/v1/notes", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${HACKMD_API_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `HTTP Error! Status code: ${response.status} (${response.statusText})`,
      );
    }

    const rawNotes = await response.json();
    console.log(
      `📥 Fetch successful! Received ${rawNotes.length} raw note records.`,
    );

    // Extract fields based on the official API documentation format
    const cleanCatalog = rawNotes
      .map((note) => {
        // Prioritize permalink or publishLink; fallback to constructing the URL with id
        let finalUrl = note.permalink || note.publishLink;
        console.log(
          `Permalink: ${note.permalink}, PublishLink: ${note.publishLink}, ShortId: ${note.shortId}, Id: ${note.id}, UserPath: ${note.userPath}`,
        );
        if (!finalUrl && note.id) {
          finalUrl = `https://hackmd.io/${note.id}`;
        }

        return {
          title: note.title || "Untitled Note",
          url: finalUrl || "",
        };
      })
      .filter((item) => item.url !== ""); // Filter out invalid entries without a URL

    // Write output to the catalog file expected by clean-local.js
    fs.writeFileSync(
      path.join(__dirname, "./hackmd_catalog.json"),
      JSON.stringify(cleanCatalog, null, 2),
      "utf-8",
    );

    console.log(`\n🎉 URL catalog built successfully!`);
    console.log(`💾 Saved ${cleanCatalog.length} notes to hackmd_catalog.json`);
  } catch (error) {
    console.error(
      "❌ Failed to fetch or format catalog. Please verify your Token:",
      error.message,
    );
  }
}

fetchAndFormatCatalog();
