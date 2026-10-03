import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type AppLanguage = 'id' | 'en' | 'zh' | 'hi' | 'es' | 'ar';

export const APP_LANGUAGES: Array<{ id: AppLanguage; label: string; nativeLabel: string; flag: string; dir?: 'ltr' | 'rtl' }> = [
  { id: 'id', label: 'Bahasa Indonesia', nativeLabel: 'Indonesia', flag: '🇮🇩' },
  { id: 'en', label: 'English', nativeLabel: 'English', flag: '🇺🇸' },
  { id: 'zh', label: '中文', nativeLabel: '中文', flag: '🇨🇳' },
  { id: 'hi', label: 'हिन्दी', nativeLabel: 'हिन्दी', flag: '🇮🇳' },
  { id: 'es', label: 'Español', nativeLabel: 'Español', flag: '🇪🇸' },
  { id: 'ar', label: 'العربية', nativeLabel: 'العربية', flag: '🇸🇦', dir: 'rtl' },
];

const STORAGE_KEY = 'gain_language';

type Dictionary = Record<string, string>;
const dictionaries: Record<AppLanguage, Dictionary> = {
  id: {
    tradingMode: 'Mode Tampilan', beginner: 'Pemula', pro: 'Pro', language: 'Bahasa', glossary: 'Kamus Istilah',
    beginnerHint: 'Bahasa sederhana. Fokus pada keputusan penting tanpa istilah rumit.',
    proHint: 'Tampilan lengkap untuk pengguna yang memahami strategi, risiko, dan data mesin.',
    capitalDeployed: 'Modal Sedang Dipakai', poolExposure: 'Porsi Modal Terpakai', floatingPnl: 'Untung/Rugi Berjalan', portfolioRoi: 'Hasil Portofolio',
    gasHealth: 'Kesehatan Saldo Biaya', topUp: 'Tambah Saldo', safe: 'Aman', needsTopUp: 'Perlu Ditambah',
    takeProfit: 'Ambil Untung', closePosition: 'Tutup Posisi', forceClose: 'Tutup Sekarang', marketPrice: 'Harga Pasar Saat Ini', quantity: 'Jumlah Koin',
    confirmation: 'Konfirmasi Penjualan', sellExplanation: 'Koin akan dijual pada harga pasar terbaru. Ini menutup posisi secara manual dan tidak menunggu target otomatis.',
    warningLoss: 'Perhatian: posisi ini sedang rugi. Menutup sekarang akan merealisasikan kerugian tersebut.',
    sellNow: 'Jual Sekarang', cancel: 'Batal', executing: 'Sedang Menjual...',
    noCredentials: 'Kredensial exchange dikelola oleh server. Anda tidak perlu memasukkan API Key lagi di jendela ini.',
    exchangeTestnet: 'Exchange Testnet', exchangeLive: 'Exchange Live',
    simpleTerms: 'Istilah sederhana', technicalTerms: 'Istilah teknis',
  },
  en: {
    tradingMode: 'Display Mode', beginner: 'Beginner', pro: 'Pro', language: 'Language', glossary: 'Trading Glossary',
    beginnerHint: 'Simple language focused on important decisions without complex jargon.',
    proHint: 'Full view for users who understand strategy, risk, and engine data.',
    capitalDeployed: 'Capital in Use', poolExposure: 'Capital Exposure', floatingPnl: 'Floating P&L', portfolioRoi: 'Portfolio Return',
    gasHealth: 'Fee Balance Health', topUp: 'Add Funds', safe: 'Safe', needsTopUp: 'Needs Funds',
    takeProfit: 'Take Profit', closePosition: 'Close Position', forceClose: 'Close Now', marketPrice: 'Current Market Price', quantity: 'Coin Quantity',
    confirmation: 'Confirm Sale', sellExplanation: 'The coin will be sold at the latest market price. This manually closes the position without waiting for the automatic target.',
    warningLoss: 'Warning: this position is currently at a loss. Closing now will realize that loss.',
    sellNow: 'Sell Now', cancel: 'Cancel', executing: 'Selling...',
    noCredentials: 'Exchange credentials are managed by the server. You do not need to enter an API key in this window.',
    exchangeTestnet: 'Exchange Testnet', exchangeLive: 'Exchange Live', simpleTerms: 'Simple terms', technicalTerms: 'Technical terms',
  },
  zh: {
    tradingMode: '显示模式', beginner: '新手', pro: '专业', language: '语言', glossary: '交易术语',
    beginnerHint: '使用简单语言，重点展示重要操作，减少复杂术语。', proHint: '完整模式，适合了解策略、风险和引擎数据的用户。',
    capitalDeployed: '使用中的资金', poolExposure: '资金占用比例', floatingPnl: '浮动盈亏', portfolioRoi: '组合收益',
    gasHealth: '费用余额状态', topUp: '充值', safe: '安全', needsTopUp: '需要补充',
    takeProfit: '止盈', closePosition: '平仓', forceClose: '立即平仓', marketPrice: '当前市场价格', quantity: '币数量',
    confirmation: '确认卖出', sellExplanation: '将按最新市场价格卖出。此操作会手动平仓，不等待自动目标。', warningLoss: '注意：该仓位目前亏损，现在平仓会实现亏损。',
    sellNow: '立即卖出', cancel: '取消', executing: '正在卖出...', noCredentials: '交易所凭证由服务器管理，此窗口无需输入 API Key。',
    exchangeTestnet: '交易所测试网', exchangeLive: '交易所实盘', simpleTerms: '简单术语', technicalTerms: '专业术语',
  },
  hi: {
    tradingMode: 'दृश्य मोड', beginner: 'शुरुआती', pro: 'प्रो', language: 'भाषा', glossary: 'ट्रेडिंग शब्दावली',
    beginnerHint: 'सरल भाषा और महत्वपूर्ण निर्णयों पर ध्यान, बिना कठिन शब्दों के।', proHint: 'रणनीति, जोखिम और इंजन डेटा समझने वाले उपयोगकर्ताओं के लिए पूरा दृश्य।',
    capitalDeployed: 'उपयोग में पूंजी', poolExposure: 'पूंजी उपयोग', floatingPnl: 'चलता लाभ/हानि', portfolioRoi: 'पोर्टफोलियो रिटर्न',
    gasHealth: 'फीस बैलेंस स्थिति', topUp: 'बैलेंस जोड़ें', safe: 'सुरक्षित', needsTopUp: 'बैलेंस जोड़ें',
    takeProfit: 'लाभ लें', closePosition: 'पोज़िशन बंद करें', forceClose: 'अभी बंद करें', marketPrice: 'वर्तमान बाजार मूल्य', quantity: 'कॉइन मात्रा',
    confirmation: 'बिक्री की पुष्टि', sellExplanation: 'कॉइन नवीनतम बाजार मूल्य पर बेचा जाएगा। यह पोज़िशन को मैन्युअल रूप से बंद करता है।', warningLoss: 'चेतावनी: यह पोज़िशन अभी नुकसान में है। अभी बंद करने पर नुकसान तय हो जाएगा।',
    sellNow: 'अभी बेचें', cancel: 'रद्द करें', executing: 'बेचा जा रहा है...', noCredentials: 'एक्सचेंज क्रेडेंशियल सर्वर संभालता है। इस विंडो में API Key की जरूरत नहीं।',
    exchangeTestnet: 'एक्सचेंज टेस्टनेट', exchangeLive: 'एक्सचेंज लाइव', simpleTerms: 'सरल शब्द', technicalTerms: 'तकनीकी शब्द',
  },
  es: {
    tradingMode: 'Modo de vista', beginner: 'Principiante', pro: 'Pro', language: 'Idioma', glossary: 'Glosario de trading',
    beginnerHint: 'Lenguaje sencillo centrado en decisiones importantes sin jerga compleja.', proHint: 'Vista completa para usuarios que conocen estrategia, riesgo y datos del motor.',
    capitalDeployed: 'Capital en uso', poolExposure: 'Exposición de capital', floatingPnl: 'Pérdida/Ganancia flotante', portfolioRoi: 'Rendimiento',
    gasHealth: 'Estado del saldo de comisiones', topUp: 'Añadir saldo', safe: 'Seguro', needsTopUp: 'Necesita saldo',
    takeProfit: 'Tomar ganancias', closePosition: 'Cerrar posición', forceClose: 'Cerrar ahora', marketPrice: 'Precio de mercado actual', quantity: 'Cantidad de monedas',
    confirmation: 'Confirmar venta', sellExplanation: 'La moneda se venderá al precio de mercado actual. Esto cierra manualmente la posición.', warningLoss: 'Atención: esta posición tiene pérdidas. Cerrar ahora realizará esa pérdida.',
    sellNow: 'Vender ahora', cancel: 'Cancelar', executing: 'Vendiendo...', noCredentials: 'Las credenciales del exchange son gestionadas por el servidor. No necesitas introducir una API Key aquí.',
    exchangeTestnet: 'Exchange Testnet', exchangeLive: 'Exchange Live', simpleTerms: 'Términos simples', technicalTerms: 'Términos técnicos',
  },
  ar: {
    tradingMode: 'وضع العرض', beginner: 'مبتدئ', pro: 'احترافي', language: 'اللغة', glossary: 'قاموس التداول',
    beginnerHint: 'لغة بسيطة تركز على القرارات المهمة دون مصطلحات معقدة.', proHint: 'عرض كامل للمستخدمين الذين يفهمون الاستراتيجية والمخاطر وبيانات المحرك.',
    capitalDeployed: 'رأس المال المستخدم', poolExposure: 'نسبة استخدام رأس المال', floatingPnl: 'الربح/الخسارة العائمة', portfolioRoi: 'عائد المحفظة',
    gasHealth: 'حالة رصيد الرسوم', topUp: 'إضافة رصيد', safe: 'آمن', needsTopUp: 'يحتاج رصيدًا',
    takeProfit: 'جني الأرباح', closePosition: 'إغلاق الصفقة', forceClose: 'إغلاق الآن', marketPrice: 'سعر السوق الحالي', quantity: 'كمية العملة',
    confirmation: 'تأكيد البيع', sellExplanation: 'سيتم بيع العملة بسعر السوق الحالي. هذا يغلق الصفقة يدويًا دون انتظار الهدف التلقائي.', warningLoss: 'تنبيه: هذه الصفقة خاسرة حاليًا. إغلاقها الآن سيحقق الخسارة.',
    sellNow: 'بيع الآن', cancel: 'إلغاء', executing: 'جارٍ البيع...', noCredentials: 'بيانات اعتماد المنصة يديرها الخادم. لا تحتاج إلى إدخال API Key هنا.',
    exchangeTestnet: 'شبكة اختبار', exchangeLive: 'تداول حي', simpleTerms: 'مصطلحات مبسطة', technicalTerms: 'مصطلحات تقنية',
  },
};

type LanguageContextType = { language: AppLanguage; setLanguage: (language: AppLanguage) => void; t: (key: string) => string };
const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

function initialLanguage(): AppLanguage {
  if (typeof window === 'undefined') return 'id';
  const saved = window.localStorage.getItem(STORAGE_KEY) as AppLanguage | null;
  return saved && dictionaries[saved] ? saved : 'id';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(initialLanguage);
  const setLanguage = (next: AppLanguage) => {
    setLanguageState(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch {}
  };
  useEffect(() => {
    const lang = APP_LANGUAGES.find((item) => item.id === language);
    document.documentElement.lang = language;
    document.documentElement.dir = lang?.dir || 'ltr';
  }, [language]);
  const value = useMemo(() => ({ language, setLanguage, t: (key: string) => dictionaries[language][key] || dictionaries.id[key] || key }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used inside LanguageProvider');
  return context;
}
