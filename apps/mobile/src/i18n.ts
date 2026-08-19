import { DEFAULT_LANGUAGE, type LanguageCode } from "@crowdshield/config";

/**
 * The app's copy, in the three languages the product speaks.
 *
 * Carried over from the web client's `STRINGS` table so the two apps say the
 * same things — a citizen who used the website and then installed the app should
 * not have to relearn the wording. Mobile-only keys (tabs, updater, push) are
 * added at the end.
 *
 * A missing key falls back to English rather than showing the key, because a raw
 * `exitBtnAgain` on screen is worse than an untranslated sentence.
 */

const en = {
  /* --- identity --- */
  appName: "CrowdShield",
  tagline: "Citizen safety companion",

  /* --- first run --- */
  restoring: "Restoring your session…",
  chooseLanguage: "Choose your language",
  languageNote: "Alerts, announcements and the AI assistant will all speak this language.",
  continue: "Continue",

  /* --- auth --- */
  welcomeBack: "Welcome back",
  signInSubtitle: "Sign in to get live safety guidance.",
  identifierLabel: "Mobile or email",
  passwordLabel: "Password",
  signIn: "Sign in",
  signingIn: "Signing in…",
  keepSignedIn: "Keep me signed in",
  newHere: "New here?",
  createAccount: "Create an account",
  signOut: "Sign out",
  privacyFooter: "Your identity is never attached to location data.",

  /* --- event picker --- */
  pickTitle: "Choose your event",
  pickSubtitle: "Pick where you are to get live crowd safety and guidance.",
  loadingEvents: "Loading events…",
  noEvents: "No live or upcoming events right now. Check back soon.",
  ongoing: "Ongoing",
  upcoming: "Upcoming",
  awayUnit: "away",
  gatesLabel: "gates",
  covered: "covered",
  changeEvent: "Change event",
  retry: "Try again",

  /* --- consent --- */
  consentTitle: "Your privacy comes first",
  consentBody:
    "We share only your approximate location as anonymized data — the system sees hexagons, not people. No cameras, ever.",
  b1: "Anonymized location only — never your identity",
  b2: "The system sees density hexagons, not individuals",
  b3: "Stop anytime — one tap, or just close the app",
  consentWhy:
    "Why it helps: your phone is the only sensor this system has. More people sharing means earlier warning for everyone around you.",
  shareBtn: "Share my location & continue",
  browseBtn: "Not now — just show alerts",

  /* --- home --- */
  situation: "Current situation",
  estCrowd: "Estimated crowd",
  yourZone: "Your zone",
  updated: "Updated",
  justNow: "now",
  allClear: "All clear in your area",
  crowdingNearby: "Crowding building nearby",
  levelUnknown: "Crowd level unknown",
  unknownBody: "Nobody nearby is sharing location right now",
  unknownNote:
    "This is not the same as \"all clear\" — we simply have no readings here. Trust what you can see and follow on-site staff.",
  movingFreely: "moving freely",
  aheadOfYou: "ahead of you",
  liveAlerts: "Live alerts",
  noAlerts: "No alerts right now",
  noAlertsNote: "You'll be notified the moment anything changes",
  criticalIn: "Critical in",
  eventControl: "Event control",
  aiAdvisory: "AI advisory",
  gotIt: "Got it",
  showExit: "Show me the safest way out",

  /* --- offline --- */
  offlineBanner: "Offline — showing last known guidance",
  noSignal: "No signal",
  stillAvailable: "Still available offline",
  cachedRoute: "Cached route",
  sosQueued: "Queued and sent the moment signal returns",
  reportSaved: "Saved on device until you reconnect",

  /* --- map --- */
  mapTitle: "Live map",
  recentre: "Recentre",
  density: "Density",
  youAreHere: "You are here",
  routeMeAway: "Route me away from here",
  inArea: "in area",
  /* --- navigation / destinations --- */
  goTitle: "Where to?",
  exitTitle: "Need to get out?",
  exitBody: "We'll pick the calmest open gate and draw the way there.",
  exitBtn: "Safest way out",
  exitBtnAgain: "Find another way out",
  exitFinding: "Finding the safest exit…",
  exitNeedGps: "Turn on location sharing to find your safest exit.",
  orPickDestination: "Or pick a destination",
  noDestinations: "No destinations published for this venue yet.",
  open: "Open",
  busy: "Busy",
  closed: "Closed",
  closedByControl: "Closed by event control",
  antiHerdNote:
    "Routes avoid dense streets. If several good routes exist we vary them slightly, so everyone isn't sent down one road.",
  headingFor: "Heading for",
  arrive: "Arrive",
  distance: "Distance",
  walkTime: "Walk time",
  routeCondition: "Route condition",
  measured: "Measured",
  notMeasured: "Not measured",
  unmeasuredStretch: "of this route has no readings — stay alert on those stretches.",
  anotherWay: "Another way",
  holdWarn: "Hold briefly and let the crowd ahead clear before moving.",
  needLocation: "Turn on location sharing to get routing.",
  guidanceLoading: "Finding the safest route…",
  exitUnavailable: "No exit route available right now — follow marshals and on-site staff.",
  exitRisky: "Every route out is busy right now. Move calmly with the marshals — do not run.",

  /* --- SOS --- */
  sos: "SOS — I need help",
  sosConfirmTitle: "Send an emergency alert?",
  sosConfirmBody: "Your location goes to event control immediately.",
  sosWhatSent: "What will be sent",
  sosItem1: "Your exact position, once",
  sosItem2: "The time you pressed it",
  sosItem3: "Your event",
  sosAlsoShout:
    "Also shout for the nearest marshal. A person beside you will always reach you faster than the control room can.",
  sosHold: "Hold to confirm",
  sosSending: "Sending…",
  cancel: "Cancel",
  sosSent: "Alert sent. Event control can see your location.",
  sosFail: "Couldn't send SOS. Try again or alert nearby staff.",

  /* --- report --- */
  reportTitle: "Report an issue",
  reportSubtitle: "Seen something? Tell control.",
  reportWhat: "What are you reporting?",
  notePlaceholder: "Add a note (optional)",
  attachLocation: "Attach my location",
  attachLocationNote: "Helps control find it. You can turn this off.",
  submit: "Submit report",
  submitting: "Sending…",
  reportToast: "Report sent. Thank you for keeping everyone safe.",
  reportFail: "Couldn't submit report. Please try again.",
  reportNote: "Reports go to the control room's incident feed.",

  /* --- assistant --- */
  assistantTitle: "CrowdShield AI",
  assistantStatus: "Your safety companion",
  assistantEmpty: "Need help getting around?",
  assistantBlurb: "Ask me the safest way out, how busy it is near you, or how to reach somewhere.",
  assistantPlaceholder: "Ask where to go, what to avoid…",
  assistantThinking: "Thinking…",
  q1: "What's the safest way out from here?",
  q2: "How crowded is it around me?",
  q3: "Which streets should I avoid?",
  q4: "How do I report a blocked route?",
  stop: "Stop",

  /* --- settings --- */
  moreTitle: "More",
  sharingLocation: "Sharing location",
  sharingSub: "Anonymised · every 4 seconds",
  sharingOffNote:
    "Turn this off and you keep alerts and announcements, but lose personal routing.",
  preferences: "Preferences",
  language: "Language",
  alerts: "Alerts",
  alertsSub: "Critical alerts always sound",
  yourData: "Your data",
  whatWeCollect: "What we collect",
  whatWeCollectSub: "Approximate location only. No cameras, ever.",
  appVersion: "App version",
  checkUpdate: "Check for updates",
  footerNote: "In an emergency, always follow on-site staff and official instructions.",

  /* --- status pills --- */
  live: "Live",
  sharingLive: "Sharing • live",
  browseOnly: "Browse only",
  locating: "Locating…",
  locationOff: "Location off",
  enable: "Enable",
  connecting: "Connecting to live feed…",
  waiting: "Waiting for live data…",

  /* --- tabs --- */
  tabHome: "Home",
  tabMap: "Map",
  tabGo: "Go",
  tabAssistant: "Assistant",
  tabMore: "More",

  /* --- updater --- */
  updateAvailable: "Update available",
  updateCurrent: "You're up to date",
  updateChecking: "Checking for updates…",
  updateFailed: "Couldn't check for updates.",
  updateNewVersion: "New version",
  updateInstalled: "Installed",
  updateDownload: "Download & install",
  updateDownloading: "Downloading…",
  updateInstallPrompt: "Opening the installer. Allow installs from CrowdShield if Android asks.",
  updateNotes: "What's new",
  updateLater: "Later",
  updateNoApk: "This release has no Android package attached.",
} as const;

