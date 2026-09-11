import QtQuick
import QtQuick.Controls
import Quickshell
import Quickshell.Io
import Quickshell.Services.UPower
import qs.Commons
import qs.Ui
import "Model.js" as Model
import "I18n.js" as I18n

// Things 3 în bara Omarchy: o pastilă cu vederea curentă și câte are în ea, și
// un panou care ține toate cele șapte vederi ale aplicației — Azi, Urmează,
// Oricând, Cândva, Inbox, Proiecte, Jurnal — plus căutare peste tot.
//
// Panoul nu vorbește el cu Things Cloud. bin/things-preia face o singură
// sincronizare și scoate un JSON cu tot (task-uri, apartenența la vederi,
// proiecte cu progres, arii, etichete); scrierile se duc direct la CLI-ul
// `things3`, cu argumentele date ca vector, niciodată printr-un shell.
//
// Desenul urmează panourile native ale shell-ului, nu un stil propriu:
// aceleași primitive (CursorSurface pentru rânduri, PanelSectionHeader pentru
// antete, PanelActionButton pentru acțiunile de pe margine), aceiași tokeni de
// spațiere și tipografie din Style, aceeași structură „erou · separator ·
// listă" ca la bluetooth sau network.
//
// Niciun text vizibil nu e scris aici: totul vine din I18n.js, pe cheie, în
// limba dată de setarea `language` („Auto" = limba sistemului).
Panel {
  id: root
  moduleName: "mghizdavet.things"
  ipcTarget: "things"
  // manageIpc: false ca panoul să dețină el singurul IpcHandler pe care ținta
  // îl permite — avem nevoie de el pentru metodele de mai jos, care fac
  // widget-ul scriptabil (`omarchy-shell things adauga "cumpără lapte"`).
  manageIpc: false

  // ------------------------------------------------------------------ setări

  readonly property string limba: I18n.limba(setting("language", "Auto"), Qt.locale().name)
  readonly property string limbaSetata: I18n.codLimba(setting("language", "Auto"))

  // Cadența ține de sursa de curent: fiecare reîmprospătare e o sincronizare
  // cu norul, adică o trezire de radio. UPower.onBattery e false și când nu
  // există baterie deloc, ceea ce e răspunsul corect pentru un desktop.
  readonly property int intervalPeRetea: Math.max(60, Math.min(7200, setting("refreshIntervalSec", 300)))
  readonly property int intervalPeBaterie: Math.max(60, Math.min(7200, setting("refreshIntervalOnBatterySec", 900)))
  readonly property bool peRetea: !UPower.onBattery
  readonly property int intervalActualizare: peRetea ? intervalPeRetea : intervalPeBaterie

  readonly property string vedereImplicita: normalizeazaVedere(setting("defaultView", "Today"))
  readonly property bool arataNumarul: setting("showCount", true) === true
  readonly property bool arataNotite: setting("showNotes", true) === true
  readonly property bool confirmaStergerea: setting("confirmDelete", true) === true
  readonly property int limitaLogbook: Math.max(1, Math.min(90, setting("logbookDays", 14)))
  readonly property string tintaImplicita: String(setting("quickAddTarget", "Inbox"))

  readonly property string caleHelper: String(Qt.resolvedUrl("bin/things-preia")).replace(/^file:\/\//, "")

  readonly property var limbiDisponibile: I18n.limbi()

  // Setarea stă în shell.json, iar shell.json e al shell-ului: `setBarWidget`
  // e calea lui oficială de a schimba o setare de widget, și singura care
  // anunță și widget-ul viu. Se scrie numele întreg („Português (BR)"), nu
  // codul, ca fișierul să rămână citibil și să se potrivească cu opțiunile
  // declarate în manifest.
  function seteazaLimba(cod) {
    if (cod === root.limbaSetata) {
      return
    }
    Util.execArgv(["omarchy-shell", "shell", "setBarWidget", root.moduleName,
                   "language", JSON.stringify(I18n.numeLimba(cod)), "{}"])
  }

  // Tasta `L` trece la limba următoare, ca selectorul să fie folosibil și
  // fără mouse; după ultima se întoarce la „Auto".
  function cicleazaLimba() {
    var lista = root.limbiDisponibile
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].cod === root.limbaSetata) {
        root.seteazaLimba(lista[(i + 1) % lista.length].cod)
        return
      }
    }
    root.seteazaLimba(lista.length > 0 ? lista[0].cod : "auto")
  }

  // Numele afișat al unei vederi, tradus, dintr-o valoare de setare scrisă în
  // engleză. Setarea rămâne stabilă când se schimbă limba.
  function normalizeazaVedere(valoare) {
    var v = String(valoare || "").toLowerCase()
    for (var i = 0; i < Model.VEDERI.length; i++) {
      if (Model.VEDERI[i] === v) {
        return Model.VEDERI[i]
      }
    }
    return "today"
  }

  // -------------------------------------------------------------------- stare

  property var instantaneu: Model.instantaneuGol()
  property bool sePreia: false
  property string vedere: "today"
  // Proiectul în care s-a intrat din vederea „Proiecte"; "" înseamnă lista.
  property string proiectDeschis: ""
  // "list" | "search" | "when" | "move" | "rename" | "notes" | "help"
  property string mod: "list"
  property string interogare: ""
  // Task-ul pe care lucrează foaia deschisă (când / mută / redenumește).
  property string tintaFoaie: ""
  property var desfasurate: ({})
  property bool arataComplete: false
  property string eroareActiune: ""
  property date acum: new Date()

  // Modificări optimiste: bifarea și ștergerea se văd pe loc, iar
  // instantaneul următor le confirmă. Fără ele, fiecare bifă ar îngheța
  // rândul pentru cele ~800 ms cât durează scrierea plus sincronizarea.
  property var stariLocale: ({})
  property var ascunse: ({})

  readonly property color culoareText: bar ? bar.foreground : Color.foreground
  readonly property color culoareUrgent: bar ? bar.urgent : Color.urgent
  readonly property color culoareSlaba: Qt.darker(culoareText, 1.5)
  readonly property string fontulBarei: bar ? bar.fontFamily : Style.font.family

  readonly property color umplereHover: bar
    ? Style.hoverFillFor(bar.foreground, Color.accent)
    : "transparent"
  readonly property color umplereSelectata: bar
    ? Style.selectedFillFor(bar.foreground, Color.accent)
    : "transparent"

  // Instantaneul cu modificările optimiste aplicate. Se copiază doar când
  // există ceva de suprascris — altfel se întoarce chiar obiectul original,
  // ca reîmprospătarea obișnuită să nu cloneze 188 de task-uri degeaba.
  readonly property var instantaneuEfectiv: {
    var areStari = false
    var k
    for (k in stariLocale) { areStari = true; break }
    var areAscunse = false
    for (k in ascunse) { areAscunse = true; break }
    if (!areStari && !areAscunse) {
      return instantaneu
    }

    var copie = {
      ok: instantaneu.ok, error: instantaneu.error, errorKind: instantaneu.errorKind,
      syncError: instantaneu.syncError, at: instantaneu.at, today: instantaneu.today,
      tasks: {}, views: {}, projects: instantaneu.projects,
      areas: instantaneu.areas, tags: instantaneu.tags, counts: instantaneu.counts
    }
    for (var id in instantaneu.tasks) {
      if (ascunse[id]) {
        continue
      }
      var task = instantaneu.tasks[id]
      if (stariLocale[id] !== undefined && stariLocale[id] !== task.status) {
        var clona = {}
        for (var camp in task) {
          clona[camp] = task[camp]
        }
        clona.status = stariLocale[id]
        copie.tasks[id] = clona
      } else {
        copie.tasks[id] = task
      }
    }
    for (var vedereNume in instantaneu.views) {
      var ids = instantaneu.views[vedereNume]
      var pastrate = []
      for (var i = 0; i < ids.length; i++) {
        if (!ascunse[ids[i]]) {
          pastrate.push(ids[i])
        }
      }
      copie.views[vedereNume] = pastrate
    }
    return copie
  }

  readonly property var proiectCurent: {
    if (proiectDeschis === "") {
      return null
    }
    var lista = instantaneuEfectiv.projects || []
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].id === proiectDeschis) {
        return lista[i]
      }
    }
    return null
  }

  // Rândurile efectiv desenate. O singură listă aplatizată, ca la panourile
  // native: antetele sunt rânduri și ele, doar că nu sunt opriri de cursor.
  readonly property var randuri: {
    if (mod === "search") {
      return Model.randuriCautare(instantaneuEfectiv, interogare, desfasurate, true)
    }
    if (proiectDeschis !== "") {
      return Model.randuriInProiect(instantaneuEfectiv, proiectDeschis, desfasurate, arataComplete)
    }
    if (vedere === "today") {
      return Model.randuriToday(instantaneuEfectiv, desfasurate)
    }
    if (vedere === "upcoming") {
      return Model.randuriUpcoming(instantaneuEfectiv, desfasurate)
    }
    if (vedere === "inbox") {
      return Model.randuriInbox(instantaneuEfectiv, desfasurate)
    }
    if (vedere === "projects") {
      return Model.randuriProiecte(instantaneuEfectiv)
    }
    if (vedere === "logbook") {
      return Model.randuriLogbook(instantaneuEfectiv, desfasurate)
    }
    return Model.randuriSimple(instantaneuEfectiv, vedere, desfasurate)
  }

  readonly property var opriri: Model.opriri(randuri)

  // Câte rânduri se desenează efectiv. Lista nu e virtualizată (vezi
  // comentariul de la Flickable), deci o căutare care prinde tot ce ai
  // vreodată ar instanția tot. 300 e mult peste ce produc vederile în uz
  // normal — Jurnalul pe 14 zile face vreo 40 — deci taie doar patologicul.
  readonly property int limitaRanduri: 300
  readonly property var randuriAfisate: randuri.length > limitaRanduri
    ? randuri.slice(0, limitaRanduri)
    : randuri

  // ---------------------------------------------------------------- cursorul

  property int pozitieCursor: 0
  property bool cursorActiv: false
  // Butonul de acțiune pe care stă cursorul în rândul curent; -1 = rândul
  // însuși. Se umblă prin ele cu stânga/dreapta, ca la panourile native.
  property int indexActiune: -1

  readonly property int randCurent: {
    if (pozitieCursor < 0 || pozitieCursor >= opriri.length) {
      return -1
    }
    return opriri[pozitieCursor]
  }

  readonly property var randSelectat: {
    if (randCurent < 0 || randCurent >= randuri.length) {
      return null
    }
    return randuri[randCurent]
  }

  readonly property var taskSelectat: {
    var r = randSelectat
    if (!r) {
      return null
    }
    if (r.kind === "task") {
      return r.task
    }
    if (r.kind === "check") {
      return r.parent
    }
    return null
  }

  // Câte butoane de acțiune are rândul curent — de asta depinde până unde
  // merge cursorul orizontal.
  readonly property int actiuniPeRand: {
    var r = randSelectat
    if (!r) {
      return 0
    }
    if (r.kind === "task") {
      // Ocurențele proiectate n-au un id pe care CLI-ul să-l accepte, deci
      // n-au nici butoane — cursorul orizontal nu are unde să meargă.
      return r.task && r.task.projected ? 0 : 6
    }
    if (r.kind === "check") {
      return 2
    }
    if (r.kind === "project") {
      return 0
    }
    return 0
  }

  function limiteazaCursorul() {
    if (opriri.length === 0) {
      pozitieCursor = 0
      indexActiune = -1
      return
    }
    if (pozitieCursor > opriri.length - 1) {
      pozitieCursor = opriri.length - 1
    }
    if (pozitieCursor < 0) {
      pozitieCursor = 0
    }
    if (indexActiune >= actiuniPeRand) {
      indexActiune = actiuniPeRand - 1
    }
  }

  onOpririChanged: limiteazaCursorul()

  function mutaCursorul(delta) {
    if (opriri.length === 0) {
      return
    }
    cursorActiv = true
    indexActiune = -1
    pozitieCursor = Math.max(0, Math.min(opriri.length - 1, pozitieCursor + delta))
  }

  function mutaCursorulOrizontal(delta) {
    if (!cursorActiv || actiuniPeRand === 0) {
      return
    }
    var urmator = indexActiune + delta
    // -1 e rândul însuși: din primul buton, stânga se întoarce la rând.
    indexActiune = Math.max(-1, Math.min(actiuniPeRand - 1, urmator))
  }

  function laInceput() {
    cursorActiv = true
    indexActiune = -1
    pozitieCursor = 0
  }

  // ------------------------------------------------------------- preluarea

  // Cât are voie să adune colectorul dintr-o preluare. Helperul își taie deja
  // și intrările, și ieșirea, dar colectorul e ultimul loc unde textul stă
  // întreg în memoria shell-ului — și singurul de care răspundem noi dacă
  // helperul e înlocuit sau moare la jumătatea unui șir. Un instantaneu real
  // stă sub un megaoctet; peste plafonul ăsta nu mai e nimic de citit, e o
  // scurgere.
  readonly property int plafonPreluare: 16 * 1024 * 1024
  property bool preluarePreaMare: false

  function actualizeaza(cuSincronizare) {
    if (sePreia) {
      return
    }
    sePreia = true
    preluarePreaMare = false
    var argv = [root.caleHelper, "--logbook-days", String(root.limitaLogbook)]
    if (cuSincronizare === false) {
      argv.push("--no-sync")
    }
    preluare.command = argv
    preluare.running = true
  }

  Process {
    id: preluare
    running: false
    stdout: StdioCollector {
      // Fără `waitForEnd`: cu el, lungimea s-ar afla abia după ce tot textul
      // a intrat în memorie, adică prea târziu ca să mai însemne ceva.
      waitForEnd: false
      onDataChanged: {
        if (!root.preluarePreaMare && text.length > root.plafonPreluare) {
          // Oprirea procesului închide țeava, deci scrierea se termină aici;
          // ce s-a strâns până acum nu mai trece prin JSON.parse.
          root.preluarePreaMare = true
          preluare.running = false
        }
      }
      onStreamFinished: {
        var brut = null
        if (root.preluarePreaMare) {
          root.instantaneu = Model.normalizeazaInstantaneu({ ok: false, errorKind: "oversize" })
        } else {
          try {
            brut = JSON.parse(text)
          } catch (e) {
            brut = null
          }
        }
        if (brut) {
          root.instantaneu = Model.normalizeazaInstantaneu(brut)
          // Instantaneul proaspăt e adevărul; presupunerile optimiste și-au
          // făcut treaba și pleacă odată cu el.
          root.stariLocale = ({})
          root.ascunse = ({})
        }
        root.acum = new Date()
        root.sePreia = false
      }
    }
    onExited: root.sePreia = false
  }

  // ------------------------------------------------------------- scrierile
  //
  // Toate merg la `things3` cu argumentele ca vector — niciun shell, deci un
  // titlu care conține ghilimele, `$` sau `;` e doar text. Se rulează una
  // câte una: CLI-ul scrie în același jurnal local, iar două scrieri în
  // paralel se pot bate pe el.

  property var coadaActiuni: []
  property bool ruleazaActiune: false

  function executa(argv) {
    root.eroareActiune = ""
    coadaActiuni = coadaActiuni.concat([argv])
    porneste()
  }

  function porneste() {
    if (ruleazaActiune || coadaActiuni.length === 0) {
      return
    }
    var urmator = coadaActiuni[0]
    coadaActiuni = coadaActiuni.slice(1)
    ruleazaActiune = true
    actiune.command = ["things3"].concat(urmator)
    actiune.running = true
  }

  Process {
    id: actiune
    running: false
    stderr: StdioCollector {
      // Din stderr ne trebuie primul rând, atât. Plafonul e larg dinadins:
      // un `things3` care scrie un megaoctet de erori la o scriere e deja
      // stricat, iar oprirea lui nu ia nimic ce ar fi mers bine — dar un
      // plafon strâns ar putea tăia o scriere adevărată la jumătate.
      readonly property int plafon: 1024 * 1024
      waitForEnd: false
      onDataChanged: {
        if (text.length > plafon) {
          actiune.running = false
        }
      }
      onStreamFinished: {
        var mesaj = String(text || "").replace(/^\s+|\s+$/g, "")
        if (mesaj !== "") {
          root.eroareActiune = mesaj.split(/\r?\n/)[0]
        }
      }
    }
    onExited: function (cod) {
      root.ruleazaActiune = false
      if (cod !== 0 && root.eroareActiune === "") {
        root.eroareActiune = I18n.t(root.limba, "error.action", { detail: "exit " + cod })
      }
      if (root.coadaActiuni.length > 0) {
        root.porneste()
        return
      }
      // Ultima scriere din rafală: acum se reîmprospătează, **cu**
      // sincronizare. Scrierea își face și ea un sync, dar acela se termină
      // odată cu ea: o modificare venită de pe telefon între timp n-ar
      // intra, iar o împingere eșuată n-ar fi reîncercată până la ceasul
      // următor. Un sync explicit la coada rafalei închide amândouă găurile,
      // și e ieftin — vreo 0,7 s, în fundal, peste o listă care s-a
      // actualizat deja optimist.
      root.actualizeaza(true)
    }
  }

  // ------------------------------------------------------------------ acțiuni

  function marcheaza(task, gata) {
    if (!task || task.projected) {
      return
    }
    var local = {}
    for (var k in stariLocale) {
      local[k] = stariLocale[k]
    }
    local[task.id] = gata ? "completed" : "incomplete"
    stariLocale = local
    executa(["mark", gata ? "--done" : "--incomplete", task.id])
  }

  // Anulat nu e totuna cu terminat: Things le ține separat, iar „am renunțat"
  // spune altceva decât „am făcut". Enter pe un rând anulat îl readuce la
  // incomplete, prin marcheaza(), deci reversul nu are nevoie de buton.
  function anuleaza(task) {
    if (!task || task.projected || task.status === "canceled") {
      return
    }
    var local = {}
    for (var k in stariLocale) {
      local[k] = stariLocale[k]
    }
    local[task.id] = "canceled"
    stariLocale = local
    executa(["mark", "--canceled", task.id])
  }

  function editeazaNotite(task, text) {
    if (!task || task.projected) {
      return
    }
    // Șirul gol e valid și înseamnă „șterge notițele" — CLI-ul îl documentează
    // ca atare, deci nu se filtrează ca o valoare lipsă.
    executa(["edit", "--notes", String(text), task.id])
  }

  function adaugaInChecklist(task, titlu) {
    var curat = String(titlu || "").trim()
    if (!task || task.projected || curat === "") {
      return
    }
    executa(["edit", "--add-checklist", curat, task.id])
  }

  function redenumesteItem(parinte, item, titlu) {
    var curat = String(titlu || "").trim()
    if (!parinte || !item || curat === "") {
      return
    }
    // `sid:titlu` e formatul cerut de CLI; două puncte în titlu nu strică
    // nimic, fiindcă el desparte doar la primul.
    executa(["edit", "--rename-checklist", item.sid + ":" + curat, parinte.id])
  }

  function stergeItem(parinte, item) {
    if (!parinte || !item) {
      return
    }
    executa(["edit", "--remove-checklist", item.sid, parinte.id])
  }

  function comutaBifa(task) {
    if (!task) {
      return
    }
    marcheaza(task, task.status === "incomplete")
  }

  function comutaChecklist(parinte, item) {
    if (!parinte || !item) {
      return
    }
    executa(["mark", item.done ? "--uncheck" : "--check", item.sid, parinte.id])
  }

  function stergeTask(task) {
    if (!task || task.projected) {
      return
    }
    var noi = {}
    for (var k in ascunse) {
      noi[k] = ascunse[k]
    }
    noi[task.id] = true
    ascunse = noi
    executa(["delete", task.id])
  }

  function programeaza(task, valoare) {
    if (!task || valoare === "") {
      return
    }
    executa(["schedule", "--when", valoare, task.id])
  }

  function puneTermen(task, valoare) {
    if (!task) {
      return
    }
    if (valoare === "") {
      executa(["schedule", "--clear-deadline", task.id])
      return
    }
    executa(["schedule", "--deadline", valoare, task.id])
  }

  function muta(task, tinta) {
    if (!task || !tinta) {
      return
    }
    executa(["edit", "--move", tinta, task.id])
  }

  function redenumeste(task, titlu) {
    var curat = String(titlu || "").replace(/^\s+|\s+$/g, "")
    if (!task || curat === "") {
      return
    }
    executa(["edit", "--title", curat, task.id])
  }

  // Ținta implicită a lui quick-add: setarea, dar contextul bate setarea —
  // scriind într-un proiect deschis, task-ul se duce acolo, nu în Inbox.
  readonly property string tintaQuickAdd: {
    if (proiectDeschis !== "") {
      return proiectDeschis
    }
    var t = tintaImplicita.toLowerCase()
    if (t === "current view" && vedere === "inbox") {
      return "inbox"
    }
    return "inbox"
  }

  readonly property string numeleTintei: {
    if (proiectCurent) {
      return proiectCurent.title
    }
    return I18n.t(root.limba, "move.inbox")
  }

  // „Azi" pune și programarea pe azi, altfel un task adăugat din vederea Azi
  // ar dispărea în Inbox în clipa în care e scris.
  readonly property string candImplicit: vedere === "today" && proiectDeschis === "" ? "today" : ""

  function adauga(linie) {
    var parsat = Model.parseQuickAdd(linie, instantaneuEfectiv, new Date())
    if (!parsat.ok) {
      return false
    }

    var argv = ["new", parsat.title]

    var tinta = parsat.container.id !== "" ? parsat.container.id : root.tintaQuickAdd
    if (tinta !== "") {
      argv.push("--in")
      argv.push(tinta)
    }

    var cand = parsat.when.value !== "" ? parsat.when.value : root.candImplicit
    if (cand !== "") {
      argv.push("--when")
      argv.push(cand)
    }
    if (parsat.deadline.value !== "" && parsat.deadline.kind === "date") {
      argv.push("--deadline")
      argv.push(parsat.deadline.value)
    }
    if (parsat.notes !== "") {
      argv.push("--notes")
      argv.push(parsat.notes)
    }
    if (parsat.tags.length > 0) {
      argv.push("--tags")
      argv.push(parsat.tags.join(","))
    }

    executa(argv)
    return true
  }

  function comutaDesfasurarea(task) {
    if (!task || (task.checklist || []).length === 0) {
      return
    }
    var noi = {}
    for (var k in desfasurate) {
      noi[k] = desfasurate[k]
    }
    if (noi[task.id]) {
      delete noi[task.id]
    } else {
      noi[task.id] = true
    }
    desfasurate = noi
  }

  function deschideLegatura(task) {
    if (!task) {
      return
    }
    var url = Model.primulLink(task.notes)
    if (url !== "") {
      Quickshell.execDetached(["xdg-open", url])
    }
  }

  // ------------------------------------------------------------------ vederi

  function schimbaVederea(nume) {
    if (Model.VEDERI.indexOf(nume) < 0) {
      return
    }
    vedere = nume
    proiectDeschis = ""
    mod = "list"
    interogare = ""
    laInceput()
  }

  function cicleazaVederea(pas) {
    var i = Model.VEDERI.indexOf(vedere)
    if (i < 0) {
      i = 0
    }
    var urmator = (i + pas + Model.VEDERI.length) % Model.VEDERI.length
    schimbaVederea(Model.VEDERI[urmator])
  }

  function deschideProiectul(id) {
    proiectDeschis = id
    mod = "list"
    arataComplete = false
    laInceput()
  }

  function inapoi() {
    if (mod !== "list") {
      mod = "list"
      tintaFoaie = ""
      tintaItem = ""
      laInceput()
      return
    }
    if (proiectDeschis !== "") {
      proiectDeschis = ""
      laInceput()
      return
    }
    root.close()
  }

  function deschideFoaia(nume) {
    if (!taskSelectat || taskSelectat.projected) {
      return
    }
    tintaFoaie = taskSelectat.id
    mod = nume
  }

  readonly property var taskFoaie: {
    if (tintaFoaie === "") {
      return null
    }
    return Model.taskDupaId(instantaneuEfectiv, tintaFoaie)
  }

  // `sid`-ul elementului de checklist pe care îl editează foaia, gol când
  // foaia e despre task-ul întreg.
  property string tintaItem: ""

  onModChanged: if (mod !== "renameItem") {
    tintaItem = ""
  }

  readonly property var itemFoaie: {
    if (tintaItem === "" || !taskFoaie) {
      return null
    }
    var lista = taskFoaie.checklist || []
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].sid === tintaItem) {
        return lista[i]
      }
    }
    return null
  }

  // ------------------------------------------------------------------- taste

  function activeazaCursorul() {
    var r = randSelectat
    if (!r) {
      return
    }
    if (indexActiune >= 0 && r.kind === "task") {
      declanseazaActiunea(r.task, indexActiune)
      return
    }
    if (indexActiune >= 0 && r.kind === "check") {
      declanseazaActiuneaItem(r.parent, r.item, indexActiune)
      return
    }
    if (r.kind === "task") {
      comutaBifa(r.task)
    } else if (r.kind === "check") {
      comutaChecklist(r.parent, r.item)
    } else if (r.kind === "project") {
      deschideProiectul(r.project.id)
    }
  }

  function declanseazaActiunea(task, index) {
    if (!task || task.projected) {
      return
    }
    if (index === 0) {
      tintaFoaie = task.id
      mod = "when"
    } else if (index === 1) {
      tintaFoaie = task.id
      mod = "move"
    } else if (index === 2) {
      tintaFoaie = task.id
      mod = "rename"
    } else if (index === 3) {
      tintaFoaie = task.id
      mod = "notes"
    } else if (index === 4) {
      anuleaza(task)
    } else if (index === 5) {
      cereStergerea(task)
    }
  }

  function declanseazaActiuneaItem(parinte, item, index) {
    if (!parinte || !item) {
      return
    }
    if (index === 0) {
      tintaFoaie = parinte.id
      tintaItem = item.sid
      mod = "renameItem"
    } else if (index === 1) {
      stergeItem(parinte, item)
    }
  }

  property var taskDeSters: null

  function cereStergerea(task) {
    if (!task || task.projected) {
      return
    }
    if (!confirmaStergerea) {
      stergeTask(task)
      return
    }
    taskDeSters = task
    dialogStergere.opened = true
  }

  function stergeSelectia() {
    if (taskSelectat) {
      cereStergerea(taskSelectat)
    }
  }

  function tastaScurta(text) {
    // Cifrele sar direct la vedere, în ordinea din bara laterală a aplicației.
    var cifra = parseInt(text, 10)
    if (!isNaN(cifra) && cifra >= 1 && cifra <= Model.VEDERI.length) {
      schimbaVederea(Model.VEDERI[cifra - 1])
      return
    }

    if (text === "n") {
      campAdaugare.forceActiveFocus()
    } else if (text === "/") {
      mod = "search"
      interogare = ""
      Qt.callLater(function () { campCautare.forceActiveFocus() })
    } else if (text === "r") {
      actualizeaza(true)
    } else if (text === "s") {
      deschideFoaia("when")
    } else if (text === "m") {
      deschideFoaia("move")
    } else if (text === "e") {
      deschideFoaia("rename")
    } else if (text === "t") {
      deschideFoaia("notes")
    } else if (text === "a") {
      deschideFoaia("addItem")
    } else if (text === "c") {
      comutaDesfasurarea(taskSelectat)
    } else if (text === "o") {
      deschideLegatura(taskSelectat)
    } else if (text === "g") {
      laInceput()
    } else if (text === "d" && proiectDeschis !== "") {
      arataComplete = !arataComplete
    } else if (text === "?") {
      mod = mod === "help" ? "list" : "help"
    } else if (text === ",") {
      mod = mod === "settings" ? "list" : "settings"
    } else if (text === "L") {
      // „L", nu „l": PanelKeyCatcher folosește deja litera mică pentru
      // mutarea vim-style la dreapta și consumă evenimentul, deci minuscula
      // nu ajunge niciodată până aici.
      cicleazaLimba()
    }
  }

  // --------------------------------------------------------------------- IPC

  IpcHandler {
    target: "things"

    function open(): void { root.open() }
    function close(): void { root.close() }
    function show(): void { root.open() }
    function hide(): void { root.close() }
    function toggle(): void { root.toggle() }
    function refresh(): void { root.actualizeaza(true) }

    // `omarchy-shell things adauga "cumpără lapte @mâine #Cumpărături"`
    function adauga(linie: string): string {
      if (root.adauga(linie)) {
        return "ok"
      }
      return "empty title"
    }

    function view(nume: string): string {
      var v = String(nume || "").toLowerCase()
      if (Model.VEDERI.indexOf(v) < 0) {
        return "unknown view: " + v
      }
      root.schimbaVederea(v)
      return "ok"
    }

    function count(): string {
      return String(Model.numarBara(root.instantaneu, root.vedere))
    }
  }

  // ---------------------------------------------------------------- ceasul

  Timer {
    interval: root.intervalActualizare * 1000
    running: true
    repeat: true
    triggeredOnStart: false
    onTriggered: root.actualizeaza(true)
  }

  // Cât timp panoul stă deschis, „acum 3 min" din capul lui trebuie să
  // înainteze; închis, nu are cine să-l citească.
  Timer {
    interval: 30000
    running: root.opened
    repeat: true
    onTriggered: root.acum = new Date()
  }

  Component.onCompleted: {
    root.vedere = root.vedereImplicita
    root.actualizeaza(true)
  }

  onOpenedChanged: {
    if (opened) {
      root.acum = new Date()
      root.actualizeaza(true)
      root.cursorActiv = false
      root.indexActiune = -1
    } else {
      // Panoul se închide curat: foile deschise și căutarea nu au de ce să
      // aștepte acolo până la următoarea deschidere.
      root.mod = "list"
      root.tintaFoaie = ""
      root.interogare = ""
      root.eroareActiune = ""
      dialogStergere.opened = false
    }
  }

  // -------------------------------------------------------------- pastila

  readonly property int numarulDinBara: Model.numarBara(instantaneuEfectiv, vedere)
  readonly property bool areEroare: !instantaneu.ok || eroareActiune !== ""
  readonly property string pictogramaBarei: Model.PICTOGRAME[vedere] || "󰗡"

  readonly property string rezumatul: {
    if (!instantaneu.ok) {
      return I18n.textEroare(limba, instantaneu.errorKind, instantaneu.error)
    }
    if (eroareActiune !== "") {
      return I18n.t(limba, "error.action", { detail: eroareActiune })
    }
    var text = I18n.rezumatBara(limba, vedere, numarulDinBara, (instantaneu.counts || {}).doneToday || 0)
    if (instantaneu.syncError !== "") {
      return text + " · " + I18n.t(limba, "error.sync")
    }
    return text
  }

  visible: true
  implicitWidth: buton.implicitWidth
  implicitHeight: buton.implicitHeight

  WidgetButton {
    id: buton
    anchors.fill: parent
    bar: root.bar
    labelVisible: false
    hasVisualContent: true
    // Aer în jurul pilulei. Rândul de module al barei are spacing 0, deci tot
    // spațiul dintre widget-uri vine din marginea lor internă — aceiași 20px
    // ca la rss și omatop, ca pastilele cu text să nu se lipească.
    fixedWidth: vertical ? -1 : continut.implicitWidth + Style.space(20)
    fixedHeight: vertical ? continut.implicitHeight + Style.space(8) : -1
    active: root.areEroare || root.numarulDinBara > 0
    tooltipText: root.rezumatul
    onPressed: function (codButon) {
      // Dreapta sincronizează pe loc, mijlociu trece la vederea următoare.
      if (codButon === Qt.RightButton) {
        root.actualizeaza(true)
      } else if (codButon === Qt.MiddleButton) {
        root.cicleazaVederea(1)
      } else {
        root.toggle()
      }
    }

    Row {
      id: continut
      anchors.centerIn: parent
      spacing: Style.spacing.labelGap

      // Pânza păstrează ÎNĂLȚIMEA standard a pictogramelor din bară, dar
      // lățimea e cea a cernelii: o pânză pătrată ar lăsa un joc lateral
      // diferit pentru fiecare glifă, deci spațiul până la număr ar ieși
      // altul la fiecare schimbare de vedere. OpticalGlyph centrează cerneala
      // pe mijlocul pânzei, deci o pânză strânsă pe ea o lasă exact acolo.
      Item {
        anchors.verticalCenter: parent.verticalCenter
        implicitWidth: Math.ceil(glif.tightWidth)
        implicitHeight: Style.bar.iconCanvas

        OpticalGlyph {
          id: glif
          anchors.fill: parent
          text: root.areEroare ? "󰀨" : root.pictogramaBarei
          // Peste `bar.iconFont`, nu la el: tokenul e o mărime de font, iar
          // cerneala pe care o dă diferă de la glifă la glifă. Aceeași
          // corecție ca la rss, ca pastila să stea în banda verticală a
          // vecinilor ei din secțiunea dreaptă.
          fontSize: Style.bar.iconFont + Style.space(3)
          fontFamily: buton.fontFamily
          color: root.areEroare ? root.culoareUrgent : buton.foreground
        }
      }

      Text {
        anchors.verticalCenter: parent.verticalCenter
        textFormat: Text.PlainText
        visible: root.arataNumarul && !buton.vertical
        text: String(root.numarulDinBara)
        color: buton.foreground
        font.family: buton.fontFamily
        font.pixelSize: Style.font.body
        renderType: Text.NativeRendering
      }
    }
  }

  // --------------------------------------------------------------- panoul

  KeyboardPanel {
    id: panou
    anchorItem: buton
    owner: root
    bar: root.bar
    open: root.opened
    focusTarget: prinzatorTaste
    contentWidth: panou.fittedContentWidth(Style.space(620))
    contentHeight: panou.fittedContentHeight(coloana.implicitHeight)

    PanelKeyCatcher {
      id: prinzatorTaste
      anchors.fill: parent
      // Cât timp scrii, tastele sunt ale câmpului: altfel „n" ar deschide
      // adăugarea în loc să ajungă în text.
      blocked: campAdaugare.activeFocus || campCautare.activeFocus
        || root.mod === "when" || root.mod === "move" || root.mod === "rename"
        || root.mod === "notes" || root.mod === "addItem" || root.mod === "renameItem"
        || dialogStergere.opened

      onCloseRequested: root.inapoi()
      onTabRequested: function (direction) { root.switchPanel(direction) }
      onMoveRequested: function (dx, dy) {
        if (!root.cursorActiv) {
          root.cursorActiv = true
          return
        }
        if (dy !== 0) {
          root.mutaCursorul(dy)
        } else if (dx !== 0) {
          root.mutaCursorulOrizontal(dx)
        }
      }
      onActivateRequested: if (root.cursorActiv) root.activeazaCursorul()
      onDeleteRequested: if (root.cursorActiv) root.stergeSelectia()
      onTextKey: function (text) { root.tastaScurta(text) }

      // PanelKeyCatcher nu are semnal pentru Home (tastele fără text cad prin
      // el). Contextul implicit al lui Shortcut e fereastra, deci nu fură
      // Home de la alte panouri.
      Shortcut {
        sequences: ["Home"]
        enabled: root.opened && !prinzatorTaste.blocked
        onActivated: root.laInceput()
      }

      Column {
        id: coloana
        anchors.fill: parent
        spacing: Style.space(12)

        // ---------- eroul: pictograma · Things · starea ----------
        Item {
          width: parent.width
          implicitHeight: Math.max(pictogramaErou.implicitHeight, etichetele.implicitHeight,
                                   butonSincronizare.implicitHeight)

          Text {
            id: pictogramaErou
            textFormat: Text.PlainText
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            text: root.areEroare ? "󰀨" : "󰗡"
            color: root.areEroare ? root.culoareUrgent : root.culoareText
            font.family: root.fontulBarei
            font.pixelSize: Style.font.display
          }

          PanelActionButton {
            id: butonSincronizare
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            iconText: "󰑐"
            tooltipText: I18n.t(root.limba, "action.refresh")
            foreground: root.culoareText
            hoverColor: root.culoareText
            fontFamily: root.fontulBarei
            enabled: !root.sePreia
            onClicked: root.actualizeaza(true)
          }

          PanelActionButton {
            id: butonSetari
            anchors.right: butonSincronizare.left
            anchors.rightMargin: Style.space(2)
            anchors.verticalCenter: parent.verticalCenter
            iconText: "󰒓"
            tooltipText: I18n.t(root.limba, "action.settings")
            foreground: root.culoareText
            hoverColor: root.culoareText
            fontFamily: root.fontulBarei
            onClicked: root.mod = root.mod === "settings" ? "list" : "settings"
          }

          Column {
            id: etichetele
            anchors.left: pictogramaErou.right
            anchors.leftMargin: Style.space(14)
            anchors.right: butonSetari.left
            anchors.rightMargin: Style.space(12)
            anchors.verticalCenter: parent.verticalCenter
            spacing: Style.space(2)

            Text {
              textFormat: Text.PlainText
              text: I18n.brut(root.limba, "appName")
              color: root.culoareText
              font.family: root.fontulBarei
              font.pixelSize: Style.font.title
              font.bold: true
              elide: Text.ElideRight
              width: parent.width
            }

            Text {
              textFormat: Text.PlainText
              text: {
                if (!root.instantaneu.ok) {
                  return I18n.textEroare(root.limba, root.instantaneu.errorKind, root.instantaneu.error)
                }
                if (root.eroareActiune !== "") {
                  return root.eroareActiune
                }
                if (root.sePreia) {
                  return I18n.t(root.limba, "state.syncing")
                }
                if (root.instantaneu.syncError !== "") {
                  return I18n.t(root.limba, "state.stale")
                }
                return I18n.t(root.limba, "state.synced", {
                  ago: I18n.catTimpInUrma(root.limba, root.instantaneu.at, root.acum.getTime() / 1000)
                })
              }
              color: root.areEroare ? root.culoareUrgent : Qt.darker(root.culoareText, 1.4)
              font.family: root.fontulBarei
              font.pixelSize: Style.font.caption
              font.bold: true
              font.letterSpacing: 1.2
              elide: Text.ElideRight
              width: parent.width
            }
          }
        }

        PanelSeparator { foreground: root.culoareText }

        // ---------- vederile ----------
        // Doar cea aleasă își scrie numele; restul rămân pictograme, ca toate
        // șapte plus căutarea să încapă pe un rând fără să înghesuie panoul.
        Flow {
          id: taburi
          width: parent.width
          spacing: Style.space(4)

          Repeater {
            model: Model.VEDERI

            Button {
              required property var modelData
              readonly property bool aleasa: root.mod !== "search" && root.vedere === modelData

              iconText: Model.PICTOGRAME[modelData] || ""
              text: aleasa ? I18n.t(root.limba, "view." + modelData) : ""
              tooltipText: I18n.t(root.limba, "view." + modelData) + "  ·  "
                + String(Model.numara(root.instantaneuEfectiv, modelData))
              selected: aleasa
              foreground: root.culoareText
              accent: Color.accent
              fontFamily: root.fontulBarei
              fontSize: Style.font.bodySmall
              iconSize: Style.font.body
              horizontalPadding: Style.space(8)
              verticalPadding: Style.space(4)
              onClicked: root.schimbaVederea(modelData)
            }
          }

          Button {
            iconText: "󰍉"
            text: root.mod === "search" ? I18n.t(root.limba, "view.search") : ""
            tooltipText: I18n.t(root.limba, "action.search")
            selected: root.mod === "search"
            foreground: root.culoareText
            accent: Color.accent
            fontFamily: root.fontulBarei
            fontSize: Style.font.bodySmall
            iconSize: Style.font.body
            horizontalPadding: Style.space(8)
            verticalPadding: Style.space(4)
            onClicked: {
              root.mod = root.mod === "search" ? "list" : "search"
              root.interogare = ""
              if (root.mod === "search") {
                Qt.callLater(function () { campCautare.forceActiveFocus() })
              }
            }
          }
        }

        // ---------- firimiturile proiectului deschis ----------
        Item {
          width: parent.width
          visible: root.proiectDeschis !== "" && root.mod === "list"
          height: visible ? Math.max(butonInapoi.implicitHeight, titluProiect.implicitHeight) : 0

          PanelActionButton {
            id: butonInapoi
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            iconText: "󰅁"
            tooltipText: I18n.t(root.limba, "action.back")
            foreground: root.culoareText
            hoverColor: root.culoareText
            fontFamily: root.fontulBarei
            onClicked: root.inapoi()
          }

          Text {
            id: titluProiect
            anchors.left: butonInapoi.right
            anchors.leftMargin: Style.space(8)
            anchors.right: butonComplete.left
            anchors.rightMargin: Style.space(8)
            anchors.verticalCenter: parent.verticalCenter
            textFormat: Text.PlainText
            text: root.proiectCurent
              ? root.proiectCurent.title + "  ·  " + root.proiectCurent.open + "/" + root.proiectCurent.total
              : ""
            color: root.culoareText
            font.family: root.fontulBarei
            font.pixelSize: Style.font.subtitle
            font.bold: true
            elide: Text.ElideRight
          }

          PanelActionButton {
            id: butonComplete
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            iconText: root.arataComplete ? "󰗠" : "󰗡"
            tooltipText: root.arataComplete
              ? I18n.t(root.limba, "action.hideCompleted")
              : I18n.t(root.limba, "action.showCompleted")
            foreground: root.culoareText
            hoverColor: root.culoareText
            fontFamily: root.fontulBarei
            onClicked: root.arataComplete = !root.arataComplete
          }
        }

        // ---------- adăugarea rapidă ----------
        Column {
          width: parent.width
          spacing: Style.space(4)
          visible: root.mod === "list" && root.vedere !== "logbook"
          height: visible ? implicitHeight : 0

          TextField {
            id: campAdaugare
            width: parent.width
            foreground: root.culoareText
            accent: Color.accent
            font.family: root.fontulBarei
            font.pixelSize: Style.font.body
            verticalPadding: Style.space(5)
            placeholderText: I18n.t(root.limba, "add.placeholder")

            onAccepted: {
              if (root.adauga(text)) {
                text = ""
              }
            }

            Keys.onEscapePressed: function (event) {
              // Primul Esc scoate focusul din câmp; al doilea, prins acum de
              // PanelKeyCatcher, închide panoul.
              prinzatorTaste.forceActiveFocus()
              event.accepted = true
            }
          }

          // Previzualizarea a ce se va trimite, nu o repovestire a ei:
          // valorile de aici sunt exact cele parsate.
          Text {
            width: parent.width
            visible: campAdaugare.text.replace(/^\s+|\s+$/g, "") !== ""
            textFormat: Text.PlainText
            wrapMode: Text.WordWrap
            color: previzualizare.unresolved.length > 0 ? root.culoareUrgent : Qt.darker(root.culoareText, 1.5)
            font.family: root.fontulBarei
            font.pixelSize: Style.font.caption

            readonly property var previzualizare: Model.parseQuickAdd(campAdaugare.text, root.instantaneuEfectiv, new Date())

            text: {
              var p = previzualizare
              if (!p.ok && p.unresolved.length === 0) {
                return ""
              }
              var bucati = []
              if (p.title !== "") {
                bucati.push(I18n.t(root.limba, "add.preview", { title: p.title }))
              }
              // „#inbox" se rezolvă în Model cu eticheta lui englezească;
              // numele afișat al Inbox-ului e al panoului, care știe limba.
              var tinta = p.container.kind === "inbox"
                ? I18n.t(root.limba, "move.inbox")
                : (p.container.title !== "" ? p.container.title : root.numeleTintei)
              bucati.push(I18n.t(root.limba, "add.into", { target: tinta }))
              if (p.when.kind === "date") {
                bucati.push("󰃭 " + I18n.etichetaZi(root.limba, p.when.value, root.instantaneu.today))
              } else if (p.when.kind === "bucket") {
                bucati.push("󰃭 " + I18n.t(root.limba, "when." + p.when.value))
              }
              if (p.deadline.kind === "date") {
                bucati.push("󰈻 " + I18n.dataScurta(root.limba, p.deadline.value))
              }
              for (var i = 0; i < p.tags.length; i++) {
                bucati.push("󰓹 " + p.tags[i])
              }
              if (p.notes !== "") {
                bucati.push("󰦨 " + Model.rezumatNotite(p.notes, 40))
              }
              var linie = bucati.join("   ")
              if (p.unresolved.length > 0) {
                linie += "   " + I18n.t(root.limba, "add.unresolved", { marks: p.unresolved.join(" ") })
              }
              return linie
            }
          }
        }

        // ---------- căutarea ----------
        TextField {
          id: campCautare
          width: parent.width
          visible: root.mod === "search"
          height: visible ? implicitHeight : 0
          foreground: root.culoareText
          accent: Color.accent
          font.family: root.fontulBarei
          font.pixelSize: Style.font.body
          verticalPadding: Style.space(5)
          placeholderText: I18n.t(root.limba, "empty.searchPrompt")
          onTextChanged: {
            root.interogare = text
            root.laInceput()
          }
          Keys.onEscapePressed: function (event) {
            root.mod = "list"
            root.interogare = ""
            prinzatorTaste.forceActiveFocus()
            event.accepted = true
          }
        }

        // Aer între câmpul în care scrii și lista de dedesubt. Cei 12px de
        // spațiere ai coloanei sunt potriviți între secțiunile de sus, dar
        // aici despărțirea contează mai mult: câmpul e un loc unde scrii,
        // lista unul unde citești, iar cele două se citeau lipite.
        //
        // Aerul stă *deasupra* separatorului, nu sub el: separatorul e
        // capacul listei, nu o linie plutind între două lucruri. Și e pus
        // aici, într-un înveliș, nu ca un frate în coloană — un copil în plus
        // ar fi luat spațierea coloanei de două ori, deci 24px dintr-o dată.
        Item {
          width: parent.width
          visible: root.mod === "list" || root.mod === "search"
          height: visible ? Style.space(10) + separator.implicitHeight : 0

          PanelSeparator {
            id: separator
            anchors.bottom: parent.bottom
            anchors.left: parent.left
            anchors.right: parent.right
            foreground: root.culoareText
          }
        }

        // ---------- lista ----------
        //
        // Un Flickable cu o coloană, nu un ListView. Panoul trebuie să-și
        // urmeze conținutul până la un plafon, iar un ListView nu poate da
        // asta fără buclă: el își instanțiază delegații doar cât îi intră în
        // viewport, deci `contentHeight` depinde de `height` — și `height`
        // legat de `contentHeight` închide cercul. Qt rupe bucla singur, dar
        // o raportează, iar înălțimea se poate opri pe o valoare veche.
        // (Un `cacheBuffer` generos doar o face intermitentă, nu o rezolvă:
        // ascunde simptomul pentru listele scurte și îl lasă pentru restul.)
        //
        // `Column.implicitHeight` se calculează din copii și nu știe nimic
        // despre viewport, deci lanțul se rupe la rădăcină.
        //
        // Prețul e că se instanțiază toate rândurile, nu doar cele vizibile.
        // De aceea lista desenată e tăiată la `limitaRanduri` — aceeași
        // grijă ca `maxItemsShown` din rss, doar că aici pragul e destul de
        // sus cât să nu se atingă în uz normal.
        Flickable {
          id: lista
          width: parent.width
          visible: root.mod === "list" || root.mod === "search"
          height: visible ? Math.min(randuriColoana.implicitHeight, Style.space(460)) : 0
          contentWidth: width
          contentHeight: randuriColoana.implicitHeight
          clip: true
          boundsBehavior: Flickable.StopAtBounds
          interactive: contentHeight > height

          ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

          // Echivalentul lui ListView.Contain: derulează doar cât să aducă
          // rândul curent în viewport. Un rând deja vizibil nu mișcă lista,
          // ca ea să nu sară sub un mouse care stă pe ea.
          function tineVizibil() {
            var d = delegatul(root.randCurent)
            if (!d) {
              return
            }
            var sus = d.y
            var jos = d.y + d.height
            if (sus < contentY) {
              contentY = sus
            } else if (jos > contentY + height) {
              contentY = jos - height
            }
            contentY = Math.max(0, Math.min(Math.max(0, contentHeight - height), contentY))
          }

          function delegatul(index) {
            if (index < 0) {
              return null
            }
            var copii = randuriColoana.children
            for (var i = 0; i < copii.length; i++) {
              // Repeater-ul e și el copil al coloanei, dar n-are `indexLinie`.
              if (copii[i] && copii[i].indexLinie === index) {
                return copii[i]
              }
            }
            return null
          }

          // Amânată cu un tur: modelul se reconstruiește la fiecare
          // reîmprospătare, iar delegații nu-și au încă poziția în clipa în
          // care se schimbă cursorul.
          Connections {
            target: root
            function onRandCurentChanged() { Qt.callLater(lista.tineVizibil) }
          }

          Column {
            id: randuriColoana
            width: lista.width
            spacing: Style.space(2)

            Repeater {
              model: root.randuriAfisate

              // Loader, nu un Item cu patru copii ascunși: „Jurnal" ajunge la
              // câteva sute de rânduri, iar instanțierea celorlalte trei
              // tipuri pentru fiecare ar fi de patru ori mai mult QML degeaba.
              // Componenta își citește rândul din Loader (`parent.linia`), ca
              // legăturile ei să se reevalueze singure când se schimbă
              // modelul — o atribuire din `onLoaded` ar rula o dată și ar
              // rămâne acolo.
              delegate: Loader {
                id: gazda
                required property var modelData
                required property int index

                readonly property var linia: modelData
                readonly property int indexLinie: index

                width: randuriColoana.width

                sourceComponent: {
                  if (modelData.kind === "header") {
                    return componentaAntet
                  }
                  if (modelData.kind === "project") {
                    return componentaProiect
                  }
                  if (modelData.kind === "check") {
                    return componentaChecklist
                  }
                  return componentaTask
                }
              }
            }
          }
        }

        // ---------- lista goală ----------
        Text {
          width: parent.width
          visible: (root.mod === "list" || root.mod === "search") && root.randuri.length === 0
          height: visible ? implicitHeight : 0
          textFormat: Text.PlainText
          wrapMode: Text.WordWrap
          color: Qt.darker(root.culoareText, 1.5)
          font.family: root.fontulBarei
          font.pixelSize: Style.font.bodySmall
          text: {
            if (root.mod === "search") {
              return root.interogare === ""
                ? I18n.t(root.limba, "empty.searchPrompt")
                : I18n.t(root.limba, "empty.search")
            }
            if (root.proiectDeschis !== "") {
              return I18n.t(root.limba, "empty.project")
            }
            return I18n.t(root.limba, "empty." + root.vedere)
          }
        }

        // ---------- foaia „când" ----------
        Loader {
          width: parent.width
          active: root.mod === "when"
          visible: active
          height: visible && item ? item.implicitHeight : 0
          sourceComponent: componentaFoaieData
        }

        // ---------- foaia „mută" ----------
        Loader {
          width: parent.width
          active: root.mod === "move"
          visible: active
          height: visible && item ? item.implicitHeight : 0
          sourceComponent: componentaFoaieMutare
        }

        // ---------- foaia „redenumește" ----------
        Loader {
          width: parent.width
          active: root.mod === "rename"
          visible: active
          height: visible && item ? item.implicitHeight : 0
          sourceComponent: componentaFoaieRedenumire
        }

        // ---------- foaia „notițe" ----------
        Loader {
          width: parent.width
          active: root.mod === "notes"
          visible: active
          height: visible && item ? item.implicitHeight : 0
          sourceComponent: componentaFoaieNotite
        }

        // ---------- foile checklist-ului ----------
        Loader {
          width: parent.width
          active: root.mod === "addItem" || root.mod === "renameItem"
          visible: active
          height: visible && item ? item.implicitHeight : 0
          sourceComponent: componentaFoaieItem
        }

        // ---------- setările ----------
        //
        // Limba e singura setare care merită un loc în panou: celelalte se
        // pun o dată și se uită, dar limba vrei s-o poți încerca. Fără ea,
        // singura cale ar fi `omarchy bar set mghizdavet.things language
        // "Română"` — corectă, dar de negăsit.
        Column {
          width: parent.width
          visible: root.mod === "settings"
          height: visible ? implicitHeight : 0
          spacing: Style.space(8)

          PanelSectionHeader {
            text: I18n.t(root.limba, "settings.language").toUpperCase()
            foreground: root.culoareText
            fontFamily: root.fontulBarei
          }

          Flow {
            width: parent.width
            spacing: Style.space(6)

            Repeater {
              model: root.limbiDisponibile

              Button {
                required property var modelData
                text: modelData.scurt
                foreground: root.culoareText
                accent: Color.accent
                fontFamily: root.fontulBarei
                fontSize: Style.font.caption
                horizontalPadding: Style.spacing.md
                verticalPadding: Style.spacing.controlPaddingY
                bordered: true
                // Limba aleasă rămâne aprinsă cât e aleasă — e o stare, nu
                // o acțiune.
                active: root.limbaSetata === modelData.cod
                onClicked: root.seteazaLimba(modelData.cod)
              }
            }
          }

          Text {
            width: parent.width
            textFormat: Text.PlainText
            wrapMode: Text.WordWrap
            text: I18n.t(root.limba, "settings.languageHint")
            color: Qt.darker(root.culoareText, 1.5)
            font.family: root.fontulBarei
            font.pixelSize: Style.font.caption
          }
        }

        // ---------- cartonașul cu taste ----------
        Column {
          width: parent.width
          visible: root.mod === "help"
          height: visible ? implicitHeight : 0
          spacing: Style.space(6)

          PanelSectionHeader {
            text: I18n.t(root.limba, "help.title").toUpperCase()
            foreground: root.culoareText
            fontFamily: root.fontulBarei
          }

          Repeater {
            model: ["help.move", "help.views", "help.actions", "help.checklist", "help.add", "help.settings"]
            Text {
              required property var modelData
              width: parent.width
              textFormat: Text.PlainText
              wrapMode: Text.WordWrap
              text: I18n.t(root.limba, modelData)
              color: Qt.darker(root.culoareText, 1.3)
              font.family: root.fontulBarei
              font.pixelSize: Style.font.bodySmall
            }
          }
        }
      }

      // Confirmarea ștergerii acoperă tot panoul, ca la celelalte panouri
      // native — o ștergere nu se face dintr-o tastă apăsată alături.
      //
      // Tastele ei nu pot veni din PanelKeyCatcher: acela își declară propriul
      // Keys.onPressed, iar unul declarat aici l-ar înlocui cu totul. Un Item
      // fără MouseArea nu fură clicurile scrimului, deci poate sta peste el
      // doar ca să țină focusul de tastatură.
      Item {
        id: prinzatorDialog
        anchors.fill: parent
        enabled: dialogStergere.opened

        Keys.onPressed: function (event) {
          if (dialogStergere.handleKey(event)) {
            event.accepted = true
          }
        }
      }

      ConfirmDialog {
        id: dialogStergere
        anchors.fill: parent
        message: root.taskDeSters
          ? I18n.t(root.limba, "confirm.delete", { title: root.taskDeSters.title })
          : ""
        cancelText: I18n.t(root.limba, "confirm.deleteCancel")
        confirmText: I18n.t(root.limba, "confirm.deleteOk")
        background: Color.popups.background
        foreground: root.culoareText
        fontFamily: root.fontulBarei

        onOpenedChanged: {
          if (opened) {
            prinzatorDialog.forceActiveFocus()
          } else {
            prinzatorTaste.forceActiveFocus()
          }
        }
        onCanceled: {
          opened = false
          root.taskDeSters = null
        }
        onConfirmed: {
          opened = false
          root.stergeTask(root.taskDeSters)
          root.taskDeSters = null
        }
      }
    }
  }

  // =================================================================== rânduri

  // Antetul de grup: numele proiectului în „Azi", ziua în „Urmează" și
  // „Jurnal", aria în „Proiecte", secțiunea într-un proiect deschis.
  Component {
    id: componentaAntet

    Item {
      readonly property var linie: parent ? parent.linia : null

      width: parent ? parent.width : 0
      implicitHeight: antet.implicitHeight + Style.space(8)

      PanelSectionHeader {
        id: antet
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        text: {
          if (!linie) {
            return ""
          }
          if (linie.day !== undefined) {
            return I18n.etichetaZi(root.limba, linie.day, root.instantaneu.today).toUpperCase()
          }
          if (linie.special === "evening") {
            return I18n.t(root.limba, "day.evening").toUpperCase()
          }
          // Numele unui proiect, al unei arii sau al unei secțiuni — text al
          // omului, nu al nostru, deci nu trece prin traducere.
          return String(linie.text || "").toUpperCase()
        }
        foreground: root.culoareText
        fontFamily: root.fontulBarei
        elide: Text.ElideRight
      }
    }
  }

  // Rândul de task: bifa, titlul, insignele (termen, etichete, listă, notițe)
  // și, la hover sau sub cursor, cele patru acțiuni de pe margine.
  Component {
    id: componentaTask

    CursorSurface {
      id: rand
      readonly property var linie: parent ? parent.linia : null
      readonly property int indexRand: parent ? parent.indexLinie : 0

      readonly property var task: linie ? linie.task : null
      readonly property bool bifat: task && task.status !== "incomplete"
      // Things ține „anulat" separat de „terminat", iar diferența contează:
      // una spune că ai făcut lucrul, cealaltă că ai renunțat la el. Fără
      // rândul ăsta amândouă ar ieși ca o bifă tăiată, de nedeosebit.
      readonly property bool anulat: task && task.status === "canceled"
      // O ocurență calculată din regulă, nu un task pe care îl are Things:
      // se vede, dar nu se atinge.
      readonly property bool proiectat: task && task.projected === true
      readonly property bool selectat: root.cursorActiv && root.randCurent === indexRand
      readonly property bool areChecklist: task && (task.checklist || []).length > 0
      readonly property bool desfasurat: task && root.desfasurate[task.id] === true
      readonly property bool intarziat: task && task.deadline && !bifat
        && task.deadline < root.instantaneu.today
      readonly property string rezumatNotite: task && root.arataNotite
        ? Model.rezumatNotite(task.notes, 90) : ""

      width: parent ? parent.width : 0
      implicitHeight: continutRand.implicitHeight + Style.space(10)

      hasCursor: selectat && root.indexActiune < 0
      current: false
      foreground: root.culoareText
      fill: root.umplereHover
      currentFill: root.umplereSelectata

      MouseArea {
        id: mouseRand
        anchors.fill: parent
        hoverEnabled: true
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        cursorShape: rand.proiectat ? Qt.ArrowCursor : Qt.PointingHandCursor

        onContainsMouseChanged: if (containsMouse) {
          root.cursorActiv = true
          root.pozitieCursor = Math.max(0, root.opriri.indexOf(rand.indexRand))
          root.indexActiune = -1
        }

        onClicked: function (mouse) {
          if (mouse.button === Qt.RightButton) {
            root.comutaDesfasurarea(rand.task)
            return
          }
          root.comutaBifa(rand.task)
        }
      }

      Item {
        id: continutRand
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        anchors.leftMargin: Style.space(8) + (rand.linie ? rand.linie.depth * Style.space(16) : 0)
        anchors.rightMargin: Style.space(8)
        implicitHeight: Math.max(bifa.implicitHeight, infoRand.implicitHeight, actiuni.implicitHeight)

        Text {
          id: bifa
          textFormat: Text.PlainText
          anchors.left: parent.left
          anchors.top: parent.top
          anchors.topMargin: Style.space(1)
          text: rand.anulat ? "󰅙" : (rand.bifat ? "󰄳" : "󰄰")
          color: rand.bifat ? Qt.darker(root.culoareText, 1.6) : root.culoareText
          font.family: root.fontulBarei
          font.pixelSize: Style.font.heading
        }

        Column {
          id: infoRand
          anchors.left: bifa.right
          anchors.leftMargin: Style.space(9)
          anchors.right: actiuni.visible ? actiuni.left : parent.right
          anchors.rightMargin: actiuni.visible ? Style.space(6) : 0
          anchors.verticalCenter: parent.verticalCenter
          spacing: Style.space(2)

          Row {
            width: parent.width
            spacing: Style.space(6)

            Text {
              textFormat: Text.PlainText
              text: rand.task ? rand.task.title : ""
              color: rand.bifat ? Qt.darker(root.culoareText, 1.6) : root.culoareText
              font.family: root.fontulBarei
              font.pixelSize: Style.font.body
              font.strikeout: rand.bifat
              elide: Text.ElideRight
              width: Math.max(0, parent.width - insigne.implicitWidth - parent.spacing)
            }

            Row {
              id: insigne
              anchors.verticalCenter: parent.verticalCenter
              spacing: Style.space(6)

              // Termenul: singura insignă care are voie să fie roșie, și doar
              // când a trecut.
              Text {
                textFormat: Text.PlainText
                visible: rand.task && rand.task.deadline
                text: "󰈻 " + (rand.task && rand.task.deadline
                  ? I18n.dataScurta(root.limba, rand.task.deadline) : "")
                color: rand.intarziat ? root.culoareUrgent : Qt.darker(root.culoareText, 1.4)
                font.family: root.fontulBarei
                font.pixelSize: Style.font.caption
              }

              Text {
                textFormat: Text.PlainText
                visible: rand.task && rand.task.evening
                text: "󰖔"
                color: Qt.darker(root.culoareText, 1.4)
                font.family: root.fontulBarei
                font.pixelSize: Style.font.caption
              }

              // Recurența, cu cadența scrisă: un „󰑖" singur spune doar că se
              // repetă, nu și dacă e săptămânal sau la cinci zile. Cadența
              // vine de la șablonul care a produs instanța (CLI-ul dă regula
              // doar pe șablon), decodată în bin/things-preia.
              Text {
                textFormat: Text.PlainText
                visible: rand.task && rand.task.recurring
                text: {
                  if (!rand.task) {
                    return ""
                  }
                  var cadenta = I18n.textRecurenta(root.limba, rand.task.repeat)
                  return cadenta === "" ? "󰑖" : "󰑖 " + cadenta
                }
                color: Qt.darker(root.culoareText, 1.4)
                font.family: root.fontulBarei
                font.pixelSize: Style.font.caption
              }

              Text {
                textFormat: Text.PlainText
                visible: rand.areChecklist
                text: "󰦏 " + (rand.task ? contorChecklist(rand.task) : "")
                color: Qt.darker(root.culoareText, 1.4)
                font.family: root.fontulBarei
                font.pixelSize: Style.font.caption
              }

              Repeater {
                model: rand.task ? rand.task.tags : []
                Text {
                  required property var modelData
                  textFormat: Text.PlainText
                  text: "󰓹 " + modelData
                  color: Qt.darker(root.culoareText, 1.4)
                  font.family: root.fontulBarei
                  font.pixelSize: Style.font.caption
                }
              }
            }
          }

          // O singură linie de notițe, ca să se vadă că există fără să crească
          // rândul. Un link se scrie ca gazdă + început de cale și se deschide
          // în browser.
          Text {
            width: parent.width
            visible: rand.rezumatNotite !== ""
            textFormat: Text.PlainText
            text: {
              var url = rand.task ? Model.primulLink(rand.task.notes) : ""
              if (url !== "") {
                return "󰌷 " + Model.scurteazaLink(url)
              }
              return rand.rezumatNotite
            }
            color: Qt.darker(root.culoareText, 1.7)
            font.family: root.fontulBarei
            font.pixelSize: Style.font.caption
            elide: Text.ElideRight
          }
        }

        Row {
          id: actiuni
          anchors.right: parent.right
          anchors.verticalCenter: parent.verticalCenter
          spacing: Style.space(2)
          visible: (mouseRand.containsMouse || rand.selectat) && !rand.proiectat

          ActiuneRand {
            iconText: "󰃭"
            tooltipText: I18n.t(root.limba, "action.schedule")
            aleasa: rand.selectat && root.indexActiune === 0
            onApasat: {
              root.tintaFoaie = rand.task.id
              root.mod = "when"
            }
            onIntrat: root.punecursorul(rand.indexRand, 0)
          }

          ActiuneRand {
            iconText: "󰉖"
            tooltipText: I18n.t(root.limba, "action.move")
            aleasa: rand.selectat && root.indexActiune === 1
            onApasat: {
              root.tintaFoaie = rand.task.id
              root.mod = "move"
            }
            onIntrat: root.punecursorul(rand.indexRand, 1)
          }

          ActiuneRand {
            iconText: "󰏫"
            tooltipText: I18n.t(root.limba, "action.rename")
            aleasa: rand.selectat && root.indexActiune === 2
            onApasat: {
              root.tintaFoaie = rand.task.id
              root.mod = "rename"
            }
            onIntrat: root.punecursorul(rand.indexRand, 2)
          }

          ActiuneRand {
            iconText: "󰈙"
            tooltipText: I18n.t(root.limba, "action.notes")
            aleasa: rand.selectat && root.indexActiune === 3
            onApasat: {
              root.tintaFoaie = rand.task.id
              root.mod = "notes"
            }
            onIntrat: root.punecursorul(rand.indexRand, 3)
          }

          ActiuneRand {
            iconText: "󰅚"
            tooltipText: I18n.t(root.limba, "action.cancel")
            aleasa: rand.selectat && root.indexActiune === 4
            onApasat: root.anuleaza(rand.task)
            onIntrat: root.punecursorul(rand.indexRand, 4)
          }

          ActiuneRand {
            iconText: "󰆴"
            tooltipText: I18n.t(root.limba, "action.delete")
            urgenta: true
            aleasa: rand.selectat && root.indexActiune === 5
            onApasat: root.cereStergerea(rand.task)
            onIntrat: root.punecursorul(rand.indexRand, 5)
          }
        }
      }

      PanelToolTip {
        visible: mouseRand.containsMouse && root.indexActiune < 0 && rand.task !== null
        text: {
          if (rand.proiectat) {
            return I18n.t(root.limba, "task.projected")
          }
          if (rand.anulat) {
            return I18n.t(root.limba, "action.uncancel")
          }
          return rand.bifat
            ? I18n.t(root.limba, "action.uncheck")
            : I18n.t(root.limba, "action.check")
        }
        fontFamily: root.fontulBarei
      }
    }
  }

  // Un element de checklist: aceeași bifă, indentat sub task-ul lui.
  Component {
    id: componentaChecklist

    CursorSurface {
      id: randCheck
      readonly property var linie: parent ? parent.linia : null
      readonly property int indexRand: parent ? parent.indexLinie : 0

      readonly property var item: linie ? linie.item : null
      readonly property var parinte: linie ? linie.parent : null
      readonly property bool selectat: root.cursorActiv && root.randCurent === indexRand

      width: parent ? parent.width : 0
      implicitHeight: continutCheck.implicitHeight + Style.space(6)

      hasCursor: selectat
      foreground: root.culoareText
      fill: root.umplereHover
      currentFill: root.umplereSelectata

      MouseArea {
        id: mouseCheck
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onContainsMouseChanged: if (containsMouse) {
          root.cursorActiv = true
          root.pozitieCursor = Math.max(0, root.opriri.indexOf(randCheck.indexRand))
          root.indexActiune = -1
        }
        onClicked: root.comutaChecklist(randCheck.parinte, randCheck.item)
      }

      Item {
        id: continutCheck
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        anchors.leftMargin: Style.space(8) + (randCheck.linie ? randCheck.linie.depth * Style.space(18) : 0)
        anchors.rightMargin: Style.space(8)
        implicitHeight: Math.max(bifaCheck.implicitHeight, textCheck.implicitHeight,
                                 actiuniCheck.implicitHeight)

        Text {
          id: bifaCheck
          textFormat: Text.PlainText
          anchors.left: parent.left
          anchors.verticalCenter: parent.verticalCenter
          text: randCheck.item && randCheck.item.done ? "󰄳" : "󰄰"
          color: randCheck.item && randCheck.item.done
            ? Qt.darker(root.culoareText, 1.7) : Qt.darker(root.culoareText, 1.2)
          font.family: root.fontulBarei
          font.pixelSize: Style.font.body
        }

        Text {
          id: textCheck
          anchors.left: bifaCheck.right
          anchors.leftMargin: Style.space(8)
          anchors.right: actiuniCheck.visible ? actiuniCheck.left : parent.right
          anchors.rightMargin: actiuniCheck.visible ? Style.space(6) : 0
          anchors.verticalCenter: parent.verticalCenter
          textFormat: Text.PlainText
          text: randCheck.item ? randCheck.item.title : ""
          color: randCheck.item && randCheck.item.done
            ? Qt.darker(root.culoareText, 1.7) : Qt.darker(root.culoareText, 1.1)
          font.family: root.fontulBarei
          font.pixelSize: Style.font.bodySmall
          font.strikeout: randCheck.item && randCheck.item.done
          elide: Text.ElideRight
        }

        // Un element de checklist se putea doar bifa. Redenumirea și ștergerea
        // stau unde le caută omul — pe marginea rândului, ca la task-uri.
        Row {
          id: actiuniCheck
          anchors.right: parent.right
          anchors.verticalCenter: parent.verticalCenter
          spacing: Style.space(2)
          visible: mouseCheck.containsMouse || randCheck.selectat

          ActiuneRand {
            iconText: "󰏫"
            tooltipText: I18n.t(root.limba, "checklist.rename")
            aleasa: randCheck.selectat && root.indexActiune === 0
            onApasat: root.declanseazaActiuneaItem(randCheck.parinte, randCheck.item, 0)
            onIntrat: root.punecursorul(randCheck.indexRand, 0)
          }

          ActiuneRand {
            iconText: "󰆴"
            tooltipText: I18n.t(root.limba, "checklist.delete")
            urgenta: true
            aleasa: randCheck.selectat && root.indexActiune === 1
            onApasat: root.declanseazaActiuneaItem(randCheck.parinte, randCheck.item, 1)
            onIntrat: root.punecursorul(randCheck.indexRand, 1)
          }
        }
      }
    }
  }

  // Rândul de proiect: plăcinta de progres, numele și câte au mai rămas.
  Component {
    id: componentaProiect

    CursorSurface {
      id: randProiect
      readonly property var linie: parent ? parent.linia : null
      readonly property int indexRand: parent ? parent.indexLinie : 0

      readonly property var proiect: linie ? linie.project : null
      readonly property bool selectat: root.cursorActiv && root.randCurent === indexRand

      width: parent ? parent.width : 0
      implicitHeight: continutProiect.implicitHeight + Style.space(10)

      hasCursor: selectat
      foreground: root.culoareText
      fill: root.umplereHover
      currentFill: root.umplereSelectata

      MouseArea {
        id: mouseProiect
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onContainsMouseChanged: if (containsMouse) {
          root.cursorActiv = true
          root.pozitieCursor = Math.max(0, root.opriri.indexOf(randProiect.indexRand))
          root.indexActiune = -1
        }
        onClicked: root.deschideProiectul(randProiect.proiect.id)
      }

      Item {
        id: continutProiect
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        anchors.leftMargin: Style.space(8)
        anchors.rightMargin: Style.space(8)
        implicitHeight: Math.max(placinta.height, numeProiect.implicitHeight)

        // Plăcinta de progres, ca în Things: un inel care se umple. Desenată
        // cu Canvas fiindcă e singurul lucru din panou care nu e text sau
        // dreptunghi, iar o glifă n-ar putea arăta o fracție.
        Canvas {
          id: placinta
          anchors.left: parent.left
          anchors.verticalCenter: parent.verticalCenter
          width: Style.space(14)
          height: Style.space(14)

          readonly property real fractie: Model.progresProiect(randProiect.proiect)
          readonly property color culoare: root.culoareText

          onFractieChanged: requestPaint()
          onCuloareChanged: requestPaint()

          onPaint: {
            var ctx = getContext("2d")
            ctx.reset()
            var r = Math.min(width, height) / 2
            var cx = width / 2
            var cy = height / 2
            var grosime = Math.max(1, r * 0.28)

            ctx.strokeStyle = Qt.rgba(culoare.r, culoare.g, culoare.b, 0.35)
            ctx.lineWidth = grosime
            ctx.beginPath()
            ctx.arc(cx, cy, r - grosime / 2, 0, Math.PI * 2)
            ctx.stroke()

            if (fractie > 0) {
              ctx.fillStyle = culoare
              ctx.beginPath()
              ctx.moveTo(cx, cy)
              // -π/2: sectorul pornește de sus, ca un ceas, nu de la ora trei.
              ctx.arc(cx, cy, Math.max(0, r - grosime), -Math.PI / 2,
                      -Math.PI / 2 + Math.PI * 2 * fractie)
              ctx.closePath()
              ctx.fill()
            }
          }
        }

        Text {
          id: numeProiect
          anchors.left: placinta.right
          anchors.leftMargin: Style.space(10)
          anchors.right: contorProiect.left
          anchors.rightMargin: Style.space(8)
          anchors.verticalCenter: parent.verticalCenter
          textFormat: Text.PlainText
          text: randProiect.proiect ? randProiect.proiect.title : ""
          color: root.culoareText
          font.family: root.fontulBarei
          font.pixelSize: Style.font.body
          elide: Text.ElideRight
        }

        Text {
          id: contorProiect
          anchors.right: parent.right
          anchors.verticalCenter: parent.verticalCenter
          textFormat: Text.PlainText
          text: randProiect.proiect
            ? String(randProiect.proiect.open) + "/" + String(randProiect.proiect.total)
            : ""
          color: Qt.darker(root.culoareText, 1.5)
          font.family: root.fontulBarei
          font.pixelSize: Style.font.caption
        }
      }
    }
  }

  // Butonul mic de pe marginea unui rând. Un înveliș subțire peste
  // PanelActionButton, ca cele patru acțiuni să nu repete de fiecare dată
  // culorile și fontul.
  component ActiuneRand: PanelActionButton {
    property bool aleasa: false
    property bool urgenta: false
    signal apasat()
    signal intrat()

    foreground: root.culoareText
    hoverColor: urgenta ? root.culoareUrgent : root.culoareText
    fontFamily: root.fontulBarei
    fontSize: Style.font.bodySmall
    size: Style.space(20)
    hasCursor: aleasa
    onClicked: apasat()
    onHovered: function (peste) { if (peste) intrat() }
  }

  function punecursorul(indexRand, indexActiuneNou) {
    root.cursorActiv = true
    var pozitie = root.opriri.indexOf(indexRand)
    if (pozitie >= 0) {
      root.pozitieCursor = pozitie
    }
    root.indexActiune = indexActiuneNou
  }

  function contorChecklist(task) {
    var items = task.checklist || []
    var facute = 0
    for (var i = 0; i < items.length; i++) {
      if (items[i].done) {
        facute++
      }
    }
    return facute + "/" + items.length
  }

  // ===================================================================== foile

  // „Când": cele cinci presetări ale lui Things plus o dată scrisă de mână,
  // cu previzualizare live a zilei în care cade.
  Component {
    id: componentaFoaieData

    Column {
      width: parent ? parent.width : 0
      spacing: Style.space(8)

      PanelSectionHeader {
        text: (I18n.t(root.limba, "when.title") + " · "
               + (root.taskFoaie ? root.taskFoaie.title : "")).toUpperCase()
        foreground: root.culoareText
        fontFamily: root.fontulBarei
        width: parent.width
        elide: Text.ElideRight
      }

      Flow {
        width: parent.width
        spacing: Style.space(6)

        Repeater {
          model: [
            { cheie: "when.today", valoare: "today" },
            { cheie: "when.evening", valoare: "evening" },
            { cheie: "when.tomorrow", valoare: "" },
            { cheie: "when.anytime", valoare: "anytime" },
            { cheie: "when.someday", valoare: "someday" }
          ]

          Button {
            required property var modelData
            text: I18n.t(root.limba, modelData.cheie)
            foreground: root.culoareText
            accent: Color.accent
            fontFamily: root.fontulBarei
            fontSize: Style.font.bodySmall
            bordered: true
            horizontalPadding: Style.space(10)
            verticalPadding: Style.space(5)
            onClicked: {
              // „Mâine" n-are cuvânt în CLI, deci se trimite ca dată.
              var valoare = modelData.valoare
              if (valoare === "") {
                var m = Model.parseDataCand("tomorrow", new Date())
                valoare = m.value
              }
              root.programeaza(root.taskFoaie, valoare)
              root.mod = "list"
              root.tintaFoaie = ""
              prinzatorTaste.forceActiveFocus()
            }
          }
        }
      }

      TextField {
          id: campData
          width: parent.width
          foreground: root.culoareText
          accent: Color.accent
          font.family: root.fontulBarei
          font.pixelSize: Style.font.bodySmall
          verticalPadding: Style.space(4)
          placeholderText: I18n.t(root.limba, "when.placeholder")

          readonly property var parsat: Model.parseDataCand(text, new Date())

          onAccepted: {
            if (parsat.kind !== "") {
              root.programeaza(root.taskFoaie, parsat.value)
              root.mod = "list"
              root.tintaFoaie = ""
              prinzatorTaste.forceActiveFocus()
            }
          }
          Keys.onEscapePressed: function (event) {
            root.mod = "list"
            root.tintaFoaie = ""
            prinzatorTaste.forceActiveFocus()
            event.accepted = true
          }
      }

      // Ce va face Enter, scris înainte să-l apeși.
      Text {
        width: parent.width
        textFormat: Text.PlainText
        wrapMode: Text.WordWrap
        color: Qt.darker(root.culoareText, 1.5)
        font.family: root.fontulBarei
        font.pixelSize: Style.font.caption
        text: {
          if (campData.text.replace(/^\s+|\s+$/g, "") === "") {
            return I18n.t(root.limba, "when.typedUnknown")
          }
          var p = campData.parsat
          if (p.kind === "") {
            return I18n.t(root.limba, "when.typedUnknown")
          }
          if (p.kind === "bucket") {
            return I18n.t(root.limba, "when.typed", { date: I18n.t(root.limba, "when." + p.value) })
          }
          return I18n.t(root.limba, "when.typed", {
            date: I18n.etichetaZi(root.limba, p.value, root.instantaneu.today)
          })
        }
      }

      Component.onCompleted: campData.forceActiveFocus()
    }
  }

  // „Mută": Inbox, apoi proiectele și ariile, filtrate în timp ce scrii.
  Component {
    id: componentaFoaieMutare

    Column {
      id: foaieMutare
      width: parent ? parent.width : 0
      spacing: Style.space(8)

      readonly property var tinte: {
        var lista = [{ id: "inbox", titlu: I18n.t(root.limba, "move.inbox"), fel: "inbox" }]
        var i
        var proiecte = root.instantaneuEfectiv.projects || []
        for (i = 0; i < proiecte.length; i++) {
          lista.push({ id: proiecte[i].id, titlu: proiecte[i].title, fel: "project" })
        }
        var arii = root.instantaneuEfectiv.areas || []
        for (i = 0; i < arii.length; i++) {
          lista.push({ id: arii[i].id, titlu: arii[i].title, fel: "area" })
        }
        return lista
      }

      readonly property var filtrate: {
        var q = String(campMutare.text || "").toLowerCase()
        if (q === "") {
          return tinte
        }
        var out = []
        for (var i = 0; i < tinte.length; i++) {
          if (tinte[i].titlu.toLowerCase().indexOf(q) >= 0) {
            out.push(tinte[i])
          }
        }
        return out
      }

      PanelSectionHeader {
        text: (I18n.t(root.limba, "move.title") + " · "
               + (root.taskFoaie ? root.taskFoaie.title : "")).toUpperCase()
        foreground: root.culoareText
        fontFamily: root.fontulBarei
        width: parent.width
        elide: Text.ElideRight
      }

      TextField {
        id: campMutare
        width: parent.width
        foreground: root.culoareText
        accent: Color.accent
        font.family: root.fontulBarei
        font.pixelSize: Style.font.bodySmall
        verticalPadding: Style.space(4)
        placeholderText: I18n.t(root.limba, "move.placeholder")

        onAccepted: {
          if (foaieMutare.filtrate.length > 0) {
            root.muta(root.taskFoaie, foaieMutare.filtrate[0].id)
            root.mod = "list"
            root.tintaFoaie = ""
            prinzatorTaste.forceActiveFocus()
          }
        }
        Keys.onEscapePressed: function (event) {
          root.mod = "list"
          root.tintaFoaie = ""
          prinzatorTaste.forceActiveFocus()
          event.accepted = true
        }
      }

      Flow {
        width: parent.width
        spacing: Style.space(6)

        Repeater {
          model: foaieMutare.filtrate

          Button {
            required property var modelData
            text: modelData.titlu
            iconText: modelData.fel === "inbox" ? "󰚇" : (modelData.fel === "area" ? "󰙅" : "󰉖")
            foreground: root.culoareText
            accent: Color.accent
            fontFamily: root.fontulBarei
            fontSize: Style.font.bodySmall
            iconSize: Style.font.bodySmall
            bordered: true
            horizontalPadding: Style.space(9)
            verticalPadding: Style.space(4)
            onClicked: {
              root.muta(root.taskFoaie, modelData.id)
              root.mod = "list"
              root.tintaFoaie = ""
              prinzatorTaste.forceActiveFocus()
            }
          }
        }
      }

      Component.onCompleted: campMutare.forceActiveFocus()
    }
  }

  // „Redenumește": un câmp pornit de la titlul curent.
  // Notițele sunt text pe mai multe rânduri, deci nu încap în TextField-ul
  // kit-ului. Rama, umplerea și marginile vin din aceleași funcții pe care le
  // folosește Ui/TextField.qml, ca să nu fie un câmp străin în panou.
  //
  // Enter scrie un rând nou, deci salvarea e Ctrl+Enter — altfel n-ai putea
  // scrie o notiță de două rânduri fără s-o trimiți la mijloc.
  Component {
    id: componentaFoaieNotite

    Column {
      width: parent ? parent.width : 0
      spacing: Style.space(8)

      PanelSectionHeader {
        text: I18n.t(root.limba, "action.notes").toUpperCase()
        foreground: root.culoareText
        fontFamily: root.fontulBarei
        width: parent.width
      }

      TextArea {
        id: campNotite
        width: parent.width

        readonly property bool focalizat: activeFocus
        readonly property var specRama: Border.controlSpec(
          focalizat ? "focus" : (hovered ? "hover-cursor" : "normal"),
          root.culoareText, Color.accent)

        // Crește cu textul, între patru rânduri și cam zece: mai jos nu merită
        // o casetă, mai sus ar împinge lista afară din panou.
        height: Math.min(Math.max(contentHeight + topPadding + bottomPadding,
                                  Style.space(76)), Style.space(200))

        wrapMode: TextEdit.Wrap
        selectByMouse: true
        placeholderText: I18n.t(root.limba, "notes.placeholder")
        text: root.taskFoaie ? (root.taskFoaie.notes || "") : ""

        font.family: root.fontulBarei
        font.pixelSize: Style.font.body
        color: root.culoareText
        selectionColor: Style.selectionFillFor(root.culoareText, Color.accent)
        selectedTextColor: root.culoareText
        placeholderTextColor: Qt.darker(root.culoareText, 1.6)

        leftPadding: Style.spacing.controlPaddingX + Border.left(specRama)
        rightPadding: Style.spacing.controlPaddingX + Border.right(specRama)
        topPadding: Style.space(5) + Border.top(specRama)
        bottomPadding: Style.space(5) + Border.bottom(specRama)

        background: BorderSurface {
          color: Style.controlFill(campNotite.focalizat, campNotite.hovered,
                                   root.culoareText, Color.accent)
          borderSpec: campNotite.specRama
          radius: Style.cornerRadius
        }

        Keys.onPressed: function (event) {
          if ((event.key === Qt.Key_Return || event.key === Qt.Key_Enter)
              && (event.modifiers & Qt.ControlModifier)) {
            root.editeazaNotite(root.taskFoaie, campNotite.text)
            root.inapoi()
            prinzatorTaste.forceActiveFocus()
            event.accepted = true
          }
        }
        Keys.onEscapePressed: function (event) {
          root.inapoi()
          prinzatorTaste.forceActiveFocus()
          event.accepted = true
        }
        Component.onCompleted: {
          forceActiveFocus()
          cursorPosition = length
        }
      }

      Text {
        width: parent.width
        textFormat: Text.PlainText
        wrapMode: Text.WordWrap
        text: I18n.t(root.limba, "notes.hint")
        color: Qt.darker(root.culoareText, 1.5)
        font.family: root.fontulBarei
        font.pixelSize: Style.font.caption
      }
    }
  }

  // O singură foaie pentru ambele treburi cu checklist-ul: adaugă un element
  // nou sau redenumește-l pe cel ales. Diferența e doar textul de pornire și
  // ce se face la Enter, deci două componente aproape identice ar fi fost o
  // copie inutilă.
  Component {
    id: componentaFoaieItem

    Column {
      width: parent ? parent.width : 0
      spacing: Style.space(8)

      readonly property bool adauga: root.mod === "addItem"

      PanelSectionHeader {
        text: I18n.t(root.limba, parent.adauga ? "checklist.add" : "checklist.rename").toUpperCase()
        foreground: root.culoareText
        fontFamily: root.fontulBarei
        width: parent.width
      }

      TextField {
        id: campItem
        width: parent.width
        foreground: root.culoareText
        accent: Color.accent
        font.family: root.fontulBarei
        font.pixelSize: Style.font.body
        verticalPadding: Style.space(5)
        placeholderText: I18n.t(root.limba, "checklist.placeholder")
        text: parent.adauga ? "" : (root.itemFoaie ? root.itemFoaie.title : "")

        onAccepted: {
          if (parent.adauga) {
            root.adaugaInChecklist(root.taskFoaie, text)
          } else {
            root.redenumesteItem(root.taskFoaie, root.itemFoaie, text)
          }
          root.inapoi()
          prinzatorTaste.forceActiveFocus()
        }
        Keys.onEscapePressed: function (event) {
          root.inapoi()
          prinzatorTaste.forceActiveFocus()
          event.accepted = true
        }
        Component.onCompleted: {
          forceActiveFocus()
          selectAll()
        }
      }
    }
  }

  Component {
    id: componentaFoaieRedenumire

    Column {
      width: parent ? parent.width : 0
      spacing: Style.space(8)

      PanelSectionHeader {
        text: I18n.t(root.limba, "action.rename").toUpperCase()
        foreground: root.culoareText
        fontFamily: root.fontulBarei
        width: parent.width
      }

      TextField {
        id: campRedenumire
        width: parent.width
        foreground: root.culoareText
        accent: Color.accent
        font.family: root.fontulBarei
        font.pixelSize: Style.font.body
        verticalPadding: Style.space(5)
        placeholderText: I18n.t(root.limba, "rename.placeholder")
        text: root.taskFoaie ? root.taskFoaie.title : ""

        onAccepted: {
          root.redenumeste(root.taskFoaie, text)
          root.mod = "list"
          root.tintaFoaie = ""
          prinzatorTaste.forceActiveFocus()
        }
        Keys.onEscapePressed: function (event) {
          root.mod = "list"
          root.tintaFoaie = ""
          prinzatorTaste.forceActiveFocus()
          event.accepted = true
        }
        Component.onCompleted: {
          forceActiveFocus()
          selectAll()
        }
      }
    }
  }
}
