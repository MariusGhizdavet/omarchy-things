.pragma library

// Traducerile widget-ului și alegerea limbii.
//
// Niciun text vizibil nu e scris în Panel.qml: totul se cere de aici, pe
// cheie. Limba vine din setarea `language`; „Auto" o ia din locale-ul
// sistemului, ca plugin-ul să vorbească din prima limba desktopului. Valoarea
// se poate scrie în shell.json și ca nume („Română"), și ca cod („ro"),
// fiindcă selectul din setări stochează numele afișat, iar cine editează
// fișierul de mână scrie codul.
//
// Aceleași zece limbi și aceeași structură ca la mghizdavet.rss, ca cele două
// plugin-uri să se citească la fel. Adăugarea unei limbi înseamnă o intrare în
// LIMBI, un dicționar în TEXTE, zilele și lunile ei, și — dacă are reguli
// proprii — o ramură în indexPlural. Cuvintele pe care le acceptă câmpul de
// dată („sâmbătă", „Samstag") stau în Model.js, lângă parser.

// Ordinea de aici e ordinea din selectul de setări.
var LIMBI = [
  { cod: "auto", nume: "Auto", scurt: "Auto", locale: "", aliasuri: ["auto", "system", "sistem", "systeme", "système", "automatic"] },
  { cod: "en", nume: "English", scurt: "English", locale: "en_US", aliasuri: ["en", "eng", "english", "engleza", "engleză"] },
  { cod: "ro", nume: "Română", scurt: "Română", locale: "ro_RO", aliasuri: ["ro", "ron", "rum", "romana", "română", "romanian", "romanesc"] },
  { cod: "de", nume: "Deutsch", scurt: "Deutsch", locale: "de_DE", aliasuri: ["de", "ger", "deu", "deutsch", "german", "germana", "germană"] },
  { cod: "fr", nume: "Français", scurt: "Français", locale: "fr_FR", aliasuri: ["fr", "fra", "francais", "français", "french", "franceza", "franceză"] },
  { cod: "es", nume: "Español", scurt: "Español", locale: "es_ES", aliasuri: ["es", "spa", "espanol", "español", "spanish", "spaniola", "spaniolă"] },
  { cod: "it", nume: "Italiano", scurt: "Italiano", locale: "it_IT", aliasuri: ["it", "ita", "italiano", "italian", "italiana", "italiană"] },
  { cod: "pt-BR", nume: "Português (BR)", scurt: "Português", locale: "pt_BR", aliasuri: ["pt", "pt-br", "pt_br", "por", "portugues", "português", "portuguese", "portugheza", "portugheză", "brasil"] },
  { cod: "pl", nume: "Polski", scurt: "Polski", locale: "pl_PL", aliasuri: ["pl", "pol", "polski", "polish", "poloneza", "poloneză"] },
  { cod: "ru", nume: "Русский", scurt: "Русский", locale: "ru_RU", aliasuri: ["ru", "rus", "russkij", "русский", "russian", "rusa", "rusă"] },
  { cod: "zh-CN", nume: "中文 (简体)", scurt: "中文", locale: "zh_CN", aliasuri: ["zh", "zh-cn", "zh_cn", "zh-hans", "chi", "zho", "chinese", "chineza", "chineză", "中文", "简体"] }
]

// Lista pentru selectorul din panou: codul cu care se compară, eticheta scurtă
// care se desenează pe pastilă și numele întreg care se scrie în shell.json.
function limbi() {
  var lista = []
  for (var i = 0; i < LIMBI.length; i++) {
    lista.push({ cod: LIMBI[i].cod, scurt: LIMBI[i].scurt, nume: LIMBI[i].nume })
  }
  return lista
}

function numeLimba(cod) {
  for (var i = 0; i < LIMBI.length; i++) {
    if (LIMBI[i].cod === cod) {
      return LIMBI[i].nume
    }
  }
  return "Auto"
}

function numeleLimbilor() {
  var lista = []
  for (var i = 0; i < LIMBI.length; i++) {
    lista.push(LIMBI[i].nume)
  }
  return lista
}

// Codul unei valori scrise în setare, oricum ar fi scrisă.
function codLimba(valoare) {
  var v = String(valoare === undefined || valoare === null ? "" : valoare)
    .replace(/^\s+|\s+$/g, "").toLowerCase()
  if (v === "") {
    return "auto"
  }
  for (var i = 0; i < LIMBI.length; i++) {
    if (LIMBI[i].cod.toLowerCase() === v || LIMBI[i].nume.toLowerCase() === v) {
      return LIMBI[i].cod
    }
    for (var j = 0; j < LIMBI[i].aliasuri.length; j++) {
      if (LIMBI[i].aliasuri[j] === v) {
        return LIMBI[i].cod
      }
    }
  }
  return "auto"
}

function esteAuto(valoare) {
  return codLimba(valoare) === "auto"
}

// Limba în care se desenează efectiv. „Auto" se rezolvă în locale-ul dat de
// panou (Qt.locale().name); o limbă netradusă cade pe engleză.
function limba(valoare, localeSistem) {
  var cod = codLimba(valoare)
  if (cod !== "auto") {
    return cod
  }
  var loc = String(localeSistem || "").replace(/^\s+|\s+$/g, "")
  if (loc === "") {
    return "en"
  }
  var jos = loc.toLowerCase().replace(/-/g, "_")
  // Întâi potrivirea exactă de locale, ca pt_BR să nu cadă pe portugheza
  // europeană a unei viitoare intrări „pt".
  for (var i = 1; i < LIMBI.length; i++) {
    if (LIMBI[i].locale.toLowerCase() === jos) {
      return LIMBI[i].cod
    }
  }
  var radacina = jos.split(/[_.]/)[0]
  for (var k = 1; k < LIMBI.length; k++) {
    if (LIMBI[k].cod.toLowerCase().split("-")[0] === radacina) {
      return LIMBI[k].cod
    }
  }
  return "en"
}

function localeData(cod) {
  for (var i = 0; i < LIMBI.length; i++) {
    if (LIMBI[i].cod === cod) {
      return LIMBI[i].locale || "en_US"
    }
  }
  return "en_US"
}

// ----------------------------------------------------------------- plural
//
// Câte forme are un substantiv numărat și care se alege pentru n. Engleza,
// germana și romanicele se descurcă cu două, româna cere trei („1 deschis /
// 2 deschise / 20 de deschise"), rusa și poloneza tot trei, dar după alt
// criteriu, iar chineza una singură.

function indexPlural(cod, n) {
  var m = Math.abs(Math.floor(n))

  if (cod === "zh-CN") {
    return 0
  }
  if (cod === "fr" || cod === "pt-BR") {
    // Franceza și portugheza braziliană tratează 0 ca singular.
    return m <= 1 ? 0 : 1
  }
  if (cod === "ro") {
    if (m === 1) {
      return 0
    }
    return (m === 0 || (m % 100 >= 1 && m % 100 <= 19)) ? 1 : 2
  }
  if (cod === "pl") {
    // Poloneza NU e ca rusa aici: singularul e doar 1 curat („1 otwarte"),
    // iar 21 merge cu genitivul plural („21 otwartych"), nu înapoi la
    // singular. Regula rusă de mai jos ar fi dat „21 otwarte".
    if (m === 1) {
      return 0
    }
    if (m % 10 >= 2 && m % 10 <= 4 && (m % 100 < 12 || m % 100 > 14)) {
      return 1
    }
    return 2
  }
  if (cod === "ru") {
    if (m % 10 === 1 && m % 100 !== 11) {
      return 0
    }
    if (m % 10 >= 2 && m % 10 <= 4 && (m % 100 < 12 || m % 100 > 14)) {
      return 1
    }
    return 2
  }

  return m === 1 ? 0 : 1
}

// ------------------------------------------------------------------- texte