export type StringKey = keyof typeof en;

/**
 * Hindi. Where a term is a proper noun in the data (a gate or street name) it is
 * deliberately left as the data spells it — a translated street name is a street
 * nobody can ask for directions to.
 */
const hi: Partial<Record<StringKey, string>> = {
  tagline: "नागरिक सुरक्षा साथी",
  restoring: "आपका सत्र बहाल हो रहा है…",
  chooseLanguage: "अपनी भाषा चुनें",
  languageNote: "अलर्ट, घोषणाएँ और AI सहायक इसी भाषा में बात करेंगे।",
  continue: "जारी रखें",

  welcomeBack: "वापसी पर स्वागत है",
  signInSubtitle: "लाइव सुरक्षा मार्गदर्शन पाने के लिए साइन इन करें।",
  identifierLabel: "मोबाइल या ईमेल",
  passwordLabel: "पासवर्ड",
  signIn: "साइन इन करें",
  signingIn: "साइन इन हो रहा है…",
  keepSignedIn: "मुझे साइन इन रखें",
  newHere: "नए हैं?",
  createAccount: "खाता बनाएँ",
  signOut: "साइन आउट",
  privacyFooter: "आपकी पहचान कभी स्थान डेटा से नहीं जोड़ी जाती।",

  pickTitle: "अपना कार्यक्रम चुनें",
  pickSubtitle: "लाइव भीड़ सुरक्षा और मार्गदर्शन पाने के लिए अपना स्थान चुनें।",
  loadingEvents: "कार्यक्रम लोड हो रहे हैं…",
  noEvents: "अभी कोई लाइव या आगामी कार्यक्रम नहीं है। थोड़ी देर बाद देखें।",
  ongoing: "चल रहा है",
  upcoming: "आगामी",
  changeEvent: "कार्यक्रम बदलें",
  retry: "पुनः प्रयास करें",

  consentTitle: "आपकी निजता सर्वोपरि है",
  consentBody:
    "हम केवल आपके अनुमानित स्थान को अनाम डेटा के रूप में साझा करते हैं — सिस्टम लोगों को नहीं, केवल हेक्सागोन देखता है। कोई कैमरा नहीं।",
  b1: "केवल अनाम स्थान — कभी आपकी पहचान नहीं",
  b2: "सिस्टम घनत्व हेक्सागोन देखता है, व्यक्ति नहीं",
  b3: "कभी भी रोकें — एक टैप, या ऐप बंद कर दें",
  shareBtn: "मेरा स्थान साझा करें और जारी रखें",
  browseBtn: "अभी नहीं — केवल अलर्ट दिखाएँ",

  situation: "वर्तमान स्थिति",
  estCrowd: "अनुमानित भीड़",
  yourZone: "आपका क्षेत्र",
  updated: "अद्यतन",
  justNow: "अभी",
  allClear: "आपके क्षेत्र में सब ठीक है",
  crowdingNearby: "पास में भीड़ बढ़ रही है",
  levelUnknown: "भीड़ का स्तर अज्ञात",
  unknownBody: "आपके आस-पास कोई स्थान साझा नहीं कर रहा है",
  unknownNote:
    "यह \"सब ठीक है\" जैसा नहीं है — हमारे पास यहाँ कोई रीडिंग नहीं है। जो आप देख सकते हैं उस पर भरोसा करें और स्टाफ़ का पालन करें।",
  liveAlerts: "लाइव अलर्ट",
  noAlerts: "अभी कोई अलर्ट नहीं",
  criticalIn: "गंभीर होने में",
  eventControl: "कार्यक्रम नियंत्रण",
  gotIt: "समझ गया",
  showExit: "सबसे सुरक्षित रास्ता दिखाएँ",

  goTitle: "कहाँ जाना है?",
  exitTitle: "बाहर निकलना है?",
  exitBody: "हम सबसे शांत खुला गेट चुनकर रास्ता बनाएँगे।",
  exitBtn: "सबसे सुरक्षित रास्ता",
  exitFinding: "सबसे सुरक्षित निकास खोजा जा रहा है…",
  exitNeedGps: "अपना सुरक्षित निकास पाने के लिए स्थान साझा करना चालू करें।",
  orPickDestination: "या एक गंतव्य चुनें",
  noDestinations: "इस स्थल के लिए अभी कोई गंतव्य नहीं है।",
  open: "खुला",
  busy: "व्यस्त",
  closed: "बंद",
  closedByControl: "कार्यक्रम नियंत्रण द्वारा बंद",
  headingFor: "गंतव्य",
  distance: "दूरी",
  walkTime: "पैदल समय",
  routeCondition: "मार्ग स्थिति",
  notMeasured: "मापा नहीं गया",
  guidanceLoading: "सबसे सुरक्षित मार्ग खोजा जा रहा है…",
  holdWarn: "थोड़ी देर रुकें और आगे की भीड़ को साफ़ होने दें।",
  needLocation: "मार्ग पाने के लिए स्थान साझा करना चालू करें।",

  sos: "SOS — मुझे मदद चाहिए",
  sosConfirmTitle: "आपातकालीन अलर्ट भेजें?",
  sosConfirmBody: "आपका स्थान तुरंत कार्यक्रम नियंत्रण को भेजा जाएगा।",
  sosAlsoShout:
    "पास के मार्शल को भी आवाज़ दें। आपके बगल में खड़ा व्यक्ति नियंत्रण कक्ष से हमेशा तेज़ पहुँचेगा।",
  sosHold: "पुष्टि के लिए दबाए रखें",
  sosSending: "भेजा जा रहा है…",
  cancel: "रद्द करें",
  sosSent: "अलर्ट भेजा गया। कार्यक्रम नियंत्रण आपका स्थान देख सकता है।",
  sosFail: "SOS नहीं भेजा जा सका। पुनः प्रयास करें या पास के स्टाफ़ को बताएँ।",

  reportTitle: "समस्या की सूचना दें",
  reportWhat: "आप किसकी सूचना दे रहे हैं?",
  notePlaceholder: "एक टिप्पणी जोड़ें (वैकल्पिक)",
  attachLocation: "मेरा स्थान जोड़ें",
  submit: "रिपोर्ट भेजें",
  submitting: "भेजा जा रहा है…",
  reportToast: "रिपोर्ट भेजी गई। सबको सुरक्षित रखने के लिए धन्यवाद।",
  reportFail: "रिपोर्ट नहीं भेजी जा सकी। कृपया पुनः प्रयास करें।",

  assistantStatus: "आपका सुरक्षा साथी",
  assistantEmpty: "रास्ता खोजने में मदद चाहिए?",
  assistantPlaceholder: "पूछें कहाँ जाएँ, किससे बचें…",
  assistantThinking: "सोच रहा है…",
  q1: "यहाँ से सबसे सुरक्षित रास्ता क्या है?",
  q2: "मेरे आस-पास कितनी भीड़ है?",
  q3: "मुझे किन सड़कों से बचना चाहिए?",

  moreTitle: "अधिक",
  sharingLocation: "स्थान साझा करना",
  preferences: "प्राथमिकताएँ",
  language: "भाषा",
  alerts: "अलर्ट",
  yourData: "आपका डेटा",
  whatWeCollect: "हम क्या एकत्र करते हैं",
  appVersion: "ऐप संस्करण",
  checkUpdate: "अपडेट जाँचें",
  footerNote: "आपात स्थिति में, हमेशा साइट स्टाफ़ और आधिकारिक निर्देशों का पालन करें।",

  live: "लाइव",
  sharingLive: "साझा हो रहा है • लाइव",
  browseOnly: "केवल ब्राउज़",
  locating: "स्थान खोजा जा रहा है…",
  locationOff: "स्थान बंद",
  enable: "चालू करें",
  connecting: "लाइव फ़ीड से जुड़ रहे हैं…",
  waiting: "लाइव डेटा की प्रतीक्षा…",
  offlineBanner: "ऑफ़लाइन — अंतिम ज्ञात मार्गदर्शन दिखा रहे हैं",
  noSignal: "सिग्नल नहीं",

  tabHome: "होम",
  tabMap: "नक्शा",
  tabGo: "जाएँ",
  tabAssistant: "सहायक",
  tabMore: "अधिक",

  updateAvailable: "अपडेट उपलब्ध",
  updateCurrent: "आप अद्यतित हैं",
  updateChecking: "अपडेट जाँच रहे हैं…",
  updateDownload: "डाउनलोड और इंस्टॉल",
  updateDownloading: "डाउनलोड हो रहा है…",
  updateNotes: "क्या नया है",
  updateLater: "बाद में",
};

