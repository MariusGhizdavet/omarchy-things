.pragma library

// Logica fără ecran a widget-ului Things: ce intră în fiecare vedere, în ce
// ordine, cum se citește o dată scrisă de om și ce înseamnă o linie de
// quick-add. Nimic de aici nu atinge QML — funcții pure peste instantaneul
// scris de bin/things-preia, ca panoul să rămână doar desen.

// ------------------------------------------------------------------ vederi
//
// Ordinea e a barei laterale din Things, ca cine vine din aplicație să
// găsească vederile unde le știe. „projects" nu e o vedere a CLI-ului — se
// compune aici din lista de proiecte.

var VEDERI = ["today", "upcoming", "anytime", "someday", "inbox", "projects", "logbook"]

// Codepoint-urile sunt scrise în comentariu fiindcă glifele vecine din
// tabelul Nerd Font desenează cu totul altceva — U+F00B3, la o cifră
// distanță de ce părea „arhivă”, e chiar simbolul Bluetooth. Fiecare a fost
// verificată desenată, nu după nume.
var PICTOGRAME = {
  today: "󰓎",      // U+F04CE stea plină
  upcoming: "󰃭",   // U+F00ED calendar
  anytime: "󰌨",    // U+F0328 straturi suprapuse
  someday: "󰆧",    // U+F01A7 cutie
  inbox: "󰚇",      // U+F0687 tăviță
  projects: "󰉖",   // U+F0256 dosar
  logbook: "󰗡"     // U+F05E1 bifă în cerc
}

function instantaneuGol() {
  return {
    ok: true,
    error: "",
    errorKind: "",
    syncError: "",
    at: 0,
    today: "",
    tasks: {},
    views: {},
    projects: [],
    areas: [],
    tags: [],
    counts: {}
  }
}

// Instantaneul vine dintr-un JSON.parse peste ieșirea helperului, deci poate
// fi orice dacă helperul a murit la jumătate. Se completează cu formele goale
// în loc să lăsăm panoul să indexeze în undefined.
function normalizeazaInstantaneu(brut) {
  var gol = instantaneuGol()
  if (!brut || typeof brut !== "object") {
    return gol
  }
  gol.ok = brut.ok !== false
  gol.error = String(brut.error || "")
  gol.errorKind = String(brut.errorKind || "")
  gol.syncError = String(brut.syncError || "")
  gol.at = Number(brut.at) || 0
  gol.today = String(brut.today || "")
  gol.tasks = brut.tasks && typeof brut.tasks === "object" ? brut.tasks : {}
  gol.views = brut.views && typeof brut.views === "object" ? brut.views : {}
  gol.projects = Array.isArray(brut.projects) ? brut.projects : []
  gol.areas = Array.isArray(brut.areas) ? brut.areas : []
  gol.tags = Array.isArray(brut.tags) ? brut.tags : []
  gol.counts = brut.counts && typeof brut.counts === "object" ? brut.counts : {}
  return gol
}

function taskDupaId(instantaneu, id) {
  if (!instantaneu || !instantaneu.tasks) {
    return null
  }
  return instantaneu.tasks[id] || null
}

// Task-urile unei vederi, în ordinea dată de listele de id-uri ale CLI-ului.
// Un id fără task (task șters între două instantanee) se sare, nu produce o
// gaură în listă.
function taskuriVedere(instantaneu, vedere) {
  var ids = (instantaneu.views && instantaneu.views[vedere]) || []
  var lista = []
  for (var i = 0; i < ids.length; i++) {
    var task = taskDupaId(instantaneu, ids[i])
    if (task) {
      lista.push(task)
    }
  }
  return lista
}

function numara(instantaneu, vedere) {
  if (vedere === "projects") {
    return (instantaneu.projects || []).length
  }
  var c = instantaneu.counts || {}
  if (c[vedere] !== undefined) {
    return c[vedere]
  }
  return taskuriVedere(instantaneu, vedere).length
}

// Numărul care merită arătat în bară pentru o vedere. Logbook-ul e o arhivă,
// deci „31 de intrări în ultimele două săptămâni" nu spune nimic — ce spune
// ceva e câte ai bifat azi.
function numarBara(instantaneu, vedere) {
  if (vedere === "logbook") {
    return (instantaneu.counts || {}).doneToday || 0
  }
  return numara(instantaneu, vedere)
}

// --------------------------------------------------------------------- date

function douaCifre(n) {
  return (n < 10 ? "0" : "") + n
}

function iso(d) {
  return d.getFullYear() + "-" + douaCifre(d.getMonth() + 1) + "-" + douaCifre(d.getDate())
}