var TEXTE = {
  "en": {
    "repeat.everyYears": ["every {n} years"],
    "repeat.daily": "daily",
    "repeat.weekly": "weekly",
    "repeat.monthly": "monthly",
    "repeat.yearly": "yearly",
    "repeat.everyDays": ["every {n} days"],
    "repeat.everyWeeks": ["every {n} weeks"],
    "repeat.everyMonths": ["every {n} months"],
    "repeat.generic": "repeats",
    "help.settings": ", settings · L next language",
    "action.settings": "Settings",
    "settings.language": "Language",
    "settings.languageHint": "Auto follows the system locale.",
    "appName": "Things",
    "view.today": "Today",
    "view.upcoming": "Upcoming",
    "view.anytime": "Anytime",
    "view.someday": "Someday",
    "view.inbox": "Inbox",
    "view.projects": "Projects",
    "view.logbook": "Logbook",
    "view.search": "Search",
    "empty.today": "Nothing due today.",
    "empty.upcoming": "Nothing scheduled ahead.",
    "empty.anytime": "Anytime is empty.",
    "empty.someday": "Someday is empty.",
    "empty.inbox": "The Inbox is clear.",
    "empty.projects": "No projects yet.",
    "empty.logbook": "Nothing completed recently.",
    "empty.search": "No matches.",
    "empty.project": "This project has no open tasks.",
    "empty.searchPrompt": "Type to search every task.",
    "count.open": ["{n} open"],
    "count.done": ["{n} done today"],
    "count.overdue": ["{n} overdue"],
    "count.none": "nothing open",
    "day.today": "Today",
    "day.tomorrow": "Tomorrow",
    "day.yesterday": "Yesterday",
    "day.evening": "This Evening",
    "day.none": "No date",
    "add.placeholder": "New task…  @when  #project  +tag  !deadline  -- notes",
    "add.into": "into {target}",
    "add.preview": "→ {title}",
    "add.unresolved": "not recognised: {marks}",
    "when.title": "When",
    "when.today": "Today",
    "when.evening": "This Evening",
    "when.tomorrow": "Tomorrow",
    "when.anytime": "Anytime",
    "when.someday": "Someday",
    "when.typed": "Enter → {date}",
    "when.typedUnknown": "Type a date: saturday, next fri, in 3 days, aug 24, 2026-09-01",
    "when.placeholder": "or type a date…",
    "move.title": "Move to",
    "move.inbox": "Inbox",
    "move.placeholder": "filter projects and areas…",
    "action.check": "Complete",
    "action.uncheck": "Mark unfinished",
    "action.notes": "Notes",
    "action.cancel": "Cancel",
    "action.uncancel": "Reinstate",
    "notes.placeholder": "Notes for this task",
    "notes.hint": "Ctrl+Enter saves · Esc discards",
    "checklist.add": "Add checklist item",
    "checklist.rename": "Rename item",
    "checklist.delete": "Delete item",
    "checklist.placeholder": "Checklist item",
    "task.projected": "Projected from the repeat rule — Things has not created it yet",
    "action.rename": "Rename",
    "action.delete": "Delete",
    "action.schedule": "When…",
    "action.move": "Move…",
    "action.refresh": "Sync now",
    "action.back": "Back",
    "action.search": "Search",
    "action.showCompleted": "Show completed",
    "action.hideCompleted": "Hide completed",
    "confirm.delete": "Delete “{title}”?",
    "confirm.deleteCancel": "Keep",
    "confirm.deleteOk": "Delete",
    "rename.placeholder": "New title…",
    "state.syncing": "Syncing…",
    "state.synced": "Synced {ago}",
    "state.stale": "Showing cached data",
    "ago.now": "just now",
    "ago.min": "{n} min ago",
    "ago.hour": "{n} h ago",
    "error.missing": "things3 is not installed",
    "error.auth": "Things Cloud is not configured — run: things3 set-auth",
    "error.sync": "Sync failed — showing cached data",
    "error.generic": "things3 failed: {detail}",
    "error.action": "Action failed: {detail}",
    "help.title": "Keyboard",
    "help.move": "↑ ↓ move · Enter complete",
    "help.views": "Shift+Tab cycles views · 1…7 jump",
    "help.actions": "S when · M move · E rename · T notes · X delete",
    "help.checklist": "C checklist · A add item · ← → picks a row action",
    "help.add": "N new task · / search · R sync · ? this card"
  },

  "ro": {
    "repeat.everyYears": ["la {n} an", "la {n} ani", "la {n} de ani"],
    "repeat.daily": "zilnic",
    "repeat.weekly": "săptămânal",
    "repeat.monthly": "lunar",
    "repeat.yearly": "anual",
    "repeat.everyDays": ["la {n} zi", "la {n} zile", "la {n} de zile"],
    "repeat.everyWeeks": ["la {n} săptămână", "la {n} săptămâni", "la {n} de săptămâni"],
    "repeat.everyMonths": ["la {n} lună", "la {n} luni", "la {n} de luni"],
    "repeat.generic": "se repetă",
    "help.settings": ", setări · L limba următoare",
    "action.settings": "Setări",
    "settings.language": "Limbă",
    "settings.languageHint": "„Auto” urmează limba sistemului.",
    "appName": "Things",
    "view.today": "Azi",
    "view.upcoming": "Urmează",
    "view.anytime": "Oricând",
    "view.someday": "Cândva",
    "view.inbox": "Inbox",
    "view.projects": "Proiecte",
    "view.logbook": "Jurnal",
    "view.search": "Caută",
    "empty.today": "Nimic de făcut azi.",
    "empty.upcoming": "Nimic programat în față.",
    "empty.anytime": "„Oricând” e gol.",
    "empty.someday": "„Cândva” e gol.",
    "empty.inbox": "Inbox-ul e curat.",
    "empty.projects": "Niciun proiect încă.",
    "empty.logbook": "Nimic bifat de curând.",
    "empty.search": "Nicio potrivire.",
    "empty.project": "Proiectul nu are task-uri deschise.",
    "empty.searchPrompt": "Scrie ca să cauți în toate task-urile.",
    "count.open": ["{n} deschis", "{n} deschise", "{n} de deschise"],
    "count.done": ["{n} bifat azi", "{n} bifate azi", "{n} de bifate azi"],
    "count.overdue": ["{n} întârziat", "{n} întârziate", "{n} de întârziate"],
    "count.none": "nimic deschis",
    "day.today": "Azi",
    "day.tomorrow": "Mâine",
    "day.yesterday": "Ieri",
    "day.evening": "Diseară",
    "day.none": "Fără dată",
    "add.placeholder": "Task nou…  @când  #proiect  +etichetă  !termen  -- notițe",
    "add.into": "în {target}",
    "add.preview": "→ {title}",
    "add.unresolved": "n-am înțeles: {marks}",
    "when.title": "Când",
    "when.today": "Azi",
    "when.evening": "Diseară",
    "when.tomorrow": "Mâine",
    "when.anytime": "Oricând",
    "when.someday": "Cândva",
    "when.typed": "Enter → {date}",
    "when.typedUnknown": "Scrie o dată: sâmbătă, vinerea viitoare, peste 3 zile, 24 aug, 2026-09-01",
    "when.placeholder": "sau scrie o dată…",
    "move.title": "Mută în",
    "move.inbox": "Inbox",
    "move.placeholder": "filtrează proiecte și arii…",
    "action.check": "Bifează",
    "action.uncheck": "Debifează",
    "action.notes": "Notițe",
    "action.cancel": "Anulează",
    "action.uncancel": "Reactivează",
    "notes.placeholder": "Notițe pentru task-ul ăsta",
    "notes.hint": "Ctrl+Enter salvează · Esc renunță",
    "checklist.add": "Adaugă în listă",
    "checklist.rename": "Redenumește elementul",
    "checklist.delete": "Șterge elementul",
    "checklist.placeholder": "Element de listă",
    "task.projected": "Proiectat din regula de recurență — Things încă n-a creat-o",
    "action.rename": "Redenumește",
    "action.delete": "Șterge",
    "action.schedule": "Când…",
    "action.move": "Mută…",
    "action.refresh": "Sincronizează",
    "action.back": "Înapoi",
    "action.search": "Caută",
    "action.showCompleted": "Arată bifatele",
    "action.hideCompleted": "Ascunde bifatele",
    "confirm.delete": "Ștergi „{title}”?",
    "confirm.deleteCancel": "Păstrează",
    "confirm.deleteOk": "Șterge",
    "rename.placeholder": "Titlu nou…",
    "state.syncing": "Se sincronizează…",
    "state.synced": "Sincronizat {ago}",
    "state.stale": "Date din cache",
    "ago.now": "chiar acum",
    "ago.min": "acum {n} min",
    "ago.hour": "acum {n} h",
    "error.missing": "things3 nu este instalat",
    "error.auth": "Things Cloud nu e configurat — rulează: things3 set-auth",
    "error.sync": "Sincronizarea a eșuat — se arată datele din cache",
    "error.generic": "things3 a eșuat: {detail}",
    "error.action": "Acțiunea a eșuat: {detail}",
    "help.title": "Taste",
    "help.move": "↑ ↓ mută · Enter bifează",
    "help.views": "Shift+Tab schimbă vederea · 1…7 sar direct",
    "help.actions": "S când · M mută · E redenumește · T notițe · X șterge",
    "help.checklist": "C listă · A adaugă element · ← → alege o acțiune de pe rând",
    "help.add": "N task nou · / caută · R sincronizează · ? cartonașul ăsta"
  },

  "de": {
    "repeat.everyYears": ["alle {n} Jahre"],
    "repeat.daily": "täglich",
    "repeat.weekly": "wöchentlich",
    "repeat.monthly": "monatlich",
    "repeat.yearly": "jährlich",
    "repeat.everyDays": ["alle {n} Tage"],
    "repeat.everyWeeks": ["alle {n} Wochen"],
    "repeat.everyMonths": ["alle {n} Monate"],
    "repeat.generic": "wiederholt sich",
    "help.settings": ", Einstellungen · L nächste Sprache",
    "action.settings": "Einstellungen",
    "settings.language": "Sprache",
    "settings.languageHint": "„Auto“ folgt der Systemsprache.",
    "appName": "Things",
    "view.today": "Heute",
    "view.upcoming": "Geplant",
    "view.anytime": "Jederzeit",
    "view.someday": "Irgendwann",
    "view.inbox": "Eingang",
    "view.projects": "Projekte",
    "view.logbook": "Logbuch",
    "view.search": "Suche",
    "empty.today": "Heute ist nichts fällig.",
    "empty.upcoming": "Nichts weiter geplant.",
    "empty.anytime": "„Jederzeit“ ist leer.",
    "empty.someday": "„Irgendwann“ ist leer.",
    "empty.inbox": "Der Eingang ist leer.",
    "empty.projects": "Noch keine Projekte.",
    "empty.logbook": "Zuletzt nichts erledigt.",
    "empty.search": "Keine Treffer.",
    "empty.project": "Dieses Projekt hat keine offenen Aufgaben.",
    "empty.searchPrompt": "Tippen, um alle Aufgaben zu durchsuchen.",
    "count.open": ["{n} offen"],
    "count.done": ["{n} heute erledigt"],
    "count.overdue": ["{n} überfällig"],
    "count.none": "nichts offen",
    "day.today": "Heute",
    "day.tomorrow": "Morgen",
    "day.yesterday": "Gestern",
    "day.evening": "Heute Abend",
    "day.none": "Kein Datum",
    "add.placeholder": "Neue Aufgabe…  @wann  #Projekt  +Tag  !Frist  -- Notizen",
    "add.into": "in {target}",
    "add.preview": "→ {title}",
    "add.unresolved": "nicht erkannt: {marks}",
    "when.title": "Wann",
    "when.today": "Heute",
    "when.evening": "Heute Abend",
    "when.tomorrow": "Morgen",
    "when.anytime": "Jederzeit",
    "when.someday": "Irgendwann",
    "when.typed": "Enter → {date}",
    "when.typedUnknown": "Datum tippen: samstag, nächsten fr, in 3 tagen, 24 aug, 2026-09-01",
    "when.placeholder": "oder ein Datum tippen…",
    "move.title": "Verschieben nach",
    "move.inbox": "Eingang",
    "move.placeholder": "Projekte und Bereiche filtern…",
    "action.check": "Erledigen",
    "action.uncheck": "Als offen markieren",
    "action.notes": "Notizen",
    "action.cancel": "Abbrechen",
    "action.uncancel": "Wieder aufnehmen",
    "notes.placeholder": "Notizen zu dieser Aufgabe",
    "notes.hint": "Strg+Enter speichert · Esc verwirft",
    "checklist.add": "Punkt hinzufügen",
    "checklist.rename": "Punkt umbenennen",
    "checklist.delete": "Punkt löschen",
    "checklist.placeholder": "Checklisten-Punkt",
    "task.projected": "Aus der Wiederholungsregel berechnet — Things hat sie noch nicht angelegt",
    "action.rename": "Umbenennen",
    "action.delete": "Löschen",
    "action.schedule": "Wann…",
    "action.move": "Verschieben…",
    "action.refresh": "Jetzt synchronisieren",
    "action.back": "Zurück",
    "action.search": "Suchen",
    "action.showCompleted": "Erledigte zeigen",
    "action.hideCompleted": "Erledigte ausblenden",
    "confirm.delete": "„{title}“ löschen?",
    "confirm.deleteCancel": "Behalten",
    "confirm.deleteOk": "Löschen",
    "rename.placeholder": "Neuer Titel…",
    "state.syncing": "Wird synchronisiert…",
    "state.synced": "Synchronisiert {ago}",
    "state.stale": "Zeigt zwischengespeicherte Daten",
    "ago.now": "gerade eben",
    "ago.min": "vor {n} Min.",
    "ago.hour": "vor {n} Std.",
    "error.missing": "things3 ist nicht installiert",
    "error.auth": "Things Cloud ist nicht eingerichtet — ausführen: things3 set-auth",
    "error.sync": "Synchronisierung fehlgeschlagen — zeigt zwischengespeicherte Daten",
    "error.generic": "things3 fehlgeschlagen: {detail}",
    "error.action": "Aktion fehlgeschlagen: {detail}",
    "help.title": "Tastatur",
    "help.move": "↑ ↓ bewegen · Enter erledigen",
    "help.views": "Shift+Tab wechselt Ansichten · 1…7 springen",
    "help.actions": "S wann · M verschieben · E umbenennen · T Notizen · X löschen",
    "help.checklist": "C Checkliste · A Punkt hinzufügen · ← → wählt eine Zeilenaktion",
    "help.add": "N neue Aufgabe · / suchen · R sync · ? diese Karte"
  },

  "fr": {
    "repeat.everyYears": ["tous les {n} ans"],
    "repeat.daily": "chaque jour",
    "repeat.weekly": "chaque semaine",
    "repeat.monthly": "chaque mois",
    "repeat.yearly": "chaque année",
    "repeat.everyDays": ["tous les {n} jours"],
    "repeat.everyWeeks": ["toutes les {n} semaines"],
    "repeat.everyMonths": ["tous les {n} mois"],
    "repeat.generic": "se répète",
    "help.settings": ", réglages · L langue suivante",
    "action.settings": "Réglages",
    "settings.language": "Langue",
    "settings.languageHint": "« Auto » suit la langue du système.",
    "appName": "Things",
    "view.today": "Aujourd’hui",
    "view.upcoming": "À venir",
    "view.anytime": "À tout moment",
    "view.someday": "Un jour",
    "view.inbox": "Boîte de réception",
    "view.projects": "Projets",
    "view.logbook": "Journal",
    "view.search": "Recherche",
    "empty.today": "Rien à faire aujourd’hui.",
    "empty.upcoming": "Rien de prévu ensuite.",
    "empty.anytime": "« À tout moment » est vide.",
    "empty.someday": "« Un jour » est vide.",
    "empty.inbox": "La boîte de réception est vide.",
    "empty.projects": "Aucun projet pour l’instant.",
    "empty.logbook": "Rien de terminé récemment.",
    "empty.search": "Aucun résultat.",
    "empty.project": "Ce projet n’a aucune tâche ouverte.",
    "empty.searchPrompt": "Tapez pour chercher dans toutes les tâches.",
    "count.open": ["{n} en cours", "{n} en cours"],
    "count.done": ["{n} terminée aujourd’hui", "{n} terminées aujourd’hui"],
    "count.overdue": ["{n} en retard", "{n} en retard"],
    "count.none": "rien en cours",
    "day.today": "Aujourd’hui",
    "day.tomorrow": "Demain",
    "day.yesterday": "Hier",
    "day.evening": "Ce soir",
    "day.none": "Sans date",
    "add.placeholder": "Nouvelle tâche…  @quand  #projet  +étiquette  !échéance  -- notes",
    "add.into": "dans {target}",
    "add.preview": "→ {title}",
    "add.unresolved": "non reconnu : {marks}",
    "when.title": "Quand",
    "when.today": "Aujourd’hui",
    "when.evening": "Ce soir",
    "when.tomorrow": "Demain",
    "when.anytime": "À tout moment",
    "when.someday": "Un jour",
    "when.typed": "Entrée → {date}",
    "when.typedUnknown": "Tapez une date : samedi, ven prochain, dans 3 jours, 24 août, 2026-09-01",
    "when.placeholder": "ou tapez une date…",
    "move.title": "Déplacer vers",
    "move.inbox": "Boîte de réception",
    "move.placeholder": "filtrer projets et domaines…",
    "action.check": "Terminer",
    "action.uncheck": "Marquer comme à faire",
    "action.notes": "Notes",
    "action.cancel": "Annuler",
    "action.uncancel": "Rétablir",
    "notes.placeholder": "Notes de cette tâche",
    "notes.hint": "Ctrl+Entrée enregistre · Échap annule",
    "checklist.add": "Ajouter un élément",
    "checklist.rename": "Renommer l’élément",
    "checklist.delete": "Supprimer l’élément",
    "checklist.placeholder": "Élément de la liste",
    "task.projected": "Projetée d’après la règle de répétition — Things ne l’a pas encore créée",
    "action.rename": "Renommer",
    "action.delete": "Supprimer",
    "action.schedule": "Quand…",
    "action.move": "Déplacer…",
    "action.refresh": "Synchroniser",
    "action.back": "Retour",
    "action.search": "Rechercher",
    "action.showCompleted": "Afficher les terminées",
    "action.hideCompleted": "Masquer les terminées",
    "confirm.delete": "Supprimer « {title} » ?",
    "confirm.deleteCancel": "Conserver",
    "confirm.deleteOk": "Supprimer",
    "rename.placeholder": "Nouveau titre…",
    "state.syncing": "Synchronisation…",
    "state.synced": "Synchronisé {ago}",
    "state.stale": "Données en cache",
    "ago.now": "à l’instant",
    "ago.min": "il y a {n} min",
    "ago.hour": "il y a {n} h",
    "error.missing": "things3 n’est pas installé",
    "error.auth": "Things Cloud n’est pas configuré — lancez : things3 set-auth",
    "error.sync": "Échec de la synchronisation — données en cache",
    "error.generic": "échec de things3 : {detail}",
    "error.action": "Échec de l’action : {detail}",
    "help.title": "Clavier",
    "help.move": "↑ ↓ déplacer · Entrée terminer",
    "help.views": "Maj+Tab change de vue · 1…7 accès direct",
    "help.actions": "S quand · M déplacer · E renommer · T notes · X supprimer",
    "help.checklist": "C checklist · A ajouter un élément · ← → choisit une action de ligne",
    "help.add": "N nouvelle tâche · / rechercher · R sync · ? cette fiche"
  },

  "es": {
    "repeat.everyYears": ["cada {n} años"],
    "repeat.daily": "a diario",
    "repeat.weekly": "cada semana",
    "repeat.monthly": "cada mes",
    "repeat.yearly": "cada año",
    "repeat.everyDays": ["cada {n} días"],
    "repeat.everyWeeks": ["cada {n} semanas"],
    "repeat.everyMonths": ["cada {n} meses"],
    "repeat.generic": "se repite",
    "help.settings": ", ajustes · L idioma siguiente",
    "action.settings": "Ajustes",
    "settings.language": "Idioma",
    "settings.languageHint": "«Auto» sigue el idioma del sistema.",
    "appName": "Things",
    "view.today": "Hoy",
    "view.upcoming": "Próximo",
    "view.anytime": "En cualquier momento",
    "view.someday": "Algún día",
    "view.inbox": "Entrada",
    "view.projects": "Proyectos",
    "view.logbook": "Registro",
    "view.search": "Buscar",
    "empty.today": "Nada para hoy.",
    "empty.upcoming": "Nada programado por delante.",
    "empty.anytime": "«En cualquier momento» está vacío.",
    "empty.someday": "«Algún día» está vacío.",
    "empty.inbox": "La entrada está vacía.",
    "empty.projects": "Aún no hay proyectos.",
    "empty.logbook": "Nada completado recientemente.",
    "empty.search": "Sin coincidencias.",
    "empty.project": "Este proyecto no tiene tareas abiertas.",
    "empty.searchPrompt": "Escribe para buscar en todas las tareas.",
    "count.open": ["{n} abierta", "{n} abiertas"],
    "count.done": ["{n} hecha hoy", "{n} hechas hoy"],
    "count.overdue": ["{n} atrasada", "{n} atrasadas"],
    "count.none": "nada abierto",
    "day.today": "Hoy",
    "day.tomorrow": "Mañana",
    "day.yesterday": "Ayer",
    "day.evening": "Esta noche",
    "day.none": "Sin fecha",
    "add.placeholder": "Nueva tarea…  @cuándo  #proyecto  +etiqueta  !fecha límite  -- notas",
    "add.into": "en {target}",
    "add.preview": "→ {title}",
    "add.unresolved": "no reconocido: {marks}",
    "when.title": "Cuándo",
    "when.today": "Hoy",
    "when.evening": "Esta noche",
    "when.tomorrow": "Mañana",
    "when.anytime": "En cualquier momento",
    "when.someday": "Algún día",
    "when.typed": "Intro → {date}",
    "when.typedUnknown": "Escribe una fecha: sábado, próximo vie, en 3 días, 24 ago, 2026-09-01",
    "when.placeholder": "o escribe una fecha…",
    "move.title": "Mover a",
    "move.inbox": "Entrada",
    "move.placeholder": "filtrar proyectos y áreas…",
    "action.check": "Completar",
    "action.uncheck": "Marcar como pendiente",
    "action.notes": "Notas",
    "action.cancel": "Cancelar",
    "action.uncancel": "Restablecer",
    "notes.placeholder": "Notas de esta tarea",
    "notes.hint": "Ctrl+Intro guarda · Esc descarta",
    "checklist.add": "Añadir elemento",
    "checklist.rename": "Renombrar elemento",
    "checklist.delete": "Eliminar elemento",
    "checklist.placeholder": "Elemento de la lista",
    "task.projected": "Proyectada por la regla de repetición: Things aún no la ha creado",
    "action.rename": "Renombrar",
    "action.delete": "Eliminar",
    "action.schedule": "Cuándo…",
    "action.move": "Mover…",
    "action.refresh": "Sincronizar",
    "action.back": "Atrás",
    "action.search": "Buscar",
    "action.showCompleted": "Mostrar completadas",
    "action.hideCompleted": "Ocultar completadas",
    "confirm.delete": "¿Eliminar «{title}»?",
    "confirm.deleteCancel": "Conservar",
    "confirm.deleteOk": "Eliminar",
    "rename.placeholder": "Nuevo título…",
    "state.syncing": "Sincronizando…",
    "state.synced": "Sincronizado {ago}",
    "state.stale": "Mostrando datos en caché",
    "ago.now": "ahora mismo",
    "ago.min": "hace {n} min",
    "ago.hour": "hace {n} h",
    "error.missing": "things3 no está instalado",
    "error.auth": "Things Cloud no está configurado — ejecuta: things3 set-auth",
    "error.sync": "Fallo al sincronizar — mostrando datos en caché",
    "error.generic": "things3 falló: {detail}",
    "error.action": "La acción falló: {detail}",
    "help.title": "Teclado",
    "help.move": "↑ ↓ mover · Intro completar",
    "help.views": "Mayús+Tab cambia de vista · 1…7 acceso directo",
    "help.actions": "S cuándo · M mover · E renombrar · T notas · X eliminar",
    "help.checklist": "C lista · A añadir elemento · ← → elige una acción de la fila",
    "help.add": "N nueva tarea · / buscar · R sincronizar · ? esta tarjeta"
  },

  "it": {
    "repeat.everyYears": ["ogni {n} anni"],
    "repeat.daily": "ogni giorno",
    "repeat.weekly": "ogni settimana",
    "repeat.monthly": "ogni mese",
    "repeat.yearly": "ogni anno",
    "repeat.everyDays": ["ogni {n} giorni"],
    "repeat.everyWeeks": ["ogni {n} settimane"],
    "repeat.everyMonths": ["ogni {n} mesi"],
    "repeat.generic": "si ripete",
    "help.settings": ", impostazioni · L lingua successiva",
    "action.settings": "Impostazioni",
    "settings.language": "Lingua",
    "settings.languageHint": "«Auto» segue la lingua di sistema.",
    "appName": "Things",
    "view.today": "Oggi",
    "view.upcoming": "In arrivo",
    "view.anytime": "Quando capita",
    "view.someday": "Un giorno",
    "view.inbox": "In entrata",
    "view.projects": "Progetti",
    "view.logbook": "Diario",
    "view.search": "Cerca",
    "empty.today": "Niente da fare oggi.",
    "empty.upcoming": "Niente in programma.",
    "empty.anytime": "«Quando capita» è vuoto.",
    "empty.someday": "«Un giorno» è vuoto.",
    "empty.inbox": "La casella è vuota.",
    "empty.projects": "Ancora nessun progetto.",
    "empty.logbook": "Niente completato di recente.",
    "empty.search": "Nessun risultato.",
    "empty.project": "Questo progetto non ha attività aperte.",
    "empty.searchPrompt": "Scrivi per cercare in tutte le attività.",
    "count.open": ["{n} aperta", "{n} aperte"],
    "count.done": ["{n} fatta oggi", "{n} fatte oggi"],
    "count.overdue": ["{n} in ritardo", "{n} in ritardo"],
    "count.none": "niente di aperto",
    "day.today": "Oggi",
    "day.tomorrow": "Domani",
    "day.yesterday": "Ieri",
    "day.evening": "Stasera",
    "day.none": "Senza data",
    "add.placeholder": "Nuova attività…  @quando  #progetto  +tag  !scadenza  -- note",
    "add.into": "in {target}",
    "add.preview": "→ {title}",
    "add.unresolved": "non riconosciuto: {marks}",
    "when.title": "Quando",
    "when.today": "Oggi",
    "when.evening": "Stasera",
    "when.tomorrow": "Domani",
    "when.anytime": "Quando capita",
    "when.someday": "Un giorno",
    "when.typed": "Invio → {date}",
    "when.typedUnknown": "Scrivi una data: sabato, ven prossimo, tra 3 giorni, 24 ago, 2026-09-01",
    "when.placeholder": "oppure scrivi una data…",
    "move.title": "Sposta in",
    "move.inbox": "In entrata",
    "move.placeholder": "filtra progetti e aree…",
    "action.check": "Completa",
    "action.uncheck": "Segna da fare",
    "action.notes": "Note",
    "action.cancel": "Annulla",
    "action.uncancel": "Ripristina",
    "notes.placeholder": "Note di questa attività",
    "notes.hint": "Ctrl+Invio salva · Esc annulla",
    "checklist.add": "Aggiungi voce",
    "checklist.rename": "Rinomina voce",
    "checklist.delete": "Elimina voce",
    "checklist.placeholder": "Voce dell’elenco",
    "task.projected": "Prevista dalla regola di ricorrenza: Things non l’ha ancora creata",
    "action.rename": "Rinomina",
    "action.delete": "Elimina",
    "action.schedule": "Quando…",
    "action.move": "Sposta…",
    "action.refresh": "Sincronizza",
    "action.back": "Indietro",
    "action.search": "Cerca",
    "action.showCompleted": "Mostra completate",
    "action.hideCompleted": "Nascondi completate",
    "confirm.delete": "Eliminare «{title}»?",
    "confirm.deleteCancel": "Mantieni",
    "confirm.deleteOk": "Elimina",
    "rename.placeholder": "Nuovo titolo…",
    "state.syncing": "Sincronizzazione…",
    "state.synced": "Sincronizzato {ago}",
    "state.stale": "Dati dalla cache",
    "ago.now": "proprio ora",
    "ago.min": "{n} min fa",
    "ago.hour": "{n} h fa",
    "error.missing": "things3 non è installato",
    "error.auth": "Things Cloud non è configurato — esegui: things3 set-auth",
    "error.sync": "Sincronizzazione fallita — dati dalla cache",
    "error.generic": "things3 non è riuscito: {detail}",
    "error.action": "Azione fallita: {detail}",
    "help.title": "Tastiera",
    "help.move": "↑ ↓ muovi · Invio completa",
    "help.views": "Maiusc+Tab cambia vista · 1…7 vai",
    "help.actions": "S quando · M sposta · E rinomina · T note · X elimina",
    "help.checklist": "C checklist · A aggiungi voce · ← → sceglie un’azione della riga",
    "help.add": "N nuova attività · / cerca · R sincronizza · ? questa scheda"
  },

  "pt-BR": {
    "repeat.everyYears": ["a cada {n} anos"],
    "repeat.daily": "diariamente",
    "repeat.weekly": "semanalmente",
    "repeat.monthly": "mensalmente",
    "repeat.yearly": "anualmente",
    "repeat.everyDays": ["a cada {n} dias"],
    "repeat.everyWeeks": ["a cada {n} semanas"],
    "repeat.everyMonths": ["a cada {n} meses"],
    "repeat.generic": "se repete",
    "help.settings": ", ajustes · L próximo idioma",
    "action.settings": "Ajustes",
    "settings.language": "Idioma",
    "settings.languageHint": "“Auto” segue o idioma do sistema.",
    "appName": "Things",
    "view.today": "Hoje",
    "view.upcoming": "Em breve",
    "view.anytime": "A qualquer momento",
    "view.someday": "Algum dia",
    "view.inbox": "Entrada",
    "view.projects": "Projetos",
    "view.logbook": "Registro",
    "view.search": "Buscar",
    "empty.today": "Nada para hoje.",
    "empty.upcoming": "Nada agendado adiante.",
    "empty.anytime": "“A qualquer momento” está vazio.",
    "empty.someday": "“Algum dia” está vazio.",
    "empty.inbox": "A entrada está vazia.",
    "empty.projects": "Nenhum projeto ainda.",
    "empty.logbook": "Nada concluído recentemente.",
    "empty.search": "Nenhum resultado.",
    "empty.project": "Este projeto não tem tarefas abertas.",
    "empty.searchPrompt": "Digite para buscar em todas as tarefas.",
    "count.open": ["{n} aberta", "{n} abertas"],
    "count.done": ["{n} feita hoje", "{n} feitas hoje"],
    "count.overdue": ["{n} atrasada", "{n} atrasadas"],
    "count.none": "nada aberto",
    "day.today": "Hoje",
    "day.tomorrow": "Amanhã",
    "day.yesterday": "Ontem",
    "day.evening": "Hoje à noite",
    "day.none": "Sem data",
    "add.placeholder": "Nova tarefa…  @quando  #projeto  +etiqueta  !prazo  -- notas",
    "add.into": "em {target}",
    "add.preview": "→ {title}",
    "add.unresolved": "não reconhecido: {marks}",
    "when.title": "Quando",
    "when.today": "Hoje",
    "when.evening": "Hoje à noite",
    "when.tomorrow": "Amanhã",
    "when.anytime": "A qualquer momento",
    "when.someday": "Algum dia",
    "when.typed": "Enter → {date}",
    "when.typedUnknown": "Digite uma data: sábado, próx sex, em 3 dias, 24 ago, 2026-09-01",
    "when.placeholder": "ou digite uma data…",
    "move.title": "Mover para",
    "move.inbox": "Entrada",
    "move.placeholder": "filtrar projetos e áreas…",
    "action.check": "Concluir",
    "action.uncheck": "Marcar como pendente",
    "action.notes": "Notas",
    "action.cancel": "Cancelar",
    "action.uncancel": "Restaurar",
    "notes.placeholder": "Notas desta tarefa",
    "notes.hint": "Ctrl+Enter salva · Esc descarta",
    "checklist.add": "Adicionar item",
    "checklist.rename": "Renomear item",
    "checklist.delete": "Excluir item",
    "checklist.placeholder": "Item da lista",
    "task.projected": "Projetada pela regra de repetição — o Things ainda não a criou",
    "action.rename": "Renomear",
    "action.delete": "Excluir",
    "action.schedule": "Quando…",
    "action.move": "Mover…",
    "action.refresh": "Sincronizar",
    "action.back": "Voltar",
    "action.search": "Buscar",
    "action.showCompleted": "Mostrar concluídas",
    "action.hideCompleted": "Ocultar concluídas",
    "confirm.delete": "Excluir “{title}”?",
    "confirm.deleteCancel": "Manter",
    "confirm.deleteOk": "Excluir",
    "rename.placeholder": "Novo título…",
    "state.syncing": "Sincronizando…",
    "state.synced": "Sincronizado {ago}",
    "state.stale": "Mostrando dados em cache",
    "ago.now": "agora mesmo",
    "ago.min": "há {n} min",
    "ago.hour": "há {n} h",
    "error.missing": "things3 não está instalado",
    "error.auth": "O Things Cloud não está configurado — execute: things3 set-auth",
    "error.sync": "Falha ao sincronizar — mostrando dados em cache",
    "error.generic": "things3 falhou: {detail}",
    "error.action": "A ação falhou: {detail}",
    "help.title": "Teclado",
    "help.move": "↑ ↓ mover · Enter concluir",
    "help.views": "Shift+Tab troca de visão · 1…7 ir direto",
    "help.actions": "S quando · M mover · E renomear · T notas · X excluir",
    "help.checklist": "C checklist · A adicionar item · ← → escolhe uma ação da linha",
    "help.add": "N nova tarefa · / buscar · R sincronizar · ? este cartão"
  },

  "pl": {
    "repeat.everyYears": ["co {n} rok", "co {n} lata", "co {n} lat"],
    "repeat.daily": "codziennie",
    "repeat.weekly": "co tydzień",
    "repeat.monthly": "co miesiąc",
    "repeat.yearly": "co rok",
    "repeat.everyDays": ["co {n} dzień", "co {n} dni", "co {n} dni"],
    "repeat.everyWeeks": ["co {n} tydzień", "co {n} tygodnie", "co {n} tygodni"],
    "repeat.everyMonths": ["co {n} miesiąc", "co {n} miesiące", "co {n} miesięcy"],
    "repeat.generic": "powtarza się",
    "help.settings": ", ustawienia · L następny język",
    "action.settings": "Ustawienia",
    "settings.language": "Język",
    "settings.languageHint": "„Auto” podąża za językiem systemu.",
    "appName": "Things",
    "view.today": "Dzisiaj",
    "view.upcoming": "Nadchodzące",
    "view.anytime": "Kiedykolwiek",
    "view.someday": "Kiedyś",
    "view.inbox": "Skrzynka",
    "view.projects": "Projekty",
    "view.logbook": "Dziennik",
    "view.search": "Szukaj",
    "empty.today": "Nic na dzisiaj.",
    "empty.upcoming": "Nic nie zaplanowano.",
    "empty.anytime": "„Kiedykolwiek” jest puste.",
    "empty.someday": "„Kiedyś” jest puste.",
    "empty.inbox": "Skrzynka jest pusta.",
    "empty.projects": "Brak projektów.",
    "empty.logbook": "Ostatnio nic nie ukończono.",
    "empty.search": "Brak wyników.",
    "empty.project": "Ten projekt nie ma otwartych zadań.",
    "empty.searchPrompt": "Pisz, aby przeszukać wszystkie zadania.",
    "count.open": ["{n} otwarte", "{n} otwarte", "{n} otwartych"],
    "count.done": ["{n} zrobione dzisiaj", "{n} zrobione dzisiaj", "{n} zrobionych dzisiaj"],
    "count.overdue": ["{n} zaległe", "{n} zaległe", "{n} zaległych"],
    "count.none": "nic otwartego",
    "day.today": "Dzisiaj",
    "day.tomorrow": "Jutro",
    "day.yesterday": "Wczoraj",
    "day.evening": "Dziś wieczorem",
    "day.none": "Bez daty",
    "add.placeholder": "Nowe zadanie…  @kiedy  #projekt  +tag  !termin  -- notatki",
    "add.into": "do {target}",
    "add.preview": "→ {title}",
    "add.unresolved": "nie rozpoznano: {marks}",
    "when.title": "Kiedy",
    "when.today": "Dzisiaj",
    "when.evening": "Dziś wieczorem",
    "when.tomorrow": "Jutro",
    "when.anytime": "Kiedykolwiek",
    "when.someday": "Kiedyś",
    "when.typed": "Enter → {date}",
    "when.typedUnknown": "Wpisz datę: sobota, następny pt, za 3 dni, 24 sie, 2026-09-01",
    "when.placeholder": "albo wpisz datę…",
    "move.title": "Przenieś do",
    "move.inbox": "Skrzynka",
    "move.placeholder": "filtruj projekty i obszary…",
    "action.check": "Ukończ",
    "action.uncheck": "Oznacz jako otwarte",
    "action.notes": "Notatki",
    "action.cancel": "Anuluj",
    "action.uncancel": "Przywróć",
    "notes.placeholder": "Notatki do tego zadania",
    "notes.hint": "Ctrl+Enter zapisuje · Esc anuluje",
    "checklist.add": "Dodaj pozycję",
    "checklist.rename": "Zmień nazwę pozycji",
    "checklist.delete": "Usuń pozycję",
    "checklist.placeholder": "Pozycja listy",
    "task.projected": "Wyliczone z reguły powtarzania — Things jeszcze jej nie utworzył",
    "action.rename": "Zmień nazwę",
    "action.delete": "Usuń",
    "action.schedule": "Kiedy…",
    "action.move": "Przenieś…",
    "action.refresh": "Synchronizuj",
    "action.back": "Wstecz",
    "action.search": "Szukaj",
    "action.showCompleted": "Pokaż ukończone",
    "action.hideCompleted": "Ukryj ukończone",
    "confirm.delete": "Usunąć „{title}”?",
    "confirm.deleteCancel": "Zachowaj",
    "confirm.deleteOk": "Usuń",
    "rename.placeholder": "Nowy tytuł…",
    "state.syncing": "Synchronizowanie…",
    "state.synced": "Zsynchronizowano {ago}",
    "state.stale": "Dane z pamięci podręcznej",
    "ago.now": "przed chwilą",
    "ago.min": "{n} min temu",
    "ago.hour": "{n} godz. temu",
    "error.missing": "things3 nie jest zainstalowany",
    "error.auth": "Things Cloud nie jest skonfigurowany — uruchom: things3 set-auth",
    "error.sync": "Synchronizacja nie powiodła się — dane z pamięci podręcznej",
    "error.generic": "things3 zawiodło: {detail}",
    "error.action": "Akcja nie powiodła się: {detail}",
    "help.title": "Klawiatura",
    "help.move": "↑ ↓ ruch · Enter ukończ",
    "help.views": "Shift+Tab zmienia widok · 1…7 skok",
    "help.actions": "S kiedy · M przenieś · E zmień nazwę · T notatki · X usuń",
    "help.checklist": "C lista · A dodaj pozycję · ← → wybiera akcję wiersza",
    "help.add": "N nowe zadanie · / szukaj · R synchronizuj · ? ta karta"
  },

  "ru": {
    "repeat.everyYears": ["каждый {n} год", "каждые {n} года", "каждые {n} лет"],
    "repeat.daily": "ежедневно",
    "repeat.weekly": "еженедельно",
    "repeat.monthly": "ежемесячно",
    "repeat.yearly": "ежегодно",
    "repeat.everyDays": ["каждый {n} день", "каждые {n} дня", "каждые {n} дней"],
    "repeat.everyWeeks": ["каждую {n} неделю", "каждые {n} недели", "каждые {n} недель"],
    "repeat.everyMonths": ["каждый {n} месяц", "каждые {n} месяца", "каждые {n} месяцев"],
    "repeat.generic": "повторяется",
    "help.settings": ", настройки · L следующий язык",
    "action.settings": "Настройки",
    "settings.language": "Язык",
    "settings.languageHint": "«Auto» следует языку системы.",
    "appName": "Things",
    "view.today": "Сегодня",
    "view.upcoming": "Предстоящие",
    "view.anytime": "Когда-нибудь",
    "view.someday": "Однажды",
    "view.inbox": "Входящие",
    "view.projects": "Проекты",
    "view.logbook": "Журнал",
    "view.search": "Поиск",
    "empty.today": "На сегодня ничего нет.",
    "empty.upcoming": "Ничего не запланировано.",
    "empty.anytime": "«Когда-нибудь» пусто.",
    "empty.someday": "«Однажды» пусто.",
    "empty.inbox": "Входящие пусты.",
    "empty.projects": "Проектов пока нет.",
    "empty.logbook": "Недавно ничего не завершено.",
    "empty.search": "Совпадений нет.",
    "empty.project": "В этом проекте нет открытых задач.",
    "empty.searchPrompt": "Введите текст для поиска по всем задачам.",
    "count.open": ["{n} открытая", "{n} открытые", "{n} открытых"],
    "count.done": ["{n} сделана сегодня", "{n} сделаны сегодня", "{n} сделано сегодня"],
    "count.overdue": ["{n} просроченная", "{n} просроченные", "{n} просроченных"],
    "count.none": "ничего не открыто",
    "day.today": "Сегодня",
    "day.tomorrow": "Завтра",
    "day.yesterday": "Вчера",
    "day.evening": "Сегодня вечером",
    "day.none": "Без даты",
    "add.placeholder": "Новая задача…  @когда  #проект  +метка  !срок  -- заметки",
    "add.into": "в {target}",
    "add.preview": "→ {title}",
    "add.unresolved": "не распознано: {marks}",
    "when.title": "Когда",
    "when.today": "Сегодня",
    "when.evening": "Сегодня вечером",
    "when.tomorrow": "Завтра",
    "when.anytime": "Когда-нибудь",
    "when.someday": "Однажды",
    "when.typed": "Enter → {date}",
    "when.typedUnknown": "Введите дату: суббота, следующая пт, через 3 дня, 24 авг, 2026-09-01",
    "when.placeholder": "или введите дату…",
    "move.title": "Переместить в",
    "move.inbox": "Входящие",
    "move.placeholder": "фильтр проектов и областей…",
    "action.check": "Завершить",
    "action.uncheck": "Отметить незавершённой",
    "action.notes": "Заметки",
    "action.cancel": "Отменить",
    "action.uncancel": "Восстановить",
    "notes.placeholder": "Заметки к задаче",
    "notes.hint": "Ctrl+Enter — сохранить · Esc — отменить",
    "checklist.add": "Добавить пункт",
    "checklist.rename": "Переименовать пункт",
    "checklist.delete": "Удалить пункт",
    "checklist.placeholder": "Пункт списка",
    "task.projected": "Рассчитано по правилу повторения — Things её ещё не создал",
    "action.rename": "Переименовать",
    "action.delete": "Удалить",
    "action.schedule": "Когда…",
    "action.move": "Переместить…",
    "action.refresh": "Синхронизировать",
    "action.back": "Назад",
    "action.search": "Поиск",
    "action.showCompleted": "Показать завершённые",
    "action.hideCompleted": "Скрыть завершённые",
    "confirm.delete": "Удалить «{title}»?",
    "confirm.deleteCancel": "Оставить",
    "confirm.deleteOk": "Удалить",
    "rename.placeholder": "Новое название…",
    "state.syncing": "Синхронизация…",
    "state.synced": "Синхронизировано {ago}",
    "state.stale": "Показаны данные из кэша",
    "ago.now": "только что",
    "ago.min": "{n} мин назад",
    "ago.hour": "{n} ч назад",
    "error.missing": "things3 не установлен",
    "error.auth": "Things Cloud не настроен — выполните: things3 set-auth",
    "error.sync": "Сбой синхронизации — показаны данные из кэша",
    "error.generic": "things3 завершился с ошибкой: {detail}",
    "error.action": "Действие не выполнено: {detail}",
    "help.title": "Клавиатура",
    "help.move": "↑ ↓ перемещение · Enter завершить",
    "help.views": "Shift+Tab меняет вид · 1…7 переход",
    "help.actions": "S когда · M переместить · E переименовать · T заметки · X удалить",
    "help.checklist": "C список · A добавить пункт · ← → выбирает действие строки",
    "help.add": "N новая задача · / поиск · R синхронизация · ? эта карточка"
  },

  "zh-CN": {
    "repeat.everyYears": ["每 {n} 年"],
    "repeat.daily": "每天",
    "repeat.weekly": "每周",
    "repeat.monthly": "每月",
    "repeat.yearly": "每年",
    "repeat.everyDays": ["每 {n} 天"],
    "repeat.everyWeeks": ["每 {n} 周"],
    "repeat.everyMonths": ["每 {n} 个月"],
    "repeat.generic": "重复",
    "help.settings": ", 设置 · L 下一种语言",
    "action.settings": "设置",
    "settings.language": "语言",
    "settings.languageHint": "“Auto”跟随系统语言。",
    "appName": "Things",
    "view.today": "今天",
    "view.upcoming": "计划",
    "view.anytime": "随时",
    "view.someday": "某天",
    "view.inbox": "收件箱",
    "view.projects": "项目",
    "view.logbook": "日志",
    "view.search": "搜索",
    "empty.today": "今天没有待办。",
    "empty.upcoming": "后续没有安排。",
    "empty.anytime": "“随时”是空的。",
    "empty.someday": "“某天”是空的。",
    "empty.inbox": "收件箱是空的。",
    "empty.projects": "还没有项目。",
    "empty.logbook": "最近没有完成的事项。",
    "empty.search": "没有匹配项。",
    "empty.project": "该项目没有未完成的任务。",
    "empty.searchPrompt": "输入以搜索全部任务。",
    "count.open": ["{n} 项未完成"],
    "count.done": ["今天完成 {n} 项"],
    "count.overdue": ["{n} 项逾期"],
    "count.none": "没有未完成的",
    "day.today": "今天",
    "day.tomorrow": "明天",
    "day.yesterday": "昨天",
    "day.evening": "今晚",
    "day.none": "无日期",
    "add.placeholder": "新任务…  @时间  #项目  +标签  !截止  -- 备注",
    "add.into": "放入 {target}",
    "add.preview": "→ {title}",
    "add.unresolved": "无法识别：{marks}",
    "when.title": "时间",
    "when.today": "今天",
    "when.evening": "今晚",
    "when.tomorrow": "明天",
    "when.anytime": "随时",
    "when.someday": "某天",
    "when.typed": "回车 → {date}",
    "when.typedUnknown": "输入日期：周六、下周五、3 天后、8月24日、2026-09-01",
    "when.placeholder": "或输入日期…",
    "move.title": "移动到",
    "move.inbox": "收件箱",
    "move.placeholder": "筛选项目和领域…",
    "action.check": "完成",
    "action.uncheck": "标记为未完成",
    "action.notes": "备注",
    "action.cancel": "取消",
    "action.uncancel": "恢复",
    "notes.placeholder": "此任务的备注",
    "notes.hint": "Ctrl+Enter 保存 · Esc 放弃",
    "checklist.add": "添加清单项",
    "checklist.rename": "重命名清单项",
    "checklist.delete": "删除清单项",
    "checklist.placeholder": "清单项",
    "task.projected": "根据重复规则推算，Things 尚未创建",
    "action.rename": "重命名",
    "action.delete": "删除",
    "action.schedule": "时间…",
    "action.move": "移动…",
    "action.refresh": "立即同步",
    "action.back": "返回",
    "action.search": "搜索",
    "action.showCompleted": "显示已完成",
    "action.hideCompleted": "隐藏已完成",
    "confirm.delete": "删除“{title}”？",
    "confirm.deleteCancel": "保留",
    "confirm.deleteOk": "删除",
    "rename.placeholder": "新标题…",
    "state.syncing": "同步中…",
    "state.synced": "已同步 {ago}",
    "state.stale": "显示缓存数据",
    "ago.now": "刚刚",
    "ago.min": "{n} 分钟前",
    "ago.hour": "{n} 小时前",
    "error.missing": "未安装 things3",
    "error.auth": "尚未配置 Things Cloud — 请运行：things3 set-auth",
    "error.sync": "同步失败 — 显示缓存数据",
    "error.generic": "things3 失败：{detail}",
    "error.action": "操作失败：{detail}",
    "help.title": "键盘",
    "help.move": "↑ ↓ 移动 · 回车 完成",
    "help.views": "Shift+Tab 切换视图 · 1…7 直达",
    "help.actions": "S 时间 · M 移动 · E 重命名 · T 备注 · X 删除",
    "help.checklist": "C 清单 · A 添加清单项 · ← → 选择行内操作",
    "help.add": "N 新任务 · / 搜索 · R 同步 · ? 本卡片"
  }
}

