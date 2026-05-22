import React, { useState, useEffect } from 'react';
import { 
  Copy, Check, AlertTriangle, 
  User, AlertCircle, Trash2, RefreshCw, Sparkles, Loader2,
  FileText, Award, Heart, Plus, Edit,
  Users, X, Cloud, LogIn
} from 'lucide-react';

// --- Firebase 雲端儲存設定 ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, linkWithPopup } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

let app, auth, db, appId, firebaseConfig;
if (typeof window !== 'undefined') {
  const viteFirebaseConfig = import.meta.env ? import.meta.env.VITE_FIREBASE_CONFIG : '';
  firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : JSON.parse(viteFirebaseConfig || '{}');
  if (firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  }
  appId = typeof __app_id !== 'undefined' ? __app_id : ((import.meta.env && import.meta.env.VITE_FIREBASE_APP_ID) || 'default-app-id');
}

// --- API 設定 ---
const GEMINI_MODEL = "gemini-2.5-flash";
const LOCAL_STORAGE_KEY = "student-comment-generator:classData";

const getGeminiApiKey = () => {
  const runtimeKey = typeof window !== 'undefined' ? window.__gemini_api_key__ : '';
  const viteKey = import.meta.env ? import.meta.env.VITE_GEMINI_API_KEY : '';
  return runtimeKey || viteKey || '';
};

// --- 輔助工具 ---
const copyToClipboard = (text, onSuccess) => {
  const textArea = document.createElement("textarea");
  textArea.value = typeof text === 'object' ? JSON.stringify(text, null, 2) : text;
  textArea.style.top = "0";
  textArea.style.left = "0";
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  
  try {
    document.execCommand('copy');
    if (onSuccess) onSuccess();
  } catch (err) {
    console.error("複製失敗:", err);
  }
  
  document.body.removeChild(textArea);
};

const cleanAsterisks = (text) => {
  if (typeof text !== 'string') return text;
  return text.split('*').join('');
};

const fetchFromGemini = async (prompt, schema) => {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error("尚未設定 Gemini API Key，請先設定 VITE_GEMINI_API_KEY。");
  }

  const geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent?key=" + encodeURIComponent(apiKey);
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema
    }
  };

  const delays = [1000, 2000, 4000, 8000];
  let lastError;

  for (let i = 0; i <= 4; i++) {
    try {
      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) throw new Error("API 發生錯誤: " + response.status);
      
      const data = await response.json();
      
      let text = null;
      if (data && data.candidates && data.candidates.length > 0) {
        if (data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.length > 0) {
          text = data.candidates[0].content.parts[0].text;
        }
      }

      if (!text) throw new Error("無回應內容");
      
      let cleanText = text.trim();
      const mdSign = String.fromCharCode(96, 96, 96); 
      
      if (cleanText.indexOf(mdSign) !== -1) {
        cleanText = cleanText.split(mdSign + "json").join("");
        cleanText = cleanText.split(mdSign).join("");
      }
      
      return JSON.parse(cleanText.trim());
    } catch (error) {
      lastError = error;
      console.error("嘗試失敗:", error);
      if (i < 4) await new Promise(resolve => setTimeout(resolve, delays[i]));
    }
  }
  throw lastError;
};

// ==========================================
// 導師專屬評語資料庫 
// ==========================================
const STRENGTH_OPTIONS = [
  { label: '📚 學習態度', theme: 'sky', options: ['聰穎靈活', '理解力強', '領悟快速', '認真專注', '勤勉好學', '主動求知', '善於思考', '舉一反三', '觀察力佳', '表達清晰', '勇於發表', '穩健進步', '頗有潛力', '積極參與', '好學好問', '思考靈活', '自主學習', '理解透徹', '主動發問', '思維敏捷', '按時繳交作業', '上課認真聽講', '積極舉手發言'] },
  { label: '🧸 個性品德', theme: 'pink', options: ['自律自覺', '中規中矩', '溫順文靜', '誠實守分', '彬彬有禮', '開朗活潑', '樂觀正面', '負責盡職', '守規矩', '做事認真', '守時守規', '穩重踏實', '心思細膩', '責任感強', '有耐心', '誠實守信', '自信堅定'] },
  { label: '🤝 團體人際', theme: 'emerald', options: ['待人和善', '人緣良好', '善解人意', '樂於助人', '熱心服務', '具領導力', '友愛同學', '願意分享', '樂於合作', '友善親切', '關心他人', '尊重他人', '相處融洽', '合作精神', '善於溝通', '關愛弱勢同學'] },
  { label: '🌱 日常生活', theme: 'amber', options: ['整潔有序', '幹部負責', '愛整潔', '服務熱忱', '打掃盡責', '使命必達', '默默做事', '維護教室整潔', '遵守班級公約', '主動打掃環境', '準時到校上課', '作業書寫整潔', '認真執行值日', '禮貌對待師長', '珍惜公物資源'] },
  { label: '🎨 專長才藝', theme: 'purple', options: ['語文能力強', '寫作天賦高', '口語表達強', '數理能力佳', '邏輯思維強', '計算能力好', '表演才能優', '美術天分佳', '音樂感佳', '運動能力強', '體能活動好', '動作協調佳', '創意思維佳', '想像力豐富', '創意點子多', '科學探究', '社會常識佳', '繪畫創意'] }
];

