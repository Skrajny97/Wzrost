# Wzrost

Solowa, casualowa gra przeglądarkowa litRPG na telefon, oparta na timerach. Jedynym źródłem prawdy o projekcie jest [dokument projektowy](https://claude.ai/artifact/9jPtkYkTJ67d3akFB8imGX). Założenia przyjęte w trakcie budowy są w [DECISIONS.md](DECISIONS.md).

Stan: **Etap 0, konfiguracja.** Działa konto (rejestracja, logowanie, wylogowanie), serwer z bazą D1 i automatyczne wdrażanie.

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
src/engine/   silnik gry: czyste, deterministyczne funkcje (od etapu 1)
src/server/   Worker: API, logowanie, sesje
src/client/   strona gry: HTML, CSS i moduły ES, bez kroku budowania
data/         treść gry w JSON (od etapu 1)
migrations/   schemat bazy D1
tools/        skrypty wdrożenia, później symulacje balansu i walidacja danych
test/         testy: node:test i lokalne środowisko Workers z bazą D1
DECISIONS.md  rejestr założeń
```

## Praca lokalna

Wymaga Node.js 22 lub nowszego.

```sh
npm ci
npm test       # testy jednostkowe i testy API na lokalnej bazie D1
npm run dev    # gra pod http://localhost:8787 z lokalną bazą D1
```

## API

| Metoda | Ścieżka | Opis |
|---|---|---|
| GET | `/api/health` | stan serwera i bazy, czas serwera, wersja |
| POST | `/api/auth/register` | rejestracja: `login`, `email` (opcjonalnie), `password` |
| POST | `/api/auth/login` | logowanie: `identifier` (login lub e-mail), `password` |
| POST | `/api/auth/logout` | wylogowanie |
| GET | `/api/me` | zalogowany gracz |

Błędy mają postać `{ "error": { "code": "…", "message": "…" } }`, gdzie `message` jest po polsku.