// Un „YYYY-MM-DD" citit ca dată locală, nu UTC. `new Date("2026-09-10")` dă
// miezul nopții UTC, care în vest e încă ziua de 9 — de aici task-uri care
// apăreau cu o zi mai devreme decât le programase omul.
function dinIso(text) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || ""))
  if (!m) {
    return null
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function adaugaZile(d, zile) {
  var copie = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  copie.setDate(copie.getDate() + zile)
  return copie
}

// Distanța în zile calendaristice, nu în intervale de 24h: ce contează e dacă
// data e „mâine", nu dacă sunt 24 de ore până la ea.
function zileIntre(deLa, panaLa) {
  var a = new Date(deLa.getFullYear(), deLa.getMonth(), deLa.getDate())
  var b = new Date(panaLa.getFullYear(), panaLa.getMonth(), panaLa.getDate())
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

// ------------------------------------------------------------- quick-add
//
// O linie duce tot: „cumpără lapte @sâmbătă #cumpărături +comisioane !24 aug
// -- și pâine". Se parsează aici, nu în panou, fiindcă panoul arată o
// previzualizare în timp ce scrii și trebuie să vadă exact ce va trimite.
//
//   @  când (today, tomorrow, evening, someday, anytime, sau o dată scrisă)
//   !  termen limită
//   #  proiect sau arie
//   +  etichetă
//   -- de aici încolo, notițe
//
// Marcajele se caută doar la început de cuvânt, ca o adresă de mail din titlu
// („scrie-i lui a@b.ro") să nu devină o programare.

function taieSpatii(text) {
  return String(text === undefined || text === null ? "" : text).replace(/^\s+|\s+$/g, "")
}

// Rezultatul e deja *rezolvat*: „@sâmbătă" a devenit o dată, „#cumpărături"
// a devenit id-ul proiectului. Previzualizarea de sub câmp arată exact ce va
// primi CLI-ul, nu o repovestire a ei.
//
// `instantaneu` e opțional — fără el nu se poate rezolva „#", dar restul
// merge; `azi` la fel, ca testele să poată fixa ziua.
function parseQuickAdd(linie, instantaneu, azi) {
  var acum = azi || new Date()
  var date = instantaneu || instantaneuGol()

  var rezultat = {
    title: "",
    notes: "",
    tags: [],
    when: { kind: "", value: "", date: null, text: "" },
    deadline: { kind: "", value: "", date: null, text: "" },
    container: { kind: "", id: "", title: "", text: "" },
    // Marcajele scrise dar neînțelese. Panoul le arată ca atare, ca omul să
    // vadă că „#Cumparaturii" n-a nimerit niciun proiect în loc să se mire
    // mai târziu unde a ajuns task-ul.
    unresolved: [],
    ok: false
  }

  var text = String(linie || "")

  // Notițele înghit tot ce urmează, deci se taie primele.
  var taiere = text.search(/(^|\s)--(\s|$)/)
  if (taiere >= 0) {
    var potrivire = /(^|\s)--(\s|$)/.exec(text)
    rezultat.notes = taieSpatii(text.substr(taiere + potrivire[0].length))
    text = text.substr(0, taiere)
  }

  var bucati = text.split(/\s+/)
  var titlu = []
  var curent = null

  // Un marcaj adună cuvintele până la următorul, apoi se închide rezolvând
  // *cea mai lungă* frază care înseamnă ceva. „@next saturday și încă ceva"
  // dă sâmbăta viitoare, iar „și încă ceva" se întoarce în titlu — altfel o
  // programare pusă la mijlocul frazei ar înghiți restul propoziției.
  function inchide() {
    if (!curent) {
      return
    }
    var cuvinte = curent.cuvinte
    var semn = curent.semn
    var acceptat = false

    for (var lungime = cuvinte.length; lungime >= 1 && !acceptat; lungime--) {
      var candidat = taieSpatii(cuvinte.slice(0, lungime).join(" "))
      if (candidat === "") {
        continue
      }
      if (semn === "@" || semn === "!") {
        var d = parseDataCand(candidat, acum)
        if (d.kind !== "") {
          var tinta = semn === "@" ? rezultat.when : rezultat.deadline
          tinta.kind = d.kind
          tinta.value = d.value
          tinta.date = d.date
          tinta.text = candidat
          acceptat = true
        }
      } else if (semn === "#") {
        var c = cautaContainer(date, candidat)
        if (c) {
          rezultat.container.kind = c.kind
          rezultat.container.id = c.id
          rezultat.container.title = c.title
          rezultat.container.text = candidat
          acceptat = true
        }
      }
      if (acceptat) {
        // Ce a rămas după fraza acceptată se întoarce în titlu.
        for (var r = lungime; r < cuvinte.length; r++) {
          titlu.push(cuvinte[r])
        }
      }
    }

    if (!acceptat) {
      rezultat.unresolved.push(semn + cuvinte.join(" "))
    }
    curent = null
  }

  for (var i = 0; i < bucati.length; i++) {
    var cuvant = bucati[i]
    if (cuvant === "") {
      continue
    }
    var marcaj = cuvant.charAt(0)
    if (marcaj === "+" && cuvant.length > 1) {
      inchide()
      rezultat.tags.push(cuvant.substr(1))
      continue
    }
    if ((marcaj === "@" || marcaj === "!" || marcaj === "#") && cuvant.length > 1) {
      inchide()
      curent = { semn: marcaj, cuvinte: [cuvant.substr(1)] }
      continue
    }
    if (curent) {
      curent.cuvinte.push(cuvant)
      continue
    }
    titlu.push(cuvant)
  }
  inchide()

  rezultat.title = taieSpatii(titlu.join(" "))
  rezultat.ok = rezultat.title !== ""
  return rezultat
}

// --------------------------------------------------- date scrise de om
//
// Ce acceptă câmpul „când": cuvintele Things (today / tomorrow / evening /
// someday / anytime), zilele săptămânii cu „this" / „next", „in N days",
// „aug 24", „24 aug", „12/25", „2026-09-01" — în engleză și în română,
// fiindcă panoul vorbește amândouă limbile și n-are rost să ceară engleză la
// tastare.

// Și formele articulate („vinerea viitoare", „lunea"), fiindcă în română
// prefixul stă la coadă și trage articolul după el: cine scrie „vinerea
// viitoare" nu scrie niciodată „vineri viitoare".
// Cuvintele pe care le înțelege câmpul de dată, în toate cele zece limbi ale
// panoului. Sunt un dicționar plat cuvânt → înțeles, nu un tabel pe limbă:
// omul poate avea panoul în engleză și tot să tasteze „sâmbătă", iar o
// potrivire greșită între limbi nu se poate produce — zilele se caută doar
// pentru un cuvânt singur, lunile doar alături de un număr, deci „mar" e
// marți când stă singur și martie în „24 mar".
//
// Toate cheile sunt deja normalizate (litere mici, fără diacritice), fiindcă
// tot pe forma aia ajunge și ce tastează omul: diacriticele se pierd la
// tastare mai des decât se scriu.

var ZILE = {
  "cz": 4,
  "czwartek": 4,
  "di": 2,
  "dienstag": 2,
  "dim": 0,
  "dimanche": 0,
  "do": 4,
  "dom": 0,
  "domenica": 0,
  "domingo": 0,
  "donnerstag": 4,
  "dum": 0,
  "duminica": 0,
  "fr": 5,
  "freitag": 5,
  "fri": 5,
  "friday": 5,
  "gio": 4,
  "giovedi": 4,
  "jeu": 4,
  "jeudi": 4,
  "joi": 4,
  "joia": 4,
  "jueves": 4,
  "lun": 1,
  "lundi": 1,
  "lunea": 1,
  "lunedi": 1,
  "lunes": 1,
  "luni": 1,
  "mar": 2,
  "mardi": 2,
  "martea": 2,
  "martedi": 2,
  "martes": 2,
  "marti": 2,
  "mercoledi": 3,
  "mercredi": 3,
  "mi": 3,
  "mie": 3,
  "miercoles": 3,
  "miercurea": 3,
  "miercuri": 3,
  "mittwoch": 3,
  "mo": 1,
  "mon": 1,
  "monday": 1,
  "montag": 1,
  "nd": 0,
  "niedziela": 0,
  "piatek": 5,
  "piątek": 5,
  "pn": 1,
  "poniedzialek": 1,
  "pt": 5,
  "qua": 3,
  "quarta": 3,
  "quarta-feira": 3,
  "qui": 4,
  "quinta": 4,
  "quinta-feira": 4,
  "sa": 6,
  "sab": 6,
  "sabado": 6,
  "sabato": 6,
  "sam": 6,
  "sambata": 6,
  "samedi": 6,
  "samstag": 6,
  "sat": 6,
  "saturday": 6,
  "sb": 6,
  "seg": 1,
  "segunda": 1,
  "segunda-feira": 1,
  "sex": 5,
  "sexta": 5,
  "sexta-feira": 5,
  "so": 0,
  "sobota": 6,
  "sonnabend": 6,
  "sonntag": 0,
  "sr": 3,
  "sroda": 3,
  "sun": 0,
  "sunday": 0,
  "ter": 2,
  "terca": 2,
  "terca-feira": 2,
  "thu": 4,
  "thur": 4,
  "thurs": 4,
  "thursday": 4,
  "tue": 2,
  "tues": 2,
  "tuesday": 2,
  "ven": 5,
  "vendredi": 5,
  "venerdi": 5,
  "vie": 5,
  "viernes": 5,
  "vin": 5,
  "vinerea": 5,
  "vineri": 5,
  "wed": 3,
  "wednesday": 3,
  "wt": 2,
  "wtorek": 2,
  "воскресенье": 0,
  "вс": 0,
  "вт": 2,
  "вторник": 2,
  "пн": 1,
  "понедельник": 1,
  "пт": 5,
  "пятница": 5,
  "сб": 6,
  "ср": 3,
  "среда": 3,
  "суббота": 6,
  "четверг": 4,
  "чт": 4,
  "周一": 1,
  "周三": 3,
  "周二": 2,
  "周五": 5,
  "周六": 6,
  "周四": 4,
  "周日": 0,
  "日曜": 0,
  "星期一": 1,
  "星期三": 3,
  "星期二": 2,
  "星期五": 5,
  "星期六": 6,
  "星期四": 4,
  "星期日": 0
}

var LUNI = {
  "10月": 9,
  "11月": 10,
  "12月": 11,
  "1月": 0,
  "2月": 1,
  "3月": 2,
  "4月": 3,
  "5月": 4,
  "6月": 5,
  "7月": 6,
  "8月": 7,
  "9月": 8,
  "abr": 3,
  "abril": 3,
  "ago": 7,
  "agosto": 7,
  "aout": 7,
  "apr": 3,
  "april": 3,
  "aprile": 3,
  "aprilie": 3,
  "aug": 7,
  "august": 7,
  "avr": 3,
  "avril": 3,
  "cze": 5,
  "czerwiec": 5,
  "dec": 11,
  "december": 11,
  "decembre": 11,
  "decembrie": 11,
  "dez": 11,
  "dezember": 11,
  "dezembro": 11,
  "dic": 11,
  "dicembre": 11,
  "diciembre": 11,
  "ene": 0,
  "enero": 0,
  "feb": 1,
  "febbraio": 1,
  "febrero": 1,
  "februar": 1,
  "februarie": 1,
  "february": 1,
  "fev": 1,
  "fevereiro": 1,
  "fevr": 1,
  "fevrier": 1,
  "gen": 0,
  "gennaio": 0,
  "giu": 5,
  "giugno": 5,
  "gru": 11,
  "grudzien": 11,
  "ian": 0,
  "ianuarie": 0,
  "iul": 6,
  "iulie": 6,
  "iun": 5,
  "iunie": 5,
  "jan": 0,
  "janeiro": 0,
  "januar": 0,
  "january": 0,
  "janv": 0,
  "janvier": 0,
  "juil": 6,
  "juillet": 6,
  "juin": 5,
  "jul": 6,
  "julho": 6,
  "juli": 6,
  "julio": 6,
  "july": 6,
  "jun": 5,
  "june": 5,
  "junho": 5,
  "juni": 5,
  "junio": 5,
  "kwi": 3,
  "kwiecien": 3,
  "lip": 6,
  "lipiec": 6,
  "lis": 10,
  "listopad": 10,
  "lug": 6,
  "luglio": 6,
  "lut": 1,
  "luty": 1,
  "mag": 4,
  "maggio": 4,
  "mai": 4,
  "maio": 4,
  "maj": 4,
  "mar": 2,
  "march": 2,
  "marco": 2,
  "mars": 2,
  "martie": 2,
  "marz": 2,
  "marzec": 2,
  "marzo": 2,
  "may": 4,
  "mayo": 4,
  "noi": 10,
  "noiembrie": 10,
  "nov": 10,
  "november": 10,
  "novembre": 10,
  "novembro": 10,
  "noviembre": 10,
  "oct": 9,
  "october": 9,
  "octobre": 9,
  "octombrie": 9,
  "octubre": 9,
  "oktober": 9,
  "ott": 9,
  "ottobre": 9,
  "out": 9,
  "outubro": 9,
  "paz": 9,
  "pazdziernik": 9,
  "sep": 8,
  "sept": 8,
  "september": 8,
  "septembre": 8,
  "septembrie": 8,
  "septiembre": 8,
  "set": 8,
  "setembro": 8,
  "settembre": 8,
  "sie": 7,
  "sierpien": 7,
  "sty": 0,
  "styczen": 0,
  "wrz": 8,
  "wrzesien": 8,
  "авг": 7,
  "август": 7,
  "августа": 7,
  "апрель": 3,
  "апреля": 3,
  "дек": 11,
  "декабрь": 11,
  "декабря": 11,
  "июл": 6,
  "июль": 6,
  "июля": 6,
  "июн": 5,
  "июнь": 5,
  "июня": 5,
  "май": 4,
  "март": 2,
  "марта": 2,
  "мая": 4,
  "ноя": 10,
  "ноябрь": 10,
  "ноября": 10,
  "окт": 9,
  "октябрь": 9,
  "октября": 9,
  "сен": 8,
  "сентябрь": 8,
  "сентября": 8,
  "фев": 1,
  "февраль": 1,
  "февраля": 1,
  "янв": 0,
  "январь": 0,
  "января": 0
}

// Cuvintele-găleată ale lui Things: liste, nu zile.
var GALETI = {
  "a noite": "evening",
  "a qualquer momento": "anytime",
  "a tout moment": "anytime",
  "abend": "evening",
  "abends": "evening",
  "algum dia": "someday",
  "algun dia": "someday",
  "amanha": "tomorrow",
  "any time": "anytime",
  "anytime": "anytime",
  "asta seara": "evening",
  "asta-seara": "evening",
  "astazi": "today",
  "aujourd'hui": "today",
  "aujourdhui": "today",
  "aujourd’hui": "today",
  "azi": "today",
  "candva": "someday",
  "ce soir": "evening",
  "cesoir": "evening",
  "cualquier momento": "anytime",
  "demain": "tomorrow",
  "deseara": "evening",
  "diseara": "evening",
  "domani": "tomorrow",
  "dzis": "today",
  "dzis wieczorem": "evening",
  "dzisiaj": "today",
  "en cualquier momento": "anytime",
  "esta noche": "evening",
  "estanoche": "evening",
  "evening": "evening",
  "heute": "today",
  "heute abend": "evening",
  "hoje": "today",
  "hoje a noite": "evening",
  "hoy": "today",
  "intr-o zi": "someday",
  "irgendwann": "someday",
  "irgendwann mal": "anytime",
  "jederzeit": "anytime",
  "jutro": "tomorrow",
  "kiedykolwiek": "anytime",
  "kiedys": "someday",
  "maine": "tomorrow",
  "manana": "tomorrow",
  "morgen": "tomorrow",
  "n importe quand": "anytime",
  "oggi": "today",
  "oricand": "anytime",
  "qualquer momento": "anytime",
  "quando capita": "anytime",
  "seara": "evening",
  "sera": "evening",
  "soir": "evening",
  "some day": "someday",
  "someday": "someday",
  "stasera": "evening",
  "this evening": "evening",
  "today": "today",
  "tomorrow": "tomorrow",
  "tonight": "evening",
  "un giorno": "someday",
  "un jour": "someday",
  "wieczor": "evening",
  "wieczorem": "evening",
  "вечер": "evening",
  "вечером": "evening",
  "завтра": "tomorrow",
  "когда нибудь": "anytime",
  "когда то": "someday",
  "когда-нибудь": "anytime",
  "когда-то": "someday",
  "однажды": "someday",
  "сегодня": "today",
  "сегодня вечером": "evening",
  "今天": "today",
  "今日": "today",
  "今晚": "evening",
  "将来": "someday",
  "明天": "tomorrow",
  "明日": "tomorrow",
  "晚上": "evening",
  "某天": "someday",
  "随时": "anytime"
}

var SAPT_VIITOARE = [
  "next week",
  "saptamana viitoare",
  "nachste woche",
  "naechste woche",
  "la semaine prochaine",
  "semaine prochaine",
  "la semana proxima",
  "semana proxima",
  "prossima settimana",
  "la prossima settimana",
  "proxima semana",
  "w przyszlym tygodniu",
  "przyszly tydzien",
  "na sleduyushchey nedele",
  "на следующей неделе",
  "следующая неделя",
  "下周",
  "下星期"
]

var WEEKEND = [
  "weekend",
  "this weekend",
  "in weekend",
  "wochenende",
  "am wochenende",
  "le week-end",
  "week-end",
  "fin de semana",
  "el fin de semana",
  "fine settimana",
  "fim de semana",
  "выходные",
  "на выходных",
  "周末"
]

var PREFIX_URMATOR = [
  "next",
  "viitoare",
  "viitor",
  "urmatoare",
  "urmatoarea",
  "nachste",
  "nachsten",
  "naechste",
  "kommende",
  "kommenden",
  "prochain",
  "prochaine",
  "proximo",
  "proxima",
  "prossimo",
  "prossima",
  "nastepny",
  "nastepna",
  "przyszly",
  "przyszla",
  "sledujushchiy",
  "следующий",
  "следующая",
  "след",
  "下",
  "下个"
]

var PREFIX_ACEST = [
  "this",
  "asta",
  "aceasta",
  "diese",
  "diesen",
  "dieser",
  "ce",
  "cette",
  "cet",
  "este",
  "esta",
  "questo",
  "questa",
  "ten",
  "ta",
  "tego",
  "этот",
  "эта",
  "в эту",
  "这",
  "本"
]

// În română, italiană, spaniolă și portugheză „viitoare" stă după zi
// („vinerea viitoare"), nu înainte.
var SUFIX_URMATOR = [
  "viitoare",
  "viitor",
  "urmatoare",
  "urmatoarea",
  "prochain",
  "prochaine",
  "proximo",
  "proxima",
  "prossimo",
  "prossima",
  "que vem",
  "que viene",
  "next"
]

var PESTE = [
  "in",
  "peste",
  "dans",
  "en",
  "em",
  "tra",
  "fra",
  "za",
  "nach",
  "через",
  "after",
  "daqui"
]

var UNITATI_ZI = [
  "d",
  "day",
  "days",
  "z",
  "zi",
  "zile",
  "tag",
  "tage",
  "tagen",
  "jour",
  "jours",
  "dia",
  "dias",
  "giorno",
  "giorni",
  "dzien",
  "dni",
  "den",
  "dnia",
  "дней",
  "дня",
  "день",
  "天"
]

// Diacriticele se pierd la tastare mai des decât se scriu, iar tabelele de
// mai sus sunt deja normalizate — deci și ce tastează omul trebuie adus la
// aceeași formă. Acoperă toate limbile panoului: româna, germana (ß → ss),
// franceza, spaniola, portugheza și poloneza; rusa și chineza n-au nevoie.
function faraDiacritice(text) {
  return String(text || "")
    .replace(/[ăâàáäåã]/g, "a")
    .replace(/[îíìï]/g, "i")
    .replace(/[șşśš]/g, "s")
    .replace(/[țţ]/g, "t")
    .replace(/[éèêëę]/g, "e")
    .replace(/[óòôöõ]/g, "o")
    .replace(/[úùûü]/g, "u")
    .replace(/[çćč]/g, "c")
    .replace(/[ñń]/g, "n")
    .replace(/[ł]/g, "l")
    .replace(/[żź]/g, "z")
    .replace(/[ý]/g, "y")
    .replace(/ß/g, "ss")
}

function normalizeazaCuvant(text) {
  // Apostrofurile cad și ele: „aujourd’hui" și „aujourd'hui" sunt același
  // cuvânt, iar tastatura decide care iese.
  return faraDiacritice(taieSpatii(text).toLowerCase())
    .replace(/[’'`]/g, "")
    .replace(/\s+/g, " ")
}

function esteIn(lista, cuvant) {
  for (var i = 0; i < lista.length; i++) {
    if (lista[i] === cuvant) {
      return true
    }
  }
  return false
}

// Întoarce { kind, value, date } unde:
//   kind  — "bucket" (anytime / someday / today / evening) sau "date" sau ""
//   value — ce se dă lui `things3 --when`
//   date  — obiectul Date, când e o zi anume (pentru previzualizare)
function parseDataCand(text, azi) {
  var gol = { kind: "", value: "", date: null }
  var brut = taieSpatii(text)
  if (brut === "") {
    return gol
  }
  var acum = azi || new Date()
  var t = normalizeazaCuvant(brut)
  // Germana scrie ziua ca ordinal — „24. Dez", „24.12." — iar punctul de la
  // coadă nu poartă niciun înțeles într-o dată tastată.
  t = t.replace(/\.$/, "")

  // Cuvintele-găleată ale lui Things. Nu sunt zile, sunt liste — în afară de
  // „mâine", care e o zi și se trimite ca dată, fiindcă CLI-ul n-are cuvânt
  // pentru ea.
  var galeata = GALETI[t]
  if (galeata === "today" || galeata === "evening") {
    return { kind: "bucket", value: galeata, date: acum }
  }
  if (galeata === "anytime" || galeata === "someday") {
    return { kind: "bucket", value: galeata, date: null }
  }
  if (galeata === "tomorrow") {
    return dataCa(adaugaZile(acum, 1))
  }

  if (esteIn(SAPT_VIITOARE, t)) {
    // Lunea care vine, nu „peste șapte zile": „săptămâna viitoare" e un loc
    // în calendar, nu o durată. Fără sărirea unei săptămâni — joi, „săptămâna
    // viitoare" e lunea de peste patru zile, nu cea de peste unsprezece.
    return dataCa(urmatoareaZiDinSaptamana(acum, 1, false))
  }
  if (esteIn(WEEKEND, t)) {
    return dataCa(urmatoareaZiDinSaptamana(acum, 6, false))
  }

  // „in 3 days" / „peste 3 zile" / „dans 3 jours" / „za 3 dni" / „через 3 дня"
  var relativ = /^([a-z\u0400-\u04ff]+)\s+(\d{1,3})\s*([a-z\u0400-\u04ff]*)$/.exec(t)
  if (relativ && esteIn(PESTE, relativ[1])
      && (relativ[3] === "" || esteIn(UNITATI_ZI, relativ[3]))) {
    return dataCa(adaugaZile(acum, Number(relativ[2])))
  }
  // Chineza pune unitatea la coadă: „3天后".
  var relativCn = /^(\d{1,3})\s*天后$/.exec(t)
  if (relativCn) {
    return dataCa(adaugaZile(acum, Number(relativCn[1])))
  }

  // ISO, forma pe care o înțelege direct și CLI-ul.
  var isoPotrivit = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t)
  if (isoPotrivit) {
    return dataCa(new Date(Number(isoPotrivit[1]), Number(isoPotrivit[2]) - 1, Number(isoPotrivit[3])))
  }

  // Chineza: „9月18日" sau „9月18".
  var cnData = /^(\d{1,2})\s*月\s*(\d{1,2})\s*日?$/.exec(t)
  if (cnData) {
    return dataAnDedus(acum, Number(cnData[1]) - 1, Number(cnData[2]))
  }

  // „12/25" sau „25.12" — ziua și luna, anul dedus. Ordinea zi/lună urmează
  // separatorul: cu „/" se citește american (lună întâi), cu „." sau „-"
  // european, fiindcă așa le scrie fiecare care le folosește.
  var numeric = /^(\d{1,2})([\/.\-])(\d{1,2})(?:\2(\d{2,4}))?$/.exec(t)
  if (numeric) {
    var primul = Number(numeric[1])
    var alDoilea = Number(numeric[3])
    var luna, zi
    if (numeric[2] === "/") {
      luna = primul - 1
      zi = alDoilea
    } else {
      zi = primul
      luna = alDoilea - 1
    }
    if (numeric[4]) {
      var an = Number(numeric[4])
      if (an < 100) {
        an += 2000
      }
      var fix = new Date(an, luna, zi)
      if (fix.getMonth() !== ((luna % 12) + 12) % 12) {
        return gol
      }
      return dataCa(fix)
    }
    return dataAnDedus(acum, luna, zi)
  }

  // „aug 24" / „24 aug" / „24 august" / „24 сентября"
  var cuLuna = /^(\S+)\s+(\d{1,2})\.?$/.exec(t)
  var cuZiua = /^(\d{1,2})\.?\s+(\S+)$/.exec(t)
  var numeLuna = null
  var ziLuna = 0
  if (cuLuna && LUNI[cuLuna[1]] !== undefined) {
    numeLuna = LUNI[cuLuna[1]]
    ziLuna = Number(cuLuna[2])
  } else if (cuZiua && LUNI[cuZiua[2]] !== undefined) {
    numeLuna = LUNI[cuZiua[2]]
    ziLuna = Number(cuZiua[1])
  }
  if (numeLuna !== null) {
    return dataAnDedus(acum, numeLuna, ziLuna)
  }

  // Zilele săptămânii, singure sau cu „this" / „next" — prefix în engleză și
  // germană, sufix în română, italiană, spaniolă și portugheză.
  var numeZi = t
  var fortatUrmatoarea = false
  var cuPrefix = /^(\S+)\s+(.+)$/.exec(t)
  if (cuPrefix && ZILE[t] === undefined) {
    if (esteIn(PREFIX_URMATOR, cuPrefix[1])) {
      numeZi = cuPrefix[2]
      fortatUrmatoarea = true
    } else if (esteIn(PREFIX_ACEST, cuPrefix[1])) {
      numeZi = cuPrefix[2]
    }
  }
  if (numeZi === t) {
    var cuSufix = /^(.+)\s+(\S+)$/.exec(t)
    if (cuSufix && ZILE[t] === undefined && esteIn(SUFIX_URMATOR, cuSufix[2])) {
      numeZi = cuSufix[1]
      fortatUrmatoarea = true
    }
  }
  if (ZILE[numeZi] !== undefined) {
    return dataCa(urmatoareaZiDinSaptamana(acum, ZILE[numeZi], fortatUrmatoarea))
  }

  return gol
}

// O zi și o lună fără an: anul curent, sau următorul dacă ziua a trecut deja.
function dataAnDedus(acum, luna, zi) {
  var candidat = new Date(acum.getFullYear(), luna, zi)
  if (candidat.getMonth() !== ((luna % 12) + 12) % 12) {
    return { kind: "", value: "", date: null }
  }
  if (zileIntre(acum, candidat) < 0) {
    candidat = new Date(acum.getFullYear() + 1, luna, zi)
  }
  return dataCa(candidat)
}

function dataCa(d) {
  return { kind: "date", value: iso(d), date: d }
}

// Următoarea zi de tipul cerut. Fără „next", ziua de azi nu se numără — cine
// scrie „vineri" vinerea se gândește la vinerea care vine, nu la acum. Cu
// „next", se sare o săptămână peste prima potrivire.
function urmatoareaZiDinSaptamana(acum, ziTinta, fortatUrmatoarea) {
  var delta = (ziTinta - acum.getDay() + 7) % 7
  if (delta === 0) {
    delta = 7
  }
  if (fortatUrmatoarea) {
    delta += 7
  }
  return adaugaZile(acum, delta)
}

// Ce se dă lui `things3 --when` pentru o valoare parsată; "" înseamnă „nu
// trimite deloc opțiunea".
function valoareWhen(parsat) {
  if (!parsat || parsat.kind === "") {
    return ""
  }
  return parsat.value
}

// -------------------------------------------------------------- potriviri
//
// „#cumpărături" trebuie să găsească proiectul „Cumpărături" fără ca omul să
// scrie majuscula și diacriticele. Se caută întâi potrivirea exactă, apoi
// prefixul, apoi subșirul — în ordinea asta, ca un nume care e prefixul altuia
// („Punctuale" vs „Punctuale vechi") să nu fie furat de cel mai lung.

function cautaDupaNume(lista, text) {
  var tinta = normalizeazaCuvant(text)
  if (tinta === "" || !lista) {
    return null
  }
  var i
  for (i = 0; i < lista.length; i++) {
    if (normalizeazaCuvant(lista[i].title) === tinta) {
      return lista[i]
    }
  }
  for (i = 0; i < lista.length; i++) {
    if (normalizeazaCuvant(lista[i].title).indexOf(tinta) === 0) {
      return lista[i]
    }
  }
  for (i = 0; i < lista.length; i++) {
    if (normalizeazaCuvant(lista[i].title).indexOf(tinta) >= 0) {
      return lista[i]
    }
  }
  return null
}

// Ținta lui `--in` / `--move`: un proiect, sau o arie, sau Inbox-ul.
function cautaContainer(instantaneu, text) {
  var t = normalizeazaCuvant(text)
  if (t === "") {
    return null
  }
  if (t === "inbox") {
    return { kind: "inbox", id: "inbox", title: "Inbox" }
  }
  var proiect = cautaDupaNume(instantaneu.projects || [], text)
  if (proiect) {
    return { kind: "project", id: proiect.id, title: proiect.title }
  }
  var arie = cautaDupaNume(instantaneu.areas || [], text)
  if (arie) {
    return { kind: "area", id: arie.id, title: arie.title }
  }
  return null
}

// ---------------------------------------------------------------- sortare

function sorteazaDupa(lista, cheie) {
  var copie = lista.slice()
  copie.sort(function (a, b) {
    var da = a[cheie] || 0
    var db = b[cheie] || 0
    if (da !== db) {
      return da - db
    }
    return String(a.title || "").localeCompare(String(b.title || ""))
  })
  return copie
}

// ------------------------------------------------------------------ rânduri
//
// Fiecare vedere se aplatizează într-un singur șir de rânduri, ca un ListView
// să dețină derularea (la fel ca panourile native: lista de dispozitive a
// bluetooth-ului, stațiile din network). Antetele sunt rânduri și ele, doar
// că nu sunt „opriri" pentru cursor.
//
//   { kind: "header",  key, text }
//   { kind: "task",    key, task, depth, stop: true }
//   { kind: "check",   key, item, parent, depth, stop: true }
//   { kind: "project", key, project, stop: true }
//   { kind: "empty",   key, text }

function rand(kind, key, extra) {
  var r = { kind: kind, key: key, depth: 0, stop: false }
  for (var k in extra) {
    r[k] = extra[k]
  }
  return r
}

// Rândurile de checklist ale unui task desfășurat. Un task fără checklist nu
// produce niciunul, deci desfășurarea lui nu face nimic — și butonul care o
// comută nici nu apare.
function randuriChecklist(task, desfasurate) {
  var randuri = []
  if (!task || !desfasurate || !desfasurate[task.id]) {
    return randuri
  }
  var items = task.checklist || []
  for (var i = 0; i < items.length; i++) {
    randuri.push(rand("check", task.id + ":" + items[i].id, {
      item: items[i], parent: task, depth: 1, stop: true
    }))
  }
  return randuri
}

function randTask(task, desfasurate, depth) {
  var randuri = [rand("task", task.id, { task: task, depth: depth || 0, stop: true })]
  return randuri.concat(randuriChecklist(task, desfasurate))
}

// Today: grupat pe proiect, ca în aplicație, cu serile la coadă. Grupul fără
// proiect nu primește antet — task-urile libere sunt majoritatea și un antet
// „Fără proiect" deasupra lor ar fi zgomot.
function randuriToday(instantaneu, desfasurate) {
  var taskuri = taskuriVedere(instantaneu, "today")
  var randuri = []
  if (taskuri.length === 0) {
    return randuri
  }

  var zi = []
  var seara = []
  for (var i = 0; i < taskuri.length; i++) {
    (taskuri[i].evening ? seara : zi).push(taskuri[i])
  }

  randuri = randuri.concat(randuriGrupatePeProiect(zi, desfasurate, ""))
  if (seara.length > 0) {
    // Antetul poartă un marcaj, nu textul: traducerea e a panoului, care
    // știe limba. Scris aici, „@evening" ar fi rămas englezesc în toate
    // celelalte nouă limbi.
    randuri.push(rand("header", "hdr:evening", { text: "", special: "evening" }))
    randuri = randuri.concat(randuriGrupatePeProiect(seara, desfasurate, "eve:"))
  }
  return randuri
}

// Grupare pe proiect păstrând ordinea în care a venit lista: primul task al
// unui proiect fixează locul grupului, restul se adună la el. Așa ordinea
// manuală din Things (sort_index) nu se pierde.
function randuriGrupatePeProiect(taskuri, desfasurate, prefix) {
  var ordine = []
  var grupuri = {}
  var libere = []
  var i

  for (i = 0; i < taskuri.length; i++) {
    var task = taskuri[i]
    var idProiect = task.project ? task.project.id : ""
    if (idProiect === "") {
      libere.push(task)
      continue
    }
    if (!grupuri[idProiect]) {
      grupuri[idProiect] = { titlu: task.project.title, taskuri: [] }
      ordine.push(idProiect)
    }
    grupuri[idProiect].taskuri.push(task)
  }

  var randuri = []
  for (i = 0; i < libere.length; i++) {
    randuri = randuri.concat(randTask(libere[i], desfasurate, 0))
  }
  for (i = 0; i < ordine.length; i++) {
    var grup = grupuri[ordine[i]]
    randuri.push(rand("header", prefix + "hdr:" + ordine[i], { text: grup.titlu }))
    for (var j = 0; j < grup.taskuri.length; j++) {
      randuri = randuri.concat(randTask(grup.taskuri[j], desfasurate, 0))
    }
  }
  return randuri
}

// Upcoming: grupat pe ziua în care cade fiecare task, cu antetul zilei.
// Etichetele zilelor le compune apelantul (are limba), deci aici antetul duce
// data ISO și panoul o traduce.
function randuriUpcoming(instantaneu, desfasurate) {
  var taskuri = taskuriVedere(instantaneu, "upcoming")
  var randuri = []
  var ordine = []
  var peZi = {}

  for (var i = 0; i < taskuri.length; i++) {
    var task = taskuri[i]
    var zi = task.when || ""
    if (!peZi[zi]) {
      peZi[zi] = []
      ordine.push(zi)
    }
    peZi[zi].push(task)
  }

  ordine.sort()
  for (var k = 0; k < ordine.length; k++) {
    var cheie = ordine[k]
    randuri.push(rand("header", "day:" + cheie, { text: "", day: cheie }))
    for (var j = 0; j < peZi[cheie].length; j++) {
      randuri = randuri.concat(randTask(peZi[cheie][j], desfasurate, 0))
    }
  }
  return randuri
}

// Anytime / Someday: grupate pe proiect, ca în aplicație.
function randuriSimple(instantaneu, vedere, desfasurate) {
  return randuriGrupatePeProiect(taskuriVedere(instantaneu, vedere), desfasurate, "")
}

// Inbox: fără grupare — prin definiție, nimic din Inbox nu e încă pus undeva.
function randuriInbox(instantaneu, desfasurate) {
  var taskuri = taskuriVedere(instantaneu, "inbox")
  var randuri = []
  for (var i = 0; i < taskuri.length; i++) {
    randuri = randuri.concat(randTask(taskuri[i], desfasurate, 0))
  }
  return randuri
}

// Logbook: grupat pe ziua bifării, cel mai recent sus.
function randuriLogbook(instantaneu, desfasurate) {
  var taskuri = taskuriVedere(instantaneu, "logbook")
  var ordine = []
  var peZi = {}
  var i

  for (i = 0; i < taskuri.length; i++) {
    var zi = taskuri[i].completed || ""
    if (!peZi[zi]) {
      peZi[zi] = []
      ordine.push(zi)
    }
    peZi[zi].push(taskuri[i])
  }

  ordine.sort()
  ordine.reverse()

  var randuri = []
  for (var k = 0; k < ordine.length; k++) {
    var cheie = ordine[k]
    randuri.push(rand("header", "done:" + cheie, { text: "", day: cheie }))
    for (var j = 0; j < peZi[cheie].length; j++) {
      randuri = randuri.concat(randTask(peZi[cheie][j], desfasurate, 0))
    }
  }
  return randuri
}

// Projects: lista de proiecte, grupată pe arii. Un proiect fără arie stă
// primul, la fel ca în bara laterală a aplicației.
function randuriProiecte(instantaneu) {
  var proiecte = instantaneu.projects || []
  var randuri = []
  var libere = []
  var ordine = []
  var peArie = {}
  var i

  for (i = 0; i < proiecte.length; i++) {
    var p = proiecte[i]
    var idArie = p.area ? p.area.id : ""
    if (idArie === "") {
      libere.push(p)
      continue
    }
    if (!peArie[idArie]) {
      peArie[idArie] = { titlu: p.area.title, proiecte: [] }
      ordine.push(idArie)
    }
    peArie[idArie].proiecte.push(p)
  }

  for (i = 0; i < libere.length; i++) {
    randuri.push(rand("project", libere[i].id, { project: libere[i], stop: true }))
  }
  for (i = 0; i < ordine.length; i++) {
    var grup = peArie[ordine[i]]
    randuri.push(rand("header", "area:" + ordine[i], { text: grup.titlu }))
    for (var j = 0; j < grup.proiecte.length; j++) {
      randuri.push(rand("project", grup.proiecte[j].id, { project: grup.proiecte[j], stop: true }))
    }
  }
  return randuri
}

// Interiorul unui proiect: task-urile lui deschise, grupate pe secțiunile
// („headings") pe care le are în Things.
function randuriInProiect(instantaneu, idProiect, desfasurate, aratacomplete) {
  var randuri = []
  var toate = []
  for (var id in instantaneu.tasks) {
    var task = instantaneu.tasks[id]
    if (task.type !== "todo") {
      continue
    }
    if (!task.project || task.project.id !== idProiect) {
      continue
    }
    if (!aratacomplete && task.status !== "incomplete") {
      continue
    }
    toate.push(task)
  }
  toate = sorteazaDupa(toate, "sort")

  var ordine = []
  var peSectiune = {}
  var libere = []
  var i

  for (i = 0; i < toate.length; i++) {
    var idSectiune = toate[i].heading ? toate[i].heading.id : ""
    if (idSectiune === "") {
      libere.push(toate[i])
      continue
    }
    if (!peSectiune[idSectiune]) {
      peSectiune[idSectiune] = { titlu: toate[i].heading.title, taskuri: [] }
      ordine.push(idSectiune)
    }
    peSectiune[idSectiune].taskuri.push(toate[i])
  }

  for (i = 0; i < libere.length; i++) {
    randuri = randuri.concat(randTask(libere[i], desfasurate, 0))
  }
  for (i = 0; i < ordine.length; i++) {
    var grup = peSectiune[ordine[i]]
    randuri.push(rand("header", "sec:" + ordine[i], { text: grup.titlu }))
    for (var j = 0; j < grup.taskuri.length; j++) {
      randuri = randuri.concat(randTask(grup.taskuri[j], desfasurate, 0))
    }
  }
  return randuri
}

// Căutare: peste tot, pe titlu, notițe, checklist, etichete și numele
// proiectului. Filtrarea se face aici, nu prin `things3 find`, ca rezultatele
// să apară la fiecare tastă fără să pornească un proces.
function randuriCautare(instantaneu, interogare, desfasurate, includeTerminate) {
  var q = normalizeazaCuvant(interogare)
  var randuri = []
  if (q === "") {
    return randuri
  }

  var gasite = []
  for (var id in instantaneu.tasks) {
    var task = instantaneu.tasks[id]
    if (task.type !== "todo") {
      continue
    }
    if (!includeTerminate && task.status !== "incomplete") {
      continue
    }
    if (potrivesteTask(task, q)) {
      gasite.push(task)
    }
  }

  // Deschise înaintea celor bifate; în rest, cele modificate recent sus.
  gasite.sort(function (a, b) {
    if ((a.status === "incomplete") !== (b.status === "incomplete")) {
      return a.status === "incomplete" ? -1 : 1
    }
    return String(b.modified || "").localeCompare(String(a.modified || ""))
  })

  for (var i = 0; i < gasite.length; i++) {
    randuri = randuri.concat(randTask(gasite[i], desfasurate, 0))
  }
  return randuri
}

function potrivesteTask(task, q) {
  if (normalizeazaCuvant(task.title).indexOf(q) >= 0) {
    return true
  }
  if (normalizeazaCuvant(task.notes).indexOf(q) >= 0) {
    return true
  }
  if (task.project && normalizeazaCuvant(task.project.title).indexOf(q) >= 0) {
    return true
  }
  var i
  for (i = 0; i < (task.tags || []).length; i++) {
    if (normalizeazaCuvant(task.tags[i]).indexOf(q) >= 0) {
      return true
    }
  }
  for (i = 0; i < (task.checklist || []).length; i++) {
    if (normalizeazaCuvant(task.checklist[i].title).indexOf(q) >= 0) {
      return true
    }
  }
  return false
}

// Indicii rândurilor pe care poate sta cursorul. Antetele nu sunt opriri:
// cursorul le sare, dar ele rămân în listă ca reper vizual.
function opriri(randuri) {
  var out = []
  for (var i = 0; i < randuri.length; i++) {
    if (randuri[i].stop) {
      out.push(i)
    }
  }
  return out
}

// Prima linie a notițelor, tăiată — panoul arată o singură linie sub titlu, ca
// să se vadă că există notițe fără să crească rândul.
function rezumatNotite(notite, limita) {
  var text = taieSpatii(String(notite || "").split(/\r?\n/)[0])
  var max = limita || 120
  if (text.length > max) {
    text = text.substr(0, max - 1) + "…"
  }
  return text
}

// Un link din notițe, redus la gazdă + început de cale, ca să încapă pe rând.
function scurteazaLink(url) {
  var m = /^https?:\/\/([^\/\s]+)(\/[^\s]*)?$/i.exec(taieSpatii(url))
  if (!m) {
    return ""
  }
  var gazda = m[1].replace(/^www\./i, "")
  var cale = m[2] || ""
  if (cale.length > 24) {
    cale = cale.substr(0, 23) + "…"
  }
  return gazda + cale
}

function primulLink(notite) {
  var m = /https?:\/\/[^\s<>"']+/i.exec(String(notite || ""))
  return m ? m[0] : ""
}

// Fracția bifată dintr-un proiect, pentru plăcinta de progres.
function progresProiect(proiect) {
  if (!proiect || !proiect.total) {
    return 0
  }
  var facute = proiect.total - proiect.open
  return Math.max(0, Math.min(1, facute / proiect.total))
}
