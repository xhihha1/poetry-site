# 交接文件（HANDOFF）

給接手的新 session / 開發者。最後更新：2026-11-02。

先讀 `CLAUDE.md`（架構與慣例）和 `README.md`（使用者操作流程），這份只記「目前做到哪、還有什麼沒做、要注意什麼」。

## 專案現況

純靜態網站（vanilla HTML/CSS/JS，沒有建置工具），push 到 `master` 由 `.github/workflows/static.yml` 部署到 GitHub Pages：<https://xhihha1.github.io/poetry-site/>。使用者主要在 Android / iPhone 上「加到主畫面」當 App 用。

部署流程會做兩件事（不用 commit 產物）：
1. `tools/songs_to_webp.sh`：把歌譜 PNG 轉成無損 WebP
2. `tools/build_offline_index.py`：產生 `offline-songs.json`（已列入 `.gitignore`）

## 已完成的功能（依時間）

| 功能 | 主要檔案 | 備註 |
|---|---|---|
| 更多 APP 入口（☰ 選單） | `index.html` 的 `#more-menu`、`apps/index.html` | 新工具 = `apps/` 新頁面 + 一張卡片 |
| 鋼琴、鼓 | `apps/piano.html`、`apps/drum.html` | 純 Web Audio 合成，不用函式庫 |
| 捷運拼牌（2～4 人連線） | `apps/tiles.html`、`apps/tiles/{rules,net,firebase-config}.js` | Firebase Realtime DB，見下方注意事項 |
| 詩歌離線 | `sw.js`、`apps/offline.html` | 依詩歌本選擇下載；聖經刻意不離線 |
| 歌譜改成 WebP | 五個詩歌資料夾 | 210 MB → 70 MB，像素完全一樣；原 PNG 在 git 歷史 |
| README（新增歌譜流程） | `README.md` | |
| 互動歌詞（簡譜 + 動態歌詞 + 點哪播哪） | `script/songScore.js`、`style/songScore.css`、`index.html` 的 `renderSongScore()`、`script/jianpuPlayer.js` | 只有 JSON 的 `source` 有 `w1:` 歌詞行的歌才顯示 |

## 互動歌詞：目前狀態

- 功能已完成、測過（`tools/tests/score.test.mjs` 9 項全過），已部署。
- **目前沒有任何一首歌有歌詞**，所以線上還看不到效果。`jianpu/D/D_178.json` 只有旋律。
- 歌詞要由使用者自己在簡譜編輯器輸入 `w1: …` 行（語法見 README「加上歌詞」）。**不要由 AI 從歌譜圖片或其他網站抄錄歌詞**：這些詩歌（大本、補充本等）的歌詞受著作權保護，網站是公開的。使用者曾提議爬 churchinmontereypark.org 的文字版歌詞，已婉拒並改用 WebP 壓縮。
- 編輯器目前只「保留」歌詞行，沒有專門的歌詞編輯介面，也沒有在編輯器預覽裡對齊顯示歌詞。要確認對齊，得存檔放進 `jianpu/` 後到歌曲頁看。

## 待辦 / 可以接著做

1. **編輯器的歌詞預覽**：在 `jianpu-editor.html` / `jianpu-mobile.html` 的譜面下顯示 `w1:` 對齊結果（可直接重用 `script/songScore.js` 的 `parse()`），讓使用者輸入時就看得到哪個字對到哪個音。
2. **手機版編輯器的歌詞輸入**：現在手機版只能顯示歌詞行，不能新增 / 編輯（要到桌機版用文字輸入）。
3. **批次打譜（省 token 的做法）**：如果要整本做簡譜，不要在對話裡一首一首看圖打。建議寫一個腳本，用 API 呼叫小模型（例如 Haiku）讀每張 WebP 產生簡譜 `source` 草稿，輸出到 `jianpu/{book}/`，再由使用者用編輯器邊聽邊修。只產生旋律，不產生歌詞。
4. 歌曲頁同時有舊的「起調 / ▶ 播放」浮動按鈕和互動歌譜的播放鈕，畫面右下角會重疊在譜上（譜底部有留 120px 空間）。可以考慮有互動歌譜時隱藏舊的「▶ 播放」，只留「起調」。
5. 實機驗證：離線下載、WebP、互動歌詞都只在 headless Chrome 測過，**還沒在使用者的 Android / iPhone 主畫面 App 上確認**。

## 注意事項

- **Firebase**：專案 `firstproj-3758b`，資料庫 `https://firstproj-3758b.firebaseio.com`。這個資料庫曾經因為太久沒用被停用過（使用者手動重新啟用）。拼牌出現「連不上伺服器」時先檢查這個。規則只開放 `rooms/$code` 讀寫。設定在 `apps/tiles/firebase-config.js`（公開前端設定，不是密碼）。
- **Service worker**：`sw.js` 的 `SHELL` 清單要跟 `index.html` 實際載入的檔案一致；`index.html` 裡 `main.css?v=N` 改版本時，`SHELL` 裡也要改。
- **歌譜副檔名**：網站只讀 `.webp`。各資料夾的 `change.py` 是使用者用來把「PDF 頁碼」改名成「歌號」的工具，操作的是 PNG，保留不要動。
- `index.html` 的聖經朗讀邏輯和 `script/newTestament.js` 有重複程式碼（見 CLAUDE.md），改聖經功能時兩邊都要看。
- 使用者偏好：中文溝通；完成後直接 commit + push 到 `master`（GitHub Pages 會自動部署），push 後告訴他可以去網頁試。

## 測試

```bash
node tools/tests/tiles-rules.test.js                                       # 拼牌規則
python3 tools/build_offline_index.py && node tools/tests/offline.test.mjs . # 離線（需要 Google Chrome）
node tools/tests/score.test.mjs .                                          # 互動歌詞（需要 Google Chrome）
```

瀏覽器測試會自己開 Python 伺服器（port 8766 / 8767）和 headless Chrome（9333 / 9334），在 Claude Code 的內建瀏覽器面板裡 service worker 無法註冊，所以離線相關要用這些腳本測。