const WEAKNESS_OPTIONS = [
  { label: '✏️ 學習狀況', theme: 'slate', options: ['不夠認真', '欠缺專注', '怠忽學業', '理解較慢', '需多練習', '有待加強', '遲交作業', '作業待改善', '需更努力', '學習較慢', '不夠專心', '常未完成', '粗心大意', '加強閱讀', '加強字音字形', '加強應用題', '需細心', '拖延懶散', '容易分心', '作業敷衍草率', '經常遲交作業', '經常忘記帶書'] },
  { label: '🔔 行為常規', theme: 'orange', options: ['粗心健忘', '公務被動', '較被動', '常遲到', '較凌亂', '愛說話', '需看場合講話', '需引導界線', '易分心需提醒', '加強守時', '整理習慣', '上課容易遲到', '經常遺失文具', '教室大聲喧嘩', '下課衝跑碰撞', '上課愛講私語', '不愛護公共空間', '清掃避重就輕', '處理事務無章'] },
  { label: '🎭 人際情緒', theme: 'rose', options: ['內向害羞', '性格內向', '不善交際', '羞怯膽小', '不夠自律', '不太合群', '較少互動', '不善合作', '較少參與', '過於自我', '計較爭吵', '易生衝突', '較獨來獨往', '較固執', '依賴性強', '較強勢', '學習控管情緒', '缺乏自信', '缺乏耐心', '消極被動', '缺乏責任', '不善溝通', '情緒起伏大', '與同學生衝突'] }
];

// --- Main Application Component ---
export default function App() {
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true); // 新增：判斷是否正在自動捕捉帳號

  // 初始化登入狀態
  useEffect(() => {
    const initAuth = async () => {
      if (!auth) {
        setIsAuthLoading(false);
        return;
      }

      try {
        // 1. 先等待 Firebase 確認是否有上次的 Google 登入紀錄
        if (auth.authStateReady) {
          await auth.authStateReady();
        }
        
        // 2. 如果沒有捕捉到既有帳號，才建立/讀取單機版 (匿名) 帳號
        if (!auth.currentUser) {
          if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
          } else {
            await signInAnonymously(auth);
          }
        }
      } catch (err) {
        console.error("Auth init error:", err);
      }
    };
    initAuth();

    if (!auth) return undefined;
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthLoading(false); // 狀態確認完畢，關閉載入畫面
    });
    return () => unsubscribe();
  }, []);

  // 渲染載入中畫面
  if (isAuthLoading) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-pink-50 font-sans text-stone-700">
        <Loader2 size={48} className="animate-spin text-pink-500 mb-6" />
        <h2 className="text-2xl font-extrabold text-pink-800">正在自動捕捉帳號...</h2>
        <p className="text-pink-600 mt-2 font-medium">系統正在為您確認雲端進度，請稍候</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-pink-50 font-sans text-stone-700 overflow-x-hidden overflow-y-auto">
      <header className="bg-white border-b border-pink-100 px-5 md:px-8 py-4 flex justify-between items-center sticky top-0 z-40 shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-pink-400 p-2 rounded-xl shadow-sm shrink-0">
            <Heart className="w-6 h-6 text-white" />
          </div>
          <div className="flex flex-col md:flex-row md:items-center md:gap-3">
            <h1 className="text-xl md:text-2xl font-extrabold text-pink-800 tracking-wide">
              班級導師評語生成系統
            </h1>
          </div>
        </div>
        <div className="text-sm font-bold text-pink-600 bg-pink-50 px-3 py-1.5 rounded-full flex items-center gap-1.5 border border-pink-200">
           {user && !user.isAnonymous ? <><Cloud size={16}/> 雲端同步中</> : <><User size={16}/> 單機版 (免登入)</>}
        </div>
      </header>
      <main className="flex-1 p-4 md:p-8 w-full relative">
        <ReportCardView user={user} />
      </main>
    </div>
  );
}