/** Odia. */
const or: Partial<Record<StringKey, string>> = {
  tagline: "ନାଗରିକ ସୁରକ୍ଷା ସାଥୀ",
  restoring: "ଆପଣଙ୍କ ସେସନ୍ ପୁନଃସ୍ଥାପିତ ହେଉଛି…",
  chooseLanguage: "ଆପଣଙ୍କ ଭାଷା ବାଛନ୍ତୁ",
  languageNote: "ଆଲର୍ଟ, ଘୋଷଣା ଏବଂ AI ସହାୟକ ଏହି ଭାଷାରେ କଥା ହେବେ।",
  continue: "ଜାରି ରଖନ୍ତୁ",

  welcomeBack: "ପୁନଃ ସ୍ୱାଗତ",
  signInSubtitle: "ଲାଇଭ୍ ସୁରକ୍ଷା ମାର୍ଗଦର୍ଶନ ପାଇବାକୁ ସାଇନ୍ ଇନ୍ କରନ୍ତୁ।",
  identifierLabel: "ମୋବାଇଲ୍ କିମ୍ବା ଇମେଲ୍",
  passwordLabel: "ପାସୱାର୍ଡ",
  signIn: "ସାଇନ୍ ଇନ୍",
  signOut: "ସାଇନ୍ ଆଉଟ୍",

  pickTitle: "ଆପଣଙ୍କ କାର୍ଯ୍ୟକ୍ରମ ବାଛନ୍ତୁ",
  pickSubtitle: "ଲାଇଭ୍ ଭିଡ଼ ସୁରକ୍ଷା ପାଇବାକୁ ଆପଣ କେଉଁଠି ଅଛନ୍ତି ବାଛନ୍ତୁ।",
  loadingEvents: "କାର୍ଯ୍ୟକ୍ରମ ଲୋଡ୍ ହେଉଛି…",
  noEvents: "ବର୍ତ୍ତମାନ କୌଣସି କାର୍ଯ୍ୟକ୍ରମ ନାହିଁ। ପରେ ଦେଖନ୍ତୁ।",
  ongoing: "ଚାଲୁଅଛି",
  upcoming: "ଆସୁଥିବା",
  changeEvent: "କାର୍ଯ୍ୟକ୍ରମ ବଦଳାନ୍ତୁ",

  consentTitle: "ଆପଣଙ୍କ ଗୋପନୀୟତା ପ୍ରଥମ",
  consentBody:
    "ଆମେ କେବଳ ଆପଣଙ୍କ ଆନୁମାନିକ ସ୍ଥାନ ଅନାମ ତଥ୍ୟ ଭାବରେ ସେୟାର କରୁ — ସିଷ୍ଟମ ଲୋକ ନୁହେଁ, ହେକ୍ସାଗନ୍ ଦେଖେ। କୌଣସି କ୍ୟାମେରା ନାହିଁ।",
  b1: "କେବଳ ଅନାମ ସ୍ଥାନ — କଦାପି ଆପଣଙ୍କ ପରିଚୟ ନୁହେଁ",
  b2: "ସିଷ୍ଟମ ଘନତ୍ୱ ହେକ୍ସାଗନ୍ ଦେଖେ, ବ୍ୟକ୍ତି ନୁହେଁ",
  b3: "ଯେତେବେଳେ ବି ବନ୍ଦ କରନ୍ତୁ — ଏକ ଟ୍ୟାପ୍",
  shareBtn: "ମୋର ସ୍ଥାନ ସେୟାର କରି ଜାରି ରଖନ୍ତୁ",
  browseBtn: "ବର୍ତ୍ତମାନ ନୁହେଁ — କେବଳ ଆଲର୍ଟ ଦେଖାନ୍ତୁ",

  situation: "ବର୍ତ୍ତମାନ ପରିସ୍ଥିତି",
  estCrowd: "ଆନୁମାନିକ ଭିଡ଼",
  yourZone: "ଆପଣଙ୍କ କ୍ଷେତ୍ର",
  allClear: "ଆପଣଙ୍କ କ୍ଷେତ୍ରରେ ସବୁ ଠିକ୍ ଅଛି",
  crowdingNearby: "ପାଖରେ ଭିଡ଼ ବଢ଼ୁଛି",
  levelUnknown: "ଭିଡ଼ ସ୍ତର ଅଜ୍ଞାତ",
  unknownBody: "ଆପଣଙ୍କ ପାଖରେ କେହି ସ୍ଥାନ ସେୟାର କରୁନାହାନ୍ତି",
  liveAlerts: "ଲାଇଭ୍ ଆଲର୍ଟ",
  noAlerts: "ବର୍ତ୍ତମାନ କୌଣସି ଆଲର୍ଟ ନାହିଁ",
  eventControl: "କାର୍ଯ୍ୟକ୍ରମ ନିୟନ୍ତ୍ରଣ",
  gotIt: "ବୁଝିଲି",
  showExit: "ସୁରକ୍ଷିତ ବାହାରିବା ରାସ୍ତା ଦେଖାନ୍ତୁ",

  goTitle: "କେଉଁଆଡ଼େ?",
  exitTitle: "ବାହାରିବାକୁ ପଡ଼ିବ?",
  exitBtn: "ସୁରକ୍ଷିତ ରାସ୍ତା",
  orPickDestination: "କିମ୍ବା ଏକ ଗନ୍ତବ୍ୟ ବାଛନ୍ତୁ",
  open: "ଖୋଲା",
  busy: "ବ୍ୟସ୍ତ",
  closed: "ବନ୍ଦ",
  distance: "ଦୂରତା",
  walkTime: "ଚାଲିବା ସମୟ",
  notMeasured: "ମାପ ହୋଇନାହିଁ",

  sos: "SOS — ମୋତେ ସାହାଯ୍ୟ ଦରକାର",
  sosConfirmTitle: "ଆପାତକାଳୀନ ଆଲର୍ଟ ପଠାଇବେ?",
  sosHold: "ନିଶ୍ଚିତ କରିବାକୁ ଧରି ରଖନ୍ତୁ",
  sosSending: "ପଠାଯାଉଛି…",
  cancel: "ବାତିଲ୍",

  reportTitle: "ଏକ ସମସ୍ୟା ଜଣାନ୍ତୁ",
  reportWhat: "ଆପଣ କଣ ଜଣାଉଛନ୍ତି?",
  notePlaceholder: "ଏକ ଟିପ୍ପଣୀ ଯୋଡ଼ନ୍ତୁ (ଇଚ୍ଛାଧୀନ)",
  submit: "ରିପୋର୍ଟ ପଠାନ୍ତୁ",

  assistantStatus: "ଆପଣଙ୍କ ସୁରକ୍ଷା ସାଥୀ",
  assistantPlaceholder: "ପଚାରନ୍ତୁ କେଉଁଆଡ଼େ ଯିବେ…",

  moreTitle: "ଅଧିକ",
  language: "ଭାଷା",
  alerts: "ଆଲର୍ଟ",
  yourData: "ଆପଣଙ୍କ ତଥ୍ୟ",
  appVersion: "ଆପ୍ ସଂସ୍କରଣ",
  checkUpdate: "ଅପଡେଟ୍ ଯାଞ୍ଚ କରନ୍ତୁ",

  live: "ଲାଇଭ୍",
  locationOff: "ସ୍ଥାନ ବନ୍ଦ",
  enable: "ଚାଲୁ କରନ୍ତୁ",

  tabHome: "ହୋମ୍",
  tabMap: "ମ୍ୟାପ୍",
  tabGo: "ଯାଆନ୍ତୁ",
  tabAssistant: "ସହାୟକ",
  tabMore: "ଅଧିକ",
};

const TABLES: Record<LanguageCode, Partial<Record<StringKey, string>>> = { en, hi, or };

/** Build a translator for a language. Missing keys fall back to English. */
export function translator(lang: LanguageCode) {
  const table = TABLES[lang] ?? TABLES[DEFAULT_LANGUAGE];
  return (key: StringKey): string => table[key] ?? en[key] ?? key;
}

export type Translate = ReturnType<typeof translator>;
