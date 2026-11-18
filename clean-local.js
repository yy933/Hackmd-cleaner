const fs = require("fs");
const path = require("path");
const https = require("https"); 
const { execSync } = require("child_process");

// =================== 🛠️ 配置你的路徑 ===================
const SOURCE_DIR = "./my_notes";
const OUTPUT_DIR = "../technote-blog-astropaper/src/content/posts";
const IMAGE_OUTPUT_DIR = "../technote-blog-astropaper/public/images"; // 👈 新增：Astro 公共圖片存放區
// =====================================================

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}
if (!fs.existsSync(IMAGE_OUTPUT_DIR)) {
  fs.mkdirSync(IMAGE_OUTPUT_DIR, { recursive: true });
}

// 💡 利用系統 curl 強制突破 403 防盜鏈與 302 轉址
function downloadImageSync(url, destPath) {
  return new Promise((resolve, reject) => {
    try {
      // ⚠️ 這裡構建 curl 指令：
      // -L: 自動跟隨 301/302 轉址
      // -s: 靜音模式，不噴進度條
      // -H: 偽裝成從 HackMD 內部點開圖片的（突破 403 關鍵！）
      // -A: 頂配 Chrome 瀏覽器特徵
      const command = `curl -L -s -H "Referer: https://hackmd.io/" -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" "${url}" -o "${destPath}"`;

      // 執行指令
      execSync(command, { stdio: "ignore" });

      // 檢查檔案是否真的下載成功且有內容
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
    // 📊 階段一：讀取下載好的地圖 JSON，建立對照
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
    // 🚀 階段二：開始清洗文章與「全自動下載圖片」
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

      // --- 1. 提取並解析 HackMD 既有的 Frontmatter ---
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

      // --- 2. 淨化內文與修正 Shiki 語法highlight ---
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

      // 💡 步驟 A：【先執行】換行救星（此時內文還是純粹的 ::: info 狀態，沒有 HTML 標籤干擾）
      // 我們多排除一個冒號「:」，確保 ::: 警示框的開頭結尾行不會被誤塞空白鍵
      const blocks = content.split(/(```[\s\S]*?```)/g);
      content = blocks
        .map((block) => {
          if (block.startsWith("```")) return block;
          // 排除開頭是 #, -, >, *, +, :, <, 或是空白與空行的換行
          return block.replace(/([^\n])\n([^\n>*\-+#\s:<])/g, "$1  \n$2");
        })
        .join("");

      // 步驟 B：【再執行】原本的程式碼區塊語言修正
      content = content.replace(/^```(\w+)(=[^\n]*)?/gm, (match, p1) => {
        let lang = p1.toLowerCase();
        if (lang === "env") lang = "bash";
        return `\`\`\`${lang}`;
      });

      // --- 🌟 新增：全自動捕捉內文的 HackMD 圖片並下載到本地 🌟 ---
      const hackmdImgRegex =
        /https:\/\/hackmd\.io\/_uploads\/[A-Za-z0-9\-_]+\.(?:png|jpg|jpeg|gif|webp)/g;
      const imageUrls = content.match(hackmdImgRegex) || [];

      for (const remoteUrl of imageUrls) {
        const urlParts = remoteUrl.split("/");
        const imgName = urlParts[urlParts.length - 1]; // 取得類似 Sk6PPMRCkg.png 的檔名
        const localImgPath = path.join(IMAGE_OUTPUT_DIR, imgName);

        try {
          // 如果圖片還沒下載過，才執行下載
          if (!fs.existsSync(localImgPath)) {
            console.log(`📥 正在下載圖片: ${imgName} ...`);
            await downloadImageSync(remoteUrl, localImgPath);
          }
          // 將內文的遠端網址替換成 Astro 的本地相對路徑
          content = content.split(remoteUrl).join(`/images/${imgName}`);
        } catch (imgErr) {
          console.error(`❌ 圖片下載失敗 (${remoteUrl}):`, imgErr.message);
        }
      }

      // --- 3. 利用地圖字典翻譯跨文章網址 ---
      Object.keys(autoLinkDictionary).forEach((id) => {
        const hackMdUrlRegex = new RegExp(
          `https://hackmd\\.io/[^\\s\\)]*${id}[^\\s\\)]*`,
          "g",
        );
        content = content.replace(hackMdUrlRegex, autoLinkDictionary[id]);
      });

      // --- 4. 轉換 ::: 警示框 ---
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

      // --- 5. 生成符合 YAML 標準的 Frontmatter ---
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

// 執行非同步主函式
main();