// ==========================================
// 學生評語產生器 (ReportCardView)
// ==========================================
function ReportCardView({ user }) {
  // 核心狀態：學生陣列。結構 [{ name: string, strengths: string, weaknesses: string, result: object | null }]
  const [students, setStudents] = useState([]);
  const [activeStudentName, setActiveStudentName] = useState('');
  
  // 編輯面板狀態 (跟隨 activeStudentName 切換)
  const [strengths, setStrengths] = useState('');
  const [weaknesses, setWeaknesses] = useState('');
  const [result, setResult] = useState(null);

  const [tone, setTone] = useState('溫暖鼓勵 (多用正向語言)');
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [regeneratingKeys, setRegeneratingKeys] = useState({});
  const [showConfirm, setShowConfirm] = useState(false);
  const [showStudentModal, setShowStudentModal] = useState(false);

  const [activeStrengthTab, setActiveStrengthTab] = useState(0);
  const [activeWeaknessTab, setActiveWeaknessTab] = useState(0);
  const [customStrength, setCustomStrength] = useState('');
  const [customWeakness, setCustomWeakness] = useState('');

  // 1. 監聽 Firebase 資料；未設定 Firebase 時改用本機瀏覽器儲存
  useEffect(() => {
    if (!user || !db) {
      try {
        const savedData = window.localStorage.getItem(LOCAL_STORAGE_KEY);
        if (savedData) {
          const parsed = JSON.parse(savedData);
          setStudents(parsed.students || []);
        }
      } catch (error) {
        console.error("Local storage load error:", error);
      }
      return;
    }

    const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'classData', 'main');
    const unsub = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const loadedStudents = docSnap.data().students || [];
        setStudents(loadedStudents);
      }
    }, (error) => console.error("Firestore error:", error));
    return () => unsub();
  }, [user]);

  // 2. 當切換選擇的學生時，將該學生的資料載入編輯面板
  useEffect(() => {
    if (activeStudentName) {
      const student = students.find(s => s.name === activeStudentName);
      if (student) {
        setStrengths(student.strengths || '');
        setWeaknesses(student.weaknesses || '');
        setResult(student.result || null);
      }
    } else {
      setStrengths(''); setWeaknesses(''); setResult(null);
    }
    // 每次切換重設 Tab
    setActiveStrengthTab(0);
    setActiveWeaknessTab(0);
    setErrorMsg('');
  }, [activeStudentName]); 

  // 3. 儲存資料到 Firebase (通用的更新與上傳函式)
  const updateStudentData = async (updatedFields) => {
    if (!activeStudentName) return;
    
    // 更新本地狀態
    const newStudents = students.map(s => 
      s.name === activeStudentName ? { ...s, ...updatedFields } : s
    );
    setStudents(newStudents);
    
    // 寫入雲端 (單機版即寫入匿名使用者的雲端存檔，與本機綁定)
    if (user && db) {
      try {
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'classData', 'main'), { students: newStudents });
      } catch (err) {
        console.error("儲存失敗", err);
      }
    } else {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ students: newStudents }));
    }
  };

  // Google 登入功能 (支援無縫綁定單機版資料)
  const handleGoogleLogin = async () => {
    if (!auth) {
      setErrorMsg("尚未設定 Firebase，暫時無法使用 Google 登入與雲端同步。");
      return;
    }

    try {
      const provider = new GoogleAuthProvider();
      if (user && user.isAnonymous) {
        try {
          // 嘗試將單機版進度綁定至 Google 帳號
          await linkWithPopup(user, provider);
        } catch (linkErr) {
          // 如果該 Google 帳號已被使用，則切換登入
          if (linkErr.code === 'auth/credential-already-in-use' || linkErr.code === 'auth/email-already-in-use') {
            await signInWithPopup(auth, provider);
          } else {
            console.error("綁定失敗", linkErr);
            setErrorMsg("登入失敗，請確認您的設定或稍後再試。");
          }
        }
      } else {
        await signInWithPopup(auth, provider);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("登入失敗，請確認您的設定或稍後再試。");
    }
  };

  // 文字切換功能 (選取/取消選取)
  const toggleText = (setter, text, fieldName, currentValue) => {
    const currentArray = (currentValue || '').split(/[,，、]+/).map(s => s.trim()).filter(Boolean);
    let newArray;
    
    if (currentArray.includes(text)) {
      newArray = currentArray.filter(item => item !== text);
    } else {
      newArray = [...currentArray, text];
    }
    
    const newValue = newArray.join('、');
    setter(newValue);
    updateStudentData({ [fieldName]: newValue });
  };

  // 手動輸入優缺點，同步儲存
  const handleTraitTextChange = (field, value) => {
    if (field === 'strengths') setStrengths(value);
    if (field === 'weaknesses') setWeaknesses(value);
    updateStudentData({ [field]: value });
  };

  const handleGenerate = async () => {
    if (!activeStudentName) {
      setErrorMsg("請先選擇或匯入一位學生！"); return;
    }
    if (!strengths.trim() && !weaknesses.trim()) {
      setErrorMsg("請至少填寫一項優點或待改進事項！"); return;
    }
    setIsGenerating(true);
    setResult(null);
    setErrorMsg('');

    try {
      let displayName = activeStudentName;
      if (displayName && displayName.length > 2) {
        displayName = displayName.slice(-2);
      }

      const studentRule = "5. ⚠️ 【極度重要稱謂規定】：這是直接對著學生說話的評語。請在開頭親切稱呼「" + displayName + "」，並在文中適時使用「" + displayName + "」或「你」。絕對不要用第三人稱「他/她」。";

      const promptLines = [
        "你是一位經驗豐富、充滿教育熱忱且親切溫暖的班級導師。請幫我撰寫學生的「期末/期中綜合表現評語」或「聯絡簿精要小語」。",
        "【學生特質】",
        "- 優點/亮點：" + (strengths || "無特別提及"),
        "- 待改進/建議：" + (weaknesses || "無特別提及"),
        "- 期望語氣：" + tone,
        "",
        "【撰寫要求】",
        "1. 將上述條列式的特質，擴寫轉化為專業、流暢、溫暖得體的教育用語。",
        "2. 必須採用「三明治回饋法」（先肯定優點 -> 再提出建議改進 -> 最後給予正向期許）。",
        "3. 避免過度嚴厲的批評，以「正向期許」和「具體建議」代替指責。",
        "4. 絕對純文字輸出，請勿使用 Markdown 語法。",
        studentRule,
        "",
        "請回傳 JSON 格式，包含四個不同長度與風格的版本：",
        "1. warm: 溫暖細膩版（字數約 80-120 字，語氣充滿愛與支持，細節描述多）。",
        "2. objective: 專業客觀版（字數約 80-120 字，語氣中立，著重具體事實與改善策略）。",
        "3. concise: 簡明扼要版（字數約 40-60 字以內，精煉濃縮，適合字數限制嚴格的校務系統）。",
        "4. detailed: 詳盡完整版（字數約 150-200 字，深度擴寫特質，提供詳盡的未來發展建議）。"
      ];

      const schema = {
        type: "OBJECT",
        properties: { warm: { type: "STRING" }, objective: { type: "STRING" }, concise: { type: "STRING" }, detailed: { type: "STRING" } },
        required: ["warm", "objective", "concise", "detailed"]
      };

      const parsedData = await fetchFromGemini(promptLines.join('\n'), schema);
      
      setResult(parsedData);
      await updateStudentData({ result: parsedData });

    } catch (e) {
      setErrorMsg("生成失敗: " + (e.message || "請稍後再試"));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegenerate = async (key, typeName, customLength) => {
    setRegeneratingKeys(prev => Object.assign({}, prev, { [key]: true }));
    try {
      let lengthReq = key === 'concise' ? "字數約 40-60 字以內" : (key === 'detailed' ? "字數約 150-200 字" : "字數約 80-120 字");
      if (customLength && parseInt(customLength, 10) > 0) lengthReq = "【必須嚴格限制在 " + customLength + " 字左右】";

      let displayName = activeStudentName;
      if (displayName && displayName.length > 2) displayName = displayName.slice(-2);

      const studentRule = "⚠️ 務必在開頭稱呼「" + displayName + "」，後續使用「" + displayName + "」或「你」，絕不用第三人稱「他/她」。";
      
      const promptLines = [
        "你是一位經驗豐富的班級導師。請幫我重新撰寫學生的綜合表現評語。",
        "優點：" + strengths + " | 待改進：" + weaknesses,
        "要求：請撰寫全新的【" + typeName + "】版本。限制：" + lengthReq + "。採用三明治回饋法。絕對純文字輸出，請勿使用 Markdown 語法。",
        studentRule
      ];
      
      const schema = { type: "OBJECT", properties: { reply: { type: "STRING" } }, required: ["reply"] };
      const parsedData = await fetchFromGemini(promptLines.join('\n'), schema);
      
      if (parsedData && parsedData.reply) {
        const updatedResult = { ...result, [key]: parsedData.reply };
        setResult(updatedResult);
        await updateStudentData({ result: updatedResult });
      }
    } catch (error) { 
      console.error(error); setErrorMsg("重寫失敗，請稍後再試");
    } finally { 
      setRegeneratingKeys(prev => Object.assign({}, prev, { [key]: false })); 
    }
  };

  const handleResultManualEdit = (key, newText) => {
    if (!result) return;
    const updatedResult = { ...result, [key]: newText };
    setResult(updatedResult);
    updateStudentData({ result: updatedResult });
  };

  const executeClear = () => { 
    setStrengths(''); setWeaknesses(''); setResult(null); setErrorMsg(''); setShowConfirm(false); 
    updateStudentData({ strengths: '', weaknesses: '', result: null });
  };

  return (
    <div className="max-w-[1600px] w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 h-full relative">
      
      {/* ======================================= */}
      {/* 左側欄：登入與名單 (視窗捲動時自動固定)  */}
      {/* ======================================= */}
      <div className="lg:col-span-4 xl:col-span-3 flex flex-col gap-4 lg:sticky lg:top-24 lg:h-[calc(100vh-7rem)] lg:self-start z-10">
        
        {/* 第一步：登入狀態與單機版說明 */}
        <div className="bg-white border border-pink-200 rounded-2xl p-5 shadow-sm shrink-0">
          <label className="block text-base font-extrabold text-pink-800 mb-3 flex items-center gap-2">
            <User size={20} className="text-pink-500" /> 第一步：系統使用模式
          </label>
          <div className="flex flex-col gap-3">
            {user && !user.isAnonymous ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
                 <div className="flex items-center gap-3">
                   <div className="w-10 h-10 bg-emerald-200 rounded-full flex items-center justify-center font-bold text-emerald-700">
                      {user.displayName ? user.displayName.charAt(0) : 'T'}
                   </div>
                   <div>
                     <p className="font-bold text-emerald-800 text-sm">已連接雲端，進度自動同步</p>
                     <p className="text-xs text-emerald-600 font-medium">帳號：{user.email || '已綁定'}</p>
                   </div>
                 </div>
                 <Check className="text-emerald-500" />
              </div>
            ) : (
              <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 flex flex-col gap-3">
                 <div className="flex items-center gap-2">
                   <div className="w-8 h-8 bg-stone-200 rounded-full flex items-center justify-center text-stone-600 shrink-0"><User size={16}/></div>
                   <p className="font-bold text-stone-700 text-sm">目前為「單機版」模式 (免登入)</p>
                 </div>
                 <p className="text-xs text-stone-600 font-medium leading-relaxed">
                   您可以直接使用，進度將自動保存在<strong className="text-pink-600">這台電腦的瀏覽器</strong>中。若希望跨裝置使用，可隨時連結 Google 帳號。
                 </p>
                 <button onClick={handleGoogleLogin} className="flex justify-center items-center gap-2 bg-white border border-stone-300 hover:bg-stone-100 text-stone-700 font-bold py-2 rounded-xl transition-colors shadow-sm text-xs mt-1">
                    <LogIn size={16} /> 連結 Google 帳號 (可保留目前進度)
                 </button>
              </div>
            )}
          </div>
        </div>

        {/* 第二步：名單進度 */}
        <div className="bg-white border border-pink-200 rounded-2xl p-5 shadow-sm flex flex-col flex-1 overflow-hidden min-h-[300px]">
          <div className="flex justify-between items-center mb-3 shrink-0">
            <label className="text-base font-extrabold text-pink-800 flex items-center gap-2">
              <Users size={20} className="text-pink-500" /> 第二步：班級名單與進度
            </label>
            <button onClick={() => setShowStudentModal(true)} className="text-sm bg-pink-100 hover:bg-pink-200 text-pink-700 px-3 py-1.5 rounded-full font-bold transition-colors shadow-sm flex items-center gap-1">
              <Plus size={14} /> 匯入
            </button>
          </div>
          
          {students.length > 0 ? (
            <div className="bg-stone-50 rounded-xl p-3 border border-stone-200 flex-1 overflow-y-auto">
               <div className="flex flex-wrap gap-2">
                 {students.map(s => {
                   const isDone = !!s.result;
                   const isActive = s.name === activeStudentName;
                   return (
                     <button
                       key={s.name}
                       onClick={() => setActiveStudentName(s.name)}
                       className={`px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-all shadow-sm
                         ${isActive ? 'ring-2 ring-pink-500 transform scale-105' : 'hover:bg-opacity-80'}
                         ${isDone ? (isActive ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-emerald-50 border border-emerald-200 text-emerald-700') 
                                  : (isActive ? 'bg-white border-pink-200 text-stone-700' : 'bg-white border border-stone-200 text-stone-600')}`}
                     >
                       {s.name} {isDone && <Check size={14} className="text-emerald-500" />}
                     </button>
                   );
                 })}
               </div>
            </div>
          ) : (
            <div className="text-sm text-pink-600/80 font-bold bg-pink-50 p-4 rounded-xl border border-pink-100 text-center cursor-pointer hover:bg-pink-100 transition-colors mt-2" onClick={() => setShowStudentModal(true)}>
              點擊右上角「匯入」開始建立您的班級！✨
            </div>
          )}
        </div>
      </div>
      
      {/* ======================================= */}
      {/* 右側欄：特質分析與評語結果 (佔用更大面積) */}
      {/* ======================================= */}
      <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-6 pb-16">
        
        {/* 第三步：點選學生特質 */}
        <div className="bg-white rounded-2xl shadow-sm border border-pink-100 p-5 md:p-6 flex flex-col relative shrink-0">
          
          {!activeStudentName && (
             <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center rounded-2xl">
                <div className="bg-pink-100 text-pink-700 px-6 py-4 rounded-full font-extrabold shadow-md flex items-center gap-2 text-lg animate-pulse">
                   <AlertCircle /> 請先從左側清單選擇一位學生，即可開始編輯
                </div>
             </div>
          )}

          <div className="flex justify-between items-center mb-4 border-b border-pink-100 pb-3 shrink-0">
            <label className="font-extrabold text-pink-800 flex items-center gap-2 text-lg">
              <Sparkles className="text-pink-400" size={22} /> 第三步：特質分析 {activeStudentName && <span className="text-pink-500 bg-pink-50 px-3 py-0.5 rounded-lg border border-pink-200">({activeStudentName})</span>}
            </label>
            {(strengths || weaknesses || result) && activeStudentName && (
              <button onClick={() => setShowConfirm(true)} className="text-pink-800 hover:text-rose-500 flex items-center gap-1 text-sm font-bold bg-pink-50 hover:bg-rose-50 px-3 py-2 rounded-full border border-pink-100 transition-colors">
                <Trash2 size={14} /> 清空此生內容
              </button>
            )}
          </div>
          
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">
            <div className="bg-sky-50 border border-sky-100 p-4 rounded-xl shadow-sm flex flex-col">
              <label className="block text-sm font-extrabold text-sky-700 mb-3 flex items-center gap-1.5">🌟 優點 / 值得肯定之處</label>
              <TraitSelector 
                options={STRENGTH_OPTIONS} activeTab={activeStrengthTab} setActiveTab={setActiveStrengthTab} 
                toggleFn={(text) => toggleText(setStrengths, text, 'strengths', strengths)}
                currentText={strengths}
                customValue={customStrength} setCustomValue={setCustomStrength}
                handleCustomAdd={() => { if(customStrength.trim()){ toggleText(setStrengths, customStrength.trim(), 'strengths', strengths); setCustomStrength(''); } }}
                type="優點"
              />
              <div className="mt-3 relative flex-1 flex flex-col">
                <textarea 
                  className="w-full bg-white border border-sky-200 rounded-xl p-3 focus:ring-2 focus:ring-sky-200 outline-none resize-none h-24 text-stone-700 text-sm font-medium" 
                  placeholder="點擊上方標籤，或在此自由編輯優點..." 
                  value={strengths} onChange={(e) => handleTraitTextChange('strengths', e.target.value)} 
                />
              </div>
            </div>

            <div className="bg-orange-50 border border-orange-100 p-4 rounded-xl shadow-sm flex flex-col">
              <label className="block text-sm font-extrabold text-orange-700 mb-3 flex items-center gap-1.5">🌱 待改進 / 需引導之處</label>
              <TraitSelector 
                options={WEAKNESS_OPTIONS} activeTab={activeWeaknessTab} setActiveTab={setActiveWeaknessTab} 
                toggleFn={(text) => toggleText(setWeaknesses, text, 'weaknesses', weaknesses)}
                currentText={weaknesses}
                customValue={customWeakness} setCustomValue={setCustomWeakness}
                handleCustomAdd={() => { if(customWeakness.trim()){ toggleText(setWeaknesses, customWeakness.trim(), 'weaknesses', weaknesses); setCustomWeakness(''); } }}
                type="待加強"
              />
              <div className="mt-3 relative flex-1 flex flex-col">
                <textarea 
                  className="w-full bg-white border border-orange-200 rounded-xl p-3 focus:ring-2 focus:ring-orange-200 outline-none resize-none h-24 text-stone-700 text-sm font-medium" 
                  placeholder="點擊上方標籤，或在此自由編輯待加強處..." 
                  value={weaknesses} onChange={(e) => handleTraitTextChange('weaknesses', e.target.value)} 
                />
              </div>
            </div>
          </div>

          <div className="bg-pink-50/70 rounded-xl border border-pink-100 p-4 flex flex-col xl:flex-row gap-5 items-end">
            <div className="flex-1 w-full">
              <label className="block text-sm font-extrabold text-pink-800 mb-3 flex items-center gap-1.5"><Heart size={16} /> 希望的總結語氣</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {['溫暖鼓勵 (多用正向語言)', '嚴謹期許 (強調紀律與未來表現)', '客觀平實 (僅陳述具體事實)'].map(t => (
                  <label key={t} className={"flex items-center gap-2 px-3 py-3 rounded-xl border-2 cursor-pointer transition-all " + (tone === t ? "bg-white border-pink-400 text-pink-700 shadow-sm font-bold transform scale-[1.02]" : "bg-white/60 border-pink-100 text-pink-800 hover:bg-white")}>
                    <div className={"w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center " + (tone === t ? "border-pink-400 bg-pink-400" : "border-pink-200 bg-white")}>
                      {tone === t && <div className="w-2 h-2 bg-white rounded-full"></div>}
                    </div>
                    <input type="radio" name="tone" checked={tone === t} onChange={() => setTone(t)} className="hidden" />
                    <span className="text-xs font-bold leading-snug">{t}</span>
                  </label>
                ))}
              </div>
            </div>
            <button onClick={handleGenerate} disabled={isGenerating || (!strengths.trim() && !weaknesses.trim()) || !activeStudentName} className="xl:w-64 w-full h-[3.25rem] bg-pink-500 hover:bg-pink-600 disabled:bg-pink-200 text-white font-bold rounded-xl shadow-md flex justify-center items-center gap-2 text-lg shrink-0 transition-transform active:scale-95">
              {isGenerating ? <><Loader2 className="animate-spin" size={22} /> 腦力激盪中...</> : <><Sparkles size={22} /> 一鍵生成評語</>}
            </button>
          </div>
        </div>

        {/* ======================================= */}
        {/* 第四步：評語產出結果 (顯示在特質區塊下方)  */}
        {/* ======================================= */}
        
        {errorMsg && <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 md:p-5 text-rose-700 flex items-center gap-3 shadow-sm mt-2"><AlertCircle size={24} className="shrink-0" /><p className="font-bold text-sm md:text-base">{errorMsg}</p></div>}
        
        {!result && !isGenerating && !errorMsg ? (
           <div className="bg-white bg-opacity-50 rounded-3xl border-2 border-pink-200 border-dashed min-h-[16rem] flex flex-col items-center justify-center text-pink-800 p-8 text-center mt-2">
             <div className="bg-pink-100 p-5 rounded-full mb-4"><Award size={40} className="text-pink-400" /></div>
             <p className="font-extrabold text-xl text-pink-800">
               {activeStudentName ? `「${activeStudentName}」的特質選好了嗎？` : '點選名單開始撰寫'}
             </p>
             <p className="mt-3 text-sm md:text-base font-medium leading-relaxed max-w-sm text-pink-800/80">
               {activeStudentName ? '點擊上方的「一鍵生成評語」按鈕，AI 會自動幫您將特質轉化為不同風格的專業評語，並顯示在這裡！' : '系統會用顏色自動幫您追蹤班上哪些學生還沒寫完喔！'}
             </p>
           </div>
        ) : isGenerating ? (
           <div className="bg-white rounded-3xl border border-pink-100 min-h-[16rem] flex flex-col items-center justify-center text-pink-400 p-8 text-center shadow-sm mt-2">
             <Loader2 size={48} className="animate-spin mb-5" />
             <p className="font-extrabold text-lg">正在為 {activeStudentName} 斟酌最溫暖的教育詞彙...</p>
           </div>
        ) : (
          <div className="bg-white p-4 md:p-6 rounded-3xl shadow-sm border border-pink-100 space-y-6 mt-2 relative">
            <div className="flex items-center gap-3 px-2 pb-3 border-b border-pink-100 sticky top-0 bg-white z-10 pt-2">
              <div className="w-10 h-10 bg-pink-100 rounded-full flex items-center justify-center font-bold text-pink-500 shrink-0"><FileText size={20}/></div>
              <div>
                <h3 className="font-extrabold text-pink-800 text-lg leading-tight">
                  {activeStudentName} 的專屬評語
                </h3>
                <p className="text-xs text-pink-600 font-bold flex items-center gap-1 mt-1"><Edit size={12}/> 點擊文字框可直接微調，修改後自動儲存</p>
              </div>
            </div>

            {result && result.warm && <DocCard type="🌸 溫暖細膩版 (聯絡簿)" text={result.warm} onRegenerate={(customLen) => handleRegenerate('warm', '溫暖細膩版', customLen)} isRegenerating={regeneratingKeys['warm']} onSaveEdit={(val) => handleResultManualEdit('warm', val)} />}
            {result && result.objective && <DocCard type="📊 專業客觀版 (成績單)" text={result.objective} onRegenerate={(customLen) => handleRegenerate('objective', '專業客觀版', customLen)} isRegenerating={regeneratingKeys['objective']} onSaveEdit={(val) => handleResultManualEdit('objective', val)} />}
            {result && result.concise && <DocCard type="⚡ 簡明扼要版 (字數精簡)" text={result.concise} onRegenerate={(customLen) => handleRegenerate('concise', '簡明扼要版', customLen)} isRegenerating={regeneratingKeys['concise']} onSaveEdit={(val) => handleResultManualEdit('concise', val)} />}
            {result && result.detailed && <DocCard type="📖 詳盡完整版 (深度期許)" text={result.detailed} onRegenerate={(customLen) => handleRegenerate('detailed', '詳盡完整版', customLen)} isRegenerating={regeneratingKeys['detailed']} onSaveEdit={(val) => handleResultManualEdit('detailed', val)} />}
          </div>
        )}
      </div>

      <ConfirmDialog isOpen={showConfirm} message={`確定要清空「${activeStudentName}」的設定嗎？`} onConfirm={executeClear} onCancel={() => setShowConfirm(false)} />
      
      <StudentListModal 
        isOpen={showStudentModal} 
        onClose={() => setShowStudentModal(false)} 
        students={students} 
        setStudents={(newList) => {
          setStudents(newList);
          if (user && db) setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'classData', 'main'), { students: newList });
          if (!user || !db) window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ students: newList }));
        }} 
      />
    </div>
  );
}

