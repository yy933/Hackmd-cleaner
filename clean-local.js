const fs = require("fs");
const path = require("path");
const https = require("https");
const { execSync } = require("child_process");

// =================== 🛠️ Configure Your Paths ===================
const SOURCE_DIR = "./my_notes";
const OUTPUT_DIR = "../technote-blog-astropaper/src/content/posts";
const IMAGE_OUTPUT_DIR = "../technote-blog-astropaper/public/images"; // 👈 New: Astro public images directory
// =====================================================

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}
if (!fs.existsSync(IMAGE_OUTPUT_DIR)) {
  fs.mkdirSync(IMAGE_OUTPUT_DIR, { recursive: true });
}

// 💡 Use system curl to forcefully bypass 403 hotlinking protection and 302 redirects
function downloadImageSync(url, destPath) {
  return new Promise((resolve, reject) => {
    try {
      // ⚠️ Constructing the curl command:
      // -L: Follow 301/302 redirects automatically
      // -s: Silent mode, hide progress bar
      // -H: Disguise as opening the image directly from within HackMD (crucial for bypassing 403!)
      // -A: Top-tier Chrome browser user-agent
      const command = `curl -L -s -H "Referer: https://hackmd.io/" -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" "${url}" -o "${destPath}"`;

      // Execute command
      execSync(command, { stdio: "ignore" });

      // Verify if the file is successfully downloaded and has content
      if (fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
        resolve();
      } else {
        reject(new Error("下載檔案大小為 0，可能被完全阻擋"));
      }
    } catch (err) {
      reject(err);
    }
  });
}