// Zilele și lunile, pentru etichetele de grup din „Urmează" și „Jurnal".
// Scrise aici, nu luate din Qt.locale(): un fișier `.pragma library` nu are
// acces la Qt, iar oricum limba panoului nu e neapărat cea a sistemului.
var ZILE_SCURTE = {
  "en": ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  "ro": ["Dum", "Lun", "Mar", "Mie", "Joi", "Vin", "Sâm"],
  "de": ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"],
  "fr": ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"],
  "es": ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"],
  "it": ["dom", "lun", "mar", "mer", "gio", "ven", "sab"],
  "pt-BR": ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"],
  "pl": ["nd", "pn", "wt", "śr", "cz", "pt", "sb"],
  "ru": ["вс", "пн", "вт", "ср", "чт", "пт", "сб"],
  "zh-CN": ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]
}

var LUNI_SCURTE = {
  "en": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  "ro": ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "noi", "dec"],
  "de": ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"],
  "fr": ["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"],
  "es": ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
  "it": ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"],
  "pt-BR": ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"],
  "pl": ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"],
  "ru": ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"],
  "zh-CN": ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"]
}

// Ordinea în care se scrie o zi anume. Engleza pune luna înaintea numărului,
// germana cere punctul ordinal, iar chineza scrie luna și ziua lipite și duce
// ziua săptămânii la coadă. Fără asta, toate ar ieși pe tiparul românesc.
var FORMAT_ZI = {
  "en": "{zi} {luna} {d}",
  "ro": "{zi} {d} {luna}",
  "de": "{zi} {d}. {luna}",
  "fr": "{zi} {d} {luna}",
  "es": "{zi} {d} {luna}",
  "it": "{zi} {d} {luna}",
  "pt-BR": "{zi} {d} {luna}",
  "pl": "{zi} {d} {luna}",
  "ru": "{zi} {d} {luna}",
  "zh-CN": "{luna}{d}日 {zi}"
}

