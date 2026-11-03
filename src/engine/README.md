# Silnik

Silnik gry to deterministyczne, czyste funkcje: ten sam stan, czas i ziarno losowości zawsze dają ten sam wynik. Silnik nie woła `Date.now()`, `Math.random()`, sieci ani bazy, bo czas i ziarno podaje serwer. Wszystkie liczby bierze z `data/balance.json`, a teksty z `data/texts.json`.

| Plik | Co robi |
|---|---|
| `rng.js` | losowość z ziarnem (sfc32) |
| `content.js` | zamienia pliki z `data/` na słowniki używane przez silnik, w tym regiony wewnętrzne z cechą i elitą regionu |
| `formulas.js` | wspólne wzory, m.in. malejący zwrot P / (P + K) |
| `stats.js` | statystyki i ich źródła, wolne punkty, „Rozdaj według klasy” |
| `items.js` | przedmioty: budżet, afiksy, nazwy, klasy, cena u złomiarza, zakładanie do pustych slotów |
| `combatant.js` | postać i potwór w tej samej postaci do walki |
| `combat.js` | automatyczna walka do trzech na trzech |
| `hunt.js` | eksploracja w regionie wewnętrznym: tempo walk, poziomy potworów z miejsca, spotkania zwykłe, wymagające i elita, znaleziska (także puste), odpoczynek, omdlenie, raport |
| `progression.js` | doświadczenie, poziomy, poziom noszonego ekwipunku, kara za omdlenie, regeneracja HP |
| `threat.js` | poziom zagrożenia przed wyprawą |
| `preview.js` | wartości bojowe i skutek jednego punktu statystyki |
| `unlocks.js` | kolejność odblokowań samouczka, długości wypraw i regiony wewnętrzne otwierane poziomem klasy |
| `camp.js` | obóz: poziomy budynków w czasie, koszty i czasy budowy, premie (odpoczynek, plecak, ceny złomiarza), magazyny budynków produkcyjnych i zbieranie |
| `exchange.js`, `fire.js`, `shop.js` | wymiana zasobów przy Stole rozbiórki, duch Ogniska (złoto na zasoby) i lada Skupu złomu (części za złoto) |
| `builder-spirit.js` | duch budowniczego przy Kamieniu węgielnym: skup zasobów obozu za złoto i to, czego budowy obozu jeszcze potrzebują |
| `skills.js`, `evolutions.js`, `skill-demo.js` | umiejętności klas, ewolucje klas i podgląd animacji umiejętności dla autora |
| `potions.js` | mikstury na wyprawach: kiedy postać je pije |
| `professions.js`, `brewing.js`, `workshop.js`, `crafting.js` | profesje: Zielarstwo, Alchemia, Rzemieślnictwo oraz materiały i Stół rozbiórki |
| `encyclopedia.js` | Encyklopedia: co postać już zdobyła, w zakładkach i Tierach |
| `events.js` | zdarzenia na koniec wyprawy |
| `quests.js` | zadania dzienne i tygodniowe narratora |
| `settlement.js`, `companions.js`, `market.js` | Osada: reputacja, relacje, Tablica zleceń, usługi mieszkańców, towarzysze i Targowisko |
| `stable.js` | Stajnia w Osadzie: wierzchowce kupowane na stałe, po kolei, i krótsze czekanie na koniec wyprawy |
| `casino.js` | Salon Gier w Osadzie: Loteria (los na dobę, pula i losowanie zwycięzcy) i Koło Fortuny (szansa ze stawki, dzienna pula nagród postaci i jej wartość) |
| `tannery.js` | Garbarnia w Osadzie: skóry, które garbarz skupuje i sprzedaje |
| `forge.js` | Kuźnia w Osadzie: Zwoje ochronne i przekucie przedmiotu na wyższą rzadkość |
| `parties.js` | Drużyna: rozpiętość poziomów klas i kto zostaje w drużynie, gdy poziomy się rozjadą |
| `towers.js` | Wieże Systemu: podwaliny, jeszcze poza grą |
| `guild-beast.js`, `guild-trials.js` | Gildia: Bestia Gildii oraz Próby Gildii (tablica prób tygodnia, wielkość próby na poziom postaci, pasek z progami i skrzynie) |
| `cosmetics.js` | Sklep Systemu: ramki, tła i wygląd wierzchowca za Punkty Systemu, co postać ma i nosi, oraz kolor imienia z ramki |
| `gifts.js`, `gift-codes.js` | Upominek między znajomymi i kody podarunkowe |
| `names.js`, `text.js`, `mail.js`, `notifications.js` | filtr imion postaci, warianty tekstów raportu, treść e-maila i powiadomienia na telefon |

Silnik działa tylko na serwerze (DECISIONS.md, Etap 1, punkt 28). Gra jest na planie Workers Paid (do 30 s CPU na żądanie), ale każde wywołanie ma być szybkie: liczy się każde żądanie gracza.
