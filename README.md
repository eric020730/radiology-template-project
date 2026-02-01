# 放射科報告組套系統

一個用於管理和快速複製放射科報告組套的網頁應用程式，支援 Google Sheets 雲端同步。

## ✨ 功能特色

- 🔘 一鍵複製報告組套內容
- ✏️ 可編輯所有組套的名稱和內容
- ☁️ Google Sheets 雲端同步
- 📥 從 Google Sheets 匯入資料
- 📤 匯出資料到 Google Sheets
- 💾 本地儲存備份
- 🌐 跨裝置使用

## 🚀 本地開發

### 1. 安裝相依套件

```bash
npm install
```

### 2. 啟動開發伺服器

```bash
npm run dev
```

開發伺服器會在 http://localhost:5173 啟動

### 3. 建置專案

```bash
npm run build
```

建置後的檔案會在 `dist` 資料夾中

## 📦 部署到 Vercel

### 方法一：使用 Vercel CLI（推薦）

1. 安裝 Vercel CLI：
```bash
npm install -g vercel
```

2. 登入 Vercel：
```bash
vercel login
```

3. 部署：
```bash
vercel
```

4. 第一次部署會問一些問題：
   - Set up and deploy? → Yes
   - Which scope? → 選擇你的帳號
   - Link to existing project? → No
   - Project name? → radiology-template-system (或自訂名稱)
   - In which directory is your code located? → ./ (直接按 Enter)

5. 之後每次更新只需執行：
```bash
vercel --prod
```

### 方法二：透過 Vercel 網站

1. 將專案推送到 GitHub
2. 前往 https://vercel.com
3. 點擊 "Import Project"
4. 選擇你的 GitHub 儲存庫
5. Vercel 會自動偵測設定並部署

## ⚙️ Google Sheets 設定

### 1. 建立 Google Sheet（分組版）

1. 建立新的 Google Sheet，每個工作表對應一個頁籤（例如：Chest CT、Xray）。
2. 每個工作表使用 **6 欄** 格式：
   - **左側**：A=分組名、B=組套名稱、C=組套內容
   - **右側**：D=分組名、E=組套名稱、F=組套內容
3. 第一列可放表頭（匯入時從第 2 列開始讀）。同一分組的多筆組套，分組名填相同即可。

### 2. 取得 API 金鑰

1. 前往 Google Cloud Console
2. 建立新專案或選擇現有專案
3. 啟用 Google Sheets API
4. 建立 API 金鑰（憑證）
5. 設定 API 限制為只能使用 Google Sheets API

### 3. 設定試算表權限

1. 將試算表設為「知道連結的使用者」可檢視
2. 複製試算表 ID（網址中 `/d/` 和 `/edit` 之間的部分）

### 4. （選用）設定 Apps Script 用於匯出

詳見 `Apps_Script_設定指南.md`。匯出時會送出 `{ tabs }`，每個頁籤的 `left` / `right` 為**分組陣列**，每組為 `{ id, name, items: [{ id, name, content }, ...] }`。Apps Script 需依此寫入試算表：左側 A=分組名、B=名稱、C=內容；右側 D=分組名、E=名稱、F=內容。

## 📁 專案結構

```
radiology-template-project/
├── src/
│   ├── app.jsx          # 主要應用程式元件
│   ├── app.css          # 樣式檔案
│   └── main.jsx         # 入口點
├── index.html           # HTML 模板
├── package.json         # 專案設定
├── vite.config.js       # Vite 設定
└── README.md           # 說明文件
```

## 🔧 環境需求

- Node.js 18 或以上版本
- npm 或 yarn

## 💡 使用技巧

### 在系統中設定 Google Sheets

1. 點擊右上角齒輪圖示
2. 輸入試算表 ID 和 API 金鑰
3. 點擊「連接 Google Sheets」
4. 成功後即可使用匯入/匯出功能

### 跨裝置同步

1. 在辦公室編輯組套
2. 點擊「匯出到 Google Sheets」
3. 在家裡開啟系統
4. 點擊「從 Google Sheets 匯入」

## 🐛 疑難排解

### 無法輸入設定值

- 確認使用最新版的瀏覽器
- 清除瀏覽器快取
- 檢查 Console 是否有錯誤訊息（F12）

### 匯入失敗

- 檢查試算表 ID 是否正確
- 確認 API Key 是否有效
- 確認試算表權限設為「知道連結的使用者」
- 確認工作表名稱為「左側組套」和「右側組套」

### 匯出失敗

- 確認已設定 Apps Script 網址
- 檢查 Apps Script 部署設定

## 📄 授權

MIT License
