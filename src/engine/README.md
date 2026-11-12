# Silnik

Silnik gry to deterministyczne, czyste funkcje: ten sam stan, czas i ziarno losowości zawsze dają ten sam wynik. Silnik nie woła `Date.now()`, `Math.random()`, sieci ani bazy, bo czas i ziarno podaje serwer. Wszystkie liczby bierze z `data/balance.json`, a teksty z `data/texts.json`.

| Plik | Co robi |
|---|---|
| `rng.js` | losowość z ziarnem (sfc32) |
| `content.js` | zamienia pliki z `data/` na słowniki używane przez silnik, w tym regiony wewnętrzne z cechą i elitą regionu |
| `overlay.js` | nakłada angielskie teksty z `data/en/` na dane, po identyfikatorach; brak tłumaczenia zostawia polski |
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
| `camp.js` | obóz: poziomy budynków w czasie, koszty i czasy budowy, premie (odpoczynek, plecak, ceny złomiarza), magazyny budynków produkcyjnych, zbieranie i całe zapełnienia magazynów, które zbiera Zbieracz Systemu |
| `exchange.js`, `fire.js`, `shop.js` | wymiana zasobów przy Stole rozbiórki, duch Ogniska (złoto na zasoby) i lada Skupu złomu (części za złoto) |
| `builder-spirit.js` | duch budowniczego przy Kamieniu węgielnym: skup zasobów obozu za złoto i to, czego budowy obozu jeszcze potrzebują |
| `skills.js`, `evolutions.js`, `skill-demo.js` | umiejętności klas, ewolucje klas i podgląd animacji umiejętności dla autora |
| `potions.js` | mikstury na wyprawach: kiedy postać je pije |
| `professions.js`, `brewing.js`, `workshop.js`, `crafting.js` | profesje: Zielarstwo, Alchemia, Rzemieślnictwo oraz materiały i Stół rozbiórki |
| `encyclopedia.js` | Encyklopedia: co postać już zdobyła, w zakładkach i Tierach |
| `events.js` | zdarzenia na koniec wyprawy |
| `party-events.js` | zdarzenia drużynowe na koniec wyprawy drużyny: losowanie z ziarna wyprawy, opcje lidera, wynik dla każdego na jego poziomie, jedna walka całej drużyny, premia drużyny na następną wyprawę i raport członka |
| `quests.js` | zadania dzienne i tygodniowe narratora |
| `settlement.js`, `companions.js`, `market.js` | Osada: reputacja, relacje, Tablica zleceń, usługi mieszkańców, towarzysze i Targowisko |
| `stable.js` | Stajnia w Osadzie: wierzchowce kupowane na stałe, po kolei, i krótsze czekanie na koniec wyprawy |
| `casino.js` | Salon Gier w Osadzie: Loteria (los na dobę, pula i losowanie zwycięzcy) i Koło Fortuny (szansa ze stawki, dzienna pula nagród postaci i jej wartość) |
| `tannery.js` | Garbarnia w Osadzie: skóry, które garbarz skupuje i sprzedaje |
| `resident-gifts.js` | podarunki dla mieszkańców Osady (raz dziennie to, co lubią, albo złoto, za relację; rzadsza sztuka daje więcej) i cotygodniowy podarek od mieszkańca z relacją Przyjaciel |
| `forge.js` | Kuźnia w Osadzie: Zwoje ochronne i przekucie przedmiotu na wyższą rzadkość |
| `parties.js` | Drużyna: rozpiętość poziomów klas i kto zostaje w drużynie, gdy poziomy się rozjadą |
| `towers.js` | Wieże Systemu: podwaliny, jeszcze poza grą |
| `labyrinth.js` | Labirynt Systemu: mapa dnia (ta sama dla wszystkich), komnaty i ich drogi, stwory z krain do poziomu postaci, siła poziomów (Piekielny dwa razy mocniejszy niż 3.), walka z HP przenoszonym między komnatami, źródło, ołtarz, kupiec, błogosławieństwa w walkach i nagrody |
| `core.js` | Rdzeń i Artefakty: gniazda z poziomu postaci, rozmiary, cechy żywiołów i zdolności dużych Artefaktów, ich liczby z rzadkością, ulepszeniem i klejnotem, rezonans, Odłamki z rozbicia i rozpuszczenia, oraz to, co cały Rdzeń daje statystykom i walkom postaci |
| `pvp-arena.js` | Arena w Osadzie (walki z postaciami innych graczy): pojedynek dwóch postaci z limitem ruchów, remisem, mnożnikiem HP i częścią pancerza, ocena jak w szachach, losowanie rywali (też ponowne, „Losuj innych”), walki dnia i losowania dnia, przebieg obrony oglądany ze strony obrońcy, sezon i nagrody tabeli tygodnia |
| `guild-beast.js`, `guild-trials.js`, `guild-seat.js`, `guild-expedition.js` | Gildia: Bestia Gildii, Próby Gildii (tablica prób tygodnia, wielkość próby na poziom postaci, pasek z progami i skrzynie), Siedziba Gildii (koszty poziomów budynków, poziom z sumy wpłat z nadwyżką na następny poziom, premie dla członków) oraz Wyprawa Gildii (kraina tygodnia, siedmiu strażników, minuty etapu, HP strażnika, postęp trasy z odłożonymi minutami i skrzynie strażników) |
| `guild-wars.js` | Wojny gildii: tydzień wojny z bitwami o 20:00, drużyny z pełnych piątek członków i rezerwa na wolnych miejscach, pary drużyn w bitwach wieczoru (795 B), losowanie rywali o podobnej liczbie członków, bitwa 5 na 5 jak na Arenie, wynik wojny, nagroda za wygraną bitwę, skrzynia wojenna i lustrzana gildia wersji testowej |
| `cosmetics.js` | Sklep Systemu: ramki, tła i wygląd wierzchowca za Punkty Systemu, co postać ma i nosi, oraz kolor imienia z ramki |
| `gifts.js`, `gift-codes.js` | Upominek między znajomymi i kody podarunkowe |
| `account-chest.js` | towary Skrzyni Konta: ich rodzaje, które sztuki wyjmuje postać (najpierw swoje, potem innych postaci) i ile z nich Encyklopedia liczy jak sztuki z wymiany |
| `names.js`, `text.js`, `mail.js`, `notifications.js` | filtr imion postaci, warianty tekstów raportu i własne teksty silnika w języku treści (`word()`: angielski z `data/en/strings.json`, który serwer daje razem z treścią), treść e-maila i powiadomienia na telefon |
| `mentions.js` | oznaczanie na czacie: miejsca, w których „@” może zaczynać imię postaci, i wybór najdłuższego imienia, które ma jakaś postać |
| `weeks.js` | tygodnie roku: numer tygodnia ISO według czasu polskiego (53. bierze wpis 52.), skutki tygodnia jako mnożniki dla walk, profesji, obozu, odpoczynku, Kowadła i reputacji, słowa skutków i linijka raportu |

Silnik działa tylko na serwerze (DECISIONS.md, Etap 1, punkt 28). Gra jest na planie Workers Paid (do 30 s CPU na żądanie), ale każde wywołanie ma być szybkie: liczy się każde żądanie gracza.