// Forma fără ziua săptămânii, pentru insigna de termen de pe un rând. Are
// nevoie de o intrare pentru fiecare limbă: fără ea s-ar fi întors la tiparul
// englez „luna ziua", și un termen românesc ar fi ieșit „sep 18".
var FORMAT_SCURT = {
  "en": "{luna} {d}",
  "ro": "{d} {luna}",
  "de": "{d}. {luna}",
  "fr": "{d} {luna}",
  "es": "{d} {luna}",
  "it": "{d} {luna}",
  "pt-BR": "{d} {luna}",
  "pl": "{d} {luna}",
  "ru": "{d} {luna}",
  "zh-CN": "{luna}{d}日"
}

function inlocuieste(sablon, params) {
  var text = String(sablon || "")
  if (!params) {
    return text
  }
  for (var cheie in params) {
    text = text.split("{" + cheie + "}").join(String(params[cheie]))
  }
  return text
}

function brut(cod, cheie) {
  var dict = TEXTE[cod] || TEXTE.en
  if (dict[cheie] !== undefined) {
    return dict[cheie]
  }
  if (TEXTE.en[cheie] !== undefined) {
    return TEXTE.en[cheie]
  }
  return cheie
}

function t(cod, cheie, params) {
  var valoare = brut(cod, cheie)
  // O cheie cu forme de plural cerută fără număr: prima formă e cea mai
  // rezonabilă, și tot e mai bine decât „[object Array]" pe ecran.
  if (Array.isArray(valoare)) {
    valoare = valoare[0]
  }
  return inlocuieste(valoare, params)
}

