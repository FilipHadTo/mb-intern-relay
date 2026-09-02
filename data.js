/*
 * RELAY Support Console — mock data layer.
 *
 * Everything the UI shows is derived from this file. There is no backend:
 * the dataset is generated deterministically (seeded PRNG) so every reload
 * produces the exact same 1900 tickets.
 *
 * The console is frozen to a simulated "now" (SIM_NOW) so that the dates
 * baked into the original design stay coherent. Real elapsed time is added
 * on top of it, which is what makes the SLA counters tick.
 */
window.RELAY_DATA = (function () {
  'use strict';

  var MIN = 60 * 1000;
  var HOUR = 60 * MIN;

  // Reference clock for the whole simulation: 24.08.2026, 11:26.
  var SIM_NOW = new Date(2026, 7, 24, 11, 26, 0).getTime();

  var STATUSES = ['Nowe', 'W toku', 'Oczekuje na klienta', 'Eskalacja', 'Zamknięte'];
  var PRIORITIES = ['Wysoki', 'Średni', 'Niski'];
  var QUEUES = ['Wsparcie 1. linii', 'Wsparcie 2. linii', 'Rozliczenia', 'Techniczne'];

  // Sort weight for "worst first" ordering on the Status / Priorytet columns.
  var STATUS_ORDER = { 'Eskalacja': 0, 'Nowe': 1, 'W toku': 2, 'Oczekuje na klienta': 3, 'Zamknięte': 4 };
  var PRIORITY_ORDER = { 'Wysoki': 0, 'Średni': 1, 'Niski': 2 };

  var TOTAL_RECORDS = 1900;
  var FIRST_LINE_RECORDS = 1284; // matches the record count shown in the design

  var CLIENTS = [
    'Nordisk AB', 'Kowalscy sp. z o.o.', 'Trendlab', 'Mikrus S.A.', 'Piekarnia Zorza',
    'Helios Group', 'osoba prywatna', 'Vektor Media', 'Stalprod sp.j.', 'Nowak Consulting',
    'Bio-Farm S.A.', 'Lumen Studio', 'Kompas Logistyka', 'Delta Serwis', 'Arkadia Nieruchomości',
    'Fabryka Słów', 'Meblex', 'PolTrans', 'Aurora Dent', 'Cyfrowy Mostek',
    'Zielony Rynek', 'Termika S.A.', 'Wektor Plus', 'Studio Kadr', 'Kancelaria Wiśniewski',
    'Bałtyk Marine', 'Solaris Energia', 'Karpaty Tour', 'InfoSprzęt', 'Pralnia Duet',
    'Optyk Horyzont', 'Krzemowa Dolina sp. z o.o.', 'Marka Własna', 'Hurt-Bud', 'Legion Ochrona',
    'Apteka Pod Wagą', 'Sadex', 'Rowery Wichura', 'Foto Atelier', 'Klinika Vita',
    'Mostostal Nord', 'e-Papier', 'Kawiarnia Ziarno', 'Fitness Puls', 'Autoserwis Bąk',
    'Drukarnia Offsetowa', 'Chmura IT sp. z o.o.', 'Tekstylia Wisła', 'Geodezja Punkt', 'Serwis Kotłów Grzejnik'
  ];

  var SUBJECTS = [
    'Błąd 500 przy zapisie formularza',
    'Nie przychodzą maile z potwierdzeniem',
    'Prośba o fakturę korygującą',
    'Aplikacja mobilna zamyka się przy starcie',
    'Jak zmienić dane do faktury?',
    'Eksport do PDF gubi polskie znaki',
    'Duplikaty kontaktów po imporcie CSV',
    'Prośba o dostęp do modułu raportów',
    'Wyszukiwarka nie znajduje starszych rekordów',
    'Limit użytkowników — chcemy dokupić 5 licencji',
    'Nieprawidłowa kwota na zestawieniu miesięcznym',
    'Webhook zwraca 401 od wczoraj',
    'Nie widzę załączników w zgłoszeniach',
    'Prośba o przywrócenie usuniętego projektu',
    'Panel działa bardzo wolno w godzinach szczytu',
    'Zmiana adresu e-mail administratora',
    'Import kontrahentów kończy się timeoutem',
    'Brak powiadomień push na Androidzie',
    'Pytanie o zgodność z RODO przy eksporcie',
    'Rozliczenie za sierpień — prośba o rozbicie',
    'Nie działa logowanie przez SSO',
    'Prośba o przedłużenie okresu próbnego',
    'Raport sprzedaży pokazuje zera',
    'Nie mogę usunąć nieaktywnego użytkownika',
    'Zdublowana płatność kartą',
    'Prośba o szkolenie dla nowego zespołu',
    'Kalendarz pokazuje złą strefę czasową',
    'Awaria integracji z systemem magazynowym',
    'Prośba o kopię zapasową danych',
    'Załącznik powyżej 10 MB nie chce się wgrać',
    'Zmiana planu abonamentowego',
    'Konto zablokowane po kilku próbach logowania',
    'Faktura z błędnym NIP-em',
    'Nie mogę wygenerować klucza API',
    'Prośba o usunięcie danych byłego pracownika',
    'Powiadomienia SMS nie dochodzą',
    'Problem z drukowaniem etykiet',
    'Prośba o zmianę właściciela konta',
    'Dwuetapowa weryfikacja blokuje dostęp',
    'Podwójne obciążenie za moduł raportowy'
  ];

  var FIRST_NAMES = [
    'Anna', 'Piotr', 'Marta', 'Tomasz', 'Katarzyna', 'Michał', 'Joanna', 'Rafał',
    'Agnieszka', 'Grzegorz', 'Ewa', 'Krzysztof', 'Magdalena', 'Paweł', 'Karolina', 'Jakub'
  ];
  var LAST_NAMES = [
    'Kowalska', 'Nowak', 'Wiśniewski', 'Wójcik', 'Kamińska', 'Lewandowski', 'Zielińska',
    'Szymański', 'Dąbrowska', 'Kozłowski', 'Jankowska', 'Mazur', 'Krawczyk', 'Piotrowska'
  ];

  var COMPLAINTS = [
    'problem pojawił się dziś rano i dotyczy wszystkich użytkowników w naszej organizacji',
    'sytuacja powtarza się od kilku dni, zawsze przy tej samej operacji',
    'próbowaliśmy już na dwóch przeglądarkach i na telefonie — efekt jest ten sam',
    'do wczoraj wszystko działało poprawnie, nie zmienialiśmy nic w konfiguracji',
    'w logach po naszej stronie nie widzimy nic niepokojącego',
    'zgłaszali to nam już trzej klienci, więc wygląda to na szerszy błąd',
    'problem występuje tylko na koncie głównym, konta poboczne działają normalnie'
  ];

  var IMPACTS = [
    'To blokuje pracę całego zespołu obsługi.',
    'Prosimy o pilne zajęcie się sprawą — mamy dziś zamknięcie miesiąca.',
    'Nie jest to krytyczne, ale utrudnia codzienną pracę.',
    'Czekamy na informację, kiedy możemy spodziewać się rozwiązania.',
    'Jeśli potrzebne są dodatkowe dane, chętnie je prześlemy.'
  ];

  /* ---------------------------------------------------------------- helpers */

  // Linear congruential generator — small, deterministic, good enough for mocks.
  function makeRng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function slug(name) {
    return name
      .toLowerCase()
      .replace(/ł/g, 'l')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(' ')[0];
  }

  /* ------------------------------------------------- hand-authored tickets */

  // The ten rows visible in the design, reproduced verbatim, plus the tickets
  // referenced by the customer-history list and a few records parked in other
  // queues (they create the ID gaps 4469 / 4466 / 4462 / 4460 / 4458).
  var AUTHORED = [
    {
      id: 4471,
      subject: 'Nie mogę zalogować się po zmianie hasła',
      client: 'Nordisk AB',
      contactName: 'Lars Eriksen',
      contactEmail: 'lars.eriksen@nordisk.se',
      status: 'Eskalacja',
      priority: 'Wysoki',
      queue: 'Wsparcie 1. linii',
      createdAt: new Date(2026, 7, 24, 9, 12).getTime(),
      dueAt: SIM_NOW + 2 * HOUR + 14 * MIN,
      dueStyle: 'countdown',
      modifiedAt: new Date(2026, 7, 24, 9, 44).getTime(),
      modifiedBy: 'system',
      body: 'Dzień dobry,\n\nwczoraj zmieniłem hasło zgodnie z komunikatem w panelu i od tego czasu nie mogę zalogować się na żadne z trzech kont w naszej organizacji. Kod 2FA przychodzi, ale po jego wpisaniu wraca ekran logowania bez żadnego komunikatu.\n\nTo blokuje nam cały dział obsługi zamówień, mamy dziś inwentaryzację.'
    },
    {
      id: 4470,
      subject: 'Faktura VAT za lipiec — brak w panelu',
      client: 'Kowalscy sp. z o.o.',
      contactName: 'Marta Kowalska',
      contactEmail: 'm.kowalska@kowalscy.pl',
      status: 'W toku',
      priority: 'Średni',
      queue: 'Wsparcie 1. linii',
      createdAt: new Date(2026, 7, 23, 14, 5).getTime(),
      dueAt: new Date(2026, 7, 24, 16, 0).getTime(),
      dueStyle: 'absolute',
      modifiedAt: new Date(2026, 7, 24, 8, 20).getTime(),
      modifiedBy: 'k.nowak',
      body: 'Dzień dobry,\n\nw zakładce Rozliczenia nie ma faktury za lipiec, mimo że płatność została pobrana 5.07. Poprzednie miesiące widzimy bez problemu.\n\nPotrzebujemy dokumentu do księgowości do końca tygodnia.'
    },
    {
      id: 4468,
      subject: 'Prośba o zwiększenie limitu API',
      client: 'Trendlab',
      contactName: 'Piotr Nowak',
      contactEmail: 'p.nowak@trendlab.pl',
      status: 'Nowe',
      priority: 'Niski',
      queue: 'Wsparcie 1. linii',
      createdAt: new Date(2026, 7, 24, 10, 41).getTime(),
      dueAt: null,
      dueStyle: 'none',
      modifiedAt: new Date(2026, 7, 24, 10, 41).getTime(),
      modifiedBy: 'system',
      body: 'Dzień dobry,\n\nobecny limit 1000 zapytań na godzinę przestaje nam wystarczać po uruchomieniu nowej integracji. Prosimy o podniesienie go do 5000/h.\n\nW razie potrzeby możemy przesłać szacowany profil ruchu.'
    },
    {
      id: 4467,
      subject: 'Płatność odrzucona, karta aktywna',
      client: 'Mikrus S.A.',
      contactName: 'Katarzyna Zielińska',
      contactEmail: 'k.zielinska@mikrus.pl',
      status: 'Eskalacja',
      priority: 'Wysoki',
      queue: 'Wsparcie 1. linii',
      createdAt: new Date(2026, 7, 24, 7, 58).getTime(),
      dueAt: SIM_NOW + 48 * MIN,
      dueStyle: 'countdown',
      modifiedAt: new Date(2026, 7, 24, 10, 12).getTime(),
      modifiedBy: 'a.wrona',
      body: 'Dzień dobry,\n\npróba odnowienia abonamentu kończy się komunikatem „płatność odrzucona”, ale karta jest aktywna i bank nie widzi żadnej próby obciążenia.\n\nKonto ma zostać zablokowane dziś o 14:00 — prosimy o pilną interwencję.'
    },
    {
      id: 4465,
      subject: 'Eksport CSV zwraca pusty plik',
      client: 'Nordisk AB',
      contactName: 'Lars Eriksen',
      contactEmail: 'lars.eriksen@nordisk.se',
      status: 'W toku',
      priority: 'Średni',
      queue: 'Wsparcie 1. linii',
      createdAt: new Date(2026, 7, 22, 11, 30).getTime(),
      dueAt: SIM_NOW - 3 * HOUR,
      dueStyle: 'countdown',
      modifiedAt: new Date(2026, 7, 23, 15, 2).getTime(),
      modifiedBy: 'k.nowak',
      body: 'Dzień dobry,\n\neksport listy zamówień do CSV kończy się sukcesem, ale pobrany plik ma 0 bajtów. Dotyczy to zakresów dłuższych niż jeden miesiąc.\n\nKrótsze zakresy eksportują się poprawnie.'
    },
    {
      id: 4464,
      subject: 'Jak dodać drugiego administratora?',
      client: 'Piekarnia Zorza',
      contactName: 'Ewa Mazur',
      contactEmail: 'e.mazur@zorza.pl',
      status: 'Oczekuje na klienta',
      priority: 'Niski',
      queue: 'Wsparcie 1. linii',
      createdAt: new Date(2026, 7, 21, 9, 15).getTime(),
      dueAt: null,
      dueStyle: 'none',
      modifiedAt: new Date(2026, 7, 22, 12, 40).getTime(),
      modifiedBy: 'k.nowak',
      body: 'Dzień dobry,\n\nchcielibyśmy nadać uprawnienia administratora drugiej osobie w firmie. W ustawieniach widzę tylko listę użytkowników, bez opcji zmiany roli.\n\nCzy to wymaga wyższego planu?'
    },
    {
      id: 4463,
      subject: 'Integracja ze Slackiem przestała działać',
      client: 'Trendlab',
      contactName: 'Rafał Krawczyk',
      contactEmail: 'r.krawczyk@trendlab.pl',
      status: 'W toku',
      priority: 'Wysoki',
      queue: 'Wsparcie 1. linii',
      createdAt: new Date(2026, 7, 21, 16, 48).getTime(),
      dueAt: new Date(2026, 7, 23, 16, 0).getTime(),
      dueStyle: 'absolute',
      modifiedAt: new Date(2026, 7, 23, 9, 5).getTime(),
      modifiedBy: 'a.wrona',
      body: 'Dzień dobry,\n\npowiadomienia o nowych zgłoszeniach przestały pojawiać się na naszym kanale Slack. Integracja jest widoczna jako aktywna, test połączenia przechodzi.\n\nOd kiedy dokładnie — trudno powiedzieć, zauważyliśmy w poniedziałek.'
    },
    {
      id: 4461,
      subject: 'Reklamacja — naliczono podwójnie',
      client: 'Mikrus S.A.',
      contactName: 'Grzegorz Kozłowski',
      contactEmail: 'g.kozlowski@mikrus.pl',
      status: 'Eskalacja',
      priority: 'Wysoki',
      queue: 'Wsparcie 1. linii',
      createdAt: new Date(2026, 7, 20, 13, 22).getTime(),
      dueAt: SIM_NOW - 26 * HOUR,
      dueStyle: 'countdown',
      modifiedAt: new Date(2026, 7, 22, 17, 30).getTime(),
      modifiedBy: 'system',
      body: 'Dzień dobry,\n\nna wyciągu widzimy dwa obciążenia tej samej kwoty z 18.08. W panelu jest tylko jedna faktura.\n\nProsimy o zwrot nadpłaty oraz wyjaśnienie, skąd wzięło się drugie obciążenie.'
    },
    {
      id: 4459,
      subject: 'Powiadomienia przychodzą z opóźnieniem',
      client: 'Helios Group',
      contactName: 'Joanna Dąbrowska',
      contactEmail: 'j.dabrowska@helios.pl',
      status: 'Nowe',
      priority: 'Średni',
      queue: 'Wsparcie 1. linii',
      createdAt: new Date(2026, 7, 24, 8, 5).getTime(),
      dueAt: SIM_NOW + 8 * HOUR,
      dueStyle: 'countdown',
      modifiedAt: new Date(2026, 7, 24, 8, 5).getTime(),
      modifiedBy: 'system',
      body: 'Dzień dobry,\n\nmaile o zmianie statusu zgłoszenia docierają do nas z opóźnieniem 30–60 minut. Wcześniej były praktycznie natychmiast.\n\nSprawdziliśmy filtry po naszej stronie — nic się nie zmieniło.'
    },
    {
      id: 4457,
      subject: 'Prośba o usunięcie konta (RODO)',
      client: 'osoba prywatna',
      contactName: 'Tomasz Wójcik',
      contactEmail: 't.wojcik@poczta.pl',
      status: 'Eskalacja',
      priority: 'Wysoki',
      queue: 'Wsparcie 1. linii',
      createdAt: new Date(2026, 7, 23, 18, 40).getTime(),
      dueAt: new Date(2026, 7, 25, 9, 0).getTime(),
      dueStyle: 'absolute',
      modifiedAt: new Date(2026, 7, 24, 9, 1).getTime(),
      modifiedBy: 'k.nowak',
      body: 'Dzień dobry,\n\nna podstawie art. 17 RODO wnoszę o usunięcie mojego konta oraz wszystkich powiązanych danych osobowych.\n\nProszę o potwierdzenie realizacji na ten adres e-mail.'
    },

    /* referenced by the customer-history panel for Nordisk AB */
    {
      id: 4402,
      subject: 'Reset 2FA dla trzech użytkowników',
      client: 'Nordisk AB',
      contactName: 'Lars Eriksen',
      contactEmail: 'lars.eriksen@nordisk.se',
      status: 'Zamknięte',
      priority: 'Średni',
      queue: 'Wsparcie 1. linii',
      createdAt: new Date(2026, 7, 6, 10, 20).getTime(),
      dueAt: null,
      dueStyle: 'none',
      modifiedAt: new Date(2026, 7, 7, 11, 5).getTime(),
      modifiedBy: 'k.nowak',
      body: 'Dzień dobry,\n\nprosimy o reset drugiego czynnika uwierzytelnienia dla trzech kont w naszej organizacji — zmieniliśmy służbowe telefony.\n\nLista adresów w załączniku.'
    },
    {
      id: 4388,
      subject: 'Zmiana planu na Enterprise',
      client: 'Nordisk AB',
      contactName: 'Ingrid Holm',
      contactEmail: 'ingrid.holm@nordisk.se',
      status: 'Zamknięte',
      priority: 'Niski',
      queue: 'Rozliczenia',
      createdAt: new Date(2026, 6, 29, 9, 0).getTime(),
      dueAt: null,
      dueStyle: 'none',
      modifiedAt: new Date(2026, 6, 30, 14, 12).getTime(),
      modifiedBy: 'a.wrona',
      body: 'Dzień dobry,\n\nchcielibyśmy przejść na plan Enterprise od nowego okresu rozliczeniowego. Prosimy o ofertę dla 120 użytkowników.'
    },

    /* parked in other queues — they produce the ID gaps visible in the design */
    { id: 4469, queue: 'Techniczne' },
    { id: 4466, queue: 'Rozliczenia' },
    { id: 4462, queue: 'Wsparcie 2. linii' },
    { id: 4460, queue: 'Techniczne' },
    { id: 4458, queue: 'Rozliczenia' }
  ];

  /* ----------------------------------------------------------- generation */

  var rng = makeRng(20260824);

  function generateTicket(id, index) {
    var subject = SUBJECTS[Math.floor(rng() * SUBJECTS.length)];

    // Nordisk AB is reserved for older records so the hand-authored customer
    // history for #4471 stays exactly as designed.
    var client = CLIENTS[Math.floor(rng() * CLIENTS.length)];
    if (client === 'Nordisk AB' && id > 4380) {
      client = CLIENTS[1 + Math.floor(rng() * (CLIENTS.length - 1))];
    }

    var contactName = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)] +
      ' ' + LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)];
    var parts = contactName.toLowerCase().split(' ');
    var contactEmail = slug(parts[0])[0] + '.' + slug(parts[1]) + '@' + slug(client) + '.pl';

    // Older ID -> older ticket. Roughly 40 minutes of spacing per record.
    var createdAt = SIM_NOW - (index * 41 * MIN) - Math.floor(rng() * 30 * MIN);
    var ageDays = (SIM_NOW - createdAt) / (24 * HOUR);

    // Status correlates with age: a real queue closes its backlog, so only a
    // small tail of old tickets stays open. Assigning it at random would leave
    // the console reporting well over a thousand breached SLAs.
    var open = ['Nowe', 'W toku', 'Oczekuje na klienta', 'Eskalacja'];
    var closedChance = ageDays > 6 ? 0.9 : (ageDays > 2 ? 0.5 : 0.05);
    var status = rng() < closedChance
      ? 'Zamknięte'
      : open[Math.floor(rng() * open.length)];

    // Weighted priority — most tickets are not urgent.
    var pr = rng();
    var priority = pr < 0.18 ? 'Wysoki' : (pr < 0.62 ? 'Średni' : 'Niski');

    var dueAt = null;
    var dueStyle = 'none';
    var r = rng();
    if (status !== 'Zamknięte' && r > 0.15) {
      dueAt = createdAt + (4 + Math.floor(rng() * 60)) * HOUR;
      dueStyle = r > 0.55 ? 'countdown' : 'absolute';
    }

    var body = 'Dzień dobry,\n\n' +
      COMPLAINTS[Math.floor(rng() * COMPLAINTS.length)] + '. ' +
      'Zgłoszenie dotyczy: ' + subject.toLowerCase().replace(/\?$/, '') + '.\n\n' +
      IMPACTS[Math.floor(rng() * IMPACTS.length)] + '\n\nPozdrawiam,\n' + contactName;

    return {
      id: id,
      subject: subject,
      client: client,
      contactName: contactName,
      contactEmail: contactEmail,
      status: status,
      priority: priority,
      queue: null, // filled in by assignQueues()
      createdAt: createdAt,
      dueAt: dueAt,
      dueStyle: dueStyle,
      modifiedAt: createdAt + Math.floor(rng() * 20) * HOUR,
      modifiedBy: rng() > 0.5 ? 'system' : (rng() > 0.5 ? 'k.nowak' : 'a.wrona'),
      body: body
    };
  }

  function build() {
    var authoredById = {};
    AUTHORED.forEach(function (t) { authoredById[t.id] = t; });

    var tickets = [];
    var id = 4471;
    var index = 0;

    while (tickets.length < TOTAL_RECORDS) {
      var authored = authoredById[id];
      if (authored && authored.subject) {
        tickets.push(Object.assign({}, authored));
      } else {
        var generated = generateTicket(id, index);
        // Queue-only stubs exist purely to reserve an ID for another queue.
        if (authored) generated.queue = authored.queue;
        tickets.push(generated);
      }
      id--;
      index++;
    }

    assignQueues(tickets);
    tickets.forEach(function (t) {
      t.messages = [{
        from: t.contactName,
        email: t.contactEmail,
        at: t.createdAt,
        body: t.body,
        outgoing: false
      }];
      delete t.body;
    });

    return tickets;
  }

  // Distributes queues so that "Wsparcie 1. linii" holds exactly
  // FIRST_LINE_RECORDS tickets — that is the 1 284 from the design.
  function assignQueues(tickets) {
    var quota = FIRST_LINE_RECORDS;
    var open = [];

    tickets.forEach(function (t) {
      if (t.queue === 'Wsparcie 1. linii') quota--;
      else if (t.queue === null) open.push(t);
    });

    var qrng = makeRng(913377);
    var remaining = open.length;

    open.forEach(function (t) {
      var mustTake = quota >= remaining;
      if (quota > 0 && (mustTake || qrng() < 0.7)) {
        t.queue = 'Wsparcie 1. linii';
        quota--;
      } else {
        t.queue = QUEUES[1 + Math.floor(qrng() * (QUEUES.length - 1))];
      }
      remaining--;
    });
  }

  return {
    SIM_NOW: SIM_NOW,
    tickets: build(),
    statuses: STATUSES,
    priorities: PRIORITIES,
    queues: QUEUES,
    statusOrder: STATUS_ORDER,
    priorityOrder: PRIORITY_ORDER,
    clients: CLIENTS,
    subjects: SUBJECTS,
    firstNames: FIRST_NAMES,
    lastNames: LAST_NAMES
  };
})();
