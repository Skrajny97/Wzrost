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

Na razie silnik działa tylko na serwerze (DECISIONS.md, Etap 1, punkt 28). Każde wywołanie musi zmieścić się w limicie 10 ms CPU.
