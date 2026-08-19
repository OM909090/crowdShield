import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  ShieldAlert,
  MapPin,
  Navigation,
  Radar,
  Users,
  Bell,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  Info,
  Globe,
  Siren,
  HeartPulse,
  Flame,
  Ban,
  UserX,
  MessageSquare,
  Send,
  Check,
  LocateFixed,
  Route,
  Loader2,
  LockKeyhole,
  Megaphone,
  Bot,
  DoorOpen,
  Footprints,
  Ruler,
  Timer,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "../utils/axios";
import { useAuth } from "../context/AuthContext";
import { useAssistantSituation } from "../context/assistantSituation";
import { useCrowdFeed } from "../hooks/useCrowdFeed";
import { riskMeta, riskRank, severityMeta, formatEta, timeAgo, RISK_LEVELS } from "../utils/riskUi";
import AlertsFeed from "../components/AlertsFeed";
import CitizenRouteMap from "../components/map/CitizenRouteMap";

/* ------------------------------------------------------------------ */
/* Anonymized device identity — persisted so the same phone maps to the */
/* same anonymous sensor across sessions (never tied to the account).   */
/* ------------------------------------------------------------------ */
const DEVICE_KEY = "crowdshield:deviceHash";

function getDeviceHash() {
  try {
    let hash = localStorage.getItem(DEVICE_KEY);
    if (!hash) {
      hash =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `dev-${Math.random().toString(36).slice(2)}-${Date.now()}`;
      localStorage.setItem(DEVICE_KEY, hash);
    }
    return hash;
  } catch {
    return `dev-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  }
}

/* ------------------------------------------------------------------ */
/* Lightweight local i18n (no library) — key headings + buttons only.   */
/* Falls back to English for any missing key.                           */
/* ------------------------------------------------------------------ */
const LANGS = ["en", "hi", "or"];
const LANG_LABEL = { en: "EN", hi: "हि", or: "ଓଡ଼" };

const STRINGS = {
  en: {
    tagline: "Citizen safety companion",
    pickTitle: "Choose your event",
    pickSubtitle: "Pick where you are to get live crowd safety and guidance.",
    loadingEvents: "Loading events…",
    noEvents: "No live or upcoming events right now. Check back soon.",
    consentTitle: "Your privacy comes first",
    consentBody:
      "We share only your approximate location as anonymized data — the system sees hexagons, not people. No cameras, ever.",
    b1: "Anonymized location only — never your identity",
    b2: "The system sees density hexagons, not individuals",
    b3: "Stop anytime — just close the app",
    shareBtn: "Share my location & continue",
    browseBtn: "Not now — just show alerts",
    changeEvent: "Change event",
    situation: "Current situation",
    estCrowd: "Estimated crowd",
    allClear: "All clear in your area",
    warnBanner: "Crowding building nearby. Stay alert and follow guidance below.",
    liveAlerts: "Live alerts",
    goalTitle: "Where do you want to go?",
    noDestinations: "No destinations published for this venue yet.",
    guidanceFallback: "Route guidance will appear here once available.",
    guidanceLoading: "Finding the safest route…",
    holdWarn: "Hold briefly and let the crowd ahead clear before moving.",
    needLocation: "Turn on location sharing to get routing.",
    sos: "SOS — I need help",
    sosToast: "🆘 Help is on the way. Stay calm and move with the crowd.",
    sosFail: "Couldn't send SOS. Try again or alert nearby staff.",
    reportTitle: "Report an issue",
    notePlaceholder: "Add a note (optional)",
    submit: "Submit report",
    reportToast: "Report sent. Thank you for keeping everyone safe.",
    reportFail: "Couldn't submit report. Please try again.",
    sharingLive: "Sharing • live",
    browseOnly: "Browse only",
    locating: "Locating…",
    locationOff: "Location off",
    enableShare: "Enable",
    connecting: "Connecting to live feed…",
    waiting: "Waiting for live data…",
    footerNote: "In an emergency, always follow on-site staff and official instructions.",
    /* --- route map --- */
    routeTitle: "Your route",
    youAreHere: "You are here",
    destinationLabel: "Destination",
    distanceLabel: "Distance",
    walkTimeLabel: "Walk time",
    routeCondition: "Route condition",
    unitM: "m",
    unitKm: "km",
    /* --- safest way out --- */
    exitTitle: "Need to get out?",
    exitBody: "We'll pick the calmest open gate and draw the way there.",
    exitBtn: "Safest way out",
    exitBtnAgain: "Find another way out",
    exitFinding: "Finding the safest exit…",
    exitNeedGps: "Turn on location sharing to find your safest exit.",
    exitHint: "Needs your location",
    exitHeadTo: "Head for",
    exitUnavailable: "No exit route available right now — follow marshals and on-site staff.",
    exitRisky: "Every route out is busy right now. Move calmly with the marshals — do not run.",
    exitFail: "Couldn't work out an exit route. Follow the nearest staff member.",
    exitChecked: "Exits checked",
    /* --- broadcasts --- */
    announcement: "Announcement",
    fromAgent: "AI advisory",
    fromAuthority: "Event control",
    ackBroadcast: "Got it",
    olderBroadcasts: "Earlier announcements",
    showLabel: "Show",
    hideLabel: "Hide",
  },
  hi: {
    tagline: "नागरिक सुरक्षा साथी",
    pickTitle: "अपना कार्यक्रम चुनें",
    pickSubtitle: "लाइव भीड़ सुरक्षा और मार्गदर्शन पाने के लिए अपना स्थान चुनें।",
    loadingEvents: "कार्यक्रम लोड हो रहे हैं…",
    noEvents: "अभी कोई लाइव या आगामी कार्यक्रम नहीं है। थोड़ी देर बाद देखें।",
    consentTitle: "आपकी निजता सर्वोपरि है",
    consentBody:
      "हम केवल आपके अनुमानित स्थान को अनाम डेटा के रूप में साझा करते हैं — सिस्टम लोगों को नहीं, केवल हेक्सागोन देखता है। कोई कैमरा नहीं।",
    b1: "केवल अनाम स्थान — कभी आपकी पहचान नहीं",
    b2: "सिस्टम घनत्व हेक्सागोन देखता है, व्यक्ति नहीं",
    b3: "कभी भी रोकें — बस ऐप बंद कर दें",
    shareBtn: "मेरा स्थान साझा करें और जारी रखें",
    browseBtn: "अभी नहीं — केवल अलर्ट दिखाएँ",
    changeEvent: "कार्यक्रम बदलें",
    situation: "वर्तमान स्थिति",
    estCrowd: "अनुमानित भीड़",
    allClear: "आपके क्षेत्र में सब ठीक है",
    warnBanner: "पास में भीड़ बढ़ रही है। सतर्क रहें और नीचे दिए मार्गदर्शन का पालन करें।",
    liveAlerts: "लाइव अलर्ट",
    goalTitle: "आप कहाँ जाना चाहते हैं?",
    noDestinations: "इस स्थल के लिए अभी कोई गंतव्य नहीं है।",
    guidanceFallback: "मार्गदर्शन उपलब्ध होते ही यहाँ दिखाई देगा।",
    guidanceLoading: "सबसे सुरक्षित मार्ग खोजा जा रहा है…",
    holdWarn: "थोड़ी देर रुकें और आगे की भीड़ को साफ़ होने दें।",
    needLocation: "मार्ग पाने के लिए स्थान साझा करना चालू करें।",
    sos: "SOS — मुझे मदद चाहिए",
    sosToast: "🆘 मदद आ रही है। शांत रहें और भीड़ के साथ चलें।",
    sosFail: "SOS नहीं भेजा जा सका। पुनः प्रयास करें या पास के स्टाफ़ को बताएँ।",
    reportTitle: "समस्या की सूचना दें",
    notePlaceholder: "एक टिप्पणी जोड़ें (वैकल्पिक)",
    submit: "रिपोर्ट भेजें",
    reportToast: "रिपोर्ट भेजी गई। सबको सुरक्षित रखने के लिए धन्यवाद।",
    reportFail: "रिपोर्ट नहीं भेजी जा सकी। कृपया पुनः प्रयास करें।",
    sharingLive: "साझा हो रहा है • लाइव",
    browseOnly: "केवल ब्राउज़",
    locating: "स्थान खोजा जा रहा है…",
    locationOff: "स्थान बंद",
    enableShare: "चालू करें",
    connecting: "लाइव फ़ीड से जुड़ रहे हैं…",
    waiting: "लाइव डेटा की प्रतीक्षा…",
    footerNote: "आपातकाल में हमेशा साइट स्टाफ़ और आधिकारिक निर्देशों का पालन करें।",
    /* --- route map --- */
    routeTitle: "आपका मार्ग",
    youAreHere: "आप यहाँ हैं",
    destinationLabel: "गंतव्य",
    distanceLabel: "दूरी",
    walkTimeLabel: "पैदल समय",
    routeCondition: "मार्ग की स्थिति",
    unitM: "मी",
    unitKm: "किमी",
    /* --- safest way out --- */
    exitTitle: "बाहर निकलना है?",
    exitBody: "हम सबसे शांत खुला गेट चुनकर वहाँ तक का रास्ता दिखाएँगे।",
    exitBtn: "बाहर जाने का सबसे सुरक्षित रास्ता",
    exitBtnAgain: "दूसरा रास्ता खोजें",
    exitFinding: "सबसे सुरक्षित निकास खोजा जा रहा है…",
    exitNeedGps: "सबसे सुरक्षित निकास पाने के लिए स्थान साझा करना चालू करें।",
    exitHint: "आपका स्थान आवश्यक है",
    exitHeadTo: "इस ओर जाएँ",
    exitUnavailable: "अभी कोई निकास मार्ग उपलब्ध नहीं है — मार्शल और साइट स्टाफ़ का पालन करें।",
    exitRisky: "अभी बाहर जाने के सभी रास्तों पर भीड़ है। मार्शल के साथ शांति से चलें — दौड़ें नहीं।",
    exitFail: "निकास मार्ग नहीं निकाला जा सका। पास के स्टाफ़ का पालन करें।",
    exitChecked: "जाँचे गए निकास",
    /* --- broadcasts --- */
    announcement: "घोषणा",
    fromAgent: "एआई सलाह",
    fromAuthority: "इवेंट कंट्रोल",
    ackBroadcast: "समझ गया",
    olderBroadcasts: "पिछली घोषणाएँ",
    showLabel: "दिखाएँ",
    hideLabel: "छिपाएँ",
  },
  or: {
    tagline: "ନାଗରିକ ସୁରକ୍ଷା ସାଥୀ",
    pickTitle: "ଆପଣଙ୍କ ଇଭେଣ୍ଟ ବାଛନ୍ତୁ",
    pickSubtitle: "ଲାଇଭ୍ ଭିଡ଼ ସୁରକ୍ଷା ଓ ମାର୍ଗଦର୍ଶନ ପାଇବାକୁ ଆପଣ କେଉଁଠି ଅଛନ୍ତି ବାଛନ୍ତୁ।",
    loadingEvents: "ଇଭେଣ୍ଟ ଲୋଡ୍ ହେଉଛି…",
    noEvents: "ବର୍ତ୍ତମାନ କୌଣସି ଲାଇଭ୍ କିମ୍ବା ଆଗାମୀ ଇଭେଣ୍ଟ ନାହିଁ।",
    consentTitle: "ଆପଣଙ୍କ ଗୋପନୀୟତା ପ୍ରଥମ",
    consentBody:
      "ଆମେ କେବଳ ଆପଣଙ୍କ ଆନୁମାନିକ ଅବସ୍ଥାନକୁ ଅଜ୍ଞାତ ତଥ୍ୟ ଭାବରେ ସେୟାର କରୁ — ସିଷ୍ଟମ ଲୋକଙ୍କୁ ନୁହେଁ, ହେକ୍ସାଗନ ଦେଖେ। କୌଣସି କ୍ୟାମେରା ନାହିଁ।",
    b1: "କେବଳ ଅଜ୍ଞାତ ଅବସ୍ଥାନ — କେବେହେଲେ ଆପଣଙ୍କ ପରିଚୟ ନୁହେଁ",
    b2: "ସିଷ୍ଟମ ଘନତ୍ୱ ହେକ୍ସାଗନ ଦେଖେ, ବ୍ୟକ୍ତି ନୁହେଁ",
    b3: "ଯେକୌଣସି ସମୟରେ ବନ୍ଦ କରନ୍ତୁ — କେବଳ ଆପ୍ ବନ୍ଦ କରନ୍ତୁ",
    shareBtn: "ମୋ ଅବସ୍ଥାନ ସେୟାର କରି ଆଗକୁ ବଢ଼ନ୍ତୁ",
    browseBtn: "ବର୍ତ୍ତମାନ ନୁହେଁ — କେବଳ ଆଲର୍ଟ ଦେଖାନ୍ତୁ",
    changeEvent: "ଇଭେଣ୍ଟ ବଦଳାନ୍ତୁ",
    situation: "ବର୍ତ୍ତମାନ ପରିସ୍ଥିତି",
    estCrowd: "ଆନୁମାନିକ ଭିଡ଼",
    allClear: "ଆପଣଙ୍କ ଅଞ୍ଚଳରେ ସବୁ ଠିକ୍ ଅଛି",
    warnBanner: "ପାଖରେ ଭିଡ଼ ବଢ଼ୁଛି। ସତର୍କ ରୁହନ୍ତୁ ଏବଂ ତଳ ମାର୍ଗଦର୍ଶନ ଅନୁସରଣ କରନ୍ତୁ।",
    liveAlerts: "ଲାଇଭ୍ ଆଲର୍ଟ",
    goalTitle: "ଆପଣ କେଉଁଠିକୁ ଯିବାକୁ ଚାହାନ୍ତି?",
    noDestinations: "ଏହି ସ୍ଥାନ ପାଇଁ ଏପର୍ଯ୍ୟନ୍ତ କୌଣସି ଗନ୍ତବ୍ୟ ନାହିଁ।",
    guidanceFallback: "ମାର୍ଗଦର୍ଶନ ଉପଲବ୍ଧ ହେଲେ ଏଠାରେ ଦେଖାଯିବ।",
    guidanceLoading: "ସବୁଠାରୁ ସୁରକ୍ଷିତ ମାର୍ଗ ଖୋଜାଯାଉଛି…",
    holdWarn: "ଟିକିଏ ଅଟକନ୍ତୁ ଏବଂ ଆଗର ଭିଡ଼ ସଫା ହେବାକୁ ଦିଅନ୍ତୁ।",
    needLocation: "ମାର୍ଗ ପାଇବାକୁ ଅବସ୍ଥାନ ସେୟାରିଂ ଚାଲୁ କରନ୍ତୁ।",
    sos: "SOS — ମୋର ସାହାଯ୍ୟ ଦରକାର",
    sosToast: "🆘 ସାହାଯ୍ୟ ଆସୁଛି। ଶାନ୍ତ ରୁହନ୍ତୁ ଏବଂ ଭିଡ଼ ସହ ଚାଲନ୍ତୁ।",
    sosFail: "SOS ପଠାଯାଇପାରିଲା ନାହିଁ। ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ କିମ୍ବା ପାଖ କର୍ମଚାରୀଙ୍କୁ ଜଣାନ୍ତୁ।",
    reportTitle: "ଏକ ସମସ୍ୟା ରିପୋର୍ଟ କରନ୍ତୁ",
    notePlaceholder: "ଏକ ଟିପ୍ପଣୀ ଯୋଡ଼ନ୍ତୁ (ବैକଳ୍ପିକ)",
    submit: "ରିପୋର୍ଟ ପଠାନ୍ତୁ",
    reportToast: "ରିପୋର୍ଟ ପଠାଗଲା। ସମସ୍ତଙ୍କୁ ସୁରକ୍ଷିତ ରଖିବା ପାଇଁ ଧନ୍ୟବାଦ।",
    reportFail: "ରିପୋର୍ଟ ପଠାଯାଇପାରିଲା ନାହିଁ। ଦୟାକରି ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ।",
    sharingLive: "ସେୟାର ହେଉଛି • ଲାଇଭ୍",
    browseOnly: "କେବଳ ବ୍ରାଉଜ୍",
    locating: "ଅବସ୍ଥାନ ଖୋଜାଯାଉଛି…",
    locationOff: "ଅବସ୍ଥାନ ବନ୍ଦ",
    enableShare: "ଚାଲୁ କରନ୍ତୁ",
    connecting: "ଲାଇଭ୍ ଫିଡ୍ ସହ ଯୋଡ଼ାଯାଉଛି…",
    waiting: "ଲାଇଭ୍ ତଥ୍ୟ ଅପେକ୍ଷାରେ…",
    footerNote: "ଜରୁରୀକାଳୀନ ପରିସ୍ଥିତିରେ ସର୍ବଦା ଘଟଣାସ୍ଥଳର କର୍ମଚାରୀ ଏବଂ ସରକାରୀ ନିର୍ଦ୍ଦେଶ ପାଳନ କରନ୍ତୁ।",
    /* --- route map --- */
    routeTitle: "ଆପଣଙ୍କ ମାର୍ଗ",
    youAreHere: "ଆପଣ ଏଠାରେ ଅଛନ୍ତି",
    destinationLabel: "ଗନ୍ତବ୍ୟ",
    distanceLabel: "ଦୂରତା",
    walkTimeLabel: "ଚାଲିବା ସମୟ",
    routeCondition: "ମାର୍ଗର ସ୍ଥିତି",
    unitM: "ମି",
    unitKm: "କି.ମି",
    /* --- safest way out --- */
    exitTitle: "ବାହାରକୁ ଯିବାକୁ ପଡ଼ିବ କି?",
    exitBody: "ଆମେ ସବୁଠାରୁ ଶାନ୍ତ ଖୋଲା ଗେଟ୍ ବାଛି ସେଠାକୁ ବାଟ ଦେଖାଇବୁ।",
    exitBtn: "ବାହାରକୁ ସବୁଠାରୁ ସୁରକ୍ଷିତ ବାଟ",
    exitBtnAgain: "ଅନ୍ୟ ଏକ ବାଟ ଖୋଜନ୍ତୁ",
    exitFinding: "ସବୁଠାରୁ ସୁରକ୍ଷିତ ନିର୍ଗମ ଖୋଜାଯାଉଛି…",
    exitNeedGps: "ସବୁଠାରୁ ସୁରକ୍ଷିତ ନିର୍ଗମ ପାଇବାକୁ ଅବସ୍ଥାନ ସେୟାରିଂ ଚାଲୁ କରନ୍ତୁ।",
    exitHint: "ଆପଣଙ୍କ ଅବସ୍ଥାନ ଆବଶ୍ୟକ",
    exitHeadTo: "ଏହି ଆଡ଼କୁ ଯାଆନ୍ତୁ",
    exitUnavailable: "ବର୍ତ୍ତମାନ କୌଣସି ନିର୍ଗମ ମାର୍ଗ ଉପଲବ୍ଧ ନାହିଁ — ମାର୍ଶାଲ ଏବଂ ଘଟଣାସ୍ଥଳ କର୍ମଚାରୀଙ୍କୁ ଅନୁସରଣ କରନ୍ତୁ।",
    exitRisky: "ବର୍ତ୍ତମାନ ବାହାରକୁ ଯିବାର ସବୁ ବାଟରେ ଭିଡ଼ ଅଛି। ମାର୍ଶାଲ ସହ ଶାନ୍ତ ଭାବରେ ଚାଲନ୍ତୁ — ଦୌଡ଼ନ୍ତୁ ନାହିଁ।",
    exitFail: "ନିର୍ଗମ ମାର୍ଗ ବାହାର କରାଯାଇପାରିଲା ନାହିଁ। ପାଖ କର୍ମଚାରୀଙ୍କୁ ଅନୁସରଣ କରନ୍ତୁ।",
    exitChecked: "ଯାଞ୍ଚ ହୋଇଥିବା ନିର୍ଗମ",
    /* --- broadcasts --- */
    announcement: "ଘୋଷଣା",
    fromAgent: "ଏଆଇ ପରାମର୍ଶ",
    fromAuthority: "ଇଭେଣ୍ଟ କଣ୍ଟ୍ରୋଲ",
    ackBroadcast: "ବୁଝିଗଲି",
    olderBroadcasts: "ପୂର୍ବ ଘୋଷଣାଗୁଡ଼ିକ",
    showLabel: "ଦେଖାନ୍ତୁ",
    hideLabel: "ଲୁଚାନ୍ତୁ",
  },
};

const REPORT_CATEGORIES = [
  { value: "medical", icon: HeartPulse, label: { en: "Medical", hi: "चिकित्सा", or: "ଚିକିତ୍ସା" } },
  { value: "hazard", icon: Flame, label: { en: "Hazard", hi: "खतरा", or: "ବିପଦ" } },
  { value: "blocked", icon: Ban, label: { en: "Blocked", hi: "रास्ता बंद", or: "ଅବରୋଧ" } },
  { value: "lost", icon: UserX, label: { en: "Lost", hi: "खो गया", or: "ହଜିଗଲି" } },
  { value: "other", icon: MessageSquare, label: { en: "Other", hi: "अन्य", or: "ଅନ୍ୟ" } },
];

const EVENT_STATUS = {
  ongoing: {
    ring: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
    dot: "bg-emerald-400 animate-pulse",
    label: { en: "Live", hi: "लाइव", or: "ଲାଇଭ୍" },
  },
  upcoming: {
    ring: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
    dot: "bg-cyan-300",
    label: { en: "Soon", hi: "जल्द", or: "ଶୀଘ୍ର" },
  },
};

const FEED_BADGE = {
  live: { dot: "bg-emerald-300", ring: "border-emerald-400/20 bg-emerald-500/10 text-emerald-200", label: "Live" },
  connecting: { dot: "bg-amber-300 animate-pulse", ring: "border-amber-400/20 bg-amber-500/10 text-amber-200", label: "Connecting" },
  disconnected: { dot: "bg-red-400", ring: "border-red-400/20 bg-red-500/10 text-red-200", label: "Offline" },
};

/* Broadcast severity → banner skin + icon. Critical gets a subtle pulse so it
   reads as urgent even at arm's length in daylight. */
const BROADCAST_TONE = {
  info: {
    wrap: "border-cyan-400/35 bg-cyan-500/[0.14] text-cyan-50",
    chip: "border-cyan-300/30 bg-cyan-400/15 text-cyan-100",
    icon: Megaphone,
    accent: "text-cyan-300",
    toast: "📢",
    pulse: false,
  },
  warning: {
    wrap: "border-amber-400/40 bg-amber-500/[0.16] text-amber-50",
    chip: "border-amber-300/30 bg-amber-400/15 text-amber-100",
    icon: AlertTriangle,
    accent: "text-amber-300",
    toast: "⚠️",
    pulse: false,
  },
  critical: {
    wrap: "border-red-400/50 bg-red-500/[0.18] text-red-50",
    chip: "border-red-300/30 bg-red-400/15 text-red-100",
    icon: Siren,
    accent: "text-red-300",
    toast: "🚨",
    pulse: true,
  },
};
const broadcastTone = (s) => BROADCAST_TONE[s] || BROADCAST_TONE.info;

/** The predictor's risk→level thresholds, mirrored so a numeric `maxRisk` from
 *  the exit-route service gets the same colour the command centre would give it. */
const RISK_PROMOTE = [0, 0.3, 0.5, 0.68, 0.82];
function levelFromRisk(risk) {
  if (!Number.isFinite(risk)) return null;
  let level = 0;
  for (let i = 1; i < RISK_PROMOTE.length; i += 1) if (risk >= RISK_PROMOTE[i]) level = i;
  return RISK_LEVELS[level];
}

/** Metres for anything walkable, km once it stops being a short walk. */
function formatDistance(metres, t) {
  if (!Number.isFinite(metres)) return null;
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} ${t("unitKm")}` : `${Math.round(metres)} ${t("unitM")}`;
}

/** Mean of an AoR ring — the last-resort map centre when there's no GPS fix. */
function polygonCentroid(polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return null;
  let lat = 0;
  let lng = 0;
  let n = 0;
  for (const p of polygon) {
    if (Array.isArray(p) && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1]))) {
      lat += Number(p[0]);
      lng += Number(p[1]);
      n += 1;
    }
  }
  return n ? [lat / n, lng / n] : null;
}