// Cheile numărate țin un șir de forme; indexPlural alege forma pentru n.
function tn(cod, cheie, n, params) {
  var forme = brut(cod, cheie)
  if (forme === undefined) {
    return cheie
  }
  if (!Array.isArray(forme)) {
    forme = [forme]
  }
  var idx = Math.min(indexPlural(cod, n), forme.length - 1)
  var toate = { n: n }
  for (var cheieParam in (params || {})) {
    toate[cheieParam] = params[cheieParam]
  }
  return inlocuieste(forme[idx], toate)
}

function _dinIso(text) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || ""))
  if (!m) {
    return null
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function _compune(cod, zi, cuZiuaSaptamanii) {
  var zileScurte = ZILE_SCURTE[cod] || ZILE_SCURTE.en
  var luniScurte = LUNI_SCURTE[cod] || LUNI_SCURTE.en
  var tipar = cuZiuaSaptamanii
    ? (FORMAT_ZI[cod] || FORMAT_ZI.en)
    : (FORMAT_SCURT[cod] || FORMAT_SCURT.en)
  return inlocuieste(tipar, {
    zi: zileScurte[zi.getDay()],
    d: zi.getDate(),
    luna: luniScurte[zi.getMonth()]
  })
}

// „Azi" / „Mâine" / „Vin 18 sep" pentru un „YYYY-MM-DD".
function etichetaZi(cod, ziIso, aziIso) {
  if (!ziIso) {
    return t(cod, "day.none")
  }
  var zi = _dinIso(ziIso)
  if (!zi) {
    return ziIso
  }
  if (aziIso) {
    var azi = _dinIso(aziIso)
    if (azi) {
      var delta = Math.round(
        (new Date(zi.getFullYear(), zi.getMonth(), zi.getDate()).getTime()
         - new Date(azi.getFullYear(), azi.getMonth(), azi.getDate()).getTime()) / 86400000)
      if (delta === 0) {
        return t(cod, "day.today")
      }
      if (delta === 1) {
        return t(cod, "day.tomorrow")
      }
      if (delta === -1) {
        return t(cod, "day.yesterday")
      }
    }
  }
  return _compune(cod, zi, true)
}

// Forma scurtă, pentru insigna de termen de pe un rând: „18 sep".
function dataScurta(cod, ziIso) {
  var zi = _dinIso(ziIso)
  if (!zi) {
    return String(ziIso || "")
  }
  return _compune(cod, zi, false)
}

// Vechimea instantaneului, pentru linia de stare din capul panoului.
function catTimpInUrma(cod, epoch, acum) {
  if (!epoch) {
    return ""
  }
  var secunde = Math.max(0, Math.floor((acum || (Date.now() / 1000)) - epoch))
  if (secunde < 90) {
    return t(cod, "ago.now")
  }
  var minute = Math.round(secunde / 60)
  if (minute < 90) {
    return t(cod, "ago.min", { n: minute })
  }
  return t(cod, "ago.hour", { n: Math.round(minute / 60) })
}

// Eroarea helperului, în limba panoului. Codurile vin din bin/things-preia
// („missing", „auth", „cli", „timeout", „internal") tocmai ca să poată fi
// traduse aici, nu ca propoziții gata scrise.
function textEroare(cod, fel, detaliu) {
  if (fel === "missing") {
    return t(cod, "error.missing")
  }
  if (fel === "auth") {
    return t(cod, "error.auth")
  }
  return t(cod, "error.generic", { detail: String(detaliu || fel || "?") })
}

// Rezumatul din tooltipul barei: vederea curentă și cât are în ea.
function rezumatBara(cod, vedere, numar, bifateAzi) {
  var numeVedere = t(cod, "view." + vedere)
  if (vedere === "logbook") {
    return tn(cod, "count.done", bifateAzi || 0)
  }
  if (!numar) {
    return numeVedere + " · " + t(cod, "count.none")
  }
  return numeVedere + " · " + tn(cod, "count.open", numar)
}

// Cadența unui task recurent, în cuvinte. `repeat` vine din bin/things-preia
// ca { unit, interval }; o unitate pe care helperul n-a putut-o recunoaște
// ajunge aici ca "" și iese ca „se repetă" — mai bine vag decât greșit.
function textRecurenta(cod, repeat) {
  if (!repeat) {
    return ""
  }
  var unitate = String(repeat.unit || "")
  var n = Number(repeat.interval) || 1
  if (unitate === "") {
    return t(cod, "repeat.generic")
  }
  if (n === 1) {
    if (unitate === "day") return t(cod, "repeat.daily")
    if (unitate === "week") return t(cod, "repeat.weekly")
    if (unitate === "month") return t(cod, "repeat.monthly")
    if (unitate === "year") return t(cod, "repeat.yearly")
    return t(cod, "repeat.generic")
  }
  if (unitate === "day") return tn(cod, "repeat.everyDays", n)
  if (unitate === "week") return tn(cod, "repeat.everyWeeks", n)
  if (unitate === "month") return tn(cod, "repeat.everyMonths", n)
  if (unitate === "year") return tn(cod, "repeat.everyYears", n)
  return t(cod, "repeat.generic")
}
