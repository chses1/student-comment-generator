# 班級導師評語生成系統

這是一個 React 介面的學生評語生成工具，可整理學生特質、呼叫 Gemini 產生不同版本的評語，並透過 Firebase 儲存進度。

## 發布前設定

1. 複製 `.env.example` 為 `.env.local`。
2. 在 `.env.local` 填入自己的 Gemini API Key 與 Firebase 設定：

```env
VITE_GEMINI_API_KEY=your_gemini_api_key_here
VITE_FIREBASE_CONFIG={"apiKey":"...","authDomain":"...","projectId":"...","storageBucket":"...","messagingSenderId":"...","appId":"..."}
VITE_FIREBASE_APP_ID=default-app-id
```

3. 確認 Firebase 設定與 Firestore Security Rules 已限制為使用者只能讀寫自己的資料。

## 本機執行

```bash
npm install
npm run dev
```

正式打包：

```bash
npm run build
```

## 安全提醒

- 不要把 `.env.local`、API Key、Firebase 私密憑證提交到 GitHub。
- 若部署為純前端網站，Gemini API Key 仍可能在瀏覽器端被看見。正式公開服務建議改用後端代理 API，並在 Google Cloud 設定 API Key 限制。
- 本工具會處理學生姓名與評語內容；正式使用時請遵守學校與所在地的個資規範，並避免把非必要個資送到 AI 服務。
