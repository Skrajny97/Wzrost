# Insight

Solowa, casualowa gra przeglądarkowa litRPG na telefon, oparta na timerach. Jedynym źródłem prawdy o projekcie jest [dokument projektowy](https://claude.ai/artifact/9jPtkYkTJ67d3akFB8imGX). Założenia przyjęte w trakcie budowy są w [DECISIONS.md](DECISIONS.md).

Stan: **Etap 2a, plansza obozu i materiały.** Działa konto (także logowanie przez Google, gdy są jego klucze), tworzenie postaci z wyborem jednej z pięciu klas, start bez ekwipunku, poziomy do 500, statystyki z wolnymi punktami, ekwipunek przypisany do klas i plecak z podglądem zmian, złomiarz, eksploracje na czasie serwera w dwóch regionach Skraju Puszczy, każdy z pięcioma regionami wewnętrznymi otwieranymi poziomem klasy, z suwakiem czasu, który wydłuża się z poziomem (30 minut na start, 4 godziny od poziomu 50), i spotkaniami wymagającymi, walka do trzech na trzech, raport z animacją każdej walki, efekty dźwiękowe, omdlenie, Dziennik, „Zacznij od nowa” oraz obóz jako plansza w stylu Plemion z placem na każdy z ośmiu budynków na timerach: Tartak, Kamieniołom i Kopalnia wytwarzają zasoby do magazynu, Ognisko, Magazyn i Skup złomu dają premie (w Skupie złomu złomiarz sprzedaje też części do rzemiosła), Kowadło pozwala ulepszać przedmioty do +10, a Stół rzemieślniczy przerabia materiały i rozebrane przedmioty na części. Stwory zostawiają materiały, każdy swój, a przedmioty przynoszą skrzynie skarbów. Materiały i części widać w sakwie w górnym pasku. Stwory, przedmioty i postacie (kobieta i mężczyzna w każdej klasie) mają sprite'y w pixel-arcie. W tle gra muzyka, ciosy w walce to nagrania, a grę można zainstalować na telefonie przyciskiem „Zainstaluj jako aplikację”. Zasoby (drewno, kamień, ruda żelaza) postać znajduje też na eksploracjach. Punkty Systemu, przyszła waluta premium na kosmetykę, należą do postaci i są w górnym pasku pod złotem. Punkty Czasu przewijają czekanie, a co pół godziny przybywa jeden sam, także gdy gracz nie gra. Narrator zleca co dzień i co tydzień po pięć zadań (stwory do pokonania, czas wypraw, praca przy Stole rzemieślniczym) z drobnymi nagrodami i skrzynią za komplet; dni zmieniają się o północy czasu polskiego, a tygodnie w nocy z niedzieli na poniedziałek. Spis klas, przedmiotów, potworów i regionów jest w [encyklopedii](https://claude.ai/artifact/EDt6uk8X5rRU9JCTLKsnXw).

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

Push na inną gałąź (poza `art-drafts`) uruchamia testy i wdraża **wersję testową**.

## Wersja testowa

**https://test.insightrpg.com** (zapasowo `wzrost-test` w domenie workers.dev) to ta sama gra z gałęzi roboczej, zanim trafi do `main`. Ma własnego Workera i własną bazę D1 `wzrost-test` (środowisko `test` w `wrangler.jsonc`), więc nic tam nie dotyka gry na insightrpg.com ani jej graczy. Działa tam tylko konto autora, założone wcześniej na hasło: nowych kont nie da się tam zakładać (`REGISTRATION` = `"closed"`), a wersja testowa nie ma logowania Google ani Panelu autora. Konto o loginie z `TEST_LOGINS` ma tam tryb testowy. Nowe części gry są tam włączone wcześniej, np. profesje (`PROFESSIONS` = `"on"`), a w grze na insightrpg.com czekają ukryte, aż będą gotowe.

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

Treść gry (klasy, wygląd postaci, potwory, regiony, przedmioty, afiksy, teksty raportów, kolejność odblokowań, zasoby i budynki obozu, muzyka i dźwięki walki, karty narratora, jego zadania dzienne i tygodniowe) zmienia się w plikach `data/*.json`, bez dotykania kodu. Walidacja sprawdza je przy każdym pushu.

## Praca lokalna

Wymaga Node.js 22 lub nowszego.

```sh
npm ci
npm test           # testy silnika, danych, strony i API na lokalnej bazie D1
npm run validate   # sprawdzenie plików data/ schematami i odwołań między nimi
npm run simulate   # symulacja 10 000 wypraw: omdlenia, XP, złoto i przedmioty na godzinę
npm run progression # postacie od poziomu 1 do 50 na prawdziwych łupach, z obozem
npm run dev        # gra pod http://localhost:8787 z lokalną bazą D1
```

Symulacja przyjmuje też opcje, np. `npm run simulate -- --levels 6,7 --minutes 60,240 --hunts 2000` albo `npm run simulate -- --calibrate` (propozycja stałej krzywej XP). Daje typowej postaci sprzęt, jaki zakłada krzywa, więc nie widzi, że prawdziwy sprzęt jest starszy. To widać w `npm run progression` (`tools/progression/`): po 100 postaci każdej klasy przechodzi grę od poziomu 1 do 50 na prawdziwych łupach, z odpoczynkiem i obozem, także z proponowanymi zmianami danych. Wynik trafia do `checks/progression/` (około 2,5 minuty), a pojedyncze zmiany sprawdza `node tools/progression/variants.mjs 40 baseline lag240`. Umiejętności sprawdzają warianty `skill=0`, `skill=1` i `skill=2` (pierwsza, druga albo trzecia umiejętność klasy), a ich liczby np. `skill=0+sk=fireball:power:1.3/1.9` (para to poziom 1 i 20).

## API

| Metoda | Ścieżka | Opis |
|---|---|---|
| GET | `/api/health` | stan serwera i bazy, czas serwera, wersja; `google` mówi, czy działa logowanie przez Google |
| POST | `/api/auth/register` | rejestracja: `login`, `email`, `password`; wysyła link potwierdzający (`emailSent`), a gra czeka, aż konto go otworzy |
| POST | `/api/auth/login` | logowanie: `identifier` (login lub e-mail), `password` |
| POST | `/api/auth/logout` | wylogowanie |
| GET | `/api/auth/google/start` | przejście do Google; `?mode=link` łączy Google z zalogowanym kontem |
| GET | `/api/auth/google/callback` | powrót z Google: logowanie, nowe konto albo połączenie, potem przejście do `/` albo `/?google=<wynik>` (`created`: nowe konto, `rewarded`: połączenie z Punktami Systemu) |
| GET | `/api/auth/confirm` | link z maila (`?token=`): potwierdza adres, za pierwszym razem z Punktami Systemu, potem przejście do `/?email=<wynik>` |
| POST | `/api/auth/email` | nowy link: `email` (nowy adres, opcjonalnie), dopóki adres nie jest potwierdzony; najwyżej co minutę i 5 na dobę (429) |
| GET | `/api/me` | zalogowany gracz; `google` mówi, czy konto ma połączone Google, `testMode`, czy ma tryb testowy, `emailConfirmed`, czy e-mail jest potwierdzony, a `emailRequired`, czy gra czeka na to potwierdzenie |
| GET | `/api/content` | nazwy klas, wyglądów, statystyk, slotów, rzadkości, żywiołów, regionów i regionów wewnętrznych (z poziomem klasy, który je otwiera, i stworami, które tam czyhają, z ich poziomami: `dangers`, a także skrzynią Bestiariusza ze złotem i Punktami Czasu: `chest`), zakres czasu i nazwy długości wypraw, odblokowania, poziomy ewolucji klas, muzyka i dźwięki walki, wprowadzenie narratora z Punktami Czasu na start; bez logowania |
| GET | `/api/character` | pełny widok postaci z zasobami, Punktami Systemu (`systemPoints`), Punktami Czasu (`timePoints`, a w `timePointsGain` `since` i `minutes`: od kiedy i co ile minut przybywa kolejny), przeczytanymi kartami narratora (`tutorial`, `null` dla postaci sprzed wprowadzenia), pojemnością plecaka, obozem, Stołem rzemieślniczym (`crafting`: poziom, najwyższa rzadkość, szansa na dodatkową część, materiały z poziomem stołu, którego potrzebują, `needs`), stworami spotkanymi w walce (`met`), regionami wewnętrznymi z otwartą skrzynią Bestiariusza (`bestiary`) i zadaniami narratora (`quests`: dla `daily` i `weekly` nazwa, koniec okresu `endsAt`, zadania z tekstem, postępem i nagrodą oraz skrzynia) (404 `no_character`, gdy jej nie ma, a 403 `email_unconfirmed`, gdy konto czeka na potwierdzenie e-maila) |
| POST | `/api/character` | nowa postać: `name`, `classId`, `appearance` (`female` albo `male`); dostaje zapas na start i Punkty Czasu od narratora (409 `name_taken`, gdy imię nosi już inna postać, bez względu na wielkość liter) |
| POST | `/api/character/appearance` | zmiana wyglądu: `appearance`; działa też podczas eksploracji |
| DELETE | `/api/character` | „Zacznij od nowa”: usuwa postać z przedmiotami, raportami, wyprawą, obozem i Punktami Systemu |
| POST | `/api/character/points` | rozdanie punktów: `points`, np. `{ "strength": 2 }` |
| POST | `/api/character/points/auto` | „Rozdaj według klasy” |
| POST | `/api/character/points/reset` | darmowe zerowanie punktów (do poziomu 20) |
| GET | `/api/items/:id/preview` | wartości bojowe teraz i po założeniu (albo zdjęciu) przedmiotu |
| POST | `/api/items/:id/equip` | załóż przedmiot z plecaka |
| POST | `/api/items/:id/unequip` | zdejmij przedmiot do plecaka |
| POST | `/api/items/:id/discard` | wyrzuć przedmiot z plecaka |
| POST | `/api/items/:id/upgrade` | Kowadło: jedna próba ulepszenia przedmiotu o poziom, za złoto i rudę żelaza |
| POST | `/api/items/sell` | złomiarz: sprzedaj przedmioty z plecaka o rzadkości do `maxRarity` włącznie (cena z premią Skupu złomu) |
| POST | `/api/items/:id/salvage` | rozbierz przedmiot z plecaka na Stole rzemieślniczym: znika od razu, a jego części przybędą, gdy skończy się zlecenie; zwraca `salvage` (409 `no_table`, `too_rare`, gdy stół nie bierze jeszcze tej rzadkości, `queue_full`, `equipped`) |
| POST | `/api/craft/materials` | Stół rzemieślniczy: całe stosy materiałów do kolejki, `keys` (np. `["wolf-pelt:common"]`) albo `all: true`; zwraca `ordered` i `skipped`, czyli stosy za rzadkie na poziom stołu (409 `no_table`, `too_rare`, `queue_full`, `no_materials`) |
| POST | `/api/quests/claim` | nagroda za wykonane zadanie narratora: `period` (`daily` albo `weekly`) i `index` zadania; zwraca `reward` (400 `invalid_period`, 404 `no_quest`, 409 `not_done`, `claimed`, `character_changed`) |
| POST | `/api/quests/chest` | skrzynia okresu, gdy wszystkie jego zadania są wykonane: Punkty Czasu i Punkty Systemu, a w tygodniowej też przedmiot do plecaka; zwraca `chest` (409 `not_ready`, `opened`, `bag_full`, `character_changed`) |
| POST | `/api/bestiary/chest` | `{ area }`: skrzynia Bestiariusza regionu wewnętrznego, gdy postać poznała wszystkie stwory z jego listy: złoto, Punkty Czasu i Punkty Systemu, raz; zwraca `chest` (404 `no_area`, 409 `not_ready`, `opened`, `character_changed`) |
| POST | `/api/camp/build` | zacznij budowę następnego poziomu budynku obozu: `buildingId`; naraz jedna budowa; budynek produkcyjny najpierw oddaje zawartość magazynu |
| POST | `/api/camp/collect` | zbierz magazyn budynku produkcyjnego: `buildingId`; zwraca `collected` (409 `nothing_to_collect`, gdy magazyn jest pusty) |
| POST | `/api/camp/cancel` | „Anuluj” budowę czekającą w kolejce: `buildingId` i `level`; koszt wraca w całości (409 `not_queued`) |
| POST | `/api/camp/trade` | duch ognia w Ognisku: złoto za `amount` sztuk `resource` (`wood`, `stone` albo `iron-ore`), do limitu sztuk na dzień według poziomu Ogniska (400 `invalid_amount`; 409 `not_built`, `no_trades`, `not_enough`) |
| POST | `/api/camp/buy` | lada złomiarza w Skupie złomu: `count` (1 albo 10) części `partId` za złoto, rzadkości i ceny według poziomu skupu; zwraca `bought` (400 `invalid_part`, `invalid_count`; 409 `not_built`, `not_sold`, `not_enough`) |
| GET | `/api/hunts/options` | poziom zagrożenia dla każdego czasu w otwartym regionie wewnętrznym dla poziomu postaci (`threat`, a `threatAvoiding` bez elit i czempiona); `?area=<id>` liczy jeden wybrany region wewnętrzny |
| POST | `/api/hunts` | wyrusz na eksplorację: `areaId` (otwarty region wewnętrzny), `minutes` (1, potem co 5 minut: do 30, od poziomu 25 do 60, od 35 do 120, od 50 do 240), `avoidRare` (`true`: postać nie spotyka elit ani czempionów) |
| POST | `/api/hunts/cancel` | przerwij trwającą eksplorację, zbieranie albo warzenie; przerwane warzenie zwraca `report` gotowych mikstur (`null`, gdy żadna nie była gotowa), a zioła na resztę wracają do plecaka |
| POST | `/api/hunts/claim` | odbierz raport zakończonej eksploracji, zbierania albo warzenia |
| POST | `/api/professions/gather` | tylko z profesjami (`PROFESSIONS` = `"on"`): Zielarstwo, `herbs` (znane zioła, naraz tyle, ile pozwala poziom) i `minutes` (10–480 co 10) (400 `invalid_herbs`, `too_many_herbs`, `unknown_herb`, `invalid_duration`; 403 `locked`) |
| POST | `/api/herbs/sell` | złomiarz kupuje `count` sztuk zioła `herbId`; zwraca `sold` (400 `unknown_herb`, `invalid_count`; 404 `no_herb`) |
| POST | `/api/herbs/discard` | wyrzuć `count` sztuk zioła `herbId` |
| POST | `/api/professions/brew` | tylko z profesjami: Alchemia, `recipe` (znany przepis) i `count` mikstur, do 8 godzin i tylu, na ile starcza ziół; zioła idą do kotła od razu (400 `unknown_recipe`, `invalid_count`; 403 `locked`; 409 `no_herbs`, `conflict`) |
| POST | `/api/potions/sell` | złomiarz kupuje `count` mikstur `potionId`; zwraca `sold` (400 `unknown_potion`, `invalid_count`; 404 `no_potion`) |
| POST | `/api/potions/discard` | wyrzuć `count` mikstur `potionId` |
| GET | `/api/reports` | 50 ostatnich raportów (Dziennik); starsze usuwa odbiór kolejnego |
| GET | `/api/reports/:id` | pełny raport |
| POST | `/api/time/skip` | „Przewiń”: `target` (`activity`, `rest` albo `build`); 1 Punkt Czasu za minutę, przy za małej liczbie punktów skraca o tyle minut, ile ich jest; zwraca `spent` (409 `no_time_points`, `nothing_to_skip`, `busy`) |
| GET | `/api/push/key` | klucz publiczny serwera do subskrypcji powiadomień na telefon |
| POST | `/api/push/subscribe` | subskrypcja powiadomień tego telefonu, tak jak podaje ją `PushSubscription.toJSON()`; przechodzi na zalogowane konto (400 `invalid_subscription`, gdy adres nie prowadzi do usługi push przeglądarki) |
| POST | `/api/push/unsubscribe` | wyłączenie powiadomień: `endpoint` subskrypcji |
| POST | `/api/tutorial` | kwestia narratora przeczytana, karta albo wskazanie: `card` (jej id), albo `skip: true` dla „Pomiń wprowadzenie”, które robi za gracza pierwsze kroki: wyprawę przewiniętą Punktami Czasu, jej raport i Ognisko (`firstSteps`; 409 `no_tutorial` dla postaci sprzed wprowadzenia) |
| POST | `/api/test/skip-time` | tylko w trybie testowym i dla kont z `TEST_LOGINS`: kończy od razu wyprawę albo odpoczynek („Pomiń czas”) |
| POST | `/api/test/skip-build` | tylko w trybie testowym i dla kont z `TEST_LOGINS`: kończy od razu budowę w obozie, a gdy nic się nie buduje, zapełnia magazyny |
| POST | `/api/test/skip-craft` | tylko w trybie testowym i dla kont z `TEST_LOGINS`: kończy od razu wszystkie zlecenia Stołu rzemieślniczego |

Błędy mają postać `{ "error": { "code": "…", "message": "…" } }`, gdzie `message` jest po polsku.

## Powiadomienia na telefon

Gracz włącza je w Ustawieniach („Powiadomienia”). Przychodzą przy końcu wyprawy, końcu budowy i pełnym magazynie, a treści są w `data/texts.json` (`push…`). Co minutę Worker uruchamia się sam (`triggers` w `wrangler.jsonc`), sprawdza minutę, która minęła, i wysyła wiadomości przez Web Push do usług push przeglądarek. Nie trzeba zakładać żadnego sekretu: klucze, którymi serwer podpisuje wiadomości, powstają przy pierwszym użyciu i leżą w bazie D1. Na iPhonie powiadomienia działają tylko w grze dodanej do ekranu początkowego. Zasady są w `DECISIONS.md`, w części „Powiadomienia na telefon, Jezioro Midasa, osłona many i muzyka zakładek”.

Lokalnie wysyłkę uruchamia się ręcznie: `npx wrangler dev --test-scheduled`, a potem `curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=*+*+*+*+*&time=<czas w ms>"`.

## Logowanie przez Google

Na ekranie startowym jest „Zaloguj się przez Google”, a w Ustawieniach „Połącz z Google”. Oba przyciski pojawiają się dopiero wtedy, gdy Worker ma klucze klienta Google. Klucze są w sekretach repozytorium `GOOGLE_CLIENT_ID` i `GOOGLE_CLIENT_SECRET`, a wdrożenie przekazuje je Workerowi. Klienta zakłada się w Google Cloud Console (Google Auth Platform → Clients, typ „Web application”) z adresami powrotu:

- `https://insightrpg.com/api/auth/google/callback`
- `https://www.insightrpg.com/api/auth/google/callback`

Te adresy wymienia `GOOGLE_HOSTS` w `wrangler.jsonc`. Zasady łączenia kont są w `DECISIONS.md`, w części „Logowanie przez Google”. Lokalnie logowanie Google wymaga własnego klienta z adresem `http://localhost:8787/api/auth/google/callback` i uruchomienia `npx wrangler dev --local-upstream localhost:8787 --var GOOGLE_HOSTS: --var GOOGLE_CLIENT_ID:… --var GOOGLE_CLIENT_SECRET:…`. Bez `--local-upstream` Worker widzi adres `insightrpg.com` zamiast `localhost`.

## Potwierdzanie e-maila

Konto zakładane loginem i hasłem musi podać e-mail. Serwer wysyła na niego link przez Cloudflare Email Service (wiązanie `EMAIL`, czyli `send_email` w `wrangler.jsonc`, nadawca `no-reply@insightrpg.com`), a gra otwiera się dopiero po kliknięciu linku. Konta sprzed tej zmiany grają dalej, a dopóki nie potwierdzą adresu, widzą pergamin z zachętą: 10 Punktów Systemu za potwierdzenie (`balance.account.emailSystemPoints`). Konto Google liczy się jako potwierdzone i dostaje te same Punkty Systemu, raz na konto: nowe przy założeniu, a istniejące przy połączeniu z Google. Treść maila jest w `data/texts.json` (`emailConfirm…`), a zasady w `DECISIONS.md`, w części „Potwierdzanie e-maila”. Domena insightrpg.com jest włączona w panelu Cloudflare: Compute → Email Service → Email Sending.

Lokalnie mail nie wychodzi: `npx wrangler dev` wypisuje go w konsoli i zapisuje w pliku, którego ścieżkę podaje. Link z takiego maila prowadzi do `insightrpg.com`, chyba że serwer działa z `--local-upstream localhost:8787`.

## Tryb testowy

Dopóki grę testujemy, `TEST_MODE` w `wrangler.jsonc` ma wartość `"on"`, a zakładka Walka ma przycisk „Pomiń czas”. Kończy on od razu trwającą wyprawę, bez zmiany wyniku, albo odpoczynek. W grze tryb testowy mają tylko konta z `TEST_LOGINS` (dziś konto autora), a reszta graczy go nie widzi. Testy i `npm run dev` dają go każdemu kontu. Przełącznik „Tryb testowy” w Ustawieniach chowa i pokazuje ten przycisk w danej przeglądarce. Po testach wystarczy ustawić `"off"` i wdrożyć.

## Grafiki

Sprite'y stworów (48×48) i przedmiotów (32×32) powstają w generatorze pixel-artu [Retro Diffusion](https://www.retrodiffusion.ai). Opisy, style i rozmiary są w `art/prompts.json`. Generowanie uruchamia się ręcznie:

1. Na github.com otwórz repozytorium, zakładkę **Actions** i przebieg **Grafiki (szkice)**.
2. Stuknij **Run workflow**, wybierz rodzaj (np. `monsters`, `items`, `materials` albo `camp`), wpisz identyfikatory po przecinku albo `all` i limit dolarów, a potem stuknij zielone **Run workflow**.
3. Szkice z przezroczystym tłem trafią na gałąź `art-drafts`, do folderu `art/drafts/`. Podsumowanie przebiegu podaje koszt i stan salda.

Przebieg potrzebuje sekretu repozytorium `RETRO_DIFFUSION_API_KEY` z kluczem API Retro Diffusion. Skrypt najpierw darmowo wycenia każde zapytanie i nie wydaje więcej niż limit. Zatwierdzone sprite'y trafiają do `src/client/art/` i na listę w `src/client/art.js`, a wzorce stylu dla kolejnych do `art/references/`. Gdy pod stworem albo przedmiotem zostaje kafel podłoża, przed wstawieniem do gry trzeba go wyciąć (zob. `DECISIONS.md`, „Drabinka eksploracji i lochy”, punkt 7). Budynki obozu mają po trzy wyglądy (poziomy 1–3, 4–7 i 8–10): pojedynczy budynek bez tła, przycięty do swojego obrysu, w `src/client/art/camp/<budynek>-<wygląd>.png`, na liście `camp` w `src/client/art.js`. Na planszy wygląd rośnie z poziomem (64%, 82% i 100% placu); wygląd bez obrazka zostaje rysunkiem wektorowym z `src/client/camp-art.js`. Nowe portrety klas wyrównuje do jednej wielkości postaci `python3 tools/normalize-portraits.py src/client/art/portraits/*.png` (Python z Pillow). Narzędzie wypisuje też, gdzie leży twarz każdej postaci: te liczby trzeba wpisać do `faces` w `src/client/art.js`, żeby popiersia stały twarzą na środku.

## Muzyka i dźwięki

Muzyka w tle jest w `src/client/audio/music/`, a `data/music.json` mówi, który utwór gra domyślnie, a który w danym miejscu (`places`: id regionu, regionu wewnętrznego, `camp` albo zakładki: `skills` to Umiejętności, `professions` to Profesje). Raport otwarty zaraz po wyprawie gra raz utwór swojego wyniku (`reports`: `success` dla wygranej, `fainted` dla omdlenia, `escaped` dla ucieczki), a ten sam raport z Dziennika zwykłą muzykę. Zmiana utworu wycisza jeden i pogłaśnia drugi (`switchSeconds`), a utwór, który wraca, gra od miejsca, w którym ucichł. Utwór cichnie przez ostatnie 5 sekund i po krótkiej pauzie gra od nowa. Kolejny utwór dodaje się tak:

1. Wgraj plik MP3 do `src/client/audio/music/` (nazwa małymi literami, z myślnikami).
2. Dopisz go do `tracks` w `data/music.json`, a miejsce i id utworu do `places` (albo wynik wyprawy do `reports`).
3. `npm run validate` sprawdzi, że plik i miejsce istnieją.

Ciosy, uniki i upadki w walce to nagrania z paczek Kenney (CC0) w `src/client/audio/sfx/`, przypisane w `data/sounds.json` do rodzajów broni i ataków potworów (pole `sound` w `data/item-bases.json` i `data/monsters.json`). Przerabia je dla głośnika telefonu `tools/build-sfx.py` (Python i ffmpeg). Głosy stworów i postaci przy trafieniu i pokonaniu (`voices`) oraz nagrania dźwięków wołanych po nazwie (`effects`, np. `tab`: zmiana zakładki, `swing`: zamach) pochodzą z generatora ElevenLabs. Nagrywa je przebieg **Dźwięki (szkice)**:

1. Na github.com otwórz repozytorium, zakładkę **Actions** i przebieg **Dźwięki (szkice)**.
2. Stuknij **Run workflow**, wybierz rodzaj (`voices`, `effects` albo `ui`), wpisz identyfikatory po przecinku albo `all` i limit kredytów, a potem stuknij zielone **Run workflow**.
3. Szkice trafią na gałąź `art-drafts`, do folderu `audio/drafts/`.

Przebieg potrzebuje sekretu repozytorium `ELEVENLABS_API_KEY`. Opisy dźwięków są w `audio/prompts.json`; dźwięk trwa tyle, ile podaje `seconds`, i kosztuje 20 kredytów na sekundę. Kolejny przebieg czeka, aż skończy się poprzedni, ale GitHub trzyma w kolejce tylko jeden czekający, więc trzeci uruchomiony od razu anuluje drugi. Wybrane szkice przerabia dla telefonu `tools/build-drafts.py` (Python z numpy i ffmpeg): przycina je od pierwszego dźwięku do wybrzmienia, wycina bas, którego telefon nie gra, i wyrównuje głośność. Poziom w grze ustawia `gain` w `data/sounds.json`.