async function main() {
  try {
    const allFiles = fs
      .readdirSync(SOURCE_DIR)
      .filter((f) => path.extname(f) === ".md");

    const autoLinkDictionary = {};
    const catalogPath = path.join(__dirname, "./hackmd_catalog.json");

    // =================================================================
    // 📊 Phase 1: Read the downloaded map JSON and build the dictionary
    // =================================================================
    if (fs.existsSync(catalogPath)) {
      const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf-8"));
      catalog.forEach((item) => {
        if (item.url && item.url.includes("hackmd.io/")) {
          const urlParts = item.url.split("/");
          const lastPart = urlParts[urlParts.length - 1].split("?")[0];

          if (lastPart && lastPart !== "hackmd.io") {
            const hackmdId = lastPart.trim();
            const cleanSlug = item.title
              .trim()
              .toLowerCase()
              .replace(/&/g, "")
              .replace(/[^a-z0-9\u4e00-\u9fa5\-]/g, "-")
              .replace(/[/\\?%*:|"<>]/g, "")
              .trim();

            autoLinkDictionary[hackmdId] = `/posts/${cleanSlug}/`;
          }
        }
      });
      console.log(
        `📊 系統已成功載入地圖，並建立 ${Object.keys(autoLinkDictionary).length} 組跨文章網址對照。`,
      );
    }

    // =================================================================
    // 🚀 Phase 2: Start cleaning articles and "fully automated image downloading"
    // =================================================================
    let processedCount = 0;
    let skippedCount = 0;
    const isForce = process.argv.includes("--force");

    for (const filename of allFiles) {
      const filePath = path.join(SOURCE_DIR, filename);
      const outputPath = path.join(OUTPUT_DIR, filename);

      if (fs.existsSync(outputPath) && !isForce) {
        skippedCount++;
        continue;
      }

      let content = fs.readFileSync(filePath, "utf-8");

      // --- 1. Extract and parse HackMD's existing Frontmatter ---
      let title = filename.replace(".md", "");
      let tags = ["others"];
      const yamlMatch = content.match(/^---\s*([\s\S]*?)\s*---/);
      if (yamlMatch) {
        const yamlContent = yamlMatch[1];
        const tMatch = yamlContent.match(/title:\s*['"]?(.+?)['"]?\n/);
        if (tMatch) title = tMatch[1].trim();
        const tagsMatch = yamlContent.match(/tags:\s*\[?([^\]\n]+)\]?/);
        if (tagsMatch) {
          tags = tagsMatch[1]
            .split(/[,`]/)
            .map((t) => t.trim().replace(/['"]/g, ""))
            .filter((t) => t.length > 0 && !t.startsWith("tags:"));
        }
        content = content.replace(/^---\s*[\s\S]*?\s*---/, "").trim();
      }
      if (tags.length === 0) tags = ["others"];

      // --- 2. Clean content and fix Shiki syntax highlighting ---
      content = content.replace(/^#\s+.+$/m, "").trim();
      content = content.replace(/^######\s+tags:.*$/gm, "").trim();
      content = content
        .replace(/:::warning[\s\S]*?本站筆記已同步更新到我的[\s\S]*?:::/g, "")
        .trim();
      content = content.replace(/^\[TOC\]$/gim, "## Table of contents").trim();

      content = content.replace(
        /\[([^\]]+)\]\s*\((https?:\/\/[^\s)]+)\)/g,
        "[$1]($2)",
      );
      content = content.replace(
        /!\[(.*?)\]\s*\((https?:\/\/[^\s)]+)\)/g,
        "![$1]($2)",
      );

      // 💡 Step A: [Execute First] Line break savior (content is still in pure ::: info state here, free of HTML tag interference)
      // Exclude colons ":" to ensure the opening and closing lines of ::: warning boxes are not incorrectly padded with spaces
      const blocks = content.split(/(```[\s\S]*?```)/g);
      content = blocks
        .map((block) => {
          if (block.startsWith("```")) return block;
          // Exclude line breaks preceded by #, -, >, *, +, :, <, or whitespace and empty lines
          return block.replace(/([^\n])\n([^\n>*\-+#\s:<])/g, "$1  \n$2");
        })
        .join("");

      // Step B: [Execute Second] Original code block language fix
      content = content.replace(/^```(\w+)(=[^\n]*)?/gm, (match, p1) => {
        let lang = p1.toLowerCase();
        if (lang === "env") lang = "bash";
        return `\`\`\`${lang}`;
      });

      // --- 🌟 New: Fully automatic capture of HackMD images in content and download locally 🌟 ---
      const hackmdImgRegex =
        /https:\/\/hackmd\.io\/_uploads\/[A-Za-z0-9\-_]+\.(?:png|jpg|jpeg|gif|webp)/g;
      const imageUrls = content.match(hackmdImgRegex) || [];

      for (const remoteUrl of imageUrls) {
        const urlParts = remoteUrl.split("/");
        const imgName = urlParts[urlParts.length - 1]; // Get file name like Sk6PPMRCkg.png
        const localImgPath = path.join(IMAGE_OUTPUT_DIR, imgName);

        try {
          // Download only if the image hasn't been downloaded yet
          if (!fs.existsSync(localImgPath)) {
            console.log(`📥 正在下載圖片: ${imgName} ...`);
            await downloadImageSync(remoteUrl, localImgPath);
          }
          // Replace remote URL in content with Astro's local relative path
          content = content.split(remoteUrl).join(`/images/${imgName}`);
        } catch (imgErr) {
          console.error(`❌ 圖片下載失敗 (${remoteUrl}):`, imgErr.message);
        }
      }

      // --- 3. Translate cross-article URLs using the dictionary ---
      Object.keys(autoLinkDictionary).forEach((id) => {
        const hackMdUrlRegex = new RegExp(
          `https://hackmd\\.io/[^\\s\\)]*${id}[^\\s\\)]*`,
          "g",
        );
        content = content.replace(hackMdUrlRegex, autoLinkDictionary[id]);
      });

      // --- 4. Transform ::: alert boxes ---
      content = content.replace(
        /:::\s*warning\s*\n([\s\S]*?)\n:::/g,
        (m, p1) =>
          `<blockquote class="my-6 p-4 bg-orange-50 dark:bg-orange-950/30 border-l-4 border-orange-500 rounded-r-md text-orange-900 dark:text-orange-200 blocknoted-fix">\n\n${p1}\n\n</blockquote>`,
      );
      content = content.replace(
        /:::\s*success\s*\n([\s\S]*?)\n:::/g,
        (m, p1) =>
          `<blockquote class="my-6 p-4 bg-green-50 dark:bg-green-950/30 border-l-4 border-green-500 rounded-r-md text-green-900 dark:text-green-200 blocknoted-fix">\n\n${p1}\n\n</blockquote>`,
      );
      content = content.replace(
        /:::\s*danger\s*\n([\s\S]*?)\n:::/g,
        (m, p1) =>
          `<blockquote class="my-6 p-4 bg-red-50 dark:bg-red-950/30 border-l-4 border-red-500 rounded-r-md text-red-900 dark:text-red-200 blocknoted-fix">\n\n${p1}\n\n</blockquote>`,
      );
      content = content.replace(
        /:::\s*info\s*\n([\s\S]*?)\n:::/g,
        (m, p1) =>
          `<blockquote class="my-6 p-4 bg-sky-50 dark:bg-sky-950/30 border-l-4 border-sky-500 rounded-r-md text-sky-900 dark:text-sky-200 blocknoted-fix">\n\n${p1}\n\n</blockquote>`,
      );

      // --- 5. Generate YAML-compliant Frontmatter ---
      const fileStat = fs.statSync(filePath);
      const fileBirthTime = fileStat.birthtime || fileStat.mtime;
      const fileModifyTime = fileStat.mtime;

      const formattedPubDate = fileBirthTime.toISOString();
      const formattedModDate = fileModifyTime.toISOString();

      const cleanTagsJson = JSON.stringify(tags);
      const safeTitle = title.replace(/"/g, '\\"');

      let associatedId = "";
      const cleanFileNameTitle = filename
        .replace(".md", "")
        .trim()
        .toLowerCase();

      if (fs.existsSync(catalogPath)) {
        const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf-8"));
        const found = catalog.find(
          (item) =>
            item.title &&
            item.title.trim().toLowerCase() === cleanFileNameTitle,
        );
        if (found && found.url) {
          const parts = found.url.split("/");
          associatedId = parts[parts.length - 1].split("?")[0].trim();
        }
      }

      const plainTextExcerpt = content
        .replace(/[#*`\-|>]/g, "")
        .replace(/\s+/g, " ")
        .slice(0, 60);
      const description = plainTextExcerpt.replace(/"/g, '\\"').trim();
      const hasBeenModified = fileModifyTime - fileBirthTime > 60000;

      const newFrontmatter = [
        `---`,
        `title: "${safeTitle}"`,
        `pubDatetime: ${formattedPubDate}`,
        hasBeenModified ? `modDatetime: ${formattedModDate}` : "",
        `tags: ${cleanTagsJson}`,
        `description: "${description || "暫無描述"}..."`,
        associatedId ? `hackmd_id: "${associatedId}"` : "",
        `---`,
        `\n`,
      ]
        .filter(Boolean)
        .join("\n");

      fs.writeFileSync(outputPath, newFrontmatter + content, "utf-8");
      processedCount++;
    }

    console.log(`\n🎉 淨化與圖片下載流程完全結束！`);
    console.log(`✨ 成功匯入/更新文章：${processedCount} 篇`);
    console.log(`⏩ 跳過未覆蓋舊文：${skippedCount} 篇\n`);
  } catch (globalErr) {
    console.error("腳本執行發生致命錯誤:", globalErr);
  }
}

// Execute asynchronous main function
main();