const CARD = "rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl";
const SECTION_MOTION = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -14 },
  transition: { duration: 0.35, ease: "easeOut" },
};

export default function CitizenApp() {
  const { user } = useAuth();
  const { publish: publishSituation, clear: clearSituation } = useAssistantSituation();

  const [lang, setLang] = useState("en");
  const t = (key) => STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
  const cycleLang = () => setLang((prev) => LANGS[(LANGS.indexOf(prev) + 1) % LANGS.length]);

  // Flow: pick → consent → live
  const [step, setStep] = useState("pick");
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const eventId = selectedEvent?._id;

  // Location sharing (phone-as-sensor)
  const [sharing, setSharing] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoDenied, setGeoDenied] = useState(false);
  const [coords, setCoords] = useState(null);
  const coordsRef = useRef(null);

  // Destinations + guidance
  const [destinations, setDestinations] = useState([]);
  const [destLoading, setDestLoading] = useState(false);
  const [selectedDest, setSelectedDest] = useState(null);
  const [guidance, setGuidance] = useState(null);
  const [guidanceLoading, setGuidanceLoading] = useState(false);
  const [guidanceError, setGuidanceError] = useState(false);

  // Venue graph — geometry for the little route map (AoR, zones, gates)
  const [venue, setVenue] = useState(null);

  // "Safest way out"
  const [exit, setExit] = useState(null);
  const [exitMessage, setExitMessage] = useState(null);
  const [exitLoading, setExitLoading] = useState(false);
  const [exitFailed, setExitFailed] = useState(false);

  // Broadcasts — socket pushes plus the history fetched for late joiners
  const [seedBroadcasts, setSeedBroadcasts] = useState([]);
  const [ackedIds, setAckedIds] = useState([]);
  const [showOlder, setShowOlder] = useState(false);

  // Incident reporting
  const [sosBusy, setSosBusy] = useState(false);
  const [reportCat, setReportCat] = useState(null);
  const [reportNote, setReportNote] = useState("");
  const [reportBusy, setReportBusy] = useState(false);

  const seenAlerts = useRef(new Set());
  const seenBroadcasts = useRef(new Set());

  // Live feed only while viewing (subscribing starts the server broadcaster).
  const { frame, alerts, broadcasts, status } = useCrowdFeed(step === "live" ? eventId : null);

  /* ---- load events for the picker ---- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingEvents(true);
        const res = await api.get("/events");
        if (!cancelled) setEvents(res.data.events || []);
      } catch (err) {
        if (!cancelled) toast.error(err.response?.data?.message || "Failed to load events");
      } finally {
        if (!cancelled) setLoadingEvents(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---- phone-as-sensor: stream anonymized GPS while sharing ----
     (sharing is only enabled after geolocation is confirmed available, so the
      effect body performs no synchronous setState — all updates happen inside
      the async watch/error callbacks below.) */
  useEffect(() => {
    if (!sharing || !eventId) return undefined;
    if (!navigator.geolocation) return undefined;

    const hash = getDeviceHash();

    const onFix = (pos) => {
      const c = pos.coords;
      const fix = {
        lat: c.latitude,
        lng: c.longitude,
        heading: c.heading ?? undefined,
        speed: c.speed ?? undefined,
      };
      coordsRef.current = fix;
      setCoords(fix);
      setLocating(false);
    };
    const onErr = (err) => {
      setLocating(false);
      if (err && err.code === 1) {
        setGeoDenied(true);
        setSharing(false);
        toast("Location permission denied — you can still browse alerts.", { icon: "📍" });
      }
    };

    const watchId = navigator.geolocation.watchPosition(onFix, onErr, {
      enableHighAccuracy: true,
      maximumAge: 3000,
      timeout: 20000,
    });

    const send = () => {
      const fix = coordsRef.current;
      if (!fix) return;
      api
        .post(`/events/${eventId}/ingest`, {
          heartbeats: [
            {
              deviceHash: hash,
              lat: fix.lat,
              lng: fix.lng,
              heading: fix.heading ?? undefined,
              speed: fix.speed ?? undefined,
            },
          ],
        })
        .catch(() => {
          /* stay quiet — a dropped heartbeat every 4s shouldn't spam the user */
        });
    };
    const interval = setInterval(send, 4000);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(interval);
    };
  }, [sharing, eventId]);

  /* ---- fetch venue destinations for the goal picker ---- */
  useEffect(() => {
    if (step !== "live" || !eventId) return undefined;
    let cancelled = false;
    (async () => {
      setDestLoading(true);
      try {
        const res = await api.get(`/events/${eventId}/venue/destinations`);
        if (!cancelled) setDestinations(res.data.destinations || []);
      } catch {
        if (!cancelled) setDestinations([]);
      } finally {
        if (!cancelled) setDestLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, eventId]);

  /* ---- fetch the venue graph once, for the route map's context layers ----
     `venue` is null for an event with no graph drawn yet; the map degrades to
     just the route + the two pins, which is still the thing that matters. */
  useEffect(() => {
    if (step !== "live" || !eventId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/events/${eventId}/venue`);
        if (!cancelled) setVenue(res.data?.venue || null);
      } catch {
        if (!cancelled) setVenue(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, eventId]);

  /* ---- seed the announcement list: the socket only carries what arrives
     while we're watching, so a late joiner needs the recent history too ---- */
  useEffect(() => {
    if (step !== "live" || !eventId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/events/${eventId}/broadcasts`);
        if (!cancelled) setSeedBroadcasts(res.data?.broadcasts || []);
      } catch {
        if (!cancelled) setSeedBroadcasts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, eventId]);

  /* ---- tell the AI assistant what this person is looking at ----
     The popup is mounted in App.jsx, outside the route tree, so it cannot read
     any of the state in this component. Until it was published the assistant
     had no event, no position and no language on /citizen (the route carries no
     :id for it to scrape), so every answer was a guess. Publishing writes to a
     ref rather than state, so streaming a fix once a second costs no renders.

     The fix is only handed over while `sharing` is on: the assistant must not
     know where somebody is who declined location. */
  useEffect(() => {
    const live = step === "live" && !!eventId;
    const shared = live && sharing && coords;
    publishSituation({
      eventId: live ? eventId : null,
      eventName: live ? selectedEvent?.name : null,
      lang,
      sharing: live ? sharing : null,
      lat: shared ? coords.lat : null,
      lng: shared ? coords.lng : null,
      heading: shared && Number.isFinite(coords.heading) ? coords.heading : null,
    });
  }, [publishSituation, step, eventId, selectedEvent, lang, sharing, coords]);

  /* Leaving the citizen app takes its context with it, so the assistant never
     answers about an event the person is no longer at. */
  useEffect(() => () => clearSituation(), [clearSituation]);

  /* ---- toast each freshly-arrived alert once ---- */
  useEffect(() => {
    for (const a of alerts) {
      if (seenAlerts.current.has(a.id)) continue;
      seenAlerts.current.add(a.id);
      const m = severityMeta(a.severity);
      const eta = formatEta(a.etaCriticalSec);
      toast(`${(m.label || "Alert").toUpperCase()} · ${a.zoneName || "Zone"}${eta ? ` · critical in ~${eta}` : ""}`, {
        icon: a.severity === "critical" ? "🔴" : a.severity === "high" ? "🟠" : "🟡",
      });
    }
  }, [alerts]);

  /* ---- toast each freshly-pushed broadcast once, in the chosen language ----
     Driven by the socket list only (not the merged one) so a late joiner isn't
     hit with a burst of toasts for history they've already missed. */
  useEffect(() => {
    for (const b of broadcasts) {
      if (!b?.id || seenBroadcasts.current.has(b.id)) continue;
      seenBroadcasts.current.add(b.id);
      toast(b.messages?.[lang] ?? b.message, {
        icon: broadcastTone(b.severity).toast,
        duration: b.severity === "critical" ? 9000 : 6000,
      });
    }
  }, [broadcasts, lang]);

  /* ---- derived: worst zone drives the headline situation ---- */
  const worst = useMemo(() => {
    const zones = frame?.zones || [];
    return zones.reduce((acc, z) => (riskRank(z.riskLevel) > (acc ? riskRank(acc.riskLevel) : -1) ? z : acc), null);
  }, [frame]);
  const worstMeta = worst ? riskMeta(worst.riskLevel) : riskMeta("NORMAL");
  const warnActive = !!worst && riskRank(worst.riskLevel) >= riskRank("ELEVATED");
  const personsEst =
    frame?.totals?.personsEst != null ? Number(frame.totals.personsEst).toLocaleString("en-IN") : "—";

  /* ---- announcements: live pushes first, then seeded history, de-duped ---- */
  const announcements = useMemo(() => {
    const byId = new Map();
    for (const b of [...broadcasts, ...seedBroadcasts]) {
      if (!b) continue;
      const id = b.id || `${b.createdAt}|${b.message}`;
      if (!byId.has(id)) byId.set(id, { ...b, id });
    }
    return [...byId.values()]
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 5);
  }, [broadcasts, seedBroadcasts]);

  // The newest one the citizen hasn't acknowledged gets the big banner; the rest
  // stay available in a collapsed list so nothing silently disappears.
  const activeBroadcast = useMemo(
    () => announcements.find((b) => !ackedIds.includes(b.id)) || null,
    [announcements, ackedIds]
  );
  const olderBroadcasts = useMemo(
    () => announcements.filter((b) => b.id !== activeBroadcast?.id),
    [announcements, activeBroadcast]
  );

  /* ---- map centre: own fix → event coords → AoR centroid → nothing ---- */
  const mapCenter = useMemo(() => {
    if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) return [coords.lat, coords.lng];
    // Event geometry is GeoJSON [lng, lat]; Leaflet wants [lat, lng].
    const c = selectedEvent?.location?.coordinates?.coordinates;
    if (Array.isArray(c) && c.length >= 2 && Number.isFinite(Number(c[0])) && Number.isFinite(Number(c[1]))) {
      return [Number(c[1]), Number(c[0])];
    }
    return polygonCentroid(venue?.aor?.polygon);
  }, [coords, selectedEvent, venue]);

  const youAreAt = coords ? [coords.lat, coords.lng] : null;

  // Guidance route — the thing the app has been receiving and discarding.
  const guidanceRoute = useMemo(() => {
    const wp = guidance?.route?.waypoints;
    return Array.isArray(wp) && wp.length >= 2 ? wp : [];
  }, [guidance]);

  const visibleEvents = useMemo(() => {
    const rank = { ongoing: 0, upcoming: 1 };
    return (events || [])
      .filter((e) => {
        const s = e.liveStatus || e.status || "upcoming";
        return s === "ongoing" || s === "upcoming";
      })
      .sort((a, b) => {
        const sa = a.liveStatus || a.status || "upcoming";
        const sb = b.liveStatus || b.status || "upcoming";
        return (rank[sa] ?? 2) - (rank[sb] ?? 2);
      });
  }, [events]);

  /* ---- actions ---- */
  const resetSession = () => {
    setSharing(false);
    setGeoDenied(false);
    setLocating(false);
    setCoords(null);
    coordsRef.current = null;
    setDestinations([]);
    setSelectedDest(null);
    setGuidance(null);
    setGuidanceError(false);
    setGuidanceLoading(false);
    setVenue(null);
    setExit(null);
    setExitMessage(null);
    setExitFailed(false);
    setExitLoading(false);
    setSeedBroadcasts([]);
    setAckedIds([]);
    setShowOlder(false);
    setReportCat(null);
    setReportNote("");
    seenAlerts.current = new Set();
    seenBroadcasts.current = new Set();
  };

  const pickEvent = (ev) => {
    resetSession();
    setSelectedEvent(ev);
    setStep("consent");
  };

  const backToPicker = () => {
    resetSession();
    setSelectedEvent(null);
    setStep("pick");
  };

  // Confirm geolocation is available *before* flipping `sharing` on, so the
  // streaming effect never has to call setState in its body.
  const beginSharing = () => {
    if (!("geolocation" in navigator)) {
      setGeoDenied(true);
      toast.error("Location isn't available on this device.");
      return;
    }
    setGeoDenied(false);
    setLocating(true);
    setSharing(true);
  };

  const consentShare = () => {
    beginSharing();
    setStep("live");
  };

  const consentBrowse = () => {
    setSharing(false);
    setStep("live");
  };

  const enableSharing = () => {
    beginSharing();
  };

  const requestGuidance = async (dest) => {
    setSelectedDest(dest);
    setGuidance(null);
    setGuidanceError(false);
    const fix = coordsRef.current || coords;
    if (!fix) {
      setGuidanceError(true);
      toast(t("needLocation"), { icon: "📍" });
      return;
    }
    setGuidanceLoading(true);
    try {
      const res = await api.post(`/events/${eventId}/guidance`, {
        lat: fix.lat,
        lng: fix.lng,
        heading: fix.heading ?? undefined,
        destinationId: dest.id,
      });
      setGuidance(res.data.guidance || null);
      if (!res.data.guidance) setGuidanceError(true);
    } catch {
      setGuidanceError(true);
    } finally {
      setGuidanceLoading(false);
    }
  };

  /* ---- "safest way out" — navigation, not an emergency call ---- */
  const findExitRoute = async () => {
    if (exitLoading) return;
    const fix = coordsRef.current || coords;
    if (!fix) {
      // Button is disabled without a fix, but a stale tap must still explain why.
      toast(t("exitNeedGps"), { icon: "📍" });
      return;
    }
    setExit(null);
    setExitMessage(null);
    setExitFailed(false);
    setExitLoading(true);
    try {
      const res = await api.post(`/events/${eventId}/exit-route`, { lat: fix.lat, lng: fix.lng });
      const found = res.data?.exit || null;
      if (found) setExit(found);
      // `exit: null` is a valid, non-error answer — surface the server's calm
      // wording rather than an error state.
      else setExitMessage(res.data?.message || t("exitUnavailable"));
    } catch {
      setExitFailed(true);
    } finally {
      setExitLoading(false);
    }
  };

  const ackBroadcast = (id) => {
    if (!id) return;
    setAckedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const triggerSos = async () => {
    if (sosBusy) return;
    setSosBusy(true);
    const fix = coordsRef.current || coords;
    try {
      await api.post(`/events/${eventId}/incidents`, { category: "sos", lat: fix?.lat, lng: fix?.lng });
      toast.success(t("sosToast"), { duration: 6000 });
    } catch {
      toast.error(t("sosFail"));
    } finally {
      setSosBusy(false);
    }
  };

  const submitReport = async () => {
    if (!reportCat || reportBusy) return;
    setReportBusy(true);
    const fix = coordsRef.current || coords;
    try {
      await api.post(`/events/${eventId}/incidents`, {
        category: reportCat,
        note: reportNote.trim() || undefined,
        lat: fix?.lat,
        lng: fix?.lng,
      });
      toast.success(t("reportToast"));
      setReportCat(null);
      setReportNote("");
    } catch {
      toast.error(t("reportFail"));
    } finally {
      setReportBusy(false);
    }
  };

  const venueName = selectedEvent?.location?.venueName;
  const firstName = user?.name ? String(user.name).split(" ")[0] : "";

  /* ---- shared map context (safe when there's no venue graph yet) ---- */
  const mapContext = {
    aor: venue?.aor?.polygon || [],
    zones: venue?.zones || [],
    liveZones: frame?.zones || [],
    gates: venue?.nodes || [],
    youAreHereLabel: t("youAreHere"),
    destinationLabel: t("destinationLabel"),
  };

  const hasFix = !!coords;
  const routeMeta = guidance?.route;
  const routeDistance = formatDistance(routeMeta?.lengthM, t);
  const routeEta = formatEta(routeMeta?.etaSec);
  const routeRisk = routeMeta?.riskLevel ? riskMeta(routeMeta.riskLevel) : null;
  // The route already ends at the goal, so its tail is the most reliable pin.
  const guidanceDestination = guidanceRoute.length
    ? { at: guidanceRoute[guidanceRoute.length - 1], name: selectedDest?.name }
    : selectedDest?.at
      ? { at: selectedDest.at, name: selectedDest.name }
      : null;

  const exitWaypoints = Array.isArray(exit?.waypoints) ? exit.waypoints : [];
  const exitDistance = formatDistance(exit?.distanceMeters, t);
  const exitEta = formatEta(exit?.durationSec);
  const exitRiskLevel = levelFromRisk(exit?.maxRisk);
  const exitRisk = exitRiskLevel ? riskMeta(exitRiskLevel) : null;
  const exitBusy = !!exit && (exit.unsafe || exit.allRoutesRisky);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050816] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.14),_transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-12 pt-6 sm:px-6">
        {/* Header */}
        <header className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10">
              <img src="/favicon.svg" alt="" className="h-6 w-6" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold">CrowdShield</p>
              <p className="text-[11px] text-slate-400">{t("tagline")}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {step === "live" && (
              <SharingPill
                sharing={sharing}
                locating={locating}
                hasFix={!!coords}
                geoDenied={geoDenied}
                onEnable={enableSharing}
                t={t}
              />
            )}
            <button
              type="button"
              onClick={cycleLang}
              aria-label="Change language"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-cyan-400/30 hover:text-white"
            >
              <Globe className="h-3.5 w-3.5" />
              {LANG_LABEL[lang]}
            </button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {/* ---------------- STEP 1 · EVENT PICKER ---------------- */}
          {step === "pick" && (
            <motion.section key="pick" {...SECTION_MOTION} className="flex-1">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3.5 py-1.5 text-xs text-cyan-200">
                <Sparkles className="h-3.5 w-3.5" />
                {t("tagline")}
              </div>
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{t("pickTitle")}</h1>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {firstName ? `Hi ${firstName}, ` : ""}
                {t("pickSubtitle")}
              </p>

              <div className="mt-6 space-y-3">
                {loadingEvents ? (
                  <>
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <motion.span animate={{ rotate: 360 }} transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}>
                        <Radar className="h-4 w-4 text-cyan-400" />
                      </motion.span>
                      {t("loadingEvents")}
                    </div>
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="h-[76px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
                    ))}
                  </>
                ) : visibleEvents.length === 0 ? (
                  <div className="flex flex-col items-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-12 text-center">
                    <Info className="mb-3 h-7 w-7 text-slate-600" />
                    <p className="text-sm text-slate-400">{t("noEvents")}</p>
                  </div>
                ) : (
                  visibleEvents.map((ev) => {
                    const s = ev.liveStatus || ev.status || "upcoming";
                    const meta = EVENT_STATUS[s] || EVENT_STATUS.upcoming;
                    return (
                      <motion.button
                        key={ev._id}
                        type="button"
                        whileTap={{ scale: 0.98 }}
                        onClick={() => pickEvent(ev)}
                        className="group flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left backdrop-blur-xl transition hover:border-cyan-400/30 hover:bg-white/[0.06]"
                      >
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10">
                          <MapPin className="h-5 w-5 text-cyan-300" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-white">{ev.name}</p>
                          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-400">
                            <MapPin size={12} className="shrink-0" />
                            {ev.location?.venueName || "Venue"}
                          </p>
                        </div>
                        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${meta.ring}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                          {meta.label[lang] || meta.label.en}
                        </span>
                        <ArrowRight className="h-4 w-4 shrink-0 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-cyan-300" />
                      </motion.button>
                    );
                  })
                )}
              </div>
            </motion.section>
          )}

          {/* ---------------- STEP 2 · CONSENT ---------------- */}
          {step === "consent" && (
            <motion.section key="consent" {...SECTION_MOTION} className="flex-1">
              <button
                type="button"
                onClick={backToPicker}
                className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-cyan-300"
              >
                <ArrowLeft size={15} />
                {t("changeEvent")}
              </button>

              <div className={CARD}>
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10">
                  <LockKeyhole className="h-7 w-7 text-cyan-300" />
                </div>
                <h2 className="mt-5 text-xl font-bold">{t("consentTitle")}</h2>
                <p className="mt-3 text-sm leading-6 text-slate-300">{t("consentBody")}</p>

                <ul className="mt-5 space-y-2.5">
                  {["b1", "b2", "b3"].map((key) => (
                    <li key={key} className="flex items-start gap-2.5 text-sm text-slate-300">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                      {t(key)}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-5 space-y-3">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={consentShare}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 px-5 py-3.5 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20"
                >
                  <LocateFixed className="h-4 w-4" />
                  {t("shareBtn")}
                </motion.button>
                <button
                  type="button"
                  onClick={consentBrowse}
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/[0.07]"
                >
                  {t("browseBtn")}
                </button>
              </div>

              {venueName && (
                <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-500">
                  <ShieldCheck size={12} />
                  {selectedEvent?.name} · {venueName}
                </p>
              )}
            </motion.section>
          )}

          {/* ---------------- STEP 3 · LIVE VIEW ---------------- */}
          {step === "live" && (
            <motion.section key="live" {...SECTION_MOTION} className="flex-1 space-y-4">
              {/* Event header */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={backToPicker}
                    className="inline-flex items-center gap-1.5 text-xs text-slate-400 transition hover:text-cyan-300"
                  >
                    <ArrowLeft size={13} />
                    {t("changeEvent")}
                  </button>
                  <h1 className="mt-1 truncate text-xl font-black tracking-tight">{selectedEvent?.name}</h1>
                  {venueName && (
                    <p className="flex items-center gap-1 truncate text-xs text-slate-400">
                      <MapPin size={12} className="shrink-0" />
                      {venueName}
                    </p>
                  )}
                </div>
                <FeedPill status={status} />
              </div>

              {/* Broadcasts — what the authorities or the AI told this crowd.
                  Sits above everything else because it is the loudest signal
                  the citizen can receive. */}
              <AnimatePresence initial={false} mode="popLayout">
                {activeBroadcast && (
                  <BroadcastBanner
                    key={activeBroadcast.id}
                    broadcast={activeBroadcast}
                    lang={lang}
                    t={t}
                    onAck={() => ackBroadcast(activeBroadcast.id)}
                  />
                )}
              </AnimatePresence>

              {olderBroadcasts.length > 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setShowOlder((v) => !v)}
                    aria-expanded={showOlder}
                    className="flex w-full items-center gap-2 text-left text-xs font-medium text-slate-300 transition hover:text-white"
                  >
                    <Megaphone size={13} className="shrink-0 text-cyan-300" />
                    {t("olderBroadcasts")}
                    <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">
                      {olderBroadcasts.length}
                    </span>
                    <span className="ml-auto flex items-center gap-1 text-[11px] text-cyan-300">
                      {showOlder ? t("hideLabel") : t("showLabel")}
                      {showOlder ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </span>
                  </button>

                  <AnimatePresence initial={false}>
                    {showOlder && (
                      <motion.ul
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        {olderBroadcasts.map((b) => {
                          const tone = broadcastTone(b.severity);
                          return (
                            <li key={b.id} className="mt-2.5 rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 first:mt-3">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${tone.chip}`}
                                >
                                  {b.source === "agent" ? <Bot size={9} /> : <ShieldCheck size={9} />}
                                  {b.source === "agent" ? t("fromAgent") : t("fromAuthority")}
                                </span>
                                <span className="ml-auto shrink-0 text-[10px] text-slate-500">{timeAgo(b.createdAt)}</span>
                              </div>
                              <p className="mt-1.5 text-xs leading-5 text-slate-200">{b.messages?.[lang] ?? b.message}</p>
                            </li>
                          );
                        })}
                      </motion.ul>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Location-based warning banner */}
              <AnimatePresence initial={false}>
                {warnActive && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${worstMeta.badge}`}>
                      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          {worstMeta.label} · {worst?.name}
                        </p>
                        <p className="mt-0.5 text-xs leading-5 opacity-90">{t("warnBanner")}</p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Situation status card */}
              <div className={CARD}>
                <div className="flex items-center justify-between">
                  <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">{t("situation")}</p>
                  {warnActive ? (
                    <ShieldAlert className="h-5 w-5" style={{ color: worstMeta.color }} />
                  ) : (
                    <ShieldCheck className="h-5 w-5 text-emerald-300" />
                  )}
                </div>
                <div className="mt-3 flex items-end justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-3xl font-black leading-none" style={{ color: worstMeta.color }}>
                      {frame ? worstMeta.label : "—"}
                    </p>
                    <p className="mt-1.5 truncate text-xs text-slate-400">
                      {worst ? worst.name : frame ? t("allClear") : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="flex items-center justify-end gap-1 text-[10px] uppercase tracking-wider text-slate-400">
                      <Users size={12} />
                      {t("estCrowd")}
                    </p>
                    <p className="text-2xl font-bold text-white">{personsEst}</p>
                  </div>
                </div>
                {!frame && (
                  <p className="mt-3 text-xs text-slate-500">{status === "disconnected" ? t("waiting") : t("connecting")}</p>
                )}
              </div>

              {/* Live alerts */}
              <div className={CARD}>
                <div className="mb-3 flex items-center justify-between">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <Bell size={15} className="text-amber-300" />
                    {t("liveAlerts")}
                  </p>
                  {alerts.length > 0 && (
                    <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-200">{alerts.length}</span>
                  )}
                </div>
                <AlertsFeed alerts={alerts} />
              </div>

              {/* Goal picker + guidance */}
              <div className={CARD}>
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Navigation size={15} className="text-cyan-300" />
                  {t("goalTitle")}
                </p>

                {destLoading ? (
                  <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
                    {t("loadingEvents")}
                  </div>
                ) : destinations.length === 0 ? (
                  <p className="mt-3 text-xs text-slate-500">{t("noDestinations")}</p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {destinations.map((d) => {
                      const active = selectedDest?.id === d.id;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => requestGuidance(d)}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium transition ${
                            active
                              ? "border-cyan-400/40 bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950"
                              : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-cyan-400/25 hover:text-white"
                          }`}
                        >
                          <MapPin size={12} />
                          {d.name}
                        </button>
                      );
                    })}
                  </div>
                )}

                {(guidanceLoading || guidance || guidanceError) && (
                  <div className="mt-4 rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.06] p-4">
                    {guidanceLoading ? (
                      <p className="flex items-center gap-2 text-sm text-slate-300">
                        <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
                        {t("guidanceLoading")}
                      </p>
                    ) : guidance ? (
                      <>
                        <p className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-cyan-300/80">
                          <Route size={13} />
                          {guidance.classification || "Route"}
                        </p>
                        <p className="mt-1.5 text-sm leading-6 text-slate-200">{guidance.instruction}</p>
                        {guidance.hold && (
                          <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-300">
                            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                            {typeof guidance.hold === "string" ? guidance.hold : t("holdWarn")}
                          </p>
                        )}

                        {/* The route the server already sent — drawn, not discarded */}
                        {guidanceRoute.length >= 2 && (
                          <div className="mt-3.5 space-y-2.5">
                            <div className="flex flex-wrap items-center gap-2">
                              {routeDistance && (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-semibold text-slate-200">
                                  <Ruler size={11} className="text-cyan-300" />
                                  <span className="text-slate-400">{t("distanceLabel")}</span>
                                  {routeDistance}
                                </span>
                              )}
                              {routeEta && (
                                <span
                                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                                    routeRisk ? routeRisk.badge : "border-white/10 bg-white/[0.05] text-slate-200"
                                  }`}
                                >
                                  <Timer size={11} />
                                  <span className="opacity-70">{t("walkTimeLabel")}</span>
                                  {routeEta}
                                </span>
                              )}
                              {routeRisk && (
                                <span
                                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${routeRisk.badge}`}
                                >
                                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: routeRisk.color }} />
                                  <span className="opacity-70">{t("routeCondition")}</span>
                                  {routeRisk.label}
                                </span>
                              )}
                            </div>

                            <div className="overflow-hidden rounded-2xl border border-white/10">
                              <CitizenRouteMap
                                {...mapContext}
                                center={guidanceRoute[0] || mapCenter}
                                route={guidanceRoute}
                                youAreAt={youAreAt}
                                destination={guidanceDestination}
                                height="220px"
                              />
                            </div>
                            <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
                              <Navigation size={11} className="shrink-0 text-emerald-300" />
                              {t("routeTitle")}
                            </p>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="flex items-center gap-2 text-sm text-slate-400">
                        <Info size={14} className="shrink-0" />
                        {t("guidanceFallback")}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Safest way out — navigation, deliberately not styled like SOS */}
              <div className={CARD}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <DoorOpen size={15} className="text-emerald-300" />
                      {t("exitTitle")}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{t("exitBody")}</p>
                  </div>
                  {!hasFix && (
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold text-amber-200">
                      <LocateFixed size={11} />
                      {t("exitHint")}
                    </span>
                  )}
                </div>

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={findExitRoute}
                  disabled={exitLoading || !hasFix}
                  aria-label={t("exitBtn")}
                  className="mt-4 flex w-full items-center justify-center gap-2.5 rounded-2xl border border-emerald-400/40 bg-gradient-to-r from-emerald-400 to-teal-500 px-5 py-4 text-base font-bold text-slate-950 shadow-lg shadow-emerald-500/20 transition disabled:cursor-not-allowed disabled:border-white/10 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-400 disabled:shadow-none"
                >
                  {exitLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Footprints className="h-5 w-5" />
                  )}
                  {exit || exitMessage || exitFailed ? t("exitBtnAgain") : t("exitBtn")}
                </motion.button>

                {/* No fix → say why the button is dead. If they've already opted
                    in, we're just waiting on the first fix; otherwise offer the
                    one tap that unblocks it. */}
                {!hasFix &&
                  (sharing ? (
                    <p className="mt-2.5 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-xs leading-5 text-slate-300">
                      <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-300" />
                      {t("locating")}
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={enableSharing}
                      className="mt-2.5 flex w-full items-start gap-2 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-3.5 py-2.5 text-left text-xs leading-5 text-amber-200 transition hover:bg-amber-500/15"
                    >
                      <LocateFixed size={14} className="mt-0.5 shrink-0" />
                      <span>
                        {t("exitNeedGps")}
                        <span className="ml-1 font-semibold text-amber-100 underline">{t("enableShare")}</span>
                      </span>
                    </button>
                  ))}

                {exitLoading && (
                  <p className="mt-3 flex items-center gap-2 text-sm text-slate-300">
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-300" />
                    {t("exitFinding")}
                  </p>
                )}

                {/* Server answered "no route", calmly */}
                {!exitLoading && exitMessage && (
                  <p className="mt-3 flex items-start gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-sm leading-6 text-slate-300">
                    <Info size={15} className="mt-0.5 shrink-0 text-cyan-300" />
                    {exitMessage}
                  </p>
                )}

                {/* Request itself failed */}
                {!exitLoading && exitFailed && (
                  <p className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-3.5 py-3 text-sm leading-6 text-amber-200">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                    {t("exitFail")}
                  </p>
                )}

                {!exitLoading && exit && (
                  <div className="mt-3.5 space-y-2.5">
                    {/* Recommended gate */}
                    <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.08] px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.24em] text-emerald-300/80">{t("exitHeadTo")}</p>
                      <p className="mt-1 flex items-center gap-2 text-lg font-black leading-tight text-white">
                        <DoorOpen size={18} className="shrink-0 text-emerald-300" />
                        <span className="min-w-0 truncate">{exit.gateName || exit.recommendedGateId}</span>
                      </p>
                    </div>

                    {/* Distance / walking ETA / route condition */}
                    <div className="flex flex-wrap items-center gap-2">
                      {exitDistance && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-semibold text-slate-200">
                          <Ruler size={11} className="text-cyan-300" />
                          <span className="text-slate-400">{t("distanceLabel")}</span>
                          {exitDistance}
                        </span>
                      )}
                      {exitEta && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-semibold text-slate-200">
                          <Timer size={11} className="text-emerald-300" />
                          <span className="text-slate-400">{t("walkTimeLabel")}</span>
                          {exitEta}
                        </span>
                      )}
                      {exitRisk && (
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${exitRisk.badge}`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: exitRisk.color }} />
                          <span className="opacity-70">{t("routeCondition")}</span>
                          {exitRisk.label}
                        </span>
                      )}
                      {exit.consideredGates?.length > 0 && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-slate-400">
                          {t("exitChecked")} {exit.consideredGates.length}
                        </span>
                      )}
                    </div>

                    {/* Best available route is still busy — say so plainly */}
                    {exitBusy && (
                      <div className="flex items-start gap-2 rounded-2xl border border-amber-400/30 bg-amber-500/[0.14] px-3.5 py-3 text-sm leading-6 text-amber-100">
                        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="font-semibold">{t("exitRisky")}</p>
                          {exit.reason && <p className="mt-0.5 text-xs leading-5 opacity-80">{exit.reason}</p>}
                        </div>
                      </div>
                    )}

                    {exitWaypoints.length >= 2 ? (
                      <div className="overflow-hidden rounded-2xl border border-white/10">
                        <CitizenRouteMap
                          {...mapContext}
                          center={exitWaypoints[0] || mapCenter}
                          route={exitWaypoints}
                          youAreAt={youAreAt}
                          destination={{ at: exit.gateAt, name: exit.gateName || exit.recommendedGateId }}
                          height="240px"
                        />
                      </div>
                    ) : (
                      // Gate found but no drawable geometry — don't leave a blank box
                      <p className="flex items-start gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-xs leading-5 text-slate-400">
                        <Info size={14} className="mt-0.5 shrink-0 text-cyan-300" />
                        {t("guidanceFallback")}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* SOS */}
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={triggerSos}
                disabled={sosBusy}
                className="flex w-full items-center justify-center gap-3 rounded-[2rem] border border-red-500/40 bg-gradient-to-b from-red-500/25 to-red-600/15 px-5 py-5 text-lg font-bold text-red-100 shadow-lg shadow-red-900/30 transition hover:from-red-500/35 disabled:opacity-60"
                aria-label={t("sos")}
              >
                {sosBusy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Siren className="h-6 w-6" />}
                {t("sos")}
              </motion.button>

              {/* Report an issue */}
              <div className={CARD}>
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <AlertTriangle size={15} className="text-amber-300" />
                  {t("reportTitle")}
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {REPORT_CATEGORIES.map((c) => {
                    const Icon = c.icon;
                    const active = reportCat === c.value;
                    return (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setReportCat(active ? null : c.value)}
                        className={`flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-xs font-medium transition ${
                          active ? "border-cyan-400/40 bg-cyan-400/10 text-white" : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20"
                        }`}
                      >
                        <Icon size={18} className={active ? "text-cyan-300" : "text-slate-400"} />
                        {c.label[lang] || c.label.en}
                      </button>
                    );
                  })}
                </div>
                <textarea
                  value={reportNote}
                  onChange={(e) => setReportNote(e.target.value)}
                  rows={2}
                  placeholder={t("notePlaceholder")}
                  className="mt-3 w-full resize-none rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:bg-slate-950"
                />
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={submitReport}
                  disabled={!reportCat || reportBusy}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 px-5 py-3 text-sm font-semibold text-slate-950 transition disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {reportBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {t("submit")}
                </motion.button>
              </div>

              <p className="px-2 pt-1 text-center text-[11px] leading-5 text-slate-500">{t("footerNote")}</p>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Presentational helpers                                              */
/* ------------------------------------------------------------------ */

/**
 * The one thing on this screen that must be readable at a glance, outdoors,
 * while walking: the latest announcement aimed at this crowd. Colour is carried
 * by severity, the copy by the citizen's chosen language, and a critical notice
 * breathes so it can't be mistaken for chrome.
 */
function BroadcastBanner({ broadcast, lang, t, onAck }) {
  const tone = broadcastTone(broadcast.severity);
  const Icon = tone.icon;
  const text = broadcast.messages?.[lang] ?? broadcast.message;
  const fromAgent = broadcast.source === "agent";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.98 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      role="status"
      aria-live={broadcast.severity === "critical" ? "assertive" : "polite"}
      className={`relative overflow-hidden rounded-[1.75rem] border shadow-lg shadow-black/30 backdrop-blur-xl ${tone.wrap}`}
    >
      {/* Critical announcements get a slow breathing wash behind the text */}
      {tone.pulse && (
        <motion.span
          aria-hidden="true"
          animate={{ opacity: [0.12, 0.34, 0.12] }}
          transition={{ duration: 1.9, repeat: Infinity, ease: "easeInOut" }}
          className="pointer-events-none absolute inset-0 bg-red-500"
        />
      )}

      <div className="relative flex items-start gap-3 px-4 py-4">
        <motion.span
          animate={tone.pulse ? { scale: [1, 1.12, 1] } : undefined}
          transition={tone.pulse ? { duration: 1.9, repeat: Infinity, ease: "easeInOut" } : undefined}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-black/25"
        >
          <Icon className={`h-6 w-6 ${tone.accent}`} />
        </motion.span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] opacity-80">{t("announcement")}</span>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${tone.chip}`}
            >
              {fromAgent ? <Bot size={9} /> : <ShieldCheck size={9} />}
              {fromAgent ? t("fromAgent") : t("fromAuthority")}
            </span>
            <span className="ml-auto shrink-0 text-[10px] opacity-70">{timeAgo(broadcast.createdAt)}</span>
          </div>

          <p className="mt-2 text-base font-semibold leading-6 text-white">{text}</p>

          <button
            type="button"
            onClick={onAck}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-black/25 px-4 py-2 text-xs font-semibold text-white transition hover:bg-black/40"
          >
            <Check size={13} />
            {t("ackBroadcast")}
          </button>
        </div>

        <button
          type="button"
          onClick={onAck}
          aria-label={t("ackBroadcast")}
          className="-mr-1 -mt-1 shrink-0 rounded-xl p-2 opacity-70 transition hover:bg-white/10 hover:opacity-100"
        >
          <X size={16} />
        </button>
      </div>
    </motion.div>
  );
}

function SharingPill({ sharing, locating, hasFix, geoDenied, onEnable, t }) {
  if (sharing && locating) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1.5 text-[11px] font-medium text-amber-200">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" />
        {t("locating")}
      </span>
    );
  }
  if (sharing && hasFix) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-medium text-emerald-200">
        <LocateFixed className="h-3 w-3" />
        {t("sharingLive")}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onEnable}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-slate-300 transition hover:border-cyan-400/30 hover:text-white"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
      {geoDenied ? t("locationOff") : t("browseOnly")}
      <span className="text-cyan-300">· {t("enableShare")}</span>
    </button>
  );
}

function FeedPill({ status }) {
  const badge = FEED_BADGE[status] || FEED_BADGE.connecting;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium ${badge.ring}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
      {badge.label}
    </span>
  );
}
