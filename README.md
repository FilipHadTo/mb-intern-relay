# RELAY — Konsola Wsparcia (zadanie rekrutacyjne, Intern AI Designer 2026)

Odtworzenie ekranu **Zgłoszenia** z konsoli wsparcia RELAY w czystym HTML, CSS
i JavaScripcie — bez frameworków, bez build stepu, bez zależności.

Design źródłowy:
[Figma — Rekrutacja Intern 2026](https://www.figma.com/design/qbIgUonueUNZq5hxjCtQE7/Rekrutacja-Intern-2026?node-id=15-2)

## Jak uruchomić

Otwórz `index.html` w przeglądarce. To wszystko — nie ma nic do instalowania.

Jeśli wolisz lokalny serwer (np. żeby uniknąć ograniczeń `file://`):

```
python3 -m http.server 8000
# potem http://localhost:8000
```

## Struktura

```
index.html    struktura ekranu (semantyczny HTML: tabela, formularz, kontrolki)
styles.css    cały wygląd; paleta i typografia jako custom properties na :root
data.js       warstwa danych — 1900 zgłoszeń generowanych deterministycznie
app.js        logika: stan, filtrowanie, sortowanie, paginacja, interakcje
```

Podział jest celowo płaski i czytelny — każdy plik można otworzyć i przeczytać
od góry do dołu.

## Co faktycznie działa

Nie ma tu klikanego mockupu — wszystko liczy się z danych w `data.js`.

- **Filtrowanie** po statusie, priorytecie i kolejce oraz pełnotekstowe
  wyszukiwanie po temacie, kliencie, adresie e-mail i **treści wiadomości**.
  Filtry nie stosują się na bieżąco: dopóki nie klikniesz „Filtruj”, obok
  przycisku widać podpowiedź o niezastosowanych kryteriach — tak jak w
  aplikacjach, dla których ten ekran był projektowany. Zapytanie ma
  symulowane opóźnienie i pasek postępu.
- **Sortowanie** po każdej kolumnie (klik w nagłówek). Status i priorytet
  sortują się po wadze biznesowej, nie alfabetycznie: Eskalacja przed Nowe
  przed W toku. Zgłoszenia bez SLA zawsze na końcu.
- **Paginacja** — realne 129 stron, przełączanie liczby wierszy (10/25/50/100),
  okno numerów stron zwężające się na krańcach.
- **Panel szczegółów** ładuje wybrane zgłoszenie. „Historia klienta” nie jest
  wpisana na sztywno — to prawdziwe pozostałe zgłoszenia tego samego klienta,
  policzone z bazy i klikalne. Wejście w pozycję poza aktywnym filtrem
  powie ci wprost, że rekord jest w innej kolejce.
- **Odpowiedz** otwiera edytor z szablonami odpowiedzi standardowych.
  Wysłanie dopisuje wiadomość do wątku (który staje się korespondencją
  dwustronną), przestawia status z „Nowe” na „W toku” i aktualizuje stopkę
  „Ostatnia modyfikacja”. Pusta treść jest odrzucana.
- **Eskaluj** pokazuje okno potwierdzenia, a po zatwierdzeniu podnosi priorytet
  i przenosi zgłoszenie do 2. linii — po czym znika ono z bieżącej kolejki i
  licznik rekordów spada.
- **Licznik SLA** tyka co sekundę. Kolumna „Termin” i pole w panelu
  przeliczają się na żywo, a przekroczony termin zmienia kolor.
- **Nowe zgłoszenia** dochodzą do kolejki co 20 sekund (można wyłączyć w
  Ustawieniach). Jeśli jesteś na pierwszej stronie, wiersz wjeżdża z
  podświetleniem; jeśli nie — dostajesz licznik w nagłówku.
- **Pulpit** liczy kafelki (nowe / w toku / eskalacje / przekroczone SLA)
  z tej samej bazy.
- **Ustawienia** (auto-odświeżanie, licznik SLA, wiersze na stronę) zapisują
  się w `localStorage`. **Drukuj** ma osobny arkusz — drukuje sam panel
  zgłoszenia, bez nawigacji i tabeli.

Moduły Klienci / Baza wiedzy / Raporty są świadomie zaślepione — zakres
zadania to moduł Zgłoszenia.

## Skróty klawiaturowe

| Klawisz | Działanie |
|---|---|
| `/` | kursor do wyszukiwania |
| `↑` `↓` | poprzednie / następne zgłoszenie (także między stronami) |
| `PgUp` `PgDn` | poprzednia / następna strona |
| `Home` | pierwsza strona |
| `Esc` | zamknij okno dialogowe lub edytor odpowiedzi |

## Dane

`data.js` generuje 1900 zgłoszeń przez seedowany generator (LCG), więc przy
każdym odświeżeniu baza jest identyczna. Dziesięć wierszy widocznych w Figmie
jest wpisanych ręcznie i zgadza się co do znaku; reszta powstaje z pul tematów,
klientów i treści.

Dwie rzeczy warto znać, jeśli będziesz to zmieniać:

- **Kolejka „Wsparcie 1. linii” ma dokładnie 1284 zgłoszenia** — stąd licznik
  rekordów i 129 stron z designu. Za rozdział odpowiada `assignQueues()`.
- **Konsola chodzi na zasymulowanym zegarze** (`SIM_NOW` = 24.08.2026, 11:26),
  który płynie w czasie realnym. Dzięki temu daty z designu mają sens, a
  liczniki SLA i tak tykają. Zmiana jednej stałej przestawia cały ekran.

Status zgłoszenia zależy od jego wieku — stary backlog jest w większości
zamknięty. Losowanie statusu bez tej korelacji dawało ponad tysiąc
przekroczonych SLA, co wyglądało nieprawdziwie.

## Odstępstwa od designu (świadome)

1. **Odmiana liczebnika.** Design ma „1 284 rekordów”; poprawna forma dla
   liczby kończącej się na 4 to „1 284 rekordy”, więc kod odmienia rzeczownik
   regułą (`plural()` w `app.js`), bo licznik i tak zmienia się dynamicznie.
2. **Szerokości kolumn** to 42 / 236 / 114 / 81 / 62 / 85 px zamiast
   42 / 236 / 108 / 82 / 62 / 90. Suma nadal wynosi 620 px. W Figmie teksty
   wychodzą poza swoje ramki, czego tabela HTML nie robi — przy oryginalnych
   szerokościach „Kowalscy sp. z o.o.” obcinało się wielokropkiem.
3. **Strzałki sortowania** w nagłówkach — potrzebne, skoro sortowanie działa.
4. **„Historia klienta (3 z 44)”** zamiast „(3 z 37)”. Liczba jest wyliczana
   z bazy, nie wpisana.
5. **ID sesji** w stopce panelu jest losowane przy każdym wejściu.

## Gdzie zacząć, jeśli chcesz to rozwijać

Cała paleta i typografia siedzą w bloku `:root` w `styles.css` — redesign
można zacząć od podmiany samych zmiennych, bez ruszania struktury. Logika w
`app.js` jest podzielona na sekcje (zegar, formatery, stan, zapytania,
renderery, obsługa zdarzeń) i nie zależy od konkretnego wyglądu.

Ekran ma stałą szerokość 1280 px, tak jak oryginał.
