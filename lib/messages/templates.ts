import type { Locale } from "@/lib/db/schema";

type Msg = { subject: string; body: string };
type Tpl<D> = Record<Locale, (d: D) => Msg>;

const app = () => process.env.APP_ORIGIN ?? "http://localhost:3000";

// One source of truth for every message EVRA sends; the Ops message centre previews and test-sends these.
export const templates = {
  signin_code: {
    en: (d: { code: string }) => ({ subject: `Your EVRA code: ${d.code}`, body: `Your sign-in code is ${d.code}. It works for 10 minutes. If you didn't ask for it, ignore this email.` }),
    ar: (d: { code: string }) => ({ subject: `رمز EVRA الخاص بك: ${d.code}`, body: `رمز الدخول الخاص بك هو ${d.code}. صالح لمدة 10 دقائق. إذا لم تطلبه، تجاهل هذه الرسالة.` }),
    hi: (d: { code: string }) => ({ subject: `आपका EVRA कोड: ${d.code}`, body: `आपका साइन-इन कोड ${d.code} है। यह 10 मिनट तक चलेगा। अगर आपने यह नहीं माँगा, तो इसे अनदेखा करें।` }),
  } satisfies Tpl<{ code: string }>,

  claim_code: {
    en: (d: { code: string; amount: string }) => ({ subject: `Code to claim ${d.amount}: ${d.code}`, body: `Enter ${d.code} to claim your payment. It works for 10 minutes.` }),
    ar: (d: { code: string; amount: string }) => ({ subject: `رمز استلام ${d.amount}: ${d.code}`, body: `أدخل ${d.code} لاستلام دفعتك. صالح لمدة 10 دقائق.` }),
    hi: (d: { code: string; amount: string }) => ({ subject: `${d.amount} पाने का कोड: ${d.code}`, body: `अपना भुगतान पाने के लिए ${d.code} डालें। यह 10 मिनट तक चलेगा।` }),
  } satisfies Tpl<{ code: string; amount: string }>,

  pay_link: {
    en: (d: { from: string; amount: string; by: string; url: string }) => ({ subject: `${d.from} sent you ${d.amount}`, body: `${d.from} sent you ${d.amount}. Claim it by ${d.by}, or it returns to them.\n\nClaim: ${d.url}` }),
    ar: (d: { from: string; amount: string; by: string; url: string }) => ({ subject: `${d.from} أرسل لك ${d.amount}`, body: `${d.from} أرسل لك ${d.amount}. استلمه قبل ${d.by}، وإلا يعود إليه.\n\nاستلم: ${d.url}` }),
    hi: (d: { from: string; amount: string; by: string; url: string }) => ({ subject: `${d.from} ने आपको ${d.amount} भेजे`, body: `${d.from} ने आपको ${d.amount} भेजे हैं। ${d.by} तक ले लें, वरना पैसा उन्हें लौट जाएगा।\n\nयहाँ लें: ${d.url}` }),
  } satisfies Tpl<{ from: string; amount: string; by: string; url: string }>,

  request_new: {
    en: (d: { from: string; type: string; url: string }) => ({ subject: `New ${d.type} request from ${d.from}`, body: `${d.from} sent you a ${d.type} request. Reply from here, no sign-in needed:\n${d.url}\n\nThis link works once and expires in 14 days.` }),
    ar: (d: { from: string; type: string; url: string }) => ({ subject: `طلب ${d.type} جديد من ${d.from}`, body: `أرسل لك ${d.from} طلب ${d.type}. يمكنك الرد من هنا بدون تسجيل دخول:\n${d.url}\n\nالرابط يعمل مرة واحدة وينتهي خلال 14 يومًا.` }),
    hi: (d: { from: string; type: string; url: string }) => ({ subject: `${d.from} से नया ${d.type} अनुरोध`, body: `${d.from} ने आपको ${d.type} अनुरोध भेजा है। बिना साइन-इन के यहाँ से जवाब दें:\n${d.url}\n\nयह लिंक एक बार चलेगा और 14 दिन में खत्म हो जाएगा।` }),
  } satisfies Tpl<{ from: string; type: string; url: string }>,

  request_reminder: {
    en: (d: { from: string; url: string }) => ({ subject: `${d.from} is waiting for your reply`, body: `A request from ${d.from} closes tomorrow. Reply in one tap: ${d.url}` }),
    ar: (d: { from: string; url: string }) => ({ subject: `${d.from} بانتظار ردك`, body: `طلب من ${d.from} يُغلق غدًا. رد بضغطة واحدة: ${d.url}` }),
    hi: (d: { from: string; url: string }) => ({ subject: `${d.from} आपके जवाब का इंतज़ार कर रहे हैं`, body: `${d.from} का अनुरोध कल बंद हो जाएगा। एक टैप में जवाब दें: ${d.url}` }),
  } satisfies Tpl<{ from: string; url: string }>,

  request_no_response: {
    en: (d: { creator: string }) => ({ subject: `${d.creator} didn't reply in time`, body: `Your request to ${d.creator} closed after 7 days without a reply. No credits were refunded for unfunded requests; funded offers never use credits.` }),
    ar: (d: { creator: string }) => ({ subject: `لم يرد ${d.creator} في الوقت المحدد`, body: `أُغلق طلبك إلى ${d.creator} بعد 7 أيام بدون رد.` }),
    hi: (d: { creator: string }) => ({ subject: `${d.creator} ने समय पर जवाब नहीं दिया`, body: `${d.creator} को भेजा आपका अनुरोध 7 दिन बिना जवाब के बंद हो गया।` }),
  } satisfies Tpl<{ creator: string }>,

  manager_invite: {
    en: (d: { creator: string; url: string }) => ({ subject: `${d.creator} added you as their manager on EVRA`, body: `${d.creator} wants you copied on their brand requests. Accept here: ${d.url}` }),
    ar: (d: { creator: string; url: string }) => ({ subject: `${d.creator} أضافك كمدير أعمال على EVRA`, body: `يريد ${d.creator} إشراكك في طلبات العلامات التجارية. اقبل من هنا: ${d.url}` }),
    hi: (d: { creator: string; url: string }) => ({ subject: `${d.creator} ने आपको EVRA पर मैनेजर बनाया`, body: `${d.creator} चाहते हैं कि ब्रांड अनुरोधों में आप भी शामिल रहें। यहाँ स्वीकार करें: ${d.url}` }),
  } satisfies Tpl<{ creator: string; url: string }>,

  kit_claim_invite: {
    en: (d: { name: string; url: string }) => ({ subject: `${d.name}, your EVRA media kit is ready to claim`, body: `We drafted a private media kit for you from your public profile. Nobody else can see it. Claim it, change anything, or delete it: ${d.url}\n\nIf you don't claim it, it is deleted automatically after 90 days.` }),
    ar: (d: { name: string; url: string }) => ({ subject: `${d.name}، ملفك الإعلامي على EVRA جاهز`, body: `أعددنا لك ملفًا إعلاميًا خاصًا من ملفك العام. لا يراه أحد غيرك. استلمه أو عدّله أو احذفه: ${d.url}\n\nإذا لم تستلمه، يُحذف تلقائيًا بعد 90 يومًا.` }),
    hi: (d: { name: string; url: string }) => ({ subject: `${d.name}, आपकी EVRA मीडिया किट तैयार है`, body: `हमने आपकी पब्लिक प्रोफ़ाइल से आपके लिए एक प्राइवेट मीडिया किट बनाई है। इसे कोई और नहीं देख सकता। इसे लें, बदलें या हटाएँ: ${d.url}\n\nअगर आप इसे नहीं लेते, तो 90 दिन बाद यह अपने-आप हट जाएगी।` }),
  } satisfies Tpl<{ name: string; url: string }>,

  deal_update: {
    en: (d: { title: string; what: string; url: string }) => ({ subject: `${d.title}: ${d.what}`, body: `${d.what}\n\nOpen the deal: ${d.url}` }),
    ar: (d: { title: string; what: string; url: string }) => ({ subject: `${d.title}: ${d.what}`, body: `${d.what}\n\nافتح الصفقة: ${d.url}` }),
    hi: (d: { title: string; what: string; url: string }) => ({ subject: `${d.title}: ${d.what}`, body: `${d.what}\n\nडील खोलें: ${d.url}` }),
  } satisfies Tpl<{ title: string; what: string; url: string }>,

  review_decision: {
    en: (d: { approved: boolean; reason?: string }) => ({ subject: d.approved ? "You're in: welcome to EVRA" : "About your EVRA application", body: d.approved ? `Your account is approved. Open EVRA: ${app()}/home` : `We couldn't approve your account yet. Reason: ${d.reason ?? "not given"}. Reply to this email or reapply any time from ${app()}/onboarding.` }),
    ar: (d: { approved: boolean; reason?: string }) => ({ subject: d.approved ? "تمت الموافقة: مرحبًا بك في EVRA" : "بخصوص طلبك في EVRA", body: d.approved ? `تمت الموافقة على حسابك. افتح EVRA: ${app()}/home` : `لم نتمكن من الموافقة على حسابك بعد. السبب: ${d.reason ?? "غير محدد"}. يمكنك التقديم مجددًا في أي وقت.` }),
    hi: (d: { approved: boolean; reason?: string }) => ({ subject: d.approved ? "आप शामिल हो गए: EVRA में स्वागत है" : "आपके EVRA आवेदन के बारे में", body: d.approved ? `आपका अकाउंट मंज़ूर हो गया। EVRA खोलें: ${app()}/home` : `हम अभी आपका अकाउंट मंज़ूर नहीं कर पाए। कारण: ${d.reason ?? "नहीं बताया"}। आप कभी भी फिर से आवेदन कर सकते हैं।` }),
  } satisfies Tpl<{ approved: boolean; reason?: string }>,

  weekly_digest: {
    en: (d: { lines: string[] }) => ({ subject: "Your week on EVRA", body: d.lines.join("\n") }),
    ar: (d: { lines: string[] }) => ({ subject: "أسبوعك على EVRA", body: d.lines.join("\n") }),
    hi: (d: { lines: string[] }) => ({ subject: "EVRA पर आपका हफ़्ता", body: d.lines.join("\n") }),
  } satisfies Tpl<{ lines: string[] }>,

  tool_result: {
    en: (d: { tool: string; summary: string }) => ({ subject: `Your ${d.tool} result`, body: d.summary }),
    ar: (d: { tool: string; summary: string }) => ({ subject: `نتيجة ${d.tool}`, body: d.summary }),
    hi: (d: { tool: string; summary: string }) => ({ subject: `आपका ${d.tool} नतीजा`, body: d.summary }),
  } satisfies Tpl<{ tool: string; summary: string }>,
};

export type TemplateKey = keyof typeof templates;
export type TemplateData<K extends TemplateKey> = Parameters<(typeof templates)[K]["en"]>[0];
