# Wzrost

Solowa, casualowa gra przeglądarkowa litRPG na telefon, oparta na timerach. Jedynym źródłem prawdy o projekcie jest [dokument projektowy](https://claude.ai/artifact/9jPtkYkTJ67d3akFB8imGX). Założenia przyjęte w trakcie budowy są w [DECISIONS.md](DECISIONS.md).

Stan: **Etap 1, rdzeń, po uwagach autora i zmianie skali.** Działa konto, tworzenie postaci z wyborem jednej z pięciu klas, start bez ekwipunku, poziomy do 500, statystyki z wolnymi punktami, ekwipunek przypisany do klas i plecak z podglądem zmian, złomiarz, eksploracje na czasie serwera w dwóch regionach Skraju Puszczy, każdy z pięcioma regionami wewnętrznymi otwieranymi poziomem klasy, z suwakiem czasu i spotkaniami wymagającymi, walka do trzech na trzech, raport z animacją każdej walki, efekty dźwiękowe, omdlenie, Dziennik i „Zacznij od nowa”. Spis klas, przedmiotów, potworów i regionów jest w [encyklopedii](https://claude.ai/artifact/EDt6uk8X5rRU9JCTLKsnXw).

## Adres gry

**https://wzrost.wzrost.workers.dev**

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
5. Wdrożenie Workera razem z plikami strony.
6. Sprawdzenie, czy nowa wersja odpowiada (`tools/smoke-test.mjs`).

Push na inną gałąź uruchamia tylko testy.

## Struktura repozytorium

```
src/engine/   silnik gry: czyste, deterministyczne funkcje (walka, eksploracje, przedmioty, progresja)
src/server/   Worker: API, logowanie, sesje, postać, ekwipunek, eksploracje, raporty
src/client/   strona gry: HTML, CSS i moduły ES, bez kroku budowania
data/         treść gry w JSON i schematy w data/schemas
migrations/   schemat bazy D1
tools/        wdrożenie, walidacja danych, symulacja balansu
test/         testy: node:test i lokalne środowisko Workers z bazą D1
DECISIONS.md  rejestr założeń
```

Treść gry (klasy, potwory, regiony, przedmioty, afiksy, teksty raportów, kolejność odblokowań) zmienia się w plikach `data/*.json`, bez dotykania kodu. Walidacja sprawdza je przy każdym pushu.

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
| GET | `/api/health` | stan serwera i bazy, czas serwera, wersja |
| POST | `/api/auth/register` | rejestracja: `login`, `email` (opcjonalnie), `password` |
| POST | `/api/auth/login` | logowanie: `identifier` (login lub e-mail), `password` |
| POST | `/api/auth/logout` | wylogowanie |
| GET | `/api/me` | zalogowany gracz |
| GET | `/api/content` | nazwy klas, statystyk, slotów, rzadkości, żywiołów, regionów i regionów wewnętrznych (z poziomem klasy, który je otwiera), zakres czasu i nazwy długości wypraw, odblokowania, `testMode` |
| GET | `/api/character` | pełny widok postaci (404 `no_character`, gdy jej nie ma) |
| POST | `/api/character` | nowa postać: `name`, `classId` |
| DELETE | `/api/character` | „Zacznij od nowa”: usuwa postać z przedmiotami, raportami i wyprawą |
| POST | `/api/character/points` | rozdanie punktów: `points`, np. `{ "strength": 2 }` |
| POST | `/api/character/points/auto` | „Rozdaj według klasy” |
| POST | `/api/character/points/reset` | darmowe zerowanie punktów (do poziomu 10) |
| GET | `/api/items/:id/preview` | wartości bojowe teraz i po założeniu (albo zdjęciu) przedmiotu |
| POST | `/api/items/:id/equip` | załóż przedmiot z plecaka |
| POST | `/api/items/:id/unequip` | zdejmij przedmiot do plecaka |
| POST | `/api/items/:id/discard` | wyrzuć przedmiot z plecaka |
| POST | `/api/items/sell` | złomiarz: sprzedaj przedmioty z plecaka o rzadkości do `maxRarity` włącznie |
| GET | `/api/hunts/options` | poziom zagrożenia dla każdego czasu w otwartym regionie wewnętrznym dla poziomu postaci; `?area=<id>` liczy jeden wybrany region wewnętrzny |
| POST | `/api/hunts` | wyrusz na eksplorację: `areaId` (otwarty region wewnętrzny), `minutes` (1, potem co 5 minut, do 45 na poziomie 1 i do 240 od poziomu 2) |
| POST | `/api/hunts/cancel` | przerwij trwającą eksplorację |
| POST | `/api/hunts/claim` | odbierz raport zakończonej eksploracji |
| GET | `/api/reports` | 50 ostatnich raportów (Dziennik); starsze usuwa odbiór kolejnego |
| GET | `/api/reports/:id` | pełny raport |
| POST | `/api/test/skip-time` | tylko w trybie testowym: kończy od razu wyprawę albo odpoczynek („Pomiń czas”) |

Błędy mają postać `{ "error": { "code": "…", "message": "…" } }`, gdzie `message` jest po polsku.

## Tryb testowy

Dopóki grę testujemy, `TEST_MODE` w `wrangler.jsonc` ma wartość `"on"`, a zakładka Walka ma przycisk „Pomiń czas”. Kończy on od razu trwającą wyprawę, bez zmiany wyniku, albo odpoczynek. Przełącznik „Tryb testowy” w Ustawieniach chowa i pokazuje ten przycisk w danej przeglądarce. Po testach wystarczy ustawić `"off"` i wdrożyć.