// 評語專用的文件卡片 UI 
function DocCard({ type, text, onRegenerate, isRegenerating, onSaveEdit }) {
  const [copied, setCopied] = useState(false);
  const initialText = cleanAsterisks(typeof text === 'object' ? JSON.stringify(text) : text) || '';
  const [localText, setLocalText] = useState(initialText);
  const [targetWordCount, setTargetWordCount] = useState(''); 

  // 當外部傳入的文字改變時更新 (例如切換學生)
  useEffect(() => {
    setLocalText(cleanAsterisks(typeof text === 'object' ? JSON.stringify(text) : text) || '');
  }, [text]);

  const handleCopy = () => { 
    copyToClipboard(localText, () => { 
      setCopied(true); setTimeout(() => setCopied(false), 2000); 
    }); 
  };

  const handleBlur = () => {
    if (onSaveEdit && localText !== initialText) {
       onSaveEdit(localText);
    }
  };

  const textLength = localText ? localText.length : 0;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-pink-100 overflow-hidden flex flex-col focus-within:border-pink-400 focus-within:shadow-md focus-within:ring-2 focus-within:ring-pink-100">
      <div className="bg-pink-50 px-4 py-3 border-b border-pink-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-pink-800 text-sm md:text-base">{type}</span>
          <span className="bg-pink-100 text-pink-600 text-xs font-bold px-2 py-1 rounded-full border border-pink-200">
            {textLength} 字
          </span>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
           {onRegenerate && (
            <div className="flex items-center gap-1 bg-white border border-pink-200 rounded-full px-2 py-1 shadow-sm focus-within:border-pink-400 focus-within:ring-1 focus-within:ring-pink-200">
              <span className="text-xs text-pink-800 font-bold shrink-0 ml-1">字數:</span>
              <input type="number" value={targetWordCount} onChange={(e) => setTargetWordCount(e.target.value)} placeholder="預設" min="10" className="w-10 text-xs text-center outline-none bg-transparent text-pink-600 font-bold" />
            </div>
          )}
           {onRegenerate && (
            <button onClick={() => onRegenerate(targetWordCount)} disabled={isRegenerating} className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full text-pink-800 border border-transparent hover:bg-pink-100 hover:border-pink-200 disabled:opacity-50 shrink-0">
              <RefreshCw size={13} className={isRegenerating ? "animate-spin text-pink-400" : ""} /> 重寫
            </button>
          )}
          <button onClick={handleCopy} className={"flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border shrink-0 " + (copied ? "bg-emerald-500 border-emerald-500 text-white shadow-sm" : "bg-pink-400 border-pink-400 text-white shadow-sm hover:bg-pink-500")}>
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? '已複製！' : '複製'}
          </button>
        </div>
      </div>
      <div className="p-4 md:p-5 flex bg-white">
        <textarea
          value={localText}
          onChange={(e) => setLocalText(e.target.value)}
          onBlur={handleBlur}
          className="w-full bg-transparent outline-none resize-none text-sm md:text-base leading-loose font-medium text-stone-700 min-h-[8rem]"
          placeholder="您可以在這裡直接修改文字，點擊框外會自動為您存檔..."
          spellCheck="false"
        />
      </div>
    </div>
  );
}

