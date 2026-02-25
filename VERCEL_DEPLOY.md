# Vercel 部署指南

## 🚀 快速部署步驟

### 方法一：使用 Vercel CLI（最簡單）

#### 1. 安裝 Vercel CLI

在終端機中執行：

```bash
npm install -g vercel
```

#### 2. 登入 Vercel

```bash
vercel login
```

選擇登入方式：
- GitHub
- GitLab
- Bitbucket
- Email

#### 3. 在專案目錄中執行部署

```bash
cd radiology-template-project
vercel
```

第一次會問你一些問題：

```
? Set up and deploy "~/radiology-template-project"? [Y/n] 
→ 按 Y

? Which scope do you want to deploy to? 
→ 選擇你的帳號

? Link to existing project? [y/N] 
→ 按 N（第一次部署）

? What's your project's name? 
→ radiology-template-system（或自訂名稱）

? In which directory is your code located? 
→ 直接按 Enter（使用當前目錄）
```

#### 4. 等待部署完成

部署完成後會顯示：
```
✅  Production: https://radiology-template-system-xxx.vercel.app
```

這就是你的網站網址了！

#### 5. 之後的更新部署

每次修改程式碼後，只需執行：

```bash
vercel --prod
```

---

### 方法二：使用 Vercel 網站（適合使用 Git）

#### 1. 將專案上傳到 GitHub

```bash
# 初始化 Git（如果還沒有）
git init

# 加入所有檔案
git add .

# 提交
git commit -m "Initial commit"

# 在 GitHub 建立新的 repository
# 然後連接並推送
git remote add origin https://github.com/你的帳號/radiology-template-system.git
git branch -M main
git push -u origin main
```

#### 2. 在 Vercel 網站匯入專案

1. 前往 https://vercel.com
2. 點擊「Add New...」→「Project」
3. 點擊「Import Git Repository」
4. 選擇你的 GitHub 儲存庫
5. 點擊「Import」

#### 3. 設定專案（通常會自動偵測）

- Framework Preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist`

#### 4. 點擊「Deploy」

等待幾分鐘，完成！

#### 5. 之後的更新

只要推送到 GitHub，Vercel 會自動部署：

```bash
git add .
git commit -m "更新內容"
git push
```

---

## 🌐 設定自訂網域（選用）

### 1. 在 Vercel Dashboard

1. 點擊你的專案
2. 前往「Settings」→「Domains」
3. 輸入你的網域名稱
4. 按照指示設定 DNS

### 2. 常見的網域設定

如果你有自己的網域（例如從 GoDaddy、Namecheap 購買）：

1. 在 Vercel 加入網域
2. 在你的網域商後台加入 DNS 記錄：
   - Type: `A`
   - Name: `@`
   - Value: `76.76.21.21`

或使用 CNAME：
   - Type: `CNAME`
   - Name: `www`
   - Value: `cname.vercel-dns.com`

---

## ⚙️ 環境變數設定（如果需要）

如果你想把 Google Sheets 設定放在環境變數中：

### 1. 在 Vercel Dashboard

1. 前往專案的「Settings」
2. 點擊「Environment Variables」
3. 加入變數：
   - `VITE_SPREADSHEET_ID`
   - `VITE_API_KEY`
   - `VITE_SCRIPT_URL`

### 2. 在程式碼中使用

修改 `src/app.jsx`：

```javascript
const [config, setConfig] = useState({
    spreadsheetId: import.meta.env.VITE_SPREADSHEET_ID || '',
    apiKey: import.meta.env.VITE_API_KEY || '',
    scriptUrl: import.meta.env.VITE_SCRIPT_URL || '',
    isConnected: false
});
```

---

## 📊 監控和分析

### 查看部署狀態

1. 前往 Vercel Dashboard
2. 選擇專案
3. 查看「Deployments」頁面

### 查看訪問統計

1. 前往「Analytics」頁面
2. 可以看到訪問次數、地區分布等

---

## 🔧 常見問題

### Q: 部署後畫面是空白的

A: 檢查：
1. Build 是否成功（查看 Vercel 的 Build Logs）
2. `dist` 資料夾是否正確產生
3. 瀏覽器 Console 是否有錯誤（F12）

### Q: 無法連接到 Google Sheets

A: 檢查：
1. API Key 的來源限制是否包含你的 Vercel 網域
2. 試算表權限是否正確設定

### Q: 修改程式碼後沒有更新

A: 
1. 確認有執行 `vercel --prod`
2. 清除瀏覽器快取（Ctrl+Shift+R 或 Cmd+Shift+R）
3. 等待 CDN 快取更新（通常幾分鐘內）

---

## 📱 測試部署

部署完成後：

1. 在手機開啟網址測試
2. 測試所有功能：
   - 複製按鈕
   - 編輯組套
   - Google Sheets 同步
3. 在不同裝置測試同步功能

---

## 🎉 完成！

恭喜！你的放射科報告組套系統已經部署到雲端了！

現在你可以：
- 在任何裝置存取系統
- 與同事分享網址
- 隨時隨地管理你的報告組套

---

## 💡 下一步建議

1. **設定自訂網域**：使用更好記的網址
2. **加入 PWA 功能**：可以像 APP 一樣安裝到手機
3. **加入使用者認證**：如果要多人使用
4. **備份資料**：定期匯出 Google Sheets

---

需要協助？
- Vercel 文件：https://vercel.com/docs
- 聯絡支援：support@vercel.com
