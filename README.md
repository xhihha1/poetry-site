# 詩歌

詩歌本 + 新約聖經朗讀的網頁 App，放在 GitHub Pages：<https://xhihha1.github.io/poetry-site/>

手機可以「加到主畫面」當 App 用，詩歌本可以下載離線（☰ → 更多 APP → 離線詩歌）。

## 在電腦上試跑

```bash
python3 server.py
```

然後打開 <http://localhost:8000/index.html>。沒有建置步驟，改完檔案重新整理就好。

## 新增歌譜

### 1. 檔名規則

每本詩歌一個資料夾，檔名用「書代號_歌號」：

| 詩歌本 | 資料夾 | 檔名 | 歌號位數 |
|---|---|---|---|
| 大本詩歌 | `shi_ge/` | `D_178.webp` | 3 位 |
| 補充本詩歌 | `bu_chong_ben/` | `B_0015.webp` | 4 位 |
| 新歌頌詠 | `xin_ge_song_yong/` | `N_001.webp` | 3 位 |
| 新詩(紅) | `hong_ben/` | `X_005.webp` | 3 位 |
| 新詩(藍) | `lan_ben/` | `L_010.webp` | 3 位 |

一首歌有好幾頁時，第二頁起加 `-1`、`-2`…：

```
D_469.webp     ← 第一頁
D_469-1.webp   ← 第二頁
D_469-2.webp   ← 第三頁
```

App 會從第一頁開始依序找，找不到下一頁就停，所以頁碼不能跳號。

### 2. 放進資料夾

直接放 **PNG** 就可以（例如 `X_125.png`），不用自己轉檔。部署時會自動轉成 WebP（無損，畫質一樣，大小約剩 30%）。

如果掃描或匯出的檔名是「PDF 頁碼」而不是「歌號」，可以用該資料夾裡的 `change.py` 批次改名。打開檔案，改最下面三個數字：

```python
start_page = 47     # 第一個要改的檔案目前的頁碼
start_number = 28   # 它應該變成的歌號
end_page = 124      # 最後一個要改的頁碼
```

然後在那個資料夾裡執行：

```bash
cd hong_ben
python3 change.py
```

它會把 `X_047.png` 改成 `X_028.png`、`X_048.png` 改成 `X_029.png`…依此類推。執行前先確認數字沒填錯，改名不能復原（可以先備份）。

### 3.（選擇性）在電腦上先看看

PNG 要轉成 WebP，App 才讀得到。想在 push 之前先用 `python3 server.py` 看新歌，先轉一次：

```bash
tools/songs_to_webp.sh
```

需要 `cwebp`（Mac：`brew install webp`）。轉完會把 PNG 刪掉、只留 WebP。

### 4. commit + push

```bash
git add shi_ge bu_chong_ben xin_ge_song_yong hong_ben lan_ben
git commit -m "新增歌譜"
git push
```

push 到 `master` 後，GitHub 會自動：

1. 把還是 PNG 的歌譜轉成 WebP
2. 更新離線下載用的歌譜清單（`offline-songs.json`，不用 commit，自動產生）
3. 部署網站（大約 1～2 分鐘）

手機上已經下載離線的詩歌本，打開「離線詩歌」會顯示「有 N 個新增/更新」，按一下只會下載新的部分。

## 新增簡譜（可播放旋律）

用 App 裡的簡譜編輯器（☰ → 簡譜編輯）做好後匯出 JSON，照歌譜的檔名放到 `jianpu/書代號/`，例如：

```
jianpu/D/D_178.json
```

放進去就好，那首歌的頁面會自動出現「起調 / 播放」按鈕。

## 新增小工具 App

在 `apps/` 放一個新頁面，再到 `apps/index.html` 加一張卡片（照著現有的 `<a class="app-item">` 複製一份改內容）。
