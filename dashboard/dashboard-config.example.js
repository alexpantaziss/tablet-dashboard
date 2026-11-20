/* dashboard-config.example.js: ΠΡΟΤΥΠΟ
   Αντίγραψέ το ως dashboard-config.js, συμπλήρωσε τις τιμές σου και ανέβασέ το στο tablet μαζί με τα υπόλοιπα.
   Το dashboard-config.js δεν ανεβαίνει ποτέ στο GitHub (.gitignore). Ό,τι αφήσεις κενό απλώς δεν εμφανίζεται. */
var LOCAL = {
  // Τιμές που αντικαθιστούν τις αντίστοιχες του CONFIG στο dashboard.html
  CONFIG: {
    NAME: "",                                                    // για το "Καλησπέρα, ..." (σε κλητική)
    LOCATION: { name: "Αθήνα", lat: 37.9755, lon: 23.7348 },     // καιρός, αέρας, αποστάσεις φαρμακείων
    OASA_STOPS: [
      // κωδικός στάσης από το telematics.oasa.gr. daily: πόσες αφίξεις στην απλή λειτουργία (σύνολο 3 θέσεις)
      { code: "790038", label: "Προς Αθήνα", lines: [], daily: 2 },
      { code: "790026", label: "Προς Αρτέμιδα", lines: [], daily: 2 }
    ],
    WORK: { label: "Γραφείο", address: "", lat: null, lon: null },
    VPN: { homeIspKeywords: [], appPackage: "com.nordvpn.android" }
  },

  // Εφημερεύοντα φαρμακεία: η σελίδα της περιοχής σου, π.χ. "https://www.vrisko.gr/efimeries-farmakeion/<περιοχή>/"
  PHARM_URL: "",

  // Telegram bot: token από @BotFather, chatId από το https://api.telegram.org/bot<token>/getUpdates
  TELEGRAM: { botToken: "", chatId: "" },

  // Ημερολόγια iCal (δημόσιο link iCloud, "Μυστική διεύθυνση iCal" του Google, ICS του Outlook).
  // Τα χρώματα φαίνονται πάντα μαζί με το όνομα. Απόφυγε πράσινο/κίτρινο/κόκκινο (σημαίνουν κατάσταση).
  CALENDARS: [
    // { name: "Σπίτι", color: "#64d2ff", url: "webcal://..." },
    // { name: "Δουλειά", color: "#bf9cff", url: "https://.../calendar.ics" },
    { name: "Αργίες", color: "#ff8fb1", url: "https://calendar.google.com/calendar/ical/el.greek%23holiday%40group.v.calendar.google.com/public/basic.ics" }
  ],

  // Spotify: εφαρμογή στο developer.spotify.com με Redirect URI http://127.0.0.1:8888/callback.
  // Το refreshToken βγαίνει με: CLIENT_ID=... CLIENT_SECRET=... node tools/spotify-auth.mjs dashboard/dashboard-config.js
  SPOTIFY: { clientId: "", clientSecret: "", refreshToken: "" }
};
