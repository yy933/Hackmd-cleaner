import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// get __dirname (ES module doesn't have __dirname by default)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 💡 read .env.local
dotenv.config({ path: path.join(__dirname, ".env.local") });

// =================== 🔑  HackMD API Token ===================
const HACKMD_API_TOKEN = process.env.HACKMD_API_TOKEN;
// ===================================================================

async function fetchAndFormatCatalog() {
  if (!HACKMD_API_TOKEN || HACKMD_API_TOKEN.includes("你的")) {
    console.error("❌ 請先在腳本上方填入你真實的 HackMD API Token！");
    return;
  }

  console.log("📡 正在從 HackMD 官方 API 擷取全部文章清單...");

  try {
    // 💡 呼叫官方標準 API 端點
    const response = await fetch("https://api.hackmd.io/v1/notes", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${HACKMD_API_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `HTTP 錯誤！狀態碼: ${response.status} (${response.statusText})`,
      );
    }

    const rawNotes = await response.json();
    console.log(`📥 成功抓取！共收到 ${rawNotes.length} 篇原始筆記數據。`);

    // 💡 根據你查到的官方 Doc 格式進行精準萃取
    const cleanCatalog = rawNotes
      .map((note) => {
        // 優先拿 permalink 或 publishLink，都沒有就用 id 拼湊
        let finalUrl = note.permalink || note.publishLink || note.id;
        console.log(
          `Permalink: ${note.permalink}, PublishLink: ${note.publishLink}, ShortId: ${note.shortId}, Id: ${note.id}, UserPath: ${note.userPath}`,
        );
        if (!finalUrl && note.id) {
          finalUrl = `https://hackmd.io/${note.id}`;
        }

        return {
          title: note.title || "未命名文章",
          url: finalUrl || "",
        };
      })
      .filter((item) => item.url !== ""); // 過濾掉完全沒有網址的髒資料

    // 💡 寫入成我們 clean-local.js 認得的地圖檔
    fs.writeFileSync(
      path.join(__dirname, "./hackmd_catalog.json"),
      JSON.stringify(cleanCatalog, null, 2),
      "utf-8",
    );

    console.log(`\n🎉 完美的網址對照表已建置完成！`);
    console.log(
      `💾 成功將 ${cleanCatalog.length} 篇文章儲存至 hackmd_catalog.json`,
    );
  } catch (error) {
    console.error(
      "❌ 抓取或格式化失敗，請檢查 Token 是否正確：",
      error.message,
    );
  }
}

fetchAndFormatCatalog();
