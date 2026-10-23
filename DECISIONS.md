# Rejestr założeń

Tu zapisujemy decyzje, których nie rozstrzyga [dokument projektowy](https://claude.ai/artifact/9jPtkYkTJ67d3akFB8imGX). Wybieramy wtedy najprostsze rozwiązanie zgodne z filarami gry. Zmianę decyzji z dokumentu proponujemy autorowi jako pytanie.

## Odpowiedzi autora na otwarte kwestie (23.10.2026)

1. **Maksymalny czas polowania: 4 godziny**, z myślą o krótkim AFK. Minimum zostaje 5 minut, jak w przykładzie z dokumentu.
2. **Wolne punkty statystyk.** Każdy poziom postaci daje tyle wolnych punktów, ile jest statystyk (dziś 8). Każdy poziom klasy daje ¼ tej liczby (dziś 2).
3. **Rodzaje obrażeń.** Są trzy rodzaje obrażeń:
   - fizyczne: broń, kły, pazury, upadki,
   - magiczne: każde ma żywioł,
   - okresowe: zadawane co turę przez kilka tur, każde ma żywioł (zatrucie, oparzenie, wychłodzenie).

   Żywioły to ogień, mróz, woda, elektryczność, ziemia, natura, trucizna i sakrum. Sakrum to żywioł Kleryka: święta moc, z której pochodzi też leczenie. Światła i cienia nie ma. Jedno trafienie może zadać obrażenia i dodatkowo nałożyć efekt okresowy. Przykład: ukąszenie żmii zadaje obrażenia fizyczne i może wywołać zatrucie.
4. **Obrona przed obrażeniami (założenie Claude).** Pancerz zmniejsza obrażenia fizyczne. Odporność na żywioł zmniejsza obrażenia magiczne i okresowe tego żywiołu. Wola zmniejsza szansę, że efekt okresowy się nałoży. Wszystkie trzy działają według wzoru z malejącym zwrotem z dokumentu.

## Etap 0 — konfiguracja (22.10.2026)

1. **Nazwa Workera i adres.** Worker nazywa się `wzrost`, tak jak repozytorium, więc gra działa pod `https://wzrost.<subdomena>.workers.dev`. Ekran logowania pokazuje „Wzrost” jako nazwę roboczą, dopóki nie wybierzemy nazwy gry.
2. **Wdrażanie przez GitHub Actions, nie Cloudflare Workers Builds.** Testy blokują wdrożenie, a logi są w GitHubie, gdzie widzą je też kolejne sesje budowania. Potrzebne są sekrety `CLOUDFLARE_API_TOKEN` i `CLOUDFLARE_ACCOUNT_ID`. Bez nich workflow pomija wdrożenie z ostrzeżeniem, a testy działają dalej.
3. **Zasoby Cloudflare zakłada workflow.** Skrypt `tools/prepare-cloudflare.mjs` tworzy bazę D1 `wzrost` w lokalizacji `eeur` (Europa Wschodnia, najbliżej graczy w Polsce). Zakłada też subdomenę workers.dev, jeśli konto jej nie ma. Identyfikatora bazy nie trzymamy w repozytorium: `wrangler.jsonc` ma identyfikator zastępczy, który workflow podmienia przy wdrożeniu.
4. **Konto.** Rejestracja wymaga loginu i hasła. Login ma 3–24 znaki: litery bez polskich znaków, cyfry oraz `_ . -`, bez rozróżniania wielkości liter. Hasło ma 8–128 znaków. E-mail jest opcjonalny i na razie służy tylko do logowania zamiast loginu. Nie weryfikujemy go, a odzyskiwania hasła jeszcze nie ma. Rejestracja jest otwarta dla każdego, kto zna adres gry.
5. **Haszowanie haseł.** Używamy PBKDF2-SHA-256 z Web Crypto, z 30 000 iteracji i 16-bajtową solą. 100 000 iteracji, czyli maksimum w Workers, zajmuje ok. 17 ms CPU, a darmowy plan daje 10 ms na żądanie. 30 000 iteracji to ok. 5 ms. Hash zapisuje swoje parametry, więc po przejściu na płatny plan podniesiemy liczbę iteracji, a stare hasła przeliczą się same przy logowaniu.
6. **Sesje.** Ciasteczko `__Host-sid` (HttpOnly, Secure, SameSite=Lax) zawiera losowy 32-bajtowy token, a baza przechowuje tylko jego skrót SHA-256. Sesja trwa 30 dni. Gdy zostanie mniej niż 15 dni, przedłuża się do pełnych 30. Wylogowanie usuwa sesję z bazy.
7. **Ochrona logowania.** Po 10 nieudanych próbach dla jednego loginu lub e-maila w ciągu 15 minut logowanie jest zablokowane do końca tego okna (HTTP 429). Żądania zmieniające stan muszą wysyłać JSON i nie mogą pochodzić z innej domeny (sprawdzamy nagłówek Origin).
8. **Błędy API.** Każdy błąd ma postać `{ "error": { "code", "message" } }`. Kod jest po angielsku dla programu, a komunikat po polsku do pokazania graczowi.
9. **Czas.** Wszystkie czasy zapisujemy jako milisekundy od epoki Unix według zegara serwera. Klient pokazuje czas serwera z poprawką na opóźnienie sieci, bo timery rozstrzyga serwer.
10. **Konto to nie postać.** Tabela `users` przechowuje tylko konta. Postacie gracza i towarzyszy, o tej samej strukturze danych, oraz warstwa kosmetyczna dostaną własne tabele w kolejnych etapach.
11. **Strona bez kroku budowania.** Pliki strony leżą w `src/client` i są serwowane jako statyczne pliki Workers. Gdy w etapie 1 klient będzie potrzebował modułów z `src/engine` albo plików z `data/`, wybierzemy najprostsze rozwiązanie, na przykład kopiowanie plików przy wdrożeniu.
12. **Nagłówki bezpieczeństwa.** Plik `src/client/_headers` ustawia między innymi Content-Security-Policy: skrypty tylko z własnej domeny, czcionki tylko z Google Fonts.
13. **Czcionki.** Alegreya i Chakra Petch ładujemy z Google Fonts, tak jak w makiecie. Własny hosting czcionek możemy dodać później.
14. **Testy.** Używamy wbudowanego `node:test`. Testy API uruchamiają Workera w lokalnym środowisku Cloudflare z bazą D1 (harness z pakietu wrangler) i stosują prawdziwe migracje. Do struktury z dokumentu doszedł katalog `test/`.
15. **Wersja gry.** Workflow przekazuje skrót commita jako `APP_VERSION`, a strona go pokazuje. Dzięki temu na telefonie widać, która wersja działa.
16. **Token z minimalnymi uprawnieniami.** Token Cloudflare ma tylko Workers Scripts: Edit, D1: Edit i Account Settings: Read. Tworzy się go linkiem z gotowymi uprawnieniami (README), bo wybieranie uprawnień z list na telefonie okazało się zawodne. To mniej niż szablon „Edit Cloudflare Workers”, więc wyciek tokenu daje mniej możliwości.
17. **Adres gry.** Konto nie miało subdomeny workers.dev, więc workflow założył `wzrost.workers.dev`. Gra działa pod `https://wzrost.wzrost.workers.dev`. Zmiana subdomeny w panelu Cloudflare zmieniłaby ten adres.

## Etap 1 — rdzeń (23.10.2026)

### Postać

1. **Jedna postać na konto.** Postać ma rolę `player`. Towarzysze dostaną w Etapie 5 tę samą tabelę i strukturę z inną rolą. Imię ma 2–20 liter i może zawierać spacje, myślniki i apostrofy. Imiona nie muszą być unikalne.
2. **Klasy.** Statystyki startowe, przyrost na poziom klasy i proporcje „Rozdaj według klasy” są w `data/classes.json`. Wojownik i Kleryk mają oznaczenie „łagodniejszy start”. Kleryk lepiej odpoczywa między walkami (+7% brakującego HP i +0,2% za punkt Mądrości), bo dokument mówi, że klasy wspierające zmniejszają spadek HP między walkami.
3. **Pozycja w walce wynika z klasy:** Wojownik walczy z przodu, Kleryk i Cień ze środka, Łucznik i Mag z tyłu. Wybór pozycji dojdzie razem z drużyną.
4. **Ekwipunek startowy** to pełny zestaw pospolitych przedmiotów poziomu 1, dobrany do klasy. Wojownik dostaje na przykład miecz, tarczę, kolczugę, hełm, rękawice i buty. Kostur Maga ma żywioł ognia, a kropidło Kleryka sakrum. *Nieaktualne: zob. „Uwagi autora po Etapie 1”, punkt 1.*
5. **Działanie statystyk w walce** (stałe w `data/balance.json`):
   - Siła, Zręczność i Intelekt dają +3% obrażeń za punkt broni, która z nich korzysta: miecz i topór Siły, sztylet i łuk Zręczności, kostur i kropidło Intelektu.
   - Zręczność daje też unik i szybkość.
   - Witalność daje maksymalne HP i szybszą regenerację.
   - Wytrzymałość daje pancerz.
   - Mądrość daje manę, a Klerykowi lepszy odpoczynek.
   - Percepcja daje trafienia krytyczne.
   - Wola zmniejsza szansę nałożenia efektu okresowego.

   Mana jest widoczna, ale zacznie działać razem z umiejętnościami w Etapie 3.
6. **Wolne punkty.** Pojawiają się od poziomu 2, zgodnie z tabelą odblokowań. Punkty dodane przyciskiem „+” trafiają na serwer dopiero po „Zatwierdź”, więc pomyłkę cofa „Cofnij”. Zerowanie jest darmowe do poziomu 10 włącznie.
7. **Skutek statystyki w liczbach.** Dotknięcie statystyki pokazuje, co da jeden punkt więcej tej konkretnej postaci, np. „maks. HP +5” albo „unik +0,61%”. Szanse i redukcję liczymy wobec przeciwnika na poziomie postaci.

### Walka

8. **Malejący zwrot** według wzoru z dokumentu, z K = 40 + 20 × poziom przeciwnika. Unik ma sufit 30%, krytyk 50%, a Wola zmniejsza szansę nałożenia efektu najwyżej o 60%. Krytyk zadaje 150% obrażeń.
9. **Unik działa tylko na ataki fizyczne.** Magii nie da się uniknąć ani zatrzymać pancerzem. Chroni przed nią odporność na jej żywioł.
10. **Inicjatywa.** Czas do ruchu to 100 podzielone przez szybkość. Szybkość rośnie ze Zręcznością od 1 do najwyżej 3, z malejącym zwrotem. Jedna postać wykonuje najwyżej 3 ruchy z rzędu.
11. **Grupy przeciwników.** W grupie dwóch potworów każdy ma 70% HP i obrażeń pojedynczego, a w grupie trzech 55%. Dwa wilki są więc groźniejsze niż jeden, ale nie dwa razy.
12. **Limit walki.** Walka trwa najwyżej 300 ruchów. Potem postać się wycofuje i wyprawa kończy się odwrotem bez kary.

### Polowania

13. **Długość.** Na poziomie 1 można wybrać 5, 15 lub 30 minut, bo tabela odblokowań daje na start „krótkie polowania”. Od poziomu 2 dochodzą 1, 2 i 4 godziny. *Nieaktualne: zob. „Uwagi autora po Etapie 1”, punkt 20.*
14. **Przebieg.** Średnio jedna walka przypada na 12 minut, a jedno znalezisko na 30 minut, rozłożone losowo w czasie wyprawy. Znalezisko to w 65% przypadków złoto, a w pozostałych przedmiot. *Nieaktualne: zob. „Uwagi autora po Etapie 1”, punkt 8.*
15. **HP.** Po wygranej walce postać odzyskuje 30% brakującego HP, do tego dochodzą premie klasy i regionu. Między wyprawami HP wraca w tempie ok. 2% maksimum na minutę, a Witalność to przyspiesza. Odpoczynek liczy się od końca wyprawy, nie od odbioru raportu.
16. **Poziom potworów** to poziom postaci ±1, w granicach regionu. W Wiatrołomach potwory mają zawsze poziom postaci, bo to region samouczka.
17. **Lokalna elita** to Błędnica w Wiatrołomach i Licho w Uroczysku Kamieni. Pojawia się w ok. 0,6% walk, ma poziom o jeden wyższy, daje potrójne XP i złoto oraz zawsze przedmiot z większą szansą na wysoką rzadkość. W bezpiecznym regionie przegrana z elitą kończy się odwrotem bez kary.
18. **Omdlenie.** Przegrana walka kończy wyprawę. XP, złoto i łupy zdobyte do tej chwili zostają, a kara zabiera połowę XP wymaganego na bieżący poziom, nigdy poniżej początku poziomu. Postać budzi się z 10% HP.
19. **XP klasy.** W polowaniu solo cały wkład w walkę należy do gracza, więc XP klasy równa się XP z walk. Poziom klasy wymaga 25% więcej XP niż poziom postaci, więc rośnie trochę wolniej. *To zdanie jest nieaktualne: zob. „Uwagi autora po Etapie 1”, punkt 6.* Premia solo +10% XP jest z dokumentu.
20. **Za łatwy region.** Do 2 poziomów różnicy XP jest pełne. Potem każdy poziom różnicy zabiera 25% XP, ale zawsze zostaje co najmniej 10%.
21. **Krzywa XP.** Poziom L wymaga 65 × L^1,1 × L^0,99 XP, czyli ok. L^0,99 godziny polowania: poziom 1 ok. 1 godziny, poziom 10 ok. 9 godzin, poziom 50 ok. 48 godzin. Symulacja 10 000 wypraw (`npm run simulate`) daje 1,0–1,1 godziny na poziom 1 i 8,6–8,9 godziny na poziom 10. W Wiatrołomach omdleń nie ma. W Uroczysku Kamieni godzinna wyprawa kończy się omdleniem najwyżej w ok. 1% przypadków. Przy 4 godzinach na poziomie 6 ryzyko wynosi od ok. 2% (Łucznik) do ok. 22% (Mag), a z kolejnymi poziomami maleje. Tak ma być według dokumentu: dłuższa wyprawa to większe ryzyko, a poziom zagrożenia ostrzega przed nim przed wyruszeniem. *Nieaktualne: zob. „Uwagi autora po Etapie 1”, punkt 5.*
22. **Poziom zagrożenia** to szacowana szansa omdlenia na wybranej wyprawie. Serwer rozgrywa po 2 próbne walki z każdym rodzajem spotkania w regionie, także z elitą. Potem liczy, z jakim HP postać zaczyna każdą kolejną walkę, z szansami spotkań, odpoczynkiem po walce i aktualnym HP na starcie. Progi:
    - niskie: poniżej 1%,
    - umiarkowane: 1–5%,
    - wysokie: 5–15%,
    - bardzo wysokie: 15% i więcej.

    Szacunek jest przybliżony, ale prowadzi do tych samych wniosków co symulacja. Dla Maga na poziomie 6 i 4 godzin w Uroczysku daje ok. 34% (symulacja: 22%), a w Wiatrołomach mniej niż 1%. Pierwsza wersja patrzyła tylko na średni spadek HP i temu samemu Magowi pokazywała „umiarkowane”. *Nieaktualne poza progami: zob. „Uwagi autora po Etapie 1”, punkt 16.*
23. **Przerwanie polowania** nic nie kosztuje, ale też nic nie daje. Czas przerwanej wyprawy liczy się jako odpoczynek.
24. **Uczciwy wynik.** Ziarno losowości zapisujemy na starcie, a wynik liczymy przy odbiorze raportu. Do odbioru ekwipunek i punkty są zablokowane, więc wynik nie zależy od chwili odbioru. Drugi odbiór tego samego raportu kończy się błędem, bo baza ma unikalny klucz wyprawy.

### Przedmioty

25. **Rzadkości** mają wagi losowania 700 / 220 / 60 / 16 / 3 / 0,5 / 0,1 (od pospolitej do boskiej) i mnożnik budżetu od 1,0 do 3,0. Każdy pokonany potwór zostawia przedmiot z szansą 8%. *Nieaktualne: zob. „Uwagi autora po Etapie 1”, punkty 7 i 8.*
26. **Czego jeszcze nie ma:** nieznanych przedmiotów, limitu plecaka, sprzedaży i wymagań poziomu do założenia przedmiotu. Przedmiot można założyć, zdjąć albo wyrzucić. Te elementy wrócą w etapach profesji i osady.
27. **Nazwy** mają postać: prefiks w rodzaju gramatycznym bazy, baza, sufiks. Przykład: „Niedźwiedzi Topór Mgły”.

### Interfejs

28. **Silnik liczy tylko serwer.** Serwer przysyła gotowy widok: statystyki, wartości bojowe, skutki punktów i zagrożenie. To najprostsze rozwiązanie z punktu 11 Etapu 0, bez kopiowania plików przy wdrożeniu. Silnik w przeglądarce dodamy, gdy jakiś podgląd będzie musiał działać bez serwera.
29. **Nawigacja.** Po zalogowaniu gra otwiera zakładkę Walka. „Powrót” z widoku ekwipunku wraca do ostatnio otwartej zakładki menu głównego.
30. **Odblokowania.** Tabela z dokumentu jest w `data/unlocks.json`. Zablokowane zakładki i przyciski pokazują poziom odblokowania. Moduły, które jeszcze nie powstały (Profesje, Osada, Umiejętności, Rdzeń, Trening, Lochy), pokazują komunikat Systemu. Komunikat po awansie dopisujemy do tabeli dopiero wtedy, gdy moduł istnieje. Dziś są dwa, oba na poziomie 2: długie polowania i ekran Statystyki.
31. **Raport.** Kolejność jest taka:
    1. podsumowanie,
    2. komunikaty Systemu (awans, odblokowania, kara),
    3. animacja najważniejszej walki ze statystykami uczestników pod „+”,
    4. pozostałe walki w jednej linii,
    5. łupy,
    6. pełna relacja na żądanie.

    Najważniejsza walka to ta, która zakończyła wyprawę. Po udanej wyprawie jest to walka z elitą, a bez elity walka z najsilniejszą grupą, czyli z największym łącznym HP przeciwników. *Kolejność jest nieaktualna: zob. „Uwagi autora po Etapie 1”, punkt 9.*
32. **Dziennik** pokazuje 50 ostatnich raportów i historię komunikatów Systemu z tych raportów.
33. **Pamięć wyboru.** Ostatnio wybrany czas polowania pamięta przeglądarka (localStorage), osobno dla każdego regionu.
34. **Liczniki.** HP w górnym pasku rośnie co sekundę według tego samego wzoru co na serwerze. Licznik polowania liczy według zegara serwera, a raport można odebrać sekundę po jego końcu, żeby nie wyprzedzić serwera.
35. **Liczba w rogu slotu** oznacza poziom ulepszenia, jak w dokumencie. Kafelki w plecaku nie mają więc w rogu poziomu przedmiotu, a poziom jest w karcie przedmiotu.

### Technika

36. **Czas procesora.** Ciepły Worker liczy 4-godzinną wyprawę w ok. 1,5 ms, a poziom zagrożenia dla obu regionów w ok. 3 ms. Pierwsze takie żądanie po uruchomieniu nowej instancji Workera trwa dłużej, do ok. 8–10 ms, bo kod nie jest jeszcze skompilowany. Cloudflare dopuszcza sporadyczne przekroczenia limitu, więc to wystarcza. Gdy regionów przybędzie, zagrożenie będziemy liczyć tylko dla regionów bliskich poziomowi postaci. *Liczby są nieaktualne: zob. „Uwagi autora po Etapie 1”, punkt 17.*
37. **Baza.** Doszły tabele `characters`, `items` (slot pusty oznacza plecak), `activities` (najwyżej jedna czynność na postać) i `reports`. Każda zmiana postaci jest jedną atomową paczką zapytań D1. Zapis punktów ma blokadę optymistyczną (kolumna `version`).
38. **Treść gry** to 13 plików w `data/`. Sprawdzają je schematy JSON z `data/schemas` i test spójności odwołań (`npm run validate`), uruchamiany w workflow przed testami.
39. **Testy strony.** Strona nie ma kroku budowania, więc test sprawdza, czy każdy moduł strony się parsuje i czy każdy import wskazuje istniejący plik i eksport.

## Uwagi autora po Etapie 1 (23.10.2026)

Autor przetestował Etap 1 na telefonie. Zmiany poniżej wynikają z jego uwag i zastępują wskazane punkty Etapu 1. Dwie z nich zmieniają też zapisy dokumentu projektowego: odtworzyć można każdą walkę wyprawy, nie tylko najważniejszą, a poziom 1 trwa ok. 35 minut polowania zamiast ok. godziny.

### Start i postęp

1. **Bez ekwipunku startowego.** Nowa postać nie ma przedmiotów i walczy pięściami. Cios pięścią działa jak broń fizyczna o współczynniku obrażeń 0,5 (miecz ma 1,2, kostur 0,95) z budżetem pospolitego przedmiotu z poziomu postaci i korzysta z Siły. Pierwszy przeciwnik pokonany bez broni zawsze zostawia broń klasy z listy `weapons` w `data/classes.json`, np. miecz albo topór dla Wojownika. Mówią o tym ekran tworzenia postaci i ekran Walki.
2. **Łupy wypełniają braki.** Każda baza przedmiotu do pustego slotu ma trzy razy większą wagę losowania (`emptySlotWeight` w `data/balance.json`). Pusty jest slot bez założonego przedmiotu, na który nic jeszcze nie wypadło na tej wyprawie.
3. **Wyzwanie od pierwszej wyprawy.** Potwory mają mniej stałego HP i budżetu statystyk, ale biją mocniej: w `data/balance.json` `hpBase` 2 zamiast 10, `budgetBase` 0 zamiast 6 i `damageMultiplier` 2,2 zamiast 1,4. Walki są krótsze, ale kosztują HP. W Wiatrołomach na poziomie 1 spotyka się pojedynczo wilka, żmiję i borsuka. Grupy i dzik dochodzą od poziomu 2 (pole `minLevel` spotkania w `data/regions.json`). Symulacja daje takie wyniki:
   - Postać bez ekwipunku kończy 30-minutową wyprawę średnio z 65–77% HP i nie mdleje.
   - 4-godzinna wyprawa w Wiatrołomach na poziomie 2 kończy się omdleniem w 0–9% przypadków (najczęściej u Cienia), a od poziomu 3 najwyżej w ok. 3%.
   - W Uroczysku Kamieni na poziomie 6 godzinna wyprawa kończy się omdleniem w 1,5–11% przypadków, a 4-godzinna w 12–80% (najgorzej Mag). Na poziomie 8 4 godziny to 1–16%, na poziomie 10 najwyżej ok. 2,5%. Zaraz po wejściu do nowego regionu długa wyprawa jest więc bardzo ryzykowna, a poziom zagrożenia to pokazuje.
4. **Krótkie wyprawy nie są opłacalniejsze.** Każda wyprawa ma co najmniej jedną walkę. Gdy wyprawa jest krótsza niż średni odstęp między walkami (12 minut), ta walka daje tylko część XP, złota i szansy na łup, np. 5/12 przy 5 minutach. Bez tego 5-minutowe wyprawy dawały 2–3 razy więcej XP na godzinę niż długie.
5. **Krzywa XP.** Poziom L wymaga tylu XP, ile średnio daje 0,48 × L^1,17 godziny polowania na tym poziomie:
   - poziom 1: 31 XP, ok. 29 minut,
   - poziom 2: 150 XP, ok. 1,1 godziny,
   - poziom 10: ok. 7 godzin,
   - poziom 50: ok. 47 godzin.

   Symulacja daje ok. 35 minut do pierwszego awansu, bo pierwsza walka toczy się bez broni. Dojście do poziomu 10 zajmuje ok. 29 godzin polowania. Na poziomie 1 najdłuższa wyprawa trwa 30 minut, więc pierwszy awans postaci wypada zwykle w drugiej wyprawie.
6. **Szybsze poziomy klasy.** Poziom klasy wymaga 60% XP poziomu postaci o tym samym numerze. Pierwszy awans klasy przychodzi po ok. 20 minutach polowania, zwykle w pierwszej 30-minutowej wyprawie. Przy poziomie postaci 10 klasa ma zwykle poziom 11, a przy poziomie 20 poziom 23. Punkty z awansu klasy przed poziomem 2 czekają na ekran Statystyk, a komunikat Systemu mówi, od którego poziomu można je rozdać.

### Przedmioty

7. **Rdzeń przedmiotu nie zależy od rzadkości.** Obrażenia broni, pancerz i stała statystyka bazy mają zawsze budżet pospolitego przedmiotu tego poziomu. Rzadkość dodaje tylko budżet afiksów. Mnożniki budżetu to 1,0 / 1,35 / 1,7 / 2,1 / 2,6 / 3,2 / 4,0, od pospolitej do boskiej. Wcześniej było to 1,0–3,0, a rdzeń rzadszych przedmiotów był nieco słabszy. Rzadki przedmiot jest więc zawsze lepszy od pospolitego z tą samą bazą i poziomem. Fokus i Kołczan mają większą stałą statystykę (`statFactor` 0,8 zamiast 0,3):
   - pospolity Fokus poziomu 1 daje +6 Intelektu, czyli +18% obrażeń zaklęć,
   - rzadki Sowi Fokus daje do tego +2 Mądrości (wcześniej miał +2 Intelektu i +2 Mądrości),
   - pospolita Tarcza poziomu 1 daje +17 Pancerza.

   Wybór między Tarczą a Fokusem to więc wybór między obroną a obrażeniami.
8. **Więcej przedmiotów.** Średnio jedno znalezisko przypada na 20 minut wyprawy (wcześniej 30), a połowa znalezisk to złoto (wcześniej 65%). Każdy pokonany potwór zostawia przedmiot z szansą 10% (wcześniej 8%). Postać zdobywa średnio ok. 2 przedmioty na godzinę, a na poziomie 1 ok. 3,5, bo dochodzi gwarantowana broń.

### Raport i interfejs

9. **Każdą walkę da się odtworzyć.** Raport zapisuje przebieg wszystkich walk wyprawy. Walki przełączają zakładki z numerami (★ przy najważniejszej, kolor według wyniku), przyciski „Poprzednia” i „Następna” oraz przesunięcie palcem po arenie. Raport otwiera się na najważniejszej walce. Jej animacja startuje, gdy arena pojawi się na ekranie, a każda inna od razu po wybraniu. Raporty sprzed tej zmiany mają zapis tylko najważniejszej walki. Kolejność raportu to teraz:
   1. podsumowanie,
   2. komunikaty Systemu,
   3. walki,
   4. łupy,
   5. pełna relacja na żądanie.
10. **Animacja ciosów.** Cios wręcz to wypad portretu w stronę celu, a strzała i zaklęcie lecą do celu. Zaklęcie ma kolor żywiołu z `data/elements.json`. Trafienie błyska, potrząsa celem, zostawia ślad cięcia (przy krytyku dwa) i pokazuje obrażenia. Pokonany portret szarzeje i dostaje ✕. Przyciski pod areną:
    - „Pomiń” pokazuje od razu koniec walki,
    - „Powtórz” odtwarza ją od nowa,
    - „Tempo 1×/2×” przyspiesza animację, a wybór pamięta przeglądarka.

    Przy włączonym w telefonie ograniczeniu ruchu animacja działa spokojniej: wypad jest krótszy, a cel nie drży. Pierwsza wersja przy tym ustawieniu pomijała animację, co najpewniej było przyczyną niedziałającego „Powtórz”.
11. **Dźwięki.** Gra ma proste efekty dźwiękowe tworzone w przeglądarce (Web Audio API), bez plików. Słychać stuknięcia, zmianę zakładki, otwarcie karty, ciosy, trafienia, krytyki, strzały, zaklęcia, uniki, efekty okresowe, pokonanie, zwycięstwo, porażkę i komunikat Systemu. Przeglądarka gra dźwięk dopiero po pierwszym dotknięciu strony. Wyłącznik jest w Ustawieniach, a wybór pamięta przeglądarka.
12. **Pasek XP.** Doświadczenie postaci jest w górnym pasku jako trzeci pasek obok HP i many. Doświadczenie klasy pokazuje ekran Statystyk, a profesji pokaże zakładka Profesje.
13. **Szare pospolite.** Nazwy pospolitych przedmiotów są szare (#9b9b9b).
14. **Podgląd zmian.** Karta przedmiotu pokazuje, co zmieni jego założenie albo zdjęcie: obrażenia, redukcję obrażeń, maksymalne HP, unik i trafienie krytyczne. Liczy to serwer dla aktualnej postaci (`GET /api/items/:id/preview`). Znalezisko w raporcie, także „Najlepsze znalezisko”, otwiera tę samą kartę, jeśli postać nadal ma ten przedmiot.
15. **Zacznij od nowa.** W Ustawieniach jest przycisk, który po potwierdzeniu usuwa postać razem z przedmiotami, raportami i trwającą wyprawą (`DELETE /api/character`). Konto zostaje, a gra od razu otwiera tworzenie postaci.

### Technika

16. **Poziom zagrożenia.** Serwer rozgrywa po 6 próbnych walk z każdym rodzajem spotkania w regionie, także z elitą. Przy 3 próbach rzadkie, bardzo kosztowne walki psuły wynik: szacunek dla Cienia na poziomie 4 dawał 20% ryzyka 4-godzinnej wyprawy w Wiatrołomach przy 1,6% w symulacji. Pozostałe zasady:
    - Strona pyta o każdy region osobno (`?region=`).
    - Worker trzyma próbki w pamięci, dopóki nie zmieni się poziom, poziom klasy, punkty ani założone przedmioty, więc kolejne pytania są tanie.
    - Region odległy o więcej niż 3 poziomy od postaci dostaje ocenę bez walk: „bardzo wysokie”, gdy jest za trudny, i „niskie”, gdy jest za łatwy. *Nieaktualne: zob. punkt 21.*
    - Przegrana z elitą bezpiecznego regionu liczy się jako odwrót, nie omdlenie, tak jak na wyprawie.
    - Progi się nie zmieniły.

    Porównanie z 1000 symulowanych wypraw objęło 95 przypadków: 5 klas, poziomy 1–10, wyprawy godzinne i 4-godzinne. Średni błąd to ok. 1,1 punktu procentowego. Poziom zagrożenia zgadza się z symulacją w 86 przypadkach, a w pozostałych różni się o jeden poziom. Przykłady: Mag na poziomie 6, 4 godziny w Uroczysku: 85% (symulacja: 80%). Cień na poziomie 2, 4 godziny w Wiatrołomach: 13% (symulacja: 9%).
17. **Czas procesora.** Rozgrzany kod liczy 4-godzinną wyprawę z raportem w ok. 1 ms CPU, a zagrożenie dla jednego regionu w ok. 1–2 ms. Pierwsze wywołanie w świeżym procesie Node.js trwa 6–10 ms, głównie przez kompilację kodu, i przy 6 próbach jest prawie tak samo długie jak przy 3. Pozostaje więc w granicach z punktu 36 Etapu 1.
18. **Rozmiar raportów.** Raport 4-godzinnej wyprawy z zapisem wszystkich walk ma ok. 40 KB. Odbiór raportu usuwa raporty postaci starsze niż 50 najnowszych, których Dziennik i tak nie pokazuje. Baza D1 na darmowym planie mieści 500 MB, czyli pełne Dzienniki ok. 250 postaci, nawet przy samych 4-godzinnych wyprawach.

### Odpowiedzi autora po wdrożeniu (23.10.2026)

19. **Dokument projektowy** opisuje teraz te zmiany: każdą walkę da się odtworzyć, poziom 1 trwa ok. 35 minut, czas wyprawy wybiera się suwakiem, zagrożenie wynika z całej postaci, a raport ma przycisk „Powrót”. Otwarte kwestie na końcu dokumentu zostały bez zmian, choć część rozstrzygają odpowiedzi z początku tego rejestru.
20. **Suwak czasu wyprawy.** Czas wybiera się suwakiem co 5 minut: od 5 do 45 minut na poziomie 1 i do 4 godzin od poziomu 2. Wartości są w `data/balance.json`: `minMinutes`, `stepMinutes`, `maxMinutes` i `shortHuntMaxMinutes`. Przyciski „−” i „+” zmieniają czas o jeden krok, bo na telefonie trudno palcem trafić w dokładne miejsce suwaka. Przeglądarka pamięta wybór osobno dla każdego regionu, a na start suwak stoi na 15 minutach. Symulacja pierwszej wyprawy bez ekwipunku:
    - 45 minut daje poziom 2 w ok. 97% przypadków, a 30 minut w ok. połowie,
    - omdlenie na 45-minutowej wyprawie na poziomie 1 zdarza się w 0–0,4% przypadków.
21. **Zagrożenie z całej postaci.** Poziom zagrożenia zawsze pochodzi z próbnych walk tej samej postaci, która ruszy na wyprawę. Liczą się jej statystyki, ekwipunek i HP, a później także umiejętności i towarzysze. Nie ma już skrótu, który regionom odległym o ponad 3 poziomy dawał ocenę z samego poziomu. Strona pyta o ocenę ponownie po każdej zmianie poziomu, poziomu klasy, statystyk i ekwipunku, a przy odpoczynku co 10% HP. Przykład: Wojownik na poziomie 2 z połową HP na 45 minut w Wiatrołomach ma bez broni ok. 71% szans omdlenia („bardzo wysokie”), a z mieczem poniżej 0,1% („niskie”). Skok trudności przy wejściu do Uroczyska Kamieni zostaje. Region daleko powyżej poziomu postaci kosztuje teraz serwer ok. 1,3 ms zamiast zera, bo też jest rozgrywany.
22. **Powrót z raportu.** Raport ma w prawym górnym rogu duży przycisk „Powrót”. Prowadzi do zakładki, z której otwarto raport, czyli do Walki albo Dziennika.
