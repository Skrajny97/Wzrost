# Insight

Solowa, casualowa gra przeglądarkowa litRPG na telefon, oparta na timerach. Jedynym źródłem prawdy o projekcie jest [dokument projektowy](https://claude.ai/artifact/9jPtkYkTJ67d3akFB8imGX). Założenia przyjęte w trakcie budowy są w [DECISIONS.md](DECISIONS.md).

Stan: **Etap 2a, plansza obozu.** Działa konto (także logowanie przez Google, gdy są jego klucze), tworzenie postaci z wyborem jednej z pięciu klas, start bez ekwipunku, poziomy do 500, statystyki z wolnymi punktami, ekwipunek przypisany do klas i plecak z podglądem zmian, złomiarz, eksploracje na czasie serwera w dwóch regionach Skraju Puszczy, każdy z pięcioma regionami wewnętrznymi otwieranymi poziomem klasy, z suwakiem czasu, który wydłuża się z poziomem (30 minut na start, 4 godziny od poziomu 50), i spotkaniami wymagającymi, walka do trzech na trzech, raport z animacją każdej walki, efekty dźwiękowe, omdlenie, Dziennik, „Zacznij od nowa” oraz obóz jako plansza w stylu Plemion z placem na każdy z siedmiu budynków na timerach: Tartak, Kamieniołom i Kopalnia wytwarzają zasoby do magazynu, Ognisko, Szałas na łupy i Stół złomiarza dają premie, a Kowadło pozwala ulepszać przedmioty do +10. Stwory, przedmioty i postacie (kobieta i mężczyzna w każdej klasie) mają sprite'y w pixel-arcie. W tle gra muzyka, ciosy w walce to nagrania, a grę można zainstalować na telefonie przyciskiem „Zainstaluj jako aplikację”. Zasoby (drewno, kamień, ruda żelaza) postać znajduje też na eksploracjach. Punkty Systemu, przyszła waluta premium na kosmetykę, należą do konta i są w górnym pasku obok złota. Spis klas, przedmiotów, potworów i regionów jest w [encyklopedii](https://claude.ai/artifact/EDt6uk8X5rRU9JCTLKsnXw).

## Adres gry

**https://insightrpg.com**

Gra działa też pod https://www.insightrpg.com. Zapasowy adres https://wzrost.wzrost.workers.dev prowadzi do tej samej gry i bazy, a zawiera dawną roboczą nazwę „Wzrost”.

Adres jest też w zakładce **Actions**, w podsumowaniu (Summary) każdego przebiegu „Testy i wdrożenie”.

## Jednorazowa konfiguracja z telefonu

Ta konfiguracja jest już zrobiona. Opis zostaje na wypadek, gdyby trzeba było założyć nowy token albo przenieść grę na inne konto. Potem każda zmiana w gałęzi `main` wdraża się sama.

### 1. Konto Cloudflare

Pomiń ten krok, jeśli masz już konto.

1. Otwórz https://dash.cloudflare.com/sign-up.
2. Podaj e-mail i hasło, a potem potwierdź adres linkiem z wiadomości od Cloudflare.

Darmowy plan Workers wystarcza.

### 2. Account ID

1. Zaloguj się na https://dash.cloudflare.com.
2. Stuknij pasek adresu przeglądarki. Adres ma postać `dash.cloudflare.com/<32 znaki>/home`.
3. Skopiuj te 32 znaki (cyfry i litery a–f). To jest Account ID.

Druga droga: stuknij ikonę wyszukiwania w panelu, wpisz „Copy account ID” i wybierz ten wynik.

### 3. Token API

1. Zaloguj się na https://dash.cloudflare.com, a potem otwórz [formularz tokenu z gotowymi uprawnieniami](https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22workers_scripts%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22d1%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_settings%22%2C%22type%22%3A%22read%22%7D%5D&accountId=%2A&zoneId=all&name=Wzrost%20deploy).
2. Formularz ma już trzy uprawnienia: Workers Scripts: Edit, D1: Edit i Account Settings: Read. Niczego nie zmieniaj.
3. Przewiń w dół i stuknij **Continue to summary**, a potem **Create Token**.
4. Skopiuj token. Cloudflare pokazuje go tylko raz.

### 4. Sekrety w GitHubie

Potrzebne są dwa sekrety. Oba dodajesz na stronie https://github.com/Skrajny97/Wzrost/settings/secrets/actions. Jeśli strona się nie otwiera, włącz w menu przeglądarki „Wersja na komputer”.

Pierwszy sekret, token:

1. Stuknij **New repository secret**.
2. **Name:** `CLOUDFLARE_API_TOKEN`
3. **Secret:** token z kroku 3.
4. Stuknij **Add secret**.

Drugi sekret, Account ID:

1. Stuknij **New repository secret**.
2. **Name:** `CLOUDFLARE_ACCOUNT_ID`
3. **Secret:** 32 znaki z kroku 2, bez ukośników i bez reszty adresu.
4. Stuknij **Add secret**.

Na liście mają być dokładnie te dwa wpisy.

### 5. Pierwsze wdrożenie

1. Otwórz https://github.com/Skrajny97/Wzrost/actions/workflows/deploy.yml.
2. Stuknij **Run workflow**, zostaw gałąź `main` i potwierdź przyciskiem **Run workflow**.
3. Po 2–3 minutach otwórz przebieg. Adres gry jest w podsumowaniu.

Przy pierwszym wdrożeniu na nowej subdomenie Cloudflare potrzebuje kilku minut na certyfikat HTTPS. W tym czasie sprawdzenie po wdrożeniu kończy się ostrzeżeniem, a gra zaczyna działać chwilę później.

Jeśli przebieg zakończy się błędem, poproś Claude o sprawdzenie jego logu.

## Jak działa wdrażanie

Każdy push do `main` uruchamia workflow „Testy i wdrożenie” (`.github/workflows/deploy.yml`):

1. Testy.
2. Sprawdzenie sekretów Cloudflare. Bez nich wdrożenie jest pomijane z ostrzeżeniem.
3. Założenie subdomeny workers.dev i bazy D1 `wzrost`, jeśli ich jeszcze nie ma (`tools/prepare-cloudflare.mjs`).
4. Migracje bazy z katalogu `migrations/`.
5. Wdrożenie Workera razem z plikami strony i kluczami logowania Google, jeśli są w sekretach repozytorium.
6. Sprawdzenie, czy nowa wersja odpowiada (`tools/smoke-test.mjs`).

Push na inną gałąź uruchamia tylko testy.

## Struktura repozytorium

```
src/engine/   silnik gry: czyste, deterministyczne funkcje (walka, eksploracje, przedmioty, progresja)
src/server/   Worker: API, logowanie, sesje, postać, ekwipunek, eksploracje, raporty
src/client/   strona gry: HTML, CSS i moduły ES, bez kroku budowania
data/         treść gry w JSON i schematy w data/schemas
migrations/   schemat bazy D1
tools/        wdrożenie, walidacja danych, symulacja balansu, generowanie grafik i dźwięków
art/          opisy grafik dla generatora pixel-artu i wzorce stylu
audio/        opisy dźwięków dla generatora ElevenLabs
test/         testy: node:test i lokalne środowisko Workers z bazą D1
DECISIONS.md  rejestr założeń
```

Treść gry (klasy, wygląd postaci, potwory, regiony, przedmioty, afiksy, teksty raportów, kolejność odblokowań, zasoby i budynki obozu, muzyka i dźwięki walki) zmienia się w plikach `data/*.json`, bez dotykania kodu. Walidacja sprawdza je przy każdym pushu.

## Praca lokalna

Wymaga Node.js 22 lub nowszego.

```sh
npm ci
npm test           # testy silnika, danych, strony i API na lokalnej bazie D1
npm run validate   # sprawdzenie plików data/ schematami i odwołań między nimi
npm run simulate   # symulacja 10 000 wypraw: omdlenia, XP, złoto i przedmioty na godzinę
npm run dev        # gra pod http://localhost:8787 z lokalną bazą D1
```

Symulacja przyjmuje też opcje, np. `npm run simulate -- --levels 6,7 --minutes 60,240 --hunts 2000` albo `npm run simulate -- --calibrate` (propozycja stałej krzywej XP).

## API

| Metoda | Ścieżka | Opis |
|---|---|---|
| GET | `/api/health` | stan serwera i bazy, czas serwera, wersja; `google` mówi, czy działa logowanie przez Google |
| POST | `/api/auth/register` | rejestracja: `login`, `email` (opcjonalnie), `password` |
| POST | `/api/auth/login` | logowanie: `identifier` (login lub e-mail), `password` |
| POST | `/api/auth/logout` | wylogowanie |
| GET | `/api/auth/google/start` | przejście do Google; `?mode=link` łączy Google z zalogowanym kontem |
| GET | `/api/auth/google/callback` | powrót z Google: logowanie, nowe konto albo połączenie, potem przejście do `/` albo `/?google=<wynik>` |
| GET | `/api/me` | zalogowany gracz; `google` mówi, czy konto ma połączone Google, a `testMode`, czy ma tryb testowy |
| GET | `/api/content` | nazwy klas, wyglądów, statystyk, slotów, rzadkości, żywiołów, regionów i regionów wewnętrznych (z poziomem klasy, który je otwiera), zakres czasu i nazwy długości wypraw, odblokowania, poziomy ewolucji klas, muzyka i dźwięki walki; bez logowania |
| GET | `/api/character` | pełny widok postaci z zasobami, Punktami Systemu konta (`systemPoints`), pojemnością plecaka i obozem (404 `no_character`, gdy jej nie ma) |
| POST | `/api/character` | nowa postać: `name`, `classId`, `appearance` (`female` albo `male`) |
| POST | `/api/character/appearance` | zmiana wyglądu: `appearance`; działa też podczas eksploracji |
| DELETE | `/api/character` | „Zacznij od nowa”: usuwa postać z przedmiotami, raportami, wyprawą i obozem; Punkty Systemu zostają na koncie |
| POST | `/api/character/points` | rozdanie punktów: `points`, np. `{ "strength": 2 }` |
| POST | `/api/character/points/auto` | „Rozdaj według klasy” |
| POST | `/api/character/points/reset` | darmowe zerowanie punktów (do poziomu 20) |
| GET | `/api/items/:id/preview` | wartości bojowe teraz i po założeniu (albo zdjęciu) przedmiotu |
| POST | `/api/items/:id/equip` | załóż przedmiot z plecaka |
| POST | `/api/items/:id/unequip` | zdejmij przedmiot do plecaka |
| POST | `/api/items/:id/discard` | wyrzuć przedmiot z plecaka |
| POST | `/api/items/:id/upgrade` | Kowadło: jedna próba ulepszenia przedmiotu o poziom, za złoto i rudę żelaza |
| POST | `/api/items/sell` | złomiarz: sprzedaj przedmioty z plecaka o rzadkości do `maxRarity` włącznie (cena z premią Stołu złomiarza) |
| POST | `/api/camp/build` | zacznij budowę następnego poziomu budynku obozu: `buildingId`; naraz jedna budowa; budynek produkcyjny najpierw oddaje zawartość magazynu |
| POST | `/api/camp/collect` | zbierz magazyn budynku produkcyjnego: `buildingId`; zwraca `collected` (409 `nothing_to_collect`, gdy magazyn jest pusty) |
| GET | `/api/hunts/options` | poziom zagrożenia dla każdego czasu w otwartym regionie wewnętrznym dla poziomu postaci; `?area=<id>` liczy jeden wybrany region wewnętrzny |
| POST | `/api/hunts` | wyrusz na eksplorację: `areaId` (otwarty region wewnętrzny), `minutes` (1, potem co 5 minut: do 30, od poziomu 25 do 60, od 35 do 120, od 50 do 240) |
| POST | `/api/hunts/cancel` | przerwij trwającą eksplorację |
| POST | `/api/hunts/claim` | odbierz raport zakończonej eksploracji |
| GET | `/api/reports` | 50 ostatnich raportów (Dziennik); starsze usuwa odbiór kolejnego |
| GET | `/api/reports/:id` | pełny raport |
| POST | `/api/test/skip-time` | tylko w trybie testowym i dla kont z `TEST_LOGINS`: kończy od razu wyprawę albo odpoczynek („Pomiń czas”) |
| POST | `/api/test/skip-build` | tylko w trybie testowym i dla kont z `TEST_LOGINS`: kończy od razu budowę w obozie, a gdy nic się nie buduje, zapełnia magazyny |

Błędy mają postać `{ "error": { "code": "…", "message": "…" } }`, gdzie `message` jest po polsku.

## Logowanie przez Google

Na ekranie startowym jest „Zaloguj się przez Google”, a w Ustawieniach „Połącz z Google”. Oba przyciski pojawiają się dopiero wtedy, gdy Worker ma klucze klienta Google. Klucze są w sekretach repozytorium `GOOGLE_CLIENT_ID` i `GOOGLE_CLIENT_SECRET`, a wdrożenie przekazuje je Workerowi. Klienta zakłada się w Google Cloud Console (Google Auth Platform → Clients, typ „Web application”) z adresami powrotu:

- `https://insightrpg.com/api/auth/google/callback`
- `https://www.insightrpg.com/api/auth/google/callback`

Te adresy wymienia `GOOGLE_HOSTS` w `wrangler.jsonc`. Zasady łączenia kont są w `DECISIONS.md`, w części „Logowanie przez Google”. Lokalnie logowanie Google wymaga własnego klienta z adresem `http://localhost:8787/api/auth/google/callback` i uruchomienia `npx wrangler dev --local-upstream localhost:8787 --var GOOGLE_HOSTS: --var GOOGLE_CLIENT_ID:… --var GOOGLE_CLIENT_SECRET:…`. Bez `--local-upstream` Worker widzi adres `insightrpg.com` zamiast `localhost`.

## Tryb testowy

Dopóki grę testujemy, `TEST_MODE` w `wrangler.jsonc` ma wartość `"on"`, a zakładka Walka ma przycisk „Pomiń czas”. Kończy on od razu trwającą wyprawę, bez zmiany wyniku, albo odpoczynek. W grze tryb testowy mają tylko konta z `TEST_LOGINS` (dziś konto autora), a reszta graczy go nie widzi. Testy i `npm run dev` dają go każdemu kontu. Przełącznik „Tryb testowy” w Ustawieniach chowa i pokazuje ten przycisk w danej przeglądarce. Po testach wystarczy ustawić `"off"` i wdrożyć.

## Grafiki

Sprite'y stworów (48×48) i przedmiotów (32×32) powstają w generatorze pixel-artu [Retro Diffusion](https://www.retrodiffusion.ai). Opisy, style i rozmiary są w `art/prompts.json`. Generowanie uruchamia się ręcznie:

1. Na github.com otwórz repozytorium, zakładkę **Actions** i przebieg **Grafiki (szkice)**.
2. Stuknij **Run workflow**, wybierz rodzaj (`monsters` albo `items`), wpisz identyfikatory po przecinku albo `all` i limit dolarów, a potem stuknij zielone **Run workflow**.
3. Szkice z przezroczystym tłem trafią na gałąź `art-drafts`, do folderu `art/drafts/`. Podsumowanie przebiegu podaje koszt i stan salda.

Przebieg potrzebuje sekretu repozytorium `RETRO_DIFFUSION_API_KEY` z kluczem API Retro Diffusion. Skrypt najpierw darmowo wycenia każde zapytanie i nie wydaje więcej niż limit. Zatwierdzone sprite'y trafiają do `src/client/art/` i na listę w `src/client/art.js`, a wzorce stylu dla kolejnych do `art/references/`. Gdy pod stworem albo przedmiotem zostaje kafel podłoża, przed wstawieniem do gry trzeba go wyciąć (zob. `DECISIONS.md`, „Drabinka eksploracji i lochy”, punkt 7).

## Muzyka i dźwięki

Muzyka w tle jest w `src/client/audio/music/`, a `data/music.json` mówi, który utwór gra domyślnie, a który w danym miejscu (`places`: id regionu, regionu wewnętrznego albo `camp`). Raport otwarty zaraz po wyprawie gra raz utwór swojego wyniku (`reports`: `success` dla wygranej, `fainted` dla omdlenia, `escaped` dla ucieczki), a ten sam raport z Dziennika zwykłą muzykę. Zmiana utworu wycisza jeden i pogłaśnia drugi (`switchSeconds`), a utwór, który wraca, gra od miejsca, w którym ucichł. Utwór cichnie przez ostatnie 5 sekund i po krótkiej pauzie gra od nowa. Kolejny utwór dodaje się tak:

1. Wgraj plik MP3 do `src/client/audio/music/` (nazwa małymi literami, z myślnikami).
2. Dopisz go do `tracks` w `data/music.json`, a miejsce i id utworu do `places` (albo wynik wyprawy do `reports`).
3. `npm run validate` sprawdzi, że plik i miejsce istnieją.

Ciosy, uniki i upadki w walce to nagrania z paczek Kenney (CC0) w `src/client/audio/sfx/`, przypisane w `data/sounds.json` do rodzajów broni i ataków potworów (pole `sound` w `data/item-bases.json` i `data/monsters.json`). Przerabia je dla głośnika telefonu `tools/build-sfx.py` (Python i ffmpeg). Głosy stworów i postaci przy trafieniu i pokonaniu (`voices`) oraz nagrania dźwięków wołanych po nazwie (`effects`, np. `tab`: zmiana zakładki, `swing`: zamach) pochodzą z generatora ElevenLabs. Nagrywa je przebieg **Dźwięki (szkice)**:

1. Na github.com otwórz repozytorium, zakładkę **Actions** i przebieg **Dźwięki (szkice)**.
2. Stuknij **Run workflow**, wybierz rodzaj (`voices`, `effects` albo `ui`), wpisz identyfikatory po przecinku albo `all` i limit kredytów, a potem stuknij zielone **Run workflow**.
3. Szkice trafią na gałąź `art-drafts`, do folderu `audio/drafts/`.

Przebieg potrzebuje sekretu repozytorium `ELEVENLABS_API_KEY`. Opisy dźwięków są w `audio/prompts.json`; dźwięk trwa tyle, ile podaje `seconds`, i kosztuje 20 kredytów na sekundę. Kolejny przebieg czeka, aż skończy się poprzedni, ale GitHub trzyma w kolejce tylko jeden czekający, więc trzeci uruchomiony od razu anuluje drugi. Wybrane szkice przerabia dla telefonu `tools/build-drafts.py` (Python z numpy i ffmpeg): przycina je od pierwszego dźwięku do wybrzmienia, wycina bas, którego telefon nie gra, i wyrównuje głośność. Poziom w grze ustawia `gain` w `data/sounds.json`.