// ==========================================
// 可重複使用的特質選擇區塊元件 
// ==========================================
function TraitSelector({ options, activeTab, setActiveTab, toggleFn, currentText, customValue, setCustomValue, handleCustomAdd, type }) {
  if (!options || options.length === 0) return null;
  const safeTab = (activeTab >= 0 && activeTab < options.length) ? activeTab : 0;
  const currentGroup = options[safeTab];

  // 顏色對照表：管理選中(active)與未選中(inactive)的樣式
  const colorMap = {
    'sky': { active: 'bg-sky-500 text-white border-sky-600 shadow-md transform scale-105', inactive: 'bg-white text-sky-700 border-sky-200 hover:bg-sky-50' },
    'pink': { active: 'bg-pink-500 text-white border-pink-600 shadow-md transform scale-105', inactive: 'bg-white text-pink-700 border-pink-200 hover:bg-pink-50' },
    'emerald': { active: 'bg-emerald-500 text-white border-emerald-600 shadow-md transform scale-105', inactive: 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50' },
    'amber': { active: 'bg-amber-500 text-white border-amber-600 shadow-md transform scale-105', inactive: 'bg-white text-amber-700 border-amber-200 hover:bg-amber-50' },
    'purple': { active: 'bg-purple-500 text-white border-purple-600 shadow-md transform scale-105', inactive: 'bg-white text-purple-700 border-purple-200 hover:bg-purple-50' },
    'slate': { active: 'bg-slate-500 text-white border-slate-600 shadow-md transform scale-105', inactive: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50' },
    'orange': { active: 'bg-orange-500 text-white border-orange-600 shadow-md transform scale-105', inactive: 'bg-white text-orange-700 border-orange-200 hover:bg-orange-50' },
    'rose': { active: 'bg-rose-500 text-white border-rose-600 shadow-md transform scale-105', inactive: 'bg-white text-rose-700 border-rose-200 hover:bg-rose-50' },
  };

  // 解析目前的文字，找出已經選取的項目
  const selectedItems = (currentText || '').split(/[,，、]+/).map(s => s.trim()).filter(Boolean);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5 border-b border-pink-100 pb-2">
        {options.map((group, idx) => (
          <button key={idx} onClick={() => setActiveTab(idx)} className={"px-3 py-1.5 rounded-full text-xs font-bold transition-colors " + (safeTab === idx ? "bg-pink-400 text-white shadow-md" : "bg-white text-pink-800 border border-pink-100 hover:bg-pink-50")}>
            {group.label}
          </button>
        ))}
      </div>
      
      <div className="flex flex-wrap gap-2 p-1">
        {currentGroup && currentGroup.options && currentGroup.options.map((opt, i) => {
          const isSelected = selectedItems.includes(opt);
          const themeClass = colorMap[currentGroup.theme] || colorMap['slate'];
          const btnClass = isSelected ? themeClass.active : themeClass.inactive;

          return (
            <button 
              key={i} 
              onClick={() => toggleFn(opt)} 
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all duration-200 ${btnClass}`}
            >
              {opt}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 mt-1">
        <input type="text" placeholder={"找不到特質？自己輸入" + type + "... (按 Enter 加入)"} value={customValue} onChange={e => setCustomValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCustomAdd()} className={"flex-1 text-xs rounded-full px-4 py-2 outline-none border focus:ring-2 font-medium shadow-sm " + (type === '優點' ? "border-sky-200 focus:ring-sky-200 bg-sky-50" : "border-orange-200 focus:ring-orange-200 bg-orange-50")} />
        <button onClick={handleCustomAdd} disabled={!customValue.trim()} className={"p-2.5 rounded-full text-white shadow-sm disabled:opacity-50 " + (type === '優點' ? "bg-sky-400 hover:bg-sky-500" : "bg-orange-400 hover:bg-orange-500")}>
          <Plus size={16} strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}

// --- Shared UI Components ---

function ConfirmDialog({ isOpen, message, onConfirm, onCancel }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-20 z-50 flex items-center justify-center p-4">
       <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl border border-pink-100">
         <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mb-5 mx-auto">
           <AlertTriangle className="text-rose-400 w-8 h-8" />
         </div>
         <p className="text-pink-800 font-extrabold text-lg text-center mb-8">{message}</p>
         <div className="flex justify-center gap-4">
           <button onClick={onCancel} className="flex-1 py-3 rounded-xl bg-stone-100 text-stone-500 font-bold hover:bg-stone-200">保留</button>
           <button onClick={onConfirm} className="flex-1 py-3 rounded-xl bg-rose-400 text-white font-bold hover:bg-rose-500 shadow-md">確定清空</button>
         </div>
       </div>
    </div>
  );
}

function StudentListModal({ isOpen, onClose, students, setStudents }) {
  const [inputText, setInputText] = useState('');

  useEffect(() => {
    if (isOpen) {
      setInputText(students.map(s => s.name).join('\n'));
    }
  }, [isOpen, students]);

  if (!isOpen) return null;

  const handleSave = () => {
    const excludedWords = ['姓名', '座號', '姓', '名', '座', '號'];
    const parsedList = inputText.split(/[\n\t\s,，、]+/).map(s => s.trim()).filter(s => s.length > 0 && isNaN(Number(s)) && excludedWords.indexOf(s) === -1);
    const uniqueList = parsedList.filter((item, index) => parsedList.indexOf(item) === index);
    
    // 合併新舊名單，保留舊生的評語紀錄
    const newStudents = uniqueList.map(name => {
       const existing = students.find(s => s.name === name);
       if (existing) return existing;
       return { name, strengths: '', weaknesses: '', result: null };
    });
    
    setStudents(newStudents);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center p-4">
       <div className="bg-white rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl border border-pink-100 flex flex-col max-h-[90vh]">
         <div className="flex justify-between items-center mb-4">
           <h3 className="text-pink-800 font-extrabold text-xl flex items-center gap-2"><Users className="text-pink-500" /> 匯入班級名單</h3>
           <button onClick={onClose} className="p-2 bg-pink-50 text-pink-500 rounded-full hover:bg-pink-100 transition-colors"><X size={20} /></button>
         </div>
         <p className="text-sm text-stone-600 font-medium mb-4 leading-relaxed"><strong className="text-pink-600">💡 支援直接貼上校務系統表格！</strong><br/>您可以直接將表格複製貼上，系統會自動過濾數字，並保留原本已有紀錄的學生資料。</p>
         <textarea value={inputText} onChange={(e) => setInputText(e.target.value)} className="flex-1 w-full bg-stone-50 border border-stone-200 rounded-xl p-4 focus:ring-2 focus:ring-pink-300 outline-none resize-none min-h-[200px] text-sm font-medium text-stone-700" placeholder="可直接貼上如：&#10;1 謝陳仕鴻 2 邱偉宸 3 黃宜淵..." />
         <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-pink-100">
           <button onClick={onClose} className="px-5 py-2.5 rounded-xl bg-stone-100 text-stone-600 font-bold hover:bg-stone-200">取消</button>
           <button onClick={handleSave} className="px-6 py-2.5 rounded-xl bg-pink-500 text-white font-bold hover:bg-pink-600 shadow-md flex items-center gap-2"><Check size={18} /> 儲存名單與進度</button>
         </div>
       </div>
    </div>
  );
}
