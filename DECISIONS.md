# Rejestr założeń

Tu zapisujemy decyzje, których nie rozstrzyga [dokument projektowy](https://claude.ai/artifact/9jPtkYkTJ67d3akFB8imGX). Wybieramy wtedy najprostsze rozwiązanie zgodne z filarami gry. Zmianę decyzji z dokumentu proponujemy autorowi jako pytanie.

## Odpowiedzi autora na otwarte kwestie (23.10.2026)

1. **Maksymalny czas polowania: 4 godziny**, z myślą o krótkim AFK. Minimum zostaje 5 minut, jak w przykładzie z dokumentu. *Minimum jest nieaktualne: zob. „Nowa skala i eksploracje”, punkt 9.*
2. **Wolne punkty statystyk.** Każdy poziom postaci daje tyle wolnych punktów, ile jest statystyk (dziś 8). Każdy poziom klasy daje ¼ tej liczby (dziś 2).
3. **Rodzaje obrażeń.** Są trzy rodzaje obrażeń:
   - fizyczne: broń, kły, pazury, upadki,
   - magiczne: każde ma żywioł,
   - okresowe: zadawane co turę przez kilka tur, każde ma żywioł (zatrucie, oparzenie, wychłodzenie).

   Żywioły to ogień, mróz, woda, elektryczność, ziemia, natura, trucizna i sakrum. Sakrum to żywioł Kleryka: święta moc, z której pochodzi też leczenie. Światła i cienia nie ma. Jedno trafienie może zadać obrażenia i dodatkowo nałożyć efekt okresowy. Przykład: ukąszenie żmii zadaje obrażenia fizyczne i może wywołać zatrucie.
4. **Obrona przed obrażeniami (założenie Claude).** Pancerz zmniejsza obrażenia fizyczne. Odporność na żywioł zmniejsza obrażenia magiczne i okresowe tego żywiołu. Wola zmniejsza szansę, że efekt okresowy się nałoży. Wszystkie trzy działają według wzoru z malejącym zwrotem z dokumentu.

## Etap 0 — konfiguracja (22.10.2026)

1. **Nazwa Workera i adres.** Worker nazywa się `wzrost`, tak jak repozytorium, więc gra działa pod `https://wzrost.<subdomena>.workers.dev`. Ekran logowania pokazuje „Wzrost” jako nazwę roboczą, dopóki nie wybierzemy nazwy gry. *Gra nazywa się teraz Insight: zob. „Nazwa gry: Insight”.*
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

1. **Jedna postać na konto.** Postać ma rolę `player`. Towarzysze dostaną w Etapie 5 tę samą tabelę i strukturę z inną rolą. Imię ma 2–20 liter i może zawierać spacje, myślniki i apostrofy. Imiona nie muszą być unikalne. *Nieaktualne: zob. „Unikalne imiona postaci” i „Świeży start dla testujących”, punkt 3.*
2. **Klasy.** Statystyki startowe, przyrost na poziom klasy i proporcje „Rozdaj według klasy” są w `data/classes.json`. Wojownik i Kleryk mają oznaczenie „łagodniejszy start”, a Mag od zmiany „trudniejszy start” (zob. „Regiony wewnętrzne i obóz”, punkt 11). Kleryk lepiej odpoczywa między walkami (+7% brakującego HP i +0,2% za punkt Mądrości), bo dokument mówi, że klasy wspierające zmniejszają spadek HP między walkami.
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

   Mana jest widoczna, ale zacznie działać razem z umiejętnościami w Etapie 3. *Premia +3% za punkt jest nieaktualna: zob. „Nowa skala i eksploracje”, punkt 3.*
6. **Wolne punkty.** Pojawiają się od poziomu 2, zgodnie z tabelą odblokowań. Punkty dodane przyciskiem „+” trafiają na serwer dopiero po „Zatwierdź”, więc pomyłkę cofa „Cofnij”. Zerowanie jest darmowe do poziomu 10 włącznie. *Próg jest nieaktualny: zob. „Regiony wewnętrzne i obóz”, punkt 10.*
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
15. **HP.** Po wygranej walce postać odzyskuje 30% brakującego HP, do tego dochodzą premie klasy i regionu. Między wyprawami HP wraca w tempie ok. 2% maksimum na minutę, a Witalność to przyspiesza. *Ognisko w obozie przyspiesza odpoczynek: zob. „Obóz, pierwsza część”, punkt 7.* Odpoczynek liczy się od końca wyprawy, nie od odbioru raportu.
16. **Poziom potworów** to poziom postaci ±1, w granicach regionu. W Wiatrołomach potwory mają zawsze poziom postaci, bo to region samouczka. *Nieaktualne: zob. „Regiony wewnętrzne i obóz”, punkt 2.*
17. **Lokalna elita** to Błędnica w Wiatrołomach i Licho w Uroczysku Kamieni. Pojawia się w ok. 0,6% walk, ma poziom o jeden wyższy, daje potrójne XP i złoto oraz zawsze przedmiot z większą szansą na wysoką rzadkość. W bezpiecznym regionie przegrana z elitą kończy się odwrotem bez kary. *Szansa jest nieaktualna: zob. „Nowa skala i eksploracje”, punkt 7. Poziom elity jest nieaktualny: zob. „Regiony wewnętrzne i obóz”, punkt 2.*
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
26. **Czego jeszcze nie ma:** nieznanych przedmiotów, limitu plecaka, sprzedaży i wymagań poziomu do założenia przedmiotu. *Limit plecaka już jest: zob. „Obóz, pierwsza część”, punkt 8.* Przedmiot można założyć, zdjąć albo wyrzucić. Te elementy wrócą w etapach profesji i osady. *Sprzedaż już jest: zob. „Nowa skala i eksploracje”, punkt 14.*
27. **Nazwy** mają postać: prefiks w rodzaju gramatycznym bazy, baza, sufiks. Przykład: „Niedźwiedzi Topór Mgły”.

### Interfejs

28. **Silnik liczy tylko serwer.** Serwer przysyła gotowy widok: statystyki, wartości bojowe, skutki punktów i zagrożenie. To najprostsze rozwiązanie z punktu 11 Etapu 0, bez kopiowania plików przy wdrożeniu. Silnik w przeglądarce dodamy, gdy jakiś podgląd będzie musiał działać bez serwera.
29. **Nawigacja.** Po zalogowaniu gra otwiera zakładkę Walka. „Powrót” z widoku ekwipunku wraca do ostatnio otwartej zakładki menu głównego.
30. **Odblokowania.** Tabela z dokumentu jest w `data/unlocks.json`. Zablokowane zakładki i przyciski pokazują poziom odblokowania. Moduły, które jeszcze nie powstały (Profesje, Osada, Umiejętności, Rdzeń, Trening, Lochy), pokazują komunikat Systemu. Komunikat po awansie dopisujemy do tabeli dopiero wtedy, gdy moduł istnieje. Dziś są dwa, oba na poziomie 2: długie polowania i ekran Statystyki. *Długie polowania na poziomie 2 są nieaktualne: zob. „Drabinka eksploracji i lochy”, punkt 1.*
31. **Raport.** Kolejność jest taka:
    1. podsumowanie,
    2. komunikaty Systemu (awans, odblokowania, kara),
    3. animacja najważniejszej walki ze statystykami uczestników pod „+”,
    4. pozostałe walki w jednej linii,
    5. łupy,
    6. pełna relacja na żądanie.

    Najważniejsza walka to ta, która zakończyła wyprawę. Po udanej wyprawie jest to walka z elitą, a bez elity walka z najsilniejszą grupą, czyli z największym łącznym HP przeciwników. *Kolejność jest nieaktualna: zob. „Uwagi autora po Etapie 1”, punkt 9.*
32. **Dziennik** pokazuje 50 ostatnich raportów i historię komunikatów Systemu z tych raportów.
33. **Pamięć wyboru.** Ostatnio wybrany czas polowania pamięta przeglądarka (localStorage), osobno dla każdego regionu. *Nieaktualne: zob. „Regiony wewnętrzne i obóz”, punkt 4.*
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

1. **Bez ekwipunku startowego.** Nowa postać nie ma przedmiotów i walczy pięściami. Cios pięścią działa jak broń fizyczna o współczynniku obrażeń 0,5 (miecz ma 1,2, kostur 0,95) z budżetem pospolitego przedmiotu z poziomu postaci i korzysta z Siły. Pierwszy przeciwnik pokonany bez broni zawsze zostawia broń klasy z listy `weapons` w `data/classes.json`, np. miecz albo topór dla Wojownika. Mówią o tym ekran tworzenia postaci i ekran Walki. *Te komunikaty są nieaktualne: zob. „Regiony wewnętrzne i obóz”, punkt 12.*
2. **Łupy wypełniają braki.** Każda baza przedmiotu do pustego slotu ma trzy razy większą wagę losowania (`emptySlotWeight` w `data/balance.json`). Pusty jest slot bez założonego przedmiotu, na który nic jeszcze nie wypadło na tej wyprawie.
3. **Wyzwanie od pierwszej wyprawy.** Potwory mają mniej stałego HP i budżetu statystyk, ale biją mocniej: w `data/balance.json` `hpBase` 2 zamiast 10, `budgetBase` 0 zamiast 6 i `damageMultiplier` 2,2 zamiast 1,4. Walki są krótsze, ale kosztują HP. W Wiatrołomach na poziomie 1 spotyka się pojedynczo wilka, żmiję i borsuka. Grupy i dzik dochodzą od poziomu 2 (pole `minLevel` spotkania w `data/regions.json`). Symulacja daje takie wyniki:
   - Postać bez ekwipunku kończy 30-minutową wyprawę średnio z 65–77% HP i nie mdleje.
   - 4-godzinna wyprawa w Wiatrołomach na poziomie 2 kończy się omdleniem w 0–9% przypadków (najczęściej u Cienia), a od poziomu 3 najwyżej w ok. 3%.
   - W Uroczysku Kamieni na poziomie 6 godzinna wyprawa kończy się omdleniem w 1,5–11% przypadków, a 4-godzinna w 12–80% (najgorzej Mag). Na poziomie 8 4 godziny to 1–16%, na poziomie 10 najwyżej ok. 2,5%. Zaraz po wejściu do nowego regionu długa wyprawa jest więc bardzo ryzykowna, a poziom zagrożenia to pokazuje.

   *Liczby, poziomy i mnożnik obrażeń są nieaktualne: zob. „Nowa skala i eksploracje”, punkty 2, 3 i 21.*
4. **Krótkie wyprawy nie są opłacalniejsze.** Każda wyprawa ma co najmniej jedną walkę. Gdy wyprawa jest krótsza niż średni odstęp między walkami (12 minut), ta walka daje tylko część XP, złota i szansy na łup, np. 5/12 przy 5 minutach. Bez tego 5-minutowe wyprawy dawały 2–3 razy więcej XP na godzinę niż długie. *Nieaktualne: zob. „Nowa skala i eksploracje”, punkt 6.*
5. **Krzywa XP.** Poziom L wymaga tylu XP, ile średnio daje 0,48 × L^1,17 godziny polowania na tym poziomie:
   - poziom 1: 31 XP, ok. 29 minut,
   - poziom 2: 150 XP, ok. 1,1 godziny,
   - poziom 10: ok. 7 godzin,
   - poziom 50: ok. 47 godzin.

   Symulacja daje ok. 35 minut do pierwszego awansu, bo pierwsza walka toczy się bez broni. Dojście do poziomu 10 zajmuje ok. 29 godzin polowania. Na poziomie 1 najdłuższa wyprawa trwa 30 minut, więc pierwszy awans postaci wypada zwykle w drugiej wyprawie. *Nieaktualne: zob. „Nowa skala i eksploracje”, punkt 1.*
6. **Szybsze poziomy klasy.** Poziom klasy wymaga 60% XP poziomu postaci o tym samym numerze. Pierwszy awans klasy przychodzi po ok. 20 minutach polowania, zwykle w pierwszej 30-minutowej wyprawie. Przy poziomie postaci 10 klasa ma zwykle poziom 11, a przy poziomie 20 poziom 23. Punkty z awansu klasy przed poziomem 2 czekają na ekran Statystyk, a komunikat Systemu mówi, od którego poziomu można je rozdać. *Czasy są nieaktualne: zob. „Nowa skala i eksploracje”, punkt 1.*

### Przedmioty

7. **Rdzeń przedmiotu nie zależy od rzadkości.** Obrażenia broni, pancerz i stała statystyka bazy mają zawsze budżet pospolitego przedmiotu tego poziomu. Rzadkość dodaje tylko budżet afiksów. Mnożniki budżetu to 1,0 / 1,35 / 1,7 / 2,1 / 2,6 / 3,2 / 4,0, od pospolitej do boskiej. Wcześniej było to 1,0–3,0, a rdzeń rzadszych przedmiotów był nieco słabszy. Rzadki przedmiot jest więc zawsze lepszy od pospolitego z tą samą bazą i poziomem. Fokus i Kołczan mają większą stałą statystykę (`statFactor` 0,8 zamiast 0,3):
   - pospolity Fokus poziomu 1 daje +6 Intelektu, czyli +18% obrażeń zaklęć,
   - rzadki Sowi Fokus daje do tego +2 Mądrości (wcześniej miał +2 Intelektu i +2 Mądrości),
   - pospolita Tarcza poziomu 1 daje +17 Pancerza.

   Wybór między Tarczą a Fokusem to więc wybór między obroną a obrażeniami.
8. **Więcej przedmiotów.** Średnio jedno znalezisko przypada na 20 minut wyprawy (wcześniej 30), a połowa znalezisk to złoto (wcześniej 65%). Każdy pokonany potwór zostawia przedmiot z szansą 10% (wcześniej 8%). Postać zdobywa średnio ok. 2 przedmioty na godzinę, a na poziomie 1 ok. 3,5, bo dochodzi gwarantowana broń. *Nieaktualne: zob. „Nowa skala i eksploracje”, punkt 8.*

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
12. **Pasek XP.** Doświadczenie postaci jest w górnym pasku jako trzeci pasek obok HP i many. Doświadczenie klasy pokazuje ekran Statystyk, a profesji pokaże zakładka Profesje. *Nieaktualne: zob. „Nowa skala i eksploracje”, punkt 15.*
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

    Porównanie z 1000 symulowanych wypraw objęło 95 przypadków: 5 klas, poziomy 1–10, wyprawy godzinne i 4-godzinne. Średni błąd to ok. 1,1 punktu procentowego. Poziom zagrożenia zgadza się z symulacją w 86 przypadkach, a w pozostałych różni się o jeden poziom. Przykłady: Mag na poziomie 6, 4 godziny w Uroczysku: 85% (symulacja: 80%). Cień na poziomie 2, 4 godziny w Wiatrołomach: 13% (symulacja: 9%). *Liczba prób i dokładność są nieaktualne: zob. „Nowa skala i eksploracje”, punkt 19.*
17. **Czas procesora.** Rozgrzany kod liczy 4-godzinną wyprawę z raportem w ok. 1 ms CPU, a zagrożenie dla jednego regionu w ok. 1–2 ms. Pierwsze wywołanie w świeżym procesie Node.js trwa 6–10 ms, głównie przez kompilację kodu, i przy 6 próbach jest prawie tak samo długie jak przy 3. Pozostaje więc w granicach z punktu 36 Etapu 1. *Nieaktualne: zob. „Nowa skala i eksploracje”, punkt 20.*
18. **Rozmiar raportów.** Raport 4-godzinnej wyprawy z zapisem wszystkich walk ma ok. 40 KB. Odbiór raportu usuwa raporty postaci starsze niż 50 najnowszych, których Dziennik i tak nie pokazuje. Baza D1 na darmowym planie mieści 500 MB, czyli pełne Dzienniki ok. 250 postaci, nawet przy samych 4-godzinnych wyprawach.

### Odpowiedzi autora po wdrożeniu (23.10.2026)

19. **Dokument projektowy** opisuje teraz te zmiany: każdą walkę da się odtworzyć, poziom 1 trwa ok. 35 minut, czas wyprawy wybiera się suwakiem, zagrożenie wynika z całej postaci, a raport ma przycisk „Powrót”. W otwartych kwestiach dokument oznacza jako rozstrzygnięte trzy sprawy z odpowiedzi na początku tego rejestru: czas polowania, wolne punkty i rodzaje obrażeń.
20. **Suwak czasu wyprawy.** Czas wybiera się suwakiem co 5 minut: od 5 do 45 minut na poziomie 1 i do 4 godzin od poziomu 2. Wartości są w `data/balance.json`: `minMinutes`, `stepMinutes`, `maxMinutes` i `shortHuntMaxMinutes`. Przyciski „−” i „+” zmieniają czas o jeden krok, bo na telefonie trudno palcem trafić w dokładne miejsce suwaka. Przeglądarka pamięta wybór osobno dla każdego regionu, a na start suwak stoi na 15 minutach. Symulacja pierwszej wyprawy bez ekwipunku:
    - 45 minut daje poziom 2 w ok. 97% przypadków, a 30 minut w ok. połowie,
    - omdlenie na 45-minutowej wyprawie na poziomie 1 zdarza się w 0–0,4% przypadków.

    *Zakres suwaka i liczby są nieaktualne: zob. „Nowa skala i eksploracje”, punkt 9.*
21. **Zagrożenie z całej postaci.** Poziom zagrożenia zawsze pochodzi z próbnych walk tej samej postaci, która ruszy na wyprawę. Liczą się jej statystyki, ekwipunek i HP, a później także umiejętności i towarzysze. Nie ma już skrótu, który regionom odległym o ponad 3 poziomy dawał ocenę z samego poziomu. Strona pyta o ocenę ponownie po każdej zmianie poziomu, poziomu klasy, statystyk i ekwipunku, a przy odpoczynku co 10% HP. Przykład: Wojownik na poziomie 2 z połową HP na 45 minut w Wiatrołomach ma bez broni ok. 71% szans omdlenia („bardzo wysokie”), a z mieczem poniżej 0,1% („niskie”). Skok trudności przy wejściu do Uroczyska Kamieni zostaje. Region daleko powyżej poziomu postaci kosztuje teraz serwer ok. 1,3 ms zamiast zera, bo też jest rozgrywany. *Przykład i koszt są sprzed zmiany skali: zob. „Nowa skala i eksploracje”, punkty 19 i 20.*
22. **Powrót z raportu.** Raport ma w prawym górnym rogu duży przycisk „Powrót”. Prowadzi do zakładki, z której otwarto raport, czyli do Walki albo Dziennika.
23. **Tryb testowy i „Pomiń czas”.** Dopóki grę testujemy, zmienna `TEST_MODE` w `wrangler.jsonc` ma wartość `"on"`. W zakładce Walka pojawia się wtedy przycisk „Pomiń czas” w przerywanej, złotej ramce, oddzielony od zwykłych przycisków gry. Działa tak:
    - Podczas wyprawy przesuwa ją w przeszłość, więc raport można od razu odebrać. Wynik się nie zmienia, bo serwer liczy go z ziarna zapisanego na starcie.
    - Podczas odpoczynku od razu przywraca pełne HP.
    - Czas dalej odmierza serwer (`POST /api/test/skip-time`).

    Każde konto może go użyć, bo grają tylko testujący. Po testach zmieniamy `TEST_MODE` na `"off"`: przycisk znika, a ścieżka API zwraca 404.
24. **Przedmioty do pustych slotów zakładają się same.** Przy odbiorze raportu każdy znaleziony przedmiot do slotu, w którym nic nie ma, trafia od razu na postać. Gdy do jednego pustego slotu wypadło kilka przedmiotów, postać zakłada najlepszy według rzadkości, a potem poziomu, tak jak przy wyborze najlepszego znaleziska. Reszta trafia do plecaka. Raport mówi o tym komunikatem Systemu, np. „Założono od razu: Łuk (Broń), bo ten slot był pusty”. Dzięki temu pierwsza broń jest od razu w ręku i postać na poziomie 2 nie walczy przez przeoczenie pięściami. Od zmiany skali postać zakłada tylko przedmioty swojej klasy (zob. „Nowa skala i eksploracje”, punkt 12). Pierwszą broń postać bierze do ręki już w trakcie wyprawy (zob. „Regiony wewnętrzne i obóz”, punkt 7).

## Nowa skala i eksploracje (23.10.2026)

Zmiany poniżej wynikają z kolejnych uwag autora po testach na telefonie i zastępują wskazane wcześniej punkty. Najważniejsze: poziomy do 500 z szybkimi awansami na starcie, „eksploracja” zamiast „polowania”, mało walk na wyprawę i więcej trudnych spotkań na długich wyprawach. [Encyklopedia](https://claude.ai/artifact/EDt6uk8X5rRU9JCTLKsnXw) spisuje klasy, przedmioty, potwory, regiony i przebieg wyprawy według danych z `data/`.

### Skala i postęp

1. **Poziomy do 500.** Pierwsze pięć poziomów to po 4 minuty eksploracji, więc 5-minutowa wyprawa daje awans. Potem czas poziomu rośnie jak (poziom / 5)^1,3:
   - poziom 10: ok. 10 minut, osiągany po ok. 47 minutach eksploracji,
   - poziom 25: ok. 32 minut, osiągany po ok. 6 godzinach,
   - poziom 50: ok. 80 minut, osiągany po ok. 28 godzinach,
   - poziom 100: ok. 3,3 godziny, osiągany po ok. 141 godzinach,
   - poziom 500: ok. 26,5 godziny, osiągany po ok. 5760 godzinach.

   Wartości są w `data/balance.json` (`progression`): `maxLevel`, `firstLevelMinutes`, `flatLevels`, `levelTimeExponent` i `xpPerHourScale` 650. XP z potworów jest dziesięć razy większe (`xpBase` 100), żeby liczby rosły szybciej. Symulacja: na poziomach 1–5 5-minutowa wyprawa daje poziom postaci w ok. 90% przypadków, a poziom klasy zawsze. Poziom klasy wymaga dalej 60% XP poziomu postaci, więc klasa wyprzedza postać. Przykład: po 4-godzinnej wyprawie na poziomie 2 Cień miał poziom postaci 12 i poziom klasy 14. Tabela odblokowań z dokumentu się nie zmieniła, więc umiejętności (poziom 4), profesje (6), trening (8), osada (10) i lochy (12) przychodzą teraz w pierwszej godzinie eksploracji, a ewolucja klasy (25) po ok. 6 godzinach. To pytanie do autora. Punkt zastępuje punkty 5 i 6 z „Uwag autora po Etapie 1” (krzywa i czasy). *Poziomy odblokowań i ewolucji są nieaktualne: zob. „Regiony wewnętrzne i obóz”, punkt 10. Czasy pierwszych poziomów też: zob. „Instalacja, muzyka, wolniejszy start i ewolucje”, punkt 8.*
2. **Szersze regiony.** Wiatrołomy obejmują poziomy 1–25, a Uroczysko Kamieni 26–50. Grupy w Wiatrołomach pojawiają się od poziomu 5, a nie od 2. *Regiony dzielą się teraz na regiony wewnętrzne: zob. „Regiony wewnętrzne i obóz”, punkty 1 i 2.*
3. **Obrażenia z malejącym zwrotem.** Siła, Zręczność i Intelekt zwiększają obrażenia broni o 250% × P / (P + K), gdzie K = 40 + 20 × poziom postaci (`scalingMax` w `data/balance.json`). Zastępuje to stałe +3% za punkt z punktu 5 Etapu 1. Przy stałych procentach obrażenia rosły z poziomem podwójnie, z bronią i z punktami, a HP tylko raz, więc na wysokich poziomach walka trwałaby jeden cios. Typowa postać ma teraz premię ok. +27–29% na każdym poziomie, od 1 do 500. Potwory liczą obrażenia tak samo i biją z mnożnikiem 1,4 zamiast 2,2 (`damageMultiplier`).
4. **Ekwipunek nie nadąża za poziomem.** Przy szybkich awansach postać nosi przedmioty znalezione kilka poziomów wcześniej. Naturalna broń i pancerz potworów odpowiadają więc poziomowi, który postać miała połowę swojego czasu gry wcześniej, ale najwyżej 45 minut eksploracji wstecz (`gearLagMinutes`). Przykłady: na poziomie 10 jest to poziom 7, na poziomie 20 poziom 18, a od poziomu ok. 35 ten sam poziom. Bez tego potwory na poziomach 5–20 biły za mocno postać w starszym ekwipunku.

### Eksploracje

5. **Nazwa.** We wszystkich tekstach gry „polowanie” to teraz „eksploracja”. Ogólnym słowem zostaje „wyprawa”, np. „Raport z wyprawy”. Identyfikatory w kodzie i API (`hunt`, `/api/hunts`) się nie zmieniły, bo nie widać ich w grze.
6. **Mało walk, każda za swój czas.** Wyprawa ma 1 walkę przy 1 minucie, 2 przy 5 minutach, 3 przy 15, 4 przy godzinie i 5 przy 4 godzinach (`fightsByMinutes`). Każda walka odpowiada za swoją część czasu: XP, złoto i szansa na łup mnożą się przez minuty na walkę podzielone przez 12. Na godzinę każda długość daje więc tyle samo, a długa wyprawa nie oznacza 20 walk. Punkt zastępuje punkt 14 Etapu 1 i punkt 4 „Uwag autora po Etapie 1”.
7. **Spotkania wymagające i elita.** Każdy region ma listę spotkań wymagających (`tough` w `data/regions.json`): większe grupy z przeciwnikami o 1 poziom wyższymi. Wypada z nich półtora raza więcej przedmiotów, z podwojonymi szansami rzadkości od rzadkiej w górę. Ich szansa rośnie z długością wyprawy (`toughChanceByMinutes`): 0% przy 1 minucie, 5% przy 10, 15% przy 30, 30% przy 2 godzinach i 40% przy 4 godzinach. W Wiatrołomach pojawiają się od poziomu 10, a w raporcie mają znacznik „wymagająca”. *Spotkania wymagające należą teraz do regionów wewnętrznych, w Wiatrołomach od poziomu 11: zob. „Regiony wewnętrzne i obóz”, punkt 1.* Elita trafia się z szansą 0,6% na każde 12 minut wyprawy, czyli przy 4 godzinach w 2,4% walk i w ok. co dziewiątej wyprawie. Punkt zastępuje szansę elity z punktu 17 Etapu 1. Dzięki tym spotkaniom długa wyprawa daje lepsze łupy i do ok. 25% więcej XP na godzinę, ale też większe ryzyko.
8. **Znaleziska** przypadają średnio co 10 minut, a nie co 20. Połowa to złoto, połowa przedmioty. Długa wyprawa ma więc więcej zdarzeń po drodze, a zdarzenia losowe dojdą w Etapie 2. Punkt zastępuje punkt 8 „Uwag autora po Etapie 1”. Postać zdobywa średnio ok. 3,5–4 przedmiotów na godzinę. *Nieaktualne: zob. „Regiony wewnętrzne i obóz”, punkt 8.*
9. **Czas wyprawy.** Suwak ma wartości 1 minuta, a potem 5, 10, 15 minut i dalej co 5 minut: do 45 minut na poziomie 1 i do 4 godzin od poziomu 2. Nad suwakiem jest nazwa długości z `data/texts.json` (`lengths`):
   - bardzo krótka: 1–10 minut,
   - krótka: 11–30 minut,
   - średnia: 31–120 minut,
   - długa: ponad 2 godziny.

   Nazwy są tylko podpowiedzią, bo o wszystkim decyduje czas. Punkt zastępuje minimum 5 minut z punktu 1 „Odpowiedzi autora na otwarte kwestie” i zakres suwaka z punktu 20 „Odpowiedzi autora po wdrożeniu”. *Zakres suwaka jest nieaktualny: zob. „Drabinka eksploracji i lochy”, punkt 1.*
10. **Złoto z krótkich wypraw.** Złoto z walk sumujemy bez zaokrągleń i zaokrąglamy dopiero wynik. Wcześniej przy 5-minutowej wyprawie każdy przeciwnik dawał ułamek złota zaokrąglany do zera.

### Walka i przedmioty

11. **Cel ataku.** Postać bije przeciwnika, którego pokona najszybciej. Liczy, ile średnich ciosów potrzeba na HP każdego przeciwnika, z jego pancerzem albo odpornością na żywioł broni. Nie rozprasza więc ciosów między stwory. Potwory dalej wybierają cel losowo, przednią linię częściej. *Pozycja wroga też się teraz liczy: zob. „Celowanie, łatwe miejsca, zadania, duch ognia i Google”, punkt 1.*
12. **Przedmioty klas.** Broń i druga ręka należą do klas (`weapons` i `offhands` w `data/classes.json`):
    - Wojownik: miecz, topór, tarcza,
    - Łucznik: łuk, kołczan,
    - Mag: kostur, fokus,
    - Kleryk: kropidło, tarcza, fokus,
    - Cień: sztylet, kołczan.

    Resztę nosi każdy. Łupy i znaleziska zawierają tylko przedmioty, których postać może używać, a do pustych slotów zakłada się tylko takie. Przedmiotu innej klasy, który już jest w plecaku, nie da się założyć (403 `wrong_class`), ale da się go sprzedać. Karta przedmiotu mówi, dla jakiej klasy jest i ile da za niego złomiarz.
13. **Kurtka.** Baza „Kurta” nazywa się teraz „Kurtka”.
14. **Złomiarz.** Gdy nic nie trwa, a plecak nie jest pusty, raport ma przycisk „Sprzedaj zbędne przedmioty u złomiarza”. Przycisk otwiera kartę z hasłem „Sprzedaj przedmioty z plecaka o rzadkości niższej lub równej:” i przyciskiem dla każdej rzadkości. Każdy przycisk pokazuje liczbę przedmiotów i złoto. Po potwierdzeniu serwer sprzedaje przedmioty z plecaka (`POST /api/items/sell`), a założone zostają. Cena to poziom × `sellGoldPerLevel` (1) × mnożnik rzadkości: 1, 2, 4, 8, 16, 32 albo 64, ale co najmniej 1 złota. Postać złomiarza dojdzie później. Punkt zastępuje brak sprzedaży z punktu 26 Etapu 1. *Stół złomiarza podnosi cenę: zob. „Obóz, pierwsza część”, punkt 9.*

### Interfejs

15. **Paski.** Górny pasek ma dwa rzędy po dwa paski: w lewej kolumnie HP nad maną, w prawej XP postaci (złote) nad XP klasy (fioletowe). Punkt zastępuje punkt 12 „Uwag autora po Etapie 1”.
16. **Opis zagrożenia** to jedno zdanie: „Zagrożenie to szansa omdlenia na wyprawie.” Gra nie tłumaczy już graczowi, jak je liczy.
17. **Tryb testowy w Ustawieniach.** Gdy serwer ma włączony tryb testowy (`TEST_MODE`), Ustawienia mają przełącznik „Tryb testowy”. Wyłączony chowa „Pomiń czas” w tej przeglądarce, a wybór pamięta przeglądarka. Serwer dalej słucha tylko `TEST_MODE`.
18. **Encyklopedia** to osobny dokument z wewnętrznym spisem gry: klasy, statystyki, rzadkości, przedmioty, afiksy, żywioły i efekty, zdolności, potwory, regiony i przebieg wyprawy. Źródłem prawdy jest `data/`. Po każdej zmianie treści gry poprawiamy też encyklopedię.

### Technika

19. **Zagrożenie po zmianie skali.** Serwer rozgrywa po 3 próbne walki z każdym spotkaniem regionu i z elitą. Niepewne spotkania, czyli z przegraną albo z walką kosztującą ponad 60% HP, dzielą potem między siebie 27 dodatkowych walk wśród zwykłych i 18 wśród wymagających, według tego, jak często się trafiają. Postać, która przegrywa co najmniej 15% zwykłych walk, dodatkowych walk nie dostaje, bo i tak ma „bardzo wysokie” zagrożenie na każdej wyprawie. HP liczymy w krokach co 4%.

    Porównanie z 1000 symulowanych wypraw objęło 375 przypadków: 5 klas, poziomy 3–50 w obu regionach, także poniżej poziomu regionu, i wyprawy od 1 minuty do 4 godzin. Średni błąd wynosi ok. 0,6 punktu procentowego. W 17 przypadkach poziom zagrożenia różni się o jeden, zawsze tuż przy progu, a różnicy o dwa poziomy nie ma. Punkt zastępuje liczbę prób z punktu 16 „Uwag autora po Etapie 1”. *Liczby porównania są nieaktualne: zob. „Regiony wewnętrzne i obóz”, punkt 15.*

    Zrzut ekranu autora pokazywał Cienia na poziomie 5 w Wiatrołomach z oceną „bardzo wysokie” dla 2 h 15 min. Na 140 buildach Cienia, losowych i mocnych, stara ocena zgadzała się z symulacją: ryzyko wynosiło 11–95%. Wiatrołomy kończyły się wtedy na poziomie 5, a grupy biły mocno. Udana 4-godzinna wyprawa ze zrzutu była więc możliwa, choć ryzykowna. Po zmianie skali i balansu każdy z tych buildów ma poniżej 15%, zarówno w ocenie, jak i w symulacji.
20. **Czas procesora.** Walki próbne nie składają już tekstów relacji, bo nikt ich nie czyta. Same teksty zajmowały większość czasu walki. Pętla szans omdlenia sumuje od razu wszystkie spotkania. Pomiary:
    - Rozgrzany kod liczy zagrożenie dla jednego regionu w najwyżej ok. 2 ms, a wcześniej zajmowało to do 15 ms. 4-godzinna wyprawa z raportem to ok. 1,5 ms.
    - Pierwsze wywołanie w świeżym procesie trwa 5–15 ms, głównie przez kompilację kodu. Najdroższy przypadek to postać poniżej poziomu regionu.
    - Cloudflare pisze, że limit ma luz dla sporadycznych przekroczeń. Wystarcza to tak jak w punkcie 36 Etapu 1, a Worker trzyma próbki w pamięci, dopóki build się nie zmieni.

    Punkt zastępuje punkt 17 „Uwag autora po Etapie 1”.
21. **Balans w liczbach** (symulacja po 400 wypraw na przypadek, typowe postacie). *Nieaktualne: zob. „Regiony wewnętrzne i obóz”, punkt 17.*
    - W Wiatrołomach do 30 minut nikt nie mdleje, a przy 2 godzinach ryzyko wynosi najwyżej ok. 4%. Przy 4 godzinach Wojownik, Łucznik i Kleryk nie mdleją wcale, a Cień i Mag na poziomach 10–15 do ok. 8% i 18%.
    - W Uroczysku Kamieni ryzyko 4-godzinnej wyprawy wynosi dla Wojownika, Łucznika i Kleryka najwyżej ok. 4–5%, a dla Cienia do ok. 14%. Mag ma przy 4 godzinach 30–40%, a przy 2 godzinach 10–16%. Skok trudności po wejściu do Uroczyska zostaje, zgodnie z decyzją autora.
    - Mag jest najsłabszą klasą na długich wyprawach. To pytanie do autora.
    - Złoto na godzinę: ok. 20 na poziomie 1, 100 na poziomie 5, 210 na poziomie 10 i 1100 na poziomie 50.

## Regiony wewnętrzne i obóz (23.10.2026)

Zmiany poniżej wynikają z trzech kolejnych wiadomości autora i zastępują wskazane wcześniej punkty. Najważniejsze: każdy region dzieli się na regiony wewnętrzne z własnymi poziomami potworów, gracz wybiera je w zakładce Walka jako kółka, a otwiera je poziom klasy. Długie wyprawy dają mniej łupów i mniej poziomów naraz. Dokument projektowy opisuje gracza jako zarządcę postaci i obozu.

### Regiony wewnętrzne

1. **Pięć regionów wewnętrznych w regionie.** Region ma 25 poziomów i dzieli się na 5 regionów wewnętrznych po 5 poziomów (`areas` w `data/regions.json`, w kodzie `area`). Region wewnętrzny ma własną nazwę, opis, spotkania i spotkania wymagające, a cechę, elitę i bezpieczeństwo bierze z regionu.
   - Wiatrołomy: Skraj Wiatrołomów (1–5), Lisie Jary (6–10), Krucze Wykroty (11–15), Żmijowe Zwalisko (16–20), Dzicza Głusza (21–25).
   - Uroczysko Kamieni: Omszałe Głazy (26–30), Pajęczy Parów (31–35), Rysia Grań (36–40), Wilcze Kręgi (41–45), Serce Uroczyska (46–50).

   Doszły trzy potwory: Lis, Puszczyk i Niedźwiedź. W Wiatrołomach spotkania wymagające zaczynają się w Kruczych Wykrotach, czyli od poziomu 11. Dzik bije słabiej (współczynnik 0,55 zamiast 0,65), a Basior też (0,6 zamiast 0,7). Razem z lżejszymi spotkaniami obniżyło to ryzyko Maga tuż po wejściu do Dziczej Głuszy i Wilczych Kręgów. W pierwszej wersji mdlał tam na 4-godzinnych wyprawach w ok. 70–86% przypadków.
2. **Poziom potworów to poziom miejsca, nie postaci.** Zgodnie z uwagą autora potwory nie dopasowują się do postaci. Cała grupa dostaje jeden poziom z zakresu regionu wewnętrznego, a niższe poziomy trafiają się częściej: wagi 8, 4, 2, 1 i 1 od najniższego (`monsterLevelWeights`), więc najniższy poziom wypada w połowie walk. Spotkanie wymagające ma poziom o 1 wyższy. Elita ma poziom o 1 wyższy niż najwyższy poziom miejsca. Tylko postać na poziomie 1 (`beginnerLevel`) spotyka zawsze najniższy poziom miejsca, bo zaczyna bez broni. Znaleziska mają poziom losowany tak samo jak potwory. Punkt zastępuje punkt 16 Etapu 1 i poziom elity z punktu 17 Etapu 1.
3. **Miejsce wybiera gracz, a otwiera je poziom klasy.** Gracz sam wybiera region wewnętrzny, także dużo łatwiejszy od postaci. Postać na poziomie 20 może eksplorować Skraj Wiatrołomów, ale dostanie tam mało doświadczenia (punkt 20 Etapu 1), więc dłużej poczeka na awans. Region wewnętrzny otwiera się, gdy poziom klasy, a nie postaci, dojdzie do poziomu tuż pod jego najniższym poziomem (`areaUnlockLead` 1 w `data/balance.json`). Cień z poziomem klasy 5 może więc iść do Skraju Wiatrołomów i do Lisich Jarów (6–10), a reszta czeka. Pierwszy region wewnętrzny Uroczyska Kamieni otwiera się na poziomie klasy 25. Serwer odrzuca start w zamkniętym miejscu (403 `area_locked`, „To miejsce odblokujesz na poziomie klasy 5.”). Poziom klasy jest zawsze co najmniej taki jak poziom postaci, bo klasa dostaje to samo XP, a jej poziom wymaga go mniej (punkt 6 „Uwag autora po Etapie 1”). Miejsce dla poziomu postaci jest więc zawsze otwarte.
4. **Walka w trzech krokach.** Zakładka Walka pokazuje regiony, a przy każdym liczbę otwartych miejsc albo poziom klasy, który otworzy pierwsze. Dotknięcie regionu pokazuje jego regiony wewnętrzne jako kółka z obrazkiem miejsca, nazwą i zakresem poziomów. Zamknięte kółka są szare, z kłódką i potrzebnym poziomem klasy. Dotknięcie otwartego kółka otwiera widok wyprawy: obrazek, opis, uwagę o poziomie, suwak czasu, zagrożenie i „Wyrusz”. Pozostałe zasady:
   - Każdy krok ma własny adres, np. `#/walka/windfalls/fox-ravines`, i przycisk „Powrót”.
   - „Powrót” i przycisk wstecz w telefonie prowadzą w to samo miejsce. Po „Wyrusz” gra wraca do głównego widoku Walki z licznikiem wyprawy.
   - Podczas wyprawy każdy z tych adresów pokazuje główny widok Walki.
   - Uwaga „wyżej niż Twoja postać” pojawia się, gdy postać ma niższy poziom niż miejsce. Uwaga „za łatwe” pojawia się od 3 poziomów powyżej miejsca.
   - Obrazki to wektorowe zastępniki w stylu portretów klas (`src/client/area-art.js`), do podmiany na grafiki autora. Test pilnuje, żeby każdy region wewnętrzny z `data/` miał obrazek.
   - Przeglądarka pamięta czas wyprawy osobno dla każdego regionu wewnętrznego. Punkt zastępuje punkt 33 Etapu 1.
5. **API i baza.** `GET /api/content` podaje przy każdym regionie wewnętrznym poziom klasy, który go otwiera (`unlockClassLevel`). `GET /api/hunts/options?area=` zwraca zagrożenie jednego otwartego regionu wewnętrznego. Bez parametru odpowiedź obejmuje otwarte regiony wewnętrzne dla poziomu postaci. `POST /api/hunts` przyjmuje `areaId`. Stare `?region=` i `regionId` dalej działają: serwer wybiera wtedy region wewnętrzny dla poziomu postaci. Kolumna `activities.region_id` przechowuje identyfikator regionu wewnętrznego, więc migracja nie była potrzebna. Wyprawy i raporty sprzed zmiany dostają region wewnętrzny dla poziomu postaci.

### Postęp i łupy

6. **Postęp w trakcie wyprawy.** XP z potworów dużo słabszych od postaci maleje według poziomu, który postać osiąga w trakcie wyprawy, a nie poziomu z jej startu. Wcześniej postać z poziomu 2 kończyła 4-godzinną wyprawę na poziomie ok. 12 i z prawie pełnym ekwipunkiem, bo do końca dostawała pełne XP. Teraz kończy średnio na poziomie 8 (najwyżej 10) z 4–5 przedmiotami, a 30 minut na poziomie 2 daje ok. poziomu 5. Pod koniec regionu wewnętrznego awans trwa 1,2–3 razy dłużej, niż podaje krzywa (najwięcej na poziomie 5), bo potwory mają tam zwykle niższy poziom niż postać. Na początku kolejnego regionu wewnętrznego awans trwa tyle, ile podaje krzywa, albo trochę krócej. Kto chce rosnąć szybciej, wybiera krótsze wyprawy i trudniejsze miejsca. Długa wyprawa zostaje sposobem na grę bez pilnowania.
7. **Pierwsza broń od razu w ręku.** Broń z pierwszej wygranej walki postać zakłada od razu i walczy nią do końca wyprawy. Wcześniej trafiała na postać dopiero przy odbiorze raportu, więc pierwsza wyprawa toczyła się do końca pięściami. Przy poziomach potworów z miejsca dawało to na pierwszej wyprawie 39–78% omdleń, a teraz omdleń nie ma. Punkt uzupełnia punkt 24 „Odpowiedzi autora po wdrożeniu”.
8. **Mniej łupów i puste znaleziska.** Znalezisko przypada średnio na 20 minut, a nie na 10. 40% znalezisk to złoto, 30% przedmiot, a 30% nic ciekawego, z krótkim zdaniem w relacji, np. „Ślady prowadzą donikąd.” (`findOutcomes` w `data/balance.json`, teksty `findNothing` w `data/texts.json`). Pokonany potwór zostawia przedmiot z szansą 6% (wcześniej 10%) za każde 12 minut walki. Postać zdobywa średnio 1,1–1,5 przedmiotu na godzinę zamiast 3,5–4. Punkt zastępuje punkt 8 „Nowej skali i eksploracji”. *Podział znalezisk jest nieaktualny: zob. „Obóz, pierwsza część”, punkt 11.*
9. **XP postaci i klasy w raporcie.** Podsumowanie raportu ma osobne wiersze „XP postaci” i „XP klasy”, a karę za omdlenie pokazuje jako „−N XP postaci”, bo kara zabiera tylko XP postaci. W eksploracji solo obie liczby są równe, bo cały wkład w walkę należy do postaci (punkt 19 Etapu 1). Z drużyną XP klasy będzie zależeć od wkładu w walkę.

### Odblokowania i klasy

10. **Odblokowania później.** Zgodnie z odpowiedzią autora moduły otwierają się później, po jednym na region wewnętrzny Wiatrołomów:
    - umiejętności na poziomie 5 (wcześniej 4),
    - profesje na poziomie 10 (wcześniej 6),
    - trening na poziomie 15 (wcześniej 8),
    - osada na poziomie 20 (wcześniej 10),
    - lochy na poziomie 25 (wcześniej 12).

    Darmowe zerowanie statystyk działa do poziomu 20 (wcześniej 10), a pierwsza ewolucja klasy jest na poziomie klasy 30 (wcześniej 25; *teraz 50: zob. „Instalacja, muzyka, wolniejszy start i ewolucje”, punkt 11*). Dokument projektowy ma nową tabelę odblokowań. Punkt zastępuje poziomy odblokowań z punktu 1 „Nowej skali i eksploracji” i próg zerowania z punktu 6 Etapu 1. *Lochy są teraz na poziomie 50: zob. „Drabinka eksploracji i lochy”, punkt 3.*
11. **Mag: trudniejszy start.** Zgodnie z odpowiedzią autora Mag zostaje trudniejszą klasą na starcie. Ekran tworzenia postaci pokazuje przy nim znacznik „trudniejszy start”, a przy Wojowniku i Kleryku dalej „łagodniejszy start” (pole `start` w `data/classes.json`: `gentle`, `normal` albo `hard`). Opis Maga kończy się zdaniem „Pierwsze kroki są trudne, a magia z czasem się odwdzięcza.” Łatwiej ma mu być później dzięki umiejętnościom i ewolucji klasy (Etap 3), co zapisuje dokument projektowy. Dziś Mag ma największe ryzyko na długich wyprawach (punkt 17).
12. **Mniej prowadzenia za rękę.** Zgodnie z uwagą autora komunikat Systemu w zakładce Walka mówi tylko: „Wiatrołomy to najbezpieczniejsze miejsce na start. Wybierz czas eksploracji i wyrusz.” Tak samo skróciliśmy komunikat przy tworzeniu postaci do „Wykryto nową istotę na skraju puszczy. Wybierz ścieżkę klasy i podaj imię.” Gra nie mówi już na starcie, że postać nie ma broni, ani co znaczą znaczniki startu. Punkt zastępuje zdanie o komunikatach z punktu 1 „Uwag autora po Etapie 1”.

### Obóz i plany

13. **Gracz jako zarządca i obóz.** Na prośbę autora dokument projektowy opisuje gracza jako zarządcę postaci. Od startu gracz równolegle rozwija obóz w lesie, który z czasem staje się wioską, a potem miastem. Osada z niezależnymi NPC zostaje, a werbunek dojdzie w module budowania królestwa. Dokument ma nową sekcję „Obóz”, etap planu „Etap 2a — obóz” i dwa nowe pytania: czy obóz powstaje przed zdarzeniami i jakie są pierwsze budynki. Obóz ma dać zajęcie zaangażowanemu graczowi w czasie bardzo krótkich, krótkich i średnich wypraw. *Pierwsza część obozu już jest: zob. „Obóz, pierwsza część”.*
14. **Sklep Play i zakupy.** Docelowo gra trafi do Sklepu Play jako aplikacja. `CLAUDE.md` przypomina kolejnym sesjom, że autor może dokupić tani plan Cloudflare albo domenę i że trzeba to zalecić, gdy się przyda.

### Technika i balans

15. **Zagrożenie w regionach wewnętrznych.** Ocena działa jak w punkcie 19 „Nowej skali i eksploracji”, ale dla jednego regionu wewnętrznego. Próbne walki mają poziomy miejsca, tak jak na wyprawie. Zrzut ekranu autora pokazywał Wojownika na poziomie 12 (klasa 14) z pełnym HP i oceną „bardzo wysokie” dla 4 godzin w Wiatrołomach. Postać zdobyła te poziomy i ekwipunek w jednej 4-godzinnej wyprawie z poziomu 2, więc nosiła przedmioty z poziomów 1–2, a potwory miały wtedy poziom postaci, czyli ok. 12. Ocena była prawdziwa, a nie błędem trybu testowego: odtworzona postać mdlała w symulacji w ok. 41% 4-godzinnych wypraw (ocena: 45%). Ta sama postać ma teraz w Kruczych Wykrotach (11–15) ok. 3% (ocena: ok. 1%), a w Skraju Wiatrołomów i Lisich Jarach 0%.

    Porównanie z 400 symulowanymi wyprawami objęło 420 przypadków: 5 klas, poziomy 3–50, miejsce dla poziomu postaci i 5 miejsc powyżej niego, wyprawy od 5 minut do 4 godzin. Średni błąd wynosi ok. 1 punktu procentowego. W 47 przypadkach poziom zagrożenia różni się o jeden, prawie zawsze przy progu 1% albo 5%, w 28 z nich w dół. Różnicy o dwa poziomy nie ma. Sprawdziliśmy dwie poprawki: próbne walki rozłożone równo po poziomach miejsca nie dały nic, a więcej dodatkowych walk dla kosztownych spotkań dało ok. 0,9 punktu kosztem czasu procesora. Ocena z 200 walkami na spotkanie ma błąd ok. 0,7 punktu, czyli tyle, ile szum samej symulacji. Zostaje więc obecna. Punkt zastępuje liczby porównania z punktu 19 „Nowej skali i eksploracji”.
16. **Czas procesora.** Rozgrzany kod liczy zagrożenie jednego regionu wewnętrznego średnio w ok. 0,7 ms, a najwyżej w ok. 4 ms (Mag w miejscu powyżej swojego poziomu). Pierwsze wywołanie w świeżym procesie trwa 9–17 ms, głównie przez kompilację kodu, czyli podobnie jak w punkcie 20 „Nowej skali i eksploracji”. Strona pyta tylko o miejsce otwarte na ekranie, a Worker trzyma próbki w pamięci, dopóki build się nie zmieni.
17. **Balans w liczbach** (symulacja po 300 wypraw na przypadek, typowe postacie, pełne HP):
    - W Wiatrołomach ryzyko jest największe tuż po wejściu do regionu wewnętrznego i maleje do jego końca. Do 30 minut wynosi najwyżej ok. 3%. Przy 4 godzinach Wojownik, Łucznik i Kleryk mają najwyżej ok. 4%, Cień do ok. 15% (Dzicza Głusza), a Mag do ok. 7%, poza Dziczą Głuszą: 21% przy 2 godzinach i 43% przy 4.
    - W Uroczysku Kamieni ryzyko 4-godzinnej wyprawy tuż po wejściu do regionu wewnętrznego wynosi dla Wojownika, Łucznika, Kleryka i Cienia najwyżej ok. 14%, a dla Maga 8–49% (najwięcej w Wilczych Kręgach). Pod koniec regionu wewnętrznego spada do najwyżej ok. 8%, a u Maga do ok. 12%.
    - Tempo w pierwszym regionie wewnętrznym: poziomy 1 i 2 trwają ok. 5 minut, poziom 3 ok. 8 minut, a poziom 4 ok. 12 minut, bo potwory mają tu głównie poziomy 1–2. W Lisich Jarach poziom 5 trwa ok. 3 minut. Krzywa zakłada 4 minuty na każdy z poziomów 1–5. *Rozstrzygnięte: zob. „Obóz, pierwsza część”, punkt 1.*
    - Gracz, który robi wyprawy po 30 minut i zawsze wybiera najwyższe otwarte miejsce, dochodzi do poziomu 21 po ok. 4,5 godziny, do 26 po ok. 6,5 godziny i do 51 po ok. 26 godzinach (według krzywej: 3,9, 6,3 i 29,7 godziny). Mdleje przy tym Wojownik w ok. 1% wypraw, a Mag w ok. 9%. Gracz, który wybiera miejsce dla poziomu postaci, dochodzi do tych poziomów po ok. 6,4, 9,3 i 33 godzinach.

## Obóz, pierwsza część (23.10.2026)

Zmiany poniżej wynikają z odpowiedzi autora na pytania z poprzedniej rundy. Najważniejsze: szybsze poziomy 3–5, obóz z trzema budynkami w prawym górnym rogu ekranu i zasoby znajdowane na eksploracjach. Obóz powstaje przed zdarzeniami.

### Odpowiedzi autora

1. **Szybsze poziomy 2–5.** Zgodnie z odpowiedzią autora pierwsze poziomy wymagają mniej XP (`earlyXpFactors` w `data/balance.json`: 1, 0,861, 0,551, 0,402 i 0,314). Poziom 1 wymaga 43 XP, a poziomy 2–5 po 80 XP, więc próg nigdy nie maleje. Każdy z poziomów 1–5 trwa w Skraju Wiatrołomów średnio ok. 5 minut: 4,9, 4,8, 4,8, 5,1 i 5,1 minuty (wcześniej poziom 3 trwał 8, a poziom 4 12 minut). Pięciominutowa wyprawa daje awans postaci na poziomie 1 w 84% przypadków, a na poziomach 2–5 w ok. 45–55%. Awans klasy daje w ok. 75–100% przypadków. Trzydzieści minut z poziomu 2 daje teraz ok. poziomu 5,8 zamiast 4,8. Cztery godziny z poziomu 2 dalej kończą się na poziomie ok. 8. Punkt rozstrzyga pytanie o tempo z punktu 17 „Regionów wewnętrznych i obozu”. *Czasy są nieaktualne, bo pierwsze poziomy trwają teraz ok. 20 minut: zob. „Instalacja, muzyka, wolniejszy start i ewolucje”, punkt 8. Mnożniki zostają.*
2. **Obóz przed zdarzeniami.** Etap 2a (obóz) idzie przed Etapem 2 (zdarzenia). Prace obozu wykonywane przez NPC dojdą razem z werbunkiem, a budynków będzie z czasem dużo więcej.

### Obóz

3. **Przycisk Obóz w prawym górnym rogu.** Zgodnie z życzeniem autora obóz nie jest częścią Osady. Ma własny przycisk z ikoną namiotu i napisem „Obóz” w górnym pasku, między złotem a ustawieniami. Podczas budowy przycisk pokazuje czas do końca. Ekran obozu ma adres `#/oboz` i przycisk „Powrót” do ostatniej zakładki, jak raport. Obóz jest dostępny od pierwszej minuty gry.
4. **Trzy budynki na start**, każdy do poziomu 10 (`data/buildings.json`):
   - Ognisko: odpoczynek między wyprawami szybszy o 10% na poziom,
   - Szałas na łupy: plecak większy o 5 miejsc na poziom,
   - Stół złomiarza: złomiarz płaci więcej o 10% na poziom.

   *Doszły trzy budynki produkcyjne: zob. „Produkcja w obozie”, punkt 1.*
5. **Koszty i czasy.** Walutą jest głównie złoto, a zasoby dochodzą od wyższych poziomów. Poziom L kosztuje `base × growth^(L − fromLevel)` każdego surowca od jego poziomu `fromLevel` i buduje się `base × growth^(L − 1)` minut. Przykłady dla Ogniska:
   - poziom 1: 10 złota, 1 minuta,
   - poziom 2: 19 złota i 6 drewna, 2 minuty,
   - poziom 4: 69 złota, 19 drewna i 6 kamienia, 11 minut,
   - poziom 6: 248 złota, 63 drewna i 19 kamienia, 52 minuty,
   - poziom 10: 3227 złota, 661 drewna i 204 kamienia, ok. 20 godzin.

   Szałas i Stół kosztują trochę więcej złota, a budują się tyle samo. Pierwszy poziom każdego budynku kosztuje tylko złoto, bo nowa postać nie ma jeszcze zasobów, a test danych tego pilnuje. Pierwsza budowa jest możliwa po jednej, dwóch eksploracjach. *Koszty są nieaktualne: zob. „Budowa za zasoby, dźwięki i grafiki”, punkt 1.*
6. **Jedna budowa naraz.** Ulepszenie liczy się po upływie jego czasu, bez odbierania. Strona pobiera wtedy postać od nowa i pokazuje krótki komunikat, np. „Ognisko: poziom 2 gotowy.” Budować można także podczas eksploracji, bo obóz nie zajmuje czynności postaci. Serwer sprawdza w jednej transakcji, że nic się nie buduje, budynek ma oczekiwany poziom i starcza złota i zasobów, więc dwa dotknięcia naraz rozpoczną i opłacą jedną budowę. W trybie testowym ekran obozu ma „Pomiń czas”, które od razu kończy budowę.
7. **Ognisko a odpoczynek.** Premia działa od końca ulepszenia. Każdy start budowy, gdy postać odpoczywa, zapisuje HP odzyskane do tej chwili. Dzięki temu serwer i strona liczą HP z jedną możliwą zmianą tempa (`regen.change`).
8. **Plecak ma 20 miejsc**, a każdy poziom Szałasu dodaje 5 (`bagSlots`). Założone przedmioty się nie liczą. Gdy przy odbiorze raportu znaleziska się nie mieszczą, złomiarz od razu kupuje najsłabsze przedmioty, nowe albo stare, po cenie obozu. Najpierw idą przedmioty, których klasa nie może używać, potem te o niższej rzadkości i poziomie, a nowe przed starymi. Raport mówi o tym komunikatem Systemu i oznacza sprzedane znaleziska. Przy pełnym plecaku nie da się zdjąć przedmiotu, ale zamiana na inny z plecaka działa. Postacie z ponad 20 przedmiotami w plecaku stracą przy następnym odbiorze najsłabsze z nich. Punkt rozstrzyga otwartą kwestię dokumentu o rozmiarze plecaka i koszcie jego poszerzania oraz zastępuje brak limitu z punktu 26 Etapu 1. *Plecak ma teraz 30 miejsc: zob. „Produkcja w obozie”, punkt 6.*
9. **Stół złomiarza** podnosi cenę każdej sprzedaży: przycisku złomiarza w raporcie i sprzedaży przy pełnym plecaku. Karta przedmiotu pokazuje cenę z premią.

### Zasoby

10. **Trzy zasoby i złoto.** Autor wymienił cztery zasoby na start, a nazwał trzy, więc czwartym jest złoto. Zasoby to drewno, kamień i ruda żelaza (`data/resources.json`). Dotknięcie złota w górnym pasku rozwija listę wszystkich czterech, a ekran obozu pokazuje je na górze. *Doszły Punkty Systemu: zob. „Produkcja w obozie”, punkt 7.*
11. **Zasoby z eksploracji.** Zgodnie z życzeniem autora zasoby zajmują miejsce większości pustych znalezisk. Znalezisko to w 35% przypadków złoto, w 30% przedmiot, w 30% zasób, a w 5% nic ciekawego (`findOutcomes`). Wcześniej było to 40%, 30% i 30% pustych. Ilość zasobu to poziom znaleziska × 4 × losowo 0,5–1,5 (`findResourcePerLevel`). Rodzaj wynika z wag regionu (`resources` w `data/regions.json`): w Wiatrołomach drewno 5, kamień 3, ruda 2, a w Uroczysku Kamieni 3, 5 i 2. Podsumowanie raportu ma wiersz „Zasoby”, np. „Drewno +17 · Kamień +4”, a relacja zdania w rodzaju „Zebrano: drewno +6.” Punkt zastępuje podział znalezisk z punktu 8 „Regionów wewnętrznych i obozu”. *Rodzaj zasobu nie jest już losowany: zob. „Budowa za zasoby, dźwięki i grafiki”, punkty 3 i 4.*
12. **API i baza.** Migracja `0003_camp.sql` dodaje kolumnę `characters.resources` (JSON) i tabelę `buildings`. Wiersz budynku trzyma poziom, który budynek ma po końcu ulepszenia, oraz czasy startu i końca. Do tej chwili budynek ma poziom o jeden niższy, więc nic nie trzeba zapisywać, gdy budowa się kończy. Postać w API ma `resources`, `bagCapacity` i `camp` (budynki z kosztem, czasem i premią następnego poziomu oraz trwającą budowę). `POST /api/camp/build` (`buildingId`) zaczyna ulepszenie, a w trybie testowym `POST /api/test/skip-build` je kończy. „Zacznij od nowa” usuwa też budynki. *Doszło zbieranie z magazynów: zob. „Produkcja w obozie”, punkt 5.*

## Produkcja w obozie (24.10.2026)

Zmiany poniżej wynikają z dwóch wiadomości autora. Najważniejsze: trzy budynki, które powoli wytwarzają zasoby, plecak na 30 miejsc i zasób Punkty Systemu, na razie bez źródła i bez zastosowania.

### Budynki produkcyjne

1. **Tartak, Kamieniołom i Kopalnia.** Zgodnie z życzeniem autora obóz ma trzy budynki, które powoli wytwarzają zasoby. Każdy ma 10 poziomów (`data/buildings.json`, premia `production`):
   - Tartak: 6 drewna na godzinę za każdy poziom,
   - Kamieniołom: 4 kamienia na godzinę za każdy poziom,
   - Kopalnia: 3 rudy żelaza na godzinę za każdy poziom.

   Autor nie określił tempa, więc rośnie ono z poziomem, jak premie pozostałych budynków. Proporcje są takie jak wagi zasobów w Wiatrołomach: drewna najwięcej, rudy najmniej. Godzina eksploracji w Skraju Wiatrołomów daje ok. 3,4 drewna, a Tartak na poziomie 1 do 6. W Kruczych Wykrotach (poziom 13) eksploracja daje ok. 23 drewna na godzinę, czyli prawie tyle, ile Tartak na poziomie 4 (24). Tartak na poziomie 10 wytwarza 60 drewna na godzinę, a eksploracja w Sercu Uroczyska ok. 47. Na ekranie obozu budynki produkcyjne stoją przed pozostałymi.
2. **Magazyn na godzinę za każdy poziom.** Zgodnie z życzeniem autora magazyn budynku na poziomie 1 mieści godzinę produkcji, a na poziomie 10 dziesięć godzin (`storageHours` 1 za poziom). *Teraz dwie godziny na poziom: zob. „Ramki w raporcie, wolniejszy Stół rzemieślniczy i większe magazyny”, punkt 5.* Pojemność rośnie więc szybciej niż tempo:
   - Tartak na poziomie 1 wytwarza 6 drewna na godzinę i mieści 6,
   - na poziomie 2 wytwarza 12 i mieści 24,
   - na poziomie 10 wytwarza 60 i mieści 600.

   Pełny magazyn zatrzymuje produkcję, aż gracz go opróżni przyciskiem „Zbierz” na karcie budynku. Zebrane zasoby trafiają do zasobów postaci, czyli na listę pod złotem w górnym pasku. Zbieranie zostawia w magazynie rozpoczętą jednostkę, więc częste zbieranie niczego nie traci. Po opróżnieniu pełnego magazynu produkcja rusza od chwili zbierania. Karta budynku pokazuje zawartość magazynu, pasek i czas do zapełnienia. Złota kropka przy przycisku Obóz w górnym pasku oznacza, że któryś magazyn jest pełny.
3. **Rozbudowa wstrzymuje produkcję.** Start ulepszenia budynku produkcyjnego od razu zbiera to, co jest w magazynie. Podczas budowy budynek nic nie wytwarza, a po jej końcu rusza z tempem i magazynem nowego poziomu. Dzięki temu magazyn ma zawsze jedno tempo i serwer liczy go jednym wzorem. Magazyn pojawia się na karcie dopiero po pierwszej budowie.
4. **Koszty i czasy.** Jak w pozostałych budynkach poziom 1 kosztuje tylko złoto, zasoby dochodzą od wyższych poziomów, a budowa trwa od 1 minuty do ok. 20 godzin. Przykłady:
   - Tartak: poziom 1 kosztuje 15 złota, poziom 2 29 złota i 6 drewna, poziom 3 54 złota, 11 drewna i 4 kamienia, a poziom 10 4840 złota, 661 drewna i 245 kamienia.
   - Kamieniołom kosztuje tyle złota i drewna co Tartak. Zamiast kamienia potrzebuje rudy żelaza od poziomu 4: 3 rudy na poziomie 4 i 102 na poziomie 10.
   - Kopalnia jest o ok. jedną trzecią droższa: poziom 1 kosztuje 20 złota, a poziom 10 6454 złota, 882 drewna i 306 kamienia.

   Koszt pokrywają zasoby postaci, a nie magazyn. Kto chce ulepszyć Tartak drewnem z magazynu, najpierw je zbiera. *Koszty są nieaktualne: zob. „Budowa za zasoby, dźwięki i grafiki”, punkt 1.*
5. **API i baza.** Migracja `0004_production.sql` dodaje kolumnę `buildings.collected_at`, czyli chwilę, od której magazyn się zapełnia. Budynek produkcyjny w `camp.buildings` ma pole `production`: zasób, tempo na godzinę, pojemność, zawartość, chwilę `since`, od której strona liczy dalej, i `paused` podczas rozbudowy. Pozostałe zasady:
   - `POST /api/camp/collect` (`buildingId`) opróżnia magazyn i zwraca `collected`. Pusty magazyn daje 409 `nothing_to_collect`, a budynek bez produkcji 400 `invalid_building`.
   - Serwer przesuwa magazyn i dodaje zasoby w jednej transakcji, pod warunkiem że magazyn jest taki, jak go widział. Dwa dotknięcia naraz zbierają więc raz.
   - W trybie testowym „Pomiń czas” kończy trwającą budowę, a gdy nic się nie buduje, od razu zapełnia magazyny.

### Plecak i zasoby

6. **Plecak ma 30 miejsc.** Zgodnie z życzeniem autora bazowy plecak ma 30 miejsc zamiast 20 (`bagSlots`). Szałas na łupy dalej dodaje 5 miejsc na poziom, więc na poziomie 10 plecak mieści 80 przedmiotów. Punkt zastępuje liczbę z punktu 8 „Obozu, pierwszej części”.
7. **Punkty Systemu.** Zgodnie z prośbą autora zasób Punkty Systemu istnieje zawczasu (`system-points` w `data/resources.json`, z oznaczeniem `system`). Lista pod złotem i ekran obozu pokazują go w barwach Systemu. Na razie nie ma ich skąd zdobyć ani na co wydać. Ich rolę opisuje już sekcja „Punkty Systemu (przyszłość)” dokumentu projektowego: drobne ilości za osiągnięcia i kosmetyka, nigdy wymiana na złoto, przedmioty ani materiały. Dlatego test danych pilnuje, żeby żadne znalezisko ich nie dawało, a żaden budynek ich nie wytwarzał ani nie kosztował. *Punkty Systemu są teraz na koncie, a nie wśród zasobów: zob. „Plansza obozu i Punkty Systemu”, punkt 2.*

## Plansza obozu i Punkty Systemu (24.10.2026)

Zmiany poniżej wynikają z kolejnej wiadomości autora. Najważniejsze: obóz jest planszą w stylu Plemion z placem na każdy budynek, a Punkty Systemu to waluta premium konta, pokazana w jednej linii ze złotem.

### Punkty Systemu

1. **Waluta premium na kosmetykę.** Zgodnie z odpowiedzią autora Punkty Systemu (PS) to docelowo waluta premium wyłącznie na przedmioty kosmetyczne: bez pay2win, a nawet bez pay2progress. Nie kupią czasu, poziomów, przedmiotów, złota ani materiałów. Punkt doprecyzowuje sekcję „Punkty Systemu (przyszłość)” dokumentu projektowego.
2. **PS należą do konta.** *Nieaktualne: PS należą do postaci, zob. „Świeży start dla testujących”, punkt 2.* Waluta premium nie może przepaść przez „Zacznij od nowa”, więc PS leżą w tabeli `users` (`system_points`, migracja `0005_system_points.sql`), a nie w zasobach postaci. Postać w API ma pole `systemPoints`. Zasób `system-points` zniknął z `data/resources.json`, a z nim oznaczenie `system` i jego sprawdzanie w teście danych. Budynek ani znalezisko nie użyją PS, bo test danych odrzuca nieznane zasoby. Punkt zastępuje punkt 7 „Produkcji w obozie”.
3. **PS w jednej linii ze złotem.** Górny pasek pokazuje złoto i PS obok siebie, PS w barwach Systemu. Dotknięcie rozwija listę: złoto, PS, a pod kreską drewno, kamień i ruda żelaza. Żeby obie kwoty zmieściły się na telefonie, poziom postaci i poziom klasy stoją w pasku jeden nad drugim, mniejszą czcionką. Od miliona pasek skraca kwoty, np. do „1,2 mln”, a lista pod złotem podaje je w całości. Na telefonie o szerokości 390 px mieści się wszystko, także poziom 480 z 1,2 mln złota. Na najwęższych, 360 px, nazwa klasy dostaje wielokropek dopiero przy setkach tysięcy złota i tysiącach PS.

### Plansza obozu

4. **Obóz jako plansza.** Zgodnie z życzeniem autora obóz nie jest już listą, tylko planszą w stylu Plemion: polaną w lesie ze ścieżkami, stawem i skałami, na której każdy budynek ma stałe miejsce (`CAMP_PLOTS` w `src/client/camp-art.js`). Plac bez budynku to pusty plac z palikami, sznurem i bladym zarysem budynku, który tam stanie. Pod placem jest nazwa i poziom budynku. Nowy budynek dostaje swoje miejsce na planszy razem z rysunkiem. Test pilnuje, żeby każdy budynek z `data/` miał jedno i drugie, a place na siebie nie nachodziły.
5. **Wygląd rośnie z poziomem.** Każdy budynek ma trzy rysunki: dla poziomów 1–3, 4–7 i 8–10. Tartak to najpierw kozioł z kłodą, potem wiata nad nim, a na końcu szopa i deski. Budowę widać po rusztowaniu i liczniku nad placem. Rysunki są wektorowymi zastępnikami w stylu obrazków regionów wewnętrznych, do podmiany na grafiki autora.
6. **Dotknięcie budynku otwiera jego ekran** (np. `#/oboz/sawmill`): duży rysunek, opis, obecną premię, magazyn, trwającą budowę i następny poziom z kosztem i przyciskiem „Zbuduj” albo „Ulepsz”. „Powrót” i przycisk wstecz w telefonie prowadzą na planszę, jak w Walce. Mechanizm historii jest wspólny dla obu (`src/client/history.js`).
7. **Zbieranie z planszy.** Nad budynkiem produkcyjnym pojawia się dymek z tym, co leży w magazynie, np. „+6”. Pełny magazyn ma złoty, pulsujący dymek. Dotknięcie dymka zbiera zasoby bez wchodzenia do budynku.
8. **Zasoby nad planszą.** Nad planszą są tylko drewno, kamień i ruda żelaza, w trzech kolumnach, bo złoto i PS widać w górnym pasku. Dopóki nic nie stoi, pod planszą jest wskazówka „Dotknij pustego placu, żeby postawić pierwszy budynek.” *Wskazówka jest nieaktualna: zob. „Budowa za zasoby, dźwięki i grafiki”, punkt 5.*

## Nazwa gry: Insight (24.10.2026)

1. **Insight.** Zgodnie z decyzją autora gra nazywa się Insight, bo gracz ma wgląd w rozwój postaci, obozu i osady. Nazwa nie ma polskich znaków, więc nadaje się na domenę i do Sklepu Play. „Wzrost” był nazwą roboczą. Punkt rozstrzyga otwartą kwestię nazwy z dokumentu projektowego.
2. **Gdzie jest nowa nazwa.** Na karcie przeglądarki i na ekranie logowania, w README, CLAUDE.md, `package.json`, dokumencie projektowym i encyklopedii.
3. **Co na razie zostaje.** Nazwy techniczne, których gracz nie widzi albo których zmiana przerwałaby działanie:
   - Worker `wzrost` i adres `wzrost.wzrost.workers.dev`: Worker zmieni nazwę razem z podłączeniem własnej domeny, bo wtedy i tak zmienia się adres. *Worker zostaje `wzrost`: zob. „Domena insightrpg.com”, punkt 4.*
   - Baza D1 `wzrost`: zmiana nazwy wymagałaby przenoszenia danych, a konta i postacie mają zostać.
   - Klucze ustawień w przeglądarce (`wzrost.sound`, `wzrost.test-mode` i inne): nowe klucze wyzerowałyby graczom zapisane ustawienia.
   - Repozytorium `Skrajny97/Wzrost`: autor może je przemianować na końcu, bo zmiana w trakcie pracy mogłaby odciąć sesjom dostęp.

## Domena insightrpg.com (24.10.2026)

1. **Własna domena.** Autor kupił domenę insightrpg.com w Cloudflare Registrar, na tym samym koncie, na którym stoi gra. Gra odpowiada pod https://insightrpg.com jako domeną Workera (`routes` z `custom_domain` w `wrangler.jsonc`). Rekordy DNS i certyfikaty Cloudflare tworzy sam przy wdrożeniu.
2. **Adres z www.** https://www.insightrpg.com też pokazuje grę. Przekierowanie z www na adres bez www wymagałoby reguły w ustawieniach domeny, bo pliki strony Cloudflare podaje przed kodem Workera. Logowanie przeglądarka pamięta osobno dla każdego adresu.
3. **Zapasowy adres.** `wzrost.wzrost.workers.dev` działa dalej, z tym samym Workerem i tą samą bazą. Na nowym adresie gracz loguje się raz, a konto i postać zostają.
4. **Nazwa Workera zostaje `wzrost`.** Zmiana nazwy utworzyłaby drugiego Workera, a stary dalej działałby ze starym kodem przy tej samej bazie. Gracz tej nazwy nie widzi. Punkt zastępuje zapowiedź z punktu 3 „Nazwy gry: Insight”.
5. **Sprawdzenie po wdrożeniu.** Test po wdrożeniu (`tools/smoke-test.mjs`) sprawdza też domeny z wyniku `wrangler deploy`. Gdy domena jeszcze nie odpowiada, bo na przykład nowy certyfikat potrzebuje kilku minut, test tylko ostrzega. Podsumowanie przebiegu podaje adres domeny i adres zapasowy.

## Gra dla znajomych (24.10.2026)

1. **Workers Paid.** Autor wykupił plan Workers Paid. Żądanie może teraz używać do 30 s procesora zamiast 10 ms, a 10 mln żądań i 30 mln ms procesora miesięcznie jest w cenie. Pierwsze liczenie zagrożenia na świeżym serwerze (9–17 ms, punkt 16 „Regionów wewnętrznych i obozu”) nie grozi już błędem. Żądania i tak mają być szybkie.
2. **Tryb testowy tylko dla autora.** Zgodnie z decyzją autora „Pomiń czas” ma w grze tylko konto `Skrajny`:
   - `TEST_LOGINS` w `wrangler.jsonc` wylicza konta z trybem testowym, po przecinku i bez względu na wielkość liter. Pusta wartość daje go wszystkim.
   - Innym graczom strona nie pokazuje przełącznika w Ustawieniach ani „Pomiń czas”, a serwer odpowiada na `/api/test/*` kodem 404.
   - Strona bierze uprawnienie z `user.testMode`, które zwracają `/api/me`, logowanie i rejestracja. `/api/content` nie podaje już `testMode`.
   - Testy i `npm run dev` dają tryb testowy każdemu kontu. Osobny test (`test/test-mode.test.js`) sprawdza ustawienie z gry.
3. **Ikona aplikacji.** Strona ma manifest (`manifest.webmanifest`) i ikony z godłem Systemu: 192 i 512 px, maskowalną 512 px oraz `apple-touch-icon`. Z menu Chrome „Dodaj do ekranu głównego” instaluje grę jako aplikację: otwiera się na pełnym ekranie, w pionie. Service worker nie jest potrzebny, bo Chrome już go nie wymaga, a gra i tak działa tylko z siecią. To też pierwszy krok do Sklepu Play.
4. **Bez przycisku „Zgłoś uwagę”.** Zgodnie z decyzją autora znajomi przekazują uwagi w komunikatorze.

## Budowa za zasoby, dźwięki i grafiki (24.10.2026)

Zmiany poniżej wynikają z kolejnej wiadomości autora. Najważniejsze: budynki kosztują zasoby od pierwszego poziomu, eksploracja zbiera zasoby po drodze, dźwięki są niższe, a grafiki stworów i przedmiotów powstaną w generatorze pixel-artu.

### Obóz i zasoby

1. **Zasoby od pierwszego poziomu.** Zgodnie z życzeniem autora każdy budynek kosztuje zasoby już na poziomie 1, nie samo złoto. Złoto rośnie dwukrotnie z każdym poziomem, a zasoby 1,9 raza (`growth` w `data/buildings.json`). Czasy się nie zmieniają: od 1 minuty do ok. 20 godzin. Przykłady:
   - Ognisko: poziom 1 kosztuje 5 złota i 4 drewna, poziom 2 10 złota, 8 drewna i 3 kamienia, poziom 5 80 złota, 52 drewna, 21 kamienia i 6 rudy, a poziom 10 2560 złota, 1291 drewna, 510 kamienia i 141 rudy.
   - Tartak: poziom 1 kosztuje 8 złota i 6 drewna, a poziom 10 4096 złota, 1936 drewna, 510 kamienia i 141 rudy.
   - Kamieniołom i Kopalnia potrzebują kamienia od pierwszego poziomu (8 złota, 8 drewna i 3 kamienia oraz 12 złota, 9 drewna i 4 kamienia), a Stół złomiarza rudy (12 złota, 4 drewna i 3 rudy).

   Wszystkie budynki na poziomie 1 kosztują razem 55 złota, 39 drewna, 7 kamienia i 3 rudy. Test danych nie wymaga już pierwszego poziomu bez zasobów. Punkt zastępuje koszty z punktu 5 „Obozu, pierwszej części” i punktu 4 „Produkcji w obozie”.
2. **Tempo budowy.** Symulacja gracza, który co 15 minut eksploracji zagląda do obozu, zbiera magazyny i stawia najtańszy brakujący poziom, daje takie czasy eksploracji (przed zmianą → po):
   - pierwszy budynek: 0,9 → 0,9 godziny,
   - wszystkie budynki na poziomie 1: 1,8 → 2,6 godziny,
   - na poziomie 2: 4,5 → 4,7 godziny,
   - na poziomie 3: 6,6 → 7,1 godziny,
   - na poziomie 5: 14,4 → 19,1 godziny,
   - na poziomie 7: 37,1 → 50,8 godziny.

   Pierwsza budowa przychodzi tak samo szybko, a dalsze poziomy wymagają wyraźnie więcej pracy, więc budowa nie jest „ultrałatwa”.
3. **Znalezisko dzieli się na rodzaje.** Zasób ze znaleziska nie jest już jednego, wylosowanego rodzaju. Ilość (poziom znaleziska × 4 × losowo 0,5–1,5) dzieli się według wag regionu, a najczęstszy rodzaj dostaje co najmniej 1. Na przykład 10 zasobów w Wiatrołomach to drewno 5, kamień 3 i ruda 2. Dzięki temu żadna seria wypraw nie zostawia gracza bez drewna, a relacja mówi np. „Zebrano: drewno +5, kamień +3, ruda żelaza +2.” Punkt zastępuje losowanie rodzaju z punktu 11 „Obozu, pierwszej części”.
4. **Zbieranie po drodze.** Każda eksploracja daje też stałą porcję zasobów: 2 × średni poziom miejsca × liczba godzin (`gatherPerLevelHour` w `data/balance.json`), podzieloną jak znalezisko. Godzina w Skraju Wiatrołomów (poziomy 1–5) daje drewno +3, kamień +2 i rudę +1, a pięć minut co najmniej 1 drewna. Wyprawa przerwana omdleniem albo ucieczką zbiera tylko do tej chwili. Relację kończy zdanie w rodzaju „Po drodze zebrano: drewno +3, kamień +2, ruda żelaza +1.”, a zebrane zasoby są w wierszu „Zasoby” podsumowania. W symulacji każdy gracz ma drewno najpóźniej po 20 minutach eksploracji.
5. **Wskazówki w obozie.** Dopóki nic nie stoi, pod planszą jest wskazówka „Dotknij pustego placu, żeby zobaczyć koszt budowy. Zasoby znajdziesz na eksploracjach.” Gdy na budowę brakuje złota albo zasobów, ekran budynku podpowiada: „Złoto i zasoby zdobędziesz na eksploracjach. Tartak, Kamieniołom i Kopalnia wytwarzają zasoby w obozie.” Punkt zastępuje wskazówkę z punktu 8 „Planszy obozu i Punktów Systemu”.

### Dźwięki

6. **Niższe i miększe tony.** Zgodnie z uwagą autora dźwięki kliknięć i walki są niższe. Głośnik telefonu słabo gra poniżej ok. 200 Hz, więc dźwięki opierają się na tonach 160–400 Hz z alikwotami, a filtr dolnoprzepustowy łagodzi ostre brzmienia. Środek ciężkości widma w Hz (przed → po):
   - dotknięcie 1061 → 455, zakładka 893 → 431, otwarcie 1516 → 628,
   - cios 803 → 678, trafienie krytyczne 1325 → 830, strzała 2696 → 1193, magia 587 → 349,
   - zwycięstwo 906 → 505, porażka 654 → 452, komunikat Systemu 1143 → 558.
7. **Dźwięki obozu.** Start budowy to trzy niskie stuknięcia, zbieranie z magazynu to stuknięcie i dwa tony, a koniec budowy to dzwonek.

### Grafiki

8. **Pixel-art z generatora AI.** Wektorowe portrety stworów wyglądały według autora zbyt ludzko, a ręczne rysowanie pixel-artu było zbyt pracochłonne. Autor wybrał generator pixel-artu Retro Diffusion. Według regulaminu obrazki należą do osoby, która je wygenerowała, więc mogą trafić do gry w Sklepie Play. Obrazek kosztuje ok. 0,06–0,18 USD z przedpłaconego salda. Rozmiary:
   - stwory: sprite 48×48 w całej postaci, w walce w polu ok. 72×72 px, bo karta ma na typowym telefonie ok. 82 px szerokości,
   - przedmioty: 32×32, w slotach ekwipunku 40 px, a w karcie przedmiotu 64 px.

   Do czasu grafik gra pokazuje dotychczasowe ikony. Wektorowe popiersia klas z podglądu zostają wstępnie i wejdą do walki razem ze sprite'ami. *Grafiki są już w grze: zob. „Drabinka eksploracji i lochy”, punkt 6.*
9. **Jak powstają grafiki.** Opisy, style i rozmiary są w `art/prompts.json`. Przebieg „Grafiki (szkice)” (`.github/workflows/art.yml`), uruchamiany ręcznie, woła `tools/generate-art.mjs` z sekretem repozytorium `RETRO_DIFFUSION_API_KEY`. Skrypt najpierw darmowo wycenia każde zapytanie i nie wydaje więcej niż limit przebiegu, domyślnie 2 USD. Szkice z przezroczystym tłem trafiają na osobną gałąź `art-drafts`, której workflow gry nie testuje ani nie wdraża. Zatwierdzone sprite'y trafią do `src/client/art/`, a wybrane z nich, jako wzorce stylu dla kolejnych, do `art/references/`.

## Kowadło i ulepszanie przedmiotów (24.10.2026)

Zmiany poniżej wynikają z kolejnej wiadomości autora. Najważniejsze: w obozie stoi Kowadło, które pozwala ulepszać przedmioty od +1 do +10, a każdy jego poziom pozwala iść o jedno ulepszenie wyżej.

1. **Kowadło.** Zgodnie z życzeniem autora obóz ma siódmy budynek, Kowadło, z 10 poziomami (`data/buildings.json`, premia `upgradeCap`). Kowadło na poziomie L pozwala ulepszać przedmioty do +L, więc na poziomie 10 do +10. Poziom 1 kosztuje 15 złota, 6 drewna, 4 kamienia i 4 rudy żelaza. Złoto rośnie dwukrotnie z każdym poziomem, a zasoby 1,9 raza, czasy są jak w innych budynkach. Na planszy Kowadło stoi u góry, między Tartakiem a Kamieniołomem, a prowadzi do niego ścieżka od Ogniska. Jego rysunki to kowadło na pniu (poziomy 1–3), palenisko z miechem (4–7) i kuźnia pod dachem z kominem (8–10).
2. **Od początku gry.** Zgodnie z odpowiedzią autora Kowadło można zbudować od pierwszego poziomu postaci, jak inne budynki obozu. Ulepszanie nie czeka już na poziom 25 i Etap 6, a tabela odblokowań w dokumencie projektowym zostawia na poziomie 25 same lochy (*nieaktualne: zob. „Drabinka eksploracji i lochy”, punkt 3*). Zasady z dokumentu zostają bez zmian:
   - ulepszanie od +1 do +10, z rosnącym kosztem i rosnącą szansą porażki,
   - porażka zabiera materiały i obniża ulepszenie o jeden, a na +0 kosztuje tylko materiały,
   - od +7 porażka może zniszczyć przedmiot.

   Ochronny zwój z profesji dojdzie razem z profesjami.
3. **Co daje ulepszenie.** Każdy poziom podnosi wszystkie liczby przedmiotu o 6% ich wartości bazowej, z zaokrągleniem: obrażenia broni, pancerz, cechy i odporności (`bonusPerLevel` w `data/balance.json`). Ulepszenie +10 daje więc 60% więcej. Małe liczby rosną później: cecha +3 zmienia się dopiero przy +3. Karta przedmiotu, ekran statystyk, walka i zagrożenie liczą przedmiot z ulepszeniem. Cena u złomiarza się nie zmienia.
4. **Koszt.** Ulepszenie kosztuje złoto i rudę żelaza i rośnie 1,6 raza z każdym poziomem (`upgrades` w `data/balance.json`):
   - złoto: poziom przedmiotu × 1,5 × mnożnik budżetu rzadkości (od 1 dla pospolitych do 4 dla boskich),
   - ruda: (1 + poziom przedmiotu × 0,15) × ten sam mnożnik.

   Pospolity przedmiot z poziomu 5 kosztuje na +1 8 złota i 2 rudy, a na +10 515 złota i 120 rudy. Z poziomu 20 to 30 złota i 4 rudy na +1 oraz 2062 złota i 275 rudy na +10. Godzina eksploracji na poziomie 20 daje ok. 200 złota, więc pierwsze ulepszenie kosztuje ok. 9 minut zarobku, a próba +10 ok. 10 godzin.
5. **Szanse.** Szansa powodzenia na kolejne poziomy to 95, 90, 85, 75, 65, 55, 45, 35, 25 i 15%. Dokument mówi „od +7 wzwyż”, więc szansę zniszczenia ma przedmiot, który ma już +7 albo więcej: porażka niszczy go wtedy z szansą 10%. Próba +8 z +7 kończy się więc zniszczeniem w ok. 6,5% przypadków, a próba +10 z +9 w ok. 8,5%.
6. **Ulepszanie od razu.** Próba nie ma timera: serwer losuje wynik nowym ziarnem i od razu go zapisuje. Ulepszyć nie da się podczas eksploracji, tak jak zmienić ekwipunek, bo założone przedmioty liczą się do wyniku wyprawy.
7. **Wygląd.** Karta przedmiotu ma część „Kowadło”: ulepszenie przed i po próbie, liczby po ulepszeniu, szansę, koszt z tym, co gracz ma, skutek porażki i przycisk „Ulepsz do +N”. Gdy Kowadła nie ma albo jest za niskie, karta mówi, co zbudować. Nazwa przedmiotu ma ulepszenie na końcu, np. „Kolczuga +3”, a róg slotu pokazuje „+3”, jak zapowiadał dokument. Wynik pokazuje krótki komunikat, z dzwonkiem przy powodzeniu i niskim tonem przy porażce.
8. **Ochrona ulepszonych przedmiotów.** Złomiarz nie kupuje ich hurtem przyciskiem w raporcie, a gdy plecak się przepełnia, sprzedaje je na końcu.
9. **API i baza.** `POST /api/items/:id/upgrade` próbuje ulepszyć przedmiot i zwraca wynik (`success`, `failure` albo `broken`), poziom przed i po próbie oraz koszt. Błędy to `anvil_level` (brak Kowadła albo za niski poziom), `max_upgrade`, `not_enough`, `busy` i `item_changed`. Przedmiot w API ma pola `upgrade` i `anvil` (poziom, najwyższe ulepszenie Kowadła i następna próba z kosztem, szansami i liczbami). Poziom ulepszenia i ziarno ostatniej próby są w danych przedmiotu (`upgrade`, `lastRoll`), więc nie trzeba migracji. Zapis, zapłata i ewentualne usunięcie przedmiotu idą w jednej transakcji, warunkowanej tym, co serwer widział, więc dwa dotknięcia naraz to jedna próba.

## Drabinka eksploracji i lochy (24.10.2026)

Zmiany poniżej wynikają z kolejnej wiadomości autora i jego odpowiedzi. Najważniejsze: eksploracje wydłużają się stopniowo, od 30 minut na starcie do 4 godzin na poziomie 50, a lochy otwierają się na poziomie 50. Sprite'y z generatora są już w grze.

### Eksploracje i lochy

1. **Drabinka długości.** Autor chce, żeby nowy gracz pierwszego dnia sporo klikał: do poziomu 25 eksploracja trwa najwyżej 30 minut, a poziom 50 odblokowuje najdłuższą. Z dwóch zaproponowanych rozwiązań autor wybrał drabinkę:
   - poziomy 1–24: do 30 minut,
   - od poziomu 25: do 1 godziny,
   - od poziomu 35: do 2 godzin,
   - od poziomu 50: do 4 godzin.

   Progi są w `data/unlocks.json` (wpisy `hunts-1h`, `hunts-2h` i `hunts-4h` z polem `huntMinutes`), a limit na start to `shortHuntMaxMinutes` 30 w `data/balance.json` (wcześniej 45). Dłuższe eksploracje otwiera poziom postaci, jak inne odblokowania. Punkt zastępuje zakres suwaka z punktu 9 „Nowej skali i eksploracji” i długie polowania na poziomie 2 z punktu 30 Etapu 1.
2. **Tempo.** Według krzywej dojście do poziomu 25 zajmuje ok. 5,8 godziny eksploracji, do 35 ok. 12,5 godziny, a do 50 ok. 28,4 godziny (*nieaktualne po wolniejszym starcie: zob. „Instalacja, muzyka, wolniejszy start i ewolucje”, punkt 9*). Pierwszy dzień gry to więc kilkanaście wypraw po najwyżej 30 minut, każda z raportem. Całe Wiatrołomy (poziomy 1–25) przechodzi się w takich wyprawach, a przy tej długości ryzyko omdlenia wynosi tam najwyżej ok. 3% (punkt 17 „Regionów wewnętrznych i obozu”). Godzinne wyprawy przychodzą tuż przed Uroczyskiem Kamieni, 2-godzinne w jego połowie, a 4-godzinne pod jego koniec. Jeden poziom trwa na poziomie 25 ok. 32 minut, na 35 ok. 50 minut, a na 50 ok. 80 minut, więc od poziomu 20 najdłuższa wyprawa daje ok. 1–3 poziomów.
3. **Lochy od poziomu 50.** Zgodnie z życzeniem autora lochy otwierają się na poziomie 50 (wcześniej 25), razem z 4-godzinnymi eksploracjami. Zakładka Lochy w Walce podaje ten poziom. W tabeli odblokowań dokumentu projektowego poziom 25 ma teraz eksploracje do 1 godziny. Punkt zastępuje poziom lochów z punktu 10 „Regionów wewnętrznych i obozu” i zdanie o tabeli z punktu 2 „Kowadła i ulepszania przedmiotów”.
4. **Podpowiedzi i serwer.** Pod suwakiem jest zdanie o następnym progu, np. „Dłuższe wyprawy, do 1 h, od poziomu 25.”, a awans na próg pokazuje komunikat Systemu, np. „Odblokowano eksploracje do 1 godziny.” Postać w API ma pole `huntNext`: poziom i długość następnego progu albo `null` po ostatnim. Serwer odrzuca za długą wyprawę (403 `duration_locked`) i podaje obecny limit oraz poziom następnego progu. `npm run validate` sprawdza, że każdy próg wydłuża eksploracje, wypada na kroku suwaka, a ostatni sięga `maxMinutes`.
5. **Istniejące postacie.** Postacie poniżej poziomu 25 mają od wdrożenia najwyżej 30 minut. Wyprawa rozpoczęta wcześniej kończy się normalnie, a suwak z zapamiętanym zbyt długim czasem wraca na 15 minut.

### Grafiki w grze

6. **Sprite'y w grze.** Gra ma sprite'y wszystkich 13 stworów i 19 baz przedmiotów w stylu fantasy (`rd_pro__fantasy`), bez wzorców stylu. Zgodnie z życzeniem autora każdy powstał w jednej wersji, żeby nie marnować salda. Pokazują je:
   - karty przeciwników w walce, w polu ok. 72 px, z poziomem w rogu,
   - sloty ekwipunku i plecaka (40 px), listy przedmiotów (32 px), karta przedmiotu (64 px) i najlepsze znalezisko w raporcie.

   Postać i sojusznicy mają w walce wektorowe popiersie klasy, tak samo jak karty klas przy tworzeniu postaci. Stwór albo przedmiot bez sprite'a, np. nowa baza, ma dalej ikonę. Testy sprawdzają, że każdy sprite z listy w `src/client/art.js` ma plik o właściwym rozmiarze. Wszystkie grafiki kosztowały ok. 5,8 USD, a dwa wilki pokryło darmowe saldo na start. Punkt uzupełnia punkt 8 „Budowy za zasoby, dźwięków i grafik”.
7. **Czyszczenie tła.** Mimo usuwania tła (`remove_bg`) generator zostawił pod 6 stworami i pod fokusem kafel podłoża. Usunęliśmy go przy przeglądzie szkiców: wypełnieniem od brzegów obrazka po kolorach, które zajmują co najmniej 6% brzegu (tolerancja 24), i usunięciem samotnych pikseli. Przy dziku trzeba było usunąć kolor kafla w całym obrazku, a przy borsuku także szare piksele tła o niskim nasyceniu. Przy kolejnych grafikach warto zacząć od tego samego.
8. **Szata.** Pierwszy szkic szaty pokazywał maga, który ją nosi. Opis w `art/prompts.json` mówi teraz „an empty garment with nobody wearing it”, a druga wersja to sama szata.

## Instalacja, muzyka, wolniejszy start i ewolucje (24.10.2026)

Zmiany poniżej wynikają z kolejnych wiadomości autora. Najważniejsze: grę można zainstalować przyciskiem, w tle gra muzyka, pierwsze poziomy trwają dłużej, a ewolucje klas są na poziomach 50, 100, 200, 300, 400 i 500.

### Instalacja jako aplikacja

1. **Przycisk „Zainstaluj jako aplikację”.** Autor uznał go za priorytet. Ekran startowy ma go pod nazwą gry, z podpisem „Gra otworzy się z ikony na ekranie głównym, na pełnym ekranie.”, a ten sam przycisk jest w Ustawieniach. Co robi:
   - W Chrome, Edge i Samsung Internet na Androidzie otwiera systemowe okno instalacji (`beforeinstallprompt`).
   - Safari na iPhonie nie pozwala stronie zainstalować się samej. Tam przycisk pokazuje trzy kroki: „Udostępnij”, „Do ekranu początkowego”, „Dodaj”.
   - Gdy przeglądarka nie ma jeszcze gotowego okna, przycisk pokazuje kroki z menu przeglądarki. Chrome daje okno po ok. 30 sekundach na stronie i jednym dotknięciu.
   - Gdy gra jest otwarta w Messengerze albo innej aplikacji, instrukcja każe najpierw otworzyć ją w przeglądarce.
   - W zainstalowanej grze przycisku nie ma.

   Kod jest w `src/client/install.js`.
2. **Service worker.** Chrome otwiera okno instalacji tylko dla strony z service workerem, który obsługuje zapytania. `src/client/sw.js` przepuszcza wszystko do sieci jak dotąd. Gdy sieci nie ma, zamiast błędu przeglądarki pokazuje stronę `offline.html`: komunikat Systemu, że gra potrzebuje internetu, i przycisk „Spróbuj ponownie”. W pamięci trzyma tylko tę stronę, `styles.css` i ikonę, więc po wdrożeniu nikt nie zostaje ze starą wersją gry. Strona ma adres `/offline`, bo pliki statyczne przekierowują tam `/offline.html`, a ładowanie strony nie przyjmuje przekierowanej odpowiedzi od service workera. Service worker przyda się też przy wydaniu gry w Sklepie Play.

### Muzyka

3. **Muzyka w tle.** Utwór autora „Background v1” gra na wszystkich ekranach, także na ekranie logowania. Zaczyna się od pierwszego dotknięcia ekranu, bo wcześniej przeglądarki nie pozwalają grać. Przez ostatnie 5 sekund cichnie, a po 2,5 sekundy pauzy zaczyna się od nowa (`fadeOutSeconds` i `pauseSeconds` w `data/music.json`). Gdy gra jest w tle, np. po przełączeniu na inną aplikację albo przy zgaszonym ekranie, muzyka milknie. Plik w `src/client/audio/music/` ma ten sam dźwięk co oryginał, bez okładki i znaczników (4,5 MB, 3:28).
4. **Miejsce na kolejne utwory.** `data/music.json` ma listę utworów, utwór domyślny i `places`, które przypisują utwór do miejsca: regionu, regionu wewnętrznego albo obozu (`camp`). Region wewnętrzny bez wpisu gra utwór swojego regionu, a pozostałe ekrany utwór domyślny. Przy zmianie utworu stary cichnie przez 1,5 sekundy. `npm run validate` sprawdza pliki, utwory i miejsca.
5. **Głośność.** Ustawienia mają dwa suwaki w krokach co 5%, a 0 wyłącza dźwięk:
   - „Muzyka”: na start 50%,
   - „Efekty dźwiękowe”: na start 100%, a kto wcześniej wyłączył dźwięk, ma 0%.

   Głośność rośnie z kwadratem położenia suwaka, więc kroki brzmią równo. Wybór pamięta przeglądarka. Suwak efektów zastępuje przełącznik „Dźwięk”.
6. **Technika muzyki.** Utwór jest pobierany w całości i grany z pamięci (`blob:`). Safari gra pliki dźwiękowe tylko z serwerów, które wysyłają je w częściach (Range), a statyczne pliki gry tego nie robią. Dlatego CSP strony ma `media-src 'self' blob:`. Element `<audio>` gra przez kontekst Web Audio efektów, bo Safari na iPhonie nie pozwala zmieniać głośności samego elementu. Na iPhonie muzyka, tak jak efekty, milknie przy wyciszonym telefonie.
7. **Prawa do utworu.** Plik ma znacznik „made with suno”. Utworów z darmowego planu Suno wolno używać tylko niekomercyjnie, a z planów Pro i Premier także komercyjnie. Prawo komercyjne będzie potrzebne w Sklepie Play, więc przed wydaniem autor powinien to sprawdzić.

### Postęp

8. **Wolniejszy start.** Zgodnie z uwagą autora 30-minutowa wyprawa na poziomie 1 dawała za dużo awansów: +3 poziomy postaci i +5 klasy, co przytłaczało okienko Systemu. Autor chce gry na lata, w której taka wyprawa daje 1–2 poziomy postaci i najwyżej 4 poziomy klasy.
   - Pierwsze poziomy, do ok. 17, trwają teraz po ok. 20 minut eksploracji (`firstLevelMinutes` 20, `flatLevels` 17,24 w `data/balance.json`).
   - Dalej krzywa jest taka jak dotąd: poziom 25 trwa ok. 32 minut, poziom 100 ok. 3 godzin, a poziom 500 ok. doby.
   - Symulacja kolejnych 30-minutowych wypraw w najwyższym otwartym miejscu: pierwsza daje +1 poziom postaci i +1 poziom klasy, a następne po 1–2 poziomy postaci i do ok. 3 poziomów klasy.
   - Poziom 10 przychodzi po ok. 3 godzinach eksploracji (wcześniej ok. 50 minut), a poziom 20 po ok. 6,5 godziny (wcześniej ok. 3,5).

   Punkt zastępuje czasy pierwszych poziomów z punktu 1 „Nowej skali i eksploracji” i z punktu 1 „Obozu, pierwszej części”.
9. **Progi drabinki według nowej krzywej.** Poziom 25 przychodzi po ok. 8,7 godziny eksploracji, poziom 35 po ok. 15,4 godziny, a poziom 50 po ok. 31 godzinach. Punkt zastępuje te liczby z punktu 2 „Drabinki eksploracji i lochów”.
10. **Kilka awansów w jednym wierszu.** Kilka poziomów naraz daje jeden wiersz dla postaci i jeden dla klasy, z sumą punktów. Komunikaty o odblokowaniach zostają osobno. Od 26.10.2026 każdy zysk ma osobny wiersz, np. „Osiągnięto poziom: 4” i „Zdobyto wolne punkty statystyk: +24” (punkt 4 „Awans odnawia HP i manę”).
11. **Ewolucje klas.** Autor zaproponował pierwszą ewolucję na poziomie klasy 50, a kolejne co 100 poziomów, chyba że jest lepszy pomysł. Ewolucje są na poziomach klasy 50, 100, 200, 300, 400 i 500 (`classEvolutionLevels` w `data/balance.json`):
    - druga przychodziła według ówczesnej krzywej po ok. 100 godzinach eksploracji, a nie po ok. 260 przy progu 150,
    - ostatnia wypada na najwyższym poziomie klasy.

    Według krzywej z 0.0.30 poziom klasy 50 przychodzi po ok. 81 godzinach eksploracji (postać ma wtedy ok. 44 poziom), 100 po ok. 400 godzinach, 200 po ok. 1230, 300 po ok. 2210, 400 po ok. 3450, a 500 po ok. 5130. Przed spowolnieniami z 0.0.27, 0.0.28 i 0.0.30 było to 23, 100, 500, 1260, 2440 i 4080 godzin (liczby z 29.10.2026). Ekran statystyk pokazuje „Pierwsza ewolucja: poz. klasy 50”. Same ewolucje powstaną w Etapie 3. Gdyby autor wolał progi 150, 250, 350 i 450, wystarczy zmienić listę. Punkt zastępuje poziom 30 z punktu 10 „Regionów wewnętrznych i obozu”.

### Portrety i wygląd postaci

12. **Portrety w całej postaci.** Autor chciał solidniejszych portretów postaci, które mogą się zmieniać z kostiumami premium. Wybrał pixel-art z generatora Retro Diffusion, w tym samym stylu co stwory i przedmioty (rodzaj `portraits` w `art/prompts.json`, 96×128, proporcje 3:4). Pierwsza próbka była do pasa, a postać ma być w całej okazałości, więc opisy mówią „full body from head to feet”. Portret kleryczki wymagał dwóch dodatkowych prób: najpierw generator uciął głowę, potem stopy, więc opis prosi teraz o miejsce nad głową i pod butami. Portrety z próbkami kosztowały ok. 2,3 USD.
13. **Kobieta i mężczyzna.** Zgodnie z wyborem autora każda klasa ma dwa portrety, a wygląd wybiera się przy tworzeniu postaci, nad listą klas (`data/appearances.json`: `female` i `male`). Bez wyboru wyglądu gra mówi „Wybierz wygląd postaci.”, a karty klas pokazują postacie w wybranym wyglądzie. Wygląd można zmienić w każdej chwili i za darmo w Ustawieniach, także podczas eksploracji, bo zmienia tylko portret i głos. Postacie sprzed tej zmiany mają wygląd męski, dopóki gracz go nie zmieni (migracja `0006_appearance.sql`). API: `appearance` przy `POST /api/character` (błąd 400 `invalid_appearance`) i `POST /api/character/appearance`.
14. **Gdzie są portrety.** Pokazują je trzy miejsca, a klasa bez portretu ma dalej wektorowe popiersie:
    - ekran postaci: cała postać na tle lasu, pod slotami ekwipunku,
    - walka: głowa i tors w polu 72×72 px, wycięte z obrazka w jego własnym rozmiarze, więc piksele zostają ostre,
    - karty klas przy tworzeniu postaci: głowa i tors 56×56 px.

    Starsze raporty nie znają wyglądu, więc pokazują portret męski.
15. **Kostiumy.** Kostium premium będzie nowym obrazkiem tej samej postaci z generatora (ok. 0,18 USD za klasę i wygląd). Tańsze warianty kolorów, np. leśny, gwardii albo nocny, można liczyć w kodzie z tego samego obrazka za darmo, a ramki i tła rysować w CSS. To kierunek z podglądu, który autor zaakceptował. Same kostiumy powstaną razem z Punktami Systemu.

### Dźwięki walki

16. **Nagrania zamiast syntezatora.** Zgodnie z uwagą autora, że dźwięki są plastikowe, ciosy, uniki i upadki w odtwarzaniu walki to krótkie nagrania z paczek Kenney „Impact Sounds” i „RPG Audio” na licencji CC0, którą wolno używać także komercyjnie, bez podpisu. 21 plików MP3 (mono, 96 kb/s, ok. 120 KB razem) leży w `src/client/audio/sfx/`, a `data/sounds.json` przypisuje je do rodzajów:
    - broń: miecz i sztylet „blade”, topór „axe”, pięści „fist”, łuk „arrow” (trafienie strzały),
    - potwory: ugryzienie „bite”, pazury „claw”, szarża i łapa niedźwiedzia „charge”, dziób „peck”,
    - trafienie krytyczne dokłada cięższe uderzenie („crit”), unik to szelest tkaniny („dodge”), a pokonany pada ciężko („kill”).

    Rodzaj podaje pole `sound` broni w `data/item-bases.json` i ataku w `data/monsters.json`. Magia, zamach, strzał z łuku i efekty okresowe są dalej z syntezatora (`synth`), aż powstaną nagrania. Każde odtworzenie ma lekko inną wysokość, żeby powtórzenia nie brzmiały identycznie. Nagrania wczytują się po pierwszym dotknięciu ekranu.
17. **Głosy stworów i postaci.** Stwór (po swoim id) i postać (po wyglądzie) mogą krzyknąć przy trafieniu („hurt”: zawsze przy krytycznym, w połowie zwykłych) i przy pokonaniu („death”) — `voices` w `data/sounds.json`. Autor wybrał generator ElevenLabs Sound Effects, bo darmowe paczki mają tylko ogólne odgłosy potworów. Opisy 30 głosów (13 stworów i 2 wyglądy, po dwa dźwięki) i 6 efektów są w `audio/prompts.json`. Przebieg „Dźwięki (szkice)” (`.github/workflows/sfx.yml`, `tools/generate-sfx.mjs`) z sekretem `ELEVENLABS_API_KEY` nagrywa szkice na gałąź `art-drafts`. Dźwięk o zadanej długości kosztuje 20 kredytów na sekundę, więc 30 głosów po sekundzie to 600 kredytów, a 6 efektów po 1,5 sekundy to 180. Plan Starter ElevenLabs (ok. 5–6 USD miesięcznie, ok. 30 tys. kredytów) wystarcza z zapasem i daje prawo do użytku komercyjnego.
18. **Muzyka gra bez przerwy.** Jeden odtwarzacz gra przez cały czas otwarcia gry: zmiana zakładki, obóz, raport, ustawienia, wylogowanie i ponowne zalogowanie nie zaczynają utworu od nowa. Od nowa zaczyna go tylko odświeżenie strony. W przeglądarce sprawdziliśmy zakładki, obóz, raport i ustawienia.

### Poprawki po testach autora

19. **Głośność.** Autor nie słyszał efektów przy muzyce na 100%. Efekty grają teraz dwa razy głośniej, z limiterem, żeby kilka naraz nie przesterowało dźwięku w telefonie. Muzyka przy tym samym położeniu suwaka ma połowę sygnału (100% to −6 dB). Na start muzyka jest na 50%, a efekty na 100%. Punkt uzupełnia punkt 5.
20. **Nagrania słyszalne w telefonie.** Uderzenia z paczek Kenney mają prawie całą energię poniżej 300 Hz, a głośnik telefonu tego pasma prawie nie gra. Dlatego autor nie słyszał nowych dźwięków. Nagrania są teraz przerobione:
    - na ciężkie uderzenie nałożona jest jaśniejsza warstwa, np. na cios łapą cięcie,
    - pasmo poniżej 110 Hz jest wycięte, a pasma 1,2 i 3 kHz podbite,
    - nagrania są skompresowane i mają tę samą głośność (RMS −15 dBFS).

    Upadek ma teraz powyżej 400 Hz energię tylko ok. 4 dB niższą niż w całości (wcześniej 29 dB), a ugryzienie 0,3–3 dB (wcześniej ok. 30). Zestaw to 22 pliki: cięcie, rąbanie, pięść, ugryzienie, pazury, szarża, dziób, strzała, trafienie krytyczne, unik i upadek, po dwie wersje. Robi je `tools/build-sfx.py` (Python i ffmpeg) z rozpakowanych paczek. Punkt zastępuje listę plików z punktu 16.
21. **Karty klas od razu z portretami.** Zanim gracz wybierze wygląd, każda karta klasy pokazuje obie twarze, kobiety i mężczyzny. Po wyborze zostaje jedna. Portrety pobierają się już na ekranie logowania. Wcześniej przed wyborem widać było stare wektorowe popiersia, a na wolnym łączu portrety doczytywały się kilka sekund. Punkt uzupełnia punkt 13.
22. **Nowa wersja gry.** Gdy gracz wraca do gry (karta albo aplikacja znów na ekranie), a serwer ma już inną wersję niż ta, z którą strona się otworzyła, strona sama się przeładowuje. Otwarta strona ani zainstalowana aplikacja nie zostają więc ze starym kodem po wdrożeniu. Stan gry jest na serwerze, więc nic nie ginie, a muzyka zaczyna się wtedy od nowa.

## Logowanie przez Google (24.10.2026)

Autor zapytał, czy da się dodać logowanie kontem Google.

1. **Przyciski.** Ekran startowy ma „Zaloguj się przez Google” nad formularzem, oddzielone kreską „albo”. W Ustawieniach jest wiersz „Google” z przyciskiem „Połącz z Google” albo napisem „Połączone”. Przyciski pojawiają się dopiero wtedy, gdy serwer ma klucze klienta Google (`google` w `/api/health`), więc bez kluczy gra wygląda jak wcześniej. Przycisk ma czterokolorowe „G” Google na ciemnym tle, jak w zasadach Google dla ciemnych stron.
2. **Przebieg.** Gra używa OAuth 2.0 z kodem i PKCE (`src/server/google.js`) i prosi tylko o `openid email`, czyli identyfikator konta Google i adres e-mail. `/api/auth/google/start` zapisuje losowy stan i weryfikator PKCE w ciasteczku `__Host-google` na 10 minut i wysyła przeglądarkę do Google z wyborem konta (`prompt=select_account`). `/api/auth/google/callback` sprawdza stan, wymienia kod na token ID i otwiera sesję jak zwykłe logowanie. Token przychodzi prosto z Google przez TLS, więc serwer sprawdza wystawcę, odbiorcę i ważność tokenu, ale nie jego podpis (OpenID Connect Core 3.1.3.7).
3. **Nowe konto.** Pierwsze logowanie przez Google zakłada konto bez hasła (`password_hash` równe `google`, którego nie spełnia żadne hasło):
    - login powstaje z nazwy przed @: jan.kowalski@gmail.com daje „jan.kowalski”,
    - znaki spoza zasad loginu znikają, a z nazwy krótszej niż 3 znaki powstaje „gracz”,
    - zajęty login dostaje 4 cyfry,
    - e-mail zapisuje się tylko wtedy, gdy Google go potwierdził.

    Kolejne logowania znajdują konto po identyfikatorze Google (`users.google_sub`, migracja `0007_google.sql`), także po zmianie adresu w Google.
4. **Konto z tym samym e-mailem.** Gra nie potwierdza adresów przy rejestracji, więc Google nie łączy się samo z kontem o tym samym e-mailu. Inaczej ktoś mógłby założyć konto na cudzy adres i potem korzystać z postępów właściciela. Gra mówi wtedy: „Konto w grze z tym adresem e-mail już istnieje. Zaloguj się loginem i hasłem, a potem połącz Google w Ustawieniach.” Po połączeniu oba sposoby otwierają to samo konto. Konto Google połączone już z innym kontem w grze jest odrzucane. Odłączania Google i ustawiania hasła dla kont z Google na razie nie ma.
5. **Adresy.** Google wraca tylko pod adresy zapisane w Google Cloud Console, czyli insightrpg.com i www.insightrpg.com (`GOOGLE_HOSTS` w `wrangler.jsonc`). Logowanie zaczęte pod zapasowym adresem workers.dev przechodzi na insightrpg.com. Wynik wraca jako `/?google=<wynik>`, a gra pokazuje komunikat na ekranie startowym albo w dymku w grze i usuwa go z adresu. Wyniki: `linked`, `taken`, `exists`, `cancelled`, `expired`, `failed`, `unavailable`.
6. **Gdzie nie działa.** Google nie pozwala logować się w przeglądarkach wbudowanych w aplikacje, np. w Messengerze czy Instagramie. Gra dodana do ekranu początkowego iPhone'a trzyma ciasteczka osobno od Safari, a logowanie Google kończyłoby się w okienku Safari. W obu miejscach zamiast przycisku jest podpowiedź: otworzyć grę w przeglądarce albo zalogować się hasłem. Na Androidzie zainstalowana gra dzieli ciasteczka z Chrome, więc przycisk zostaje. Wersja ze Sklepu Play też będzie działać przez Chrome.
7. **Klucze.** Identyfikator i sekret klienta Google są w sekretach repozytorium `GOOGLE_CLIENT_ID` i `GOOGLE_CLIENT_SECRET`. Wdrożenie przekazuje je Workerowi jako jego sekrety (`wrangler deploy --secrets-file`), a podsumowanie wdrożenia mówi, czy logowanie Google jest włączone. Sekrety Workera zostają przy kolejnych wdrożeniach. Testy zastępują Google lokalnym serwerem (`GOOGLE_TOKEN_URL` ustawiają tylko testy).
8. **Ekran zgody Google.** Przy samym `openid email` aplikacja nie potrzebuje weryfikacji Google ani listy testerów. Zostaje w stanie „Testowanie”: przy tych zakresach Google wpuszcza każde konto, bez listy testerów i bez ostrzeżenia, a zgoda nie wygasa po 7 dniach. Przycisk „Opublikuj aplikację” żąda danych marki (strony głównej i polityki prywatności), więc publikacja poczeka na politykę prywatności. Nazwę i logo Insight na ekranie Google pokaże dopiero weryfikacja marki. Do niej potrzebne są strona główna i polityka prywatności na insightrpg.com oraz potwierdzenie domeny w Google Search Console. Politykę prywatności i tak będzie wymagał Sklep Play.

## Muzyka raportów (24.10.2026)

1. **Utwór wyniku.** Autor przysłał dwa utwory: na raport ze zwycięstwem i na raport z omdleniem. Raport otwarty zaraz po „Odbierz raport” gra utwór swojego wyniku (`reports` w `data/music.json`): wygrana `victory-v1`, omdlenie `defeat-v1`. Ucieczka przed elitą w bezpiecznym miejscu (`escaped`) nie jest ani wygraną, ani omdleniem, więc gra przy niej zwykła muzyka. Żeby ucieczka miała własny utwór, wystarczy dopisać `escaped`.
2. **Tylko raz.** Utwór wyniku gra tylko przy pierwszym czytaniu raportu. Po wyjściu z raportu ten sam raport otwarty z Dziennika gra zwykłą muzykę, tak samo po odświeżeniu strony.
3. **Płynne przejście.** Zmiana utworu to wyciszenie przez 1,5 sekundy i pogłośnienie następnego przez 1,5 sekundy (`switchSeconds`), bez nakładania się. Gra jeden odtwarzacz, który zmienia plik, bo na iPhonie bez dotknięcia może grać tylko odtwarzacz raz już uruchomiony dotknięciem. Utwór wyniku zaczyna się od początku. Główny utwór wraca w miejscu, w którym ucichł, chyba że zostało z niego mniej niż 6 sekund: wtedy zaczyna od nowa. Pierwsze włączenie muzyki też się pogłaśnia. Punkt uzupełnia punkt 18 „Instalacji, muzyki, wolniejszego startu i ewolucji”.
4. **Pobieranie.** Utwory wyniku (3,6 i 2,4 MB) pobierają się w tle, gdy zakładka Walka pokazuje trwającą albo zakończoną eksplorację. Dzięki temu muzyka zmienia się od razu po otwarciu raportu. Przy wyłączonej muzyce nic się nie pobiera. Pliki nie mają okładki ani znaczników, a dźwięk jest bez zmian. Głośność trzech utworów różni się o mniej niż 1 dB (−16,3, −16,7 i −17,1 LUFS).
5. **Licencja.** Utwory są z Suno. Przed wydaniem w Sklepie Play trzeba się upewnić, że powstały na płatnym planie (Pro albo Premier). Utwory z darmowego planu nie są do użytku komercyjnego, a późniejsza zmiana planu ich nie obejmuje.

## Dźwięki z ElevenLabs, głośność i konto z trybem testowym (24.10.2026)

1. **Głośność na start.** Muzyka startuje na 100%, a efekty na 40%. Autor sprawdził, że przy obecnych poziomach to najlepsza proporcja. Gracze, którzy przesunęli suwaki, zachowują swój wybór. Punkt zastępuje zdanie o 50% i 100% z punktu 19 „Instalacji, muzyki, wolniejszego startu i ewolucji”.
2. **Kliknięcie zakładek.** Autor uznał stare kliknięcie za plastikowe i niepasujące głośnością. Pomiar to potwierdził: dźwięk z syntezatora miał 85% energii poniżej 300 Hz, którego głośnik telefonu prawie nie gra, i był o ponad 20 dB cichszy od ciosów. Nowe kliknięcie to nagranie z ElevenLabs („a single soft click of a small wooden toggle switch”) w dwóch wersjach. Trwa 65 ms, ma energię w paśmie 1–3 kHz i gra ok. 9 dB ciszej od ciosów (`gain` 0.5 w `effects.tab` w `data/sounds.json`). Z dziesięciu szkiców odpadły: książka (prawie sam bas), kamyki (syk powyżej 8 kHz i kilka trzasków), koralik o środku przy 7 kHz i jedno szkło (ciągły dźwięk zamiast kliknięcia). Przyciski mają dalej stuk z syntezatora.

    Kliknięcie gra przy każdym przejściu do innego widoku, nie tylko w menu i przełącznikach: przycisk „Obóz”, place budynków, karty regionów i ich miejsca, raporty w Dzienniku, odnośniki w raporcie i każde „Powrót” (link w grze `#/…` albo `.back-button`). Autor zauważył, że w obozie grał jeszcze stary stuk. Przycisk, który coś robi, stuka jak wcześniej.
3. **Nagrania dźwięków po nazwie.** `effects` w `data/sounds.json` daje nagranie dźwiękowi gry wołanemu po nazwie, np. `tab`. Nazwa bez nagrania gra z syntezatora. Wystrzał z łuku nazywa się w syntezatorze `shot`, bo `arrow` to nagranie trafienia strzałą.
4. **Zamach i magia.** Wypad w walce wręcz ma nagrany świst miecza (`swing`, 0,2 s), a czar maga jasne iskrzenie (`magic`, 0,45 s, przycięte do lotu pocisku). Łuk wyszedł z ElevenLabs dwa razy jako ciche dudnienie, więc wystrzał zostaje z syntezatora. Fanfary zwycięstwa i porażki z ElevenLabs nie weszły do gry: raport ma już muzykę wyniku, a koniec walki ma dalej krótką fanfarę z syntezatora.
5. **Głosy.** Każdy z 13 stworów i oba wyglądy postaci mają po dwie wersje krzyku przy trafieniu (do 0,6 s) i przy pokonaniu (do 1 s). Kolejne ciosy padają szybko, więc krzyk przy trafieniu jest krótszy. Głosy przerabia `tools/build-drafts.py`, jak wcześniej ciosy: bez dudnienia, z podbiciem przy 1,2 i 3 kHz i z tą samą głośnością. Błędnica i trafiony Basior mają nagrania z drugiego podejścia z jaśniejszym opisem, bo pierwsze miały prawie całą energię poniżej 300 Hz. Krzyk przy trafieniu gra z poziomem 0.6, a przy pokonaniu 0.7.
6. **Odsłuch.** Nie mogę ocenić dźwięków uchem, tylko pomiarem. Wszystkie nowe nagrania są na stronie [Dźwięki Insight](https://claude.ai/artifact/6fqd7dgt9MSXepxV51qF5i), z poziomami jak w grze. Autor zaznacza tam „Do wymiany”, a zaznaczenia trafiają do bazy strony (kolekcja `marks`), którą odczytuję. Wymiana to nowy szkic w przebiegu „Dźwięki (szkice)” i ponowne `tools/build-drafts.py`.
7. **Koszt.** Kliknięcia (100 kredytów), głosy (1200 i 120 za poprawki) i efekty (360 i 120): razem ok. 1900 kredytów z ok. 30 tys. w planie Starter.
8. **Konto z trybem testowym przy Google.** Autor chce przypiąć konto z „Pomiń czas” i trybem testowym do swojego konta Google. Tryb testowy zostaje przy loginie z `TEST_LOGINS` (Skrajny). Autor łączy z nim Google w Ustawieniach, zamiast zakładać nowe konto: login nowego konta powstałby z adresu e-mail i trafiłby do repozytorium. Konto z trybem testowym, połączone z Google, nie przyjmuje już hasła („To konto otwiera się tylko przez Google.”). Przy połączeniu jego inne sesje się kończą, a gra pyta o zgodę przed połączeniem. Złe hasło dostaje zwykłą odpowiedź, więc odmowa nie zdradza, że konto istnieje. Bez kluczy Google hasło znów działa, żeby konta nie dało się zablokować. Pozostałe konta po połączeniu dalej logują się też hasłem.
9. **Poprawki po odsłuchu.** Autor zaznaczył do wymiany 8 głosów: trafienie Wilka, Basiora, Dzika, Licha i Krzyżaka oraz pokonanie Krzyżaka, Żmii i mężczyzny. Strona nie zbiera powodów, więc poprawki wynikają z pomiaru:
    - krzyki przy trafieniu są nagrywane od razu na 0,6 s, zamiast przycinać sekundę w połowie dźwięku,
    - opisy proszą o krótki dźwięk stwora z gry, a pokonanie mężczyzny wprost o brak słów,
    - z trzech wersji zostają dwie z najmniejszym basem i najmniejszą liczbą trzasków (mowa ma ich dużo); Licho ma jedną, bo dwie pozostałe to w 85% bas,
    - pokonanie Żmii trwa 0,7 s zamiast sekundy, bez góry powyżej 6 kHz (środek pasma przy 5,5 kHz zamiast 8 kHz).

    Koszt: 360 kredytów. Wybór wersji jest w `TAKES` w `tools/build-drafts.py`, a długość opisu może być własna (`{text, seconds}` w `audio/prompts.json`).
10. **Druga runda odsłuchu.** Autor odrzucił jeszcze raz trafienie Wilka i pokonanie Żmii:
    - Wilk przy trafieniu warczy przez zęby, zamiast skowyczeć jak pies (dwie z czterech wersji, środek pasma ok. 0,85 kHz zamiast 1 kHz).
    - Na umierającą żmiję ElevenLabs dawał same syki (trzy podejścia, dziesięć nagrań). Jej pokonanie powstaje więc z jej syku przy trafieniu, który autor zostawił: o 20% niżej i wolniej, bez góry powyżej 6 kHz, wygasające przez 0,8 s (`DERIVED` w `tools/build-drafts.py`). Gdyby i to nie pasowało, Żmija może nie mieć głosu przy pokonaniu, a zostanie sam odgłos upadku.

    Strona odsłuchu ma teraz przy zaznaczonym dźwięku pole „Co nie gra?”, zapisywane razem z zaznaczeniem (`note`). Koszt: 112 kredytów.

## Wprowadzenie narratora i Punkty Czasu (24.10.2026)

Autor uznał pierwszą godzinę gry za zbyt powolną. Chciał wprowadzenia, które nie prowadzi za rękę, tylko jak narrator opowieści przedstawia pierwsze funkcje i kończy zdaniem „Reszty dowiesz się w swoim czasie”. Odpowiedzi A–L autora są poniżej.

### Narrator

1. **Kto mówi.** Narrator to eteryczna, wszechmogąca postać bez płci i bez twarzy: granatowy płaszcz pełen gwiazd, świecące oczy i zwój, który czyta graczowi. Grafika jest z Retro Diffusion (szkic `narrator-stars`, 96×128 px, `src/client/art/narrator/narrator.png`). Autor odrzucił szkic starszej kobiety. Narrator mówi do gracza na „Ty”, bez form rodzajowych. System dalej mówi w swojej niebieskiej ramce, krótko i liczbami.
2. **Karty.** Siedem kart na pergaminie (`data/tutorial.json`), każda w swoim momencie:
    - `intro` i `time` zaraz po stworzeniu postaci,
    - `skip` w trakcie pierwszej eksploracji,
    - `report` w pierwszym raporcie,
    - `character` w Postaci,
    - `camp` w obozie,
    - `ending` po pierwszej budowie (albo gdy nie stać na Ognisko), z ostatnim zdaniem „Reszty dowiesz się w swoim czasie.”

    Karta pokazuje się raz. „Dalej” przechodzi do następnej, a „Pomiń wprowadzenie” kończy całe wprowadzenie. Ten przycisk jest na każdej karcie oprócz ostatniej i przy każdym podświetleniu. Serwer pamięta przeczytane karty (`characters.tutorial`, lista JSON, `POST /api/tutorial`), więc odświeżenie strony albo inne urządzenie wraca w to samo miejsce.
3. **Podświetlenia.** Na pierwszych krokach reszta ekranu jest przyciemniona i nie przyjmuje stuknięć. Jedno miejsce ma złotą obwódkę i podpowiedź:
    - Wiatrołomy, potem Skraj Wiatrołomów,
    - „Wyrusz”, „Przewiń” i „Odbierz raport”,
    - Postać, Statystyki i „Rozdaj według klasy”,
    - obóz, plac Ogniska i „Zbuduj”.

    Stuknięcie w cień porusza obwódką. Kroki wynikają ze stanu postaci i ekranu, więc nie potrzebują osobnego zapisu. Podpowiedzi są w `hints` w `data/tutorial.json`.
4. **Pierwsza eksploracja.** Na pierwszej wyprawie suwak stoi na najdłuższym czasie, czyli 30 minutach. Narrator proponuje przewinąć ją Punktami Czasu, ale gracz może też poczekać. Czas zapamiętany w przeglądarce z wcześniejszej postaci tego nie zmienia: autor widział 10 minut, bo telefon pamiętał wybór z wcześniejszej gry. Po pierwszej wyprawie zapamiętany czas wraca.
5. **Stare postacie.** Postać sprzed wprowadzenia ma `tutorial` równe NULL i nie widzi kart (odpowiedź D: postacie testowe i tak będą usunięte). Nowa postać, także po „Zacznij od nowa”, dostaje wprowadzenie.
6. **Zapas na start.** W porzuconym obozie nowa postać znajduje 15 złota, 15 drewna i 3 kamienie (`startingSupply` w `data/balance.json`), więc od razu może zbudować Ognisko (odpowiedź C). Ekwipunku na start dalej nie ma.
7. **Głos.** Autor chce spróbować głosu narratora (odpowiedź E). Szkice czyta ElevenLabs Text to Speech (`eleven_multilingual_v2`, 1 kredyt za znak, rodzaj `narration` w `audio/prompts.json`, przebieg „Dźwięki (szkice)”). Pierwszą kartę przeczytały cztery głosy z katalogu ElevenLabs, nieco wolniej niż zwykle (tempo 0,92):
    - River, spokojny i neutralny, bez wyraźnej płci, jak narrator,
    - Brian, głęboki i niski,
    - George, ciepły gawędziarz,
    - Lily, miękki i aksamitny.

    Każdy głos jest na stronie odsłuchu w dwóch wersjach: czystej i z lekkim pogłosem dla eterycznego brzmienia (pogłos ok. 12 dB ciszej od głosu, ok. 2,5 s). Autor wybiera jeden przyciskiem „Ten głos”, a wybór trafia do bazy strony (`picks/narrator`). Szkice kosztowały 1088 kredytów. Wszystkie siedem kart w wybranym głosie to ok. 1600 kredytów. Wtedy karta dostanie pole `voice` z plikiem nagrania.

### Punkty Czasu

8. **Waluta.** Punkty Czasu to trzecia waluta obok złota i Punktów Systemu: 1 punkt skraca o 1 minutę eksplorację, odpoczynek albo budowę w obozie. Należą do postaci, jak złoto (odpowiedź J, `characters.time_points`, migracja `0008_time_points.sql`), więc „Zacznij od nowa” je zeruje. Nigdy nie są na sprzedaż (odpowiedź G). Ikona to klepsydra (odpowiedź K). Punktów Czasu nie ma w górnym pasku: są w portfelu, który otwiera stuknięcie złota.
9. **Skąd się biorą** (odpowiedzi H i I):
    - 60 od narratora na start,
    - 2 za każdy poziom postaci i 1 za każdy poziom klasy (od 25.10.2026, wcześniej 3 i 2, zob. „Poziomy stołu, Odłamki i niebezpieczeństwa”),
    - rzadkie znalezisko „odłamek czasu”, warte 5 (`findOutcomes.time` 0.05 i `timePoints` w `data/balance.json`).

    Komunikaty Systemu o awansie podają też Punkty Czasu, a podsumowanie raportu ma wiersz „Punkty Czasu”.
10. **Przewijanie.** Przycisk „Przewiń” z liczbą punktów jest przy trwającej eksploracji, przy odpoczynku (pod linią zagrożenia) i przy budowie w obozie (odpowiedź L). Przed wydaniem punktów pyta o zgodę.
    - Gdy punktów jest mniej niż minut, oczekiwanie skraca się o tyle minut, ile jest punktów („Przewiń o 10 min”).
    - Pełne przewinięcie przesuwa koniec 2 sekundy w przeszłość, jak „Pomiń czas” w trybie testowym.
    - Wynik eksploracji się nie zmienia, bo pochodzi z ziarna zapisanego przy wyjściu.
    - Przewinięty odpoczynek dodaje tyle HP, ile dałyby te minuty w obecnym tempie (z Ogniskiem). W trakcie wyprawy odpoczynku nie da się przewinąć.
    - Budynek produkcyjny po przewiniętej rozbudowie produkuje od nowego końca budowy.

    Płatność i przesunięcie idą jedną transakcją, więc dwa stuknięcia naraz płacą raz (`POST /api/time/skip`, `src/server/time.js`).

### Świat i portfel

11. **Dalej niż puszcza.** Konflikt natury z Systemem jest na początek. Dalsze poziomy mogą prowadzić do niebios, w kosmos, na inne planety albo do wirtualnych światów. Słowiański folklor jest pierwszym światem gry, nie jedynym. Ostatnia karta narratora mówi: „Puszcza to dopiero pierwszy krok drogi, która prowadzi dalej, niż sięga wzrok.”
12. **Kolory walut.** W rozwiniętym portfelu każda waluta ma swój kolor:
    - Złoto jest złote, o co prosił autor,
    - Punkty Systemu mają niebieski Systemu,
    - Punkty Czasu i przycisk „Przewiń” mają bursztyn piasku w klepsydrze (`--time`), żeby nie myliły się ze złotem.
13. **Klepsydra.** Autor zauważył, że ikona Punktów Czasu wygląda jak DNA: dwie skrzyżowane fale. Nowa klepsydra ma proste ścianki zwężające się do szyjki, ramki u góry i u dołu oraz piasek w obu częściach, wypełniony kolorem. Wyraźnie widać ją także przy 12 px. Ta sama ikona jest przy czasie budowy i na zegarze placu w obozie.

## Narrator: pergamin, wskazania i raport (24.10.2026)

Autor odrzucił wszystkie cztery szkice głosu i poprosił o kilka zmian w wprowadzeniu.

1. **Kwestie po kolei.** `data/tutorial.json` ma jedną listę kwestii w kolejności z gry (`lines`). Każda kwestia ma swój rodzaj:
    - `card`: narrator czyta z pergaminu,
    - `point`: sam narrator, w pixel-arcie i bez pergaminu, stoi przy podświetlonym miejscu, mówi kwestię w dymku i czeka na „Dalej”,
    - `tap`: sam narrator przy miejscu, które trzeba stuknąć.

    Kiedy i gdzie kwestia się pojawia, wyznacza kod według id (`BEATS` w `src/client/narrator.js`). Serwer zapisuje przeczytane karty i wskazania. Polecenie do stuknięcia jest wykonane, gdy gra pójdzie dalej, więc serwer go nie zapisuje. Test pilnuje, żeby kod znał moment i miejsce każdej kwestii z danych.
2. **Pergamin się rozwija i zwija.** Pergamin wisi między dwoma drewnianymi wałkami, a figura narratora stoi na górnym. Przed kwestią pergamin rozwija się w dół (0,7 s), a po „Dalej” zwija się (0,4 s) i rozwija z następną kartą. Przy ograniczonym ruchu w ustawieniach telefonu kwestie zmieniają się bez animacji.
3. **Narrator wskazuje sam** (prośba autora). Przy każdym podświetleniu stoi mała figura narratora z dymkiem, którego ogonek wskazuje miejsce. Figura lekko się unosi. Dymek staje pod miejscem albo nad nim, gdzie jest więcej miejsca, i nigdy nie wychodzi poza ekran. Podświetlenie leży nad dymkami gry, więc żaden komunikat nie zasłania „Dalej”.
4. **Przez raport** (prośba autora). Po karcie raportu narrator wskazuje po kolei:
    - podsumowanie,
    - ramkę Systemu,
    - zakładki walk albo tytuł jedynej walki,
    - łupy,
    - „Pełną relację”.

    Wskazanie miejsca, którego na ekranie nie ma, np. łupów z wyprawy bez znalezisk, pomija się samo.
5. **Obóz na mapie.** Karta obozu jest krótsza. Narrator wskazuje plac Tartaku, a po rozpoczęciu budowy Ogniska jej odliczanie. Treść dawnej karty przeszła do tych wskazań.
6. **Teksty do zatwierdzenia.** Autor widzi w tekstach narratora naleciałości AI i sam je poprawia. Teksty czytane głosem trafiają do autora przed nagraniem, żeby nie wydawać kredytów ElevenLabs na wersje do wymiany. Obecne teksty są szkicem: cały scenariusz (kwestie 1–25) czeka na poprawki autora.
7. **Głos.** Żaden z czterech głosów (River, Brian, George, Lily) nie pasuje. Najbliżej jest George, ale ma mówić o wiele wolniej, niżej i bardziej chrapliwie, naturalnie, jak przy ognisku. Po zatwierdzeniu tekstów będzie jedna runda prób na pierwszej kwestii, a potem nagranie kwestii, które autor wskaże. Punkt zastępuje wybór głosu z punktu 7 „Wprowadzenia narratora i Punktów Czasu”.
8. **Na później.** Imiona postaci mają być unikalne w całej grze. Autor zauważył dwie postacie o tym samym imieniu na dwóch kontach. *Zrobione: zob. „Unikalne imiona postaci”.*

## Scenariusz narratora autora (24.10.2026)

1. **Tekst autora.** Autor napisał cały scenariusz od nowa: 31 kwestii w `data/tutorial.json`. W grze są słowo w słowo. Poprawione są tylko literówki („ze” na „że”, „stosuję” na „stosuje”, „dzieki”) i interpunkcja (przecinki, półpauzy zamiast łączników, wielokropki). Narrator nie daje już Punktów Czasu na początku, tylko w lesie, przy pierwszej wyprawie. Ostatnie zdanie jest teraz autora („Tyle na początek… Powodzenia.”). Punkt zastępuje tekst kart z punktów 2 i 7 „Wprowadzenia narratora i Punktów Czasu”.
2. **Cztery rodzaje kwestii:**
    - `card`: pergamin na środku ekranu,
    - `point`: pergamin przy podświetlonym miejscu, z „Dalej”,
    - `lead`: pergamin przy miejscu, które trzeba stuknąć, np. „Zajrzyjmy jeszcze do okienka Postaci…” przy Postaci,
    - `tap`: sam narrator z poleceniem w dymku.

    Każdy pergamin, także ten przy miejscu, rozwija się przed kwestią i zwija po niej.
3. **Kilka miejsc naraz.** Cień ma osobny otwór na każde miejsce, więc Kamieniołom i Kopalnię narrator wskazuje razem. Podświetlone jest tylko to, co widać i da się stuknąć, czyli nic pod dolnym paskiem.
4. **Punkty bez przymusu** (prośba autora). Po pergaminie o statystykach świecą się „Rozdaj według klasy”, wszystkie plusy i pasek z „Zatwierdź”. Gracz rozdaje punkty, jak chce. Krok trwa, aż nie zostanie żaden wolny punkt. Ekran można wtedy przewijać, a stuknięcia poza podświetlonymi miejscami są zatrzymywane.
5. **Obóz.** Po wejściu do obozu narrator czeka 3 sekundy (prośba autora), a potem wskazuje po kolei:
    - plac Tartaku,
    - Kamieniołom z Kopalnią,
    - Kowadło,
    - Ognisko,
    - „Zbuduj”,
    - odliczanie budowy,
    - zębatkę ustawień.
6. **Głos w grze.** Autor chce głosu dla wszystkich pergaminów i poleceń. Kwestia z nagraniem (`voice`) gra po rozwinięciu pergaminu, przez łańcuch efektów, 2,2 raza głośniej od zwykłego efektu. Muzyka przycicha wtedy do ćwierci, a „Dalej” przerywa nagranie.
7. **Druga runda głosu.** ElevenLabs nie przerabia gotowych głosów z biblioteki („Only your own custom voices can be remixed”), więc George'a nie da się remiksować. Na stronie odsłuchu jest 10 prób pierwszego pergaminu:
    - George wolniej (tempo 0,7),
    - George wolniej i niżej (o 2 półtony, z zachowaną barwą),
    - George na modelu Eleven v3,
    - George na v3, wolniej i niżej,
    - trzy nowe głosy zaprojektowane przez ElevenLabs z nagrania George'a jako niższe, starsze i chrapliwe (Voice Design z nagraniem wzorcowym, `audio/references/george-slow.mp3`),
    - trzy głosy z samego opisu starego gawędziarza.

    Wybrany głos zaprojektowany trzeba jeszcze zapisać na koncie ElevenLabs (`generated_voice_id` w szkicach), zanim przeczyta resztę kwestii. Próby kosztowały 354 kredyty, a projektowanie według szacunku narzędzia ok. 1060.
8. **Otwarte.** W tekstach autora są formy męskie („Znalazłeś”, „gotów”, „przybyszu”, „będziesz musiał”), a gra ma postacie kobiece. Pytanie do autora: formy zostają, czy zależą od wyglądu postaci. Nowe jest jedno polecenie bez zatwierdzenia autora: „Rozdaj wolne punkty.”.
9. **Pomijanie pojedynczych pergaminów** (prośba autora). Każdy pergamin ma „Dalej”:
    - na środku ekranu przycisk działa od razu, także gdy pergamin się rozwija, i przerywa czytanie,
    - przy miejscu przechodzi do następnej kwestii,
    - przy pergaminie prowadzącym robi to samo co stuknięcie we wskazane miejsce.

    „Pomiń wprowadzenie” dalej kończy całe wprowadzenie. Polecenie w dymku mija, gdy gracz stuknie wskazane miejsce.
10. **Głos narratora.** Autor wybrał „Gawędziarz 1”, głos zaprojektowany z opisu starego gawędziarza przy ognisku. Na koncie ElevenLabs nazywa się „Narrator” (`voices.Narrator` w `audio/prompts.json`).
    - Wszystkie 31 kwestii nagrał model Eleven v3, na którym ten głos powstał (`allLines`). Kosztowało to ok. 3,5 tys. kredytów.
    - Nagrania są przycięte z ciszy, wyrównane do −18 LUFS i zapisane w mono 56 kb/s: razem 4,4 min i 1,9 MB w `src/client/audio/narration/`.
    - Gdy narrator czyta kwestię, następne nagranie pobiera się w tle.
    - Wszystkie nagrania są na stronie odsłuchu, z „Do wymiany” przy każdej kwestii.
11. **Wersje żeńskie** (decyzja autora, zamyka pytanie z punktu 8). Narrator mówi do gracza zgodnie z wyglądem postaci wybranym przy jej tworzeniu.
    - Dziesięć kwestii ma wersję żeńską (`female` w `data/tutorial.json`): „Znalazłaś”, „gotowa”, „stoczyłaś”, „znalazłaś”, „zdobyłaś”, „Będziesz musiała”, „byś mogła”, „popełniłaś”, „będziesz musiała poznać sama” i „Witaj, przybyszko”.
    - Zmieniają się tylko końcówki, a wersja żeńska ma własne nagranie (`<id>-female.mp3`, ok. 1,4 tys. kredytów).
    - Zmiana wyglądu w ustawieniach zmienia też wersję kolejnych kwestii.
    - Wersja żeńska bez nagrania nie dostaje głosu męskiego, żeby głos nie mówił czego innego niż tekst.
12. **Głos narratora do wyłączenia** (prośba autora: ktoś może go nie chcieć). Przełącznik „Głos narratora” jest:
    - na ekranie tworzenia postaci, zanim narrator się odezwie (domyślnie włączony),
    - w ustawieniach, pod „Efektami dźwiękowymi”.

    Wybór zostaje w tej przeglądarce, tak jak głośność muzyki i efektów. Wyłączenie od razu ucisza czytaną kwestię. Przy wyłączonym głosie gra nie pobiera nagrań, a muzyka nie przycicha. Pergaminy i polecenia zostają bez zmian. Przy okazji muzyka nie zostaje już przyciszona na stałe, gdy kwestii nie słychać, np. przy efektach na 0%.

## Unikalne imiona postaci (24.10.2026)

Autor zauważył dwie postacie o tym samym imieniu na dwóch kontach i poprosił, żeby to uniemożliwić.

1. **Jedno imię, jedna postać.** Imienia postaci gracza nie może nosić żadna inna postać w grze. Wielkość liter się nie liczy: „Łucja” i „ŁUCJA” to to samo imię. Spacje, myślniki, apostrofy i ogonki się liczą: „Anna Maria” i „Anna-Maria” albo „Lucja” i „Łucja” to różne imiona.
2. **Zajęte imię.** Tworzenie postaci kończy się wtedy komunikatem „To imię jest już zajęte. Wybierz inne.” pod polem imienia (409 `name_taken`). Pilnuje tego unikalny indeks w bazie, więc dwie osoby nie zajmą jednego imienia nawet w tej samej chwili.
3. **„Zacznij od nowa” zwalnia imię.** Po usunięciu postaci jej imię może wziąć ktokolwiek, także ten sam gracz.
4. **Postacie sprzed tej zasady zachowują imiona** (`migrations/0009_unique_names.sql`). Gdy dwie mają to samo imię, obie je zachowują. Nowa postać nie weźmie tego imienia, dopóki istnieje starsza z nich.
5. **Tylko gracze.** Zasada dotyczy postaci graczy. Imiona towarzyszy z Etapu 5 mogą się powtarzać.

## Poprawki nagrań narratora i obozu (24.10.2026)

1. **Nowe nagrania 18 kwestii** według uwag autora ze strony odsłuchu („Do wymiany”):
    - **Urwane końcówki.** Model Eleven v3 ucina ostatnią sylabę w 33 z 41 nagrań. Próbne nagrania jednej kwestii porównały cztery sposoby:
        - wielokropek nie pomaga,
        - `previous_text` model odrzuca,
        - znacznik `[pauses]` na końcu daje pełne wybrzmienie, a po nim ciszę.

      Każda kwestia czyta się teraz z `[pauses]` (`ending` w `audio/prompts.json`). Nagranie przycina się tam, gdzie według znaczników czasu ElevenLabs kończy się tekst, z naturalnym wygaśnięciem. Wersje, których końcówka mimo to nie wygasa, odpadają.
    - **Wymowa.** Głos ma wymuszony polski (`languageCode`). Pary `say` w `audio/prompts.json` zmieniają to, co czyta głos, a pergamin zostaje bez zmian, np. „broń,” z przecinkiem, żeby wybrzmiało „ń”. „Suwak stoi na trzydziestu minutach.” ma liczbę słowem także na pergaminie (prośba autora).
    - **Wybór wersji.** Każda kwestia ma 2–4 wersje. Do gry trafia ta, której wysokość głosu (na początku i w całej kwestii) i tempo są najbliższe zatwierdzonym kwestiom. Pozostałe wersje i stare nagranie są na stronie odsłuchu, gdzie autor może wybrać inną („Do gry”).
    - **Koszt.** Ok. 6,5 tys. kredytów razem z próbą. Uwagi autora zostały przy kwestiach na stronie odsłuchu jako „Twoja uwaga”.
2. **Ramka obejmuje nazwę placu** (uwaga autora). Podświetlenie obejmuje także to, co wystaje z miejsca, np. nazwę placu pod nim. Wyjątkiem jest miejsce, które przycina swoją zawartość, jak lista zakładek walk.
3. **Obóz jako zakładka** (uwaga autora). W obozie namiot w górnym pasku świeci się jak bieżąca zakładka, a Walka gaśnie. „Powrót” z obozu prowadzi, jak dotąd, do ostatniej zakładki z dolnego paska.

## Pergaminy przy miejscach, „Ukryj” i przejazd ekranu (24.10.2026)

1. **Pergamin przy tym, o czym mówi** (uwaga autora). Na karcie Postaci pergamin zasłaniał prawie cały ekran, choć narrator mówi, że widać zdobytą broń. Na środku ekranu zostają tylko kwestie ogólne: powitanie, cel, test, wstęp do raportu i zakończenie. Pięć pergaminów stoi teraz przy podświetlonym miejscu, z „Dalej”:
    - „Nie jesteś jeszcze gotów…” przy suwaku czasu,
    - „Jesteś już w lesie…” przy „Przewiń” Punktami Czasu,
    - „W tym oknie Systemu…” przy broni w ekwipunku,
    - „System ułatwia sprawę…” przy „Rozdaj według klasy”,
    - „Na tej polanie…” przy zapasach drewna, kamienia i rudy w obozie.
2. **„Ukryj”** (prośba autora). Każdy pergamin ma „Ukryj”. Pergamin zwija się i odsłania ekran, a narrator czyta dalej. „Pokaż pergamin” na dole ekranu rozwija go z powrotem. Przy pergaminie przy miejscu podświetlenie zostaje. Napisy są w `data/tutorial.json` (`hideLabel`, `showLabel`).
3. **Przejazd ekranu** (prośba autora). Między miejscami ekran nie przeskakuje:
    - pergamin się zwija,
    - ekran płynnie jedzie do następnego miejsca (od 0,5 do 1,4 s, zależnie od odległości),
    - dopiero potem pergamin się rozwija i narrator mówi.

    Przy ograniczonym ruchu w ustawieniach telefonu ekran przeskakuje od razu.
4. **Zatwierdzone przez autora.** „Witaj, przybyszko.” zostaje, a polecenie „Rozdaj wolne punkty.” jest zatwierdzone (zamyka punkt 8 „Scenariusza narratora autora”). Wątek ikonki z poprzedniej rundy dotyczył koloru złota i jest zamknięty.

## Ten sam start po pominięciu i spokojniejsze pergaminy (24.10.2026)

1. **„Pomiń wprowadzenie” daje ten sam start** (prośba autora). Serwer robi za gracza pierwsze kroki z wprowadzenia (`firstSteps` w `data/tutorial.json`):
    - pierwsza wyprawa na Skraj Wiatrołomów, najdłuższa dostępna na starcie (30 minut), przewinięta Punktami Czasu tak, jak każe narrator,
    - odebrany raport: poziomy, Punkty Czasu za nie i pierwsza broń, założona od razu; raport jest w Dzienniku,
    - Ognisko poziomu 1, zbudowane od razu. Budowa trwa minutę, więc gracz z wprowadzenia ma je chwilę później.

    Serwer robi tylko kroki, których gracz jeszcze nie zrobił. Po pominięciu w trakcie wyprawy przewija i odbiera właśnie ją. Wolne punkty statystyk zostają do rozdania. Gdy któryś krok się nie uda (np. konflikt), wprowadzenie i tak się kończy. Komunikat po pominięciu (`skippedText`): „Wprowadzenie pominięte. Pierwsza wyprawa jest już za Tobą, a Ognisko zbudowane. Raport znajdziesz w Dzienniku.” W próbie obie drogi skończyły się na poziomie 2, z klasą na poziomie 2 i 35 Punktami Czasu (60 − 30 + 5 za poziomy).
2. **Pergamin pojawia się powoli** (prośba autora). Po przejeździe ekranu narrator wchodzi powoli (0,5 s), a pergamin rozwija się wolniej niż na środku ekranu: przez 1 s zamiast 0,7 s. Po „Dalej” pergamin się zwija, narrator znika (0,25 s) i dopiero wtedy ekran rusza.
3. **Ograniczony ruch.** Gdy w telefonie włączone jest ograniczanie ruchu, ramki znów nie pulsują, narrator się nie unosi, a obóz nie ma animacji. Reguły, które je wyłączały, stały w arkuszu przed tymi, które je włączają, więc nie działały. Teraz są na końcu arkusza.
4. **Nagrania.** Dwie wersje żeńskie (Postać i Ustawienia) są nagrane jeszcze raz, ze spokojnym, niższym początkiem (`[calmly]`). W Postaci są trzy zapisy „broń” do wyboru: z przecinkiem, wielkimi literami i z pauzą. Do gry trafiły też wersje wybrane przez autora: obóz, powitanie, podsumowanie raportu, suwak i test. Koszt: ok. 1,6 tys. kredytów.
5. **Pozostałe nagrania zostają** (decyzja autora). W 17 kwestiach bez znaczników autora pomiar pokazuje lekko uciętą końcówkę, ale autor jej nie słyszy, więc nie są nagrywane od nowa. Nowe nagrania i tak czytają się z pauzą na końcu (`ending` w `audio/prompts.json`), więc tej sprawy nie trzeba pilnować.
6. **Ostateczne wersje nagrań** (wybór autora na stronie odsłuchu). Do gry trafiły wersje wskazane przez autora, m.in. Postać w wersji żeńskiej z „BROŃ” wielkimi literami, Ustawienia w wersji żeńskiej, łupy w raporcie i „Wybierz Skraj Wiatrołomów”. Wstęp raportu ma według autora za bardzo zmiękczone „zakończyła”, jakby ze wschodnim akcentem. Ma więc cztery nowe próby: dwie z „zakonczyła” zapisanym bez „ń” (`say`) i dwie zwykłe. Autor wybrał drugą z twardszych prób i ona jest w grze. Na stronie odsłuchu zostały tylko nagrania w wersji z gry, bez starych wersji i prób, żeby nie myliły. Koszt prób: ok. 490 kredytów.

## Świeży start dla testujących (24.10.2026)

1. **Wszystkie postacie usunięte** (prośba autora). Każdy, kto testuje grę, ma zacząć od początku, z wprowadzeniem narratora, bez ręcznego „Zacznij od nowa”. Migracja `0010_fresh_start.sql` usuwa przy wdrożeniu wszystkie postacie z przedmiotami, raportami, wyprawami i obozami, tak jak „Zacznij od nowa” na każdym koncie. Konta i logowanie (także przez Google) zostają. Po wejściu do gry każdy tworzy postać i przechodzi wprowadzenie. Migracja działa raz. Gdyby trzeba było cofnąć, D1 ma kopię bazy z ostatnich 30 dni (Time Travel).
2. **Punkty Systemu należą do postaci** (decyzja autora). Leżą teraz w tabeli `characters` (`system_points`, migracja `0011_character_system_points.sql`), jak złoto i Punkty Czasu, więc „Zacznij od nowa” je zabiera. Postać przy przenosinach dostałaby punkty swojego konta, ale po świeżym starcie z punktu 1 nie ma żadnej postaci, więc wszyscy zaczynają od zera. Punkt zastępuje punkt 2 „Planszy obozu i Punktów Systemu”.
3. **Imiona z cyframi i podkreślnikiem** (uwaga testerki, przekazana przez autora). Testerka nie mogła nazwać postaci „Justi_725”. Imię ma teraz od 2 do 20 znaków: litery, cyfry, spacje, myślniki, apostrofy i podkreślniki. Zaczyna się od litery, a kończy literą albo cyfrą. Zakrzywiony apostrof z klawiatury telefonu („’”) liczy się jak prosty. Punkt zastępuje zasadę imienia z punktu 1 „Postaci” w Etapie 1.
4. **Wolniejszy przejazd i wędrujące podświetlenie** (uwaga autora: w raporcie ekran dalej przeskakuje). Pomiar pokazał, że ekran jechał tylko 0,7–1,1 s i z ostrym przyspieszeniem w środku. Podświetlenie pojawiało się na nowym miejscu od razu, a gdy to miejsce było na tym samym ekranie, nic się nie przesuwało. Teraz:
    - ekran jedzie od 0,9 do 2,2 s, zależnie od odległości, łagodnie na początku i na końcu,
    - podświetlenie płynie z miejsca poprzedniego pergaminu do następnego razem z ekranem, co najmniej 0,7 s, także na tym samym ekranie,
    - dopiero potem wchodzi narrator i rozwija się pergamin.
5. **Instalacja na iPhonie** (uwaga testerki). W nowym Safari „Udostępnij” jest w menu strony, pod kreseczkami obok adresu, a nie pod „…”. Instrukcja wymienia teraz kreseczki, a trzy kropki zostały jako wariant ze starszych wersji. Tak samo przy nazwie pozycji: „Do ekranu początkowego” albo „Dodaj do ekranu początkowego”.
6. **Następne miejsce czeka na koniec poprzedniego.** Po „Dalej” gra zapisuje przeczytany pergamin, a odpowiedź serwera wywoływała następne miejsce, zanim pergamin się zwinął. Stąd skok podświetlenia i ekranu, wyraźniejszy przy wolnej sieci w telefonie. Zwijający się pergamin sam teraz uruchamia następną kwestię.

## Kamera narratora i przełącznik animacji (24.10.2026)

1. **Animacje według gry, nie telefonu** (uwaga autora: w raporcie nic nie jedzie, wszystko przeskakuje). Przyczyną było ograniczanie ruchu w ustawieniach telefonu autora. Przy nim gra wyłączała przejazd ekranu, wędrujące podświetlenie, rozwijanie pergaminu i pulsowanie ramek. To samo ustawienie było wcześniej przyczyną niedziałającego „Powtórz” w walce. Teraz o ruchu decyduje przełącznik „Animacje” w Ustawieniach gry, domyślnie włączony, a ustawienie telefonu nie ma znaczenia. Wyłączony przełącznik daje dawny spokojny tryb:
    - ekran przeskakuje od razu,
    - pergaminy się nie rozwijają,
    - ramki nie pulsują,
    - walka gra spokojniej.

    Wybór pamięta przeglądarka. Gdzie wcześniejsze punkty mówią o ograniczonym ruchu w telefonie, chodzi teraz o ten przełącznik.
2. **Kamera narratora** (prośba autora: „używaj zoomu czasem, przejeżdżaj po ekranie, niech kamera pracuje”). Do każdego miejsca narratora jedzie kamera (`src/client/camera.js`). Górny i dolny pasek stoją w miejscu.
    - Między dwoma miejscami na tym samym ekranie kamera się oddala, w połowie drogi do 86–95% (bardziej przy dłuższej drodze). Potem płynnie jedzie do następnego miejsca przez 1,1–2,4 s.
    - Przy małym miejscu, takim jak broń w ekwipunku, plac w obozie czy suwak długości wyprawy, kamera się zbliża, najwyżej 1,25 raza. Miejsca szerokiego jak ekran, np. części raportu, nie przybliża, bo jego ramka wyszłaby poza ekran.
    - Kamera kadruje miejsce tak, żeby pod nim zmieścił się pergamin. Wysokie miejsce pokazuje od góry.
    - Podświetlenie jedzie razem z kamerą. Dopiero potem wchodzi narrator i rozwija się pergamin.
    - Przy miejscu na pasku (np. „Postać” w menu) i przed kartą na środku ekranu kamera wraca do zwykłego widoku. Na innym ekranie zaczyna od zwykłego widoku.
    - Przy rozdawaniu wolnych punktów kamera nie przybliża. Gdy widać pasek rozdanych punktów, tylko przewija.

    W próbie na wymiarach telefonu, z ograniczaniem ruchu włączonym w przeglądarce, kamera jechała w każdym przejściu wprowadzenia. Podświetlenie przesuwało się płynnie, najwyżej o 13 px na klatkę.
3. **Dziennik walki nie przesuwa raportu.** Dziennik pod areną rósł w trakcie walki linijka po linijce i przesuwał w dół wszystko pod sobą. Narrator stał wtedy przy uciekającym miejscu, a podświetlenie skakało. Teraz dziennik od początku ma wysokość całej walki, nadal najwyżej 200 px.

## Tła w walce, pancerz klas i imiona (24.10.2026)

1. **Bez tła za naszymi postaciami w walce** (prośba autora). Popiersia drużyny na arenie miały ciemnozielone tło w ramce, a stwory nie. Teraz stoją na karcie jak stwory, a dół popiersia łagodnie zanika zamiast kończyć się prostą krawędzią.
2. **Pancerz też należy do klas** (prośba autora: Łucznik mógł założyć szatę, a ta ma być tylko dla Maga). Hełm i pancerz noszą tylko klasy, które je wymieniają (`armor` w `data/classes.json`):
    - Wojownik: hełm i kolczuga,
    - Łucznik i Cień: kaptur i kurtka,
    - Mag: kaptur i szata,
    - Kleryk: kapuza i komża.

    Rękawice, buty, amulet, pierścień i talizman nosi każdy, jak dotąd. Łupy i znaleziska mają tylko to, co postać może założyć. Pancerz innej klasy, który postać już nosiła, migracja `0012_class_armour.sql` odkłada do plecaka. Gdy plecak się przepełni, złomiarz kupuje go pierwszego. Kleryk nosił najpierw kolczugę i hełm, a 25.10.2026 rano dostał kaptur i szatę Maga (migracja `0013_cleric_armour.sql` odłożyła jego hełm i kolczugę do plecaka). Tego samego dnia Kleryk dostał, z wyboru autora, własny zestaw: Kapuzę na głowę i Komżę na tułów. Są lekkie jak kaptur i szata Maga (pancerz ×0,4 i ×0,6) i losują te same afiksy co inne przedmioty. Migracja `0014_cleric_set.sql` zmienia kaptur i szatę Kleryka, noszone i w plecaku, w Kapuzę i Komżę o tych samych liczbach i afiksach. Rękawice, buty i biżuteria zostają dla wszystkich klas, także z decyzji autora. Punkt zmienia, za prośbą autora, zdanie „Resztę nosi każdy” w dokumencie projektowym i punkt 12 Etapu 1.
3. **Imię nie odpada po cichu** (uwaga testerki: na iPhonie nie przeszło nawet „Justi”). Serwer przyjmuje „Justi”, także według dawnej zasady, więc przyczyną było raczej zajęte imię, niewidoczny znak z klawiatury albo krótkie okno wdrożenia, gdy postacie były usuwane. Teraz:
    - niewidoczne znaki znikają,
    - litera i jej akcent wpisane osobno łączą się w jedną literę,
    - klawiatura iPhone'a nie poprawia imienia (`autocorrect="off"`),
    - komunikat mówi wprost, co jest nie tak: długość, konkretny niedozwolony znak, pierwsza albo ostatnia litera, a przy zajętym imieniu „To imię nosi już inna postać w grze. Wybierz inne.”
4. **Kolumny usuwać w osobnym wdrożeniu.** Migracje idą przed nowym kodem, więc przez kilka sekund wdrożenia działa stary kod na nowej bazie. Migracja `0011` usunęła kolumnę, z której korzystał stary kod, i przez tę chwilę tworzenie postaci mogło kończyć się błędem. Kolumnę, której kod już nie używa, usuwa się dopiero w kolejnym wdrożeniu.

## Przygotowanie do Sklepu Play (24.10.2026, wdrożone 25.10.2026)

Przygotowanie do Sklepu Play było zleceniem „na przyszłość”, a dwie zmiany poniżej weszły do gry 25.10.2026 na polecenie autora. Sklepem Play zajmiemy się po kolejnych etapach: adres kontaktowy na stronę prywatności i opłata za konto deweloperskie czekają do tego czasu. Plan, teksty i decyzje są w dokumencie [Insight — droga do Sklepu Play](https://claude.ai/artifact/JmVkJMPqQg2MNZmXtHxv5r).

1. **Usuwanie konta.** Google Play wymaga, żeby aplikacja, w której zakłada się konto, pozwalała je usunąć w środku aplikacji. RODO daje to prawo i tak. W Ustawieniach pod „Zacznij od nowa” jest „Usuń konto”. Karta pyta, czy na pewno, a przycisk działa dopiero po wpisaniu własnego loginu. Serwer (`DELETE /api/me`) usuwa od razu:
    - konto,
    - postać z przedmiotami, raportami, wyprawą i obozem,
    - wszystkie sesje,
    - liczniki nieudanych logowań.

    Wraz z kontem znika też połączenie z Google. Potem strona wraca do logowania. Kopie zapasowe bazy (Time Travel) znikają po 30 dniach.
2. **Czcionki na serwerze gry.** Alegreya i Chakra Petch leżą w `src/client/fonts/` (licencja SIL Open Font License, jej teksty są obok), w zestawach łacińskim i łacińskim rozszerzonym, które obejmują polskie litery. Gra nie pobiera już niczego z Google Fonts, więc otwarcie gry nie wysyła adresu IP do Google, a polityka bezpieczeństwa strony dopuszcza style i czcionki tylko z serwera gry.

## Balans i nowe zakładki: najpierw rozmowa z autorem (25.10.2026)

1. **Trudności walki nie stroimy przed umiejętnościami, treningiem i towarzyszami.** Autor: bez umiejętności gra ma prawo być trudna, a wkrótce dojdą umiejętności, trening i być może werbunek drugiej postaci do drużyny. [Dokument o balansie](https://claude.ai/artifact/S3PbhSWFPG1v4w93biGPPR) mierzy grę bez tych systemów, więc jego zmiany walki czekają. Symulację (`tools/progression/`) powtórzymy, gdy te systemy będą w grze.
2. **Umiejętności, profesje i trening autor przedstawia krok po kroku.** Nie przygotowujemy gotowych planów tych zakładek, a propozycje z 24.10.2026 są nieaktualne. Zasada od autora: umiejętności nie otwierają się wszystkie do poziomu 50, skoro postać może dojść do poziomu 500.

## Afiksy od potworów (25.10.2026)

Autor: afiksy mają nawiązywać do potworów, z których wypadają, a nie polujemy na sowy, więc bez „Sowich” przedmiotów. Na razie zmieniają się tylko nazwy w `data/affixes.json`. Identyfikatory, statystyki i wagi zostają, więc przedmioty, które gracze już mają, same dostają nowe nazwy. Statystyka pasuje do zwierzęcia:

| Było | Teraz | Daje |
| --- | --- | --- |
| Zwinny | Lisi | Zręczność |
| Dębowy | Dziczy | Witalność |
| Kamienny | Borsuczy | Wytrzymałość |
| Kryształowy | Kruczy | Intelekt |
| Sowi | Puszczykowy | Mądrość |
| Nieugięty | Żmijowy | Wola |
| Żelazny | Pajęczy (od Krzyżaka) | Pancerz |
| Tura | Basiora | Siła |
| Mgły | Rysia | Zręczność |
| Korzeni | Niedźwiedzia | Witalność |
| Twierdzy | Borsuka | Pancerz |
| Iskry | Lisa | Intelekt |
| Leszego | Puszczyka | Mądrość |
| Ciszy | Dzika | Wola |
| Żaru | Błędnicy | Odporność na ogień |
| Szronu | Licha | Odporność na mróz |
| Jadu | Żmii | Odporność na truciznę |

Niedźwiedzi, Wilczy, Rysi i Kruka już nosiły nazwy potworów i zostają. Pięć przyrostków odporności (Topieli, Burzy, Skał, Mchu, Kapliczki) zostaje, dopóki nie pojawią się potwory wody, elektryczności, ziemi, natury i sakrum. Afiksy nadal losują się z całej listy, bez względu na potwora z walki. Od 26.10.2026 nazwy afiksów nowych przedmiotów dają stwory z miejsca, w którym przedmiot znaleziono (zob. „Nazwy afiksów od stworów z miejsca”).

## Skromne portrety na start (25.10.2026)

1. **Postać zaczyna w skromnym ubraniu.** Autor: dotychczasowe portrety wyglądały jak po pierwszej ewolucji klasy, a postać startuje z niczym. Nowe portrety pokazują postać w prostym, połatanym ubraniu i z pustymi rękami. Generator dał 4 szkice na każdy wygląd, a autor wybrał (kobieta, mężczyzna): Wojownik 2 i 1, Łucznik 2 i 1, Mag 2 i 1, Kleryk 3 i 2, Cień 1 i 1.
2. **Dawne portrety czekają na ewolucję.** Leżą w `art/evolution/portraits/`, a ich opisy są w rodzaju `portraits-evolved` w `art/prompts.json`. Gra pokaże je razem z ewolucjami klas, bo zmiana wizerunku ma być częścią ewolucji.
3. **Opisy dla generatora.** W pierwszej próbie generator narysował kilka szkiców Maga i Wojownika w leśnej scenie albo przyciętych u góry. Opisy proszą teraz o postać na gładkim tle (`isolated figure on a plain background`), a Wojownik nie ma już szerokich barków, przez które wypełniał cały kadr. Szkice z poprawkami kosztowały 10,08 USD, a na koncie Retro Diffusion zostało 33,36 USD.
4. **Wycinek w walce.** Postać zajmuje teraz mniejszą część obrazka, więc w polu 72×72 px na arenie widać głowę i tors mniejszej postaci niż dotąd. Ekran postaci pokazuje ją w całości jak wcześniej.
5. **Postacie tej samej wielkości.** Autor zauważył, że wojowniczka zajmuje prawie całą ramkę, a wojownik obok niej wygląda na podrostka. Generator narysował postacie w różnej skali: od 105 do 128 px wysokości. `tools/normalize-portraits.py` skaluje teraz każdą postać bez wygładzania do 118 px, stawia ją stopami na tej samej linii i ustawia na środku. Popiersia w walce i na kartach klas pokazują dzięki temu głowy podobnej wielkości. Skalowanie bez wygładzania zostawia ostre piksele. Próbka z wygładzaniem i powrotem do kolorów obrazka rozmywała twarze.

## Przewijanie odpoczynku nad wyprawą (25.10.2026)

Autor: przycisk „Przewiń” stał na ekranie wyprawy tuż nad „Wyrusz”, choć przewija odpoczynek, a nie wyprawę, i to myliło. Stoi teraz na górze ekranu, w pasku „Odpoczynek: pełne HP za … min”, nad kartą miejsca, i znika, gdy HP jest pełne.

## Materiały ze stworów, skrzynie skarbów i Stół rzemieślniczy (25.10.2026)

Autor: łupy z bronią i przedmiotami mają być zdarzeniami losowymi, np. skrzynią skarbów znalezioną w lesie, a z potworów wypadają tylko materiały, które w obozie przerabia się na części, jak przy rozbiórce w Diablo 3.

1. **Każdy stwór ma swój materiał** (`data/materials.json`): Skóra wilka, Skóra lisa, Pazury borsuka, Łuska żmii, Kieł dzika, Pióro kruka, Pióro puszczyka, Futro rysia, Jedwab krzyżaka, Kieł basiora, Skóra niedźwiedzia, Ognik błędnicy i Oko licha. Walidacja pilnuje, żeby każdy stwór miał dokładnie jeden.
2. **Rzadkość z gatunku, czasem wyższa.** Zgodnie z wyborem autora rzadkość wynika z gatunku:
    - pospolite: Wilk, Lis, Borsuk, Żmija,
    - rzadkie: Dzik, Kruk, Puszczyk,
    - unikalne: Ryś, Krzyżak, Basior,
    - epickie: Niedźwiedź, legendarne: Błędnica, mityczne: Licho.

    Wyższy poziom stwora czasem podnosi rzadkość o jeden stopień: 0,5% za poziom, najwyżej 25% (`rewards.materialRarityUpPerLevel` i `materialRarityUpMax` w `data/balance.json`). Na poziomie 1 to 0,5%, a na poziomie 25 już 12,5%. Taki materiał nazywa się np. „rzadka skóra wilka”, dlatego rzadkości mają formy dla rodzajów (`forms` w `data/rarities.json`).
3. **Szansa na materiał** to 30% dla pospolitych, potem 20, 14, 10, 7, 5 i 3% (`materialChance` w `data/rarities.json`), za każdego pokonanego stwora. Liczy się, jak dotąd przy łupie, udział walki w czasie wyprawy, wielkość grupy i wymagające spotkanie (×1,5). Wyprawa daje więc tyle samo materiałów na godzinę bez względu na długość: w Wiatrołomach ok. 1,5–2 na godzinę.
4. **Skrzynie skarbów.** Przedmioty dają już tylko skrzynie. Znaleziska są co 18 minut zamiast co 20, a skrzynia ma wagę 0,44 tam, gdzie przedmiot miał 0,3. Przedmiotów jest więc ok. 1,25 na godzinę, jak dotąd z walk i znalezisk razem (wybór autora: „jak dziś łupy”). Złota, zasobów i odłamków czasu ze znalezisk jest na godzinę o ok. 2% mniej.
5. **Pierwsza broń i elita.** Postać bez broni po pierwszej wygranej walce znajduje skrzynię z bronią swojej klasy i od razu ją trzyma. Broń z wcześniejszej skrzyni też trafia od razu do ręki. Pokonana elita zostawia skrzynię z przedmiotem, który częściej jest rzadszy (`rewards.eliteRarityBonus`). Wymagające spotkania dają teraz więcej materiałów zamiast rzadszych przedmiotów, a `itemDropChance` i `toughRarityBonus` zniknęły z `data/balance.json`.
6. **Stół rzemieślniczy** (`craft-table`) to nowy budynek obozu, bardzo tani na start: 3 złota i 3 drewna, minuta budowy. *Dalsze poziomy budują się dłużej: zob. „Ramki w raporcie, wolniejszy Stół rzemieślniczy i większe magazyny”, punkt 4.* Za darmo przerabia materiał na jedną część tej samej rzadkości. Części nazwał autor: Ścinki, Rzemienie, Okucia, Odłamki (najpierw Runy), Bursztyn, Krwawnik i Gwiezdny odprysk.
    - Część zajmuje stołowi 5, 8, 12, 20, 30, 45 albo 60 minut, zależnie od rzadkości (`craftMinutes` w `data/rarities.json`).
    - Każdy poziom stołu przyspiesza pracę o 10% (`craftSpeed`): poziom 1 pracuje 1,1 raza szybciej, poziom 10 dwa razy.
    - Zlecenia idą po kolei, najwyżej 10 naraz (`crafting.queueLimit`), także podczas wyprawy. „Przerób” bierze cały stos materiału, a „Przerób wszystko” każdy stos.
    - Części przybywają same, gdy zlecenie się skończy. Nie trzeba ich odbierać.
7. **Rozbiórka przedmiotu.** Przedmiot z plecaka można rozebrać na stole na 2 + poziom/10 (w dół) części jego rzadkości i jedną więcej za każde ulepszenie (`crafting.salvageBase` i `salvageLevelStep`). Rzadki przedmiot poziomu 25 daje 4 Rzemienie. Rozbiórka, jak sprzedaż, czeka na powrót postaci z wyprawy. Złomiarz dalej kupuje przedmioty za złoto.
8. **Skup złomu.** Na prośbę autora Stół złomiarza nazywa się teraz Skup złomu. Jego opis mówi o skupie, bo rozbieranie przeszło do Stołu rzemieślniczego. Narrator tej nazwy nie wypowiada, więc nagrania zostają.
9. **Części czekają na profesje.** Wyrób przedmiotów z części przyjdzie razem z profesjami.
10. **Na planszy** Stół rzemieślniczy stoi na dole po lewej, przy ścieżce. Staw przesunął się bliżej rogu. Rysunek stołu ma trzy wielkości, jak inne budynki.
11. **Zapis.** Migracja `0015_materials.sql` dodaje postaci materiały, części i kolejkę stołu (JSON, jak zasoby). Nowe API: `POST /api/craft/materials`, `POST /api/items/:id/salvage` i w trybie testowym `POST /api/test/skip-craft`. Zlecenia zapisują się tylko wtedy, gdy postać jest taka, jak przy odczycie (`version`), więc dwa dotknięcia naraz dają jedno zlecenie.

## Podgląd przedmiotu: sama zmiana (25.10.2026)

Autor: po założeniu albo zdjęciu przedmiotu karta ma pokazywać po prostu plus albo minus, bo tak jest czytelniej. Podgląd pokazuje więc różnicę, np. „Średnie obrażenia −4,5”, „Maks. HP +12”, „Unik +0,5%”, zamiast „9–13 → 5–8”. Obrażenia porównują średnią, bo zakres zmienia oba końce naraz. Zmiany mniejsze niż 0,05 się nie pokazują.

## Punkty Czasu co pół godziny (25.10.2026)

Autor: mimo powolnego tempa gra ma dać graczowi trochę ulgi. Co pół godziny przybywa 1 Punkt Czasu, bez względu na to, czy gracz gra, czy nie, bez górnej granicy. To mechanika samego Systemu, bez budynku. Uzupełnia to punkt 9 „Wprowadzenia narratora i Punktów Czasu”.

1. **Zegar.** Kolumna `characters.time_points_at` (migracja `0016_time_points_clock.sql`) mówi, od kiedy liczy się następny punkt. Co `timePoints.generateMinutes` (30) minut od tej chwili przybywa jeden punkt (`gainedTimePoints` w silniku). Zegar przesuwa się o pełne półgodziny, więc rozpoczęta połowa godziny się nie gubi. Nowa postać zaczyna liczyć od stworzenia, a postacie sprzed zmiany od wdrożenia migracji, bez wyrównania za czas wcześniej.
2. **Dopisywanie.** Serwer dopisuje zebrane punkty przy każdym żądaniu gracza, zanim cokolwiek policzy, więc punkty, które przyszły pod nieobecność, można od razu wydać. Zapis zmienia tylko liczbę punktów i zegar, nie wersję postaci, więc zmiana wysłana w tej samej chwili się nie gubi. Warunek na `time_points_at` sprawia, że dwa żądania naraz dopisują punkty raz.
3. **Na ekranie.** Strona liczy przybywające punkty sama, tak samo jak serwer (`timePointsGain` w widoku postaci). Portfel pod złotem pokazuje przy Punktach Czasu odliczanie „+1 za 12:34”, a przycisk „Przewiń” od razu widzi nowy punkt.
4. **Bez limitu.** Punkty zbierają się bez końca, także przez tygodnie nieobecności. Gdyby to kiedyś psuło tempo gry, prostą zmianą będzie górna granica tylko dla punktów z zegara, ale autor jej teraz nie chce.

## Sakwa z materiałami (25.10.2026)

Autor: materiały rzemieślnicze mają być widoczne na ekranie głównym, w rozwijanej liście jak drewno i kamień, ale osobno, w innym miejscu, i z symbolami graficznymi.

1. **Miejsce.** Przycisk z sakwą stoi w górnym pasku na lewo od paska odpoczynku albo wyprawy. Stuknięcie rozwija pod nim listę: materiały według rzadkości i części, które już są, każde z ikoną i liczbą. Na dole jest przejście do Stołu rzemieślniczego z liczbą zleceń w kolejce, a przed budową napis „Zbuduj Stół rzemieślniczy w obozie”. Portfel ze złotem i zasobami zostaje po prawej, a otwarcie jednej listy zamyka drugą. Najpierw sakwa stała obok poziomów, ale przy dużej ilości złota ucinała nazwę klasy, więc przeszła niżej, gdzie jest miejsce.
2. **Symbole.** Ikony materiałów, części i skrzyni to rysunki 32 × 32 z Retro Diffusion, jak przedmioty. Trzy z nich przyszły z czarnym kwadratem w tle. Kwadrat został wycięty ręcznie, a obrys zachowany. Sama sakwa w pasku to ikona wektorowa, jak klepsydra przy Punktach Czasu.
3. **Opis.** Gdy materiałów jeszcze nie ma, karta „Materiały” na Stole rzemieślniczym i sakwa mówią jednym zdaniem autora: „Z pokonanych stworów zdobędziesz różne materiały, które można przerobić na części do rzemiosła.” Na stole zdanie ma niebieskawy kolor wskazówek Systemu.

## Pola walki i popiersia (25.10.2026)

Autor: w walce wojownik zasłaniał napis „Przód”, a Cień napis „Środek”, i obaj nie stali na środku. Cień miał też ucięte włosy.

1. **Napisy pól.** Napis pola stoi teraz nad kartami, a nie pod nimi, i dzieli go od karty odstęp. Żadna karta w spoczynku go nie zakryje, także przy powiększonym tekście w telefonie. Wypad do ciosu nadal na chwilę przesuwa kartę ku celowi.
2. **Wynik walki.** „Zwycięstwo”, „Porażka” albo „Odwrót” pokazuje się na środku rzędu przeciwników. Wcześniej stało na środku areny i zasłaniało napis „Środek” w rzędzie drużyny.
3. **Twarz na środku.** Postacie są narysowane w trzech czwartych, więc głowa bywa przesunięta względem tułowia: u wojownika o 2 piksele, u Cienia o 3, u łucznika o 4. Cała postać na karcie postaci zostaje wyśrodkowana według sylwetki. Popiersia w walce i na kartach klas ustawiają się według twarzy. `tools/normalize-portraits.py` wypisuje, gdzie jest twarz, a liczby trafiają do `faces` w `src/client/art.js`.
4. **Włosy Cienia.** Generator uciął Cieniowi czubek głowy. Brakujące rzędy włosów są dorysowane ręcznie w kolorach jego fryzury, a biała plamka we włosach usunięta. Narzędzie do wyrównania nie skaluje już postaci, która stoi na swojej linii i ma do 8 dorysowanych rzędów nad głową. Ponowne uruchomienie nic nie zmienia. W pozostałych portretach nic nie było ucięte.

## Poziomy stołu, Odłamki i niebezpieczeństwa (25.10.2026)

Uwagi autora po wdrożeniu sakwy i Punktów Czasu co pół godziny.

1. **Ikony.** Nad Skórą niedźwiedzia wisiał niebieskawy kształt jak ostrze, a za Okuciami został kawałek brązowego tła. Oba są wycięte ręcznie.
2. **Odłamki zamiast Run.** Runy pojawią się w grze później jako coś innego, więc epicka część nazywa się Odłamki (`shards`): „Ostre okruchy kryształu, twardsze od stali.” Ikona to fioletowe kryształy z Retro Diffusion, najlepszy z trzech szkiców. Migracja `0017_shards.sql` zamienia zebrane Runy i zlecenia na stole na Odłamki.
3. **Mniej Punktów Czasu za poziomy.** Skoro punkty przybywają same, awans postaci daje 2, a awans klasy 1 (wcześniej 3 i 2).
4. **Poziomy Stołu rzemieślniczego.** Pierwsze poziomy otwierają kolejne rzadkości materiałów i przedmiotów, a dopiero poziom 5 wszystkie:
    - poziom 1: pospolite i rzadkie,
    - poziom 2: do unikalnych,
    - poziom 3: do epickich,
    - poziom 4: do legendarnych,
    - poziom 5: wszystkie, z mitycznymi i boskimi.

    Poziomy 6–10 dają szansę na dodatkowe części: 5% na każdą robioną część za każdy poziom od 6, czyli 25% na poziomie 10. Liczba dodatkowych części zapada przy zleceniu, a stół mówi o nich, gdy skończy. Każdy poziom nadal przyspiesza przeróbkę o 10%, bo tak było do tej pory, a autor tego nie zmienił. Za rzadki materiał czeka na liście z dopiskiem „od poziomu N stołu”. Za rzadki przedmiot nie da się rozebrać, a karta mówi, jakiego poziomu stołu potrzeba (dane: `rarities`, `bonusFromLevel` i `bonusPerLevel` w efekcie stołu w `data/buildings.json`).
5. **Materiały w plecaku, sakwa z częściami.** Materiałów będzie z czasem bardzo dużo, więc sakwa w górnym pasku pokazuje już tylko części do rzemiosła. Materiały mają własną zakładkę w plecaku obok przedmiotów i nie zajmują w nim miejsca. Stuknięcie stosu pokazuje opis materiału, to, co zrobi z niego stół, i drogę do stołu. Zastępuje to punkt 1 „Sakwy z materiałami”.
6. **Czyhające niebezpieczeństwa.** Karta każdego regionu wewnętrznego ma pod opisem przycisk „Czyhające niebezpieczeństwa”. Otwiera on listę stworów, które można tam spotkać, z zakresem ich poziomów:
    - w zwykłych spotkaniach to poziomy miejsca,
    - w wymagających o poziom wyżej,
    - elita ma jeden poziom ponad najsilniejszymi i jest tak podpisana.

    Lista powstaje z danych spotkań regionu (`areaDangers` w silniku), więc nowy stwór w `data/regions.json` sam na nią trafia. Stwór, którego postać jeszcze nie spotkała w walce, to czarny cień z „???” zamiast imienia, a poziomy widać od razu. Pod listą stoi zdanie autora: „Zobaczysz tutaj pełne informacje jedynie o stworach, z którymi stoczyłeś potyczkę.”, a dla postaci kobiecej „stoczyłaś”, jak w kwestiach narratora. Walka, także przegrana, odkrywa go po odebraniu raportu. Spotkane stwory zapisuje kolumna `characters.met` (migracja `0018_met_monsters.sql`). Postacie sprzed zmiany znają stwory z raportów, które jeszcze mają.
7. **Zakładka Lochy.** Kłódka z poziomem stoi pod nazwą zakładki, jak przy Treningu, bez względu na długość nazwy.

## Awans odnawia HP i manę (25.10.2026)

Autor: wbicie poziomu postaci albo klasy odnawia HP i manę do pełna.

1. **Przy odbiorze raportu.** Gdy wyprawa przynosi nowy poziom postaci albo klasy, postać ma po odebraniu raportu pełne HP nowego poziomu, z ekwipunkiem, który nosi po wyprawie (`hpAfterHunt` w silniku). Komunikaty Systemu w raporcie mówią o tym raz (tekst w punkcie 4), także gdy przyszły oba awanse naraz. Tak samo jest przy omdleniu, jeśli walki przed nim dały awans.
2. **Mana.** Na razie nic jej nie wydaje, więc zawsze jest pełna. Gdy umiejętności zaczną ją zużywać, awans też ją odnowi.
3. **Pierwsza wyprawa.** Zawsze daje awans, więc postać wraca z niej z pełnym HP. Kwestia narratora przy Ognisku („Teraz zajmijmy się jednak Twoim powrotem do zdrowia…”) mówiła o ranach, których teraz nie ma. Jej nowy tekst ma zgodę autora (punkt 8 „Zadań od narratora”).
4. **Komunikat o awansie w nowym formacie (26.10.2026).** Autor: „Niech wygląda tak (…) I taki format będziemy stosować. Czytelniejszy.” Każdy zysk ma swoją linię, bez kropki na końcu:
    - „Osiągnięto poziom: 10” i „Osiągnięto poziom Klasy Wojownik: 12”,
    - „Zdobyto wolne punkty statystyk: +10” (punkty z poziomów postaci i klasy razem), „Zdobyto Punkty Czasu: +3” i „Zdobyto Punkty Umiejętności: +1”,
    - na końcu „Awansowałeś. Twoje HP i Mana odnowiły się.”, a przy postaci kobiety „Awansowałaś.”.

    Przed odblokowaniem Statystyk linia punktów kończy się „(rozdasz je od poziomu 2)”. Pod tym blokiem stoją komunikaty o tym, co odblokowały nowe poziomy. Ten sam format dostają kolejne komunikaty Systemu o zyskach.

## Zadania od narratora (25.10.2026)

Autor: narrator codziennie i co tydzień zleca zadania z nagrodami, na początku oparte na eksploracji: pokonanie konkretnych stworów, przerobienie materiałów. Treści zadań autor dopisze później.

1. **Miejsce.** Twarz narratora, wycięta z jego rysunku, stoi w okrągłej ramce w górnym pasku między poziomami a złotem. Złota kropka znaczy, że czeka nagroda albo skrzynia. Żeby twarz zmieściła się na wąskim telefonie także przy dużych liczbach, złoto i Punkty Systemu stoją teraz jedno nad drugim, jak poziomy po drugiej stronie. Na najwęższych telefonach (do 340 px) twarz jest trochę mniejsza, a przycisk ustawień węższy.
2. **Pergamin.** Stuknięcie twarzy rozwija pergamin, taki jak u narratora:
    - na górze zakładki „Dzienne” i „Tygodniowe”, a w prawym górnym rogu skrzynia,
    - pod zakładkami licznik do nowych zadań, według zegara serwera,
    - przy każdym zadaniu obrazek (stwór, który pozostaje cieniem, dopóki postać go nie spotka), tekst, pasek postępu, nagroda i „Odbierz”.

    Pergamin otwiera się na zakładce, w której coś czeka. „Zwiń”, stuknięcie obok albo Escape go zwija. Gdy licznik dobiegnie końca przy otwartym pergaminie, nowe zadania wczytują się same.
3. **Okresy.** Dzienne zmieniają się o północy czasu polskiego, a tygodniowe w nocy z niedzieli na poniedziałek. Strefa to `Europe/Warsaw` z czasem letnim, więc doba zmiany czasu ma 23 albo 25 godzin. Zadania okresu losują się przy pierwszym żądaniu po jego początku, z ziarna postaci i okresu. Zapisują się od razu (kolumna `characters.quests`, migracja `0019_quests.sql`), więc w ciągu dnia się nie zmieniają, nawet po awansie. Nieodebrane nagrody i nieotwarta skrzynia przepadają z końcem okresu. To najprostsza zasada, a kropka na twarzy narratora przypomina o nagrodach.
4. **Rodzaje zadań** (`kinds` w `data/quests.json`):
    - „Pokonaj N stworów”: stwory z najnowszego regionu wewnętrznego otwartego dla klasy postaci, w liczbie, którą średnio przynosi tam 5–8 walk (dzienne) albo 25–40 walk (tygodniowe). Stwór, którego tyle walk nie przynosi średnio ani razu, trafia tylko do tygodniowych, np. kruki w Wilczych Kręgach. Liczą się stwory z wygranych walk, po odebraniu raportu. *Nigdy z miejsca za łatwego dla postaci: zob. „Celowanie, łatwe miejsca, zadania, duch ognia i Google”, punkt 4.*
    - „Spędź na wyprawach łącznie N minut”: 30–90 minut dziennie, 5–10 godzin tygodniowo.
    - „Przerób na Stole rzemieślniczym N materiałów”: 2–4 albo 10–20, tylko gdy stół stoi.
    - „Rozbierz na Stole rzemieślniczym N przedmiotów”: 1–2 albo 5–10, tylko gdy stół stoi.

    Każdy rodzaj trafia się raz na okres, a każdy gatunek stwora raz. Waga rodzaju dzieli się między jego warianty, więc na początku zwykle wychodzą cztery stwory i wyprawy, a ze stołem dwa, trzy stwory, wyprawy i praca przy stole. Teksty, liczby i wagi są w danych. Nowy rodzaj zadania potrzebuje kodu, który liczy jego postęp. Stwory mają w `data/monsters.json` formy nazwy do liczby (`counted`: „wilka”, „wilki”, „wilków”), żeby tekst brzmiał „Pokonaj 3 wilki”.
5. **Nagroda za zadanie** (`rewards`). Losuje się złoto, zasób albo części, w ilości bazowej powiększonej o dodatek za poziom postaci, ±20%:
    - dzienne: złoto 10 + 4 za poziom, zasób 5 + 2 za poziom, części 2,
    - tygodniowe: złoto 40 + 16 za poziom, zasób 20 + 8 za poziom, części 6.

    Kamienia wypada 60% tej ilości, a rudy 40%. Zadanie dzienne daje mniej więcej tyle, co kwadrans wypraw, a tygodniowe tyle, co godzina. Części zależą od poziomu postaci (`levels`): do 24 Ścinki, od 25 Rzemienie, od 50 Okucia, od 100 Odłamki, od 200 Bursztyn, od 300 Krwawnik, od 400 Gwiezdny odprysk.
6. **Skrzynie.** Skrzynia otwiera się, gdy wszystkie zadania okresu są wykonane, bez względu na to, czy nagrody za nie już odebrano.
    - Dzienna: +30 Punktów Czasu i +5 Punktów Systemu.
    - Tygodniowa: przedmiot, +120 Punktów Czasu i +20 Punktów Systemu.

    Przedmiot ma poziom postaci i pasuje do jej klasy. Jak łupy, częściej trafia na puste miejsca ekwipunku. Rzadkość losuje się według progu poziomu (`levels.chestRarities`): do poziomu 24 rzadki 70%, unikalny 25%, epicki 5%, a z kolejnymi progami coraz wyżej, aż po boskie. Przedmiot trafia do plecaka, więc tygodniowa skrzynia czeka, aż będzie w nim miejsce. Ten sam tydzień daje zawsze ten sam przedmiot, kiedy by go nie otworzyć.
7. **Kwestia narratora.** Nowy pergamin przed końcowym wskazuje twarz w górnym pasku: „Codziennie będę Ci zlecał zadania, w taki sposób utrzymamy naszą, mam nadzieję, owocną relację. Będę na Ciebie czekał tutaj.” Tekst zatwierdził autor. Ma jedną wersję, bo nie ma form zależnych od płci gracza. Postacie, które skończyły wprowadzenie przed tą kwestią, usłyszą ją raz, po wejściu do gry, bez przycisku „Pomiń wprowadzenie” (`late` w `src/client/narrator.js`).
8. **Kwestia przy Ognisku.** Ma tekst zatwierdzony przez autora: „Teraz zadbajmy o odpoczynek po kolejnych wyprawach. Przy ogniu Twoja postać szybciej wraca do sił. Zbuduj Ognisko.” Wersja żeńska nie jest już potrzebna.
9. **Nagrania.** Obie kwestie są nagrane w dwóch wersjach (ok. 500 kredytów ElevenLabs). W grze jest wersja bliższa dotychczasowemu głosowi narratora, a obie są na stronie odsłuchu, gdzie autor może wybrać inną.

## Pierwsza wyprawa i rzadsze skrzynie (25.10.2026)

Autor: z pierwszej, 30-minutowej wyprawy po starcie od nowa przyszły 3 przedmioty, w tym rzadka broń. Pierwsza wyprawa ma być liniowa i dać z łupów tylko broń, czyli jedną skrzynię skarbów. Na zwykłych wyprawach skrzyń ma być mniej: dwie na półgodzinnej wyprawie mają być sporym fartem.

1. **Pierwsza wyprawa.** To wyprawa postaci, która nie odebrała jeszcze żadnego raportu: serwer to sprawdza i przekazuje silnikowi (`first` w `simulateHunt`). Wyprawa idzie jednym torem:
    - tylko zwykłe spotkania, bez wymagających i bez elity,
    - znaleziska nie dają skrzyń,
    - jedynym przedmiotem jest skrzynia z bronią klasy po pierwszej wygranej walce, zawsze pospolitą.

    W 400 próbach każdej klasy pierwsza wyprawa kończy się sukcesem i daje dokładnie tę jedną broń. Złoto, zasoby, odłamki czasu i materiały ze stworów przychodzą jak zwykle.
2. **Rzadsze skrzynie.** Waga skrzyni wśród znalezisk spadła z 0,44 do 0,2 (`findOutcomes` w `data/balance.json`). Skrzynia to teraz ok. 21% znalezisk zamiast 37%. Półgodzinna wyprawa postaci na poziomie 5 daje średnio 0,36 skrzyni:
    - żadnej w 67% wypraw,
    - jedną w 30%,
    - dwie w ok. 3% (wcześniej w ok. 10%).

    Godzina wypraw daje średnio ok. 0,8 przedmiotu zamiast ok. 1,25. Pozostałe znaleziska (złoto, zasoby, odłamek czasu, nic ciekawego) wypadają odpowiednio częściej.
3. **Napis pod zadaniami.** Pod zadaniami dziennymi stoi „Skrzynia dziennych zadań dostarcza +30 Punktów Czasu i +5 Punktów Systemu.”, a pod tygodniowymi „Skrzynia tygodniowych zadań dostarcza losowy przedmiot, +120 Punktów Czasu i +20 Punktów Systemu.” Napisy są w danych (`chest.text` w `data/quests.json`), a walidacja pilnuje, żeby ich liczby zgadzały się ze skrzynią.
4. **Dźwięk skrzyni.** Otwarcie skrzyni zadań gra nagranie monet wysypujących się z otwieranej skrzyni (ElevenLabs, `effects.chest` w `data/sounds.json`). Na stronie odsłuchu jest sześć wersji: dwie takie, dwie z magicznym dźwiękiem nagrody na koniec i dwie z garścią monet rozsypaną na stole. Autor może tam wybrać inną.
5. **„Ogniu” przy Ognisku.** Głos czytał „przy ognu”. Nowe nagrania dostały dla głosu zapis „ogńu” albo „ognju” (`say` w `audio/prompts.json`), a tekst w grze się nie zmienił. W grze jest pierwsza wersja z „ogńu”, a wszystkie cztery są na stronie odsłuchu. *W grze jest teraz wersja 3, z „ognju”: zob. „Wybór autora na stronie odsłuchu”.*

## Propozycje umiejętności, profesji i spotkań (25.10.2026)

Autor poprosił, żeby pod jego nieobecność przygotować nowe propozycje listy umiejętności i profesji przy limicie poziomów 500 i pomyśleć o zdarzeniach na eksploracjach.

1. **Zdarzenia bez przedłużania wypraw.** Decyzja autora: na razie żadne zdarzenie nie przedłuża eksploracji. Zdarzenia z wyborem to spotkania z ludźmi na końcu wyprawy, a gracz decyduje, co z nimi zrobić: pomóc, odpuścić, walczyć albo coś innego. Wybór rozstrzyga się od razu. Sekcje „Zdarzenia” i „Technologia” dokumentu projektowego mówią to już od dziś. Pytania 6 i 40 z dokumentu pytań do Etapu 2, o dodatkowy czas z wyboru, są przez to nieaktualne.
2. **Dokument z propozycjami.** [Insight — propozycje umiejętności, profesji i spotkań na wyprawach](https://claude.ai/artifact/TYXTowMKEzDM7mTpVGhzN2) zawiera:
    - rytm 14 umiejętności do poziomu klasy 500, zasady many, poziomów i ulepszeń umiejętności oraz trening,
    - listy 65 umiejętności i 10 cech pierwszych ewolucji,
    - profesje do poziomu 500 z warsztatami w obozie,
    - zasady i 8 przykładów spotkań na końcu wyprawy,
    - 21 pytań do autora z zaleceniami.

    Nic z niego nie wchodzi do gry przed odpowiedziami autora. Propozycje z 24.10.2026 zostają nieaktualne (punkt 2 „Balansu i nowych zakładek”).
3. **Poprawki w dokumencie projektowym.** Sekcje o eksploracji, Punktach Systemu, górnym pasku i wprowadzeniu narratora mówią teraz to samo co gra: pierwsza wyprawa jest liniowa, skrzynie są rzadkie, Punkty Systemu należą do postaci i stoją pod złotem, a ostatnia karta narratora kończy się słowem „Powodzenia.”

## Wybór autora na stronie odsłuchu (25.10.2026)

1. **Kwestia przy Ognisku.** Autor wybrał wersję 3, nagraną z zapisem „ognju”, i ona jest teraz w grze (`src/client/audio/narration/lead-campfire.mp3`). Punkt zastępuje wersję z punktu 5 „Pierwszej wyprawy i rzadszych skrzyń”.
2. **Bez zmian.** Dźwięk skrzyni zadań i kwestia przy zadaniach zostają w wersjach 1, które już były w grze.

## Ramki w raporcie, wolniejszy Stół rzemieślniczy i większe magazyny (25.10.2026)

1. **Walki w ramce razem z areną.** Autor: przy kwestii narratora o walkach złota ramka i kamera mają objąć i zakładki, i toczącą się walkę. Pergamin `report-fights` świeci teraz jedną ramką wokół zakładek (przy jednej walce wokół tytułu), nagłówka walki i areny z oboma rzędami (`whole` w `src/client/narrator.js`, `data-guide="report-fight"` na arenie). Przyciski odtwarzania i opis walki pod areną zostają poza ramką.
    - Gdy ramka z pergaminem nie mieści się między paskami, kamera odsuwa się, najdalej do 0,6 (`whole` w `src/client/camera.js`).
    - Na telefonie 390 × 844 odsuwa się do ok. 0,71, na 412 × 915 do ok. 0,9, a na 360 × 740 do 0,6, z pergaminem nad ramką.
    - Przy wyłączonych animacjach kamera odsuwa się od razu, bez ruchu, a w pozostałych miejscach tylko przewija, jak dotąd.
2. **Pełna relacja rozwinięta i w ramce.** Przy kwestii „A jeśli interesuje Cię przebieg całej wyprawy…” narrator sam rozwija pełną relację, a ramka obejmuje przycisk i wszystkie wpisy (`unfold` w narratorze, zdarzenie `unfold` na przycisku w `src/client/screens/report.js`). Po tej kwestii relacja zostaje rozwinięta.
3. **Bez „Budowa jest tania.”** Na prośbę autora wskazówka na ekranie Stołu rzemieślniczego przed jego zbudowaniem mówi już tylko: „Zbuduj stół, żeby przerabiać materiały i rozbierać przedmioty.”
4. **Wolniejsza rozbudowa Stołu rzemieślniczego.** Autor: poziom 1 zostaje, poziom 2 ma trwać 10 minut, poziom 3 pół godziny, a dalsze mają być trudniej dostępne. Czasy stołu stoją teraz w danych poziom po poziomie (`minutes.levels` w `data/buildings.json`): 1 min, 10 min, 30 min, 1 h, 2 h, 4 h, 6 h, 10 h, 16 h i 24 h. Pozostałe budynki dalej liczą czas ze wzoru, a koszty stołu się nie zmieniły. Walidacja pilnuje, żeby lista miała czas na każdy poziom i rosła.
5. **Magazyny na 2 godziny produkcji za poziom.** Autor: magazyny drewna, kamienia i rudy żelaza mają na poziomie 1 mieścić 2 godziny produkcji i rosnąć z czasem. Każdy poziom daje teraz 2 godziny (`storageHours` 2):
    - 2 h na poziomie 1, np. 12 drewna w Tartaku,
    - 10 h na poziomie 5,
    - 20 h na poziomie 10.

    Punkt zastępuje godzinę za poziom z punktu 2 „Produkcji w obozie”.

## Poziom obozu, pytanie na start, ekran narratora i wielkość widoku (25.10.2026)

1. **Poziom obozu.** Autor: poziom obozu stoi obok tytułu „Obóz”, a przycisk „Rozwiń poziom obozu” w lewym górnym rogu planszy. Rozwój przyspiesza budowanie budynków i jest bardzo drogi w złocie, bez innych zasobów. Z poziomu 1, od którego obóz startuje, na 2 trwa 4 godziny. Najwyższy poziom to 10, a po nim przyjdzie ewolucja w Wioskę, którą zostawiamy na później. Ustalone szczegóły są w `data/camp.json`:
    - Obóz ma poziom 1 od razu, bez budowania.
    - Rozwój kosztuje samo złoto: 500 za poziom 2, a każdy następny dwa razy więcej, aż do 128 000 za poziom 10. Razem to 255 500 złota. Przy ok. 25 złota na godzinę wypraw na poziomach 3–5 poziom 2 kosztuje ok. 20 godzin wypraw, a 128 000 to ok. 175 godzin wypraw postaci na poziomie 50 (ok. 725 złota na godzinę).
    - Rozwój trwa 4, 8, 12, 18, 24, 36, 48, 60 i 72 godziny. Razem to 282 godziny, prawie 12 dni.
    - Każdy poziom ponad pierwszy przyspiesza budowy pozostałych budynków o 10%: ich czas dzieli się przez 1 + 0,1 × (poziom obozu − 1). Na poziomie 10 budowy trwają 1,9 raza krócej. Sam obóz rośnie we własnym tempie.
    - Rozwój obozu zajmuje jedyne miejsce budowy, jak każda budowa, a „Przewiń” Punktami Czasu działa tak samo. *Obok budowy w toku mogą teraz czekać dwie kolejne: zob. „Kolejka budów w obozie”.*
    - Przycisk otwiera ekran obozu (`#/oboz/camp`) z następnym poziomem, kosztem i czasem rozwoju. Gdy obóz rośnie, licznik wisi pod przyciskiem, a na wąskim widoku napis jest mniejszy, żeby nie zasłaniać Kowadła. *Przycisk jest teraz mniejszy, a licznik stoi w nim: zob. „Mniejszy przycisk obozu, przyszpilenie i liczba osłony many”.*
    - Gdy brakuje złota, przycisk mówi „Brakuje złota”, bez „zasobów”.
    - Na poziomie 10 ekran obozu mówi: „Na najwyższym poziomie obóz będzie mógł stać się Wioską. Wioska przyjdzie później.”
2. **Pytanie przed wprowadzeniem.** Pierwszy pergamin pyta słowami autora: „Czy chcesz przejść Wprowadzenie? Pomoże ono zaznajomić Ci się z Systemem, ale jeśli z niego zrezygnujesz – nie stracisz żadnych uzyskanych w Samouczku zasobów.” Myślnik autora stał się półpauzą, jak w innych kwestiach narratora.
    - „Wprowadź mnie” prowadzi dalej, a pod nim mniejszą czcionką stoi „zalecane”.
    - „Pomiń wprowadzenie” kończy wprowadzenie z tym samym startem, co przejście go (zob. „Ten sam start po pominięciu i spokojniejsze pergaminy”).
    - Pergamin nie ma jeszcze nagrania: autor zdecyduje, czy go nagrać. *Decyzja autora: to pergamin autora, nie narratora, więc bez nagrania i bez postaci narratora: zob. „Panel autora, pergamin od autora i leczenie na ekranie Walki”.*
3. **„???” w zadaniach.** Autor: stwór, którego postać jeszcze nie spotkała, ma w zadaniu „???” zamiast nazwy, tak jak sylwetki w „Czyhających niebezpieczeństwach”. Nazwa pokazuje się po pierwszym spotkaniu.
4. **Ekran należy do narratora.** Autor: w trakcie Samouczka gracz nie może przewijać ekranu ani nic robić, także w krótkich przerwach, jakby dotyk był wyłączony. Od pierwszego pergaminu do ostatniego nad grą leży przezroczysta warstwa (`narrator-hold` w `src/client/narrator.js`), a przewijanie palcem, kółkiem i klawiszami jest zablokowane.
    - Stuknięcia trafiają tylko do przycisków narratora, do miejsca, które narrator każe stuknąć, i do okien, które gra otwiera po drodze, np. pytania przy „Przewiń”.
    - Miejsca, które narrator tylko wskazuje, świecą się, ale już nie reagują. Wcześniej stuknięcie w nie przechodziło do gry.
    - Przy „Rozdaj wolne punkty” ekran dalej się przewija, a działają przyciski punktów, jak dotąd.
    - Gdy narrator przez 2,5 s nie ma nic do pokazania albo nie znajduje miejsca na ekranie, gracz odzyskuje ekran, żeby gra nigdy nie stanęła. Wraca on do narratora, gdy ten pokaże kolejną kwestię.
    - Systemowy przycisk wstecz w Androidzie działa dalej.
5. **Kamera pokazuje cały obóz.** Autor: przy pokazywaniu obozu kamera ma sama zjechać w dół przed kolejnym pergaminem, żeby widać było cały obóz. Po kwestii o zapasach, a przed pergaminem o Tartaku, kamera obejmuje całą planszę obozu. Stoi tak bez przyciemnienia przez 1,8 s, a potem jedzie do Tartaku (`survey` w narratorze). Przy wyłączonych animacjach zmienia widok od razu.
6. **„Pomiń wprowadzenie” w wolnym rogu.** Autor: przycisk zasłaniał twarz narratora z zadaniami. Przy podświetleniu przycisk wybiera róg, w którym nie zasłania świecącego miejsca ani narratora: lewy górny, a jeśli tam zasłania, to lewy dolny, prawy górny albo prawy dolny.
7. **Wielkość widoku.** Autor: plus i minus mają oddalać i przybliżać widok całej gry od 75 do 125%, o 5% na stuknięcie.
    - W Ustawieniach jest wiersz „Widok”: „−”, wielkość w procentach i „+”. Przyciski stoją tam, a nie na każdym ekranie, żeby niczego nie zasłaniały. Jeśli autor chce je mieć zawsze pod ręką, dodamy je.
    - Wybór pamięta przeglądarka (`insight.zoom`), więc działa w całej grze, także na ekranie logowania.
    - Gra układa się wtedy dla szerszego albo węższego ekranu, a telefon ją skaluje (znacznik viewport w `src/client/zoom.js`). Dzięki temu okna, pasek i kamera narratora liczą wszystko jak zwykle.
    - Przeglądarka na komputerze pomija ten znacznik i ma własne powiększanie (Ctrl i + albo −), więc wiersz jest tylko na ekranach dotykowych.

## Kolejka budów w obozie (25.10.2026)

1. **Do trzech budów naraz.** Autor: „Powinna być też możliwość kolejkowania max 3 budów w obozie, jeśli zasoby na to pozwalają graczowi.” Przyjęte: naraz są najwyżej 3 budowy, licząc tę w toku (`queue` w `data/camp.json`). Autor potwierdził, że tak ma zostać.
2. **Płaci się od razu.** Budowa dodana, gdy coś już się buduje, czeka w kolejce. Gracz płaci za nią przy dodaniu cały koszt, więc dodać ją można tylko wtedy, gdy starcza złota i zasobów.
3. **Rusza sama.** Czekająca budowa zaczyna się, gdy skończy się poprzednia, także gdy gracza nie ma w grze. Serwer uruchamia ją przy najbliższym wczytaniu postaci, z czasem, w którym powinna była ruszyć (`settleBuilds` w `src/server/characters.js`). Magazyn budynku produkcyjnego trafia wtedy do zasobów, a odpoczynek liczy się do tej chwili, jak przy budowie zaczętej ręcznie. Kolejka jest zapisana przy postaci (`build_queue`, migracja 0020).
4. **Kolejne poziomy.** W kolejce może stać ten sam budynek kilka razy, kolejnymi poziomami, a także rozwój obozu. Następny poziom na ekranie budynku i jego koszt liczą się po wszystkich budowach z kolejki. Czas liczy się w obozie, jaki te budowy zostawią: np. Stół rzemieślniczy na poziom 2 po rozwoju obozu do poziomu 2 buduje się 9 minut zamiast 10.
5. **Przewijanie.** „Przewiń” Punktami Czasu i „Pomiń czas” w trybie testowym skracają budowę w toku, a cała kolejka przesuwa się o tyle samo.
6. **Na ekranie.**
    - Gdy coś się buduje, przycisk na ekranie budynku mówi „Dodaj do kolejki: poziom N”, a przy pełnej kolejce „Kolejka budowy pełna”, z wyjaśnieniem pod spodem.
    - Ekran budynku pokazuje też jego poziomy czekające w kolejce, z godziną startu.
    - Pod planszą obozu stoi lista „Kolejka budowy: 2 z 3” z godzinami startu, a nad placem czekającego budynku napis „w kolejce”.
7. **„Anuluj” ze zwrotem kosztu.** Na prośbę autora każda budowa czekająca w kolejce ma przycisk „Anuluj”, na liście pod planszą i na ekranie budynku.
    - Gra najpierw pyta („Zostaw” albo „Anuluj budowę”) i podaje, co wróci.
    - Budowa wypada z kolejki, a gracz dostaje z powrotem cały jej koszt, dokładnie ten zapłacony: kolejka trzyma go przy budowie (`cost`).
    - Razem z nią wypadają, też ze zwrotem, wyższe poziomy tego samego budynku czekające po niej, bo jej potrzebują.
    - Reszta kolejki przesuwa się wcześniej, a jej czasy liczą się od nowa (`replanQueue` w `src/engine/camp.js`). Po anulowaniu poziomu obozu dalsze budowy wracają więc do wolniejszego tempa.
    - Budowy w toku nie da się anulować: zaczęła się, zebrała magazyn i trwa. Jeśli autor chce to zmienić, trzeba będzie ustalić, ile kosztu wraca.

## Panel autora, pergamin od autora i leczenie na ekranie Walki (25.10.2026)

1. **Panel autora.** Autor zapytał o zawsze dostępną listę kont i postaci z imionami i podpiętymi adresami e-mail albo kontami Google. Zgodził się na panel w grze, widoczny tylko dla swojego konta.
    - Ustawienia konta autora mają przycisk „Panel autora”, który otwiera ekran `#/autor` (`src/client/screens/author.js`).
    - Na górze ekranu są liczby: konta (i nowe w ostatnich 24 h), postacie (i nowe w ostatnich 24 h) oraz konta połączone z Google.
    - Pod nimi jest każde konto, od najnowszego: login, adres e-mail, znaczek „Google”, postać z klasą i poziomami oraz data założenia konta. Lista mieści do 1000 kont.
    - Dane czyta serwer przy każdym wejściu i po „Odśwież” (`GET /api/author`, `src/server/author.js`), więc są zawsze aktualne, bez czekania na godzinę.
2. **Tylko konto autora.** Panel widzi konto z listy `AUTHOR_LOGINS` w `wrangler.jsonc` (teraz „Skrajny”), i tylko wtedy, gdy jest połączone z Google. Takie konto ma tryb testowy, więc otwiera się już tylko przez Google, nie hasłem. Każdy inny dostaje „nie znaleziono”, a strona nie pokazuje mu przycisku.
3. **Adresy e-mail.** Gra nie zna imion graczy: zna loginy, imiona postaci i adresy e-mail.
    - Konto założone przez Google ma adres, który Google potwierdził.
    - Od teraz konto, które połączyło Google później, dostaje ten adres przy łączeniu albo przy najbliższym logowaniu przez Google, jeśli nie miało żadnego, a żadne inne konto go nie ma (`keepEmail` w `src/server/google.js`).
    - Adres wpisany przy rejestracji zostaje bez zmian.
    - Lista nie wychodzi poza grę: dane innych osób zostają za logowaniem autora.
4. **Pergamin od autora.** Autor: pierwszy pergamin nie jest pergaminem narratora, tylko autora. Nie trzeba go nagrywać ani stawiać przy nim postaci narratora.
    - Karta ma w danych `speaker: "author"` (`data/tutorial.json`).
    - W miejscu „Narrator” jest podpisana „Autor” (`authorLabel`) i nie ma nad nią postaci narratora.
    - Walidacja pilnuje, żeby taka karta nie miała nagrania ani wersji żeńskiej.
    - Narrator pojawia się od następnej karty.
5. **Wielkość widoku.** Autor: przyciski „−” i „+” wystarczą w Ustawieniach. Zostają tylko tam.
6. **Leczenie Punktami Czasu na ekranie Walki.** Autor: na ekranie Walki ma się dać uleczyć postać Punktami Czasu. Pasek „Odpoczynek: pełne HP za …” z przyciskiem „Przewiń” stoi teraz na górze każdego ekranu Walki: listy regionów, regionu i miejsca przed wyruszeniem (dotąd był tylko na tym ostatnim). Działa jak dotąd: punkt na minutę odpoczynku, z pytaniem o zgodę. Znika przy pełnym HP i bez punktów.

## Reszta obozu we wprowadzeniu (25.10.2026)

1. **Trzy nowe kwestie narratora.** Autor: „warto by w Samouczku opisać resztę nowych i nienowych lokacji, których nie opisaliśmy”, czyli miejsc w obozie (potwierdzone przez autora). Narrator mówi teraz o każdym budynku. Po Kowadle, a przed „Teraz zadbajmy o odpoczynek…”, stoją trzy pergaminy przy miejscach (`data/tutorial.json`):
    - `camp-loot-shed`, przy Szałasie na łupy i Skupie złomu naraz, tak jak Kamieniołom z Kopalnią: „Zdobycze z wypraw trafiają do plecaka. Szałas na łupy go powiększy, a Skup złomu sprawi, że złomiarz zapłaci Ci więcej za to, czego nie potrzebujesz.”
    - `camp-craft-table`, przy Stole rzemieślniczym: „Przy Stole rzemieślniczym przerobisz materiały ze stworów na części. Możesz tam też rozebrać zbędne przedmioty. Części przydadzą się, gdy poznasz profesje.”
    - `camp-level`, przy „Rozwiń poziom obozu”: „Rozwijać możesz także sam obóz. Kosztuje to tylko złoto, a każdy poziom obozu przyspiesza wszystkie budowy. Budowy możesz też ustawiać w kolejce, do trzech naraz.” Ostatnie zdanie, o kolejce, jest dopisane na prośbę autora.
2. **Teksty zatwierdzone przed nagraniem.** Nie mają form zależnych od płci, więc nie mają wersji żeńskich.
3. **Nagrania.** ElevenLabs nagrał po trzy wersje każdej kwestii tym samym głosem i modelem co resztę wprowadzenia (`allLines` w `audio/prompts.json`), za 1479 kredytów. Dwie wersje urywały ostatnie słowo i odpadły, a pozostałe siedem (2, 2 i 3) jest na stronie odsłuchu, przycięte i wyrównane jak reszta. Wybór autora ze strony odsłuchu jest już w grze (`src/client/audio/narration/`): przy Szałasie i Skupie wersja 2, przy Stole wersja 1, a przy poziomie obozu wersja 3.
4. **Kto je zobaczy.** Tak jak pozostałe pergaminy obozu: postać, która jest w obozie przed pierwszą budową. Postacie, które już coś budują albo skończyły wprowadzenie, ich nie dostaną.
5. **Sprawdzone na telefonie.** Na 390 × 844, na 360 × 740 bez animacji i na 390 × 844 przy widoku 125% ramka obejmuje miejsca, a narrator i „Pomiń wprowadzenie” ich nie zasłaniają.

## Strona nadąża za serwerem i budowa na górze ekranu budynku (25.10.2026)

1. **Zawieszenie po zminimalizowaniu.** Autor: po zminimalizowaniu przeglądarki w trakcie wprowadzenia samouczek się zawiesił. Odpowiedź na „Wyrusz” zginęła po drodze, więc strona i narrator dalej czekały na „Wyrusz”, a kolejne stuknięcie mówiło już tylko „Postać jest na wyprawie”. Pomogło dopiero ponowne zminimalizowanie. Propozycja autora: automatyczne odświeżenie w takiej sytuacji.
    - Gdy serwer odrzuca czynność jako nieaktualną (409) albo odpowiedź na nią ginie po drodze, strona sama pobiera postać jeszcze raz (`call` w `src/client/state.js`). Ekran i narrator idą wtedy dalej same, bez przeładowania strony.
    - Odpowiedź na wcześniejsze odczytanie, która wraca po odpowiedzi na czynność, nie wstawia już na ekran starszego stanu postaci.
    - Sprawdzone w przeglądarce: po zgubionej odpowiedzi na „Wyrusz” strona pokazuje trwającą wyprawę, a narrator przechodzi do „Jesteś już w lesie…”.
2. **Budowa na górze ekranu budynku.** Autor: „Budowa i rozbudowa powinna zawsze być na samym szczycie danej lokacji obozu.” Na ekranie każdego budynku i samego obozu zaraz pod nagłówkiem stoją: budowa w toku, poziomy czekające w kolejce i następny poziom z kosztem oraz „Zbuduj” albo „Ulepsz”. Obraz budynku, opis, magazyn i listy Stołu rzemieślniczego są pod nimi.

## Narrator bez powtórek i złota kropka przy wolnych punktach (25.10.2026)

1. **Pergamin rozwijany dwa razy.** Autor: czasem po „Dalej” pergamin próbuje się rozwinąć dwukrotnie.
    - Przyczyna: każde „Dalej” zapisuje kwestię na serwerze osobno, a odpowiedź może przyjść dopiero po następnym „Dalej”. Lista przeczytanych kwestii w takiej odpowiedzi nie miała jeszcze kwestii przed chwilą minionej, więc narrator pokazywał ją jeszcze raz.
    - Teraz kwestia minięta na stronie zostaje minięta, choćby przyszła starsza lista (`passedHere` w `src/client/narrator.js`). Te kwestie odchodzą razem z postacią: po „Zacznij od nowa” i po wylogowaniu.
    - Sprawdzone przy odpowiedziach spóźnionych o 2,5 s: karty idą po kolei bez powtórek, a nowa postać o tym samym imieniu zaczyna od pierwszej karty.
    - Druga przyczyna (26.10.2026, autor i testerka na iPhonie): przy wskazówkach narrator wchodził na ekran przez pół sekundy z pergaminem już otwartym, a potem pergamin zwijał się do zera i rozwijał od nowa. Teraz mały pergamin jest zwinięty, dopóki narrator nie wejdzie, i rozwija się raz.
2. **Wolne punkty statystyk.** Autor: przy wolnych punktach podświetlenie jak przy gotowym zadaniu. Dopóki postać ma wolne punkty, a Statystyki są odblokowane:
    - „Postać” na dolnym pasku i „Statystyki” na pasku postaci mają złotą kropkę, jak twarz narratora, gdy czeka nagroda,
    - „Wolne punkty” na ekranie statystyk świecą na złoto.

    Po rozdaniu punktów podświetlenie gaśnie.

## Kategorie przedmiotów jak w Metin2 i drugi talizman (25.10.2026)

1. **Bez godła.** Autor: ikonka talizmanu musi być uniwersalna, bo liść na niej mylił („Talizman Lisa” nie ma nic wspólnego z liściem). Retro Diffusion narysował 4 szkice bez godła: dwa kamienie z dziurką na rzemyku i dwa drewniane krążki (0,72 USD). W kamieniach biała plamka w miejscu dziurki stała się przezroczysta.
2. **System przedmiotów jak w Metin2** (wyjaśnienie autora, z dodatkiem afiksów zależnych od rzadkości). Kategoria, np. sztylety albo talizmany, to nie jeden przedmiot. Ma wiele baz: zwykły Sztylet, a dalej np. Kordelas od 15. poziomu klasy, z inną ikonką i mocniejszymi liczbami. Każda baza dostaje afiksy swojej rzadkości jak dotąd, a lista baz będzie duża.
    - W danych dalsza baza kategorii ma `family` (id pierwszej bazy, np. `talisman`) i `classLevel`, poziom klasy, od którego postać może jej używać (`data/item-bases.json`). Mocniejsze liczby daje jej premia `bonus` (punkt 4), a współczynnik ma taki sam jak pierwsza baza. Pole `category` zostaje przy broniach dla rodzaju obrażeń.
    - Klasy w `classes.json` wymieniają kategorie (pierwsze bazy), więc np. Kordelas należałby do tych samych klas co Sztylet.
    - Łup losuje najpierw kategorię, tak samo często jak dotąd, a potem jedną z jej baz. Kategoria z większą liczbą baz nie wypada więc częściej (`randomItem` w `src/engine/items.js`).
    - **Gdzie wypada dalsza baza** (autor). Na wyprawach wypada tylko tam, gdzie zakres poziomów miejsca sięga jej poziomu klasy. Otoczak (od 10. poziomu klasy) nie wypada więc w Skraju Wiatrołomów (1–5). Wypada od Lisich Jarów (6–10) wzwyż.
        - Decyduje miejsce, nie poziom klasy postaci. Postać z 5. poziomem klasy może znaleźć Otoczaka w Lisich Jarach i założy go od 10. poziomu. Postać z 20. poziomem klasy nie znajdzie go w Skraju Wiatrołomów.
        - Reguła obejmuje skrzynie ze znalezisk, skrzynie z elity i skrzynię pierwszej broni.
    - Poza wyprawami dalszą bazę daje tylko cotygodniowa skrzynia zadań (codzienna nie ma przedmiotu). Tu decyduje poziom klasy postaci, a nie miejsce wypraw, więc przedmiot od razu pasuje. Postać z 10. poziomem klasy może dostać w niej Otoczaka, nawet gdy chodzi tylko po Skraju Wiatrołomów.
    - Przedmiotu z bazy wymagającej wyższego poziomu nie da się założyć: karta przedmiotu mówi „Od poziomu klasy N”, a serwer odpowiada „Ten przedmiot założysz od poziomu klasy N.”
3. **Dwa talizmany.** Wybór autora z arkusza szkiców: kamień z dziurką (nr 2) i drewniany krążek (nr 4).
    - **Talizman**, drewniany krążek ze słojami, jest pierwszą bazą kategorii, dla każdego od początku: Witalność ×0,3, bez zmian. Dotychczasowe talizmany graczy wyglądają teraz tak.
    - **Otoczak**, kamień z dziurką, to dalsza baza od 10. poziomu klasy (autor zmienił z 15.): Witalność jak u Talizmanu i do tego +2–4. Nazwę dobrano na wzór Kordelasa z przykładu autora i łatwo ją zmienić w danych.
    - Stary obrazek z liściem wypadł z gry.
4. **Premia +x zamiast mnożnika** (autor). Mnożnik przy zwykłym przedmiocie robi zbyt dużą różnicę na wyższych poziomach. Mnożniki i duże wzrosty procentowe zostają dla bardzo rzadkich przedmiotów.
    - Dalsza baza kategorii ma stałą premię `bonus` (`{ "min", "max" }` w `data/item-bases.json`). Premia losuje się raz, przy powstaniu przedmiotu, i dodaje do obrażeń broni (min i max), pancerza albo statystyki.
    - **Lepsza wersja** (autor, 26.10.2026): dalsza baza ma też odrobinę wyższe bazowe liczby niż pierwsza. Jej współczynnik jest o około 5% wyższy, zaokrąglony w górę do setnych, np. Miecz 1,2 i Pałasz 1,26, Talizman 0,3 i Otoczak 0,32. Przewaga rośnie więc z poziomem przedmiotu, ale tylko odrobinę, a większość daje premia.
    - Zakres dobieramy jako około 30–50% liczby zwykłego przedmiotu pierwszej bazy na poziomie przedmiotu równym poziomowi klasy bazy. Przy broni to 25–40% średnich obrażeń. Dla Otoczaka: Talizman na 10. poziomie ma Witalność +8, więc premia to +2–4.
    - Walidator pilnuje, żeby dalsza baza miała premię i współczynnik wyższy niż pierwsza, ale najwyżej o 20%, żeby nie stał się mnożnikiem. Pierwsza baza nie może mieć premii.
    - Otoczaki znalezione przed tą zmianą zachowują swoje liczby, bo przedmiot pamięta je od znalezienia.
5. **Retro Diffusion oszczędnie** (autor). Przy kolejnych przedmiotach robimy jeden szkic na przedmiot, a drugi tylko dla odrzuconych. Arkusz czterech szkiców zostaje dla wyjątków, np. gdy pierwszy pomysł na wygląd nie pasuje.

## Umiejętności: wybór jednej z trzech na 10. poziomie klasy (25.10.2026)

Autor: na 10. poziomie klasy każda klasa wybiera jedną z trzech swoich umiejętności. Kolejne poziomy umiejętności i ich ewolucje projektujemy później. Tym razem autor poprosił o gotową propozycję, więc zasada z „Balans i nowe zakładki”, punkt 2, nie dotyczy tego kroku. Propozycja do poprawek autora: [Umiejętności klas i przedmioty od 10. poziomu klasy](https://claude.ai/artifact/HhMWeUEZSkCqPH52bJoXz1).

**Wdrożenie** (autor: „Umiejętności są okey”). Do tego uwaga autora: każdą umiejętność da się wzmacniać Punktami Umiejętności, do 20 poziomu. Bonusy mogą więc startować niżej i rosnąć powoli. Pytania z końca propozycji zostały bez zmian, więc wchodzą odpowiedzi domyślne: wybór na stałe, pełna mana w każdej walce, Kula ognia zawsze jest ogniem, a przedmioty przychodzą później.

1. **Dane.** 15 umiejętności, po 3 na klasę, jest w `data/skills.json` (schemat `data/schemas/skills.schema.json`). Liczba umiejętności to stała wartość albo para [poziom 1, poziom 20], a między nimi rośnie po równo z poziomem. Przykład: Potężny cios bije za 140% obrażeń i pomija 20% pancerza na 1. poziomie, a na 20. bije za 200% i pomija 40%.
    - Opis skutku na karcie podstawia liczby obecnego poziomu, a „Na poziomie N+1” liczby następnego. Test pilnuje, żeby każdy kolejny poziom różnił się na karcie, więc żaden punkt nie znika bez śladu. Do tego doszedł format `{nazwa%.1}`, czyli procent z jednym miejscem po przecinku.
2. **Punkty Umiejętności.** Każdy poziom klasy po 10. daje 1 punkt (`balance.skills`). Wybrana umiejętność startuje z 1. poziomu, a każdy punkt podnosi ją o poziom, do 20. Pełne 20 poziomów wypada więc na 29. poziomie klasy. Punkty zebrane przed wyborem czekają. Od 26.10.2026 punkt daje też 10. poziom klasy (zob. „Punkty Umiejętności od 10. poziomu klasy”).
3. **Wybór na stałe.** Dokument projektowy zapowiada, że zmiana ścieżki będzie bardzo kosztowna. Zanim powstanie, wyboru nie da się cofnąć, a ekran pyta „Wybrać: …?”.
4. **Mana.** Każda walka zaczyna się z pełną maną: 20, plus 5 za punkt Mądrości i 2 za poziom postaci (nowe `character.manaPerLevel`). W walce mana nie wraca. Bez many postać bije zwykłymi ciosami.
5. **Postać używa umiejętności sama:**
    - ciosy i ataki na grupę zastępują zwykły cios, gdy minęło odnowienie i starcza many;
    - Modlitwa o zdrowie leczy w ruchu kleryka, gdy HP spadnie poniżej 60%;
    - Błogosławieństwo i Zatrute ostrze działają od początku walki i nie zabierają ruchu;
    - Nieugięty, Osłona many i Taniec cieni budzą się raz na walkę, gdy HP spadnie poniżej progu.
6. **Cios w plecy** uderza wroga, który stoi najdalej z tyłu (dokument projektowy), a przy równych wybiera tego, którego zabije najszybciej.
7. **Zakładka Umiejętności** otwiera się na 10. poziomie klasy. W `data/unlocks.json` odblokowanie może teraz zależeć od poziomu klasy (`classLevel`).
    - Raport wyprawy podaje odblokowanie i zdobyte Punkty Umiejętności.
    - Postać, która ma już 10. poziom klasy, od razu widzi złotą kropkę przy zakładce i czekające punkty.
    - Na wyprawie umiejętności się nie zmienia, tak jak statystyk.
8. **Balans z symulacji postępu** (`tools/progression`, 100 przebiegów na wariant, nowa polityka `skill=0/1/2`). Pierwsza wersja liczb była nierówna:
    - Modlitwa o zdrowie skracała drogę kleryka do 50. poziomu o 41%, bo dodatek „1 HP za punkt Mądrości” przy Mądrości 93 na 20. poziomie dawał ponad 30% maks. HP na jedną modlitwę;
    - Osłona many skracała drogę maga o 35%, bo duża mana maga zatrzymywała więcej obrażeń, niż mag ma HP;
    - Taniec cieni dawał cieniowi tylko 8%.

    Po poprawkach:
    - Modlitwa leczy 3–6% maks. HP i dodatkowo 1 HP za każde 10 punktów Mądrości;
    - każdy punkt obrażeń pochłonięty przez Osłonę many kosztuje 3,5 many na 1. poziomie i 1,6 na 20.;
    - Taniec cieni budzi się poniżej 50% HP, trwa 5 ciosów wrogów, a unik rośnie o 40–60 pkt proc. z kontrą za 80–120%.

    Godziny wypraw do 50. poziomu bez umiejętności i z każdą z trzech (różnice do około 2 h to szum):

    | Klasa | Bez | Pierwsza | Druga | Trzecia |
    | --- | --- | --- | --- | --- |
    | Wojownik | 42,1 | Potężny cios 39,1 (−7%) | Szeroki zamach 40,0 (−5%) | Nieugięty 37,9 (−10%) |
    | Łucznik | 54,7 | Celny strzał 48,8 (−11%) | Grad strzał 49,5 (−9%) | Przyszpilenie 48,5 (−11%) |
    | Mag | 63,1 | Kula ognia 53,7 (−15%) | Mroźny podmuch 57,1 (−10%) | Osłona many 53,7 (−15%) |
    | Kleryk | 61,8 | Modlitwa o zdrowie 52,4 (−15%) | Egzorcyzm 55,6 (−10%) | Błogosławieństwo 53,8 (−13%) |
    | Cień | 59,8 | Cios w plecy 52,6 (−12%) | Zatrute ostrze 52,5 (−12%) | Taniec cieni 51,3 (−14%) |

    Umiejętność skraca drogę do 50. poziomu o 5–15%, a słabszym klasom pomaga trochę bardziej. Trzy wybory jednej klasy różnią się najwyżej o około 5 punktów procentowych.
9. **Ikony** są szkicami Retro Diffusion, po jednym na umiejętność (0,18 USD za szkic, razem 2,70 USD).
    - Wygląd ma zgodę autora poza dwiema uwagami: ikony mają tło, a w Szerokim zamachu łuk wyglądał, jakby zamach szedł rękojeścią, nie ostrzem.
    - Tło zniknęło z dwunastu ikon bez nowych szkiców, więc zatwierdzony motyw został. Ciemne kolory tła (zieleń, turkus, fiolet) zostały wycięte od zewnętrznej krawędzi ikony. Kontur motywu zatrzymywał wycinanie, więc to, co jest w jego środku, zostało.
    - W Ciosie w plecy razem z tłem zniknęła ciemna sylwetka cienia za sztyletem, bo była prawie w kolorze tła i zajmowała pół kwadratu.
    - Szeroki zamach dostał drugi szkic (0,18 USD) z opisem, w którym łuk ciągnie się za czubkiem ostrza, a rękojeść jest w środku zamachu.
10. **Animacje.** W odtwarzaniu walki nad postacią pojawia się nazwa umiejętności, a każda umiejętność ma własny efekt (`src/client/skill-fx.js`): łuk ostrza, podmuch mrozu, słupy świętego światła, deszcz strzał, wielką kulę ognia, bańkę osłony, cienie tańca i aurę błogosławieństwa.
    - Efekty mieszczą się w arenie, więc strona nie przewija się w bok.
    - Panel autora ma „Podgląd umiejętności”. To krótka walka postaci 20. poziomu z umiejętnością na 10. poziomie, przeciw stworom dobranym tak, żeby umiejętność się pokazała. Graczom ten podgląd się nie pokazuje.
11. **Wydajność.** Walka, w której nikt nie ma umiejętności, liczy się tak jak przedtem i losuje te same liczby. Kod umiejętności działa tylko w walkach, w których ktoś ją ma, więc szacowanie zagrożenia mieści się w limicie czasu procesora.

## Dwadzieścia przedmiotów od 10. poziomu klasy (26.10.2026)

20 przedmiotów z [propozycji](https://claude.ai/artifact/HhMWeUEZSkCqPH52bJoXz1) i opis ich działania mają zgodę autora, z jedną zmianą: dalsza baza ma mieć odrobinę wyższe bazowe liczby niż pierwsza, bo to lepsza wersja („Kategorie przedmiotów…”, punkt 4).

1. **Każdy przedmiot to druga baza istniejącej kategorii**, np. Pałasz to drugi miecz, a Ornat druga komża.
    - Nosi go ta sama klasa co pierwszą bazę, ale założyć go można dopiero od 10. poziomu klasy.
    - Wypada od Lisich Jarów wzwyż i z cotygodniowej skrzyni, tak jak Otoczak.
2. **Liczby:** współczynnik pierwszej bazy plus około 5% oraz premia z propozycji:

    | Kategoria → nowa baza | Premia |
    | --- | --- |
    | Miecz → Pałasz | obrażenia +6–9 |
    | Topór → Czekan | obrażenia +6–10 |
    | Sztylet → Kordelas | obrażenia +4–7 |
    | Łuk → Łuk refleksyjny | obrażenia +5–7 |
    | Kostur → Laska runiczna | obrażenia +5–7 |
    | Kropidło → Kadzielnica | obrażenia +4–7 |
    | Tarcza → Paweż | pancerz +18–30 |
    | Kołczan → Sajdak | Zręczność +6–10 |
    | Fokus → Księga | Intelekt +6–10 |
    | Kaptur → Kołpak | pancerz +6–10 |
    | Hełm → Szyszak | pancerz +10–16 |
    | Kapuza → Biret | pancerz +6–10 |
    | Kurtka → Przeszywanica | pancerz +10–16 |
    | Kolczuga → Brygantyna | pancerz +15–25 |
    | Szata → Opończa | pancerz +9–15 |
    | Komża → Ornat | pancerz +9–15 |
    | Rękawice → Karwasze | pancerz +6–10 |
    | Buty → Ciżmy | pancerz +6–10 |
    | Amulet → Kaptorga | Wola +2–4 |
    | Pierścień → Sygnet | Percepcja +2–4 |

3. **Ikony:** po jednym szkicu Retro Diffusion na przedmiot, razem 3,60 USD.
    - Biret wyszedł dopiero za trzecim razem, z prostszym opisem. Dwie wcześniejsze próby padły po stronie Retro Diffusion i nic nie kosztowały.
    - Na prośbę autora z Brygantyny zniknęło tło, a z Ornatu wieszak. Obie poprawki zostały zrobione ręcznie na pikselach, bez nowych szkiców.

## Odbierz wszystkie, Dziennik w ustawieniach i próg Umiejętności (26.10.2026)

1. **„Odbierz wszystkie”** (autor). Na dole pergaminu zadań, z lewej strony obok „Zwiń”, stoi przycisk „Odbierz wszystkie”.
    - Widać go, gdy w otwartej zakładce czeka choć jedna nagroda. Odbiera nagrody wszystkich wykonanych zadań tej zakładki naraz, jednym zapisem (`POST /api/quests/claim-all`), więc dwa stuknięcia dają nagrody raz.
    - Komunikat sumuje nagrody o tej samej nazwie, np. „Nagrody za zadania: Drewno +6, Złoto +16.”
    - Skrzynia dalej otwiera się osobnym stuknięciem, bo tygodniowa ma przedmiot i potrzebuje miejsca w plecaku.
2. **Dziennik w ustawieniach** (autor). Dziennik jest teraz na samej górze ustawień, pod zębatką, więc da się do niego przejść z każdego ekranu. W dolnym pasku głównych ekranów też został. Na ekranach postaci (wyposażenie, Statystyki, Umiejętności, Rdzeń) dolny pasek ma swoje zakładki, więc tam Dziennika nie było widać.
3. **Próg Umiejętności.** Zablokowane Umiejętności pisały „na poziomie klasy undefined”, bo serwer wysyłał z `data/unlocks.json` tylko progi poziomu postaci. Teraz wysyła też progi poziomu klasy. Ekran pisze „Umiejętności odblokujesz na poziomie klasy 10.”, a zakładka w pasku postaci ma dopisek „poz. kl. 10”.

## Mniejszy przycisk obozu, przyszpilenie i liczba osłony many (26.10.2026)

1. **„Rozwiń poziom obozu”** (autor). Przycisk w lewym górnym rogu planszy zasłaniał napis „w kolejce” nad Kowadłem, więc jest mniejszy.
    - Napis ma dwa wiersze, „Rozwiń poziom” i „obozu”, mniejsze litery i kończy się przed środkiem planszy. Tam nad Kowadłem stoi jego licznik albo „w kolejce”.
    - Gdy obóz rośnie, licznik stoi w przycisku zaraz po „obozu”, a nie pod nim. Pod przyciskiem stoi bowiem napis budowy Tartaku.
    - Na węższej planszy, czyli na wąskim telefonie albo przy powiększonym widoku, litery maleją razem z planszą. Od planszy szerokiej na 288 px, czyli od telefonu szerokości 320 px, przycisk nie zasłania żadnego napisu. Węższa plansza zdarza się dopiero przy powiększonym widoku na wąskim telefonie, np. 125% na telefonie szerokości 360 px.
    - Wprowadzenie wskazuje nowy przycisk tak jak stary: kamera podjeżdża bliżej, a złota obwódka obejmuje przycisk, z pergaminem pod nim.
2. **„przyszpilony” znika** (autor). Napis na karcie wroga stawał po Przyszpileniu i już nie znikał. Teraz trwa do najbliższego ruchu tego wroga, bo tyle trwa przyszpilenie. Potem karta pokazuje to, co miała wcześniej. Tak samo działa „spowolniony” po Mroźnym podmuchu.
3. **Liczba osłony many** (autor). W walce karta maga z osłoną pokazuje, ile obrażeń osłona jeszcze przyjmie, np. „Osłona many · 24”.
    - Liczba maleje z każdym pochłoniętym ciosem. Gdy dojdzie do zera, napis i niebieska poświata znikają.
    - To mana, która została, podzielona przez koszt punktu obrażeń, w dół do całości. Silnik zapisuje tę liczbę w zdarzeniach walki (`shield`), więc widać ją też w podglądzie autora i w powtórce.
    - Raporty sprzed tej zmiany nie mają tej liczby, więc karta pokazuje w nich samą nazwę osłony.

## Ścieżki rozwoju, druga umiejętność i poprawki umiejętności (26.10.2026)

1. **Dziennik tylko w ustawieniach** (autor: „szkoda na niego miejsca na dole zakładek, będziemy mieli zapas”).
    - Dolny pasek głównych ekranów ma cztery równe zakładki: Postać, Walka, Profesje i Osada. Kolejne zakładki zmieszczą się bez przestawiania.
    - Wprowadzenie szuka zakładek po ich adresach, a nie po miejscu w pasku. Złota obwódka trafia w Postać, Statystyki i zębatkę przy szerokości ekranu 360 i 412 px.
    - Napis po pominięciu wprowadzenia mówi, że Dziennik jest na górze ustawień pod zębatką. Kwestia narratora o ustawieniach nie wspomina Dziennika. Dopisanie go wymaga nowego nagrania, więc czeka na decyzję autora.
2. **Ścieżki rozwoju** (autor). Każda z trzech umiejętności klasy otwiera nazwaną ścieżkę rozwoju (`path` w `data/skills.json`). Nazwa stoi w zakładce nad umiejętnością. Nazwy to propozycja do zmiany przez autora:

    | Klasa | Ścieżki (umiejętność → ścieżka) |
    | --- | --- |
    | Wojownik | Potężny cios → Barbarzyńca, Szeroki zamach → Gladiator, Nieugięty → Strażnik |
    | Łucznik | Celny strzał → Snajper, Grad strzał → Strzelec Burzy, Przyszpilenie → Łowca |
    | Mag | Kula ognia → Elementalista, Mroźny podmuch → Druid (*teraz Władca Lodu, zob. „Punkty Umiejętności: jeden za każdy poziom klasy od 10. do 49.”*), Osłona many → Arkanista |
    | Kleryk | Modlitwa o zdrowie → Uzdrowiciel, Egzorcyzm → Inkwizytor, Błogosławieństwo → Kapłan |
    | Cień | Cios w plecy → Skrytobójca, Zatrute ostrze → Truciciel, Taniec cieni → Nocny Tancerz |

    - Pierwsza wybrana umiejętność to ścieżka główna: wybór na stałe i za darmo. Serwer rozpoznaje ją po kolejności w `character.skills`, bo pierwsza poznana zostaje tam pierwsza, więc baza nie potrzebuje nowej kolumny. *Nieaktualne: ścieżka główna kosztuje punkt z 10. poziomu klasy, zob. „Punkty Umiejętności: jeden za każdy poziom klasy od 10. do 49.”*
    - Od następnego poziomu klasy, czyli 11. (`balance.skills.secondClassLevel`), postać może dobrać drugą umiejętność za 1 Punkt Umiejętności. Trzecia ścieżka zamyka się wtedy na stałe (`balance.skills.paths` = 2). Zakładka pyta o to przed wyborem i nazywa ścieżkę, która się zamknie.
    - Autor pisze o drugiej umiejętności „lub kiedykolwiek, do 50 lvl – później”. Granica 50. poziomu i to, co się dzieje po niej, czekają na projekt ewolucji. Na razie drugą umiejętność da się dobrać w każdej chwili od 11. poziomu klasy.
    - Punkty Umiejętności: dalej po jednym za każdy poziom klasy po 10. Druga umiejętność zaczyna od 1. poziomu i kosztuje punkt, a kolejne punkty podnoszą obie, każdą do 20. Obie na 20. poziomie wypadają na 49. poziomie klasy.
    - Ewolucje (dokument projektowy): po trzy na klasę, jedna na ścieżkę. Postać zna najwyżej dwie ścieżki, więc ma do wyboru najwyżej dwie ewolucje. Ich szczegóły projektujemy później.
    - **Kolejność i nazwy w zakładce** (autor, 26.10.2026: „Ścieżka Główna, Ścieżka Poboczna, Zamknięta Ścieżka”). Ścieżka główna stoi na samej górze od razu po wyborze, pod nią ścieżka poboczna, dalej ścieżki jeszcze otwarte w swojej kolejności, a zamknięta na samym dole. Każda przesuwa się na nowe miejsce płynnie, chyba że animacje są wyłączone. Dawna „druga ścieżka” nazywa się teraz we wszystkich tekstach „ścieżką poboczną”.
    - **Teksty autora** (26.10.2026): wstęp Systemu przed wyborem ścieżki głównej („Od 10. poziomu wzrost poziomu klasy pozwala Ci uzyskać 1 Punkt Umiejętności…”), skutek Szerokiego zamachu („Atakuje każdego wroga za 70% obrażeń. Możesz chybić…”) i zdanie Nieugiętego („…zapiera się tarczą i nie cofa się o krok”). Łucznik (26.10.2026): opis i skutek Gradu strzał („Zadaje 85% obrażeń wszystkim przeciwnikom z możliwością chybienia…”) i zdanie Przyszpilenia („…zanim ten zdąży się ruszyć”); Celny strzał zostaje. Mag (26.10.2026): Kula ognia bez wzmianki o żywiole kostura, Mroźny podmuch „spowalnia ich ruchy” i „Każdy trafiony zostaje spowolniony.”, Osłona many „magiczną osłoną, którą opiera o własną manę”, „wykorzystuje” zamiast „bierze” i bez zdania o reszcie many. Kleryk (26.10.2026): Egzorcyzm („…smaga wszystkich wrogów żywiołem sakrum”, „Egzorcyzm smaga wszystkich wrogów, zadając 50% obrażeń sakrum…”) i Błogosławieństwo („…kreśli święty znak…”, „Premia zwiększa się i rozdziela w przypadku walki drużynowej.”); Modlitwa o zdrowie zostaje. Cień (26.10.2026): Taniec cieni bez wzmianki o zwykłym limicie 30%, a Cios w plecy i Zatrute ostrze zostają. Przy wpisaniu poprawione są drobiazgi pisowni: kropka w „10. poziomu”, „ze ścieżek”, przecinki po „Kiedy robi się groźnie” i przed „zadając” oraz półpauzy.
3. **Poprawki umiejętności z testu autora.** Każda liczba to wartość na 1. i na 20. poziomie umiejętności.
    - **Nieugięty** leczy odrobinę, a za to mocno twardnieje. Było: 15–30% maks. HP i 30–50% mniej obrażeń przez 3 ciosy wrogów. Jest: 8–12% maks. HP i pancerz większy o 150–250% na 3–4 ruchy wojownika, poniżej 50% HP (było 40%).
        - W walce nad postacią wyskakuje nazwa umiejętności i „pancerz +150%”, a karta pokazuje „pancerz +150%”, dopóki pancerz działa.
        - Animacja to okrągły rozbłysk wokół całej karty.
        - Gdy pancerz słabnie, napis znika, a opis walki mówi np. „Nieugięty przestaje działać.”
    - **Kula ognia** już wcześniej podpalała, z szansą 40–70% na trafienie. Oparzenie trwa teraz 2 ruchy wroga do 10. poziomu umiejętności i 3 od 11. (zawsze były 3). Napis „Oparzenie” znika po ostatnim ruchu oparzenia i gdy wróg padnie.
    - **Mroźny podmuch** zadaje mniej: 40–60% obrażeń zamiast 60–90%. Za to mocniej spowalnia: następny ruch każdego trafionego wroga przychodzi o całą zwykłą przerwę później, a nie o połowę.
        - Z samym cięciem obrażeń był najsłabszą ścieżką maga: drogę do 50. poziomu skracał o 5%, a dwie pozostałe o 14–16%.
        - Spowolnienie to jego rola, więc ono nadrabia różnicę.
    - **Modlitwa o zdrowie** leczy dużo, raz na walkę: 25–40% maks. HP (było 3–6% co 4. ruch), dalej z dodatkiem 1 HP za każde 10 punktów Mądrości, gdy HP spadnie poniżej 60%.
        - Symulacja pokazała, że duże leczenie z odnowieniem 6, 12 czy nawet 15 ruchów skraca klerykowi drogę do 50. poziomu o 27–37%. Inne umiejętności skracają ją o 3–16%. Stąd raz na walkę, z kosztem „14 many, raz na walkę”.
        - Leczy teraz mniej więcej trzy razy więcej niż Nieugięty.
        - Modlitwa w dwóch ruchach (najpierw modlitwa, potem leczenie) nie była potrzebna. Może wrócić jako pomysł na ewolucję.
        - W danych to nowe pole `once` dla umiejętności używanych w ruchu postaci.
    - **Egzorcyzm** zadaje mniej: 50–75% obrażeń każdemu wrogowi (było 65–95%), a jednemu wrogowi 90–125% (było 110–155%). Każdy trafiony ma 10–20% szans na paraliż. Sparaliżowany traci swój najbliższy ruch, a karta pisze „sparaliżowany”.
    - **Błogosławieństwo** obejmuje całą drużynę, ale premia się dzieli (`crowd` = 0,5). Sam kleryk dostaje całą premię, we dwoje każdy dostaje 2/3, a we troje połowę. Dziś kleryk walczy sam, więc działa to dopiero w drużynie.
    - **Osłona many** bierze raz 30% maks. many i robi z niej osłonę za 100–180% tej many. Budzi się raz na walkę, poniżej 50% HP.
        - Osłona przyjmuje obrażenia, aż się wyczerpie. Reszta many zostaje na drugą umiejętność.
        - Pod portretem maga stoi niebieski pasek osłony, a karta pisze, ile osłona jeszcze przyjmie, np. „Osłona many · 94”.
    - **Cień** bez zmian. Ikona Tańca cieni jest jaśniejsza (rozjaśnienie gammą 0,5, bez nowego szkicu), bo w walce była prawie czarna.
4. **Balans z symulacji postępu** (80 przebiegów na wariant, te same losowania dla każdego wariantu). Nowa polityka `two=A/B` to umiejętność A jako główna i B jako druga od 11. poziomu klasy, a punkty idą do tej na niższym poziomie. Godziny wypraw do 50. poziomu postaci:

    | Klasa | Bez | Pierwsza | Druga | Trzecia | Dwie |
    | --- | --- | --- | --- | --- | --- |
    | Wojownik | 41,4 | Potężny cios 40,3 (−3%) | Szeroki zamach 38,5 (−7%) | Nieugięty 40,0 (−3%) | 37,3–39,3 (−5 do −10%) |
    | Łucznik | 53,8 | Celny strzał 46,1 (−14%) | Grad strzał 50,4 (−6%) | Przyszpilenie 46,6 (−13%) | 45,3–47,8 (−11 do −16%) |
    | Mag | 61,1 | Kula ognia 51,4 (−16%) | Mroźny podmuch 53,5 (−12%) | Osłona many 52,7 (−14%) | 46,6–50,6 (−17 do −24%) |
    | Kleryk | 59,1 | Modlitwa o zdrowie 54,1 (−8%) | Egzorcyzm 54,9 (−7%) | Błogosławieństwo 53,4 (−10%) | 47,4–52,4 (−11 do −20%) |
    | Cień | 59,2 | Cios w plecy 52,3 (−12%) | Zatrute ostrze 53,5 (−10%) | Taniec cieni 50,4 (−15%) | 48,5–52,7 (−11 do −18%) |

    - Wojownik zyskuje najmniej, ale i tak jest najszybszy. Mag zyskuje najwięcej, a jest najwolniejszy.
    - Grad strzał daje łucznikowi mniej niż dwie pozostałe ścieżki. Tych liczb nie było w uwagach autora, więc zostały.
5. **Własne dźwięki umiejętności** (autor). Każda z 15 umiejętności ma nagranie z ElevenLabs (`skill-<id>` w `effects` w `data/sounds.json`, pliki `src/client/audio/sfx/skill-*.mp3`). Gra je, gdy umiejętność budzi się albo leci jej cios.
    - Z dwóch ujęć w grze jest pierwsze. Oba są na stronie odsłuchu w grupie „Umiejętności”.
    - Cztery szkice miały prawie sam bas (Kula ognia, Osłona many, Taniec cieni, Cios w plecy), więc dostały nowe, jaśniejsze opisy.
    - Koszt: około 1030 kredytów ElevenLabs (812 za pierwsze nagrania i 220 za cztery poprawki).
    - Umiejętność bez własnego nagrania gra dawny dźwięk ataku albo czaru.

## Wybór dźwięków umiejętności, nowe nagrania i dwie ikony (26.10.2026)

1. **Wybór autora na stronie odsłuchu.**
    - Ujęcie 2 jest teraz w grze dla Potężnego ciosu, Szerokiego zamachu, Nieugiętego, Przyszpilenia i Egzorcyzmu.
    - Ujęcie 1 zostaje dla Mroźnego podmuchu i Modlitwy o zdrowie. Kula ognia i Błogosławieństwo też zostają przy 1.
    - Kolejność ujęć w `tools/build-drafts.py` (`SKILL_TAKES`) odpowiada wyborowi, więc ponowne budowanie daje te same pliki.
2. **Sześć dźwięków nagranych od nowa według uwag autora.**
    - Celny strzał: mocne uderzenie strzały w tarczę zamiast naciągania cięciwy.
    - Grad strzał: spadający deszcz strzał.
    - Osłona many: kropla wody z eterycznym echem.
    - Cios w plecy: kroki, a zaraz po nich szybkie cięcie.
    - Zatrute ostrze: lanie i bulgotanie trucizny.
    - Taniec cieni: nowe brzmienie, świst płaszcza i ciche kroki.

    Trzy wymagały poprawek:
    - Osłona many: pierwsza kropla trwała 0,13 s.
    - Taniec cieni: pierwsze ujęcia były w 95% niskim dudnieniem, którego telefon nie gra.
    - Cios w plecy: po jednym cichym kroku było prawie sekundę ciszy przed cięciem.

    W grze jest teraz pierwsze ujęcie nowego nagrania. Na stronie odsłuchu oba nowe ujęcia mają numery 3 i 4 i własne miejsce na wybór, a dawne zaznaczenia „Do wymiany” są odhaczone. Koszt: 508 kredytów ElevenLabs.
3. **Cios w plecy z cieniem** (autor).
    - Ikona ma znowu zakapturzoną sylwetkę cienia ze świecącymi oczami za sztyletem, z pierwszego szkicu.
    - Wycięte zostało tylko szare tło. Ciemny fiolet sylwetki został.
    - Tam, gdzie szkic urywał sylwetkę prostą krawędzią kwadratu, brzegi przechodzą stopniowo w przezroczystość jak dym.
4. **Nowy Szeroki zamach** (autor: za podobny do Potężnego ciosu). Jeden nowy szkic Retro Diffusion (0,18 USD): miecz w środku złotego wiru zamiast białego półksiężyca. Szkic wypełniał cały kwadrat, więc jest przycięty do koła, a jego brzeg przechodzi w przezroczystość.
5. **Ostatnia ewolucja** (autor, daleka przyszłość). Na najwyższych poziomach klasy postać wybiera jedną z trzech klas: dalszy rozwój jednej z dwóch rozwijanych dotąd ścieżek albo fuzję obu. Zapis jest w dokumencie projektowym, przy ewolucjach.

## Kwestia narratora o Dzienniku, mocniejszy Grad strzał i Nekromanta w planie (26.10.2026)

1. **Kwestia narratora o ustawieniach** (tekst zatwierdzony przez autora: „Dopisz i nagraj”).
    - Na końcu obu wersji kwestii (`settings` w `data/tutorial.json`) stoi teraz: „Na samej górze ustawień czeka też Dziennik – tam znajdziesz wszystkie raporty.”
    - ElevenLabs nagrał po trzy wersje tym samym głosem i modelem co resztę wprowadzenia (`allLines`), za 1710 kredytów. Nagrania są przycięte i wyrównane jak reszta (ok. −18 LUFS, mono 56 kb/s).
    - W grze jest wersja 2 obu kwestii: ma tempo i pauzy jak dawna. Wersje 1 i 3 mają w środku 2–3 s ciszy.
    - Trzecia wersja żeńskiej kwestii urwała ostatnie słowo, więc odpadła. Pozostałe są na stronie odsłuchu do wyboru.
2. **Grad strzał mocniejszy** (autor: „Podciągnij”).
    - Trafia każdego z kilku wrogów za 85–120% obrażeń (było 65–95%), a jednego wroga za 140–190% (było 115–160%).
    - W symulacji na 160 przebiegach droga łucznika do 50. poziomu postaci trwa teraz 46,6 h, tyle co z Celnym strzałem (46,6 h). Wcześniej było to 50,1 h, a bez umiejętności 53,8 h.
    - Słabsze wersje (80–115% / 135–185%) i krótsze odnowienie dawały mniej.
3. **Nekromanta** (autor). Jedna ze ścieżek stanie się nim w późniejszej ewolucji, nie w pierwszej. Najbliżej jest ścieżka Truciciela z Cienia: trucizny i rozkład przechodzą w klątwy i magię śmierci.

    Obecne klasy budujemy z myślą o tym:
    - pierwsza ewolucja Truciciela powinna dać trochę Woli i Intelektu, bo Cień rośnie dziś w siłę, zręczność i percepcję;
    - efekty działające co ruch (oparzenie, zatrucie) zostają ogólne, żeby przyjęły klątwy;
    - żywioł śmierci dojdzie jako przeciwieństwo sakrum;
    - walka będzie musiała przyjmować przywołane stwory na wolne miejsca drużyny.

    Zapis jest w dokumencie projektowym, przy ewolucjach.
4. **Druga ścieżka bez górnej granicy.** Pytanie o granicę 50. poziomu okazało się niejasne, więc zostaje najprostsze rozwiązanie: drugą umiejętność można dobrać w każdej chwili od 11. poziomu klasy. (Zmienione niżej, w sekcji „Umiejętności gotowe przed pierwszą ewolucją”.)

## Drugi wybór dźwięków (26.10.2026)

1. **W grze są wersje wybrane przez autora na stronie odsłuchu:**
    - kwestia narratora o ustawieniach: wersja 3, a jej wersja żeńska: wersja 2;
    - Zatrute ostrze 4 i Taniec cieni 3;
    - Grad strzał, Osłona many i Cios w plecy zostają przy 3, bez uwag.
2. **Celny strzał nagrany raz jeszcze** (autor: „Brzmi jak pisk”). To teraz samo głuche uderzenie strzały w tarczę, bez świstu.
    - Przy wersji z 07:43 świst brzmiał jak pisk: jej dźwięk skupiał się wokół 3 kHz. Nowa skupia się wokół 0,7–0,9 kHz.
    - W grze jest wersja 5, a na stronie odsłuchu są 5 i 6. Koszt: 40 kredytów ElevenLabs.

## Umiejętności gotowe przed pierwszą ewolucją (26.10.2026)

Wyjaśnienie autora: na 50. poziomie klasy ścieżka rozwoju zmienia się przez ewolucję. Dlatego najpóźniej na 50. poziomie trzeba wybrać drugą umiejętność i rozdać zaległe Punkty Umiejętności. Ta zasada zastępuje punkt 4 z sekcji o Dzienniku.

1. **Klasa czeka na 50. poziomie** (`evolutionBlock` w `src/engine/skills.js`, `applyHunt`). Klasa nie przechodzi 50. poziomu, dopóki postać nie ma drugiej ścieżki albo ma punkty, które przyjęłaby znana umiejętność.
    - Zdobyte XP klasy nie przepada, tylko odkłada się na 50. poziomie. Gdy umiejętności są gotowe, następna wyprawa przenosi klasę o wszystkie odłożone poziomy. To najprostsze rozwiązanie, które nie karze gracza za jedną długą wyprawę.
    - Punkty liczą się tak, jak na 50. poziomie. Postać na 48. poziomie bez wolnych punktów i tak zatrzyma się na 50., żeby rozdać punkty z 49. i 50. poziomu. Jedna wyprawa nie przeskoczy więc progu.
    - Punkt, którego nie przyjmie żadna umiejętność, nie zatrzymuje klasy. Tak zostaje jeden punkt z 50. poziomu, gdy obie umiejętności mają 20. poziom.
    - Klasa, która już przeszła 50. poziom, nie czeka.
2. **Gracz wie o tym wcześniej.**
    - Dopóki druga ścieżka jest otwarta, w Umiejętnościach stoi: „Drugą ścieżkę wybierz najpóźniej na 50. poziomie klasy, przed ewolucją.”
    - Gdy klasa czeka, mówią o tym trzy miejsca: panel Systemu w Umiejętnościach, wiersz klasy w Statystykach („KLASA CZEKA: WYBIERZ DRUGĄ ŚCIEŻKĘ” albo „KLASA CZEKA: ROZDAJ PUNKTY UMIEJĘTNOŚCI”) i komunikat Systemu w każdym raporcie z wyprawy (`classWaitsPath`, `classWaitsPoints` w `data/texts.json`).
3. **Symulator postępów** stosuje tę zasadę do wariantów z dwiema umiejętnościami. Warianty z jedną umiejętnością albo bez nich mierzą samą umiejętność, bez czekania. Na 80 przebiegach pary mają te same czasy co przed zmianą: wojownik 37,3–39,3 h, łucznik 45,3–48,0 h do 50. poziomu postaci.

## Duch ognia w Ognisku, zakładki walk we wprowadzeniu i grafiki krain (26.10.2026)

1. **Duch ognia w Ognisku** (pomysł autora: „Możesz wrzucić swoje złoto do ogniska i dzięki duchowi ognia wymienić je na potrzebne Ci zasoby.”).
    - Ekran Ogniska ma kartę „Duch ognia” z tym zdaniem i trzema przyciskami: drewno, kamień, ruda żelaza.
    - Na poziomie Ogniska L jedna wymiana daje 5 × L sztuk jednego zasobu, po 10 złota za sztukę: na 1. poziomie 5 sztuk za 50 złota, na 10. poziomie 50 sztuk za 500 złota. *Nieaktualne: poziomy obniżają teraz cenę sztuki, zob. „Celowanie, łatwe miejsca, zadania, duch ognia i Google”, punkt 5.*
    - Dziennie są 4 wymiany i jedna więcej co 2 poziomy (8 na 10. poziomie). Licznik zaczyna się od nowa o północy czasu polskiego, jak zadania.
    - Liczby są w `data/buildings.json` (`trade` Ogniska), a zasady w `src/engine/fire.js`. Wymiany z jednego dnia liczy `migrations/0022_fire_trades.sql`.
2. **Dlaczego takie liczby** (pytanie autora, czy wymiana nie jest za mocna).
    - Na wyprawach na 1 drewno przypada 4–8 złota. Propozycja 1 sztuki za 50 złota była więc kilka razy droższa od wypraw, a 4 sztuki dziennie byłyby niezauważalne.
    - Przy 10 złota za sztukę wymiana dalej jest droższa od wypraw: ok. 2,5 raza na początku i 1,25 raza przy 50. poziomie. Dzienny limit trzyma ją w ryzach.
    - Symulacja (10 przebiegów na klasę, gracz grający bez przerwy):
        - czas dojścia do 50. poziomu postaci się nie zmienia: wojownik 49,7 h, łucznik 62,9 h, mag 78,1–78,2 h;
        - obóz czeka na drewno o 2–6 h krócej, za ok. 2–2,7 tys. złota;
        - złota i tak zostaje ok. 9 tys.
    - Gracz, który gra krócej każdego dnia, ma z wymian więcej na godzinę gry, ale nadal najwyżej od kilkudziesięciu do kilkuset sztuk dziennie.
    - Symulator postępów umie handlować przy ognisku (`fire` w `tools/progression/sim.mjs`).
3. **Wprowadzenie: zakładki walk w raporcie** (autor). Gdy narrator mówi o zakładkach, przełączają się same.
    - Najpierw po kolei inne walki (najwyżej 3), a przy słowach o gwiazdce wraca walka z gwiazdką, na której raport się otwiera.
    - Czasy są wzięte z nagrań kwestii (`BROWSE` w `src/client/narrator.js`). „Dalej” zatrzymuje przełączanie.
4. **Wprowadzenie: pauzy w obozie** (autor). Kwestia o porzuconym obozie pojawia się od razu po wejściu do obozu, bez dawnych 3 s. Pauza po pokazaniu całego obozu trwa 1 s zamiast 1,8 s.
5. **Oparzenie na czerwono** (autor). Każdy efekt ma własny kolor w `data/effects.json`: oparzenie czerwone, zatrucie zielone, wychłodzenie niebieskie. W tym kolorze są napis efektu, liczby traconego HP i błysk karty.
6. **Grafiki krain i regionów wewnętrznych** (autor).
    - Retro Diffusion narysował po jednym szkicu dla 10 regionów wewnętrznych (kółka na ekranie Walka, 128×128) i dla 2 krain (192×96). Koszt: 12 × 0,18 USD = 2,16 USD.
    - Wszystkie szkice są w grze. Zamknięty region pokazuje swój obrazek w szarości. Grafika krainy leży półprzezroczyście pod tekstem jej karty.
    - Opisy szkiców są w `art/prompts.json` (rodzaje `areas` i `lands`). Sceny zachowują tło, więc generator usuwa tło tylko spod sprite'ów.
7. **Strona odsłuchu zapisuje uwagi już w trakcie pisania.** Uwaga do Celnego strzału 5 dotarła bez tekstu, bo pole zapisywało się dopiero po wyjściu z niego. Na telefonie strona często zamyka się wcześniej.
8. **Jezioro Midasa.** Na zrzucie od autora zaznaczone jest wolne miejsce na planszy obozu, między Tartakiem a Szałasem na łupy, z dopiskiem „to do Jeziora Midasa”. Miejsce zostaje wolne. Co jezioro ma robić, czeka na autora.

## Powiadomienia na telefon, Jezioro Midasa, osłona many i muzyka zakładek (26.10.2026)

1. **Powiadomienia na telefon** (trzy rodzaje wskazane przez autora: koniec wyprawy, koniec budowy, pełny magazyn).
    - Włącza je przełącznik „Powiadomienia” w Ustawieniach, a telefon pyta wtedy o zgodę. Wyłączenie przełącznika, wylogowanie albo usunięcie konta wyłącza je na tym telefonie.
    - Treści są w `data/texts.json` (`push…`):
        - „Koniec wyprawy”: „Eksploracja zakończona: {region wewnętrzny}. Raport czeka na odbiór.”
        - „Koniec budowy”: „{budynek}: poziom {n} gotowy.” Dotyczy też budów z kolejki i poziomu obozu.
        - „Pełny magazyn”: „{budynki}: produkcja stoi do zebrania.” Gdy zapełni się kolejny magazyn, wiadomość wymienia wszystkie pełne.
    - Nowsza wiadomość tego samego rodzaju zastępuje na telefonie starszą. Otwarcie gry zamyka te, które już wiszą.
    - Gdy gra jest otwarta na ekranie, powiadomienie się nie pokazuje, bo gra mówi to samo. Wyjątkiem jest iPhone: Safari odbiera zgodę stronie, której wiadomości niczego nie pokazują.
    - Na iPhonie powiadomienia działają tylko w grze dodanej do ekranu początkowego (iOS 16.4 i nowsze). W Safari w karcie wiersz w Ustawieniach mówi, jak to zrobić. Na Androidzie działają w Chrome, Samsung Internet, Firefoksie i w zainstalowanej grze.
    - Technika: Web Push, bez dodatkowych usług i opłat. Co minutę serwer (Cron Trigger w `wrangler.jsonc`) bierze minutę, która minęła, i wysyła to, co w niej przypadło.
        - Każdy przebieg najpierw zajmuje swój odcinek czasu (`push_checked_at`), więc dwa nigdy nie wyślą tego samego. Po przerwie serwer patrzy najwyżej 15 minut wstecz.
        - Usługa push trzyma wiadomość dla wyłączonego telefonu najwyżej 6 h.
    - Klucze, którymi serwer podpisuje wiadomości (VAPID), powstają przy pierwszym użyciu i leżą w bazie (`server_settings`). Nie trzeba zakładać żadnego sekretu.
    - Treść jest zaszyfrowana tak, że czyta ją tylko telefon (aes128gcm, RFC 8291). Test sprawdza szyfrowanie na przykładzie z normy.
    - Serwer wysyła tylko do usług push przeglądarek: Google, Apple, Mozilli i Microsoftu. Konto ma najwyżej 10 telefonów. Subskrypcja, której usługa już nie zna (odpowiedź 404 albo 410), znika z bazy.
    - Koszt: cron co minutę to ok. 43 tys. wywołań miesięcznie, ułamek tego, co obejmuje plan Workers Paid.
    - Do polityki prywatności przed Sklepem Play: serwer przechowuje adres subskrypcji telefonu do wyłączenia powiadomień albo usunięcia konta.
    - Pliki: `migrations/0023_push.sql`, `src/engine/notifications.js` (co i kiedy), `src/server/push.js` i `src/server/webpush.js`, `src/client/push.js` i `src/client/sw.js`, ikonka paska stanu `src/client/badge-96.png`.
2. **Jezioro Midasa** (autor). Punkt uzupełnia punkt 8 poprzedniego wpisu.
    - Stoi na wolnym miejscu zaznaczonym na zrzucie, między Tartakiem a Szałasem na łupy. Przeniósł się tam staw z dołu planszy.
    - Działa jak Tartak, Kamieniołom i Kopalnia: misa traperska sama odsącza złoto z mułu. Daje 4 złota na godzinę na każdy poziom, ma magazyn na 2 h produkcji na każdy poziom i 10 poziomów. Zebrane złoto trafia do sakiewki.
    - Koszt: złoto od 10 (×2,0 co poziom), drewno od 8 (×1,9), kamień od 2. poziomu (4, ×1,9), ruda żelaza od 3. poziomu (3, ×1,9). Budowa trwa 1 min na 1. poziomie, potem ×2,2 co poziom.
    - Ma trzy wyglądy, jak inne budynki (poziomy 1–3, 4–7, 8–10): staw z misą, potem z drewnianą rynną, na końcu z pomostem, latarnią i workiem złota.
    - Lewa kolumna planszy jest rozsunięta, żeby napisy działek nie wchodziły w pierścienie narratora. Tartak, Jezioro, Szałas i Stół rzemieślniczy stoją co 21 jednostek. Pierścień przy Stole nadal zahacza o napis Szałasu, tak jak przed tą zmianą.
    - Nowa kwestia narratora w obozie, po Kamieniołomie: „W Jeziorze Midasa zalega złoto. Misa traperska sama je odsącza – niewiele, ale bez przerwy.” Tekst zatwierdzony przez autora. Do gry trafiło pierwsze nagranie, bo drugie ma urwany koniec.
3. **Duch ognia we wprowadzeniu** (autor). Kwestia przy Ognisku brzmi teraz: „Teraz zadbajmy o odpoczynek po kolejnych wyprawach. Przy ogniu Twoja postać szybciej wraca do sił, a duch ognia przyjmie Twoje złoto i odda za nie zasoby. Zbuduj Ognisko.” Lektor dostał zapis „ognju”, bo zwykły zapis czytał jako „ognu”.
4. **Osłona many** (autor: mały dodatkowy pasek, bez robienia z maga tanka).
    - Raz na walkę, gdy HP spadnie poniżej 50%, umiejętność bierze 30–50% maks. many (więcej na wyższych poziomach) i zamienia ją w osłonę 1:1: każdy punkt many zatrzymuje jeden punkt obrażeń.
    - Pasek osłony pod paskiem HP ma skalę HP postaci, więc jest krótki. Na przykład 118 punktów osłony przy 495 HP to mniej więcej jedna czwarta paska.
5. **Relacja walki mówi, co dają umiejętności wspierające** (autor: Błogosławieństwo, Zatrute ostrze i inne).
    - Błogosławieństwo: „Do końca walki pancerz +X%, odporności +Y%, obrażenia +Z%.” Gdy premia dzieli się na drużynę, następne zdanie mówi, na ile osób.
    - Zatrute ostrze: szansa na zatrucie przy każdym ciosie, jego siła i czas trwania.
    - Osłona many: ile obrażeń przyjmie. Taniec cieni: przez ile ciosów i o ile rośnie unik oraz za ile procent obrażeń jest kontra.
6. **Celny strzał** (autor: „jakby ktoś trafił w dziesiątkę na tarczy strzeleckiej – jakiś lekko magiczny dźwięk na końcu”). Nowe nagranie to krótkie trafienie w środek tarczy, po którym cichnie lekko magiczny dźwięk (0,9 s). Strona odsłuchu ma wersje 7 i 8, a w grze jest 7.
7. **Muzyka zakładek** (autor, utwory z Suno). Własne utwory mają Umiejętności, Profesje i Obóz (plansza i ekrany budynków). Na pozostałych ekranach gra dotychczasowy utwór.
    - Zasady są te same co wcześniej: utwór gaśnie przez ostatnie 5 s i po 2,5 s pauzy gra od nowa. Zmiana utworu przechodzi płynnie w 1,5 s, a utwór, do którego się wraca, gra od miejsca, w którym ucichł.
    - Pliki nie mają okładki ani znaczników, a dźwięk jest bez zmian. Głośność: Umiejętności −15,4 LUFS, Profesje −16,2 LUFS, Obóz −15,9 LUFS, czyli do 1 dB od dotychczasowego utworu (−16,3 LUFS).
    - Miejsca muzyki to `places` w `data/music.json`: `skills`, `professions` i `camp`. Licencja: patrz punkt o planie Suno Pro albo Premier we wcześniejszym wpisie.

## Nowe logo, lada złomiarza i wybrane nagrania (26.10.2026)

1. **Nowe logo** (autor: dotychczasowy sześciokąt wyglądał słabo w podglądzie linku na Messengerze).
    - Retro Diffusion dało cztery szkice godła: oko, ognisko, narratora i drzewo (4 × 0,18 USD). W grze jest szkic 3 wskazany przez autora: zakapturzony narrator w świecącym sześciokącie Systemu (`src/client/logo.png`, 128 × 128).
    - Z godła powstały ikony aplikacji (`icon-192.png`, `icon-512.png`, `icon-maskable-512.png` z marginesem na kółko Androida, `apple-touch-icon.png`) i ikonka karty przeglądarki `favicon-64.png`, która zastąpiła `favicon.svg`.
    - Podgląd linku to `og.png` (1200 × 630): godło, napis Insight, hasło gry „Wejrzyj do miejsca pełnego wyzwań dla śmiałków” i adres insightrpg.com na tle grafiki Wiatrołomów. Znaczniki `og:` i `twitter:card` są w `index.html`. Obrazek ma 256 kolorów i waży ok. 150 KB, bo niektóre komunikatory, np. WhatsApp, nie pokazują większych.
    - Ekran logowania pokazuje godło zamiast sześciokąta z linii.
    - Messenger i inne komunikatory przez jakiś czas pamiętają stary podgląd linku. Zainstalowana gra zmienia ikonę na Androidzie sama, po kilku dniach, a na iPhonie dopiero po ponownym dodaniu do ekranu początkowego.
    - Rodzaj `logo` w `art/prompts.json` zostawia tylko opis wybranego szkicu.
2. **Powiadomienia bez opisu** (autor: „Nie podpisuj czego dotyczą powiadomienia”). Pod przełącznikiem „Powiadomienia” nie ma już zdania o tym, czego dotyczą. Zdanie pojawia się tylko wtedy, gdy powiadomień w tej przeglądarce nie ma (iPhone poza ekranem początkowym, przeglądarka bez Web Push) albo telefon je blokuje.
3. **Wybrane nagrania** (autor, strona odsłuchu).
    - Celny strzał: w grze jest wersja 8. Zastępuje to wersję 7 z punktu 6 poprzedniego wpisu.
    - Kwestia narratora przy Ognisku: w grze jest nagranie 4, ze zwykłym zapisem tekstu. Zastępuje to nagranie z zapisem „ognju” z punktu 3 poprzedniego wpisu.
4. **Lada złomiarza w Skupie złomu** (autor: „W skupie złomiarza dodamy możliwość kupna przerobionych materiałów Ścinek itd. za złoto. Im wyższy level budynku tym wyższa rzadkość i niższy koszt części.”).
    - Ekran Skupu złomu ma kartę „Lada złomiarza”. Każda część ma tam cenę za sztukę, liczbę, którą postać już ma, i przyciski „Kup 1” i „Kup 10”. Zdanie pod listą mówi, co da następny poziom, np. „Na poziomie 3 dojdą Okucia, a ceny spadną o 6%.”
    - Rzadkości według poziomu skupu: Ścinki (pospolite) od 1. poziomu, Rzemienie (rzadkie) od 2., Okucia (unikalne) od 3., Odłamki (epickie) od 5., Bursztyn (legendarny) od 7., Krwawnik (mityczny) od 9., a Gwiezdny odprysk (boski) na 10.
    - Cena części to 40 złota razy mnożnik sprzedaży jej rzadkości (1, 2, 4, 8, 16, 32 i 64). Każdy poziom ponad pierwszy obniża ją o 6%. Ścinki kosztują 40 złota na 1. poziomie i 23 na 10., Rzemienie 75 na 2. i 46 na 10., a Gwiezdny odprysk 1467 złota.
    - Skąd te liczby: dokument projektowy mówi, że sprzedaż jest mniej opłacalna niż kupno. Rozebrany przedmiot daje 2 + poziom/10 części, a sprzedany daje za każdą z nich najwyżej ok. 10 razy mnożnik rzadkości w złocie. Na 10. poziomie Skup złomu płaci o 100% więcej, czyli ok. 20 razy. Części są droższe, żeby sprzedaż przedmiotu i kupno części nigdy nie wychodziły lepiej niż rozbiórka na Stole rzemieślniczym. Test w `test/engine.test.js` sprawdza to dla przedmiotów poziomów 1–510 na każdym poziomie skupu.
    - Zakupy nie mają dziennego limitu, bo autor o nim nie wspomniał. Części nadal czekają na profesje, więc ceny i ewentualny limit sprawdzimy razem z nimi. Liczby są w `shop` przy Skupie złomu w `data/buildings.json`.
    - Kupować można także podczas wyprawy, jak u ducha ognia, bo obóz działa obok czynności postaci.
    - Zakup brzmi brzękiem monet, jak skrzynia zadań. Opis budynku mówi teraz także o częściach.
    - API: `POST /api/camp/buy` z `partId` i `count`. Jak wymiana u ducha ognia, zakup zapisuje się tylko wtedy, gdy postać jest taka, jak przy odczycie (`version`). Silnik: `src/engine/shop.js`.

## Nowe stwory i czempioni (26.10.2026)

1. **Zablokowane Profesje** (autor: „ma nie być napisane »profesje zbierackie«, a po prostu »profesje«, bo będą różne”). Komunikat Systemu na zablokowanej zakładce brzmi teraz „Dostęp zablokowany. Profesje: od poziomu postaci 10.” (`name` w `data/unlocks.json`). Które profesje otworzą się na tym poziomie, rozstrzygnie projekt profesji.
2. **Nowe stwory Wiatrołomów** (autor: „3 zwykłe, 1 elitę i 1 czempiona do Wiatrołomów”). Nazwy, wygląd i liczby to moja propozycja, którą autor może zmienić w danych:
    - **Jeleń** (przód, cios porożem): Krucze Wykroty i Dzicza Głusza. Materiał: Poroże jelenia, rzadkie.
    - **Kuna** (środek, szybka i zwinna): Lisie Jary i Krucze Wykroty. Materiał: Futro kuny, rzadkie.
    - **Rój szerszeni** (tył, żądła z trucizną): Żmijowe Zwalisko i Dzicza Głusza. Materiał: Żądło szerszenia, pospolite. Nowa rodzina stworów `insect` ma własną ikonkę na wypadek braku grafiki.
    - **Płanetnik** (elita, tył): słowiański duch burzy i gradu, uderza piorunem (magia, żywioł elektryczność) i jest na niego odporny. Jest elitą Żmijowego Zwaliska i Dziczej Głuszy, a Błędnica zostaje elitą trzech pierwszych regionów wewnętrznych. Region wewnętrzny może więc mieć własną elitę (`elite` w `data/regions.json`). Materiał: Bryłka gradu, legendarna, jak Ognik błędnicy.
    - **Odyniec** (czempion, przód): ogromny stary dzik z Dziczej Głuszy. Materiał: Szable odyńca, mityczne, czyli rzadsze niż cokolwiek innego w Wiatrołomach.
    - Skraj Wiatrołomów zostaje bez zmian, żeby nie ruszać tempa pierwszych poziomów.
3. **Czempioni** (autor: najsilniejsze stwory krainy, w Wiatrołomach tylko w ostatnim regionie wewnętrznym; pokonany daje prawie zawsze najrzadsze materiały i szansę na przedmiot epicki, na wyższych poziomach nawet rzadszy).
    - Czempion mieszka w jednym regionie wewnętrznym (`champion` w `data/regions.json`): Odyniec w Dziczej Głuszy, Bazyliszek w Sercu Uroczyska. Ma poziom o 2 wyższy niż najwyższy poziom tego miejsca (`championLevelBonus`), czyli o 1 wyższy niż elita.
    - Trafia się najrzadziej ze wszystkich stworów (autor: „czempion ma się trafiać najrzadziej, a nie dwa razy częściej niż elita”). Szansa rośnie z czasem walki: 0,3% na każde 12 minut wyprawy (`championChancePerFight`), dwa razy rzadziej niż elita (0,6%). To ok. 1,5% na godzinę wypraw w jego miejscu. Gra losuje go przed elitą i tylko tam, gdzie mieszka, więc inne miejsca losują walki tak jak dotąd.
    - Daje pięć razy więcej XP i złota niż zwykły stwór (elita: trzy razy).
    - Prawie zawsze zostawia swój materiał: z szansą 90% jedną sztukę, bez względu na długość wyprawy (`championMaterialChance`). Jak u innych stworów, wyższy poziom czasem podnosi rzadkość o stopień.
    - Z szansą 50% zostawia też skrzynię z przedmiotem (`championItemChance`). Rzadkość zależy od poziomu czempiona (`championItems`): do 49. poziomu zawsze epicki, od 50. epicki albo legendarny, a od 100., 200., 300. i 400. coraz rzadszy, aż po boski.
    - W bezpiecznym regionie, jak Wiatrołomy, przegrana z czempionem kończy się odwrotem bez kary, tak jak z elitą. W Uroczysku przegrana oznacza omdlenie. Poziom zagrożenia przed wyprawą liczy czempiona tak samo jak elitę.
    - Raport otwiera się na walce z czempionem, a ma ona znacznik „czempion”. Karta czempiona w walce ma krwistoczerwoną ramkę z czerwoną poświatą, a znacznik „czempion” w raporcie i dopisek na liście niebezpieczeństw też są krwistoczerwone (autor: „niech czempion ma krwistoczerwoną ramkę i oznaczniki”). Na liście „Czyhające niebezpieczeństwa” czempion stoi ostatni, z dopiskiem „czempion”. Do czasu spotkania jest, jak inne stwory, cieniem z „???”.
    - Zadania narratora nigdy nie każą pokonać elity ani czempiona.
    - Trudność według symulacji: typowa postać pokonuje Odyńca (poziom 27) w 4% walk na 22. poziomie, w 44% na 25. i w 96% na 27. Bazyliszka (poziom 52) pokonuje w 26% na 47. poziomie, w 40% na 50., w 63% na 52. i prawie zawsze na 55. Pierwsza wersja Bazyliszka była za silna: na 58. poziomie przegrywała z nim większość klas, więc ma słabsze spojrzenie (0,55 zamiast 0,75) i wolniej rośnie mu Intelekt.
4. **Uroczysko Kamieni ma własne stwory** (autor: w nowych krainach, już w Uroczysku, potwory mają być prawie całkiem inne niż w Wiatrołomach).
    - Zostają Krzyżak, Ryś, Basior i Niedźwiedź, które były tylko w Uroczysku, oraz elita Licho. Stwory z Wiatrołomów zastąpiły nowe:
        - **Wadera** (przód) zamiast wilka. Wadery polują w watahach z basiorem. Materiał: Futro wadery, unikalne.
        - **Kamiennik** (przód, bardzo twardy) zamiast borsuka i dzika: omszały stwór z głazów, który budzi się w kręgu kamieni. Materiał: Rdzeń kamiennika, epicki.
        - **Gacek** (tył) zamiast kruka i żmii. Materiał: Skrzydło gacka, rzadkie.
        - **Puchacz** (tył) zamiast puszczyka. Materiał: Pióro puchacza, unikalne.
    - **Bazyliszek** (czempion, środek) z polskiej legendy: wąż z głową koguta, którego spojrzenie zamienia w kamień (magia, żywioł ziemia). Mieszka w Sercu Uroczyska, gdzie między głazami stoją kamienne zwierzęta. Materiał: Łuska bazyliszka, boska.
    - W Uroczysku nie ma już żadnego stwora z Wiatrołomów. Opisy miejsc mówią teraz o nowych stworach. Test pilnuje, żeby żaden stwór Wiatrołomów nie wrócił do Uroczyska.
    - Zadania wylosowane wcześniej mogą jeszcze prosić o stwory, których w Uroczysku już nie ma. Wszystkie żyją dalej w Wiatrołomach, więc da się je wykonać.
5. **Bilans po zmianach** (symulacja `tools/simulate.mjs`, przed zmianą i po niej). W Wiatrołomach XP na godzinę i szansa omdlenia się nie zmieniły. W Dziczej Głuszy doszło 1–5% odwrotów przed Odyńcem, bez kary. W Uroczysku XP na godzinę zmieniło się o najwyżej kilka procent. W Sercu Uroczyska typowa postać 48. poziomu mdlała na godzinnej wyprawie w ok. 5–7% wypraw zamiast 0–3%, bo spotykała Bazyliszka. Odkąd czempion trafia się czterokrotnie rzadziej (punkt 3), mdleje w ok. 2% wypraw (na 47. poziomie 2,3%, na 50. 1,1%), a Bazyliszka spotyka w 1,5% godzinnych wypraw. W Dziczej Głuszy odwrotów przed Odyńcem jest 1–2% zamiast 4–6%. Tak ma być w najniebezpieczniejszym miejscu regionu, a poziom zagrożenia to pokazuje.
6. **Grafiki i głosy nowych stworów.** Każdy nowy stwór i materiał ma jeden szkic z Retro Diffusion (`art/prompts.json`), a każdy stwór dwa nagrania krzyku przy trafieniu i dwa przy pokonaniu z ElevenLabs (`audio/prompts.json`, `data/sounds.json`). Do czasu spotkania stwór jest na liście niebezpieczeństw cieniem swojej grafiki.
    - Jeleń i Rój szerszeni dostały drugi szkic, bo pierwszy miał tło. Drugi szkic jelenia wyszedł dobrze. Szerszenie miały tło także w drugim, więc w grze jest pierwszy szkic z usuniętym białym tłem i jasną obwódką, bez trzeciego szkicu.
    - Łuska bazyliszka miała czarne tło. Jest usunięte, a łuska dostała ciemny kontur jak inne ikony.
    - Gacek należy do rodziny zwierząt (`beast`), bo to ssak. Nowa rodzina `insect` (Rój szerszeni) ma własną ikonkę na wypadek braku grafiki.
7. **Raport pokazuje znacznik „czempion”.** Walka z czempionem ma w raporcie znacznik „czempion” obok „najważniejsza”, tak jak walka z elitą ma „elita”. Test pilnuje, żeby raport go nie gubił.
8. **Koszt.** Retro Diffusion: 10 szkiców stworów, 10 materiałów i 2 poprawki po 0,18 USD, razem ok. 4 USD. ElevenLabs: 20 nagrań głosów, ok. 640 kredytów.

## Czempion najrzadszy, unikanie elit i grafiki obozu (26.10.2026)

1. **Czempion trafia się najrzadziej** (autor: „czempion ma się trafiać najrzadziej, a nie dwa razy częściej niż elita”). `championChancePerFight` spadło z 0,012 do 0,003, czyli do połowy szansy elity (0,006). Liczby po zmianie są w punktach 3 i 5 sekcji „Nowe stwory i czempioni”. Test pilnuje, żeby szansa czempiona była mniejsza niż elity.
2. **Znacznik „Unikaj elit i czempionów”** (autor: „znacznik, który pozwala »z góry« uciekać przed elitarnymi stworami i czempionem, włączany i wyłączany przez użytkownika”).
    - Pole do zaznaczenia stoi na karcie regionu wewnętrznego, nad poziomem zagrożenia i przyciskiem „Wyrusz”. Przy pierwszej wyprawie go nie ma, bo ona i tak nie ma elit.
    - Zaznaczone sprawia, że postać w ogóle nie trafia na elitę ani czempiona, także przy „Wyrusz ponownie” w raporcie. Inne walki losują się tak jak bez znacznika.
    - Poziom zagrożenia pokazuje wtedy szansę omdlenia bez elit i czempiona (`threatAvoiding` w `GET /api/hunts/options`), liczoną z tych samych próbnych walk co zwykły.
    - Wybór zostaje na telefonie (`localStorage`), więc kolejne wyprawy go pamiętają. Serwer zapisuje go z wyprawą (`activities.avoid_rare`, migracja 0024), bo raport powstaje z ziarna dopiero przy odbiorze. Karta trwającej wyprawy mówi „Postać omija elity i czempionów.”
    - Ceną jest to, co elity i czempion dają: rzadkie materiały, skrzynie i więcej XP. Innej kary nie ma, bo to najprostsze rozwiązanie zgodne z prośbą autora.
    - Według symulacji typowa postać 48. poziomu mdleje w Sercu Uroczyska w 0,2% godzinnych wypraw ze znacznikiem i w ok. 2% bez niego.
    - W bezpiecznym regionie odwrót przed elitą albo czempionem kończy wyprawę wcześniej, a bez nich postać walczy do końca, więc szacunek bez nich może wyjść odrobinę wyższy. Gra pokazuje wtedy niższy z dwóch poziomów (`lowerThreat`), żeby bezpieczniejszy wybór nigdy nie wyglądał groźniej.
3. **Czempion na czerwono** (autor: „niech czempion ma krwistoczerwoną ramkę i oznaczniki”). Karta czempiona w walce ma krwistoczerwoną ramkę z poświatą, a znacznik „czempion” w raporcie i dopisek „czempion” na liście niebezpieczeństw są krwistoczerwone. Elita zostaje przy swoim kolorze.
4. **Nowy krzyk Płanetnika** (autor o pierwszym nagraniu śmierci: „zbyt ludzka”). Opis w `audio/prompts.json` prosi teraz o ducha burzy rozwiewanego przez wiatr, z trzaskiem pioruna i grzmotem, bez ludzkiego głosu. Z dwóch nowych nagrań do gry trafiło to, które najmniej przypomina głos (najsłabsza wysokość dźwięku). Drugie nagranie śmierci, zostawione przez autora, jest bez zmian. Wybór zapisuje `VOICE_TAKES` w `tools/build-drafts.py`.
5. **Narrator o Szałasie na łupy.** Zatwierdzone przez autora zdanie jest nagrane: z trzech nagrań w grze jest pierwsze, bo jako jedyne cicho wybrzmiewa i zaczyna się nisko. Dwa pozostałe są na stronie odsłuchu.
6. **Grafiki obozu** (autor o pierwszej wersji: „zbyt jednolite, nieodróżniające się, a do tego ich ewolucje są zbyt mało różnorodne, niech to się zmienia mocno i trochę inny styl przyjmij, ten jest zbyt brązowawy, z resztą różne budynki obozu mogą mieć trochę różny styl”).
    - Pierwsza wersja, 27 scen leśnych w stylu fantasy wyciętych w polany, nie trafiła do gry.
    - Każdy budynek ma trzy wyglądy (poziomy 1–3, 4–7 i 8–10) w stylu izometrycznych zasobów Retro Diffusion (`rd_plus__isometric_asset`). To pojedynczy budynek bez tła, w jasnych kolorach, a każdy wygląd jest wyraźnie większy i bogatszy od poprzedniego, np. Kowadło: pieniek z kowadłem, potem kuźnia, potem kamienna kuźnia z kominem. Styl wybrany po porównaniu Kowadła w dwóch stylach (`rd_pro__isometric` rysował wysepki z trawą i nie odcinał największej kuźni od tła).
    - Każdy budynek ma własne barwy: Tartak jasne drewno i zieleń, Kamieniołom biały marmur, Kopalnia niebieskoszarą skałę z czerwoną rudą, Jezioro Midasa turkus i złoto, Ognisko ogień, Szałas na łupy czerwień i błękit, Skup złomu rdzę i turkusową miedź, Kowadło czarne żelazo i żar, a Stół rzemieślniczy fiolet.
    - Na planszy budynek rośnie też z poziomem: pierwszy wygląd zajmuje 64% placu, drugi 82%, a trzeci cały plac. Stoi na dole placu, na miękkim cieniu.
    - Obrazki są zapisane w palecie bez strat, razem ok. 110 KB.
    - Autor ocenia każdy budynek osobno, zaraz po narysowaniu (zasada w `CLAUDE.md`).
    - Ognisko na poziomach 8–10: ducha ognia z twarzą ten styl nie narysował w dwóch próbach. Skup złomu na poziomach 1–3: pierwszy rysunek wyszedł z tłem lasu, więc jest narysowany drugi raz. *Teraz cały obóz jest narysowany od nowa: zob. „Obóz w puszczy, żywy obóz i skóra w chodzie”, punkt 1.*
7. **Koszt.** Retro Diffusion: pierwsza, odrzucona wersja obozu 27 × 0,18 USD, czyli 4,86 USD. Próba stylu Kowadła 3 × 0,18 USD, nowa wersja 27 × 0,06 USD i dwie poprawki po 0,06 USD, razem ok. 2,3 USD. ElevenLabs: dwa nagrania krzyku Płanetnika i trzy nagrania zdania narratora.
8. **Nowe nazwy** (autor: „Jezioro Midasa zmieniamy na Staw Midasa”, a Szałas na łupy na „Magazyn”). Zmieniły się tylko nazwy w grze (`data/buildings.json`) i w zdaniach narratora, a identyfikatory `midas-lake` i `loot-shed` zostają. Opis stawu brzmi „Cichy staw, na którego dnie zalega złoto”. Zdania narratora przy obu miejscach są nagrane od nowa. W grze jest trzecie nagranie każdego z nich, bo zaczyna najniżej i najczyściej, a dwa pozostałe są na stronie odsłuchu.
9. **Budynki wtopione w planszę** (autor: „zmniejsz trochę saturację tych budynków i powinno pasować, jak jeszcze wtopisz je w planszę obozu lekkim rozmyciem”; obrazki są zatwierdzone, a styl Magazynu ma zostać wzorem).
    - Każdy obrazek na planszy i na ekranie budynku ma filtr SVG: saturacja 0,78, krawędzie zmiękczone rozmytą przezroczystością i delikatna poświata z rozmytej kopii obrazka pod nim (`blend` w `src/client/camp-art.js`). Obrazki w plikach zostają ostre, więc filtr da się łatwo zmienić.
    - Kilofy Kamieniołomu na poziomach 1–3 są stalowe zamiast niebieskich (autor: „kilofy w złym kolorze”). Kolory są przemalowane w obrazku, bez nowego szkicu.
    - Na 9. poziomie Stół rzemieślniczy zasłaniał nazwę Magazynu. Jego plac przesunął się o 12 w prawo, a nazwy budynków stoją zawsze nad obrazkami sąsiednich placów.
10. **Bez Treningu** (autor: „dział Trening całkowicie wyrzucamy z gry, nie widzę dla niego zastosowania sensownego póki co”). Zakładka Walka ma już tylko Eksplorację i Lochy, a Trening zniknął z odblokowań (`data/unlocks.json`), z walidacji danych i z dokumentu projektowego. Rozwój umiejętności idzie wyłącznie przez Punkty Umiejętności.
11. **Kwestia 11 narratora nagrana od nowa** (autor: „zbyt szybko mówi, zbyt wysokim troszkę tonem i »zakończyła« brzmi jak »zakonćyła«”). Opis w `audio/prompts.json` (`report-calm`) prosi o spokojny ton (`[calmly]`), a głos czyta „zakonczyła” z twardym n. Nowe nagrania mówią ok. 15 znaków na sekundę zamiast 16,5 i ok. 70–75 Hz zamiast ok. 90, tak jak reszta kwestii. W grze jest trzecie nagranie: najwolniejsze i z najczystszym początkiem. Autor je zatwierdza („trzecia wersja zostaje”).
12. **Plansza obozu w pixel-arcie** (autor: „popracuj w Retro Diffusion nad planszą obozu, też powinna być w stylu nowych lokacji”; pierwszy szkic zatwierdzony przez autora). Ziemia planszy to jeden obrazek polany w lesie (`art/prompts.json`, rodzaj `board`, styl `rd_plus__topdown_map`, 320 × 352), w grze stonowany (saturacja 0,7) i przyciemniony (0,72) tak jak budynki. Ścieżki do placów rysuje gra, bo muszą trafiać w place: to miękkie, ziemne dróżki, lekko rozmyte i półprzezroczyste. Bez obrazka zostaje dawna polana w wektorach. Koszt: dwa szkice po 0,06 USD. *Teraz polana ma trzy wyglądy: zob. „Obóz w puszczy, żywy obóz i skóra w chodzie”, punkt 2.*
13. **Plac przed budową jest szary** (autor: „przed budową lokacji w obozie musi ona być wyszarzona”). Pusty plac pokazuje pierwszy wygląd swojego budynku bez kolorów (saturacja 0) i półprzezroczysty: 50%, a w trakcie budowy, pod rusztowaniem, 70%. Tak samo wygląda obrazek na ekranie budynku. Barwy pojawiają się po ukończeniu pierwszego poziomu. Punkt uzupełnia blady zarys z punktu 4 części o planszy obozu.
14. **Kwestia narratora w obozie** (autor: „powinno być »Znalezione - nie kradzione«”, a kwestia mówiła o kilku monetach, choć światło pokazuje rudę żelaza). Zatwierdzony tekst brzmi: „Na tej polanie ktoś już kiedyś obozował. Dobrze dla Ciebie! Wygląda na to, że zostawił trochę drewna, kamieni i rudy żelaza. Znalezione – nie kradzione.” ElevenLabs nagrał trzy wersje (`camp-calm`, 510 kredytów). W grze jest trzecia: ma przerwę przed „nie kradzione” jak poprzednie nagranie, najczystszy początek i podobne tempo (12 znaków na sekundę). Pierwsza mówi wolniej (10,8 znaku na sekundę), a druga kończy się ponad sekundą ciszy.

## Nazwy afiksów od stworów z miejsca (26.10.2026)

1. **Afiks nosi nazwę stwora z miejsca, w którym znaleziono przedmiot** (autor: „Fokus Puszczyka wypadł mi właśnie ze Skraju Wiatrołomów, a nie ma tego wroga w tej lokacji. Nie powinno być więc takiego afiksu” oraz „»Lisa« i wszystkie inne takie to ozdobniki”, więc nazwa nie musi się wiązać ze statystyką).
    - To, co daje afiks, losuje się jak dotąd: te same statystyki i wagi (`prefixes` i `suffixes` w `data/affixes.json`), w każdym miejscu tak samo. Balans się nie zmienia.
    - Nazwę każdemu afiksowi daje potem stwór z listy „Czyhające niebezpieczeństwa” regionu wewnętrznego, razem z jego elitą i czempionem. Przedrostek daje stwór, od którego jest przymiotnik (Wilczy, Lisi), a przyrostek każdy stwór (Wilka, Lisa). Nazwy stworów leżą w `names` w `data/affixes.json`, a przedmiot zapisuje przy afiksie stwora, który go nazwał (`monster`).
    - W Skraju Wiatrołomów przedmioty są więc wilcze, lisie, żmijowe i borsucze albo mają przyrostek Wilka, Lisa, Żmii, Borsuka lub Błędnicy, a nigdy Puszczyka.
    - Jeden stwór nazywa jeden afiks przedmiotu, dopóki starcza innych stworów, więc nie ma „Lisiego Hełmu Lisa”.
    - Cotygodniowa skrzynia zadań bierze nazwy od stworów z miejsca, o które proszą zadania (najnowszy region wewnętrzny otwarty poziomem klasy).
    - Przedmioty znalezione wcześniej, także Fokus Puszczyka autora, mają dawne nazwy i liczby. Dawny afiks prowadzi do swojego stwora (`monster` przy afiksie) albo ma własny tekst.
    - Pięć dawnych przyrostków odporności (Topieli, Burzy, Skał, Mchu, Kapliczki) nazywa już tylko stare przedmioty. Nowy przedmiot z odpornością na wodę, elektryczność, ziemię, naturę albo sakrum dostaje nazwę od stwora z miejsca, jak każdy inny.
    - Walidacja pilnuje, żeby każdy stwór miał nazwę do afiksów, a w każdym miejscu żył stwór z przymiotnikiem. Testy pilnują, żeby nazwy brały się tylko od stworów z miejsca, także w skrzyni zadań, i żeby liczby przedmiotu były takie same jak bez miejsca.
2. **Nowe nazwy.** Stwory, od których nie było jeszcze afiksu, mają nazwy od siebie. To propozycja, którą autor może zmienić:
    - przymiotniki: Jeleni (Jeleń), Kuni (Kuna), Puchaczowy (Puchacz), Kamienny (Kamiennik) i Bazyliszkowy (Bazyliszek);
    - przyrostki: Wilka, Krzyżaka, Jelenia, Kuny, Szerszeni (Rój szerszeni), Płanetnika, Odyńca, Kamiennika, Gacka, Puchacza, Wadery i Bazyliszka.
    - Basior, Błędnica, Licho, Rój szerszeni, Płanetnik, Odyniec, Gacek i Wadera nazywają tylko przyrostki, bo przymiotnik od nich brzmiałby sztucznie.
3. **Najmniej przedrostków jest w Uroczysku**: w Omszałych Głazach i Pajęczym Parowie tylko Rysi, Pajęczy i Kamienny, a w Wilczych Kręgach Rysi, Kamienny i Puchaczowy. Żyją tam głównie stwory, od których nie ma dobrego przymiotnika.

## Tropienie stworów z zadań i panel autora (26.10.2026)

1. **„Trop przede wszystkim stwory z zadań”** (autor: „Pod »Czyhające niebezpieczeństwa« powinniśmy dodać opcję nową do zadań »Trop przede wszystkim stwory z zadań«, co powinno zwiększać szansę na trafienie w wyprawie stworów z zadań dziennych/tygodniowych o 50%”).
    - Pole do zaznaczenia stoi na karcie regionu wewnętrznego, pod przyciskiem „Czyhające niebezpieczeństwa”. Przy pierwszej wyprawie go nie ma, tak jak pola „Unikaj elit i czempionów”.
    - Zaznaczone pole sprawia, że spotkania ze stworem z niedokończonego zadania zabijania (dziennego albo tygodniowego) mają o połowę większą wagę (`questTrackBonus` 0,5 w `data/balance.json`), także spotkania wymagające. Na Skraju Wiatrołomów, przy zadaniu na lisa, walka z lisem wypada na 5. poziomie w ok. 31% walk zamiast 23%. Elita i czempion trafiają się jak dotąd, bo zadania nigdy o nie nie proszą.
    - Liczą się stwory z zadań w chwili wyruszenia. Serwer zapisuje je z wyprawą (`activities.tracked`, migracja 0026), bo raport powstaje z ziarna dopiero przy odbiorze. Numer 0025 ma migracja profesji z gałęzi roboczej.
    - Gdy w tym miejscu nie żyje żaden stwór z zadań, pod polem stoi dopisek „Żaden stwór z Twoich zadań nie żyje w tym miejscu.”, a wyprawa idzie jak zwykle.
    - Wybór zostaje na telefonie (`localStorage`), także dla „Wyrusz ponownie”. Karta trwającej wyprawy mówi „Postać tropi stwory z zadań.”
    - Poziom zagrożenia liczy walki jak bez tropienia, bo mieszanka spotkań zmienia się niewiele.
2. **Podgląd umiejętności w Panelu autora pod przyciskiem** (autor: „schowaj pod osobnym przyciskiem, bo muszę specjalnie scrollować, by sprawdzić aktualne konta i postaci”). Na górze panelu jest przycisk „Podgląd umiejętności”, a zaraz pod nim liczby i konta. Lista umiejętności wczytuje się dopiero przy pierwszym otwarciu.

## Punkty Umiejętności od 10. poziomu klasy (26.10.2026)

1. **Punkt do wydania już na 10. poziomie klasy** (autor: „10 poziom powinien dawać już 1 Punkt Umiejętności, to ważne. Dopiero na 11 dostałem Punkt. Nie może tak być”). Punkt daje teraz każdy poziom klasy od 10. wzwyż, a ścieżka główna dalej nic nie kosztuje. Na 10. poziomie postać wybiera więc ścieżkę główną i ma jeszcze 1 punkt. Na 11. poziomie ma 2, przed wyborem i po nim. Ścieżka poboczna kosztuje punkt jak dotąd. *Nieaktualne: autor nie chciał dodatkowego punktu, zob. „Punkty Umiejętności: jeden za każdy poziom klasy od 10. do 49.”*
    - Pierwsza poprawka z tego samego dnia, po zgłoszeniu „wyświetlało, że mam tylko jeden […] – do poprawy”, liczyła punkt za 10. poziom, ale płaciła nim za ścieżkę główną. Do wydania nie przybywało więc nic, a autor chce punktu do wydania już na 10. poziomie.
    - Punkty liczą się z poziomu klasy i znanych umiejętności, więc każda postać od 10. poziomu klasy ma od razu o 1 punkt więcej, także te sprzed zmiany. Mag autora dostał w ten sposób punkt, o który autor prosił („dodaj mi ręcznie ten jeden punkt na koncie admina”), bez zmian w bazie. Migracja nie jest potrzebna.
    - Pełne 20 poziomów jednej umiejętności wypada teraz na 28. poziomie klasy, a obu na 48. *Teraz na 29. i 49.* Raport 10. poziomu klasy podaje „Zdobyto Punkty Umiejętności: +1”.
    - Okno wyboru ścieżki głównej mówi, że to wybór na stałe. Od 11. poziomu klasy dodaje, że ścieżkę poboczną można dobrać od razu, za 1 Punkt Umiejętności.

## Kowadło, złomiarz, tropienie elit i portfel we wprowadzeniu (26.10.2026)

1. **Każdy poziom ulepszenia coś daje** (autor: „zauważyłem, że ulepszanie talizmanu nic nie daje… może dawać chociaż +1 do pancerza przy każdym ulepszeniu”). Ulepszenie dalej dodaje 6% liczb przedmiotu za poziom, ale co najmniej 1 (`balance.upgrades.minGainPerLevel`): broni do obrażeń, najmniejszych i największych, a każdemu innemu przedmiotowi do Pancerza. Przedmiot bez własnego Pancerza, np. talizman, amulet, pierścień, kołczan albo fokus, dostaje Pancerz +1 za każdy poziom ulepszenia. Talizman +2 z 1. poziomu ma więc Witalność +2 i Pancerz +2.
    - Szczegół rozstrzygnięty najprostszym rozwiązaniem: zasada działa dla wszystkich przedmiotów, nie tylko talizmanów, bo małe liczby na niskich poziomach nie rosły nigdzie. Przy dużych liczbach nic się nie zmienia, bo 6% daje tam więcej niż 1. Przykład: Kolczuga z Pancerzem 15 ma na +10 Pancerz 25 zamiast 24.
    - Pancerz z ulepszenia stoi na karcie pod cechami przedmiotu. Własny Pancerz zbroi jest jak dotąd na górze.
2. **Złomiarz kupuje prosto z plecaka** (autor: „nie mogę sprzedać ulepszonych, o ile w ogóle jakichkolwiek przedmiotów z pozycji plecaka u złomiarza – ani w skupie, ani nigdzie”).
    - Karta przedmiotu w plecaku ma przycisk „Sprzedaj za X złota”. Sprzedaje jeden przedmiot, także ulepszony, po potwierdzeniu. Za ulepszenie złomiarz nie płaci więcej i okno to mówi. Założonego przedmiotu nie kupuje.
    - Ekran Skupu złomu ma nad ladą część „Skup przedmiotów” z przyciskiem „Sprzedaj zbędne przedmioty”. Otwiera tę samą sprzedaż według rzadkości co raport wyprawy. Pod nią stoi zdanie autora: „Złomiarz kupi zbędne przedmioty z plecaka. Sprzedasz u niego przedmioty także bezpośrednio z pozycji plecaka.” Ulepszone przedmioty dalej nie idą hurtem, a okno sprzedaży mówi, że sprzedaje się je bezpośrednio z pozycji plecaka.
3. **„Trop elity i czempiony”** (autor: „Dodaj też, tak jak jest »Unikaj elit i czempionów«, »Trop elity i czempiony«, niech zwiększa to szansę dwukrotnie na znalezienie wspomnianych”).
    - Pole stoi pod „Unikaj elit i czempionów”, przy „Wyrusz”. Zaznaczenie jednego odznacza drugie, a serwer nie przyjmie obu naraz. Przy pierwszej wyprawie pól nie ma.
    - Szansa na elitę i na czempiona jest w każdej walce dwa razy większa (`balance.hunt.rareSeekFactor` = 2). Czempion dalej trafia się tylko tam, gdzie mieszka.
    - Poziom zagrożenia liczy walki z podwojoną szansą i nigdy nie wychodzi niższy niż bez pola. Wybór zostaje na telefonie, także dla „Wyrusz ponownie”. Karta trwającej wyprawy mówi „Postać tropi elity i czempiony.”. Serwer zapisuje wybór z wyprawą (`activities.seek_rare`, migracja 0027).
4. **Kwestia narratora o portfelu** (autor: „Trzeba dodać przed pokazywaniem zębatki ustawień kwestię Narratora: »Przy okazji – w tym miejscu możesz sprawdzić swój stan złota i Punkty Systemu, a po kliknięciu – resztę zasobów wraz z Punktami Czasu. Sam zobacz« (rozwija listę). Lecisz z tym pergaminem oraz nagraniem”).
    - Kwestia `wallet` stoi tuż przed kwestią o ustawieniach. Podświetla złoto i Punkty Systemu w górnym pasku, a stuknięcie w nie albo „Dalej” rozwija listę. Lista zostaje na ekranie 2,5 sekundy, zanim przyjdzie kwestia o ustawieniach (`delay`).
    - Postać o wyglądzie kobiecym słyszy „Sama zobacz.”. Przy wpisaniu: półpauzy w miejscu dywizów i kropka na końcu.
    - Stuknięcie nie zmienia ekranu, więc ta kwestia „lead” zostaje zapamiętana jak karta (`once` w `data/tutorial.json`). Pokazuje się tylko we wprowadzeniu, nie postaciom, które już je skończyły.
    - Nagranie: po trzy wersje obu kwestii z tym samym głosem i modelem co reszta wprowadzenia (930 kredytów ElevenLabs), przycięte i wyrównane jak reszta (−18 LUFS, mono 56 kb/s). Żadna nie urywa ostatniego słowa. W grze są wersja 1 kwestii męskiej i wersja 3 żeńskiej, najbliższe tonem i tempem kwestiom już nagranym. Pozostałe czekają na gałęzi `art-drafts`.

## Błędnica, Cień i ulepszenia: odpowiedzi autora (26.10.2026)

1. **Groźniejsza Błędnica** (autor: „wygląd Błędnicy trzeba wygenerować na nowo, zostawiamy tego sprite'a na jakiegoś duszka albo coś w przyszłości, ale Błędnica musi wyglądać groźniej”, a potem „wybieram szkic 2 Błędnicy”). Nowa Błędnica to wychudła upiorna postać z zielononiebieskiego ognia, ze szponiastymi dłońmi (szkic 2 z Retro Diffusion, 48 × 48 bez tła). Dawny duszek czeka w `art/spare/monsters/wisp.png` na przyszłego stwora.
2. **Teksty Cienia** (autor: „Skille Cienia prawie dobre, w ostatnim skillu Tańcu cieni tylko jeden problem: pomiń info o zwykłym limicie 30%”). Skutek Tańca cieni nie wspomina już o limicie uniku. Sam mechanizm zostaje: unik z Tańca cieni dalej może przekroczyć zwykłe 30%. Przy kolejnych tekstach do przejrzenia nie podaję liczb z 20. poziomu (autor: „pomiń info o tym, ile na 20 poziomie to wychodzi”).
3. **Ulepszenie zawsze daje co najmniej +1** (autor: „Co do Talizmanu tak, niech daje chociaż +1 zawsze ulepszenie”). Zasada z poprzedniej sekcji zostaje dla wszystkich przedmiotów.
4. **Kwestia o portfelu** zostaje tak, jak autor ją napisał i umieścił: tylko we wprowadzeniu, tuż przed zębatką ustawień (autor: „napisałem ją i powiedziałem, kiedy ma być”).
5. **Ulepszony przedmiot jest więcej wart u złomiarza** (autor: „Jeśli ulepszyłem przedmiot na +2, to chyba powinien w sprzedaży u złomiarza dać więcej niż 1 złota? Ja rozumiem, że to pospolity przedmiot, ale jednak materiały wchłonął, trzeba to balansować”). Złomiarz dolicza do zwykłej ceny połowę złota, które kosztowały ulepszenia do obecnego poziomu (`balance.upgrades.sellRefund`: 0,5). Nie liczy nieudanych prób ani rudy, a premia Skupu złomu podnosi tylko zwykłą cenę, więc ulepszanie na sprzedaż nigdy się nie zwraca. Przykład: pospolity Talizman 1. poziomu na +2 (ulepszenia za 4 złota) daje teraz 3 złota zamiast 1. Ulepszonych przedmiotów złomiarz dalej nie bierze hurtem, tylko pojedynczo z pozycji plecaka. Cenę liczy silnik, a serwer płaci ją tylko za przedmioty, które jeszcze leżą w plecaku, więc podwójne kliknięcie nie płaci dwa razy.

## Potwierdzanie e-maila (26.10.2026)

1. **Gra po potwierdzeniu** (autor: „Trzeba też zrobić rejestrację z potwierdzaniem maila. Bo jak ktoś przez Google się nie rejestruje, to w tego maila może cokolwiek wpisać, co wygląda jak mail” i „Grać można tylko po potwierdzeniu rejestracji”). Konto zakładane loginem i hasłem musi podać e-mail. Serwer wysyła na niego link przez Cloudflare Email Service (nadawca „Insight”, `no-reply@insightrpg.com`). Do kliknięcia linku gra pokazuje tylko ekran „Ostatni krok: potwierdź adres e-mail” z przyciskami „Mam już potwierdzone”, „Wyślij link ponownie”, „Zmień adres e-mail” i „Wyloguj się”, a serwer nie pozwala stworzyć postaci ani grać (403 `email_unconfirmed`). Gdy gracz wróci do gry z aplikacji pocztowej, strona sama sprawdza, czy link już zadziałał.
2. **Konta sprzed zmiany** (autor: „Te konta z hasłem, które już istnieją, jeśli mają podpięty mail, nie muszą tego robić. Resztę kont bez maila bez postaci usuń”). Migracja 0028 usuwa konta z hasłem, które nie mają ani e-maila, ani postaci. Pozostałe konta sprzed zmiany grają dalej bez potwierdzenia, także konto bez maila, ale z postacią: ktoś nim gra, więc zostaje i dostaje pergamin z polem na adres.
3. **Pergamin z zachętą** (autor: „Jeśli ktoś nie ma potwierdzonego maila, wyświetl Pergamin z zachętą, że dostanie się 10 Punktów Systemowych, i klik do wysłania tego maila”). Konto sprzed zmiany bez potwierdzonego adresu widzi po wejściu do gry pergamin „System”: „Potwierdź adres e-mail swojego konta, a dostaniesz 10 Punktów Systemu.”, pole adresu (wypełnione, gdy konto go ma), „Wyślij link” i „Później”. Pergamin czeka, aż narrator skończy wprowadzenie i swoje kwestie na danym ekranie. „Później” chowa go do zamknięcia przeglądarki. W Ustawieniach wiersz „E-mail” pokazuje adres i „Potwierdzony” albo przycisk „Potwierdź”, który otwiera ten sam pergamin.
4. **Nagroda**: 10 Punktów Systemu raz na konto, za pierwsze potwierdzenie linkiem (`balance.account.emailSystemPoints`), także dla nowych kont. Punkty Systemu należą do postaci (decyzja z 24.10.2026), więc trafiają do postaci, a konto bez postaci dostaje je z pierwszą postacią. „Zacznij od nowa” ich nie zwraca. Konto Google liczy się jako potwierdzone, bo Google potwierdził właściciela, i tej nagrody nie dostaje. *Nieaktualne: konto Google też ją dostaje, zob. „Celowanie, łatwe miejsca, zadania, duch ognia i Google”, punkt 6.*
5. **Link** działa przez dobę i potwierdza adres, na który poszedł, tylko dopóki konto ma ten adres. Nowy link wychodzi najwcześniej po minucie, najwyżej 5 na dobę. Adres zmienia się tylko na koncie, które go jeszcze nie potwierdziło. Baza trzyma tylko skrót linku (SHA-256), jak przy sesjach. Treść maila jest w `data/texts.json` (`emailConfirm…`), w wersji tekstowej i jako prosta strona z przyciskiem.
6. **Panel autora** dopisuje „(niepotwierdzony)” przy adresie, którego nikt nie potwierdził.
7. **Teksty autora**: komunikat o zbyt szybkim kolejnym linku brzmi „Link został już wysłany. Sprawdź skrzynkę, także folder spam, albo spróbuj ponownie za N s.” (autor: „Nie »Link poszedł przed chwilą«, a »Link został już wysłany«”). Tak samo pozostałe komunikaty o linku mówią „został wysłany” zamiast „poszedł”.

## Plansza obozu: przycisk poziomu i dymek Tartaku (26.10.2026)

Autor: „Rozwiń poziom obozu zasłania często przychód z tartaku, daj przycisk w lewy górny róg planszy obozu”. Przycisk stał już w lewym górnym rogu planszy, ale 6 pikseli od krawędzi, a dymek z przychodem Tartaku wypadał w tym samym rogu, pod nim. Teraz przycisk przylega do samego rogu (z zaokrągleniem jak plansza), a dymek Tartaku stoi przy prawym boku Tartaku, niżej, więc nic go nie zasłania. Inne dymki zostają w prawym górnym rogu swoich placów (`bubble: 'side'` w `CAMP_PLOTS` przesuwa dymek tylko tam, gdzie trzeba).

## Suwak ducha ognia i ostrzeżenie o łatwym miejscu (26.10.2026)

1. **Suwak ducha ognia** (autor: „Duch ognia musi mieć suwak, bo mimo że chciałbym 5 drewna za 50 złota, to po ulepszeniu nie mogę tego zrobić”). Pod „Jedna wymiana: do X złota → Y sztuk” stoi suwak od 1 sztuki do pełnej wymiany, a obok cena, np. „5 sztuk za 50 złota”. Sztuka kosztuje tyle samo co w pełnej wymianie (10 złota), a przyciski zasobów pokazują wybraną liczbę. Suwak startuje od pełnej wymiany albo od tylu sztuk, na ile starcza złota, i pamięta ostatni wybór, dopóki strona jest otwarta. Każda wymiana, mała czy pełna, liczy się jako jedna z dziennych: to najprostsza zasada i nie zmienia liczby wymian na poziomach. Serwer przyjmuje `amount` (bez niego pełna wymiana). *Nieaktualne: dzienny limit liczy teraz sztuki, a nie wymiany, zob. „Duch ognia: dzienny limit w sztukach”.*
2. **„Mało” zamiast „mniej”** (autor: „przy wyprawie na niskolevelowy region nie powinno pisać, że dostanę »mniej« doświadczenia, jeśli mam za wysoki poziom, tylko że dostanę »mało« doświadczenia”). Ostrzeżenie brzmi teraz: „To miejsce jest już dla Ciebie za łatwe: dostaniesz mało doświadczenia.”
3. **Kara za zbyt łatwe miejsce zostaje do decyzji autora** (autor: „chyba że rzeczywiście skaluje się w dół, a nie powinno, skoro progi rosną”). Doświadczenie rzeczywiście maleje: gdy postać ma o więcej niż 2 poziomy więcej niż stwór, każdy kolejny poziom zabiera 25% XP za niego, aż do 10% (`balance.hunt.lowLevel…`). Tę zasadę zapisuje dokument projektowy („Eksploracja w miejscu znacznie poniżej poziomu postaci daje wyraźnie mniej XP”) i pilnuje ona, żeby jedna długa wyprawa w łatwym miejscu nie dawała wielu poziomów naraz, więc zgodnie z zasadą o ustalonych decyzjach czeka na odpowiedź autora. *Autor zdecydował: kara zostaje, ale mniejsza, zob. „Celowanie, łatwe miejsca, zadania, duch ognia i Google”, punkty 2 i 3.*

## Celowanie, łatwe miejsca, zadania, duch ognia i Google (26.10.2026)

1. **Przód ściąga ciosy drużyny** (pytanie autora: „czy jak wdrożyłeś uwagę, że postać celuje we wroga, którego najłatwiej dobić, to nie zapomniałeś o równoważeniu tego z zasadą, że Przód najczęściej ściąga aggro, później Środek, a później Tył?”). Potwory od początku biją przód w 50% ataków, środek w 30%, a tył w 20%, ale postać patrzyła tylko na to, kogo pokona najszybciej. Teraz liczba ciosów potrzebnych na wroga dzieli się przez wagę jego pozycji (50, 30, 20, `combat.targetWeights`). Postać bije więc środek, gdy pokona go w najwyżej 60% ciosów potrzebnych na przód, a tył dopiero przy 40%. Cel trzyma się do jego upadku, więc ciosy się nie rozpraszają, jak chciał autor. Cios w plecy dalej uderza najdalej z tyłu. Symulacja 170 000 wypraw: omdlenia i XP na godzinę bez zmian (różnice w granicach przypadku).
2. **Mniejsza kara za łatwe miejsce** (autor: „albo nie, niech będzie jak jest, ale kara musi być mniejsza”). Zasada z dokumentu projektowego zostaje: XP za stwora maleje, gdy postać ma od niego wyraźnie wyższy poziom, i liczy się poziom osiągany w trakcie wyprawy. Kara zaczyna się jednak, gdy postać ma o więcej niż 3 poziomy więcej niż stwór (było 2), każdy kolejny poziom zabiera 10% XP za niego (było 25%), a najwyżej połowę (było 90%). Miejsce o jeden region wewnętrzny za łatwe daje teraz ok. 35–50% XP na godzinę z miejsca na poziom postaci, a nie 10–20% (półgodzinne wyprawy wojownika na poziomach 12–30). Słabsze stwory i tak dają mniej XP, więc dalej opłaca się iść naprzód. Ostrzeżenie na ekranie Walka „To miejsce jest już dla Ciebie za łatwe: dostaniesz mało doświadczenia.” pojawia się od tego samego progu: gdy postać ma o więcej niż 3 poziomy więcej niż najsilniejsze zwykłe stwory miejsca.
3. **Jednorazowa premia na elitę i czempiona** (autor: „Jak ktoś ma już karę za łatwe miejsce, musi mieć jednorazowy mocny bonus na znalezienie Elity/Czempiona, żeby uzupełnić swój bestiariusz. Później wraca to do normy”). W takim miejscu elita i czempion, których postać jeszcze nie spotkała, trafiają się w połowie walk (`hunt.rareCatchUpChance`), aż do pierwszej walki z nimi. Potem szanse są zwykłe, także w tej samej wyprawie. Półgodzinna wyprawa ma 3 walki, więc spotyka ich w ok. 87% przypadków, a jedno spotkanie odsłania stwora na liście „Czyhające niebezpieczeństwa”. Elita jest wspólna dla kilku miejsc regionu (Błędnica w Skraju Wiatrołomów, Lisich Jarach i Kruczych Wykrotach), więc wystarczy spotkać ją raz. „Omijaj elity i czempiony” wyłącza premię, a zagrożenie przed wyprawą ją uwzględnia. Gra nie ogłasza premii, bo autor nie chce podawać mechanik na tacy.
4. **Zadania nie wysyłają do słabych stworów** (autor: „Pamiętaj, by zadania dzienne dostosowywać, by ktoś z wyższym levelem nie był wysyłany na niskolevelowe potwory”). Stwory do zadań dalej pochodzą z najnowszego regionu wewnętrznego otwartego dla klasy. Klasa rośnie szybciej niż postać, więc to zwykle miejsce na poziom postaci albo trochę wyżej. Gdy jednak to miejsce jest dla postaci za łatwe (jak w punkcie 2), zadań na stwory nie ma, a zostają wyprawy i Stół rzemieślniczy. Dotyczy zadań dziennych i tygodniowych. W obecnej grze zdarza się to dopiero od 54. poziomu, za ostatnim miejscem gry, albo gdy klasa zostanie daleko w tyle za postacią.
5. **Duch ognia: tańsze sztuki zamiast większej wymiany** (autor: „To teraz rozwój Ogniska powinien zmniejszać koszt wymiany złota na zasoby zamiast maksymalną wymianę, bo suwak zmienia wszystko”).
    - Jedna wymiana daje do 50 sztuk na każdym poziomie, a suwak wybiera od 1 do 50.
    - Sztuka kosztuje 10 złota na 1. poziomie i o 1 złoto mniej co 2 poziomy: 9 na 2. i 3., 8 na 4. i 5., 7 na 6. i 7., 6 na 8. i 9., a 5 na 10. Poziomy parzyste obniżają więc cenę, a nieparzyste dodają wymianę dziennie, jak dotąd (4 na 1. poziomie, 8 na 10.). *Limit dzienny jest teraz w sztukach, a jedna wymiana nie ma już górnej granicy 50 sztuk: zob. „Duch ognia: dzienny limit w sztukach”.*
    - Ekran Ogniska pokazuje „Jedna wymiana: do 50 sztuk, 9 złota za sztukę”, a pod przyciskami „Na poziomie 4: 8 złota za sztukę, 5 wymian dziennie.”
    - Dlaczego 50: tyle dawała dotąd najwyższa wymiana, więc nikt nic nie traci, a na początku i tak ogranicza złoto. Na 10. poziomie sztuka kosztuje tyle co na wyprawach (4–8 złota za drewno), a dzienny limit dalej trzyma wymianę w ryzach.
    - Dane: `units`, `goldPerUnit` i `cheaperEvery` w `trade` Ogniska (`data/buildings.json`).
6. **Google: 10 Punktów Systemu** (autor: „Niech rejestracja/podpięcie konta Google też daje ten bonus 10 Punktów Systemu”). To ta sama nagroda co za potwierdzenie maila, raz na konto. Konto założone przez Google dostaje ją dla pierwszej postaci, z komunikatem „Konto założone przez Google. Na start: 10 Punktów Systemu.”. Połączenie Google w Ustawieniach daje ją postaci, z komunikatem „Połączono konto Google. Możesz już logować się przyciskiem Google. Za połączenie: 10 Punktów Systemu.”. Konto, które dostało ją za mail, nie dostaje jej drugi raz. Konta połączone z Google wcześniej, w tym konto autora, dostały ją przy wdrożeniu (migracja 0029).
7. **Mail w spamie** (autor: „Potwierdzenie maila z serwera testowego wylądowało w spamie”). Domena ma wszystkie podpisy poczty, które Cloudflare ustawił przy włączeniu wysyłki: DKIM (`cf-bounce._domainkey`), SPF domeny zwrotek (`cf-bounce.insightrpg.com`) i DMARC (`p=reject`). Treść jest krótka, z wersją tekstową. Spam bierze się więc z tego, że domena jest nowa i Gmail nie zna jeszcze jej historii. Reputacja rośnie, gdy ludzie otwierają te maile i oznaczają je jako „Nie spam”. Kod tego nie zmienia, a dodatkowy zakup nic tu nie da.

## Duch ognia: dzienny limit w sztukach (26.10.2026)

1. **Limit w sztukach** (autor: „Limit wymian u ducha ognia ustal na jednostki, nie na liczby wymian, w związku z wprowadzeniem Suwaka”). Duch ognia przyjmuje dziennie 200 sztuk na 1. poziomie Ogniska i o 50 więcej co 2 poziomy: 250 na 3., 300 na 5., 350 na 7. i 400 na 9. i 10. To tyle, ile dotąd dawały wszystkie wymiany dnia (50 sztuk × liczba wymian), więc dzienna ilość się nie zmienia. Gracz dzieli ją, jak chce: jedna wymiana może wziąć wszystko, co zostało na dziś, albo jedną sztukę. Cena za sztukę bez zmian (10 złota, o 1 mniej co 2 poziomy). Poziomy nieparzyste dodają więc sztuki dziennie, a parzyste obniżają cenę.
2. **Ekran Ogniska.** Pod opisem stoi „Cena: 9 złota za sztukę”, nad suwakiem wybrana liczba z ceną („33 sztuki za 297 złota”), a suwak sięga od 1 do tylu sztuk, ile zostało na dziś. Obok są przyciski − i +, jak przy czasie wyprawy, bo na wąskim telefonie suwak do 400 sztuk sam nie trafi w dokładną liczbę. Suwak startuje od wszystkiego, co zostało, albo od tylu sztuk, na ile starcza złota, albo od ostatniego wyboru. Pod przyciskami stoi „Na dziś zostało: 220 z 250 sztuk.”, a niżej „Na poziomie 4: 8 złota za sztukę, do 250 sztuk dziennie.”. Gdy limit się wyczerpie, zamiast suwaka stoi „Na dziś duch ognia nie przyjmie już złota. Wróć po północy.”.
3. **Dane i baza.** Liczby są w `trade` Ogniska (`unitsPerDay`, `moreUnits`, `moreUnitsEvery` w `data/buildings.json`). Serwer liczy sztuki dnia w `characters.fire_units` (migracja 0030), a dawna kolumna `fire_trades` zostaje nieużywana. W dniu zmiany każdy ma pełny limit. `POST /api/camp/trade` wymaga teraz `amount`.

## Punkty Umiejętności: jeden za każdy poziom klasy od 10. do 49. (27.10.2026)

1. **Zasada** (autor: „Przy awansie z 9 na 10 lvl gracz powinien po prostu 1 Punktem wybrać jedną ścieżkę. I jak awansuje ponownie z 10 na 11 lvl klasy to wybierze sobie drugą ścieżkę i powinno wszystko się zgadzać i tak co level rozwój dwóch ścieżek później” oraz „nie dostaje punktu przy awansie z 49 na 50 lvl”). Każdy poziom klasy od 10. do 49. daje 1 Punkt Umiejętności, razem 40. Każdy poziom umiejętności kosztuje punkt, także pierwszy poziom ścieżki głównej. Na 10. poziomie klasy punkt otwiera ścieżkę główną, na 11. ścieżkę poboczną, a każdy następny podnosi jedną z dwóch umiejętności. Na 49. poziomie klasy obie mają 20/20 i nie zostaje żaden punkt. Walidacja danych pilnuje, żeby punkty z tych poziomów (`balance.skills.lastPointClassLevel` = 49) wypełniały dokładnie dwie ścieżki po 20 poziomów.
2. **Bez darmowej ścieżki głównej.** Zmiana z 26.10 („Punkt do wydania już na 10. poziomie klasy”) zostawiała ścieżkę główną za darmo i dawała do tego punkt. Do 50. poziomu wychodziły więc 42 poziomy umiejętności zamiast 40 (autor: „namieszałeś z jakimś rozdawaniem dodatkowych punktów”). Postacie, które wybrały już ścieżkę główną, mają teraz o 1 punkt mniej. Żadna nie traci poziomu umiejętności: kto wydał już wszystkie punkty, odrobi brakujący następnym poziomem klasy, a do tego czasu licznik pokazuje 0.
3. **Po 49. poziomie** punktów nie przybywa, także po 50., bo obie ścieżki są pełne. Co da ewolucja, czeka na jej projekt.
4. **Teksty.** Przycisk ścieżki głównej mówi „Wybierz · 1 punkt”, a okno: „<umiejętność> kosztuje 1 Punkt Umiejętności. To wybór na stałe.”. Karta umiejętności: „Punkty Umiejętności: N. Każdy poziom klasy do 49. daje jeden.”.
5. **Władca Lodu zamiast Druida** (autor: „musimy w ogóle zmienić nazwę Druida (bo będzie to ewolucja Arkanisty)” i „Łatwiej po prostu zmienić nazwę Pana Lodu na Władcę Lodu, bo jest bardziej neutralne płciowo”). Mroźny podmuch otwiera ścieżkę Władca Lodu. Druid zostaje na później jako ewolucja Arkanisty.

## Numer wersji i Punkty Umiejętności postaci autora (27.10.2026)

1. **Numer wersji** (autor: „Od tej pory numeruj wersje gry deployowanych też 0.0.1 -> 0.0.2 itd. żebym łatwiej rozeznawał się czy już puściłeś nową wersję czy jeszcze nie”). Numer stoi w `package.json` i każde wdrożenie do gry podnosi ostatnią liczbę. Pierwsza numerowana wersja to 0.0.1. „Wersja gry” w Ustawieniach pokazuje numer i skrót wersji kodu, np. „0.0.1 (1a2b3c4)”. Wersja testowa pokazuje numer gry, z której wyszła, i własny skrót.
2. **Postać autora** (autor: „Po poprawkach moja postać główna admina ma za dużo rozdane Punktów […] odbierz odpowiednią liczbę punktów z umiejętności Mroźny podmuch”). Mag autora na 14. poziomie klasy ma 5 Punktów Umiejętności, a rozdane miał 6: Osłona many 1 i Mroźny podmuch 5. Migracja 0031 obniża Mroźny podmuch do 4, tylko tej postaci (konto z `AUTHOR_LOGINS`) i tylko przy dokładnie tych poziomach. Inne postacie z takim nadmiarem go zachowują i odrabiają następnym poziomem klasy, zob. „Punkty Umiejętności: jeden za każdy poziom klasy od 10. do 49.”, punkt 2.

## Żeńska kwestia na ekranie Postaci (27.10.2026)

1. **Nowe nagranie** (wersja 0.0.2). Kwestia „W tym oknie Systemu możesz przejrzeć swój ekwipunek. Podczas wyprawy zdobyłaś broń…” jest nagrana jeszcze raz, z „BROŃ” wielkimi literami jak w wersji męskiej (autor przy poprzednim nagraniu: „Dalej czyta „bron” zamiast „broń” i za wysoka tonacja”). Do gry trafiła wersja 3, wybrana przez autora na stronie odsłuchu.

## Objaśnienie Umiejętności: druga część wprowadzenia (26.10.2026)

1. **Kiedy** (autor: „jak ktoś wbije 10 lvl i wyjdzie z raportu wyprawy – zablokuj jego działania i zaprezentuj oraz wyjaśnij mu Umiejętności”). Umiejętności otwiera 10. poziom klasy, więc od niego liczy się objaśnienie. Narrator zaczyna, gdy postać ma już Umiejętności, nie zna jeszcze żadnej z nich i nie jest na ekranie raportu. Zwykle więc rusza po „Powrót” z raportu wyprawy, która dała 10. poziom klasy, na ekranie, do którego prowadzi „Powrót”. Przychodzi dopiero po zakończonym wprowadzeniu (po karcie „Tyle na początek…”). Postać, która zna już jakąś umiejętność, objaśnienia nie dostaje: po wdrożeniu do gry nie zobaczą go postacie z wybraną ścieżką, a zobaczą te, które jeszcze nie wybrały. Postacie sprzed wprowadzenia narratora nie mają go wcale, jak wprowadzenia.
2. **Przebieg.** Jak we wprowadzeniu ekran należy do narratora: nie przewija się i nie przyjmuje stuknięć poza wskazanym miejscem. Karta na środku ekranu (dziesiąty poziom klasy, inna dla każdej klasy), potem prowadzenie do zakładki Postać i do Umiejętności. W Umiejętnościach narrator wskazuje kolejno słowa Systemu, trzy ścieżki naraz (kamera się oddala, żeby objąć wszystkie trzy nazwy, opis inny dla każdej klasy; *teraz kamera jedzie po nich po kolei, zob. „Ramka jedzie po ścieżkach”*), kartę pierwszej umiejętności, jej „Wybierz” i licznik punktów. *Kwestie o karcie i o wyborze stoją teraz na pergaminie na środku ekranu, zob. „Objaśnienie Umiejętności: poprawki autora”, punkt 4.* Na koniec dwie karty: o ewolucji na 50. poziomie klasy i pożegnanie. Narrator niczego nie wybiera: po ostatniej karcie ekran wraca do gracza, a wybór czeka. Wersję żeńską ma tylko pożegnanie („gotów” / „gotowa”), bo reszta kwestii nie zmienia słów.
3. **Pomijanie.** Na każdej kwestii poza ostatnią stoi „Pomiń objaśnienie”. Pomija tylko tę część, a potem pojawia się komunikat „Objaśnienie pominięte. Umiejętności czekają w zakładce Postać.”. „Pomiń wprowadzenie” nie pomija już objaśnienia Umiejętności, które czeka na swój moment.
4. **Dane.** Kwestie są w `data/tutorial.json` z `"chapter": "skills"`, a `chapters.skills` ma napis przycisku i komunikat. Kwestia mówiąca o klasie ma `classes`: osobny tekst dla każdej klasy, z własną wersją żeńską i nagraniem. Walidacja pilnuje, żeby żadnej klasie go nie brakowało. Kwestie nie mają jeszcze nagrań: czekają na akceptację tekstów przez autora. *Teksty są zatwierdzone, a nagrania powstają: zob. „Objaśnienie Umiejętności: poprawki autora”, punkt 6.* Generator głosów nazywa nagrania klas `<kwestia>-<klasa>.mp3` (np. `skills-welcome-mage.mp3`). Serwer pamięta przeczytane kwestie objaśnienia jak kwestie wprowadzenia, a `POST /api/tutorial` z `skip` i `chapter: "skills"` pomija samo objaśnienie.
5. **Sprawdzanie w trybie testowym.** W Ustawieniach, pod „Wersja gry”, jest „Objaśnienie Umiejętności od nowa” (`POST /api/test/skills-tour`). Postać zapomina wybrane umiejętności, więc Punkty Umiejętności wracają, a narrator zaczyna objaśnienie od początku.
6. **Najpierw serwer testowy** (autor: „Jutro to sprawdzę, zobaczymy co poprawimy i wrzucimy na main server”). Objaśnienie działa na razie tylko w wersji testowej. Do gry trafi po poprawkach autora i nagraniu kwestii. *W grze od wersji 0.0.3.*

## Objaśnienie Umiejętności: poprawki autora (27.10.2026)

1. **Teksty** (autor, po sprawdzeniu objaśnienia). Kleryk: „Twoje modły niosą się coraz dalej” zamiast „modlitwy”. Mag: „Elementalista ciska ogniem, Władca Lodu spowalnia wrogów mroźnym wiatrem, a Arkanista zajmuje się zgłębianiem natury samej many.”. Cień: „…a Nocny Tancerz wymyka się ciosom i potrafi przeprowadzić szybką kontrę.”. Wybór: „Pierwsza umiejętność, na którą przeznaczysz pierwszy Punkt Umiejętności, otworzy ścieżkę główną.” zamiast zdań o tym, że nic nie kosztuje. Przy wpisaniu: przecinek po „Umiejętności”. Reszta tekstów zostaje (autor: „Reszta satysfakcjonująca”).
2. **Władca Lodu zamiast Druida** (autor: „musimy w ogóle zmienić nazwę Druida (bo będzie to ewolucja Arkanisty)”, a potem: „Łatwiej po prostu zmienić nazwę Pana Lodu na Władcę Lodu, bo jest bardziej neutralne płciowo”). Mroźny podmuch otwiera ścieżkę Władca Lodu, w zakładce, w oknach wyboru i w kwestii narratora. Druid zostaje na później jako ewolucja Arkanisty. Nazwy ścieżek nie mają form żeńskich (autor: „Anulujemy żeńskie nazwy. Nocna Tancerka źle się kojarzy, a i bazowe klasy byśmy musieli zmieniać”).
3. **Pierwsza umiejętność za pierwszy punkt** (autor: „Awans z 9 na 10 Poziom Umiejętności daje +1 Punkt, awans z 10 na 11 +1 itd. żadnych bonusów na start. Przecież ten nowy Samouczek odblokowuje się przy awansie z 9 na 10 poziom klasy”). Zasada weszła do gry osobno, 27.10, zob. „Punkty Umiejętności: jeden za każdy poziom klasy od 10. do 49.”.
4. **Narrator nie wskazuje żadnej umiejętności** (autor: „Narrator nie wymusza wyboru (i lepiej, żeby nie wskazywał żadnego konkretnego, bo to mylące)”). Kwestie o karcie umiejętności i o wyborze stoją teraz na pergaminie na środku ekranu, a nie przy pierwszej karcie i jej przycisku. Narrator wskazuje już tylko słowa Systemu, trzy ścieżki naraz i licznik punktów.
5. **Wersje żeńskie wprowadzenia** (autor: „ten problem pojawia się też chyba w jakiejś kwestii ze starego Samouczka, chyba przy pierwszej wyprawie. Jeśli tak – zweryfikuj i nagraj wersję żeńską”).
    - Kwestia przed pierwszą wyprawą ma wersję żeńską od 24.10, a jej nagranie mówi „gotowa”.
    - Rozpoznawanie mowy (Vosk z polskim modelem, wybór między formą męską i żeńską w każdym nagraniu) sprawdziło wszystkie nagrania żeńskie. Jedno jest błędne: kwestia na ekranie Postaci mówi „zdobyłeś” zamiast „zdobyłaś”, choć pergamin pokazuje „zdobyłaś”. Ta kwestia jest nagrana jeszcze raz, w tym samym stylu co wersja wybrana przez autora („BROŃ” wielkimi literami). *Do sprawdzenia: mały model Vosk nie zna słowa „zdobyłaś”, więc wybierał tylko między „zdobyłeś” a niczym. To rozpoznanie jest niepewne. Nagrania sprawdza teraz sam autor, na słuch (autor: „nagrania mi tu wrzucisz i sam je będę weryfikował”).*
6. **Nagrania objaśnienia.** Teksty są zatwierdzone, więc wszystkie kwestie objaśnienia dostały głos narratora, po dwie wersje: powitanie i ścieżki osobno dla każdej klasy, a pożegnanie także w wersji żeńskiej. Wersje z uciętym ostatnim słowem odpadły, a wybór i powitanie Cienia nagrały się drugi raz. Resztę autor sprawdził na słuch na stronie odsłuchu („Poprawki naniesione”).
    - W grze są wersje wybrane przez autora, po jednej dla każdej kwestii objaśnienia.
    - Od nowa, według uwag autora: „Wróćmy do okienka Postaci.” („„wwóćmy” czyta zamiast „wróćmy””), „Przeczytaj uważnie…” („Zbyt miękko czyta „przeczytaj””), ścieżki Kleryka („zbyt wysoki ton, szczególnie na początku”), punkty („Za szybko i zbyt wysokim tonem mówi pierwsze słowa”) i ewolucja („zbyt wysoki ton początku i zmiękczający akcent „jeśće jedno””). Spokojniejszy początek daje znacznik `[calmly]`, a za miękko czytane słowo stoi wielkimi literami, jak „BROŃ” (prompty w `audio/prompts.json`). Kwestia o punktach ma też wolniejsze tempo. Z nowych nagrań autor wybrał po jednym dla każdej z tych kwestii.
    - Ścieżki Wojownika autor wybrał w drugiej turze („Zaznaczone”).
7. **Do gry** objaśnienie weszło w wersji 0.0.3, po wyborze nagrań. Zasada punktów i Władca Lodu są w grze od wersji 0.0.1.
8. **Teksty nagrań** (autor: „mam wrażenie że pozmieniałeś lekko niektóre nagrywane kwestie. Jeśli tak – zmień teksty na Pergaminach, bo to łatwiejsze niż nagrywać od nowa. Jeśli nie – nie zajmuj się tą uwagą”). Nagrania powstały z tekstów pergaminów, bez zmiany słów: prompty dodają tylko znacznik tonu `[calmly]` i jedno słowo wielkimi literami. Pergaminy zostają bez zmian. Gdy autor usłyszy w nagraniu inne słowo niż na pergaminie, pergamin dostosuje się do nagrania.

## Ramka jedzie po ścieżkach (27.10.2026)

1. **Przejazd zamiast oddalenia** (autor: „Niech przy opisie umiejętności/ścieżek - złota ramka przejedzie je z góry na dół powoli i wróci na samą górę” oraz „Może po prostu nie oddalaj kamery a zwyczajnie jedź po kolei w dół”). Przy kwestii „Przed Tobą trzy ścieżki…” kamera się nie oddala. Ramka obejmuje całą ścieżkę: nazwę i kartę umiejętności. Najpierw stoi na pierwszej ścieżce, potem kamera powoli (2 s) zjeżdża do drugiej i do trzeciej, a ramka jedzie razem z nią. Do każdej ścieżki dojeżdża, gdy narrator wypowiada jej nazwę. Po kwestii kamera i ramka wracają do pierwszej ścieżki.
2. **Kiedy.** Chwila nazwy wynika z jej miejsca w tekście i z długości nagrania. Bez głosu narratora tempo liczy się z długości tekstu: ok. 11 znaków na sekundę, tyle co w nagraniach.
3. **Pergamin nad ramką.** Pergamin stoi nad ścieżką i jedzie razem z ramką, więc nie przeskakuje. Na małym telefonie (360 × 740) zasłania część górnego paska.
4. **Bez animacji** kamera przeskakuje do ścieżki w chwili jej nazwy.

## Bestiariusz i jego skrzynia (27.10.2026)

1. **Nazwa** (autor: „zmień nazwę Czyhające niebezpieczeństwa na Bestiariusz”). Lista stworów regionu wewnętrznego nazywa się teraz Bestiariusz, na karcie regionu i w jej oknie. Działa jak dotąd: stwór, z którym postać jeszcze nie walczyła, jest cieniem z „???”.
2. **Skrzynia obok napisu** (autor: „Odbiór nagród za Bestiariusz będzie wyświetlać się jako Skrzynia (jak przy zadaniach dziennych) obok napisu”). Na karcie regionu wewnętrznego, w wierszu „Bestiariusz”, stoi skrzynia jak przy zadaniach narratora. Zamknięta pokazuje, ile stworów z listy postać już poznała (np. „4/5”). Gdy pozna wszystkie, także elitę i czempiona, skrzynia świeci się z napisem „Otwórz”. Po otwarciu zostaje szara z napisem „Otwarta”. Każda skrzynia otwiera się raz. Okno Bestiariusza mówi, co jest w skrzyni.
3. **Nagroda** (autor: „za pierwszą lokację +30 złota i +5 Punktów Czasu rosnące jakąś krzywą rozsądną. I niech rosną i złoto i Punkty Czasu wraz z tą krzywą”). Złoto i Punkty Czasu rosną po jednej krzywej z najwyższym poziomem regionu wewnętrznego: nagroda pierwszego × (poziom / 5) do potęgi 1,3. Złoto zaokrągla się do 5. Wychodzi 30 i 5 w Skraju Wiatrołomów, 75 i 12 w Lisich Jarach, 245 i 41 w Dziczej Głuszy, a 600 i 100 w Sercu Uroczyska. Złoto za stwora rośnie z jego poziomem w równym tempie, więc nagroda trochę szybsza od niego zostaje warta podobnej liczby walk także w dalszych regionach. Liczby są w `data/balance.json` (`bestiary`). *Punkty Czasu rosną teraz o 10 na region, zob. punkt 7.*
4. **Wcześniej poznane stwory** liczą się od razu: kto ma już pełną listę, może otworzyć skrzynię po aktualizacji.
5. **Baza.** Otwarte skrzynie zapisuje nowa kolumna `bestiary` postaci (migracja `0032_bestiary.sql`). Skrzynię otwiera `POST /api/bestiary/chest`.
6. **Numer wersji** (autor: „Numerowanie wersji (...) cały czas będzie odbywać się: 0.0.4, 0.0.5, [...], 0.0.23, aż nie powiem, że to już wersja 0.1”). Po 0.0.9 idzie 0.0.10. Zasada stoi w `CLAUDE.md`.
7. **Punkty Czasu o stałą liczbę** (autor: „wzrost za Bestiariusz, przynajmniej Punktów Czasu jest zdecydowanie za duży. Powinno to rosnąć o stałą wartość. Złoto może dalej tak rosnąć jak piszesz, ale Punkty Czasu -> +10 co kolejny region”). Złoto rośnie dalej po krzywej. Punkty Czasu: 5 w pierwszym regionie wewnętrznym i o 10 więcej w każdym kolejnym, czyli 15 w Lisich Jarach, 45 w Dziczej Głuszy i 95 w Sercu Uroczyska (`timePointsStep`). Skrzynie otwarte wcześniej zostają, jak były. W wersji 0.0.7.
8. **Punkty Systemu** (autor: „poza złotem i Punktami Czasu, niech każda skrzynia daje też równo +20 Punktów Systemu. Jeśli ktoś już odebrał te Skrzynie na głównym serwerze to mu dolicz te punkty do jego bilansu”). Każda skrzynia daje też +20 Punktów Systemu, tyle samo w każdym regionie wewnętrznym (`systemPoints`). Postacie, które otwierały skrzynie wcześniej, dostają je raz od migracji `0034_bestiary_system_points.sql`: 20 za każdą otwartą skrzynię. Numer 0033 ma migracja mikstur z gałęzi roboczej. W wersji 0.0.8.

## Spowolnienie Mroźnego podmuchu w opisie (27.10.2026)

1. **Wartość w opisie** (autor: „„Każdy trafiony zostaje spowolniony.” dodajemy „Każdy trafiony zostaje spowolniony o x%.” Nie wiem jak to liczy System ale niech pokazuje jednak wartość spowolnienia”). System odsuwa najbliższy ruch każdego trafionego wroga o cały jeden ruch, więc wróg czeka na niego dwa razy dłużej. Do tego ruchu jest więc o 50% wolniejszy i tyle pokazuje opis: „Każdy trafiony zostaje spowolniony o 50%.”. Liczba wynika z `delay` w `data/skills.json` (`{slow%}` w opisie), więc zmieni się razem z nim. Spowolnienie nie rośnie z poziomem umiejętności. *Teraz rośnie, zob. punkt 2.*
2. **Spowolnienie rośnie z poziomem** (autor: „Niech wartość spowolnienia Mroźnego podmuchu też rośnie o 1% wraz z poziomem umiejętności”). 50% na 1. poziomie i o 1 punkt procentowy więcej na każdym następnym, do 69% na 20. W danych stoi teraz `slow` (od 0,5 do 0,69) zamiast `delay`. Walka odsuwa najbliższy ruch trafionego o slow / (1 − slow) jego ruchu: o cały ruch przy 50%, o ok. 2,2 ruchu przy 69%. W wersji 0.0.6.

## Wersja testowa i Zielarstwo (26.10.2026)

1. **Wersja testowa** (autor: „Jeśli umiesz tak zrobić – proszę zrób”). Pod https://test.insightrpg.com działa ta sama gra z gałęzi roboczej: osobny Worker `wzrost-test` i osobna baza D1 `wzrost-test` (środowisko `test` w `wrangler.jsonc`). Push na każdą gałąź poza `main` i `art-drafts` wdraża ją po testach (zadanie „Wersja testowa” w `.github/workflows/deploy.yml`). Nie ma tam logowania Google ani Panelu autora. Login z `TEST_LOGINS` ma tam tryb testowy. Działa tam tylko konto autora, założone wcześniej na hasło (autor: „Zablokuj wersję testową tak, by nie można było stworzyć więcej kont niż to, które właśnie stworzyłem”): `REGISTRATION` = `"closed"` wyłącza zakładanie kont, także przez Google, a ekran startowy pokazuje tylko logowanie. Nic nie kosztuje, bo plan Workers Paid obejmuje kolejnego Workera i bazę, a adres jest w domenie gry. Każda zmiana wdrożona do gry trafia też na wersję testową (autor: „Pamiętaj, żeby wszystkie zmiany z głównego serwera teraz deployować i na serwer testowy”): po wypchnięciu do `main` gałąź robocza dostaje `main` przez scalenie i jest wypychana.
2. **Profesje wchodzą do gry razem** (autor: „Nie wdrażamy pojedynczej Profesji”). Zielarstwo, Alchemia i Rzemieślnictwo powstają po kolei i są widoczne tylko lokalnie i w wersji testowej (`PROFESSIONS` = `"on"`). Do gry trafią w jednym wdrożeniu. Dopiero wtedy dojdzie komunikat Systemu o profesjach i Awatar. *Zielarstwo i Alchemia weszły do gry w wersji 0.0.9, a Rzemieślnictwo jeszcze czeka: zob. „Profesje w grze”. Awatar doszedł w wersji 0.0.11: zob. „Awatar Systemu w grze”.*
3. **Trzy profesje na start**, zamiast dziesięciu z dokumentu projektowego: Zielarstwo (zbierackie), Alchemia (mikstury leczenia, many i szybkości) i Rzemieślnictwo (cały ekwipunek z części, poza biżuterią i talizmanami). Wszystkie od 10. poziomu postaci, bez walk i zdarzeń. Zakładka Profesje to trzy kwadraty w trójkącie: Zielarstwo na górze, Alchemia i Rzemieślnictwo pod nim. Przy kolejnych profesjach układ się zmieni. *Rzemieślnictwo otwiera się teraz na 15. poziomie: zob. „Rzemieślnictwo od 15. poziomu”.*
4. **Awatar Systemu.** Zwykle profesję wykonuje sama postać i nie może wtedy wyruszyć na eksplorację. Awatar, kupiony za dużo złota, pracuje w tle:
    - jednorazowy zakup na zawsze, za ok. 10 000 złota, do kupienia od razu po odblokowaniu Profesji (autor: „niech kusi i będzie dalekosiężnym celem”); cenę można później zmienić,
    - jeden awatar do wszystkich profesji, robi jedną pracę naraz obok postaci, tak samo wydajnie jak ona,
    - korzysta z poziomu profesji postaci i zna tylko jej zioła i przepisy,
    - nie daje XP, poziomów ani statystyk, a Punkty Czasu skracają też jego pracę.
5. **Zielarstwo: zbieranie.**
    - Postać zbiera w Systemowym Zagajniku, jednym stałym miejscu, w którym rosną wszystkie zioła. System ukrywa przed nią te, których jeszcze nie zna (autor: „taki psikus Systemu”).
    - Czas wybiera się suwakiem: od 10 minut do 8 godzin, co 10 minut. Punkty Czasu skracają zbieranie jak wyprawę. Zbieranie można przerwać, ale wtedy postać nie dostaje nic.
    - Na 1. poziomie zbiór na godzinę to ok. 6 sztuk Żywokostu, 5 Bylicy albo 4 Pokrzywy. Każdy poziom dodaje 2%, więc na 50. poziomie to ok. dwa razy więcej. Losowość to ±15%.
    - Na początku postać zbiera jedno wybrane zioło, od 10. poziomu dwa naraz, od 25. trzy, a od 50. cztery. Zbiór na godzinę dzieli się wtedy po równo między wybrane zioła.
    - Podczas zbierania HP odnawia się jak przy odpoczynku.
6. **Zielarstwo: rozwój.**
    - 100 poziomów. Awans z poziomu L wymaga L × 30 minut zbierania: 10. poziom przychodzi po ok. 22 godzinach, 50. po ok. 600, a 100. po ok. 2500. Liczby są w danych i można je zmienić bez odbierania zdobytych poziomów.
    - Każdy awans daje +1 do Mądrości i +1 do Percepcji. Autor: 1. poziom daje 0, 2. poziom +1 do obu, 3. kolejne +1. Gdyby +1 straciło sens, awans da najwyżej +5, bo poziomy postaci i klasy dają najwyżej +8.
    - 100. poziom dodaje jeszcze +51 do obu statystyk, więc opanowana profesja daje łącznie po +150 (autor: „Niech to będzie taka sowita nagroda za zamknięcie trudnego działu. Ale to dopiero na maksymalnym poziomie wlatuje ten dodatek +51”). Dotyczy każdej profesji (`maxLevelBonus` w `data/professions.json`).
    - Żywokost postać zna od 1. poziomu, Bylicę od 3., a Pokrzywę od 5. Ziół i mikstur będzie dużo więcej. Niepoznane zioło to cień z „???” i poziomem, na którym System je odsłoni.
    - Praca daje trochę XP postaci, ok. 1/10 tego, co godzina wyprawy, i nie daje XP klasy. *Teraz 1/40, zob. punkt o XP z Zielarstwa na końcu tej części.*
7. **Zioła w plecaku** (autor: „zioła zbierają się do plecaka, ale stackują. Dzięki temu będzie większa motywacja do rozbudowy Magazynu”). Jedno miejsce plecaka mieści stos 20 sztuk. Co się nie zmieści, przepada (autor: „trzeba trochę karać za brak pomyślunku”), a ekran przed wyruszeniem mówi, ile się zmieści. Złomiarz kupuje zioła po 2 złota za Żywokost, 3 za Bylicę i 4 za Pokrzywę, z premią Skupu złomu. Stos można sprzedać albo wyrzucić, cały albo część.
8. **Raport, zadania i powiadomienia.** Raport ze zbioru to lista zebranych ziół, XP i awans, a nad nimi jedno zdanie z trzech wariantów (autor: „Używamy tylko 3 zdania z wariantów proponowanych. Nie ma potrzeby tego komplikować”). Zostały trzy pierwsze z sześciu propozycji. Koniec zbierania przychodzi jako powiadomienie na telefon, jak koniec wyprawy. Od 10. poziomu postaci narrator zleca też zadania z ziołami: dzienne „Zbierz 12 <zioło>” ze znanych ziół i tygodniowe „Zbierz 60 ziół”.
9. **Grafiki.** Ikony trzech ziół i trzech profesji oraz tło Systemowego Zagajnika powstają w Retro Diffusion (rodzaje `herbs`, `professions` i `places` w `art/prompts.json`), oceniane po jednej. Żywokost, Bylicę, Pokrzywę, ikonę Zielarstwa (koszyk ziół z sierpem), ikonę Alchemii (kolba z czerwoną miksturą i mosiężny alembik nad ogniem), ikonę Rzemieślnictwa (młot skrzyżowany z wielką igłą z czerwoną nicią) i tło Systemowego Zagajnika (zagajnik gęsty od ziół, z lodowobłękitnymi kryształami Systemu) autor zatwierdza za pierwszym szkicem. Tło stoi przyciemnione za nazwą Zagajnika na ekranie Zielarstwa.
10. **Szczegóły wykonania Zielarstwa.**
    - Każde zbieranie daje co najmniej jedno zioło, także 10 minut na 1. poziomie profesji.
    - Awans postaci z XP za zbieranie odnawia HP do pełna, jak po wyprawie. Bez awansu postać dalej po prostu odpoczywa.
    - Odbiór raportu, przerwanie i Punkty Czasu działają przez te same adresy co wyprawa (`/api/hunts/claim`, `/api/hunts/cancel` i pominięcie `activity`).
    - Zadania z ziołami brzmią „Zbierz 12 sztuk Żywokostu.” i „Zbierz łącznie 60 ziół.”. Dzienne losują się tylko ze znanych ziół.
    - Gdy plecak zapełni się na wyprawie, złomiarz dalej sprzedaje przedmioty, ale ziół sam nigdy nie sprzedaje.
    - Cena liczy się za całą sprzedawaną część stosu i zaokrągla do pełnego złota, najmniej do 1.
    - Pod ziołami stoi zdanie autora: „Obecnie możesz zbierać tylko 1 rodzaj zioła. Potrzebujesz wyższego poziomu Profesji, by zbierać więcej rodzajów naraz. Kolejny rodzaj przy poziomie: 10.” Liczba rodzajów i poziom biorą się z poziomu Zielarstwa postaci (2 rodzaje ziół, 5 rodzajów ziół). Od 50. poziomu, na ostatnim progu, zostaje samo „Obecnie możesz zbierać naraz 4 rodzaje ziół.”. Przy wpisaniu: przecinek przed „by” i „naraz” razem.
11. **Mniej XP postaci z Zielarstwa** (autor, 27.10: „Są zbyt duże nagrody doświadczenia za Profesję Zielarstwa (...) Te bonusy w tym zakresie mają być drobne. W przypadku ze screena 2h zbierania - maksymalnie połowa tego co rzeczywiście wpadło. 8h zbierania z kolei dało wzrost o 2 levele z 12 na 14 (...) Czyli - krzywa XP za Profesję - znacznie w dół”). Godzina zbierania daje teraz 1/40 nominalnego XP godziny wyprawy na poziomie postaci (`rules.characterXpShare` 0,025 zamiast 0,1), czyli czwartą część dawnego. Zbiór 2 h na 11. poziomie daje ok. 450 XP zamiast 1818, a 8 h na 12. poziomie ok. 2000 XP zamiast 8000, mniej niż jeden poziom. Dla porównania jedna 30-minutowa wyprawa na 12. poziomie daje ok. 4600 XP. Pierwsze poziomy faktycznie idą szybko: na 12. poziomie poziom to ok. 20 minut wypraw (3333 XP). Za to wyprawy są tu krótkie (do 30 minut), więc długie zbieranie wyprzedzało je w czasie, gdy gracz nie gra.

## Alchemia: odpowiedzi autora (27.10.2026)

Odpowiedzi na pytania z dokumentu „Alchemia i Rzemieślnictwo: pytania” (A1–A37, W2–W9). Alchemia powstaje na wersji testowej krok po kroku i trafi do gry razem z pozostałymi profesjami.

1. **Trzy pierwsze mikstury** (A1, A15): Mniejsza mikstura leczenia z Żywokostu, Mniejsza mikstura many z Bylicy i Mniejsza mikstura szybkości z Pokrzywy. Stopnie mocy to Mniejsza, Zwykła i Duża. Zwykłe i Duże przyjdą później.
2. **Walka** (A2–A8, A12, A13):
    - Mikstura leczenia działa sama w walce, gdy HP spadnie poniżej progu. Próg gracz ustawia sam (autor: „tak automat, ale gracz może sam ustawić kiedy”). Na start 40%. Leczy 20% maks. HP.
    - Mikstura many działa sama, gdy many zabraknie na umiejętność. Oddaje 30% maks. many.
    - Mikstura szybkości daje +15% szybkości ruchów postaci. To mikstura na czas (autor: „mikstury buffowe jak szybkości wypija z pozycji plecaka i działają czasowo wyświetlając ikonkę z czasem trwania”): gracz wypija ją z plecaka, a ikonka pokazuje, ile jeszcze działa.
    - Przed „Wyrusz” gracz wybiera, ile i jakich mikstur zabiera. Każdego rodzaju najwyżej tyle, ile walk może mieć wyprawa (A8).
    - Zagrożenie liczy zabrane mikstury. Raport pokazuje wypicie w walce („Mira wypija Mniejszą miksturę leczenia: +52 HP”) i zużyte mikstury w podsumowaniu.
3. **Plecak** (A9–A11, A34): mikstury układają się po 20 sztuk na miejsce, jak zioła. Leczenie można wypić także poza wyprawą przyciskiem „Wypij”. Niewypite mikstury wracają z wyprawy do plecaka. Co się nie zmieści po warzeniu, przepada, a ekran ostrzega przed startem.
4. **Składniki i przepisy** (A16–A22): 3 zioła na miksturę (wstępnie), tylko zioła. Przepisy odsłania poziom Alchemii: leczenie od 1., mana od 3., szybkość od 5. Nieznany przepis to cień z „???” i poziomem, na którym System go odsłoni. Bez eksperymentów („później, o ile w ogóle”), bez porażek i bez rzadkości.
5. **Handel** (A23, A24): złomiarz płaci za miksturę 1,5 raza tyle co za zużyte zioła, z premią Skupu złomu. Sam mikstur nie sprzedaje.
6. **Warzenie** (A25–A31, A33, W2, W5, W6): postać warzy w Systemowej Pracowni, stałym miejscu Systemu z własnym tłem, na ekranie jak Zielarstwo. Suwak wybiera liczbę mikstur, a obok widać czas i zużycie ziół. Jedna mikstura to 10 minut na 1. poziomie, a każdy poziom skraca ją o 1%. Najdłużej 8 godzin naraz. Przerwane warzenie zostawia gotowe mikstury, a zioła na resztę wracają. HP odnawia się jak przy odpoczynku. Każda uwarzona mikstura ma 5% szans na jedną dodatkową, na każdym poziomie (autor: „losowy bonus 5% zawsze dostępny na większe warzenie”). Umiejętności profesji tego rodzaju przyjdą później. Punkty Czasu skracają warzenie, a koniec przychodzi jako powiadomienie na telefon.
7. **Rozwój** (A29, A32, A37): poziomy z czasu pracy jak w Zielarstwie (awans z poziomu L po L × 30 minut), za awans +1 do Intelektu i Mądrości. XP postaci jak w Zielarstwie, 1/40 godziny wyprawy.
8. **Raport i zadania** (A35, A36): raport z warzenia to lista mikstur, XP i awans, a nad nimi jedno z 3 zdań. Zdania dostaje autor w szkicu do poprawy. Zadania narratora: dzienne „Uwarz 3 Mniejsze mikstury leczenia.” i tygodniowe „Uwarz łącznie 15 mikstur.”.
9. **Grafiki i dźwięki** (W8, W9): trzy mikstury, a potem tło Systemowej Pracowni z Retro Diffusion, do oceny po jednej. Dźwięki z ElevenLabs po 2 wersje: bulgotanie na koniec warzenia i łyk mikstury w walce.
10. **Kolejność pracy.** Krok 1: przepisy, warzenie i raport, a mikstury w plecaku do sprzedaży. Krok 2: mikstury w walce, próg leczenia, zabieranie na wyprawę i mikstura szybkości na czas.


## Alchemia, krok 1: warzenie w Systemowej Pracowni (27.10.2026)

Brakujące szczegóły kroku 1 rozstrzygnięte najprościej. Wszystko działa tylko na wersji testowej.

1. **Czas mikstury.** Mikstura trwa 10 minut na 1. poziomie, a każdy poziom skraca ją o 1% tego czasu (A27: „na 50. poziomie o połowę”). Od 51. poziomu mikstura trwa połowę, 5 minut, i dalej się nie skraca. Całe warzenie zaokrągla się w górę do pełnej minuty. Naraz warzy się tyle mikstur, ile mieści się w 8 godzinach i na ile starcza ziół, np. 48 na 1. poziomie.
2. **Zioła idą do kotła od razu.** Start zabiera zioła na wszystkie mikstury, więc plecak od razu pokazuje, co zostało.
3. **Przerwanie** (A30). Mikstury powstają jedna po drugiej, w równych odstępach. „Przerwij warzenie” daje gotowe mikstury z raportem oraz XP postaci i profesji za przepracowane minuty, a zioła na resztę wracają do plecaka. Przed pierwszą gotową miksturą przerwanie tylko oddaje zioła, bez raportu.
4. **Szczęśliwe warzenie** (A33). Każda uwarzona mikstura ma 5% szans na jedną dodatkową. Losy idą po kolei z ziarna, więc przerwanie nie zmienia losów mikstur już gotowych.
5. **Plecak** (A9, A34). Mikstury leżą po 20 na miejscu, jak zioła. Ekran przed startem liczy też miejsca, które zwolnią zabrane zioła. Co się nie zmieści, przepada, a raport mówi ile.
6. **Cena** (A23). Złomiarz płaci 1,5 raza tyle co za zioła mikstury, z premią Skupu złomu: Mniejsza mikstura leczenia 9 złota, many 13,5, szybkości 18.
7. **Zadania** (A36). Dzienne „Uwarz 3 Mniejsze mikstury leczenia.” wybiera jeden ze znanych przepisów, a tygodniowe „Uwarz łącznie 15 mikstur.” liczy wszystkie. Liczą się wszystkie uwarzone mikstury, także te, które przepadły, jak zioła w Zielarstwie.
8. **Teksty.** Opisy Pracowni i mikstur są napisane najprościej, do poprawy przez autora. Trzy zdania raportu to szkic, który autor dostał do poprawy (A35). Działanie mikstur (`effect` w `data/professions.json`) czeka na krok 2, a walidator pilnuje, żeby opis mikstury podawał te same procenty.
9. **Grafiki i dźwięki.** Do zatwierdzenia grafik mikstury mają ikonkę kolby, a Pracownia jest bez tła. Bulgotanie i łyk przyjdą z krokiem 2.
10. **Migracja 0033.** Kolumna `potions` (migracja 0033) jest tylko na gałęzi roboczej, jak 0025, więc kolejna migracja w `main` ma numer 0034.


## Alchemia, krok 2: mikstury na wyprawach (27.10.2026)

Brakujące szczegóły kroku 2 rozstrzygnięte najprościej. Wszystko działa tylko na wersji testowej.

1. **Kiedy postać pije.** Miksturę leczenia postać wypija, gdy po ciosie albo po obrażeniach z efektu (np. krwawienia) ma HP poniżej progu. Miksturę many wypija, gdy brakuje jej many na umiejętność. W jednej walce wypija najwyżej jedną miksturę każdego rodzaju. Wypicie nie zabiera ruchu.
2. **Próg leczenia** (A2). Gracz wybiera go przed „Wyrusz”: 20, 30, 40, 50, 60 albo 70% maks. HP. Na start 40%.
3. **Ile zabrać** (A8). Każdego rodzaju najwyżej tyle, ile walk może mieć wyprawa tej długości: przez 1 minutę 1, od 5 minut 2, od 15 minut 3, od godziny 4, od 4 godzin 5.
4. **Mikstury zostają w plecaku do końca wyprawy.** W czasie wyprawy plecaka nie da się zmienić, więc przy odbiorze raportu z plecaka znikają tylko mikstury wypite. Niewypite zostają.
5. **Mikstura szybkości** (A7, zmiana autora: „Mikstura szybkości niech działa 30 minut, ale niech to obejmuje tylko czas płynący na wyprawach oraz niech się stackuje efekt”). Wypita z plecaka daje 30 minut wypraw, a każda kolejna dodaje następne 30, np. trzy dają półtorej godziny. Czas mikstury płynie tylko na wyprawie: wyprawa zabiera tyle, ile trwa, a przerwana oddaje to, czego nie zużyła. Walki w tym czasie są szybsze o 15%, a dalsze toczą się zwykle. Pod górnym paskiem, obok sakiewki, widać kolbę z pozostałym czasem, który odlicza się tylko w czasie wyprawy.
6. **„Wypij” poza wyprawą.** Mikstura leczenia leczy od razu 20% maks. HP, a odpoczynek liczy się dalej od nowego HP. Przy pełnym HP nie da się jej wypić. Mikstury many nie da się wypić z plecaka, bo działa tylko w walce.
7. **Zagrożenie** (A5). Szacunek liczy zabrane mikstury leczenia z ich progiem. Mikstury many i szybkości go nie zmieniają.
8. **Raport.** W walce widać wypicie („Mira wypija Mniejszą miksturę leczenia: +52 HP.”), a w podsumowaniu zużyte mikstury i liczbę walk z miksturą szybkości.
9. **Dźwięki.** Bulgotanie autor wybrał w wersji 2. Gra raz, gdy otwiera się raport z warzenia. Łyk w walce i po „Wypij” za pierwszym razem nie brzmiał jak łyk. Z 4 nowych wersji, nagranych z prostszych opisów, autor wybrał trzecią: jedno przełknięcie. Opis dźwięku może teraz sam ustawić, jak wiernie ElevenLabs ma go trzymać (`influence` w `audio/prompts.json`).
10. **Migracja 0035.** Kolumna `buffs` (migracja 0035) jest tylko na gałęzi roboczej, jak 0033, więc kolejna migracja w `main` ma numer 0036.


## Alchemia: wybory autora (27.10.2026)

1. **Zdania raportu z warzenia** (A35). Zostają trzy: „W Pracowni bulgocze kocioł, a na półce przybywa fiolek.”, „Zioła oddają wywarowi wszystko, co mają najlepsze.” (poprawka autora) i „Błękitne linie Systemu mierzą każdą kroplę mikstury.”.
2. **Grafika Mniejszej mikstury leczenia**: wersja 2. Mikstury many i szybkości to ta sama butelka z zawartością w innym kolorze: many niebieska, szybkości zielona, jaśniejsza od listka (autor: „będziemy to mieli ustandaryzowane”). Tło Pracowni: wersja 2, z kamiennym łukiem i błękitnymi liniami Systemu na ścianie.
3. **Wygląd postaci** (pytanie testujących o ekwipunek na portrecie). Zostaje sposób z Margonem: portret nie pokazuje zakładanych przedmiotów, a lepszy strój przychodzi z ewolucją klasy (autor: „trzymamy się wersji z Margonem”). O czymś więcej można pomyśleć, gdy gra będzie dobrze zarabiać.


## Rzemieślnictwo: odpowiedzi autora (27.10.2026)

Odpowiedzi na pytania R1–R29 i W1–W13 z dokumentu „Alchemia i Rzemieślnictwo: pytania”. Rzemieślnictwo powstaje na wersji testowej krok po kroku. Zielarstwo i Alchemia trafią do gry wcześniej, gdy będą wstępnie gotowe, bo od Rzemieślnictwa nie zależą, a Rzemieślnictwo zostaje w grze zablokowane, aż będzie gotowe (zmiana W1 przez autora 27.10).

1. **Wyroby** (R1, R2, R4–R7, R9). Wyrób ma te same bazy co łup, więc wygląda i działa jak przedmiot z wyprawy, i jest równy łupowi tej samej rzadkości. Jego poziom to poziom postaci, a poziom profesji decyduje o rzadkości i szansie powodzenia. Afiksy są całkiem losowe, a ich nazwy pochodzą od stworów z dowolnego regionu, który postać już odwiedziła. Wyrób może być dla dowolnej klasy (autor: „bo handel wprowadzimy i elementy społecznościowe + możliwość sprzedaży u złomiarza”). Karta wyrobu nie ma podpisu twórcy.
2. **Rzadkość i koszt** (R3, R11–R13). Gracz wybiera rzadkość, a każda wymaga części tej rzadkości: broń i pancerz po 6, druga ręka i hełm po 4, rękawice i buty po 3 (wstępnie). Do tego zasoby obozu: ruda żelaza do metalu, drewno do łuków, kosturów i tarcz, a kamienia najwięcej (autor: „bo kamień ma najmniej zastosowań”). Materiały stworów idą do wyrobu tylko jako części.
3. **Wzory** (R14). Odsłania je poziom profesji. Rozebranie przedmiotu odsłania jego wzór od razu (autor: „rozbiórka pozwoli po prostu łatwiej i szybciej uzyskać dostęp”).
4. **Złomiarz** (R10, R15, R16). Kupuje wyroby jak łup tej rzadkości, a części na przedmiot kosztują u niego więcej, niż on płaci za wyrób. Test pilnuje tego dla każdej rzadkości. Części kupuje się w dziennym limicie sztuk każdej rzadkości, malejącym z rzadkością (autor: „30-20-10 itd.”).
5. **Ulepszone wyroby i zwoje** (R8, R17, R18). Od 10. poziomu profesji wyrób może wyjść od razu ulepszony. Z poziomem rośnie szansa na niższe ulepszenia i pojawia się szansa na wyższe, nawet do +5. Ochronny zwój do Kowadła robi Rzemieślnictwo z Odłamków od 25. poziomu. Chroni przed zniszczeniem przy +7 do +10, ale nie przed spadkiem ulepszenia. Przeróbka gotowych przedmiotów przyjdzie później, w profesji Zaklinania (u Zaklinaczki).
6. **Rozbieranie wyrobu** (R19). Oddaje połowę zużytych części.
7. **Miejsce pracy** (R20). Osobne miejsce Systemu, jak Zagajnik i Pracownia. Stół rzemieślniczy w obozie zmienia nazwę na Stół rozbiórki (szczegóły w „Stół rozbiórki i siła mikstur”).
8. **Czas i powodzenie** (R21–R24). Pospolity przedmiot trwa 1 godzinę na 1. poziomie, a każda rzadkość wyżej dwa razy dłużej. Czas maleje z poziomem profesji. Szansa powodzenia: pospolity 100%, rzadki 90%, unikalny 75%, epicki 55%, legendarny 35%, mityczny 20%, boski 10%, a każdy poziom profesji dodaje 0,5 pkt proc., najwyżej do 95%. Porażka zabiera części, a zasoby obozu wracają. Jedno zlecenie to od 1 do 5 sztuk tego samego wzoru.
9. **Rozwój** (R25, R26). Poziomy z czasu pracy, jak w Zielarstwie, także przy porażce. Za awans +1 do Siły i Zręczności.
10. **Raport i zadania** (R27–R29). Raport to karta gotowego przedmiotu albo zdanie o porażce, plus XP i awans, a nad nimi jedno z 3 zdań (szkic dla autora). Postać nie zacznie pracy bez wolnego miejsca w plecaku na całe zlecenie. Zadania narratora: dzienne „Wykonaj 1 przedmiot.” i tygodniowe „Wykonaj łącznie 5 przedmiotów.”. Liczą się tylko udane, a te zadania trafiają się rzadziej i dają lepsze nagrody.
11. **Sprawy wspólne** (W1–W10, W12).
    - Kolejność: Alchemia, potem Rzemieślnictwo, obie w wersji testowej. Zielarstwo i Alchemia idą do gry, gdy będą wstępnie gotowe, a Rzemieślnictwo czeka w grze zablokowane (autor: „Rzemieślnictwo będzie czekać zablokowane aż zrobimy je”). Gracz może mieć wszystkie trzy naraz.
    - Ekrany Alchemii i Rzemieślnictwa w układzie Zielarstwa, ze wspólną muzyką zakładki Profesje.
    - Objaśnienie narratora dla Profesji na 10. poziomie postaci, w stylu objaśnienia Umiejętności. Komunikat Systemu o profesjach dostaje autor w szkicu do poprawy.
    - Punkty Czasu skracają warzenie i wyrób, a „Pomiń czas” w trybie testowym kończy je od razu. Koniec warzenia i wyrobu przychodzi jako powiadomienie na telefon.
    - Profesje nie są głównym sposobem na złoto.
    - Grafiki z Retro Diffusion po jednej, w kolejności: trzy mikstury, tło Pracowni, tło miejsca Rzemieślnictwa. Wyroby mają obecne ikony przedmiotów. Dźwięki z ElevenLabs po 2 wersje: bulgotanie, młot na koniec wyrobu, łyk mikstury, nieudany wyrób.
    - Balans mikstur (W11): symulacja przed wdrożeniem pokazała, że przy wartościach autora pełen zapas zabiera ok. 83% omdleń, nie jedną trzecią z pierwszej propozycji. Autor zostawia swoje wartości (szczegóły w „Stół rozbiórki i siła mikstur”).
12. **Następne profesje** (W13): jubilerstwo i górnictwo, które szuka szlachetnych kamieni do jubilerstwa (może pod inną nazwą).
13. **Kolejność pracy.**
    - Krok 1: miejsce pracy, wzory z poziomu profesji, wyrób z częściami i zasobami, czas, szansa powodzenia, raport, poziomy, zadania i powiadomienie.
    - Krok 2: ulepszone wyroby od 10. poziomu, ochronny zwój od 25. poziomu, wzory z rozbierania, połowa części z rozebranego wyrobu, ceny złomiarza i dzienny limit części.
    - Krok 3: nowa nazwa Stołu rzemieślniczego z kwestią narratora, grafiki, dźwięki, objaśnienie narratora i komunikat Systemu.


## Rzemieślnictwo, krok 1: wyrób w Systemowym Warsztacie (27.10.2026)

Brakujące szczegóły kroku 1 rozstrzygnięte najprościej. Wszystko działa tylko na wersji testowej.

1. **Miejsce.** Systemowy Warsztat, z opisem w szkicu do poprawy przez autora. Ekran ma układ Pracowni: sloty (broń, pancerz, druga ręka, hełm, rękawice, buty), wzory wybranego slotu, rzadkość i liczbę sztuk. Biżuteria i talizmany nie mają wzorów, bo nie mają części w R11.
2. **Wzory.** Pierwsza baza każdej rodziny jest znana od 1. poziomu profesji, a późniejsza (ta od 10. poziomu klasy) od 10. poziomu profesji. Ukryte wzory są cieniami, jak zioła i przepisy. Ekran zaczyna od wzoru dla klasy postaci, ale można wykonać każdy.
3. **Rzadkości.** Rzadki od 5. poziomu profesji, unikalny od 15., epicki od 25., legendarny od 40., mityczny od 60., boski od 80. Szanse są te z odpowiedzi (R23), każdy poziom po 1. dodaje 0,5 pkt proc.
4. **Zasoby.** Na każdą część i każdy stopień rzadkości (pospolity 1, rzadki 2 i dalej) 3 kamienie, a do metalu tyle samo co części rudy żelaza, do łuków, kosturów i tarcz drewna. Pospolity miecz: 6 Ścinków, 18 kamieni i 6 rudy żelaza.
5. **Czas.** Pospolity przedmiot 1 godzina na 1. poziomie, każda rzadkość wyżej dwa razy dłużej, a każdy poziom profesji skraca go o 1%, najwyżej o połowę, jak w Alchemii. Zlecenie zaokrągla się w górę do pełnej minuty. Postać odpoczywa w czasie wyrobu, jak w Zagajniku i Pracowni. *Od 0.0.51 pospolity przedmiot trwa 30 minut: zob. „Uwagi autora po 0.0.50”, punkt 2.*
6. **Nazwy afiksów** (R4, R5) pochodzą od stworów, które postać spotkała w walkach. Przed pierwszym spotkaniem przedmiot ma zwykłe nazwy afiksów.
7. **Części ze Stołu.** Warsztat liczy też części ze skończonych zleceń Stołu rzemieślniczego, tak jak sakiewka.
8. **Przerwanie.** Przedmioty powstają jeden po drugim. „Przerwij wyrób” daje gotowe przedmioty z raportem oraz XP za przepracowane minuty. Części i zasoby na resztę wracają, a zasoby nieudanych też. Przed pierwszym gotowym przedmiotem przerwanie tylko oddaje wszystko, bez raportu.
9. **Zadania.** Dzienne „Wykonaj 1 przedmiot.” i tygodniowe „Wykonaj łącznie 5 przedmiotów.” trafiają się dwa razy rzadziej niż inne zadania profesji, a ich nagroda jest dwa razy większa.
10. **Teksty.** Trzy zdania raportu i opis Warsztatu autor zatwierdził bez zmian (autor: „nie trzeba poprawiać, zatwierdzam”). Grafika tła Warsztatu i dźwięki młota przyjdą w kroku 3.


## Stół rozbiórki i siła mikstur (27.10.2026)

1. **Stół rozbiórki** (R20). Stół rzemieślniczy w obozie nazywa się teraz Stół rozbiórki. Grafika, miejsce na planszy i poziomy zostają, a nazwa zmienia się we wszystkich tekstach gry i w zadaniach narratora („Przerób na Stole rozbiórki 3 materiały.”). Kwestia narratora we wprowadzeniu: „Przy Stole rozbiórki przerobisz materiały ze stworów na części. Możesz tam też rozebrać zbędne przedmioty. Części przydadzą się, gdy poznasz profesje.” (autor: „modyfikuj Stół rzemieślniczy w Obozie wraz z kwestią narratora i nagraniem”). Z trzech nagrań autor wybrał drugie, z przyciętą pauzą i ostatnim wdechem na końcu (autor: „przytnij pauzę i wdech ostatni”).
2. **Siła mikstur** (W11). Symulacja: każda klasa na poziomach 12–50 w najnowszym otwartym miejscu, na najdłuższej wyprawie, od pełnego HP. Bez mikstur omdlewa 11,6% wypraw, z pełnym zapasem (leczenie i mana tyle, ile walk, szybkość na całą wyprawę) 1,9%. Sama szybkość zabiera ok. 43% omdleń, samo leczenie ok. 72%. Żeby zabrać tylko jedną trzecią, mikstury musiałyby być bardzo słabe, więc autor zostawia swoje wartości: leczenie 20%, mana 30%, szybkość +15% (autor: „zostawiamy moje wartości”). Mocniejsze Zwykłe i Duże mikstury mogą przyjść z wyższymi poziomami.
3. **Przełącznik Rzemieślnictwa.** Rzemieślnictwo ma własny przełącznik `CRAFTING` w `wrangler.jsonc`, obok `PROFESSIONS`. Wersja testowa i `npm run dev` mają oba włączone. W grze głównej po wdrożeniu Zielarstwa i Alchemii kwadrat Rzemieślnictwa mówi „Wkrótce”, Warsztatu nie ma, a zadania „Wykonaj…” się nie losują.


## Objaśnienie Profesji (27.10.2026)

Trzecia część wprowadzenia, po Umiejętnościach (W3, W4). Kwestie narratora mają brzmienie autora, poprawione ze szkicu: „Zanim którąś sprawdzisz”, „Zielarstwo pozwala Ci zbierać zioła…” i „spakujesz je w podróż przed wyruszeniem”. Każda kwestia ma po dwie wersje nagrania na stronie odsłuchu. Trzy wersje z uciętym ostatnim słowem nagrały się drugi raz. Wybór autora: w powitaniu, przy zakładce i w zakończeniu gra wersja 2, przy słowach Systemu i przy kwadratach profesji wersja 1.

1. **Kiedy.** Profesje otwiera 10. poziom postaci, więc objaśnienie przychodzi do postaci, która ma Profesje i skończyła wprowadzenie. Zwykle rusza po „Powrót” z raportu, który dał 10. poziom. W grze głównej przyjdzie po wdrożeniu Profesji także do postaci, które mają już 10. poziom albo wyższy. Postacie sprzed wprowadzenia narratora go nie dostają.
2. **Umiejętności zawsze pierwsze** (autor: „może czasowo nakładać się z Umiejętnościami, jakoś trzeba to rozwiązać, jakby coś to Umiejętności mają pierwszeństwo zawsze”). Gdy czeka objaśnienie Umiejętności, Profesje czekają, aż się skończy albo zostanie pominięte. Jeśli Umiejętności staną się dostępne w trakcie objaśnienia Profesji, narrator przechodzi do nich i wraca do Profesji potem. Objaśnienie Profesji nie zaczyna się też na ekranach Postaci, bo tam gracz wybiera umiejętność po objaśnieniu Umiejętności, a dolny pasek nie ma tam zakładki Profesje. Rusza na najbliższym innym ekranie, np. po „Powrót”.
3. **Przebieg.** Karta na środku ekranu, potem prowadzenie do zakładki Profesje. Tam narrator wskazuje słowa Systemu, potem trzy kwadraty profesji naraz. Na koniec karta o miksturach na wyprawie. „Pomiń objaśnienie” pomija tylko tę część, a komunikat mówi: „Objaśnienie pominięte. Profesje czekają w zakładce Profesje.”
4. **Komunikaty Systemu** (W4, szkic do poprawy). W raporcie z awansem na 10. poziom: „Odblokowano Profesje. Zajrzyj do zakładki Profesje.” (`message` w `data/unlocks.json`). Na górze zakładki Profesje, na stałe: „W czasie pracy postać nie wyrusza na wyprawy, a jej rany się goją. Każdy poziom profesji wzmacnia dwie statystyki. Rozwijać możesz wszystkie profesje, ale naraz pracujesz tylko w jednej.” (`intro` w `data/professions.json`).
5. **Rzemieślnictwo** dostanie własną kwestię, gdy będzie gotowe (krok 3). Do tego czasu narrator mówi: „Na Rzemieślnictwo przyjdzie jeszcze czas.”
6. **Sprawdzanie w trybie testowym.** W Ustawieniach jest „Objaśnienie Profesji od nowa” (`POST /api/test/professions-tour`). Narrator zaczyna od początku, a poziomy profesji zostają.
7. **Na później** (uwagi autora z 27.10, nie do tego etapu):
    - po trzech profesjach: aktywność na częste wejścia, coś w stylu raz na 5 minut, dla nadgorliwych graczy;
    - zamiast Dziennika karta Społeczność z dwiema rozwijanymi zakładkami u góry: Ranking (wszystkie postacie, dwie przełączane kolumny „Najwyższy poziom postaci” i „Najwyższy poziom klasy”) i Gildia (zablokowany moduł na później, od 20. poziomu);
    - miejsce na ekranie na Czat: Globalny, Szept i może językowe, angielski i polski, od razu albo później.


## Rzemieślnictwo od 15. poziomu (27.10.2026)

1. **Później niż reszta** (autor: „zróbmy odblokowanie Rzemieślnictwa na 15 poziomie, żeby później dorobić osobny Samouczek do niego”). Zakładka Profesje dalej otwiera się na 10. poziomie postaci, z Zielarstwem i Alchemią. Do 15. poziomu kwadrat Rzemieślnictwa ma kłódkę i napis „od poz. 15”. Warsztatu wtedy nie ma, zlecenie dostaje odmowę („Rzemieślnictwo odblokujesz na poziomie postaci 15.”), a zadania „Wykonaj…” się nie losują. W grze głównej kwadrat mówi „Wkrótce”, dopóki Rzemieślnictwo nie będzie gotowe. Poziom stoi w danych (`unlockLevel` w `data/professions.json`).
2. **Własne objaśnienie i komunikat Systemu** na 15. poziomie przyjdą razem z krokiem 3 Rzemieślnictwa.

## Profesje w grze (27.10.2026)

1. **Zielarstwo i Alchemia w grze** (autor: „najlepiej - wdróż Zielarstwo i Alchemie z wprowadzeniem na główny serwer, a pozniej te didaskalia wszystkie dodasz”). Od wersji 0.0.9 `PROFESSIONS` = `"on"` także w grze, razem z objaśnieniem narratora. Rzemieślnictwo czeka tam jako „Wkrótce” (`CRAFTING` = `"off"`), a w wersji testowej działa dalej. Awatar Systemu jeszcze nie powstał i dojdzie w osobnym wdrożeniu. *Doszedł w wersji 0.0.11: zob. „Awatar Systemu w grze”.*
2. **Opis Systemowego Warsztatu** ma brzmienie autora: „Posortowane narzędzia zdają się czekać na ich użycie. Ale do tego potrzebne są wprawne ręce. Niektóre wzory będą dla Ciebie dostępne dopiero, gdy System uzna, że sobie poradzisz.”.
3. **Animacje oczekiwania: ocena autora** (autor: „Zielarstwo wersja B, Alchemia się nie zapętla, Rzemieślnictwo super, Walka super”). W Walce postać idzie w miejscu po dróżce, a kraina przesuwa się za nią (side-scroll). Animacja Alchemii dostanie płynną pętlę. Do gry trafią po wdrożeniu profesji, razem z czterema dodatkami, które autor wybrał:
    - rzadkie zdarzenia: przelatujący ptak, większy kłąb pary z kotła, iskra spod młota,
    - pora dnia: scena jaśnieje rano i ciemnieje wieczorem, według godziny w Polsce,
    - postęp przy scenie: z upływem pracy w koszu przybywa ziół, na półce mikstur, na stole gotowych rzeczy,
    - w Walce tło zależy od krainy wyprawy, a w oddali czasem przemknie sylwetka stwora z Bestiariusza.

    Sylwetka w stroju klasy postaci odpada (autor: „zeby sylwetka postaci tam w walce szła to byłoby pewnie za drogo”). *Teraz jest: zob. „Król Błót, nowy Pajęczy wylęg i postać gracza w Walce”, punkt 4.*

## Animacje oczekiwania w grze (27.10.2026)

1. **Gdzie grają.** Scena pracy stoi na górze karty pracy w toku, nad słowami Systemu: Zielarstwo w wersji B na tle Systemowego Zagajnika, Alchemia w pętli tam i z powrotem (autor: „Alchemia jest okey”) i Rzemieślnictwo. W Walce scena stoi nad słowami Systemu o eksploracji w toku: postać idzie w miejscu po dróżce, a kraina regionu wyprawy przesuwa się za nią (Wiatrołomy albo Uroczysko Kamieni). Klatki i prędkości są w `data/animations.json`, a grafiki w `src/client/art/scenes/`. W wersji 0.0.10.
2. **Rzadkie zdarzenia.** Pierwsze przychodzi po 8–15 sekundach, kolejne co 25–70 sekund. Nad Zagajnikiem i w Walce przelatuje ptak, nad kotłem bucha para, a spod młota lecą iskry. W Walce czasem przebiega w oddali cień stwora z Bestiariusza tego regionu wewnętrznego. Ptak i dróżka to proste rysunki w pikselach, do wymiany na grafiki z Retro Diffusion, gdyby autor chciał.
3. **Pora dnia** według godziny w Polsce: świt od 5, dzień od 8, zmierzch od 18, a noc od 21. Rano scena lekko się ociepla, wieczorem ciemnieje, a w nocy jest najciemniejsza.
4. **Postęp przy scenie.** Pod sceną pracy stoi półka na 6 rzeczy. Kosz zbieracza zapełnia się z upływem czasu, bo zioła liczy dopiero raport. Mikstury i przedmioty przybywają tak, jak naprawdę powstają, z liczbą gotowych („× 4”).
5. **Animacje wyłączone** w Ustawieniach zatrzymują sceny na pierwszej klatce i wyłączają rzadkie zdarzenia.
6. **Minuty GitHub Actions** (autor ustawił budżety: Actions 10 $, reszta 5 $; „mam nadzieje ze bedziesz sie pilnował”). Zmiana samych notatek (`*.md`) nie uruchamia testów ani wdrożenia. Gałąź robocza na tym samym commicie co `main` nie powtarza testów. Kod idzie na GitHuba raz na etap.
7. **Na później: kolor skóry postaci** (autor: „Czy istnieje szansa dodania koloru skóry postaci która kierujemy? od jasnej po ciemną i ewentualnie żółte barwy? na poziomie tworzenia postaci i z pozycji zębatki?”). Najtaniej przemalować piksele skóry na gotowych portretach na kilka odcieni, bez nowych grafik. Wybór przy tworzeniu postaci i w Ustawieniach. Przed wdrożeniem próbki do oceny autora. *Zrobione: zob. „Kolor skóry postaci”.*

## Kolor skóry postaci (27.10.2026)

1. **Wybór** (autor: „Najpierw kolor skóry, potem Awatar i deploy”). Przy tworzeniu postaci, pod „Wygląd”, stoi rząd kropek „Kolor skóry”, a popiersia klas od razu pokazują wybrany odcień. W Ustawieniach (zębatka) ten sam rząd zmienia odcień w każdej chwili, za darmo, jak wygląd. Odcień widać na portrecie postaci i w walkach. Raporty sprzed zmiany grają z odcieniem domyślnym.
2. **Sześć odcieni** w `data/skins.json`: Blada, Jasna (portret taki, jak narysowano, domyślny), Śniada, Brązowa, Ciemna i Złocista. Nazwy to szkic do poprawy przez autora. Stare postacie mają odcień Jasna. *Teraz jest ich osiem: zob. punkt 5.*
3. **Bez nowych grafik.** `tools/skin-tones.py` przemalowuje skórę na gotowych portretach: bierze barwy twarzy i szuka ich tylko w obszarach głowy, rąk i stóp każdego portretu, bo te same barwy wracają na skórzanych butach i łatach. Każda barwa skóry trzyma swoje miejsce między cieniem a światłem, na rampie odcienia. Pliki `<klasa>-<wygląd>-<odcień>.png` leżą obok portretów, a walidator pilnuje, żeby żadnego nie brakowało. *Teraz maska jest sprawdzona piksel po pikselu: zob. „Skóra na portretach piksel po pikselu”.*
4. **Migracja 0036** dodaje kolumnę `skin`. Pusta oznacza odcień domyślny.
5. **Żółta i Szara, bez suwaka** (autor: „o ale kolor tak jak zaznaczyłeś to lepiej niż suwak”, „możesz dodać żółtą obok złocistej po prostu”, „i szarą całą”). Zostają kropki. Obok Złocistej stoi Żółta, cała żółta jak słońce (autor: „taką całą żółtą jak słońce”), a na końcu rzędu Szara, cała szara. Złocista zostaje. W Ustawieniach kropki mają cały wiersz pod napisem „Kolor skóry”, bo osiem nie mieści się obok niego. W wersji 0.0.12.
6. **Lepsza maska skóry.** Na Szarej i Żółtej widać było braki: pomarańczowe uszy, nosy i szyje, a u czterech portretów jasne pasma grzywki brały kolor skóry. Teraz skóra głowy rośnie od policzków po połączonych pikselach, razem z odcieniami cienia, a dziury w niej (usta, rumieniec) się domykają. Kolory włosów z czubka głowy nie wchodzą do skóry. Poprawka obejmuje wszystkie odcienie.

## Awatar Systemu w grze (27.10.2026)

1. **Zakup** (autor: „Najpierw kolor skóry, potem Awatar i deploy”). Karta „Awatar Systemu” stoi w zakładce Profesje, pod kwadratami profesji. Kosztuje 10 000 złota (`avatar.price` w `data/professions.json`), płatne raz, na zawsze, od razu po odblokowaniu Profesji. Opis na karcie i komunikaty Awatara to szkic do poprawy przez autora.
2. **Praca obok postaci.** Przy starcie pracy w każdej profesji rząd „Kto pracuje” wybiera Postać albo Awatara. Gdy postać jest zajęta (wyprawa albo inna praca), pracę bierze Awatar. Ma on własną kartę pracy pod swoją nazwą, z odliczaniem, „Przewiń” za Punkty Czasu, „Przerwij” i raportem. Może pracować w tej samej profesji co postać. Zioła, mikstury, części i zasoby są wspólne: Awatar bierze je z plecaka i obozu postaci i tam oddaje to, co zrobi.
3. **Bez rozwoju.** Raport Awatara nie daje XP postaci, poziomów profesji ani statystyk. W miejscu XP stoi „Wykonawca: Awatar Systemu”. Zebrane zioła, mikstury i przedmioty liczą się do zadań narratora.
4. **Scena** pracy Awatara to ta sama zapętlona animacja, w chłodnym świetle Systemu.
5. **Powiadomienie** na telefonie o końcu jego pracy ma tytuł „Praca Awatara Systemu zakończona” i tę samą treść co przy postaci.
6. **Migracja 0037**: kolumna `avatar_at` (chwila zakupu) i tabela `avatar_activities` z pracą Awatara, zbudowana jak `activities` postaci. Raport zapisuje to, co przybyło w plecaku, dodawaniem, więc dwa raporty odebrane naraz (postaci i Awatara) nie zacierają się nawzajem.
7. **Zdania o zajętej postaci** (autor: „Do poprawy zdanie: "Warzenie zacznie po powrocie" na "Warzenie możliwe po powrocie"”). Tak samo w Warsztacie: „Wyrób możliwy po powrocie.”. Gdy wolny Awatar może wziąć pracę, tego zdania nie ma, bo rząd „Kto pracuje” mówi, że pracę wykona Awatar.

## Szybkie Polowanie (27.10.2026)

1. **Zasady** (autor: „możemy wprowadzić Szybkie Polowanie - 3 na dzień eksploracje porównywalne do 15 minutowej eksploracji danego regionu”, „Po prostu przy wyborze lokacji taka opcja, ale od poziomu 5 i to tak jak mówię 3 na dzień”). Od 5. poziomu postaci pod „Wyrusz” w wybranym regionie wewnętrznym stoi przycisk „Szybkie Polowanie”. To wyprawa jak na 15 minut, która kończy się od razu, więc raport przychodzi zaraz po stuknięciu. Są trzy na dzień, liczone od północy w Polsce, jak zadania narratora. Liczby są w `quickHunt` w `data/balance.json`.
2. **Te same wybory co przy „Wyrusz”**: omijanie albo tropienie elit i czempionów, tropienie stworów z zadań i mikstury. Mikstur każdego rodzaju bierze najwyżej tyle, ile walk ma 15-minutowa wyprawa. Postać musi być w domu, bez innej wyprawy ani pracy, a walki zabierają HP jak zwykle.
3. **Raport** ma tytuł „Szybkie Polowanie” i trafia do Dziennika jak zwykły raport z wyprawy. Mikstura szybkości działa w nim tak samo jak na zwykłej wyprawie.
4. **Migracja 0038** dodaje kolumnę `quick_hunts` z dniem i liczbą użytych polowań.

## Czat (27.10.2026)

1. **Zakładka Społeczność** (autor: „Co do Społeczności to zaczniemy od Czatu(globalnego itd.)”). Stoi w dolnym pasku na końcu, na dawnym miejscu Dziennika (z uwag na później: „zamiast Dziennika karta Społeczność”), otwarta od początku gry. Na razie jest w niej sam Czat. Ranking i Gildia (od 20. poziomu) dojdą później u góry ekranu.
2. **Kanał Globalny.** Na razie jest jeden kanał, a jego nazwa stoi pod tytułem („Czat: Globalny”). Rząd kanałów pojawi się, gdy dojdą Szept i kanały językowe. Kanały są w `data/chat.json`.
3. **Kto pisze.** Każda postać z potwierdzonego konta, bez progu poziomu, bo konto i tak wymaga potwierdzonego adresu albo Google. Przy wiadomości stoją imię, poziom i znak klasy postaci z chwili wysłania. *Teraz od 5. poziomu: zob. „Czat od 5. poziomu i moderacja”.*
4. **Zasady przed pierwszą wiadomością.** Sklep Play wymaga, żeby gracz przyjął zasady, zanim coś napisze, i żeby każdą wiadomość dało się zgłosić, a autora dało się ukryć. Przed pierwszą wiadomością stoi karta „Zasady czatu” z przyciskiem „Akceptuję zasady czatu”, raz na konto. Tekst zasad (`texts.rules` w `data/chat.json`) to szkic do poprawy przez autora.
5. **Pisanie.** Do 200 znaków w jednej linii, nie częściej niż co 3 sekundy. Linki są zabronione: adresy z `http`, `www.` i popularnymi końcówkami domen. Słowa z listy `words` (wulgaryzmy) czat zamienia na gwiazdki. Listę autor może poszerzać.
6. **Zgłoś i Ukryj.** Stuknięcie cudzej wiadomości otwiera okienko z „Zgłoś” i „Ukryj wiadomości tej postaci”. Gracz zgłasza wiadomość raz. Ukrycie obejmuje całe konto, także jego późniejsze postacie. Lista „Ukryte postacie” pod czatem ma przy każdej „Pokaż”. Wiadomość zgłoszona przez 3 różnych graczy znika do decyzji autora.
7. **Decyzje autora.** *Teraz decyduje moderacja, a zgłoszenia są na czacie: zob. „Czat od 5. poziomu i moderacja”.* W Panelu autora sekcja „Zgłoszenia z czatu” ma przy każdej wiadomości „Usuń”, „Zostaw”, „Wycisz na dobę” i „Wycisz na stałe”. „Zostaw” przywraca wiadomość i zamyka jej zgłoszenia, a ci sami gracze nie zgłoszą jej ponownie. Przy wyciszonym koncie stoi „Czat wyciszony do…” z przyciskiem „Przywróć czat”. Te same decyzje są w okienku wiadomości na czacie konta autora, a nad czatem autor widzi „Zgłoszenia czekają: N”.
8. **Odświeżanie.** Otwarty czat pyta serwer o nowe wiadomości co 4 sekundy, a gdy nic nie przychodzi, coraz rzadziej, do 10 sekund. Gdy gra jest w tle, nie pyta wcale. Każde pytanie to jeden mały odczyt z bazy, więc koszt mieści się w planie. Durable Objects nie są potrzebne.
9. **Przechowywanie.** Kanał trzyma 300 ostatnich wiadomości, a zgłoszone trzyma do decyzji autora. „Zacznij od nowa” usuwa wiadomości postaci, ale wyciszenie i ukryci gracze zostają przy koncie. Usunięcie konta usuwa wszystko. Do polityki prywatności przed Sklepem Play: czat przechowuje wiadomości graczy, ich zgłoszenia i ukrycia.
10. **Migracja 0039**: tabele `chat_messages`, `chat_reports` i `chat_blocks` oraz kolumny `chat_rules_at` i `chat_muted_until` przy koncie.
11. **Na później**: Szept, kanały językowe, Ranking i Gildia, znak nowej wiadomości na zakładce.

## Czat od 5. poziomu i moderacja (27.10.2026)

1. **Szybkie Polowanie liczy poziom postaci**, nie klasy (autor: „Szybkie Polowanie jest o 5 levelu klasy czy postaci?”). Jego próg stoi teraz we wpisie `quick-hunts` w `data/unlocks.json`, obok innych odblokowań, a nie w `data/balance.json`.
2. **Czat od 5. poziomu postaci** (autor: „Czat niech będzie dostępny od 5. poziomu”). Wpis `community` w `data/unlocks.json`. Do tego czasu zakładka Społeczność ma kłódkę z napisem „poz. 5”, a jej ekran mówi, od którego poziomu się otworzy. Serwer odmawia czatu postaci poniżej progu. Moderacja widzi zgłoszenia na każdym poziomie.
3. **Komunikaty o odblokowaniu** (autor: „niech gra informuje jak w Samouczku o odblokowaniu na 5 lvlu zakładki Społeczności oraz Szybkiego Polowania”, „chyba wypada poinformować jakoś gracza o tej funkcji?”). Raport z awansem na 5. poziom ma dwa komunikaty Systemu, jak przy Statystykach i Profesjach: „Odblokowano Szybkie Polowanie: trzy szybkie wyprawy dziennie, z raportem od razu. Znajdziesz je w Walce, pod „Wyrusz”.” oraz „Odblokowano Społeczność. W zakładce Społeczność porozmawiasz z innymi graczami na czacie.” Oba to szkic do poprawy przez autora. Objaśnienie narratora z nagraniami przyjdzie po zatwierdzeniu jego kwestii przez autora.
4. **Moderacja** (autor: „Za łamanie zasad moderacja może [...]” a nie „autor gry”). Zasady czatu, komunikat po zgłoszeniu („Zgłoszono. Moderacja sprawdzi tę wiadomość.”) i okienko wiadomości mówią o moderacji. Moderacja to konto autora (admin) i moderatorzy.
5. **Moderatorzy.** Autor mianuje ich w Panelu autora przyciskiem „Mianuj moderatorem” przy koncie i odbiera rolę przyciskiem „Odbierz moderację” (migracja 0040, kolumna `chat_moderator`). Moderator na czacie usuwa wiadomości, zostawia zgłoszone i wycisza konta na dobę albo na stałe. Nie decyduje o wiadomościach admina ani innych moderatorów. Wyciszenie zdejmuje tylko autor, w Panelu autora. Moderator nie widzi adresów e-mail ani loginów.
6. **Zgłoszenia na czacie.** Gdy czekają, nad czatem moderacji stoi „Zgłoszenia czekają: N”, a przycisk otwiera okienko z listą i decyzjami. Lista zgłoszeń zniknęła z Panelu autora, bo moderatorzy nie mają do niego wstępu. Admin widzi w okienku login piszącego.
7. **Oznaczenia** (autor: „Trzeba oznaczyć jakoś na czacie Admina (mnie) oraz Moderację”, „Przy nazwie postaci (admin) i (moderator)?”). Przy imieniu postaci stoi „(admin)” w barwie Systemu albo „(moderator)” na zielono. Rola liczy się w chwili czytania, więc odebranie roli zdejmuje oznaczenie także ze starszych wiadomości.

## Czat: profile postaci, kropka na zakładce i najnowsze na górze, zegar Walki (27.10.2026)

1. **Postać po imieniu** (autor: „Powinna być też opcja kliknięcia w nazwę gracza by zobaczyć jego postać - ekwipunek i umiejętności”). Imię przy wiadomości jest przyciskiem, a okienko wiadomości ma też „Zobacz postać”. Okienko postaci pokazuje portret z kolorem skóry, klasę, poziom postaci i klasy, oznaczenie „(admin)” albo „(moderator)”, cały ekwipunek slot po slocie i nauczone umiejętności z poziomem i ścieżką. Stuknięcie przedmiotu rozwija jego właściwości. Nie widać złota, plecaka, obozu ani cen u złomiarza.
2. **Kropka na zakładce** (autor: „Jesli ktos cos napisze na czacie - Społeczność powinna się podswietlac powiadomieniem, przynajmniej póki nie ma Gildii i Rankingu”). Gdy ktoś inny napisze wiadomość, zakładka Społeczność dostaje złotą kropkę, jak Postać przy wolnych punktach. Gra sprawdza to co minutę, gdy jest na ekranie, i od razu po powrocie do niej. Kropka gaśnie po otwarciu czatu. Ostatnią przeczytaną wiadomość pamięta telefon, więc na nowym urządzeniu kropka zapali się raz. Własne wiadomości i wiadomości ukrytych graczy jej nie zapalają. Gdy dojdą Gildia i Ranking, kropka może wymagać zmiany.
3. **Najnowsze na górze** (autor: „nowe czaty powinny pojawiać się ponad starymi a nie pod”). Pole do pisania stoi nad wiadomościami, a nowa wiadomość pojawia się na samej górze. Kto czyta niżej, ma dalej przed oczami te same wiadomości. Najstarsze z ponad 200 na ekranie znikają z dołu. *Cofnięte w wersji 0.0.18: zob. punkt 6.*
4. **Zegar na zakładce Walka** (autor: „taki timer co ma obóz powinien tez byc przy ikonce Walki kiedy postać jest na eksploracji”). W czasie eksploracji napis „Walka” w dolnym pasku zamienia się w czas do końca wyprawy, w barwie Systemu, jak zegar budowy przy Obozie. Gdy wyprawa się skończy, wraca napis „Walka” ze złotą kropką: raport czeka. Praca w profesjach zostaje przy pasku czynności u góry. *Zmienione: zob. punkt 5.*
5. **Zegar na zakładce Profesje** (autor: „i taki sam timer dla Profesji”). W czasie pracy postaci w Zielarstwie, Alchemii albo Rzemieślnictwie napis „Profesje” zamienia się w czas do końca pracy, jak przy Walce. Po końcu wraca napis „Profesje” ze złotą kropką. Kropkę zapala też skończona praca Awatara Systemu, ale jego czasu zakładka nie liczy, bo pracuje obok postaci i ma własną kartę w zakładce.
6. **Najnowsze znów na dole** (autor: „wracamy do poprzedniej wersji czatu - na dole najnowsza wiadomość jednak”). Od wersji 0.0.18 czat wygląda jak w 0.0.15: najnowsza wiadomość jest na dole, a pole do pisania pod nią, przypięte nad dolnym paskiem. Strona sama zjeżdża do nowej wiadomości, chyba że gracz czyta wyżej. Profile postaci, kropka na zakładce i zegary zostają.

## Objaśnienie Społeczności i Szybkiego Polowania (27.10.2026)

Czwarta część wprowadzenia, na 5. poziomie postaci. Kwestie narratora zatwierdził autor („Zatwierdzam powyższe.”). Każda ma po dwie wersje nagrania na stronie odsłuchu. Wersje z uciętym ostatnim słowem nagrały się drugi raz. W grze jest wszędzie wersja 1, z wyboru autora.

1. **Kiedy.** Po raporcie, który dał 5. poziom, na każdym ekranie poza raportem i ekranami postaci. Czeka, aż skończą się objaśnienia Umiejętności i Profesji, jeśli są w toku.
2. **Kolejność.** Karta powitania. Potem wskazanie zakładki Społeczność, którą gracz stuka, i pergamin przy zasadach czatu (u gracza, który je już przyjął: przy polu wiadomości).
3. **Szybkie Polowanie bez przymusu klikania** (autor: „Niech wskaże to Szybkie Polowanie w Samouczku, ale bez przymusu klikania”). *Od wersji 0.0.21 (autor: „w ogole szybkie polowanie jest pominięte”): po „Dalej” przy zasadach czatu gra sama otwiera w Walce miejsce, w którym gracz poluje teraz (spośród odblokowanych to z najwyższym poziomem, do którego postać doszła), i tam narrator wskazuje Szybkie Polowanie. Gdy postać jest wtedy na wyprawie, kwestia czeka i gra przenosi gracza z zakładki Walka, gdy postać wróci. Z czatu przenosi tylko zaraz po zasadach, więc późniejsze wejście na czat zostaje na czacie.* W wersjach 0.0.19 i 0.0.20 ostatnia kwestia czekała, aż gracz sam otworzy któreś odblokowane miejsce w Walce, gdy postać jest w obozie. Wtedy narrator wskazuje pole Szybkiego Polowania pod „Wyrusz”, a pergamin zamyka „Dalej”. Gracz nie musi niczego stukać, a żadne Szybkie Polowanie się nie zużywa. Do tego czasu nie otwierają się inne pergaminy, np. prośba o adres e-mail. Po zasadach czatu narrator nie prowadzi już z powrotem do zakładki Społeczność.
4. **Tryb testowy.** W Ustawieniach jest przycisk „Objaśnienie Społeczności od nowa”, jak przy Umiejętnościach i Profesjach.
5. **Głos od pierwszego dotknięcia** (autor, 0.0.19: „pierwszej kwestii nie czyta, a później co wejdę do gry to mi automat włącza to”). Przeglądarka w telefonie wpuszcza dźwięk dopiero po pierwszym dotknięciu strony. Postać, która ma już 5. poziom, dostawała powitanie zaraz po wejściu do gry, więc karta była cicha. Bez „Dalej” wracała przy każdym wejściu, znów bez głosu. Od wersji 0.0.20 kwestia rozdziału z nagraniem czeka na pierwsze dotknięcie ekranu po wejściu do gry. Dotknięcie najpierw robi swoje, np. otwiera zakładkę, a chwilę później narrator zaczyna mówić. To samo dotyczy rozdziałów Umiejętności i Profesji. Rozdział przerwany w połowie toczy się dalej od tej kwestii, na której stanął.

## Pole wiadomości na dole ekranu (27.10.2026)

Autor: „tylko wtedy input wiadomości też na dole”. Czat sięga od nagłówka do dolnego paska. Pole wiadomości stoi zawsze na dole ekranu, a wiadomości tuż nad nim, także gdy jest ich tylko kilka. Lista ukrytych postaci przeszła nad czat.

## Testuj samouczki (27.10.2026)

Autor: „Zbuduj opcję w serwerze testowym "Testuj samouczki" i wrzuć tam wszystkie aktualnie dostępne”.

1. **Gdzie.** Tylko na wersji testowej (`TUTORIAL_TESTS` w `wrangler.jsonc`), dla kont z trybem testowym. W Ustawieniach jest przycisk „Testuj samouczki”. Pojedyncze przyciski „Objaśnienie … od nowa” przeszły tam, więc w grze ich już nie ma.
2. **Lista** w kolejności, w jakiej gra je przynosi: Wprowadzenie, Objaśnienie Społeczności i Szybkiego Polowania (5. poziom postaci), Objaśnienie Umiejętności (10. poziom klasy, postać zapomina wybrane umiejętności) i Objaśnienie Profesji (10. poziom postaci). Każde ma „Od nowa”. Objaśnienie, do którego postać jeszcze nie doszła, ma przycisk wyłączony.
3. **Wprowadzenie** potrzebuje nowej postaci. Postać gracza czeka z boku, poza grą, a konto tworzy postać testową, która dostaje wprowadzenie od pierwszej karty. W „Testuj samouczki”, a także na ekranie tworzenia postaci, jest wtedy przycisk „Wróć do postaci …”. Postać testowa znika na dobre, a wraca ta, która czekała, ze wszystkim, co miała. Z boku czeka najwyżej jedna postać naraz.

## Społeczność jako lista: Czat, Znajomi z Upominkiem, Ranking postaci (27.10.2026)

1. **Lista rozwijana** (autor: „robimy ze Społeczności listę rozwijaną / Czat w środku z możliwością wyciszenia powiadomień, do tego Ranking postaci [...] Gildie jako placeholder z zaznaczeniem "Wkrótce" oraz Drużyna jako placeholder z zaznaczeniem "Wkrótce"”, „Do rozwijanej listy Społeczności dodaj też "Znajomi"”). Pod tytułem jest pasek z częścią, którą gracz ogląda. Stuknięcie rozwija listę: Czat · Globalny, Znajomi, Ranking postaci oraz Gildie i Drużyna z napisem „Wkrótce”, których nie da się jeszcze wybrać. Pasek zostaje pod górną belką, gdy strona się przewija, więc lista jest pod ręką także pod długim czatem. Kropka przy części mówi, że coś w niej czeka. Kropka na zwiniętym pasku mówi, że coś czeka w innej części. Społeczność otwiera się na części, w której coś czeka, a gdy nic nie czeka: na tej, którą gracz oglądał ostatnio (pamięta to telefon). Zanim narrator pokaże zasady czatu, otwiera się zawsze na Czacie. Części są w `data/community.json`.
2. **Wyciszenie powiadomień czatu.** Przy Czacie obok paska jest dzwonek. Wyciszony czat nie zapala kropki na zakładce Społeczność ani przy Czacie na liście. Wybór pamięta telefon. Zaproszenia i Upominki zapalają kropkę dalej.
3. **Ranking postaci** (autor: „wyszczególnione kolumny dwie pod wzgledem levelu postaci i klasy”). Tabela ma kolumny Poziom (postaci) i Klasa (poziom klasy). Przełącznik „Poziom postaci / Poziom klasy” ustawia kolejność, a kolumna, według której idzie kolejność, jest złota. Przy równym poziomie wyżej stoi postać z większym doświadczeniem. Tabela pokazuje 100 najwyższych postaci, a wiersz gracza jest w barwie Systemu. Nad tabelą stoi „Twoje miejsce: N” spośród wszystkich postaci, także gdy gracz jest poza setką. Stuknięcie imienia otwiera kartę postaci. Ranking jest od poziomu Społeczności, jak czat.
4. **Znajomi** (autor: Upominek „Znajomym”, zaproszenie z karty postaci, np. po stuknięciu imienia na czacie). W karcie postaci (po stuknięciu imienia na czacie, w Rankingu albo w Znajomych) jest „Dodaj do znajomych”. Druga postać przyjmuje albo odrzuca zaproszenie w Znajomych albo w karcie. Gdy dwie postacie zaproszą się nawzajem, od razu są znajomymi. W Znajomych można też zaprosić postać po imieniu, bo nie każdego da się znaleźć na czacie albo w Rankingu. Zaprosić można tylko postać, która ma już Społeczność. Znajomych jest najwyżej 30 (autor: „Lista znajomych na max 30 osób”), a wysłane zaproszenia liczą się do tego limitu. „Usuń ze znajomych” w karcie postaci, po potwierdzeniu, kończy znajomość u obu stron.
5. **Upominek** (autor: „Odbiorca dostaje 1 Punkt Czasu, i troche losowo - złota lub surowców. Dzienny odbiór max 10 prezentów i taki limit na Punkty Czasu z tej aktywności.”). Każdemu znajomemu można wysłać jeden Upominek na dobę (doba jak w zadaniach dziennych, czasu warszawskiego). Upominek daje 1 Punkt Czasu i, pół na pół, złoto (20 i po 4 za każdy poziom odbiorcy) albo jeden z surowców obozu (4 i po 0,4 za poziom). Zawartość losuje się przy wysłaniu, według poziomu odbiorcy. Odbiorca bierze wszystkie naraz przyciskiem „Odbierz upominki”, najwyżej 10 na dobę, więc z Upominków ma najwyżej 10 Punktów Czasu dziennie. Reszta czeka na kolejne dni, do 7 dni od wysłania. Liczby są w `data/community.json`.
6. **Kropka na zakładce Społeczność** zapala się też dla zaproszeń i Upominków do odebrania, ale tylko dla tylu Upominków, ile postać może dziś jeszcze odebrać.
7. **Migracja 0041**: tabele `friends` i `gifts`. „Zacznij od nowa” i usunięcie konta usuwają też znajomości i Upominki postaci.

## Mizerykordia i Kordzik dla Cienia (27.10.2026)

1. **Druga ręka Cienia** (autor: „to bez sensu że Cień, nieużywający łuku może zakładać kołczan a nie tylko Łucznik - musimy wymyślić dla niego nowy przedmiot i zamienić graczom Cieniom, którzy mają założony Kołczan na adekwatny do klasy przedmiot”). Cień nosi w drugiej ręce Mizerykordię (wybór autora), a od 10. poziomu klasy Kordzik. Mają te same liczby co Kołczan i Sajdak: stałą Zręczność (`statFactor` 0,8 i 0,84), a Kordzik do tego +6–10. Mizerykordia nie zadaje ciosów, tylko daje Zręczność, jak Kołczan. Kołczan i Sajdak należą teraz tylko do Łucznika.
2. **Grafiki** z Retro Diffusion: Mizerykordia w wersji 2, Kordzik w wersji 1 (wybór autora).
3. **Migracja 0042**: Kołczan i Sajdak Cienia, założone albo w plecaku, stają się Mizerykordią i Kordzikiem z tymi samymi liczbami i afiksami, jak przy zestawie Kleryka. Łucznikom nic się nie zmienia.

## Prywatne wiadomości (27.10.2026)

1. **Zakładki czatu** (autor: „Niech kliknięcie w nazwe drugiego gracza pozwoli też wybrać opcję Prywatna wiadomość, a w czacie niech pojawiają się zakładki poza Globalną to z konkretnym graczem (tylko oni widzą te rozmowę)”). Pod listą Społeczności czat ma rząd zakładek: Globalny i po jednej dla każdej prywatnej rozmowy, od najświeższej. Zakładka z nową wiadomością ma kropkę. Na liście Społeczności czat nazywa się teraz po prostu „Czat”.
2. **„Prywatna wiadomość”** jest w karcie postaci (po stuknięciu imienia na czacie, w Rankingu albo w Znajomych) i w okienku cudzej wiadomości. Otwiera zakładkę rozmowy z tą postacią, także zanim padnie pierwsza wiadomość. Rozmowę widzą tylko te dwie postacie. Napisać można do każdej postaci, która ma już Społeczność.
3. **Zasady jak na czacie.** Obowiązują te same zasady czatu, przyjęte raz, wyciszenie, odstęp między wiadomościami, zakaz linków i gwiazdki. Rozmowa trzyma 100 ostatnich wiadomości, a zakładki ma najwyżej 20 rozmów (`data/chat.json`).
4. **Zgłoś i Ukryj** (Sklep Play). Prywatną wiadomość też można zgłosić, a zgłoszoną widzi moderacja, z dopiskiem „prywatna”. Ukrycie gracza ukrywa też jego prywatne wiadomości i zakładkę rozmowy, a dopóki trwa, żadne z nich nie napisze do drugiego. Zasady czatu mają nowe zdanie: „Prywatną rozmowę widzicie tylko Wy dwoje, ale zgłoszoną wiadomość przeczyta też moderacja.” To szkic do poprawy przez autora.
5. **Kropka na zakładce Społeczność** zapala się od nowej prywatnej wiadomości także wtedy, gdy dzwonek wycisza Globalny. Przeczytane rozmowy pamięta telefon, jak przy Globalnym.
6. **Migracja 0043**: kolumna `recipient_id` w wiadomościach czatu. „Zacznij od nowa” i usunięcie konta usuwają też rozmowy postaci, w obie strony.

## Osłona many: stała część many, więcej osłony z poziomem (27.10.2026)

Autor: „Czy przypadkiem nie jest tak ze Osłona many z kolejnymi levelami ogranicza używanie drugiej umiejetnosci przez co Mag walczy gorzej? Może niech pobiera stałą wartość Many np.30% ale z kazdym poziomem umiejetnosci daje z tego wiecej osłony?”. Symulacja pokazała, że mana nie ograniczała drugiej umiejętności, bo Mag ma jej dużo więcej, niż zużywa w walce. Autor zdecydował jednak o zmianie („Wdrażaj też nową Osłonę Many”).

1. Osłona bierze zawsze 30% maks. many (wcześniej od 30% na 1. poziomie do 50% na 20.).
2. Każdy punkt wziętej many zatrzymuje teraz od 1 punktu obrażeń na 1. poziomie do 1,7 na 20. (`ratio` w `data/skills.json`). Na 20. poziomie osłona jest więc tak duża jak dotąd, a Magowi zostaje 70% many zamiast 50%.
3. Opis umiejętności: „…zamienia ją w osłonę, która zatrzymuje obrażenia równe {ratio%} wziętej many”. Zapis walki: „Osłona za X many przyjmie Y obrażeń.”

## Potwierdzenie wymiany u ducha ognia (27.10.2026)

Autor: „Wymiana złota na zasoby w ognisku potrzebuje dodatkowego okna potwierdzenia”. Stuknięcie zasobu przy duchu ognia otwiera teraz okienko „Wymiana u ducha ognia” z ceną i tym, co gracz dostanie, np. „Duch ognia weźmie 7 złota i odda: drewno +1.”, z przyciskami „Anuluj” i „Wymień”. Złoto znika dopiero po „Wymień”.

## Wymiana (27.10.2026)

Autor: „Dodaj też opcję Wymiana po kliknięciu na Postać innego gracza lub z z pozycji listy znajomych. Pozwalaj tylko na to, jeśli obaj są online. Jeśli nie - wyświetl komunikat "Gracz xxx nie jest online". Mogą gracze wymieniać przedmioty (włącznie z ziołami i miksturami) i złoto. Myślę, że to okey ale upewnij się. Jeśli jeden z graczy kliknie "zatwierdź wymiane" drugi nie zmieni tego co miało jej podlegać, może ją tylko odrzucić.” Dalej: „Proponowanie wymiany jednemu graczowi zbyt wiele razy pod rząd z odrzuceniem (kilkanaście) blokuje tę opcje na paręnaście minut z automatu. Gracz może też zablokować konkretnego gracza pod tym względem, a także całkowicie wyłączyć chęć handlu.” I: „Jeśli gracz w wyniku wymiany wejdzie w posiadanie mikstury jakiejś przed odblokowaniem jej receptury albo w ogóle nawet Profesji Alchemii to nie może jej użyć”.

1. **Gdzie.** Przycisk „Wymiana” jest w karcie postaci innego gracza (po stuknięciu imienia na czacie, w Rankingu albo w Znajomych) i w wierszu każdego znajomego. Wymiana ma własny ekran (`#/wymiana`), przy którym świeci zakładka Społeczność.
2. **Online.** Gracz jest online, gdy gra była otwarta na ekranie telefonu w ciągu ostatnich 2 minut (`trade.onlineSeconds` w `data/community.json`). Strona pyta serwer co 15 sekund zamiast co minutę, a serwer zapisuje ten czas najwyżej co 30 sekund (`users.seen_at`). Gdy drugi gracz nie jest online, propozycja kończy się komunikatem „Gracz X nie jest online.” Ten sam komunikat pada przy przyjęciu propozycji, gdy proponujący zdążył wyjść z gry.
3. **Przebieg.** Drugi gracz dostaje okienko „Propozycja wymiany” z „Odrzuć” i „Przyjmij”, w którymkolwiek miejscu gry jest, gdy tylko narrator skończy. Propozycja czeka też w banerze na górze Społeczności. Bez odpowiedzi przepada po 2 minutach (`proposalSeconds`). Po przyjęciu oboje składają oferty: złoto, przedmioty z plecaka (najwyżej 10, `maxItems`; założonych nie), zioła i mikstury. Zapisana oferta od razu pokazuje się drugiej stronie, bo ekran wymiany pyta serwer co 2 sekundy. Wymiana, w której przez 15 minut nic się nie dzieje (`idleMinutes`), przepada.
4. **Zatwierdzenie.** Kto pierwszy zatwierdzi wymianę, zamraża obie oferty. Druga strona może ją już tylko przyjąć albo odrzucić. Oba zatwierdzenia pytają najpierw w okienku, co gracz odda, a co dostanie. Zatwierdzenie dotyczy wersji ofert, którą gracz widział. Gdy druga strona zmieniła ofertę chwilę wcześniej, serwer odpowiada „Oferta właśnie się zmieniła. Sprawdź ją jeszcze raz.”, więc nikt nie podmieni oferty w ostatniej chwili.
5. **Wszystko albo nic.** Drugie zatwierdzenie przenosi wszystko w jednej paczce zapytań D1. Gdy czegoś z ofert już nie ma, np. przedmiot sprzedano albo złoto wydano, nic się nie przenosi, a wymiana przepada z komunikatem. Gdy w czyimś plecaku zabraknie miejsca, wymiana czeka, aż ktoś zwolni miejsce albo ją odrzuci.
6. **Obie postacie w obozie.** Jak sprzedaż i wyrzucanie, Wymiana czeka na powrót postaci z wyprawy albo pracy profesji. Gracz dostaje te same komunikaty co przy plecaku, a o drugiej postaci: „Postać X jest teraz poza obozem. Wymienicie się, gdy wróci.” Wyprawa liczy walki dopiero przy odbiorze raportu i wtedy zużywa zabrane mikstury, więc plecak nie może się zmienić w jej trakcie.
7. **Odrzucenia z rzędu.** Gdy 12 ostatnich propozycji jednej postaci dla tej samej postaci odrzucono albo przepadły (`rejectionsInRow`), kolejną zaproponuje dopiero 15 minut po ostatniej (`pauseMinutes`). Komunikat mówi, ile minut zostało.
8. **Blokady.** W karcie postaci są przyciski „Zablokuj wymianę” i „Odblokuj wymianę”. Blokada dotyczy gracza, także jego przyszłych postaci. Zablokowany gracz widzi „X nie przyjmuje wymian.”, a ten, kto blokuje, też mu wymiany nie zaproponuje, dopóki go nie odblokuje. W Ustawieniach jest przełącznik „Wymiana” (Włączona albo Wyłączona) i lista zablokowanych graczy z „Odblokuj”.
9. **Mikstury bez receptury.** Miksturę można wypić albo zabrać na wyprawę tylko ze znaną recepturą: z otwartą Alchemią na poziomie co najmniej poziomu mikstury. Mikstura z wymiany czeka więc w plecaku, a jej karta mówi: „Tej mikstury nie użyjesz, póki nie poznasz jej receptury w Alchemii.” Można ją sprzedać, wyrzucić albo oddać dalej. Oferta drugiej strony mówi o tym przed wymianą. Uwarzone mikstury zawsze mają znaną recepturę, bo poziom Alchemii nie spada.
10. **„Upewnij się”.** Wymiana przedmiotów, ziół, mikstur i złota jest w porządku, z dwoma zabezpieczeniami spoza listy autora:
    - Przedmiot z wymiany założy się dopiero od jego poziomu postaci (403 `trade_level`). Bez tego postać z dalszej gry mogłaby wyposażyć nową postać, np. swoją drugą, i ta przeskoczyłaby trudność początku. Karta przedmiotu i oferta mówią: „Założysz go od poziomu postaci N.”
    - Punkty Systemu, przyszła waluta za pieniądze, i Punkty Czasu nie wchodzą do wymiany, żeby nie dało się nimi handlować poza grą. Surowce obozu, materiały i części też nie, bo nie było ich na liście autora.
    Złoto przechodzi bez ograniczeń, więc gracz z dwoma kontami może przesłać złoto nowej postaci. Wymaga to jednak obu graczy online i obu postaci w obozie.
11. **Migracja 0044**: tabele `trades` (stan, obie oferty, `version`, kto zatwierdził) i `trade_blocks`, a w `users` kolumny `trade_off` i `seen_at`. „Zacznij od nowa” i usunięcie konta usuwają też wymiany postaci, a usunięcie konta i blokady.

## Rzemieślnictwo, krok 2: ulepszone wyroby, zwoje, wzory z rozbiórki i dzienny limit części (27.10.2026)

Krok 2 z planu w „Rzemieślnictwo: odpowiedzi autora” (R8, R14–R19), na razie tylko w wersji testowej (`CRAFTING` w grze jest dalej `"off"`). Liczby to propozycja do zmiany przez autora.

1. **Ulepszone wyroby** (R8, R17). Od 10. poziomu Rzemieślnictwa wyrób może wyjść od razu ulepszony (`upgrades` w `workshop` w `data/professions.json`):
    - +1 od 10. poziomu: 10%, rośnie o 0,5 pkt proc. na poziom, do 40%;
    - +2 od 25.: 5%, +0,25 pkt na poziom, do 20%;
    - +3 od 40.: 3%, +0,15 pkt, do 10%;
    - +4 od 60.: 2%, +0,1 pkt, do 5%;
    - +5 od 80.: 1%, +0,05 pkt, do 2%.
    Serwer losuje od najwyższego ulepszenia w dół, a pierwsze, które wypadnie, zostaje. Na 100. poziomie ok. 60% wyrobów wychodzi ulepszonych, w tym 2% na +5. Warsztat pokazuje te szanse nad przyciskiem „Zacznij wyrób”. Poniżej 10. poziomu serwer niczego nie losuje, więc wyroby z kroku 1 się nie zmieniają.
2. **Zwój ochronny** (R18). Od 25. poziomu Warsztat ma kartę „Zwój ochronny”. Jeden zwój to 2 Odłamki i godzina na 1. poziomie, krócej z poziomem jak przy wyrobie (45,6 minuty na 25. poziomie). Jedno zlecenie ma od 1 do 5 zwojów. Zwój zawsze się udaje, nie bierze zasobów obozu ani miejsca w plecaku i nie liczy się do zadań „Wykonaj…”. Postać trzyma zwoje w liczniku `scrolls`.
3. **Zwój na Kowadle.** Gdy przedmiot może się rozpaść (od +7), karta przedmiotu ma pole „Użyj Zwoju ochronnego (masz N)”. Pole jest domyślnie puste, żeby zwój nie przepadł bez woli gracza. Zwój przepada przy próbie. Rozpad staje się zwykłą porażką ze spadkiem o poziom, a gracz widzi: „Zwój ochronny uchronił przedmiot przed rozpadem.”. Poniżej +7 zwój nie jest potrzebny i serwer go nie bierze.
4. **Wzory z rozbiórki** (R14). Rozebranie przedmiotu późniejszej bazy (od 10. poziomu klasy, np. Pałasza) od razu odsłania jej wzór w Warsztacie, bez czekania na 10. poziom profesji (`patterns`). Karta przedmiotu zapowiada to przy Rozbiórce, a kafelek wzoru ma dopisek „z rozbiórki”. Wzór dochodzi tylko wtedy, gdy Rzemieślnictwo jest włączone.
5. **Rozbiórka wyrobu** (R19). Wyrób pamięta, ile części zużył i z jakim ulepszeniem wyszedł (`crafted`). Na Stole rozbiórki oddaje połowę tych części, zaokrągloną w dół, i po jednej za każde ulepszenie z Kowadła ponad to z Warsztatu. Łup rozbiera się jak dotąd.
6. **Ceny złomiarza** (R16):
    - Wyrób bierze o jedną część więcej co 10 poziomów przedmiotu (`partsLevelStep`): miecz na 1. poziomie 6 części, na 15. poziomie 7, na 500. poziomie 56. Zasoby obozu liczą się dalej od części slotu.
    - Złomiarz płaci za wyrób jak za łup tej rzadkości. Za ulepszenia, z którymi wyrób wyszedł, nie dopłaca, bo nikt za nie nie płacił złotem.
    - Test sprawdza zasadę autora: części na wyrób kosztują w Skupie złomu więcej, niż złomiarz za niego płaci, dla każdej rzadkości, slotu, poziomu Skupu i poziomu przedmiotu od 1 do 510.
    - Bez dodatkowych części na wysokich poziomach zasada by nie działała. Np. rękawice na 500. poziomie kosztowały 3 części za 69 złota, a złomiarz płaciłby za nie 1000 złota.
7. **Dzienny limit części** (R15, autor: „30-20-10 itd.”). Złomiarz sprzeda postaci dziennie najwyżej 30 Ścinków, 20 Rzemieni, 10 Okuć, 5 Odłamków, 3 Bursztyny, 2 Krwawniki i 1 Gwiezdny odprysk (`daily` w `data/buildings.json`). Doba liczy się od północy czasu polskiego, jak u ducha ognia. Przy każdej części lada pokazuje „Dziś zostało: N z M”, a przyciski zakupu ponad limit są wyłączone.
8. **Migracja 0045**: w `characters` kolumny `scrolls`, `patterns`, `shop_day` i `shop_parts`.
9. **Co zostaje na krok 3:** nowa nazwa Stołu rzemieślniczego z kwestią narratora, tło Warsztatu, dźwięki młota i nieudanego wyrobu, objaśnienie narratora na 15. poziomie i komunikat Systemu. Każda z tych rzeczy czeka na zatwierdzenie autora, a Rzemieślnictwo trafi do gry po nich.

## Rzemieślnictwo, krok 3: objaśnienie narratora na 15. poziomie i komunikat Systemu (28.10.2026)

1. **Rozdział `crafting`** w `data/tutorial.json` ma cztery kwestie z tekstami zatwierdzonymi przez autora: powitanie, prowadzenie do zakładki Profesje, wskazanie sekcji Wzory w Systemowym Warsztacie i zakończenie. Zaczyna się, gdy postać ma otwarty Warsztat (15. poziom postaci, Rzemieślnictwo włączone) i skończyła wcześniejsze rozdziały: Umiejętności, Profesje i Społeczność. Kto go pominie, widzi: „Objaśnienie pominięte. Rzemieślnictwo czeka w zakładce Profesje.”, na wzór pozostałych rozdziałów.
2. **Komunikat Systemu na 15. poziomie:** „Odblokowano Rzemieślnictwo. Systemowy Warsztat czeka w zakładce Profesje.” (zatwierdzony przez autora). Pojawia się tylko tam, gdzie Rzemieślnictwo działa (`feature: "crafting"` w `data/unlocks.json`). W grze, gdzie `CRAFTING` jest jeszcze `"off"`, go nie ma.
3. **Testuj samouczki** ma wiersz „Objaśnienie Rzemieślnictwa”, od 15. poziomu.
4. **Czeka na autora:** wybór nagrań czterech kwestii na stronie odsłuchu, szkic tła Warsztatu (1, 2 albo 3) i dźwięki udanego i nieudanego wyrobu. Rzemieślnictwo trafi do gry po tych wyborach.

## Potwory: co najmniej dwa własne stwory w każdym regionie wewnętrznym (28.10.2026)

Autor: „Każda kraina musi mieć chociaż 2 unikalne postaci, bo inaczej Bestiariusza nie ma sensu. Może być potworów mniej w lokacji, ale niech się różnią. To trzeba zastosować do wszystkich krain i regionów.”

1. **Nowy podział** (`data/regions.json`). Każdy zwykły stwór żyje teraz w jednym regionie wewnętrznym:
    - Skraj Wiatrołomów: wilk, borsuk;
    - Lisie Jary: lis, kuna;
    - Krucze Wykroty: kruk, puszczyk (kruki częściej parami i trójkami);
    - Żmijowe Zwalisko: żmija, szerszenie;
    - Dzicza Głusza: dzik, jeleń, a do tego czempion odyniec;
    - Omszałe Głazy: kamiennik, gacek;
    - Pajęczy Parów: krzyżak;
    - Rysia Grań: ryś, puchacz;
    - Wilcze Kręgi: wadera, basior;
    - Serce Uroczyska: niedźwiedź, a do tego czempion bazyliszek.
   Elity zostają, jak były: Błędnica, Płanetnik i Licho. Opisy regionów wewnętrznych mówią teraz o ich stworach.
2. **Pajęczy Parów** ma na razie jednego własnego stwora. Uroczysko ma 8 zwykłych stworów i czempiona na 5 regionów wewnętrznych, więc dwóch na każdy nie starcza. Pierwszy nowy stwór Uroczyska trafi do Parowu. Test pilnuje dwóch własnych stworów wszędzie poza nim.
3. **Basior** dostał przymiotnik „Basiorowy, Basiorowa, Basiorowe” (`data/affixes.json`), bo w każdym miejscu musi żyć stwór z przymiotnikiem do nazw przedmiotów. Przy dwóch–trzech stworach w miejscu trzecia i dalsze właściwości przedmiotu mogą powtórzyć stwora, ale nazwa przedmiotu (pierwszy przymiotnik i pierwsza końcówka) nigdy nie ma jednego stwora dwa razy.
4. **Równowaga** (symulacja, 1000 wypraw na wiersz, przed i po):
    - wyprawy 30-minutowe: XP na godzinę na poziomach 1–8 bez zmian w granicach kilku procent, na 12. poziomie o ok. 5% mniej, na 23. o ok. 13% więcej, na 48. o ok. 13% więcej; omdlenia wszędzie poniżej 1,5%;
    - wyprawy 2-godzinne na 38–48. poziomie: omdlenia jak dotąd w granicach 1–2 pkt proc., Mag na 43. poziomie w Wilczych Kręgach ok. 10% (wcześniej ok. 9%). Basior przychodzi tam rzadziej niż wadera, żeby Mag nie mdlał częściej.
5. **Zadania.** Mniej stworów w miejscu to mniej zadań „Pokonaj…”. Doszedł rodzaj „Pokonaj łącznie N stworów.” (`killAny` w `data/quests.json`), dzienny i tygodniowy, liczony z walk jak zwykłe zadania ze stworami i tak samo pomijany w miejscach za łatwych dla postaci. Nowa postać ma więc 4 zadania na okres (oba stwory Skraju, wszystkie stwory i czas wypraw), a 5 od postawienia Stołu rozbiórki.

## Bestiariusz: szanse spotkania i Bestiariusz całej krainy (28.10.2026)

Autor: „Dodajmy też standardowe procentowe możliwości spotkania danego stwora w Bestiariuszu bez włączenia tropień konkretnych (nie trzeba o tym informować gracza czego tyczą się procenty) i to przed odblokowaniem (spotkaniem danego stwora)”. I: „zrób też Bestiariusz główny dla danej krainy głównej ze wszystkimi stworami. Jak ktoś odblokuje cały Bestiariusz krainy głównej np. Wiatrołomy to dostaje ze skrzyni przy tej krainie troche wiecej niz z ostatniego regionu odpowiednich zasobów”.

1. **Procenty.** Każdy stwór na liście regionu wewnętrznego ma szansę, że przyjdzie w jednej walce wyprawy 30-minutowej (`chanceMinutes` w `bestiary` w `data/balance.json`). Liczą się wszystkie spotkania miejsca, jak na jego najwyższym poziomie, a tropienie stworów z zadań, „Trop elity i czempiony” i unikanie elit są wyłączone. Silnik liczy szanse tak, jak losuje spotkania (`meetingChances`): najpierw czempion, potem elita, potem trudne spotkanie, a na końcu zwykłe. Test porównuje je z 40 000 losowań. Stwór dwa razy w jednej grupie liczy się raz, więc procenty stworów sumują się do ponad 100%. Procent widać od razu, także przy cieniu nieznanego stwora, bez opisu, czego dotyczy. Od 10% w górę jest w pełnych procentach, poniżej z jednym miejscem po przecinku, np. „0,5%”.
2. **Bestiariusz krainy** jest na ekranie krainy (Walka, potem np. Wiatrołomy), nad kołami regionów wewnętrznych. Ma wszystkie stwory jej regionów: zwykłe w kolejności miejsc, potem elity i czempion, każdy z poziomami z całej krainy (np. Błędnica 6–16). Procentów tu nie ma, bo każdy region wewnętrzny ma inne.
3. **Skrzynia krainy** daje o jedną czwartą więcej niż skrzynia jej ostatniego regionu wewnętrznego (`landFactor` 1,25), złoto zaokrąglone do 5:
    - Wiatrołomy: 305 złota, 56 Punktów Czasu i 25 Punktów Systemu (Dzicza Głusza: 245, 45 i 20);
    - Uroczysko Kamieni: 750 złota, 119 Punktów Czasu i 25 Punktów Systemu (Serce Uroczyska: 600, 95 i 20).
   Otwiera się raz, gdy postać pozna wszystkie stwory krainy, niezależnie od skrzyń regionów wewnętrznych. Otwarte skrzynie krain zapisują się w tej samej liście co skrzynie regionów (`bestiary`, po id krainy), więc migracja nie była potrzebna.

## Sklep Systemu: miejsce w górnym pasku (28.10.2026)

Autor: „tu zostawiamy miejsce na Sklep Systemu na razie tylko jakąś specjalną ikonę i zablokowane kłódką jak Rdzeń, a po kliknięciu komunikat "Sklep Systemu dojdzie w jednej z kolejnych aktualizacjach"”.

1. Obok twarzy narratora, przed złotem, stoi ikona straganu ze znakiem Systemu, przygaszona, z kłódką w rogu jak przy Rdzeniu. Stuknięcie pokazuje: „Sklep Systemu dojdzie w jednej z kolejnych aktualizacji.” Końcówka „aktualizacji” jest poprawiona z „aktualizacjach”, tak jak w komunikacie zablokowanych modułów.
2. Odznaka klasy w górnym pasku skraca teraz samą nazwę klasy, a jej poziom zawsze widać, np. „WOJOW… 42”. Wcześniej na wąskim telefonie znikał numer.

## Środek gry: wolniejsze poziomy i silniejsze stwory (28.10.2026)

Autor: „krzywą wzrostu wyzwania musimy bardzo delikatnie podwyższyć, bo gram Magiem a lecę jak burza ze wszystkim, szczegolnie od momentu posiadania mikstur i umiejętności coraz silniejszych (mid-game) / Za szybko też jednak troche się te lvle wbijają, pomimo że hardcap jest wysoko. I oczywiscie chodzi o midgame, bo early musi byc latwiejssze”. Potem zrzut z Serca Uroczyska na 42. poziomie z „Zagrożenie: niskie” i: „zajebane tym expem po sufit jest na dluzszych wyprawach i w ogole”.

1. **Poziomy** (`midGame` w `progression` w `data/balance.json`). Do 17. poziomu nic się nie zmienia: pierwsze poziomy dalej trwają po ok. 20 minut. Od 17. poziomu każdy trwa coraz dłużej niż dotąd, równo aż do dwóch razy dłużej na 50. Potem to spowolnienie maleje i od 100. poziomu krzywa jest dawna. Poziom 500 dalej zajmuje ok. doby, a żaden poziom nie trwa krócej od poprzedniego (pilnuje tego test). Godziny eksploracji na jeden poziom, przed i po:
    - 20. poziom: 0,40 → 0,44 h;
    - 30.: 0,68 → 0,95 h;
    - 40.: 1,00 → 1,69 h;
    - 45.: 1,16 → 2,14 h;
    - 50.: 1,33 → 2,66 h;
    - 100. i 500.: bez zmian (3,3 h i 26,5 h).

   Od 1. do 50. poziomu to razem ok. 47 godzin eksploracji zamiast ok. 31.
2. **Stwory** (`midGame` w `monsters`). Od 15. poziomu stwory biją mocniej i mają więcej HP, równo aż do +25% obu na 50. poziomie, np. ok. +11% na 30. i ok. +18% na 40. Dotyczy to też elit i czempionów. Stwory do 15. poziomu są jak dotąd.
3. **Serce Uroczyska** ma znowu pary niedźwiedzi: 30 pojedynczych na 22 pary, a w trudnych spotkaniach 10 par i 2 trójki. Żeby XP na godzinę w miejscach 36–50 trafiało w nową krzywą, a nie wyżej, zmalały nagrody (XP, złoto):
    - niedźwiedź: 1,8 → 1,0 i 1,2 → 0,9;
    - wadera: 1,1 → 0,95 i 0,9 → 0,8;
    - basior: 1,5 → 1,3 i 1,0 → 0,9;
    - ryś: 1,2 → 1,05 i 0,9 → 0,8;
    - puchacz: 1,0 → 0,9 i 0,6 → 0,55.
4. **Symulator** (`tools/simulate.mjs`) liczy teraz typową postać z umiejętnościami. Wydaje Punkty Umiejętności najpierw na pierwszą umiejętność klasy do 20., potem na drugą. Bez nich niedoszacowywał graczy środka gry.
5. **Wyniki symulacji** (300 wypraw na wiersz):
    - Typowa postać z umiejętnościami w Sercu Uroczyska na 50. poziomie, wyprawa 30-minutowa: kończy z 63–96% HP, omdlenia do 1%. Na 46–48. poziomie przy wyprawach 2-godzinnych Cień mdleje w 4–11% wypraw, Wojownik w ok. 5%, Mag prawie nigdy.
    - Postać z ulepszeniami z Kowadła i miksturami nie mdleje, ale traci więcej HP niż przedtem.
    - Mag na 42. poziomie z ulepszeniami i miksturami, 2 godziny w Sercu: przedtem kończył z 83% HP i ok. 71 tys. XP na godzinę, czyli ok. 3 poziomy z wyprawy. Teraz kończy z 66% HP i ok. 50 tys. XP na godzinę, czyli ok. 1,3 poziomu.
6. **„Zagrożenie”** to szansa omdlenia na wyprawie, licząc mikstury leczenia. Mocna postać z miksturami może więc w Sercu dalej mieć „niskie”: traci więcej HP, ale rzadko mdleje.
7. **Punkty Czasu** przewijają wyprawę z tym samym XP, więc ich nadmiar przyspiesza poziomy (autor: „zdazylem juz wbic maksymalny poziom klasy przewijając nadmiarem Punktów Czasu”). Ich źródła to liczby autora (skrzynie Bestiariusza, zadań, krain, poziomy, co 30 minut), więc zmiana czeka na jego odpowiedź.

## Zadania: „Odblokuj dostęp do N nowych regionów” (28.10.2026)

Autor: „Tygodniowe można ustawić nowym graczom "Odblokuj dostęp do x nowych regionów" i w dziennych tez w sumie”.

1. **Nowy rodzaj zadania** `unlock` w `data/quests.json`: „Odblokuj dostęp do {count} {noun}.” z formami „nowego regionu / nowych regionów”. Liczą się regiony wewnętrzne, które klasa otwiera nowymi poziomami. Postęp dodaje odbiór raportu z wyprawy, z którym przyszły te poziomy klasy.
2. **Tylko dla nowych postaci:** zadanie losuje się, póki poziom klasy jest niższy niż 25 (`untilClassLevel`).
3. **Ile regionów.** Dzienne zadanie prosi o 1 region, tygodniowe o 2–3. Nigdy nie prosi o więcej, niż otwiera się w zasięgu 5 (dzienne) albo 15 (tygodniowe) poziomów klasy (`reach`). Regiony otwierają się co 5 poziomów klasy, od 5. (Lisie Jary).
4. **Liczba zadań.** Nowa postać ma teraz 5 zadań na okres (oba stwory Skraju, wszystkie stwory, czas wypraw i regiony). Na pergaminie zadanie ma ikonę otwartej kłódki.

## Łupy dla innych klas od 15. poziomu (28.10.2026)

Autor: „I teraz skoro wymiana jest niech lupy w eksploracji pozniejszej (po 15 lvlu) bo wejdzie Rzemieślnictwo trafiaja sie tez na inne klasy”.

1. **Od 15. poziomu postaci** co czwarty przedmiot z wyprawy jest dla innej klasy (`otherClass` w `items` w `data/balance.json`: `fromLevel` 15, `share` 0,25). Dotyczy to znalezisk i skrzyń elity i czempiona. Inna klasa losuje się po równo spośród czterech pozostałych, a przedmiot jest z rodzaju, którego klasa postaci nie nosi, np. kostur dla Cienia.
2. **Bez zmian zostają** pierwsza broń i skrzynie zadań: zawsze są dla klasy postaci. Przedmioty innych klas służą do wymiany i rozbiórki. Przy pełnym plecaku złomiarz kupuje je jako pierwsze, jak dotąd.

## Skróty klas w górnym pasku (28.10.2026)

Autor: „nazwy klas przy poziomie zmień na skróty 3-literowe jesli trzeba Wojownik to może byc Woj itp. / zeby sie na gorze zmiescilo”.

1. **Skróty.** Klasy mają skrót (`short` w `data/classes.json`): Woj, Łuc, Mag, Kle, Cień. Cień ma 4 litery, bo to jego cała nazwa. Górny pasek pokazuje skrót z poziomem klasy, np. „WOJ 42”. Pełna nazwa jest dalej na ekranie Postaci.
2. **Najwęższe telefony.** Na 340 px i węższych ikona Obozu i odstępy obok złota są ciaśniejsze, więc „POZ. 37” i „WOJ 42” mieszczą się całe także na 320 px.

## Czat: bieżący poziom postaci (28.10.2026)

Autor: „okno czatu ma w starych wiadomościach stary poziom postaci, a powinien być uzależniony po prostu od funkcji, która sprawdza to na biezaco”.

Wiadomości pokazują teraz poziom, który postać ma w chwili czytania, także przy starych wiadomościach. Poziom z chwili wysłania zostaje w bazie tylko na zapas.

## Rzemieślnictwo w grze i dźwięki Warsztatu (28.10.2026)

1. **Dźwięki wybrane przez autora** na stronie odsłuchu:
    - udany wyrób: craft-7, trzy uderzenia młota (`craft`);
    - nieudany: craft-fail-5, uderzenie i pęknięcie (`craft-fail`).

   Grają przy pierwszym czytaniu raportu z Warsztatu. Kiedy coś wyszło, a coś pękło, pęknięcie gra po uderzeniach.
2. **Rzemieślnictwo działa w grze od wersji 0.0.27** (`CRAFTING` = `"on"`). Na 15. poziomie System podaje swój komunikat, a narrator objaśnia Warsztat. Migracja 0045 dodaje kolumny kroku 2 z wartościami domyślnymi.

## XP znacznie w dół (28.10.2026)

Autor: „skoro teraz tyle zrodel Punktow Czasu jest to XP musi significantly w dol pójść”. Wpis „Środek gry: wolniejsze poziomy i silniejsze stwory” zostaje, ale jego pkt 1 zmienia się tak:

1. **Spowolnienie zaczyna się od 10. poziomu** (`midGame` w `progression`: `fromLevel` 10, `levelTimeFactor` 3,5, `fadeLevel` 200). Poziomy 1–10 dalej trwają po ok. 20 minut: to początek z mało funkcjami. Od 10. poziomu każdy trwa coraz dłużej niż w 0.0.26, aż 3,5 raza dłużej na 50. Potem spowolnienie maleje do zera na 200. poziomie. Poziom 500 zostaje ok. dobą, a żaden poziom nie trwa krócej od poprzedniego.
2. **Godziny eksploracji na jeden poziom** (0.0.26 → 0.0.27 → teraz):
    - 20. poziom: 0,40 → 0,44 → 0,66 h;
    - 30.: 0,68 → 0,95 → 1,54 h;
    - 40.: 1,00 → 1,69 → 2,86 h;
    - 45.: 1,16 → 2,14 → 3,70 h;
    - 50.: 1,33 → 2,66 → 4,66 h;
    - 100.: 3,3 → 3,3 → 6,1 h.

   Od 1. do 50. poziomu to razem ok. 75 godzin eksploracji (0.0.26: ok. 31, 0.0.27: ok. 47). Klasa zwalnia tak samo, bo jej poziom potrzebuje 0,6 XP poziomu postaci.
3. **Symulacja** (typowa postać z umiejętnościami, 300 wypraw na wiersz) trafia w te czasy w granicach kilkunastu procent. Na 20. poziomie wychodzi ok. 0,8 h zamiast 0,66, bo miejsca na tych poziomach dają trochę mniej XP niż wzorzec. Punkty Czasu zostają, jak są.

## Pajęczy Parów: Pająk, Tarantula i Ptasznik (28.10.2026)

Autor: „Stwory do Pajęczego Parowu to mogą być po prostu "Pająk" "Tarantula" i elita "Ptasznik"”, a potem: „opisy i pozycje tak samo jak atak i grafiki ustal sam”.

1. **Krzyżak nazywa się teraz Pająk** (to ten sam stwór, `spider`). Jego materiał to „Pajęczy jedwab”, a w nazwach przedmiotów „Pająka”.
2. **Tarantula** to nowy zwykły stwór Parowu (`tarantula`):
    - stoi z przodu i atakuje skokiem, „Skok tarantuli” (fizyczny, od Zręczności);
    - jest szybsza i ma więcej HP niż Pająk, ale nie zatruwa;
    - materiał: „Włosie tarantuli” (unikalny);
    - w nazwach przedmiotów: „Tarantulowy” i „Tarantuli”.
3. **Ptasznik** to elita samego Parowu (`bird-eater`, `elite` w regionie wewnętrznym). W reszcie Uroczyska elitą zostaje Licho.
    - Stoi z przodu i atakuje „Jadowitymi kłami” (fizycznie, od Siły). Często zatruwa i ma dużo HP oraz pancerza.
    - Materiał: „Kieł ptasznika” (legendarny, jak u Płanetnika, elity jednego miejsca).
4. **Spotkania w Parowie:** Pająk sam albo parami, Tarantula sama albo z Pająkiem, a w trudnych walkach do trzech pająków. Symulacja: omdlenia na 31–35. poziomie 0–0,3%, czas na poziom jak w krzywej.
5. **Grafiki i okrzyki.** Wybór należał do mnie: z 3 szkiców Retro Diffusion każdego stwora i 2 szkiców każdej ikony wybrane są pierwsze. Okrzyki (ElevenLabs, po dwie wersje) trafiają do gry i na stronę odsłuchu do oceny autora.

## Czat: kanał Wymiana i zamykanie rozmów (28.10.2026)

Autor: „Dodajmy też możliwość zamknięcia okna czatu miedzy uzytkownikami (bo sie ich nagromadzi multum pozniej, oraz odpowiednia zakladke Czatu - Wymiana, skupiona na Wymianach / Niech bedzie mozna tam oznaczać jakoś przedmioty, by tworzyć takie tekstowe oferty z pozycji gracza.”

1. **Kanał Wymiana** stoi obok Globalnego (`data/chat.json`, `items: true`). Ma te same zasady, zgłoszenia i moderację, ale osobne wiadomości. Nie zapala kropki na zakładce Społeczność. Kropkę zapala dalej tylko Globalny.
2. **Oznaczanie przedmiotów.** W Wymianie przycisk sakiewki przy linii pisania otwiera plecak. Można w nim wybrać do 3 przedmiotów (`rules.items`), tylko z plecaka, bo założonych też nie da się wymienić. Wiadomość pokazuje je pod tekstem jak w plecaku. Stuknięcie otwiera kartę przedmiotu z jego właściwościami.

   Wiadomość zapisuje przedmioty takie, jakie były w chwili wysłania. Sprzedany albo oddany przedmiot zostaje więc w starej ofercie. Sama wymiana dzieje się jak dotąd, przyciskiem Wymiana na karcie postaci.
3. **Zamykanie rozmów.** Każda zakładka prywatnej rozmowy ma ×. Zamknięta znika z zakładek tej postaci (migracja 0046, tabela `chat_closed`) i wraca sama, gdy przyjdzie nowsza wiadomość, w którąkolwiek stronę. „Prywatna wiadomość” z karty postaci też ją otwiera. Wiadomości zostają.

## Jedna aktualizacja dla potworów, Bestiariusza, Sklepu Systemu i Rzemieślnictwa (28.10.2026)

Autor: „Niech Potwory, ulepszony Bestiariusz, Sklep Systemu i Rzemieślnictwo trafią w jednej aktualizacji”. Trafiły razem w 0.0.27. Nowe pająki Parowu przychodzą w następnej wersji.

## Zarośnięte Rozlewiska i Torfowe Mszary (28.10.2026)

Autor rozpisał stwory regionów Rozlewisk w dokumencie z propozycjami („Insight: nowe krainy, zioła i mikstury”), a potem: „ja dałem stwory tylko tam gdzie są lokacje, reszte uzupelnisz sam”.

1. **Dwie krainy Torfowisk** (`data/regions.json`, `land` Torfowiska), każda z 5 regionami po 5 poziomów. Otwierają się jak wcześniejsze: region na poziomie klasy o jeden niższym niż jego pierwszy poziom, Trzcinowisko na 50.
    - **Zarośnięte Rozlewiska** (51–75): Trzcinowisko, Bobrowe Tamy, Zatopiony Las, Wierzbowe Kępy, Stare Koryto. Elita to Topielica w całej krainie, czempion to Wodnik w Starym Korycie. Cecha „Szuwary”: postać z tyłu szyku ma o 5% więcej uniku (`backDodgeBonus`). Zasoby: drewno 4, kamień 2, ruda żelaza 4.
    - **Torfowe Mszary** (76–100): Żurawie Łąki, Pijawkowe Oczka, Rosiczkowe Pole, Tlące się Torfy, Stare Wyrobisko. Elita to Kikimora w całej krainie, czempion to Błotnik (*teraz Król Błót*) w Starym Wyrobisku. Cecha „Opary torfu”: Zatrucie trwa o jeden ruch dłużej, u stworów i u postaci (`effectTicks`), więc zyskuje też Zatrute ostrze Cienia. Zasoby: drewno 2, kamień 3, ruda żelaza 5.
2. **Stwory Rozlewisk** są z listy autora, a pozycje, ataki i materiały uzupełnione (rzadkość materiału w nawiasie):
    - Trzcinowisko: Czapla (tył, Pchnięcie dziobem; Pióro czapli, rzadki), Wydra (przód, Ugryzienie wydry; Futro wydry, unikalny; też w Zatopionym Lesie), Komarzysko (tył, Kłujka z Wysysaniem; Kłujka komarzyska, pospolity), Trzcinownik (środek, Oplatające trzciny, magia natury z Ugrzęźnięciem; Splot trzcin, rzadki);
    - Bobrowe Tamy: Bóbr (przód, Siekacze, gruby kożuch; Siekacze bobra, rzadki), Chmara komarów (tył, Ukąszenia z Zatruciem, po dwie i trzy; Komarze skrzydełka, pospolity), Węgorz (środek, Wyładowanie, magia elektryczności; Skóra węgorza, unikalny), Orzeł (tył, Szpony orła; Pióro orła, unikalny);
    - Zatopiony Las: Kormoran (tył, Atak z nurkowania, mocny cios i mało HP; Pióro kormorana, rzadki), Sum (przód, Paszcza suma z Ugrzęźnięciem, dużo HP; Wąs suma, epicki), Ropucha (środek, Jad ropuchy, magia trucizny z Zatruciem; Jad ropuchy, unikalny), Krokodyl (przód, Szczęki krokodyla, twarda łuska; Skóra krokodyla, epicki);
    - Wierzbowe Kępy: Wierzbowy duch (przód, Smagnięcie witkami, kora jak pancerz; Wierzbowa kora, unikalny), Zjawa (środek, Lodowaty dotyk, magia mrozu z Wysysaniem; Welon zjawy, epicki), Mgławica (tył, Duszące opary, magia trucizny z Zatruciem; Kropla mgły, rzadki);
    - Stare Koryto: Szkielet (przód, Zardzewiały miecz, odporny na truciznę; Stara kość, rzadki), Utopiec (środek, Wciągnięcie pod wodę z Ugrzęźnięciem; Wodorosty utopca, unikalny), Szlamiarz (przód, Kwaśny szlam z Zatruciem, bardzo dużo HP; Grudka szlamu, pospolity), Błotny goblin (tył, Rzut błotem z daleka; Goblińska błyskotka, epicki);
    - elita Topielica (środek, Zimny pocałunek, magia wody z Wychłodzeniem; Łza topielicy, mityczny) i czempion Wodnik (środek, Topiel, magia wody z Ugrzęźnięciem, odporny na wodę; Perła wodnika, boski).
3. **Stwory Mszarów** są z dokumentu, ale każdy region musi mieć co najmniej dwa własne stwory (wpis „Potwory: co najmniej dwa własne stwory…”). Dlatego:
    - doszły Rak (przód, Szczypce, gruby pancerz; Pancerz raka, rzadki) w Pijawkowych Oczkach, Salamandra (środek, Trujący śluz z Zatruciem; Skóra salamandry, unikalny) w Tlących się Torfach, a w Starym Wyrobisku Torfiarz (przód, Cios szpadlem, kopacz, którego bagno nie oddało; Szpadel torfiarza, epicki) i Czerw (środek, Kwaśna ślina z Zatruciem; Szczęka czerwia, unikalny);
    - Pijawki są jedną Pijawką, bo zdania walki mają liczbę pojedynczą („Pijawka pada”); jest w pierwszych trzech regionach;
    - Torfiak jest tylko w Rosiczkowym Polu, Łoś i Błotniak każdy w jednym regionie;
    - Ognik ma grafikę ze starego szkicu Błędnicy (`art/spare`).
   Reszta jak w dokumencie: Żuraw (tył, Dziób żurawia), Łoś (przód, Szarża łopatami), Pijawka (środek, Wysysanie), Błotniak (tył, Szpony z lotu), Bagienna rosiczka (przód, Lepkie czułki, magia natury z Ugrzęźnięciem), Torfiak (przód, Torfowa pięść, słaby na ogień), Ognik (tył, Płomyczek z Oparzeniem), Kikimora (elita, Bagienne zaklęcie z Zatruciem i Ugrzęźnięciem), Błotnik (czempion, Bagienny uścisk z Ugrzęźnięciem, ogromne HP).
4. **Nowe działania w walce** (`combat.js`, pola w `monsters.json` opisane w `data/README.md`):
    - **Ugrzęźnięcie** (`slow`): po trafieniu, z szansą zmniejszaną przez Wolę celu, następny ruch celu przychodzi później, 1 / (1 − `slow`) razy później, jak po Mroźnym podmuchu. W odtwarzaniu karta celu pokazuje „Ugrzęźnięcie”.
    - **Wysysanie** (`drain`): stwór odzyskuje część obrażeń zadanych ciosem: Komarzysko i Pijawka 60%, Zjawa 40%. Odtwarzanie pokazuje zielone „+HP” nad stworem.
    - **Słabość na żywioł** (`weaknesses`): Torfiak dostaje o połowę więcej obrażeń od ognia, z ciosów i z Oparzenia. Opis walki dopisuje „Słaby punkt (ogień): +50%.”.
   Te działania losują liczby tylko u stworów, które je mają, więc walki w starych krainach się nie zmieniają.
5. **Nazwy przedmiotów.** Każdy nowy stwór ma końcówkę w nazwach przedmiotów, a wiele także przymiotnik (np. „Kościany”, „Bagienny”, „Mglisty”). W każdym regionie żyje stwór z przymiotnikiem.
6. **Równowaga** (symulacja: 100–150 wypraw na wiersz, 5 klas, postać typowa i mocna):
    - wyprawy 30-minutowe: omdlenia 0–2% w każdym regionie;
    - wyprawy 2-godzinne: postać typowa (bez umiejętności i mikstur) mdleje do 8% w Rosiczkowym Polu i do 6% w Starym Wyrobisku, a mocna najwyżej 1,3%;
    - czas na poziom zgadza się z krzywą w granicach ok. 4%. Nagrody stworów są dobrane do regionów, np. w Rosiczkowym Polu o jedną czwartą mniejsze, bo walki z rosiczkami i torfiakami dawały za dużo XP.
7. **Skrzynie Bestiariusza** rosną dalej po krzywej: od Trzcinowiska (680 złota, 105 Punktów Czasu, 20 Punktów Systemu) do Starego Wyrobiska (1475, 195, 20). Skrzynie krain: Rozlewiska 1270 złota, 181 Punktów Czasu i 25 Punktów Systemu, Mszary 1845, 244 i 25.
8. **Grafiki i okrzyki.** Z Retro Diffusion jest po jednym szkicu każdego stwora (33), ikony materiału (34), koła regionu (10) i tła krainy (2), pokazywane autorowi pojedynczo. Okrzyki (ElevenLabs) mają po dwie wersje bólu i śmierci. Wypchnięcie samych opisów szkiców (`art/`, `audio/`) nie uruchamia już testów i wdrożenia, tak jak same notatki.
    - Rak jest czerwony (decyzja autora): zatwierdzony rysunek i ikona Pancerza raka są przekolorowane, a opis pancerza mówi o czerwonej skorupie.
    - Szkielet ma nowy rysunek, cały od czaszki po stopy (pierwszy był ucięty w kolanach), a Stare Koryto koło bez własnej kamiennej obręczy, która dałaby podwójną ramkę.
    - Pajęcze wylinki to blada, półprzezroczysta kopia rysunku Pająka, bo szkice wyszły jako małe niebieskie kryształki. Węgorz i Iskra ognika straciły ciemne tło szkicu.

## Jeszcze wolniejsze poziomy (28.10.2026)

Autor o spowolnieniu z 0.0.28: „jeszcze wolniej, tak z 1,5-2 razy”.

1. **Spowolnienie na 50. poziomie wynosi teraz 6 zamiast 3,5** (`levelTimeFactor` w `midGame`), a znika dopiero na 300. poziomie (`fadeLevel`, wcześniej 200), żeby żaden poziom nie trwał krócej od poprzedniego. Do 10. poziomu nic się nie zmienia, a 500. poziom dalej zajmuje około doby (26,5 h).
2. **Godziny eksploracji na jeden poziom** (0.0.28 → teraz):
    - 20. poziom: 0,66 → 0,91 h;
    - 30.: 1,54 → 2,40 h;
    - 40.: 2,86 → 4,73 h;
    - 45.: 3,70 → 6,24 h;
    - 50.: 4,66 → 7,98 h;
    - 100.: 6,1 → 9,8 h.

   Na 30–50. poziomie to 1,6–1,7 raza wolniej, na 20. poziomie 1,4 raza. Od 1. do 50. poziomu to razem ok. 118 godzin eksploracji (wcześniej ok. 75), a od 50. do 100. ok. 450 godzin. Klasa zwalnia tak samo. Nagrody stworów zostają, więc w Rozlewiskach i Mszarach poziom dalej trwa tyle, ile mówi krzywa.

## Powiadomienia na górze, kropka Znajomych i usuwanie postaci (28.10.2026)

1. **Powiadomienia** (`toast` w `ui.js`) pokazują się teraz na górze ekranu, nad paskiem postaci. Są też nad otwartym okienkiem, bo jako popover leżą w warstwie najwyższej. Wcześniej odmowa Wymiany w czasie wyrobu („Postać wykonuje przedmioty…”) chowała się pod kartą postaci. Stuknięcia przechodzą przez powiadomienie, więc przy rozbiórce plecak jest od razu dostępny i nie trzeba czekać, aż zniknie (autor: „trzeba czekać aż powiadomienie zniknie”).
2. **Kropka przy Znajomych** świeciła już przy zaproszeniu i Upominku do odebrania. Teraz świeci też wtedy, gdy któryś znajomy nie dostał jeszcze dziś Upominku od tej postaci (`unsent` w `/api/chat/latest`), bo autor chciał kropki także dla „upominków do wysłania”. Ta sama kropka zapala zakładkę Społeczność.
3. **Usunięcie postaci** („Zacznij od nowa”) zabiera wszystko, co jej dotyczy, także u innych graczy:
    - jej znajomości, więc znika z list znajomych;
    - Upominki wysłane i odebrane; nieodebrany Upominek od niej przepada, a to, co inni już odebrali, zostaje;
    - Wymiany z nią; przedmioty nie wiszą w wymianie, bo przechodzą dopiero przy jej zakończeniu;
    - wszystkie jej wiadomości czatu (Globalny, Wymiana i rozmowy prywatne w obie strony), zgłoszenia tych wiadomości i zamknięte rozmowy.
   Na koncie zostają ukryci gracze, blokady Wymian i zgoda na zasady czatu. Sprawdzają to testy czatu i Znajomych.

## Pajęczy wylęg w Pajęczym Parowie (28.10.2026)

Autor: „Skoro z Krzyżaka zrobiłeś Pająka to trzeba dodać jeszcze jednego wroga. Na przykład "Młoda chmara" albo nazwij ładniej taką dużą ilość małych pająków dopiero wyklutych. Mocniejsze od Pająka, słabsze od Tarantuli. Jesli chodzi o przedmiot z nich - to resztki skorup na przykład”.

1. **Pajęczy wylęg** (`spiderlings`) to chmara świeżo wyklutych pajączków. Nazwa jest w liczbie pojedynczej, jak Chmara komarów, żeby zdania walki brzmiały dobrze („Pajęczy wylęg pada”).
    - Stoi z przodu i atakuje „Rojem ukąszeń” (fizycznie, od Zręczności), z Zatruciem słabszym niż u Pająka.
    - HP, obrażenia i XP ma między Pająkiem a Tarantulą, a pancerz słaby, bo pajączki są miękkie.
2. **Materiał: „Pajęcze wylinki”** (rzadki), czyli puste skorupki, które młode pająki zrzucają, gdy rosną. W nazwach przedmiotów: „Wylęgu”.
3. **Spotkania w Parowie:** wylęg sam albo z Pająkiem, a w trudnych walkach dwa wylęgi z Pająkiem. Symulacja na 33. poziomie: omdleń brak, poziom trwa ok. 5% krócej niż w krzywej. Parów ma teraz cztery własne stwory.

## Król Błót, nowy Pajęczy wylęg i postać gracza w Walce (28.10.2026)

1. **Król Błót** (autor: „nazwa Błotnik(czempion) na Król Błót(czempion)”). Czempion Torfowych Mszarów nazywa się teraz Król Błót. Identyfikator `mud-lord`, materiał, okrzyki i grafika zostają. Zadania liczą go jako „Króla Błót” i „Królów Błót”, a przyrostek przedmiotów brzmi „Króla Błót”, także na przedmiotach zdobytych wcześniej, bo przedmiot pamięta stwora, a nie jego nazwę.
2. **Nowy Pajęczy wylęg** (autor: „Do zmiany: Ikonka pajęczego wylęgu”, a o nowym rysunku: „Pajeczy wylęg zatwierdzam”). Zamiast rozdartego kokonu rysunek pokazuje chmarę sześciu młodych, jasnobrązowych pająków. Ikona Pajęczych wylinek zostaje (autor: „cala reszta dzwiekow, ikonek materiałów, stworów itp gra”).
3. **Tło Walki w nowych krainach.** Scena wyprawy w Zarośniętych Rozlewiskach i Torfowych Mszarach nie miała przesuwanej krainy. Pasy powstały tak jak dla Wiatrołomów i Uroczyska: zatwierdzone tło karty krainy i jego lustrzane odbicie (384 × 96).
4. **Postać gracza w Walce** (autor: „i jedna ważna zmiana o której rozmawialiśmy, a odstawiliśmy na pozniej - moze warto teraz ja juz zacząć i zrobić”, przy uwadze kuzyna, że ludek na wyprawie mógłby być postacią gracza).
    - W scenie wyprawy idzie teraz postać gracza: jej klasa i wygląd, jak na portrecie startowym, i jej kolor skóry. Postać Systemu zostaje dla wyglądu bez rysunku chodu.
    - Każdy z 10 portretów (5 klas, 2 wyglądy) ma animację chodu z Retro Diffusion (`rd_animation__four_angle_walking`, 48 × 48, 4 klatki w prawo). Obrazkiem startowym jest portret zmniejszony do 48 × 48 (`art/references/animations/walk-*.png`), więc chód zachowuje włosy, strój i barwy portretu. Z dwóch wersji każdej postaci w grze jest ta bliższa portretowi.
    - Koszt: 20 animacji po 0,07 USD, razem 1,40 USD. Wcześniejsza obawa, że to za drogo, się nie sprawdziła.
    - Kolory skóry: `tools/walker-tones.py` przemalowuje skórę chodu na 7 pozostałych odcieni, tak jak `tools/skin-tones.py` portrety. Barwy skóry każdej postaci są wybrane ręcznie z jej palety, bo w tak małym rysunku włosy, skóra i pas mają bliskie kolory. Kolor, który Mag dzieli z włosami, liczy się jako skóra dopiero poniżej linii włosów. *Teraz maska obejmuje też światła i cienie skóry: zob. „Obóz w puszczy, żywy obóz i skóra w chodzie”, punkt 4.*
    - Pliki leżą w `src/client/art/walkers/` (`<klasa>-<wygląd>.png` i `<klasa>-<wygląd>-<odcień>.png`). Walidator pilnuje, żeby żadnego odcienia nie brakowało.
5. **Kowadło pod płótnem** (kuzyn autora o obozie: „trochę wyrwane”, dwie ściany nie pasują do obozu, „może bardziej w namiotu pójść”; autor: domki później, w Osadzie z NPC). Kowadło na poziomach 4–7 i 8–10 to jedyne budynki obozu bez dachu, z dwiema ścianami jak wycięte z domu. Teraz Kowadło na poziomach 4–7 to kuźnia pod płócienną płachtą, a na poziomach 8–10 duży namiot kowalski z paleniskiem (autor: „Kowadło zatwierdzam”). *Teraz w kresce nowego obozu: zob. „Obóz w puszczy, żywy obóz i skóra w chodzie”, punkt 1.* Szkice są przycięte do obrysu i zapisane w palecie, jak reszta obozu.

## Obóz w puszczy, żywy obóz i skóra w chodzie (28.10.2026)

1. **Cały obóz od nowa** (autor: „Ad.1, 2 i 3 - Łączymy podejście 2 - przerysowanie WSZYSTKICH z podejściem 3 - żywym obozem i palisadą wraz z poziomem obozu”, po uwadze kuzyna autora, że ściany w obozie są „trochę wyrwane” i „może bardziej w namiotu pójść”).
    - Wszystkie 27 wyglądów (9 budynków po 3) są narysowane od nowa jako jeden obóz w puszczy: drewno, płótno, liny i układany kamień, bez dachówek i murowanych domów. Domy przyjdą później, w Osadzie.
    - Pierwszy wygląd budynku (poziomy 1–3) to proste rzeczy pod gołym niebem, np. głazy z kilofem, wykop z rudą, małe ognisko w kręgu kamieni, złom na palecie z wagą. Staw Midasa jest stawem na każdym poziomie, coraz bogatszym.
    - Kowadło zachowuje zatwierdzony motyw (pieniek z kowadłem, kuźnia pod płachtą, namiot kowalski) w kresce reszty obozu.
    - Każdy budynek zostaje przy swoich barwach, a szkice (`rd_plus__isometric_asset`, 128 × 96) są przycięte do obrysu i zapisane w palecie, jak wcześniej. Autor widział każdy budynek osobno, w trzech wyglądach.
    - Koszt: 4,08 USD za budynki (dwie wersje każdego wyglądu i druga próba 7 wyglądów) i 0,36 USD za polany.
2. **Palisada rośnie z obozem.** Polana planszy ma trzy wyglądy według poziomu obozu, tak jak budynki według swoich poziomów:
    - poziomy 1–3: zaostrzone kołki wbite tu i tam na skraju polany,
    - poziomy 4–7: niski płot z kołków wiązanych liną, otwarty u dołu,
    - poziomy 8–10: wysoka palisada z bramą u dołu i wieżą strażniczą w prawym górnym rogu.

   Pliki to `src/client/art/board/camp-1.png`, `camp-2.png` i `camp-3.png`.
3. **Żywy obóz.**
    - Plansza bierze światło pory dnia w Polsce, jak sceny w Walce i w profesjach (świt od 5, dzień od 8, zmierzch od 18, noc od 21). Wieczorem i w nocy obóz ciemnieje.
    - Nad zbudowanym Ogniskiem migocze ciepły blask i unosi się dym. Blask jest mocniejszy o zmierzchu i w nocy, a większy przy większym wyglądzie Ogniska.
    - Z wyłączonymi animacjami blask stoi w miejscu, a dymu nie ma.
4. **Chód w każdym kolorze skóry** (autor: „zmiana odcieni skóry niedokładna w animacji”, przy zrzucie z rozmowy z kuzynem autora: na brązowej skórze chód jest „ciapaty”, a na czarnej „plamy jasne wywala”).
    - Przemalowanie chodu pomijało światła i cienie skóry, które postać dzieli ze strojem albo z włosami: kremowe światło na twarzy i koszuli Wojowniczki, jasne punkty na twarzy, ręce i stopach Kleryka, cienie rąk i nóg Wojownika. Na ciemnych odcieniach zostawały z nich jasne plamy.
    - Teraz `tools/walker-tones.py` liczy takie barwy jako skórę tylko tuż przy niej, najwyżej dwa piksele w głąb. Skóra zmienia kolor w całości, a włosy i strój zostają jak na portrecie, we wszystkich 70 plikach (10 postaci, 7 odcieni).
    - Próba narysowania 70 chodów od nowa w Retro Diffusion, od portretu w danym odcieniu, nie trafiła do gry: rysunki zmieniały kolor włosów i strój, a część nie miała zamówionego odcienia. Koszt próby: 70 animacji po 0,07 USD, razem 4,90 USD. *Dalej: zob. „Spokojniejszy obóz, skóra piksel po pikselu i nowa głowa Kleryczki”, punkty 2 i 3.*

## Spokojniejszy obóz, skóra piksel po pikselu i nowa głowa Kleryczki (28.10.2026)

1. **Obóz wpasowany w polanę** (autor: „budynki obozu zatwierdzam jesli wpasujesz je w planszę, ale postaraj sie mysle obnkzyc saturacje wszystkiego wraz z planszą obozu, wydaje mi się ze zbyt jaskrawy jest obóz”, a po zmianie: „obóz zatwierdzam”).
    - Polana zostawia połowę swojego nasycenia (wcześniej 0,7) i 70% jasności. Budynki też zostawiają połowę nasycenia (wcześniej 0,78), są przyciemnione do 82% i biorą 12% ciemnej zieleni leśnego podłoża, więc stoją w tym samym świetle co polana, tylko trochę jaśniej od niej.
    - Każdy budynek stoi na miękkim, rozmytym cieniu, szerszym niż wcześniej.
    - Wartości są w `GROUND_TONE` i `BUILDING_TONE` w `src/client/camp-art.js`. Pora dnia działa na nie tak jak wcześniej.
2. **Skóra w chodzie piksel po pikselu** (autor: „będziesz musiał chyba zrobic odcień skóry w animacji piksel po pikselu”).
    - Każda z 10 postaci przeszła przegląd we wszystkich 4 klatkach: narzędzie wypisuje każdy piksel w kolorze skóry, który leży tuż przy masce, a nie należy do niej, z położeniem i kolorem.
    - Doszły dwa brązowe cienie skóry, które Wojownik i Mag dzielą z włosami. Liczą się dopiero od 18. wiersza w dół, pod linią włosów.
    - Doszło 6 pojedynczych pikseli, wpisanych w `PIXELS` w `tools/walker-tones.py`: dwa na twarzy, czubek dłoni i stopa Wojowniczki oraz dwa światła na twarzy Czarodziejki.
    - Pozostałe piksele przy masce to kontury, włosy, kaptury i stroje. Zostają bez zmian. *Dalej: zob. „Chód: każda klatka jeszcze raz, piksel po pikselu”.*
    - Łucznik (autor: „przeskakują piksele jasne u Łucznika”). Jego mała twarz ma światła w kolorach kaptura, więc zostawały jasne, w każdej klatce w innym miejscu. 20 pikseli twarzy jest wpisanych po jednym, osobno dla każdej z 4 klatek. U Łuczniczki jasne piksele przy twarzy to brzeg kaptura, ten sam w każdej klatce, więc zostają.
3. **Nowy chód Kleryczki** (osoba testująca grę, przekazane przez autora: „Trochę mam zamieszana głowę jak zdeformowana”). Głowa w chodzie miała dwubarwną, poszarpaną fryzurę i twarz wciśniętą w bok. Nowy chód z Retro Diffusion ma włosy splecione w jeden warkocz na plecach i małą, czytelną twarz. Opis w `art/prompts.json` prosi o to wprost. Z 4 wersji w grze jest czwarta. Ma też własne kolory skóry w odcieniach. Koszt: 4 animacje po 0,07 USD, razem 0,28 USD.

## Porównywarka przedmiotów (28.10.2026)

Autor: „Jeszcze by się przydalo lepsze porównywanie itemów jak coś dropnie albo sie wytworzy i w plecaku - taka porównywarka czytelna”, a potem: „rób porównywarkę itemów”.

1. **Werdykt.** Serwer liczy dla każdego przedmiotu w plecaku, co zmieni się w walce, gdy postać założy go zamiast tego, co nosi w jego slocie (`valueChanges` i `equipChange` w `src/engine/preview.js`).
    - Liczą się wartości ze Statystyk: obrażenia, redukcja obrażeń, maks. HP, unik, trafienie krytyczne, odporność na efekty, szybkość, maks. mana, regeneracja i odzysk HP po walce. Do tego odporności na żywioły, liczone jak redukcja obrażeń: jaką część obrażeń danego żywiołu odejmują przeciwnikowi z poziomu postaci.
    - Każda wartość jest zaokrąglona tak, jak pokazuje ją gra, więc zmiana, której gracz by nie zobaczył, się nie liczy.
    - „Lepiej”: coś rośnie, nic nie spada. „Gorzej”: coś spada, nic nie rośnie. „Coś za coś”: jedne wartości rosną, inne spadają. „Bez zmian”: nic się nie zmienia.
    - Przedmiot, którego klasa postaci nie założy, nie ma werdyktu. Przedmiot z wymiany albo na wyższy poziom klasy ma werdykt, bo postać założy go później.
    - Werdykty całego plecaka liczą się w mniej niż 1 ms.
2. **Znaczki.** Zielony trójkąt w górę to „lepiej”, czerwony w dół to „gorzej”, a oba obok siebie to „coś za coś”. „Bez zmian” nie ma znaczka. Trójkąty są rysowane w CSS, więc nie zależą od czcionek telefonu. Znaczek jest:
    - w lewym górnym rogu kafelka w plecaku (poziom ulepszenia zostaje w prawym dolnym),
    - ze słowem na liście przedmiotów do pustego slotu,
    - ze słowem przy znaleziskach w raporcie z wyprawy i przy przedmiotach z raportu Warsztatu, dopóki przedmiot leży w plecaku.
3. **Karta przedmiotu.**
    - „Po założeniu” zaczyna się od werdyktu („Lepiej: postać będzie silniejsza.”, „Gorzej: postać będzie słabsza.”, „Coś za coś: jedne wartości wzrosną, inne spadną.”, „Bez zmian w walce.”). Pod nim są wszystkie zmienione wartości, a nie tylko pięć jak wcześniej. Karta założonego przedmiotu pokazuje tak samo „Po zdjęciu”.
    - „Porównanie z założonym” zastępuje dawne „Założony teraz”: nazwa założonego przedmiotu w kolorze jego rzadkości i tabelka „Ten / Założony / Różnica” z obrażeniami broni, pancerzem i każdą statystyką przedmiotu. Różnica obrażeń to różnica ich średnich. Statystyka, której jeden z przedmiotów nie ma, ma u niego kreskę.
    - Przedmiot, którego klasa nie założy, nie ma ani „Po założeniu”, ani tabelki, tylko ostrzeżenie jak wcześniej.

## Skóra na portretach piksel po pikselu (28.10.2026)

Autor: „nawet portrety mają słabe maski też trzeba chyba piksel po pikselu ogarnąć”, przy zrzucie szarego Łucznika z pomarańczową szyją, dekoltem i brzegami dłoni.

1. **Przegląd.** Każdy z 10 portretów przeszedł przegląd w powiększeniu, z siatką pikseli: twarz, szyja, dekolt, ręce, dłonie i stopy, w szarym i w ciemnym odcieniu.
2. **Maska** (`tools/skin-tones.py`):
    - Skóra znaleziona na głowie zostaje jak dotąd.
    - W ramkach `GROW` (szyja, dekolt, czoło, ręce, dłonie, stopy) skóra rośnie tylko w kolory skóry z twarzy tego samego portretu: dość nasycone i pomarańczowe, bez kolorów z `NOT` (kołnierz i sznurówka Wojowniczki, rzemień Wojownika, które twarz z nimi dzieli).
    - Poza głową maska zostawia tylko te kolory, więc owijki stóp, rękawy i spodnie w kolorze skóry już nie szarzeją razem z nią.
    - `PATCHES` dodają skórę odciętą od reszty, np. piętę Wojownika między rzemieniami i palce Wojowniczki. `PIXELS` i `NOT_PIXELS` to pojedyncze piksele: czoło Cienistej między kosmykami, cienie między jej palcami i tęczówki jej oczu, które zostają w swoim kolorze.
3. **Kontur.** Ciemny, ciepły kontur rąk, dłoni i stóp (np. bordowy u Wojowniczki) dostaje ciemny odcień wybranej skóry. Jest tak samo ciemny względem niej, jak był względem najciemniejszej skóry portretu. Przy głowie kontur zostaje, bo graniczy tam z włosami.
4. **Co widać w grze.** Szyje i dekolty są w kolorze wybranej skóry (najbardziej u Łucznika, Łuczniczki, Kleryka, Czarodziejki i Wojowniczki), tak samo ciemne bruzdy dłoni, pięty i palce. Przeliczone są wszystkie 70 pliki (10 portretów, 7 odcieni). Chód z Walki się nie zmienia.

## Powiadomienia: wysoki priorytet i próbne powiadomienie (28.10.2026)

Autor przekazał zgłoszenie osoby testującej grę: na telefon nie przychodzi powiadomienie o końcu wyprawy, choć włączyła je jak trzeba.

1. **Co sprawdzone.** Droga od końca wyprawy do usługi push działa w testach od początku do końca, a telefon przy każdym uruchomieniu gry zgłasza serwerowi swoją subskrypcję od nowa. Danych graczy z gry głównej nikt nie przeglądał. Zostają przyczyny po stronie telefonu albo usługi push, których z serwera nie widać.
2. **Wysoki priorytet.** Powiadomienia wychodzą z nagłówkiem `Urgency: high`. Wcześniej miały zwykły priorytet, a takie wiadomości Android przy oszczędzaniu baterii (Doze) wstrzymuje, aż telefon sam się obudzi, czasem na godziny. Gdy gracz w tym czasie otworzy grę, ona zamyka zaległe powiadomienia, więc mogło wyglądać, jakby nie przyszły wcale. iPhone przy niskiej baterii także dostarcza od razu tylko pilne wiadomości.
3. **Próbne powiadomienie.** Pod przełącznikiem „Powiadomienia” w Ustawieniach, gdy są włączone, jest „Wyślij próbne powiadomienie”. Gra najpierw zgłasza serwerowi ten telefon jeszcze raz, a serwer od razu wysyła do niego „Próbne powiadomienie” (`pushTestTitle` i `pushTestBody` w `data/texts.json`). Pokazuje się ono także przy otwartej grze. Komunikat mówi, co odpowiedziała usługa push:
    - „Wysłane…”: usługa je przyjęła. Gdy mimo to nic nie przyjdzie, przyczyna jest w ustawieniach telefonu.
    - kod błędu: usługa odrzuciła wiadomość,
    - „Usługa powiadomień nie zna już tego telefonu…”: subskrypcja wygasła. Znika z serwera i z telefonu, a przełącznik trzeba włączyć ponownie.

   Próbne powiadomienie można wysłać raz na pół minuty (`tested_at`, `migrations/0047_push_test.sql`).

## Chód: każda klatka jeszcze raz, piksel po pikselu (28.10.2026)

Autor: „szary łucznik w 0.0.32 nie chodzi jakby był szary, miałeś się przyjrzeć wszystkim postaciom i robić tak jak Kleryka”, „Wojownik dark też ma plamy”, „musisz każdy obrazek przejrzeć piksel po pikselu raczej niestety, nie u Łucznika u wszystkich postaci”, „estetyka jest ważna”.

1. **Przegląd.** Każda z 40 klatek chodu (10 postaci po 4 klatki) przeszła przegląd w powiększeniu, z kolorem i maską skóry przy każdym pikselu, obok wersji szarej i ciemnej. Potem każda postać we wszystkich 8 kolorach skóry.
2. **Co było źle.**
    - Wojownik: kremowe światła na brodzie, barku i palcach stopy, cień szyi oraz czerwone kontury drugiej dłoni i stóp w cieniu zostawały w kolorach rysunku. Na ciemnej skórze robiły jasne plamy.
    - Wojowniczka: policzek przy prawym oku oraz czerwone kontury twarzy, dłoni i stóp. Dwa piksele włosów brały kolor skóry.
    - Mag: biały punkt na policzku i druga dłoń przy biodrze, która zostawała czerwoną plamą. Czarodziejka: światła na policzku, usta i stopa w cieniu pod suknią.
    - Kleryczka: kontury nosa, ramion, dłoni i stóp, światła na barku i palcach stóp, a w klatkach w pół kroku cała stopa pod suknią. Dwa piksele paska brały kolor skóry.
    - Cień: światła na czole i dłoniach, skroń, nos, łokcie i druga dłoń. Brew i ciemny punkt między oczami jaśniały razem ze skórą. Cienista: ciemnoczerwone kontury ucha, twarzy i dłoni oraz druga dłoń. Kosmyki włosów brały kolor skóry.
    - Łucznik i Łuczniczka: kolor skóry brały pojedyncze piksele buta, peleryny i zapięcia.
    - Kleryk: bez zmian.
3. **Jak.** `PIXELS` i `NOT_PIXELS` w `tools/walker-tones.py` wypisują piksele dodane do maski i z niej wyjęte, osobno dla każdej klatki. Światło jaśniejsze od skóry dostaje najjaśniejszy odcień, a kontur ciemniejszy od niej — najciemniejszy, przyciemniony tak jak na rysunku, jak kontur portretów. Zmieniły się tylko przejrzane piksele, reszta ma ten sam kolor co wcześniej. Przeliczone są wszystkie 70 pliki.
4. **Łucznik.** W chodzie ma kaptur na głowie (tak opisuje go `art/prompts.json`), a peleryna zasłania dłonie. Skóry widać więc tylko ok. 10 pikseli twarzy. Twarz jest w wybranym kolorze w każdej klatce, ale postać i tak wygląda głównie jak kaptur. Na portrecie kaptur jest zsunięty na plecy. Chód bez kaptura wymagałby nowej animacji z Retro Diffusion.

## Wymiana zasobów przy Stole rozbiórki i wymiana części w Warsztacie (28.10.2026)

Autor: „Dodajmy też na stole rozbiórki możliwość wymiany zasobów typu kamień na drewno w stosunku 1 za 10 i aż do 1 do 1 przy poziomie 10-tym stołu rozbiórki”, „W Rzemieślnictwie też powinna być natychmiastowa opcja wymiany Ścinek na Rzemienie itd. w jakichś adekwatnych ilościach typu 10 Ścinek = 1 Rzemień jeśli to adekwatne”.

1. **Stół rozbiórki: „Wymiana zasobów”.** Drewno, kamień i rudę żelaza można wymienić jedno na drugie. Na poziomie 1 stołu za sztukę oddaje się 10 sztuk innego zasobu, każdy poziom to o 1 mniej, a na poziomie 10 wymiana idzie 1 za 1 (`exchange.rates` w `data/buildings.json`, `src/engine/exchange.js`).
    - Wymiana nie ma dziennego limitu i nie dotyczy złota. Złoto na zasoby wymienia duch ognia w Ognisku.
    - Na ekranie stołu gracz wybiera zasób, który oddaje, suwakiem (i przyciskami − i +) liczbę sztuk, które chce dostać, a potem przycisk zasobu, który bierze. Przed wymianą gra pyta o potwierdzenie, jak u ducha ognia.
    - Wymiana działa obok wszystkiego, co robi postać, także w czasie wyprawy, tak jak reszta obozu. Rozbudowa stołu obniża stawkę dopiero po swoim końcu.
2. **Warsztat: „Wymiana części”.** Od ręki, bez pracy postaci i Awatara: 10 części jednej rzadkości za 1 część następnej (Ścinki → Rzemienie → Okucia → Odłamki → Bursztyn → Krwawnik → Gwiezdny odprysk). Przyciski „Wymień 1” i „Wymień 10” bez pytania o potwierdzenie, jak „Kup 1” i „Kup 10” u złomiarza. Liczą się też części ze zleceń stołu skończonych do teraz. Karta stoi w Rzemieślnictwie, więc wymiana działa od 15. poziomu postaci, jak cała profesja.
3. **Czy 10 za 1 jest adekwatne.** Tak, zostaje 10 za 1 (`workshop.exchange.rate` w `data/professions.json`):
    - U złomiarza część następnej rzadkości kosztuje dwa razy tyle co poprzednia. Za 10 części zapłaciłoby się pięć razy więcej niż za jedną wyższą, więc wymiana nigdy nie jest tańsza od zakupu, a złomiarz nie traci sensu (test w `test/workshop.test.js`).
    - Rzadsze części trzeba nadal zdobyć: 1 Odłamek to 1000 Ścinek, a Gwiezdny odprysk — milion. Przy 2 lub 3 za 1 Ścinki z rozbiórki szybko zamieniałyby się w części boskie.
    - Wymiana daje za to ujście nadmiarowi Ścinek i Rzemieni, gdy brakuje kilku części wyższej rzadkości do zlecenia, a złomiarz jeszcze ich nie sprzedaje albo skończył się jego dzienny limit.

## Suwak ducha ognia od jednej sztuki oraz HP i mana z poziomem (28.10.2026)

1. **Duch ognia.** Autor: „Ducha ognia miałeś też domyślnie ustawić by suwak był ustawiony na najniższą wartość i pytać przed wymianą złota na zasoby”.
    - Suwak przy duchu ognia stoi teraz na 1 sztuce, gdy gracz otwiera ekran Ogniska. Wcześniej stał na wszystkim, co zostało na dziś albo na co starczało złota. Ekran pamięta ostatni wybór do wyjścia z niego, a po powrocie suwak znów stoi na 1. Tak samo działa suwak wymiany przy Stole rozbiórki.
    - Pytanie przed wymianą jest od 0.0.25 („Wymiana u ducha ognia”, punkt w sekcji o Osłonie many): złoto znika dopiero po „Wymień”.
2. **HP i mana z poziomem.** Autor: „Niech poziom Many i Zdrowia rośnie u każdej postaci również bez zwiekszania statystyk troche jeśli trzeba”, „Ewentualnie dostosuj rozdawanie automatyczne. Najlepiej zrob obydwa jesli dobrze mysle, ze HP i Mana nie rosna bez wzrostu statystyk.”
    - HP i mana rosną już bez punktów: każdy poziom postaci daje +5 maks. HP i +2 maks. many (`hpPerLevel` i `manaPerLevel` w `data/balance.json`; od 0.0.41 dodatek jest za poziom klasy, zob. „HP i mana za poziom klasy”). Poziomy klasy dodają też Witalność (wszystkim klasom poza Cieniem) i Mądrość (Magowi i Klerykowi), a rozdawanie automatyczne daje Witalności ćwierć punktów w każdej klasie.
    - Symulacja postaci z rozdawaniem automatycznym (`tools/simulate.mjs`, godzinne wyprawy): omdlenia 0–2,3% na poziomach 25–100. W walkach (także z elitami) postać używa umiejętności 2–6 razy, a z nieograniczoną maną używałaby ich tyle samo. Umiejętności kosztują stałe 10–15 many, a mana rośnie z poziomem, więc z czasem starcza na coraz więcej.
    - Dlatego HP, mana i rozdawanie automatyczne zostają bez zmian. Ekran Statystyk pokazuje za to w „Wartościach bojowych” maks. manę obok maks. HP, a przy obu: „+5 z każdym poziomem postaci” i „+2 z każdym poziomem postaci”.

## Stawka wymiany na górze ekranu Stołu rozbiórki (28.10.2026)

Autor: „Dopisz na gorę info o możliwości wymiany zasobów i rozwoju sytuacji wraz z lvlem”. Efekt poziomu Stołu rozbiórki kończy się teraz stawką wymiany zasobów na tym poziomie, np. „Najwyższa rzadkość: unikalna, przeróbka szybsza o 20%, wymiana zasobów 9 za 1”. Widać ją w karcie budowy lub ulepszenia na samej górze ekranu i w „Teraz” (`exchange.levelText` w `data/buildings.json`, `effectText` w `src/engine/camp.js`).

## Zdarzenia na końcu wyprawy: Ranna kobieta (28.10.2026, wersja testowa)

Autor: „Ewentualnie zdarzenia na koniec wyprawy: wyświetla się nagle jakiś NPC który coś proponuje i jest parę opcji do wyboru jeszcze przed pokazaniem się Raportu z wyprawy(który bedzie uwzględniał zdarzenie). Zdarzenia beda mozliwe od samego początku prawie (po Samouczku).” Pierwsze zdarzenie i jego trzy opcje są ze szkicu autora („Pierwszym zdarzeniem może być spotkanie rannej kobiety…”). Zdarzenie pokazuje się po dotknięciu „Odbierz raport”.

1. **Kiedy.** Po „Odbierz raport” gra najpierw pokazuje zdarzenie: tytuł, krótki tekst i opcje. Raport otwiera się dopiero po wyborze i opisuje, co z niego wynikło. Zdarzenie zamknięte bez wyboru czeka: następne „Odbierz raport” pokaże je znowu, a do wyboru nic się nie zapisuje.
    - Zdarzenie może przyjść po wyprawie zakończonej zgodnie z planem, z szansą 0,5% za każdą minutę, najwyżej 25%: 5 minut to 2,5%, 30 minut 15%, a godzina i dłużej 25% (`chancePerMinute` i `maxChance` w `data/events.json`). Zmienione niżej: stałe 10%, bez względu na długość wyprawy.
    - Nie przychodzi po pierwszej wyprawie (samouczek), po Szybkim Polowaniu ani po omdleniu lub odwrocie.
    - Ziarno wyprawy decyduje, czy zdarzenie przyjdzie i jak skończy się każda opcja, więc ta sama wyprawa zawsze daje to samo.
2. **Ranna kobieta.** Opcje mają nazwy ze szkicu autora. Krótkie teksty skutków są nowe, w `data/events.json`.
    - „Pomóż jej sprawnie”: zasadzka. Trzej bandyci na poziomie postaci ruszają pierwsi, wszyscy przed pierwszym ruchem postaci (`ambush` w `simulateFight`). Postać walczy z HP, z jakim skończyła wyprawę.
    - „Zadaj dodatkowe pytania”: postać wyczuwa zasadzkę. Bandyci nie atakują z zaskoczenia, a postać jest w tej walce o 25% szybsza. Reszta jak w pierwszej opcji.
    - „Odejdź nieufnie”: nic więcej się nie dzieje.
3. **Bandyci.** Zbir (przód, pałka), Nożownik (środek, nóż) i Kusznik (tył, kusza), zapisani jak stwory, ale w `data/events.json`.
    - To ludzie, więc nie ma ich w Bestiariuszu, nie zostawiają materiałów i nie liczą się do zadań narratora.
    - Każdy pokonany zostawia złoto jak stwór, a z szansą 35% także losowy przedmiot na poziomie postaci (średnio ok. 1 przedmiot na walkę).
    - XP jak za trzy stwory na poziomie postaci w jednej walce wyprawy.
4. **Przegrana.** Jak przegrana walka na wyprawie: omdlenie. W bezpiecznym regionie (Wiatrołomy) tylko odwrót, jak po przegranej z elitą albo czempionem, bo bandyci przychodzą na poziomie postaci, a nie miejsca.
5. **Balans.** Symulacja typowych postaci 5 klas po godzinnej wyprawie w miejscu na miarę poziomu, opcja „Pomóż jej sprawnie”:
    - Postać wygrywa każdą walkę. Zasadzka zabiera 43–52% HP na poziomach 5–8, 38% na 15. i ok. 24% od 30. poziomu. „Zadaj dodatkowe pytania” zabiera mniej.
    - XP z walki to ok. 30% XP godzinnej wyprawy od 30. poziomu, 36–45% na poziomach 8–15 i 87% na 5. poziomie. Przy szansie zdarzenia daje to średnio 7–26% XP więcej na wyprawę.
6. **Raport.** Pod podsumowaniem stoi karta zdarzenia: tekst i wybrana opcja ze skutkiem. Walka z bandytami ma w zakładkach znacznik „zdarzenie”, a raport otwiera się na niej. Relacja kończy się zdarzeniem.
7. **Na razie tylko wersja testowa** (`EVENTS` „on” w `wrangler.jsonc`). „Testuj zdarzenia” w Ustawieniach wybiera zdarzenie na następny raport, bez losowania. Przychodzi ono po następnej wyprawie zakończonej zgodnie z planem (nie po samouczku ani Szybkim Polowaniu), a po wyborze opcji wybór znika (`event_test`, migracja 0048).
8. **Grafiki.** Postać zdarzenia (`art`) leży w `src/client/art/events/`, tło (`scene`) w `src/client/art/event-scenes/`, a sylwetki bandytów obok stworów. Szkice z Retro Diffusion idą do autora pojedynczo. Ranna kobieta ma postać (lewa wersja) i tło leśnej ścieżki (prawa wersja), obie wybrane przez autora.
    - Autor: „trzeba wtopić ranną kobiete w tło tak by nie przysłaniała koszyka wiklinowego”. Postać ma teraz swoje miejsce na tle (`figure` w `data/events.json`: od lewej, od dołu i wysokość, w procentach tła). Tło ma stałe proporcje 2:1, więc miejsce jest to samo na każdym ekranie. Ranna kobieta siedzi pod wielkim drzewem po prawej, a koszyk leży obok niej na ścieżce. Postać jest przyciemniona i ocieplona do zmierzchu tła i ma miękki cień na ziemi.
    - Autor: „nie wdrazaj wszystkich po kolei tylko wszystkie grafiki bandytów na raz”. Sylwetki trzech bandytów weszły do gry razem, w wersjach wybranych przez autora: Zbir lewa, Nożownik prawa, Kusznik prawa.

## HP i mana za poziom klasy (28.10.2026)

Autor: „ale powinno być HP i mana dodatkowe za poziom klasy a nie postaci - i to od tej klasy uzaleznione w jakiej wielkości”.

1. **Zasada.** Poziom postaci nie daje już HP ani many. Każdy poziom klasy daje stały dodatek, inny w każdej klasie (`perClassLevel` w `data/classes.json`), poza tym, co dają statystyki:
    - Wojownik: +6 HP i +1 many,
    - Cień: +5 HP i +1 many,
    - Łucznik: +4 HP i +1 many,
    - Kleryk: +4 HP i +2 many,
    - Mag: +3 HP i +3 many.
2. **Dlaczego tyle.** Średnio dodatki są bliskie dawnych +5 HP i +2 many za poziom postaci, bo klasa ma zwykle trochę wyższy poziom niż postać (przy 100. poziomie postaci ok. 121. poziom klasy). Wojownik z przodu dostaje najwięcej HP, a Mag najwięcej many i najmniej HP. Cień ma +5 HP, bo jego poziomy klasy nie dają Witalności (Wojownikowi dają 2, a Łucznikowi, Magowi i Klerykowi po 1).
3. **Skutki** (symulacja typowych postaci z rozdawaniem automatycznym, poziomy postaci 5–100):
    - Maks. HP na 100. poziomie: Wojownik +7%, Cień +5%, Łucznik i Kleryk −1%, Mag −5%.
    - Mana: Mag +8–11%, Kleryk bez zmian, pozostałe klasy mniej. Nadal starcza na każdą umiejętność: postać rzuca ich tyle samo co z nieograniczoną maną, także w walkach z elitą.
    - Omdlenia bez zmian, 0–5% godzinnych wypraw.
4. **Potwory** mają nadal +5 HP za każdy swój poziom (`monsters.hpPerLevel` w `data/balance.json`).
5. **Ekran Statystyk** pokazuje przy „Maks. HP” i „Maks. mana” dodatek klasy, np. u Wojownika „+6 z każdym poziomem klasy”.

## Losowany przebieg zdarzenia: ranna kobieta bywa uczciwa (28.10.2026, wersja testowa)

Autor: „Trzeba zrobić tak by te zdarzenie miało różne możliwości docelowo, czyli pomoc rannej kobiecie powinno móc czasem zrobic tak, ze nie ma bandytów a ona odwdzięcza się złotem albo jakimś rzadkim przedmiotem (który znalazła w lesie) losowanie tego typu”.

1. **Przypadki.** Zdarzenie może mieć kilka przypadków, czyli tego, co naprawdę się dzieje (`cases` w `data/events.json`). Los wybiera przypadek raz, z ziarna wyprawy, zanim gracz cokolwiek wybierze. Każda opcja ma w każdym przypadku swój skutek: ten z przypadku, a gdy przypadek go nie podaje, domyślny skutek opcji.
2. **Ranna kobieta:**
    - Zasadzka (60%): jak dotąd. Po „Pomóż jej sprawnie” bandyci atakują pierwsi, a po „Zadaj dodatkowe pytania” walka zaczyna się bez zaskoczenia, z szybszą postacią.
    - Wdzięczność, złoto (25%): po „Pomóż jej sprawnie” kobieta daje sakiewkę, ok. 10 złota za każdy poziom postaci (±25%). To mniej więcej tyle, ile godzina wyprawy.
    - Wdzięczność, przedmiot (15%): po „Pomóż jej sprawnie” kobieta oddaje przedmiot znaleziony w lesie, na poziomie postaci: rzadki (70%), unikalny (25%) albo epicki (5%).
    - Gdy kobieta jest uczciwa, „Zadaj dodatkowe pytania” kończy się bez nagrody: urażona podejrzliwością, odchodzi o własnych siłach. Zmienione niżej: kobieta umiera urażona albo zamienia się w Błędnicę. Dzięki temu opcje się różnią. Pomoc grozi zasadzką, ale może dać nagrodę. Pytania chronią przed zasadzką, ale tracą nagrodę. Odejście nic nie daje i nic nie kosztuje.
    - „Odejdź nieufnie” kończy się tak samo w każdym przypadku.
3. **Nagroda** trafia do postaci jak znaleziska z wyprawy, a karta zdarzenia w raporcie podaje kwotę albo nazwę przedmiotu.
4. **„Testuj zdarzenia”** pozwala wybrać przy zdarzeniu „Losowo” albo jeden z przypadków, żeby sprawdzić każdy z nich.

## Ranna kobieta umiera urażona albo zamienia się w Błędnicę; zdarzenia w 10% wypraw (28.10.2026, wersja testowa)

Autor: „Niech te zdarzenia działają na zasadzie losowości, niech trafiaja sie w 10% przypadków, a jakie.. no na razie jest to jedno tylko, ale zrobimy więcej i każde będzie miało równe prawdopodobieństwo”, „w sumie dodaj tylko to ze Blednica moze sie pojawic po zadaniu dodatkowych pytań albo umrzec urażona”, „nieee, ona ma sie ta kobieta zamieniać w Błędnice” i „Tylko niech zamiana w Błednice tez uzupelni pozniej Bestiariusz normalnie - dopilnuj tego”.

1. **Szansa.** Zdarzenie przychodzi po 10% wypraw zakończonych zgodnie z planem, bez względu na ich długość (`chance` w `data/events.json`). Wyjątki bez zmian: pierwsza wyprawa (samouczek), Szybkie Polowanie, omdlenie i odwrót. Każde zdarzenie z listy ma tę samą szansę.
2. **Pytania, gdy kobieta jest uczciwa.** „Zadaj dodatkowe pytania” w przypadkach „Wdzięczność” kończy się na jeden z dwóch sposobów, po 50%. Los rozstrzyga to dopiero po wyborze opcji:
    - kobieta umiera urażona na oczach postaci i postać nic nie zyskuje;
    - kobieta zamienia się w Błędnicę i postać walczy z nią sama, na poziomie postaci, z HP z końca wyprawy. Wygrana daje XP i złoto jak za Błędnicę spotkaną na wyprawie. Przedmiotów ani materiałów nie ma, jak w walce z bandytami. Przegrana to omdlenie, a w bezpiecznym miejscu odwrót. Błędnica w zdarzeniu nie ma premii poziomu: według symulacji postać wygrywa prawie zawsze i traci ok. 30–40% HP, czyli podobnie jak w zasadzce.
3. **Bestiariusz i zadania.** Błędnica ze zdarzenia trafia do Bestiariusza jak stwór spotkany na wyprawie. Jej pokonanie liczy się też do zadań narratora. Bandyci są ludźmi, więc nadal nie ma ich ani w Bestiariuszu, ani w zadaniach.
4. **Pozostałe opcje bez zmian.** W zasadzce pytania prowadzą do walki z bandytami bez zaskoczenia, a „Odejdź nieufnie” kończy się zawsze tak samo.
5. **Dane.** Skutek opcji może być listą skutków z wagami (`weight`), z której los wybiera przy wyborze opcji (`src/engine/events.js`). Walka w zdarzeniu może być ze stworem z `data/monsters.json`.
6. **Pominięte na razie.** Na razie nie ma rannego mężczyzny, przedmiotu w krzakach po nieufnym odejściu ani innych zaproponowanych pomysłów, bo autor napisał „dodaj tylko to”.

## Zadania na stwory, do których klasa nie ma dostępu (28.10.2026, 0.0.42)

Autor, ze zrzutem ekranu osoby testującej grę (poziom postaci 23, poziom klasy 27): „dlaczego trafiają sie zadania z potworami nie na odpowiedni level? kuzynka nawet nie ma dostepu do tych potworów za niski poziom klasy a to zadania dzienne, przelosuj jej to i popraw zadania dzienne bo jest coś nie tak mocno”.

1. **Przyczyna.** Zadania dnia losują się raz, przy pierwszym wejściu do gry po północy, i potem się nie zmieniają. Tej nocy grała jeszcze wersja 0.0.26, w której Omszałe Głazy miały między innymi Waderę, Pająka i Kamiennika. Rano wersja 0.0.27 dała każdemu regionowi wewnętrznemu własne stwory. Wadera trafiła do Wilczych Kręgów (od poziomu klasy 40), a Pająk do Pajęczego Parowu (od poziomu klasy 30). Zapisane zadania zostały, więc wskazywały stwory, do których klasa nie ma już dostępu. Samo losowanie działało dobrze: nowe zadania biorą stwory z najnowszego regionu wewnętrznego otwartego dla klasy.
2. **Naprawa.** Przy każdym wczytaniu postaci gra sprawdza zapisane zadania dnia i tygodnia. Zadanie na stwora, który nie żyje w żadnym regionie wewnętrznym otwartym dla klasy postaci, losuje się na nowo, chyba że jest już wykonane albo odebrane. Nowe zadanie pochodzi z tego, co postać dostałaby teraz, i nie powtarza zadań, które okres już ma. Pozostałe zadania zostają bez zmian, z postępem i odebranymi nagrodami. Nowe zadanie od razu się zapisuje (`currentQuests` w `src/engine/quests.js`, `settleQuests` w `src/server/characters.js`).
3. **Przelosowanie.** Osoba testująca grę nie musi nic robić: przy następnym wejściu do gry zadania na Waderę i Pająka zmienią się na nowe, a zadanie na Kamiennika zostanie, bo Omszałe Głazy są dla niej otwarte. To samo dzieje się u każdego gracza, któremu zostały takie zadania, także tygodniowe.

## Zdarzenia w grze głównej, Błędnica do zatwierdzenia (28.10.2026, 0.0.43)

Autor: „Jesli chodzi o zdarzenie rannej kobiety to to co jest działa i jest okey,, ale nie ma dostepnej jeszzcze tej opcji z Błędnicą. Wrzuć tak do gry glownej. Dokończ Błędnice i daj do zatwierdzenia przed lista i generowaniem stworów albo równolegle żeby i opcje z Błędnicą dodać”.

1. **Gra główna.** Zdarzenia działają w grze głównej od wersji 0.0.43 (`EVENTS` „on” w `wrangler.jsonc`) i przychodzą po 10% wypraw zakończonych zgodnie z planem.
2. **Błędnica jako szkic.** Zakończenie z Błędnicą czeka na zatwierdzenie autora (`draft` w `data/events.json`), więc losuje się tylko w wersji testowej (`EVENTS` „test”). W grze głównej uczciwa kobieta po „Zadaj dodatkowe pytania” zawsze umiera urażona. Po zatwierdzeniu wystarczy usunąć `draft`, a oba zakończenia znów będą po 50%.
3. **„Testuj zdarzenia”** ma też zakończenia pytań: „Pytania: umiera w beznadziei” i „Pytania: zamienia się w Błędnicę”. Zakończenie wybrane bez przypadku przychodzi w pierwszym przypadku, w którym pytania do niego prowadzą, czyli „Wdzięczność: złoto”.
4. **Tekst autora (0.0.44).** Od wersji 0.0.44 kobieta po pytaniach umiera w beznadziei, w słowach autora: „Kobieta próbuje odpowiadać, ale Twoje podejrzliwe pytania nie pomagają a odbierają nadziei na jakąkolwiek pomoc. Na Twoich oczach umiera w beznadziei. Nic już dla niej nie zrobisz.”

## Błędnica zatwierdzona (28.10.2026, 0.0.44)

Autor: „Wszystkie wersje Rannej kobiety działają dobrze - możesz wdrażać na główną grę”.

1. **Gra główna.** Zakończenie z Błędnicą nie jest już szkicem, więc w grze głównej uczciwa kobieta po „Zadaj dodatkowe pytania” umiera w beznadziei albo zamienia się w Błędnicę, każde po 50%.
2. **Szkice zostają.** Znacznik `draft` w `data/events.json` działa dalej dla przyszłych zakończeń do zatwierdzenia: takie zakończenie losuje się tylko w wersji testowej.

## Zadania dzienne z dwóch regionów wewnętrznych (28.10.2026, 0.0.43)

Autor: „Po pierwsze do zadań dziennych losuj z ostatniej otwartej lokacji i jednej przed nią (bo nie muszą być bardzo trudne)”.

1. Zadania dzienne na stwory biorą stwory z najnowszego regionu wewnętrznego otwartego dla klasy i z regionu przed nim. Region za łatwy dla postaci odpada, jak dotąd.
2. Zadania tygodniowe zostają przy najnowszym regionie, bo autor mówił tylko o dziennych.
3. Liczba stworów w „Pokonaj N dowolnych stworów” liczy się jak dotąd z najnowszego regionu.

## Cztery zwykłe stwory w każdym regionie wewnętrznym poziomów 1–50 (28.10.2026)

Autor: „Nastepnym krokiem będzie rozwiniecie listy stworow na niskich poziomach. Niech kazdy region wewnętrzny ma 4 stwory zwykłe”, potem „Gadożer zmiana opisu - nie orzeł a jastrząb” i „Lista zatwierdzona, zaczynamy od tych do 50 poziomu, aż do wdrożenia przed północą, a później zajmiemy się resztą”.

1. **Nowe stwory** (pozycja w nawiasie):
    - Skraj Wiatrołomów: Wiewiórka (tył), Zaskroniec (środek).
    - Lisie Jary: Jenot (przód), Mrówkolew (tył).
    - Krucze Wykroty: Głuszec (przód), Łasica (środek).
    - Żmijowe Zwalisko: Jelonek rogacz (przód), Gadożer (tył).
    - Dzicza Głusza: Żbik (środek), Bocian czarny (tył).
    - Omszałe Głazy: Mchowiec (przód), Chochlik (środek).
    - Pajęczy Parów: Krzyżak (tył).
    - Rysia Grań: Muflon (przód), Sokół (tył).
    - Wilcze Kręgi: Wilkołak (środek), Wilczy pasterz (tył).
    - Serce Uroczyska: Tur (przód), Połoz (środek), Strzyga (tył).
2. **Ataki i efekty** dobrane do opisów z listy: Mrówkolew, Krzyżak i Połoz spowalniają (Ugrzęźnięcie), Mchowiec i Strzyga wysysają część zadanych obrażeń, Wilczy pasterz atakuje mrozem i wychładza, Chochlik rzuca magiczne iskry. Gadożer lepiej znosi jad, a Mchowiec jest słaby na ogień.
3. **Siła i nagrody** jak u sąsiadów z tego samego regionu. Według symulacji omdlenia się nie zmieniły, a XP i złoto na godzinę różnią się od dotychczasowych najwyżej o 2%.
4. **Materiały**: każdy nowy stwór zostawia własny materiał, o rzadkości jak u stworów tego regionu (od pospolitych na Skraju Wiatrołomów do epickich w Sercu Uroczyska). Każdy ma też nazwę do afiksów przedmiotów.
5. **Spotkania**: nowe stwory przychodzą same i w parach z dotychczasowymi, a od Kruczych Wykrotów także w wymagających spotkaniach. Na Skraju Wiatrołomów pary są dopiero od 5. poziomu, jak dotąd. Opisy regionów wewnętrznych wymieniają nowe stwory.
6. **Bestiariusz**: nowe stwory są na listach regionów i krain. Skrzynia regionu, który ktoś już otworzył, zostaje otwarta. Kto jej jeszcze nie otworzył, musi teraz spotkać także nowe stwory.
7. **Głosy**: po dwa nagrania bólu i śmierci na stwora, z ElevenLabs, jak u pozostałych stworów.

## Ranna kobieta tylko tam, gdzie żyje Błędnica (28.10.2026, 0.0.46)

Autor: „Trzeba pamiętać, że to obecne z ranną kobietą może się pojawiać tylko w Skraju Wiatrołomów, Lisich Jarach i Kruczych Wykrotach, bo tylko tam jest Błędnica”.

1. **Regiony zdarzenia.** Zdarzenie może mieć w `data/events.json` listę `areas`. Wtedy przychodzi tylko po wyprawach w te regiony wewnętrzne. Bez listy przychodzi wszędzie. Ranna kobieta ma Skraj Wiatrołomów, Lisie Jary i Krucze Wykroty.
2. **Szansa się nie zmienia.** Wyprawa w regionie bez zdarzeń nie dostaje innego zdarzenia w zamian. Losowanie 10% zostaje, a gdy w regionie nie ma żadnego zdarzenia, nic nie przychodzi.
3. **Sprawdzanie danych.** Walidator pilnuje, żeby stwory, z którymi zdarzenie walczy, żyły w każdym regionie z jego listy, tak jak Błędnica w tych trzech.
4. **„Testuj zdarzenia”** wybiera zdarzenie w każdym regionie, żeby autor mógł je sprawdzić od razu.
5. **Całe zdarzenie jako szkic.** Zdarzenie z `draft` przychodzi tylko w wersji testowej, tak jak szkice zakończeń.

## Nowe stwory otwierają skrzynię Bestiariusza znowu (28.10.2026, 0.0.46)

Autor: „Jeśli ktoś już odebrał nagrodę Bestiariusza to nowe stwory dadzą kolejne nagrody, mimo ze ktos je już wcześniej odebrał. To i tak testowa wersja, więc niech tak zostanie. Przy okazji ludzie będą mieli powód by zwiedzić starsze poziomy”.

1. **Skrzynia znowu do otwarcia.** Zmienia to punkt 6 z sekcji o czterech zwykłych stworach. Gdy na liście regionu albo krainy przybędzie stworów, otwarta skrzynia zamyka się. Otworzy się ponownie, gdy postać pozna wszystkie stwory listy, także nowe. Daje wtedy tę samą nagrodę co za pierwszym razem: złoto, Punkty Czasu i Punkty Systemu.
2. **Zapis.** Otwarta skrzynia jest zapisana z liczbą stworów, które jej lista miała w chwili otwarcia („windfalls-edge:5”). Skrzynie otwarte wcześniej są zapisane bez liczby. Liczą się jako otwarte przed stworami z 28.10.2026 (`balance.bestiary.laterCreatures`), więc regiony poziomów 1–50 i ich dwie krainy mają je znowu do otwarcia.

## Ranking: Poziom Profesji (28.10.2026, 0.0.46)

Autor: „Do Rankingu w Społeczności dodaj zakładkę "Poziom Profesji". Będzie tam brany najwyższy z rozwijanych przez Postać z ikonką danej Profesji obok poziomu”.

1. **Trzecia zakładka.** Ranking ma teraz trzy porządki: „Poziom postaci”, „Poziom klasy” i „Poziom Profesji”, w jednym rzędzie.
2. **Najwyższa profesja.** Każda postać stoi na miejscu według swojej najwyżej rozwiniętej profesji. Obok poziomu jest ikonka tej profesji, ta sama co na zakładce Profesje. Przy równych poziomach liczy się ta wcześniejsza na liście (Zielarstwo, Alchemia, Rzemieślnictwo), a o miejscu decyduje potem poziom postaci.
3. **Tylko pracujący.** W tym porządku są tylko postacie, które pracowały w jakiejś profesji. Postać bez profesji nie ma tu miejsca („Twoje miejsce” się wtedy nie pokazuje).
4. **Kolumna Profesja** pokazuje się tylko w tej zakładce, żeby dwie pozostałe zostały czytelne na wąskim telefonie.

## Kwiat paproci: nowe zdarzenie (28.10.2026, w grze od 0.0.48)

Autor: „Wymyśl i zaproponuj nowe zdarzenie. Możesz je nawet wdrożyć na serwer testowy, jutro je sprawdzę”.

1. **Co się dzieje.** Wśród paproci żarzy się kwiat paproci. Kto go zerwie, temu podobno szczęście już nie odstąpi, ale coś porusza się między głazami. Kwiatu strzeże Licho (przypadek „Licho strzeże kwiatu”, 50%) albo nikt (przypadek „Kwiat bez stróża”, 50%).
2. **Opcje.**
    - **„Zerwij kwiat”** to ryzyko za dużą nagrodę. Ze strażnikiem kończy się walką z Licho na poziomie postaci, a bez niego daje przedmiot: rzadki (30%), unikatowy (50%) albo epicki (20%).
    - **„Obserwuj z ukrycia”** to ostrożność za małą nagrodę. Licho odchodzi i zostaje złoto (4 × złoto za poziom, jak u rannej kobiety 5), a bez strażnika kwiat gaśnie i nic się nie dzieje.
    - **„Odejdź”** nic nie daje i nic nie kosztuje.
3. **Gdzie.** Tylko tam, gdzie żyje Licho, elita Uroczyska Kamieni: w Omszałych Głazach, na Rysiej Grani, w Wilczych Kręgach i w Sercu Uroczyska (tak jak ranna kobieta tylko przy Błędnicy).
4. **Zatwierdzone.** Do 0.0.47 zdarzenie miało `draft`, więc przychodziło tylko w wersji testowej, z dopiskiem „(szkic)” w „Testuj zdarzenia”. Autor zatwierdził je 29.10.2026 („Zatwierdzam zdarzenie kwiatu paproci”), więc od 0.0.48 przychodzi też w grze głównej.
5. **Grafiki** (kwiat i nocna polana z głazami) są z Retro Diffusion, po dwie wersje. Autor wybrał kwiat z drugiej wersji i polanę z pierwszej (29.10.2026). Kwiat stoi na środku polany (`figure`: 41% od lewej, 6% od dołu, 50% wysokości).

## Osiem stworów dla poziomów 66–100 (0.0.47)

Autor: „Zbuduj liste kolejnych stworów na kolejne poziomy i tak jak teraz opisy, materiały, dźwięki itd.” Regiony wewnętrzne poziomów 51–65 i Stare Koryto miały już po 4 zwykłe stwory. Pozostałym brakowało ośmiu.

1. **Stwory** (pozycja w walce, materiał, rzadkość materiału):
    - Wierzbowe Kępy (66–70): **Zwid** (tył), Okruch zwidu (pospolity).
    - Żurawie Łąki (76–80): **Cietrzew** (środek), Pióro cietrzewia (unikalne).
    - Pijawkowe Oczka (81–85): **Pływak** (środek), Pokrywa pływaka (epicka).
    - Rosiczkowe Pole (86–90): **Sowiszcze** (tył), Pióro sowiszcza (rzadkie). Autor zmienił nazwę z proponowanej Pójdźki.
    - Tlące się Torfy (91–95): **Żmij** (przód), Łuska żmija (epicka), i **Zaduch** (środek), Tlący węgielek (pospolity).
    - Stare Wyrobisko (96–100): **Skarbnik** (tył), Lampka skarbnika (rzadka), i **Szczur** (środek), Szczurzy ogon (pospolity).

    Rzadkości uzupełniają to, czego w danym regionie brakowało, więc każdy ma materiał każdej z czterech rzadkości.
2. **Wybór autora** (29.10.2026): Zwid lewy, Cietrzew prawy, Pływak prawy, Sowiszcze prawe, Żmij prawy, Zaduch lewy, Skarbnik prawy i Szczur lewy, a materiały wszystkie z lewej. Okrzyki autor zatwierdził, więc w grze grają na zmianę obie wersje okrzyku bólu i śmierci. Identyfikatory zostają ze szkiców, np. `little-owl` dla Sowiszcza.
3. **Szkice.** Grafiki i okrzyki powstały przed zatwierdzeniem listy, żeby autor mógł wybierać od razu. Kosztowały ok. 6,1 USD z Retro Diffusion i 564 kredyty ElevenLabs. Pierwszy przebieg okrzyków nie ruszył, bo limit 400 kredytów był za niski.
4. **Zaduch.** Wybrana wersja miała dym ucięty prostą krawędzią kadru. Jest przesunięta o 3 piksele w lewo, a jej dwie smugi dymu zwężają się w szpic przed krawędzią, tak jak ogon Połoza.
5. **Ataki** dobrane do stworów z tego samego regionu:
    - Zwid: Omamiający blask (magia elektryczności, duży rozrzut);
    - Cietrzew: Bitewny trzepot;
    - Pływak: Chwyt żuwaczek, z pancerzem jak u raka i odpornością na wodę;
    - Sowiszcze: Bezszelestne szpony;
    - Żmij: Ognisty kęs z Oparzeniem; jest odporny na ogień i słaby na mróz;
    - Zaduch: Gryzący dym z Zatruciem;
    - Skarbnik: Blask latarni z Oparzeniem;
    - Szczur: Zajadłe ugryzienie z Zatruciem.
6. **Spotkania.** Każdy nowy stwór przychodzi sam, w parze ze stworem ze swojego regionu i w jednym spotkaniu wymagającym. Opisy sześciu regionów wymieniają nowe stwory.
7. **Afiksy.** Żmij daje przedrostek „Smoczy”, bo „Żmijowy” należy już do Żmii, a przyrostek „Żmija”. Cietrzew daje „Cietrzewi” i „Cietrzewia”, a Szczur „Szczurzy” i „Szczura”. Pozostałe dają tylko przyrostki: Zwida, Pływaka, Sowiszcza, Zaducha i Skarbnika.
8. **Bestiariusz.** Osiem stworów dochodzi do `laterCreatures`. Dzięki temu skrzynia otwarta przed 0.0.46, zapisana bez liczby stworów, też otwiera się znowu po poznaniu nowych stworów.
9. **Balans** (`tools/simulate.mjs`, 1500 wypraw na wiersz, wyprawy 60-minutowe, poziomy 68, 78, 83, 88, 93 i 98). XP na godzinę, omdlenia i czas do poziomu są takie jak przed zmianą, w granicach losowości. Na 68. poziomie poziom trwa 8,7–8,9 godziny (cel 8,8), a wcześniej 8,4–8,5. Na 98. poziomie poziom trwa 9,5–11,4 godziny (cel 9,8), a wcześniej 9,3–10,7.

## Zadania „Odblokuj dostęp” tylko tygodniowe i coraz mniejsze (29.10.2026, 0.0.48)

Autor: „Do tego - trzeba dostosować zadania z odblokowywaniem regionów. Na niższych lvlach tygodniowo max 3, a później 2 i 1, az całkiem te zadania znikają. Dziennie max 1, ale najlepiej, żeby wcale w dziennych tego nie było.”

1. **Bez dziennych.** Rodzaj `unlock` nie ma już okresu `daily`, więc zadania dzienne nie proszą o regiony.
2. **Tygodniowe coraz mniejsze** (`most` w `data/quests.json`). Do 9. poziomu klasy zadanie prosi o 2–3 regiony, od 10. poziomu o 2, a od 20. o 1. Od 30. poziomu znika (`untilClassLevel` z 25 na 30). Jak dotąd nie prosi o więcej regionów, niż otwiera się w zasięgu 15 poziomów klasy.
3. **Skąd progi.** Według krzywej z 0.0.30 trzy regiony od 1. poziomu klasy to ok. 3,4 godziny wypraw. Dwa regiony od 10. poziomu to ok. 4 godziny, a jeden od 20. też ok. 4 godziny. Od 25. poziomu jeden region to ok. 6,5 godziny, a od 30. już ok. 10 godzin, więc tam zadanie znika.
4. **Zastępuje** punkty 2 i 3 z „Zadania: „Odblokuj dostęp do N nowych regionów”” (28.10.2026). Zadania już wylosowane zostają do końca swojego okresu. Nowa postać dalej dostaje 5 zadań dziennych, wylosowanych spośród stworów Skraju, wszystkich stworów i czasu wypraw.

## Krzywa XP zostaje (29.10.2026)

Prośba autora: pierwsza ewolucja po ok. 30 godzinach wypraw zamiast 23. Liczba 23 pochodziła ze starej notatki sprzed spowolnień z 0.0.27, 0.0.28 i 0.0.30. Według obecnej krzywej 50. poziom klasy przychodzi po ok. 81 godzinach eksploracji, przy ok. 44. poziomie postaci, a 100. po ok. 400. Po tej informacji decyzja autora: „Zostaw aktualny XP curve”.

1. **Bez zmian.** Krzywa z 0.0.30 zostaje, z dalszym spowolnieniem po 50. poziomie klasy, jakie już ma.

## Przedmioty od 25. i 50. poziomu klasy: wybory autora (29.10.2026)

Autor: „Kolejnym krokiem będzie dodanie nowych przedmiotów do ekwipunku, nowych ziół i mikstur. Zajmiemy się tym jeszcze przed zajęciem ewolucją klas”. Propozycja: trzecia i czwarta baza w każdej z 22 kategorii, od 25. i od 50. poziomu klasy, z premią jak u przedmiotów od 10. poziomu, po jednym szkicu Retro Diffusion na przedmiot. Autor ocenia je w czacie, przedmiot po przedmiocie.

1. **Od 25. poziomu klasy (1–22).** Wszystkie 22 szkice są zatwierdzone, z dwiema zmianami:
    - „Łuk długi” nazywa się **Długi łuk** (autor: „Długi łuk (zamień miejscami nazwę)”);
    - **Posoch**: opis zostaje, ale szkic do powtórki („opis dobry, ale wygeneruj nowe”). Nowy szkic pokazuje całą laskę od końca do końca.
2. **Muzyka ewolucji.** Od autora jest utwór z Suno „Ewolucja klasy” (3 min 25 s). Leży w `src/client/audio/music/evolution-v1.mp3`, bez okładki i metadanych, i zagra na ceremonii, gdy ewolucje powstaną.
3. **Kwiat paproci także ze zdarzenia.** Zioło Kwiat paproci daje Zielarstwo dopiero od 90. poziomu, po ok. 2000 godzinach zbierania. Wybór autora w czacie: w przypadku „Kwiat bez stróża” zdarzenia Kwiat paproci raz na 4 razy zamiast przedmiotu zostaje 1 Kwiat paproci.
4. **Od 50. poziomu klasy (23–44).** Wszystkie 22 szkice są zatwierdzone. Tarcza herbowa: autor: „dokończ szary kontur i będzie super”, więc jasny stalowy brzeg w lewym górnym rogu jest dorysowany piksel po pikselu. Z dwóch nowych szkiców Posochu wybrana jest wersja B.
5. **W grze od 0.0.49:**
    - 44 nowe bazy w `data/item-bases.json`, po dwie w każdej z 22 kategorii: od 25. i od 50. poziomu klasy. Współczynnik to współczynnik pierwszej bazy razy 1,10 (od 25.) albo 1,15 (od 50.), zaokrąglony w górę do setnych, np. Miecz 1,2, Pałasz 1,26, Szabla 1,32, Koncerz 1,38. Premie są takie jak na kartach do oceny, np. Szabla +12–19, Koncerz +23–36;
    - na wyprawach baza wypada tam, gdzie zakres poziomów miejsca sięga jej poziomu klasy, a w cotygodniowej skrzyni od tego poziomu klasy postaci. Kategoria z czterema bazami nie wypada częściej niż wcześniej: najpierw losuje się kategoria, a potem jedna z jej dostępnych baz;
    - dwie bazy mają inne id niż szkice, bo te nazwy nosiły już inne rzeczy w grze: Kryształ to `quartz-crystal` (afiks `crystal`), a Bursztyn to `amber-charm` (część `amber`);
    - **wzory w Warsztacie** (brakujący szczegół): wzór bazy od 25. poziomu klasy odsłania się na 25. poziomie Rzemieślnictwa, a od 50. na 50. Wcześniej każda dalsza baza miała wzór od `laterPatternLevel`, czyli od 10. Rozbiórka takiego przedmiotu nadal od razu uczy jego wzoru;
    - symulacja balansu (`tools/simulate.mjs`) liczy, jak dotąd, ekwipunek z pierwszych baz kategorii. Dalsze bazy są więc zapasem siły ponad nią i nie zmieniają jej tabel.

## Sprawdzenie balansu pod obecne wyprawy (29.10.2026)

Autor: „Trzeba bedzie zbalansowac reszte rzeczy pod nowa formule polowan (albo sprawdzić po prostu czy nie jest to przesada) - zadania, szybkosci awansu itp itd”, a w trakcie sprawdzania: „Pamiętaj, w kwestii balansu, że nie może być za łatwo tez.” i „Jest wiele opcji, ekwipunek nabywany itp. Tobie symulacja może pokazywać że są omdlenia a w rzeczywistosci nie ma - dzieki ekwipunkowi i innym rzeczom dla przykładu.”

1. **Tempo awansu.** Symulacja (`tools/progression`, po 60 postaci na klasę, z umiejętnościami obu ścieżek, ale bez Kowadła, mikstur, Warsztatu i zakupów) daje 50. poziom klasy po 87 (Wojownik) do 103 (Kleryk) godzinach wypraw, przy ok. 45. poziomie postaci. Krzywa zakłada ok. 81 godzin, więc tempo jest bliskie założeniom. Różnicę robią omdlenia, które w grze łagodzą sprzęt, Kowadło i mikstury.
2. **Omdlenia.** W symulacji mdleje 7–17% wypraw. Najtrudniej jest na wejściu do nowego regionu wewnętrznego na jego najniższym poziomie: w Żmijowym Zwalisku (16.), Dziczej Głuszy (21.–22.) i Omszałych Głazach (26.). Stwory zostają bez zmian, zgodnie z uwagami autora. Symulacja nie zna sprzętu z Warsztatu, Kowadła ani mikstur, a gracz widzi zagrożenie przed wyprawą.
3. **Trop elity i czempiony** nie przyspiesza awansu i nie daje więcej złota z wypraw: tempo jest to samo, a od 41. poziomu jest trochę więcej omdleń. Zostaje bez zmian.
4. **Zadania** nie dają XP, więc nie przyspieszają awansu. Złoto z zadań dziennych to równowartość ok. 0,5–1 godziny wypraw. Wymagania pasują do obecnego tempa: 30–90 minut wypraw dziennie, 5–10 godzin tygodniowo, a od 20. poziomu klasy jeden nowy region tygodniowo, czyli 5 poziomów klasy, ok. 8–13 godzin wypraw. Bez zmian.
5. **Dodatkowy czas.** Punkty Czasu (1 na 30 minut oraz skrzynie zadań) przewijają ok. 1,5 godziny wypraw dziennie. Szybkie Polowania dają 45 minut dziennie, a Błyskawiczne 30–60 minut. Razem to do ok. 3 godzin dziennie. Najbardziej pomaga to graczom, którzy zaglądają rzadko i do 24. poziomu mają wyprawy najwyżej 30-minutowe. Zostaje tak, jak autor ustalił.
6. **Narzędzie.** Symulacja przyjmuje teraz opcje wyprawy gracza (`hunt` w polityce, np. `seekRare`).

## Wersja 0.0.58 bez ewolucji klas (29.10.2026)

Autor: „W nocy (około 23 w nocy, za godzinę) wdroż 0.0.58 bez tego co nie udało Ci sie zrobić”, „ukryj po prostu Ewolucje klas chwilowo i zrob wdrożenie reszty rzeczy co wykonałeś od 0.0.57”.

1. **Ewolucje ukryte w grze.** Przełącznik `EVOLUTIONS` w `wrangler.jsonc` ma w grze wartość „off”, a na wersji testowej „on”. Bez ewolucji gra działa jak w 0.0.57: na 50. poziomie klasa czeka tylko na ścieżkę poboczną i Punkty Umiejętności, a potem rośnie dalej. Nie ma zakładki Ewolucja, wiadomości Systemu o jej odblokowaniu ani wyboru ewolucji. Statystyki mówią przy poziomie klasy „EWOLUCJA KLASY: WKRÓTCE”, a zapytania o ewolucję serwer odrzuca. Kolumny bazy dla ewolucji (migracje 0052 i 0054) powstają też w grze, ale zostają puste. Gdy ewolucje będą gotowe, wystarczy usunąć ten wpis i wdrożyć grę.
2. **Co wchodzi do gry w 0.0.58:**
    - złota kropka i ramka w Encyklopedii przy skrzyni do odebrania oraz zwijane tiery i krainy (zob. „Uwagi autora po 0.0.57”);
    - kod podarunkowy JESTEMTESTEREM w Ustawieniach (zob. „Uwagi autora: kod podarunkowy i zakładka Ewolucja”, punkt 1). Wdrożenie jest 29 października, więc „2 tygodnie, licząc od jutra” liczą się od 30 października i kod działa do końca 12 listopada, jak było ustalone;
    - szybszy start gry: okrzyki stworów ładują się z walką (zob. „Zacinanie i długie ładowanie: dźwięki stworów”).
3. **Co czeka na wersji testowej:** ewolucje klas z umiejętnościami, cechami, portretami, chodem w walce, zerowaniem statystyk i „Testuj ewolucję”. Ich grafiki są już w plikach gry, ale gra ich nie pokazuje.
4. **Napis w Statystykach na wersji testowej.** Klasa czekająca na wybór ewolucji ma napis „KLASA CZEKA: WYBIERZ EWOLUCJĘ”, bo wybór jest w zakładce Ewolucja, a nie w Umiejętnościach. Klasa, która przeszła 50. poziom przed ewolucjami, nie czeka, więc ma napis „WYBIERZ EWOLUCJĘ KLASY”.

## Uwagi autora po 0.0.57 (29.10.2026, w grze od 0.0.58)

1. **Kolejność pracy.** Autor: „Sklep Systemu jednak później.” Potem: „Najpierw te 2 punkty co mówisz, poźniej zwijanie Tierów w encyklopedii, zeby tez nie trzeba bylo tyle scrollować i wtedy Ewolucje.” Najpierw idą kropka z ramką w Encyklopedii i propozycja samouczka, potem zwijanie tierów, potem ewolucje, a Sklep Systemu po nich.
2. **Kropka i ramka w Encyklopedii.** Autor: „Do Encyklopedii jesli nie dodales ramke i kółeczko żółte z powiadomieniem też dodaj jak ktoś zapełni cały tier czegokolwiek i jest skrzynka do odebrania.”
    - Zakładka, w której czeka skrzynia, ma złotą kropkę w rogu. Dotyczy to Przedmiotów (zestaw), Mikstur, Ziół, Materiałów i Części (próg odkryć) oraz Bestiariusza.
    - Złotą ramkę, jak gotowa umiejętność, ma to, czego skrzynia czeka: zestaw przedmiotów, karta „Skrzynie za odkrycia” albo kraina i region wewnętrzny w Bestiariuszu.
    - Gdy w widoku postaci przybędzie skrzyń do otwarcia, otwarty ekran sam pobiera Encyklopedię jeszcze raz.
3. **Samouczek o Encyklopedii i Bestiariuszu.** Autor: „W kolejnej rundzie rozbudujemy tez Samouczek początkowy o Encyklopedie i Bestiariusz. Zaproponujesz co i jak i pewnie tylko zatwierdzę, oby.” Propozycja miejsc i kwestii narratora idzie do autora w czacie. Nagrania powstają po zatwierdzeniu tekstów.
4. **Zwijane tiery.** Autor: „poźniej zwijanie Tierów w encyklopedii, zeby tez nie trzeba bylo tyle scrollować”.
    - Tiery w Przedmiotach, Miksturach, Ziołach i Materiałach zwijają się pod nagłówkiem, jak „Opcje wyprawy”. Nagłówek podaje, ile z tieru jest odkryte. Złota kropka przy nagłówku znaczy, że w tierze czeka skrzynia zestawu.
    - Na start rozwinięty jest tier, w którym postać jest teraz: przedmioty według poziomu klasy, mikstury według poziomu Alchemii, zioła według poziomu Zielarstwa, a materiały według poziomu postaci. Rozwinięty jest też każdy tier z czekającą skrzynią (brakujący szczegół).
    - Krainy w zakładce Bestiariusz zwijają się tak samo. Na start rozwinięta jest kraina poziomu postaci i każda z czekającą skrzynią.
    - Gra pamięta, co gracz zwinął albo rozwinął, dopóki jest otwarta.

## Uwagi autora: kod podarunkowy i zakładka Ewolucja (29.10.2026, kod w grze od 0.0.58, zakładka na wersji testowej)

1. **Kod podarunkowy.** Autor: „Wygeneruj tez w ustawieniach opcje dodania gift code: JESTEMTESTEREM. Pozniej w przyszłości moze inne jeszcze ale na razie ten. Niech daje 100 Punktów Systemu, 100 Punktów Czasu, 1000 złota i po 100 każdego z zasobów. Niech ma ważność 2 tygodnie, licząc od jutra. I oczywiscie ten gift code jednorazowy.”
    - W Ustawieniach jest wiersz „Kod podarunkowy” z przyciskiem „Wpisz kod”. Wielkość liter, spacje i myślniki nie mają znaczenia. Po przyjęciu kodu komunikat wymienia nagrody.
    - „Jednorazowy” znaczy raz na konto (brakujący szczegół): kod odebrany raz nie działa ponownie ani po „Zacznij od nowa”, ani dla nowej postaci tego konta. Nagrody idą do postaci, a zasoby to drewno, kamień i ruda żelaza.
    - „2 tygodnie, licząc od jutra”: kod działa do końca 12 listopada 2026 czasu polskiego, czyli 14 dni od 30 października (brakujący szczegół). Działa też od razu po wdrożeniu, żeby autor mógł go sprawdzić.
    - Kody są w `data/gift-codes.json`, a kto odebrał który, zapisuje tabela `gift_codes_used`, kasowana razem z kontem. Repozytorium jest publiczne, więc kod w nim widać. Kodowi dla testerów to nie szkodzi, ale kod tylko dla wybranych osób trzeba by zapisać inaczej, np. jako skrót.
2. **Zakładka Ewolucja.** Autor: „Do Ewolucji (klasy) będzie trzeba zrobić zablokowany do poz.50 klasy modul osobny w zakładce postaci. Między Rdzeniem (który przyjdzie później) a Umiejętnościami.”
    - Pasek Postaci ma teraz pięć zakładek: Powrót, Statystyki, Umiejętności, Ewolucja, Rdzeń. Ewolucja jest zablokowana do 50. poziomu klasy, a na 50. poziomie przychodzi wiadomość Systemu o jej odblokowaniu.
    - W zakładce są karty dwóch ewolucji do wybrania, gdy obie ścieżki są gotowe, a po wyborze karta ewolucji. Dopóki ścieżki nie są gotowe, zakładka mówi, czego brakuje, i prowadzi do Umiejętności. W Umiejętnościach zostają same umiejętności i punkty.
    - Złota kropka na zakładce Ewolucja i na Postaci znaczy, że ewolucja czeka na wybór. Ewolucja wypróbowana przez „Testuj ewolucję” poniżej 50. poziomu też otwiera zakładkę.
    - Napisy na pasku są o włos mniejsze, żeby „Umiejętności” mieściły się na wąskim telefonie.
3. **Zdanie ceremonii.** Autor: „albo "Rozdaj Punkty Umiejętności na nowe zdolności" lepiej”. Karta ceremonii mówi teraz: „Twoja nowa klasa to: {nazwa}. Rozdaj Punkty Umiejętności na nowe zdolności.” To samo zdanie stoi w zakładce Ewolucja, dopóki zostają punkty do rozdania.
4. **Zerowanie statystyk po ewolucji.** Autor: „Zrób też tak, że po Ewolucji klasy wszystkie statystyki się zerują na życzenie gracza i gracz może je rozdać na nowo (bo po ewolucji może potrzebowac innych), ostrzeż, że to darmowe jednorazowo. Musi od razu zdecydować o wyzerowaniu przy wyświetleniu tego okienka (niech bedzie napis "zalecane" przy "Zeruj")”.
    - Zaraz po karcie ceremonii System pyta: „Wyzerować statystyki?”. Okienko ostrzega, że to zerowanie jest darmowe jednorazowo. Nad przyciskiem „Zeruj” stoi „zalecane”, pod nim jest „Zostaw statystyki”.
    - Autor: „Zeruj powinno oddawac wszystkie punkty i klasy i postaci i wszystkie rozdane ręcznie”. Zerowanie oddaje do puli wszystkie rozdane punkty: z poziomów postaci (8 na poziom), z poziomów klasy (2 na poziom, czyli 98 na 50. poziomie klasy) i ze zdarzeń, rozdane ręcznie i przez „Rozdaj według klasy”. Okienko podaje, ile punktów będzie do rozdania od nowa i skąd. Część „klasa” na paskach statystyk, czyli statystyki startowe klasy i jej przyrost na poziom, to nie punkty do rozdania, więc zostaje.
    - Okienko nie ma krzyżyka i nie zamyka się stuknięciem obok. Zamknięte inaczej (np. gestem wstecz) albo przerwane zamknięciem gry wraca, dopóki gracz nie wybierze (brakujący szczegół). Pokazuje się, gdy postać jest w obozie, a narrator nie mówi.
    - Każda odpowiedź jest ostateczna: po „Zostaw statystyki” darmowego zerowania już nie ma. Przedmioty i profesje zerowanie omija.
    - Gdy przed ewolucją nie było rozdanych punktów, okienko się nie pokazuje, bo nie ma czego zerować (brakujący szczegół).
    - Na wersji testowej „Cofnij ewolucję” oddaje też punkty sprzed zerowania.
    - Przy okazji: na Statystykach trzy profesje z wysokimi poziomami nie mieściły się w jednym rzędzie na wąskim telefonie i rozpychały ekran, przez co okienka ucinały się u dołu. Teraz przechodzą do drugiego rzędu.

## Zacinanie i długie ładowanie: dźwięki stworów (29.10.2026, w grze od 0.0.58)

Autor: „ej a gra coś zacina, znasz tego powód? długie ladowania itp nie tylko u mnie”.

1. **Przyczyna.** Przy każdym starcie, po pierwszym dotknięciu, gra pobierała i dekodowała wszystkie 407 plików dźwięków, z czego 359 to okrzyki 90 stworów i postaci. Z każdym nowym stworem było ich więcej. Na telefonie zajmowało to łącze i procesor, a rozpakowane dźwięki zajmowały dużo pamięci. Serwer odpowiada szybko: na kopii lokalnej z postacią na 80. poziomie każde wejście API zajmuje 10–70 ms.
2. **Poprawka.** Po pierwszym dotknięciu ładują się tylko odgłosy ciosów i dźwięki nazwane (zakładki, umiejętności): 48 plików zamiast 407. Okrzyki stworów i postaci z danej walki ładują się, gdy powstaje jej odtwarzanie. Rozpakowane zostają okrzyki ostatnich 24 stworów. Kwestia narratora, przeczytana raz, nie zostaje w pamięci. W przeglądarce ze spowolnionym procesorem (jak telefon) start gry trwał 2,9 s, a teraz trwa 0,8 s. Zapytań przy starcie było 502, a jest 143.
3. **Muzyka.** Utwór miejsca pobiera się w całości przy pierwszym wejściu na jego ekran: 3,6–4,8 MB, w jakości ok. 170 kb/s. Lżejsze pliki (ok. 112 kb/s, o jedną trzecią mniejsze) są propozycją dla autora, bo zmieniają brzmienie jego utworów.

## Osada: odpowiedzi autora (30.10.2026)

Odpowiedzi na pytania 67–129 z porannego raportu, w czacie. Gdzie autor tylko wybrał literę, obowiązuje propozycja z pytania.

1. **Rozstaje, otwarcie i wspólny świat (67–72):** nazwa Rozstaje; zakładka Osada otwiera się na 20. poziomie postaci z komunikatem Systemu; Osada działa także w czasie wyprawy, z wyjątkami jak w obozie; Osada się nie buduje, rośnie reputacja (autor: „70 tylko A”); jeden świat dla wszystkich, a zlecenia losowane dla każdej postaci osobno; narrator przedstawia Osadę w nowej części wprowadzenia (teksty do zatwierdzenia przed nagraniem).
2. **Miejsca (73–74).** Plansza jak obóz, z miejscami do stuknięcia. Autor: „Usuwamy złomiarza z Osady, a Targ bedzie podzielony na dwa - oferty NPC w jednej zakładce (oferty mieszkańców) i miejsce do wystawiania ofert przez graczy (oferty graczy)”. Złomiarz zostaje tylko w Skupie złomu w obozie, bez twarzy w Osadzie.
3. **Wygląd (75).** Autor: „Tak - A tylko Osada musi być dostojniejsza i wieksza niz Obóz, to bedzie wymagało pewnie albo mniejszych sprite'ów albo zwiekszenia miejsca na całą Osadę”. Drewniane chaty ze strzechą i gontem, palisada i studnia na placu, na planszy wyższej niż obozowa (szkice: pytania od 152).
4. **Mieszkańcy (76–78, 125–128):** ekran mieszkańca z popiersiem, powitaniem i usługami; mieszkańcy na razie tylko w tekście; własna muzyka Osady (utwór autora); pięcioro mieszkańców na start, a Targ według punktu 2 i 9 (autor przy 125: „poza Targiem, ktory ma dzialac bardziej jak Aukcje”); imiona, wygląd i historie proponuje Claude, a autor poprawia; każdy ma później wątek 3–5 zadań i krótkie rozmowy raz dziennie.
5. **Reputacja (79–87):** bractwa (Zielarzy, Kowali, Łowców i Kompania Kupców) i osobna relacja z każdym mieszkańcem; stopnie Obcy, Znajomy, Stały klient, Zaufany, Przyjaciel; stopnie bractw dają rabaty, lepszy towar, zlecenia specjalne i receptury; relacja otwiera usługi mieszkańca; ok. 2 miesiące do Przyjaciela; na start zlecenia i handel; reputacja spada tylko przez zdarzenia; tytuł Przyjaciela w karcie postaci.
6. **Tablica zleceń (88–95):** 3 zlecenia naraz, nowe po 3 godzinach, i zlecenie tygodnia; bez łupów z wypraw; jakość od Stałego klienta; 1 PS za co trzecie zlecenie i 5 za tygodniowe; odrzucanie za darmo; zdania zamawiających z puli w danych; zadania narratora o zleceniach. Przy 93 autor: „B, ale terminy tygodniowe”: zlecenie wisi tydzień od pojawienia się, a potem w jego miejsce przychodzi nowe.
7. **Zaklinaczka (96–103):** najpierw usługi, a profesja Zaklinanie później (96 C); przekucie jednego afiksu, z tego samego miejsca, zawsze udane; zaklęcie żywiołu w III części; przeniesienie afiksu od wysokiej relacji; podniesienie rzadkości dopiero z profesją (103 C). Przy 97 autor: „A, ale z czasem rozwoju Reputacji możliwość wybrania afiksu z 2-3 dostępnych”. Przy 99 autor: „Chodzi Ci o zaklęcie przedmiotu? Jeśli tak to Tak”: tak, chodzi o przekucie afiksu u Zaklinaczki, więc koszt zostaje jak w pytaniu.
8. **Karczma i towarzysze (104–116), część II:** werbunek w Karczmie, a towarzysz mieszka w Kwaterach w obozie; pierwszy od 2. stopnia relacji z karczmarzem, drugi od 4.; ekwipunek z plecaka, cechy w walce, prezent z profesji raz w tygodniu, plotki za kufel. Autor:
    - 106: „B i to czterech tylko (bo za dużo byśmy musieli generować ich)”: czterech kandydatów co tydzień;
    - 107: „B - musza sie istotnie odróżniać od graczy”: nowe twarze, wyraźnie inne niż portrety graczy;
    - 109: „A, ale dwie umiejetnosci klasy, by ktos grający solo nie miał dużo gorzej niż w co-opie”;
    - 110: „rezygnujemy z Pensji, bo towarzysze sami beda sie tez rozwijac podczas misji i (umownie) zdobywać własne łupy. To mniej werbunek a bardziej budowanie drużyny (jak z innymi graczami). Te łupy ich nie beda sie nigdzie wyswietlać, ale wiesz o co chodzi.”;
    - 113: „A, przy czym nie jest ranny kilka godzin, a tyle ile gracz, bo towarzysz też może korzystac z Ogniska w Obozie”: ranny towarzysz odpoczywa jak postać, a Punkty Czasu skracają to tak samo;
    - 114 C: robotnicy w obozie w IV części;
    - 115: „C, bez miejsca na tabelę gildii (bo te graczy będą tylko w zakładce Społeczność)”.
9. **Targ, zielarka i Pustelnik (117–124):** Targ według punktu 2, jak aukcje (117, 118: „jak wyżej”); wędrowny handlarz raz w tygodniu, na dobę, ten sam dla wszystkich; limit dotyczy tylko reputacji, a autor przy 120: „A, wyspecjalizowani kupcy płacą więcej niż złomiarz”; Chata zielarki; zerowanie ścieżki za ok. dwa dni dochodu; zmiana ewolucji za złoto (pierwsza darmo, potem 100 000 i każda kolejna dwa razy drożej); płatne zerowanie statystyk od 21. poziomu.
10. **Kolejność (129 A):** I: plansza, reputacja, Tablica zleceń, Zaklinaczka i Pustelnik; II: Karczma z plotkami i pierwszy towarzysz z Kwaterami; III: Targ, zaklęcie żywiołu i Chata zielarki; IV: wątki, dary, drugi towarzysz i robotnicy. Drobiazgi z raportu autor przyjął: „Drobiazgi - zgadzam się”.

## Osada, część I (30.10.2026, na wersji testowej)

Wszystko działa tylko tam, gdzie `SETTLEMENT` jest `on` (`wrangler.jsonc`, środowisko testowe). W grze Osada zostaje zakładką, która od 20. poziomu postaci pokazuje „Moduł Osada pojawi się w jednej z kolejnych aktualizacji gry”. Do czasu planszy (pytania od 152) Osada jest listą: tablica, bractwa i mieszkańcy.

1. **Rozstaje** (`data/settlement.json`): Tablica zleceń (sołtys Bogumił), Pracownia Zaklinaczki (Wiedana) i Pustelnia (Sambor) działają; Karczma (Zbylut), Targ i Chata zielarki (Jagna) stoją jako „wkrótce”. Imiona to propozycje do poprawy przez autora. Powitania mieszkańców zmieniają się ze stopniem relacji i nie mają form męskich ani żeńskich.
2. **Bractwa i stopnie.** Bractwo Zielarzy zamawia zioła i mikstury, Bractwo Kowali części, zasoby i wyroby Warsztatu, Bractwo Łowców materiały ze stworów, a Kompania Kupców czeka na Targ. Stopnie: Obcy 0, Znajomy 50, Stały klient 250, Zaufany 700 i Przyjaciel 1400 punktów, czyli ok. 2 miesiące do Przyjaciela przy ok. 7 zleceniach dziennie i zleceniu tygodnia.
3. **Tablica zleceń.** Naraz wiszą 3 zlecenia, a w miejsce oddanego albo odrzuconego nowe przychodzi po 3 godzinach. Zlecenie wisi tydzień od pojawienia się, a potem w jego miejsce od razu przychodzi nowe; karta zlecenia pokazuje, ile czasu zostało. Zlecenie prosi tylko o to, co postać już umie zdobyć: zioła znane w Zielarstwie, mikstury znane w Alchemii, materiały spotkanych stworów (bez trofeów elit i czempionów), zasoby obozu, części do rzadkich i wyroby Warsztatu znanych wzorów. Bractwo losuje się pierwsze, więc reputacja u każdego rośnie w tym samym tempie. Zlecenie tygodnia prosi o 4 razy więcej sztuk i płaci 5 razy więcej.
4. **Wyroby Warsztatu** (79 A i 89 A): jedna albo dwie sztuki wzoru, który postać zna, zrobione w Warsztacie, nigdy łup z wyprawy. Oddaje się je z plecaka, w domu, najpierw najsłabsze, nigdy założone. Zlecenie płaci więcej niż złomiarz, a mniej niż zrobienie wyrobu z części i zasobów kupionych najtaniej w obozie.
5. **Zapłata.** Zlecenie płaci więcej niż złomiarz za zioła (×1,6), mikstury (×1,4) i materiały (×1,6), a za zasoby, części i wyroby mniej, niż kosztują w obozie na najwyższym poziomie, także w zleceniu tygodnia, więc nie da się zarabiać na samym kupowaniu i oddawaniu. Pilnuje tego test w `test/settlement.test.js`.
6. **Jakość i zlecenia specjalne.** Od Stałego klienta 30% zleceń bractwa na materiały prosi o materiał o stopień rzadszy i płaci za niego 2 razy więcej. Od Zaufanego co czwarte zlecenie bractwa jest specjalne (82): daje 2 razy więcej reputacji i 1 Punkt Systemu, przy tej samej zapłacie.
7. **Punkty Systemu.** Co trzecie oddane zlecenie daje 1 PS, a zlecenie tygodnia 5 PS: przy ok. 7 zleceniach dziennie ok. 20 PS tygodniowo.
8. **Zaklinaczka.** Przekucie losuje na nowo jeden wybrany afiks: statystykę i liczbę, wśród afiksów tego samego rodzaju, bez afiksu, który przedmiot już ma. Stwór z nazwy przedmiotu zostaje, więc afiks pochodzi z tego samego miejsca. Koszt: 30 złota × poziom przedmiotu × mnożnik sprzedaży rzadkości, każde kolejne przekucie tego samego przedmiotu o 25% drożej, oraz materiały stworów: zwykłe do rzadkich i unikalnych przedmiotów, rzadkie do epickich i legendarnych. Zawsze się udaje, tylko w obozie, jak Kowadło. Od Znajomego Zaklinaczka losuje 2 nowe afiksy, a od Zaufanego 3, i gracz zatrzymuje jeden (97); do wyboru przekucie czeka w Osadzie, a innego afiksu nie da się przekuć.
9. **Pustelnik.** Zerowanie ścieżki: 200 złota za poziom postaci (np. 6 000 na 30. poziomie); umiejętności klasy wracają jako Punkty Umiejętności; po ewolucji nie działa, bo ścieżki zmieniają się z ewolucją. Zerowanie statystyk: od 21. poziomu, po darmowym do 20., 100 złota za poziom. Zmiana ewolucji (123 A), tam gdzie są ewolucje: na inną ewolucję tej samej klasy, pierwsza darmo, potem 100 000 złota i każda kolejna 2 razy drożej; umiejętności nowej ewolucji zaczynają od zera, a darmowe zerowanie statystyk wraca jak po pierwszej ewolucji.
10. **Relacje.** Oddane zlecenie daje 2 punkty relacji z sołtysem, przekucie 5 z Zaklinaczką, każda usługa Pustelnika 10 z nim. Mieszkańców usług wskazują dane (`orders.resident`, `reforge.resident`, `hermit.resident`).
11. **Zadania narratora.** Po otwarciu Osady zadania mogą prosić „Wykonaj 2 zlecenia w Osadzie” (dzienne) i „Wykonaj 8 zleceń w Osadzie” (tygodniowe).
12. **Komunikat Systemu** na 20. poziomie, tylko tam, gdzie Osada jest włączona: „Odblokowano Osadę. Mieszkańcy czekają w zakładce Osada.”
13. **Kropka** na zakładce Osada („zlecenie czeka”), gdy jakieś zlecenie na tablicy, także tygodniowe, da się już oddać.
14. **Muzyka** (78 A): utwór autora, przekodowany jak pozostałe (121 kb/s, 2,9 MB), gra na ekranie Osady, gdy jest otwarta.
15. **„Testuj Osadę”** w Ustawieniach wersji testowej, dla kont z trybem testowym: otwiera Osadę przed 20. poziomem (z zakładką i zadaniami), ustawia jeden stopień u wszystkich bractw i mieszkańców oraz wiesza nowe zlecenia na całej tablicy, z oddanym zleceniem tygodnia z powrotem.
16. **Zapis.** Kolumna `characters.settlement` (migracja 0055) trzyma reputację, relacje, tablicę, licznik oddanych zleceń, przekucie czekające na wybór i liczbę zmian ewolucji jako JSON. Zlecenia losują się z ziarna postaci i kolejnego numeru, więc ta sama tablica wychodzi przy każdym odczycie, a zmiany zapisują się tylko, gdy postać jest taka jak odczytana.
17. **Jeszcze nie ma:** planszy z obrazkami (pytania od 152), części narratora (teksty do zatwierdzenia), tytułu Przyjaciela w karcie postaci (87 A, gdy ktoś dojdzie do Przyjaciela, czyli po ok. 2 miesiącach) i usług z wyższych stopni relacji poza wyborem afiksu.

## Osada: uwagi autora z wersji testowej (30.10.2026, na wersji testowej)

1. **Zdania zleceń.** Autor: „"Strażnicy palisady chodzą bez uzbrojenia" w przypadku Broni.”, „"Most na brodzie" brzmi śmiesznie, do poprawy” i „"płaci za skóry" a chce żądła. Może "płaci za materiały"?”.
    - Zlecenie na broń z Warsztatu może mieć zdanie „Strażnicy palisady chodzą bez uzbrojenia. Wstyd przed kupcami.”, a na pancerz, hełm, rękawice i buty „Strażnicy palisady chodzą w łachmanach. Wstyd przed kupcami.”. Pozostałe dwa zdania pasują do każdego wyrobu (`craftStories` w `data/settlement.json`).
    - Zlecenie na surowce: „Most nad rzeką znowu się sypie.”, a na materiały: „Kuśnierz z miasta płaci za materiały więcej niż ktokolwiek tutaj.”.
    - Zlecenia, które już wiszą na tablicy, dostają przy odczycie nowe zdanie najbliższe dawnemu, więc poprawki widać od razu.
2. **Przekucie u Zaklinaczki.** Autor: „ekran wyboru przy afiksie powinien być ingameowy a nie taki brzydki. Do tego zaklinaczka przekuwa afiks a nie pokazuje na jaki. Nienaturalne i nieintuicyjne.”
    - Zamiast systemowych list arkusz ma wiersze z gry, krok po kroku: przedmioty z obrazkiem, rzadkością i znakiem „Założony”, potem afiksy wybranego przedmiotu (jedyny afiks jest od razu zaznaczony), materiały z obrazkami i liczbą sztuk, koszt i „Przekuj”. „Inny przedmiot” wraca do listy.
    - Po przekuciu arkusz pokazuje przedmiot i zmianę, np. „~~Witalność: +54~~ › Wytrzymałość: +54”, z przyciskami „Przekuj ponownie” (ten sam afiks i materiał, nowy koszt) i „Gotowe”. Przy bliższej relacji najpierw przychodzi wybór jednego z 2–3 wylosowanych afiksów, a potem ta sama zmiana.
    - Wybór, który czeka (arkusz zamknięty przed wyborem), zostaje w karcie Zaklinaczki z przyciskiem „Wybierz afiks”, który otwiera arkusz na tym kroku.
    - Autor: „wszedzie zmień "przekuła" na zaklęła w kontekście Zaklinaczki”. U Zaklinaczki są więc „Zaklęcie afiksu”, „Zaklnij afiks”, „Zaklnij”, „Zaklnij ponownie”, „Zaklinaczka zaklęła afiks” i „Zaklinaczka zaklnie jeden jego afiks”. Przekuwanie zostaje przy Kowadle w obozie.
3. **Mieszkańcy i Targowisko.** Autor: „156 Targ, a raczej jednak Targowisko powinno być w centrum Osady w formacie otwartym okrągłym” oraz przy popiersiach: „159 A by było fajne, ale ucięte (tekst do poprawy - nie "przed swoją", a "przed jego chatą") / 160 B by było super, ale też ucięło (tekst do poprawy - "Mówi mało, ale w jej przypadku rzeczywiście mowa jest srebrem a milczenie złotem. Wsłuchuje się bowiem w przedmioty i potrafi je zaklinać." / 161 A, jeśli urwany lewy dolny róg dokończysz (usunąć z opisu "jak Ty") / 162 Zbylut B ale też urwany / 163 Jagna A (ale zmieniamy tekst, bo ziół nie kupisz na Targu - "Za dobre zioła potrafi solidnie zapłacić, [...]"”.
    - Miejsce nazywa się „Targowisko”. Każdy mieszkaniec ma w danych swoją historię (`story`) w brzmieniu autora, widoczną w jego karcie nad powitaniem.
    - Popiersia: usuwanie tła w Retro Diffusion zjadło ciemne części ubrań (stąd „ucięte”), a to samo ziarno bez usuwania tła rysuje inne obrazy. Brakujące ubrania dorysowuje więc narzędzie inpainting na zatwierdzonych obrazkach, a reszta zostaje piksel w piksel.
    - Przy dorysowanych wersjach autor: „159 - głowa odstaje dalej i na A i B, jakby był urwant, barku nie miał / 160 - dalej urwana” i „Lepiej te urwane to weź te z tłem i usuń tło”. Sołtys ma więc popiersie z wersji narysowanej z tłem, z tłem usuniętym ręcznie, tak że kożuch sięga brzegów obrazka; autor: „to popiersie Sołtysa jest okey”. Zaklinaczka dostanie tak samo wersję narysowaną na gładkim tle.
    - Autor: „160 C”. Zaklinaczka ma popiersie C (światło w lewej dłoni, kryształy przy pasie), narysowane na gładkim tle, z tłem usuniętym ręcznie. Autor: „Pustelnia - zmień nazwę na Chata Pustelnika.”, więc miejsce Pustelnika nazywa się „Chata Pustelnika”.
4. **Plansza Osady (73 A, 76, 164).** Autor: „Plansza Osady musi byc o wiele wieksza niz to co pokazałeś i pod innym kątem pokazana, bo zbyt izometrycznie jest i nic sie nie zmieści prawie. Ja to bym dał nawet z 2 razy większą tę Osadę.”, a po pierwszej wersji: „drzewa krzaki poucinane, nachodza budynki na roslinność też, słabo”.
    - Plansza ma 384 × 768 pikseli, dwa razy wyższa niż obóz, widziana prosto z góry, i przewija się razem ze stroną. Środek z okrągłym placem to szkic Retro Diffusion; górę i dół dorysowało narzędzie outpainting, a palisada z bramą u góry i u dołu pochodzi z tego samego szkicu. W miejscach budynków i tam, gdzie drzewa i krzaki były ucięte, inpainting położył trawę, dopasowaną potem odcieniem i paletą do trawy wokół.
    - Miejsca stoją na planszy w swoich rozmiarach, z nazwą pod spodem, a Targowisko na placu pośrodku. Stuknięcie otwiera ekran miejsca: popiersie mieszkańca, jego historia, relacja i powitanie, a pod nimi usługi; Tablica zleceń ma tam zlecenia i bractwa, a na planszy kropkę, gdy jakieś zlecenie można oddać. Karczma, Targowisko i Chata zielarki mówią, że otworzą się w jednej z kolejnych aktualizacji.
    - Budynki i popiersia stoją na próbę, z wersji pokazanych w 153–163, do wyboru autora.
    - Autor: „aktualna plansza była już git” i „Saturacje w Osadzie zmniejsz zeby byla podobna do tej z Obozu jaskrawość”. Plansza zostaje ta sama. Pracownia Zaklinaczki to wersja A (154), a Targowisko wersja C (156).
    - Potem autor: „Zbliż saturację Osady do saturacji w Obozie i podobnie zrób system dnia i nocy co w Obozie już jest.” Obóz wygląda w grze ciemniej niż jego obrazki, bo gra nakłada na nie tony (`camp-art.js`): ziemia ma saturację 0,5 i jasność 0,7, a budynki saturację 0,5 i jasność ok. 0,72. Obrazki Osady wracają więc do oryginałów (bez wcześniejszego zmniejszenia saturacji), a gra nakłada na planszę i budynki Osady te same tony i to samo światło pory dnia co w Obozie: świt, dzień, zmierzch i noc według godziny w Polsce (`dayParts` w `data/animations.json`).
    - Autor: „171 ok, ale dodaj pochodnie w paru miejscach Osady, które będa działać jak małe ogniska i dawać poczucie tego, że Osada jest "żywa".” Na planszy stoi 7 pochodni (`torches` w `data/settlement.json`): po dwie przy bramie u góry i u dołu, przy placu Targowiska, przy Karczmie i przy Chacie Pustelnika. Płomień każdej migocze, a wokół niej pulsuje ciepły blask jak przy ognisku w obozie, większy o zmierzchu i w nocy; każda ma swój rytm. Z wyłączonymi animacjami stoją nieruchomo.
5. **Narzędzia grafik.** `tools/generate-art.mjs` uruchamia teraz narzędzia edycji Retro Diffusion (outpainting, inpainting, image_edit) na obrazkach z `art/inputs/`, pobiera ponownie wynik wcześniejszego wywołania (Retro Diffusion trzyma go 24 godziny) i rysuje z ziarnem podanym w opisie. Outpainting planszy szerszej niż 256 px idzie w trybie regionów (`scheduled_region_mode`, 10 okien po 0,18 USD).
6. **Zlecenia zwinięte.** Autor: „Zleceń nie powinno się scrollować z automatu a powinny być zwinięte do nazw i ich kliknięcie powinno rozwinąć je dopiero.” Na Tablicy zleceń każde zlecenie pokazuje tylko nazwę (np. „11 × Kłujka komarzyska”), nad nią „Zlecenie tygodnia” albo „Zlecenie specjalne”, a złotą kropkę, gdy można je oddać. Stuknięcie rozwija resztę: zdanie zleceniodawcy, ile masz, zapłatę, termin i przyciski. Rozwinięte zostają rozwinięte, dopóki ekran jest otwarty.

## Dźwięki ewolucji i kwestie narratora: wybory autora (30.10.2026, na wersji testowej)

Wybory ze strony odsłuchu „Dźwięki Insight”.

1. **Umiejętności ewolucji.** Młyn i Egzekucja mają już własne dźwięki, Promień Żywiołów dostaje wersję „laserową” (3), a Psalm nucenie z dzwonkami (6). Wyrok gra na razie głośniejszą wersję 2, dopóki autor nie wybierze innej, a Sokół czeka na wybór.
2. **Strzał z ukrycia.** Autor przy nowych wersjach: „brzmi jak rażenie prądem a nie wyjście z krzaków i strzał z łuku”. Opis nagrania prosi teraz o szelest liści, cięciwę drewnianego łuku i świst strzały, bez trzasków i brzęczenia; nowe wersje są na stronie odsłuchu.
    - Przy wersjach 5–7 autor: „dalej lipa brzmi jak prąd i brak strzału”. Wersje 8–10 są złożone z dwóch osobnych nagrań (szelest krzaka, a po nim cięciwa łuku i świst strzały), wyrównane do średnio ok. −15 dB jak inne krótkie dźwięki, i czekają na stronie odsłuchu.
    - Przy 8–10 autor: „Strzał z ukrycia dalej slaby ten dźwięk, a z kolei reszte możesz dać już do zatwierdzonych a skompresowane background music tez jest okey”. Wersje 11–13: krótki szelest krzaka, a po nim mocny strzał z Przebijającego strzału, który już gra w grze. Lżejsze pliki muzyki są zatwierdzone, Wyrok zostaje w głośniejszej wersji, a Sokół, który nie miał jeszcze dźwięku, dostaje wersję 1.
    - Autor: „Teraz się zgadza Strzał z ukrycia” i wybór wersji 13, która gra teraz w grze.
3. **Kwestie o Bestiariuszu i Encyklopedii.** Autor wybrał wersje 1 wszystkich czterech, czyli te, które już grają na wersji testowej.

## Chody ewolucji: wybory i poprawki autora (30.10.2026, na wersji testowej)

Autor o chodach (pytania 44–52 i 130): „44 facet B / 45 Arkaniści A, tylko kobiecie dorysować oczy / 46 Udzrowiciel A, kobieta B / 47 Inkwizytorzy B / 48 Truciciel A, kobieta B / 49 Nocny Tancerz - obydwa A / 50. Barbarzyńca A tylko bez tego czegoś wystającego z tyłu, kobieta B / 51. Gladiator A, kobieta C / 52. Strzelec Burzy Mężczyzna A, kobieta B” oraz „130 We WSZYSTKICH animacjach chodu, jeśli występują wystające elementy uzbrojenia (poza kosturem w jednej pozycji praktycznie) wyrzuć je, bo wygladają źle (patrz screen)”. O poprawkach (pytania 141–151): „141 tak / 142 ręka ucięta / 143 tak / 144 tak / 145 kobiety ręka ucięta / 146 chyba tak, ale pare pikseli z prawej niepokojące / 147 weź przed jednak / 148 twarz do przerobienia w ogole zniekształcona, oczy dorobić bardziej / 149 tak / 150 problemy z nogami widzę / 151 kobieta ma dziwnie wygietą rękę”.

1. **Wybory.** W grze stoją: Elementalista A (przy 147 autor wraca do wersji sprzed wyboru B), Arkanista i Arkanistka A, Uzdrowiciel A i Uzdrowicielka B, Inkwizytor i Inkwizytorka B, Truciciel A i Trucicielka B, Nocny Tancerz i Nocna Tancerka A, Barbarzyńca A i Barbarzynka B, Gladiator A i Gladiatorka C, Strzelec Burzy A i Strzelczyni Burzy B. Łowca, Łowczyni i Elementalistka zostają przy wersjach na próbę (A), dopóki autor nie poda liter (pytania 43 i 44).
2. **Bez wystającej broni.** Barbarzyńca nie ma topora, Gladiatorka miecza, Strażniczka tarczy, oboje Snajperzy łuków, Strzelec Burzy kołczana, Łowca łuku, Skrytobójca czubka sztyletu, a Nocny Tancerz i Nocna Tancerka sztyletów. Zarys postaci jest zamknięty tam, gdzie była broń. Władczyni Lodu trzyma kostur w jednej pozycji, a Inkwizytorka nie unosi już kadzielnicy w 1. klatce. Strzelczyni Burzy B nie ma kamiennego kręgu pod stopami.
3. **Poprawki po ocenie** (GIF-y 142–151 w czacie, do oceny autora):
    - Gladiatorka (142): wraca tylne ramię w brązowej zbroi, z dłonią.
    - Strzelczyni Burzy (145): dłoń na końcu rękawa w każdej klatce.
    - Łowca (146): bez pojedynczych ciemnych pikseli po usuniętym łuku, przy twarzy w 2. i 4. klatce i przy piersi w 3.
    - Elementalista (147): wersja A, w czerwonej szacie.
    - Arkanistka (148): twarz narysowana od nowa ręcznie: brew, oko z białkiem i źrenicą, nos z profilu i usta.
    - Skrytobójca (150): w 1. klatce tylna noga stoi stopą na ziemi, a w 3. przednia noga schodzi do ziemi. Buty mają jasny połysk jak u Skrytobójczyni.
    - Nocna Tancerka (151): w 1. klatce ręka nie wygina się do tyłu, tylko zwisa wzdłuż ciała.
    - Nowe dłonie i twarz są w maskach skóry (`tools/evolution-walker-tones.json`), więc zmieniają kolor razem ze skórą postaci.

## Osada, część II: Karczma, plotki i towarzysze (30.10.2026, wstępnie, na wersji testowej)

Autor: „Do tego możesz wstępnie zacząć robić resztę co istnieje z Osady i wrzucać na testowy. Zbadam i też zrobimy poprawki.” Część II według kolejności 129 A: Karczma z plotkami i pierwszy towarzysz. Wszystko działa tylko tam, gdzie Osada jest włączona (`SETTLEMENT`).

1. **Karczma otwarta.** Karczmarz Zbylut ma powitania na każdy stopień relacji. Jego usługi stoją w danych (`tavern` i `companions` w `data/settlement.json`).
2. **Kufel i plotka (116).** Kufel kosztuje 2 złota za poziom postaci i daje 10 punktów relacji ze Zbylutem. Zbylut mówi wtedy, w którym z trzech najnowszych regionów wewnętrznych otwartych dla klasy, nie za łatwym dla postaci, krąży elita albo czempion. Plotka jest jedna na dzień, do północy czasu polskiego. Najbliższa wyprawa w to miejsce spotyka elitę i czempiona 2 razy częściej, także razem z tropieniem elit, i zużywa plotkę. Nie działa przy omijaniu elit ani w Szybkim Polowaniu. Gra pokazuje tylko słowa Zbyluta, bez wyjaśnień Systemu (zob. „Osada: uwagi autora z 31.10”).
    - Brakujący szczegół: relacja za kufel. Przy 3 punktach dziennie stopień Znajomy, a z nim pierwszy towarzysz, przyszedłby po 17 dniach, a Zaufany po ponad pół roku. Przy 10 punktach Znajomy przychodzi po 5 dniach, a Zaufany po ok. 70 dniach, czyli w tempie relacji z sołtysem.
3. **Werbunek (104–106, 109).** W Karczmie co tydzień czeka czterech kandydatów, tych samych przez cały tydzień. Każdy ma klasę, płeć, poziom postaci minus 0–3, dwie cechy (czasem trzy), dwie umiejętności swojej klasy, profesję, krótką historię i sprzęt, z którym przychodzi: zwykłą broń i zbroję swojej klasy na swoim poziomie. Werbunek kosztuje 30 złota za poziom kandydata. Pierwszy towarzysz przychodzi od stopnia Znajomy u Zbyluta, a drugi od stopnia Zaufany. Odprawiony towarzysz nie wraca w tym tygodniu jako kandydat. *Od 31.10 werbunek działa przy każdym stopniu, a stopień ustala tylko cenę: zob. „Werbunek przy każdym stopniu relacji”.*
4. **Towarzysz na wyprawie.** Idzie na każdą wyprawę poza Szybkim Polowaniem jako drugi członek drużyny, na miejscu swojej klasy w szyku. Ma punkty swojego poziomu rozdane według klasy, umiejętności rosnące co 4 poziomy, sprzęt i cechy. Jego HP przechodzi z walki do walki, a po każdej wygranej odpoczywa jak postać. Gdy padnie, do końca wyprawy trzyma się z tyłu, a potem jest ranny, dopóki postać nie odpocznie do pełna HP (zob. „Osada: uwagi autora z 31.10”). Dostaje tyle XP co postać, a o 10% więcej za każdy poziom poniżej niej. Bez pensji (110). Postać dostaje XP jak dotąd. Zagrożenie przed wyprawą liczy walki z towarzyszami.
5. **Cechy (111 A, na razie tylko w walce):** Zapalczywa/Zapalczywy (obrażenia +10%, pancerz −10%), Ostrożna/Ostrożny (pancerz +12%, obrażenia −5%), Twarda/Twardy (HP +10%), Zwinna/Zwinny (uniki +20%), Bystrooka/Bystrooki (krytyczne +20%), Szybka/Szybki (ruchy +8%), Lękliwa/Lękliwy (ruchy +12%, HP −8%) i Uparta/Uparty (wola +20%).
6. **Sprzęt z plecaka (108 A).** Towarzysz ma trzy miejsca: broń, pancerz i talizman. Przycisk „Załóż z plecaka” na jego karcie pokazuje przedmioty z plecaka, które może nosić: broń i pancerz swojej klasy, na swój poziom (poziom klasy towarzysza to jego poziom), i każdy talizman. Przedmiot z Wymiany albo ze Skrzyni Konta zakłada od poziomu przedmiotu, jak postać. To, co nosił w tym miejscu, wraca do plecaka. Przy odprawie oddaje wszystko, co dostał z plecaka (potrzebne jest na to miejsce w plecaku), a swój sprzęt z werbunku zabiera ze sobą. Przedmioty zakłada się w obozie, jak każdą zmianę plecaka.
7. **Prezent z profesji (112 A).** Raz w tygodniu każdy towarzysz przynosi prezent ze swojej profesji: z Zielarstwa zioła, z Alchemii mikstury, a z Rzemieślnictwa części. Prezent zawiera jeden rodzaj towaru, który postać już zna, jak w zleceniach. Zanim postać otworzy daną profesję, dostaje towar z jej pierwszego poziomu. Ilość wynosi 3–6 ziół, 1–2 mikstury albo 2–4 części, a na każde 10 poziomów postaci dochodzi 1 zioło, pół mikstury albo 1 część. Na 80. poziomie to np. 5–6 mikstur. Prezent jest ten sam przez cały tydzień, a odbiera się go w obozie, bo zioła i mikstury czekają w torbie.
8. **Rany (113 A, zmienione 31.10).** Rany towarzysza goją się razem z ranami postaci, więc „Przewiń” odpoczynku postaci skraca też je.
9. **Jeszcze nie ma:** Kwater w obozie (104 A, potrzebują grafiki budynku do oceny autora), twarzy towarzyszy (107 B; próbne popiersia 231 i 232 czekają na ocenę, a w walce towarzysz ma na razie portret swojej klasy) i cech w zdarzeniach (część IV). *Od 31.10 towarzysze mają własne twarze: zob. „Twarze towarzyszy”.*

## Oceny grafik 243–255 (31.10.2026)

Autor: „243 A / 244 A / 245 A / 246 A / 247 B -> musi wyglądać trochę dostojniej / 248 B -> przycięta głowa (włosy), poza tym okey / 249 A, tylko tło to wycięcia / 250 A / 251 A / 252 A / 253 A, ale bedzie trzeba chyba planszę obozu rozbudować, żeby gdzies te Kwatery zmieścić (jeśli tak to motyw rozbudowania jak z Osadą będzie trzeba zrobić chyba -> rozszerzyć na większą ilość miejsca) / 254 A / 255 B - daj portret do pojedynku taki sam jak główny tylko zmniejszony” oraz „Do popiersi towarzyszy trzeba też wygenerować portrety do walki”.

1. **Popiersia towarzyszy.** Wojownik, Łuczniczka, Łucznik, Magini, oba Cienie i dwa pierwsze popiersia (231, 232) są zatwierdzone. Cień kobieta ma tło wycięte, razem z domem i słupem za plecami. Kleryczka (247) jest rysowana od nowa, dostojniej, a Kleryk (248) od nowa z całą głową w obrazku. Za wzór służą im pierwsze wersje.
2. **Portrety towarzyszy do walki.** Każdy towarzysz dostanie pełną postać do walki, jak klasy. Za wzór twarzy i stroju służy zatwierdzone popiersie (`art/references/companions`). Najpierw powstaje próba dwóch: Wojowniczki i Maga.
3. **Zdarzenia.** Kupiec (251), Leszy (252) i portret Upiora (254 A) są zatwierdzone. Portret Leszego do pojedynku to główna postać zmniejszona do 48 px, z cienkim ciemnym konturem (259 czeka na ocenę).
4. **Kwatery (253 A).** Wyglądy budynku są zatwierdzone. Plansza obozu zostanie powiększona jak plansza Osady, żeby zmieściły się Kwatery i kolejne budynki.

## Odpowiedzi 301 i teksty 288–293 (31.10.2026, na wersji testowej)

Autor: „297.1 B / 297.2 B / 297.3 B / 298 B” i „Reszte tekstów też zatwierdzam (288, 289, 290, 291 i 293)”.

1. **Nagrania (301).** Jagna (Kup, Sprzedaj, Bractwo Zielarzy) i Kwatery czytają się w wersjach B, przyciętych i wyrównanych do −18 LUFS jak inne kwestie. Jedna wersja kwestii o zakładce Kup odpadła przed odsłuchem, bo urywała się w pół słowa, więc nagrała się jeszcze dwa razy.
2. **Teksty 288–293** są zatwierdzone: koniec wycieczki po planszy, Karczma, Zaklinaczka, Pustelnik i Targowisko. Idą do nagrania w dwóch wersjach każda, a autor wybiera na słuch. Po ich wgraniu cała Osada (części I–III) będzie gotowa do gry (299 A).

## Odpowiedzi 297–299 (31.10.2026)

Autor: „297 akceptuje wszystkie / 298 akceptuje / 299 A”.

1. **Kwestie narratora przy Jagnie (297) i w Kwaterach (298)** są zatwierdzone w brzmieniu z wpisów „Zielarka sprzedaje zioła” i „Odpowiedzi 286, 287, 295 i 296”. Idą do nagrania w dwóch wersjach każda, a autor wybiera na słuch.
2. **Osada do gry (299 A).** Części I–III wchodzą do gry, gdy kwestie narratora Osady będą zatwierdzone i nagrane: czekają jeszcze 288 (koniec wycieczki), 289 (Karczma), 290 (Zaklinaczka), 291 (Pustelnik) i 293 (Targowisko). Część IV (wątki mieszkańców, dary, robotnicy w obozie, cechy towarzyszy w zdarzeniach i rzadkie receptury u Jagny) dojdzie później. Wdrożenie, jak każde, na komendę autora.

## Odpowiedzi 286, 287, 295 i 296 (31.10.2026, na wersji testowej)

Autor: „295 A / 296 A / 286 i 287 tak”.

1. **Teksty Gościwita (286).** Historia i pięć powitań zostają bez zmian.
2. **Relacja obniża ceny (287 A).** U Gościwita ceny są niższe o 2,5% przy stopniu Znajomy, o 5% przy Stałym kliencie, o 7,5% przy Zaufanym i o 10% przy Przyjacielu (`relationDiscount` w `data/settlement.json`).
    - Ceny dalej są wyższe niż to, co płacą NPC, a część nigdy nie kosztuje mniej niż na Ladzie złomiarza przy jej pierwszym poziomie.
    - Te same upusty ma Jagna, jak zapowiadał wpis „Zielarka sprzedaje zioła”.
    - **Brakujący szczegół:** cena wyjściowa Jagny rośnie z 1,5 do 1,67 raza tyle, ile najwięcej płaci za zioło ktokolwiek. Dzięki temu przy Przyjacielu cena wynosi dalej 1,5 raza tyle, a mikstura z kupionych ziół nadal nie daje zysku. Przykład: Żywokost kosztuje 9 zł przy stopniu Obcy i 8 zł przy Przyjacielu.
    - Targowisko i Chata zielarki podają, o ile relacja obniża teraz ceny.
3. **Rozmowa z towarzyszem (295 A).** W Kwaterach każdy towarzysz ma przycisk „Porozmawiaj”, raz dziennie.
    - Towarzysz opowiada kolejny kawałek swojej historii. Każda z 8 historii ma 5 kawałków, po jednym na stopień relacji: pierwszy od razu, a następny dopiero przy kolejnym stopniu.
    - Gdy nowego kawałka jeszcze nie ma, towarzysz mówi coś na dziś, np. o pogodzie albo o Zbylucie.
    - Rozmowa daje 10 punktów relacji. Opowiedziane kawałki zostają na karcie towarzysza pod „Z rozmów”.
    - Teksty mają formy dla towarzyszki i towarzysza.
4. **Relacja z towarzyszem (296 A).** Stopnie są jak u mieszkańców: Obcy od 0 punktów, Znajomy od 50, Stały klient od 250, Zaufany od 700 i Przyjaciel od 1400.
    - Każdy stopień ponad Obcego daje towarzyszowi w walce +2% obrażeń i HP, czyli przy Przyjacielu +8%.
    - Karta towarzysza pokazuje stopień, premię i punkty do następnego stopnia.
    - **Brakujący szczegół: ile punktów.** Wspólna wyprawa daje 4 punkty za godzinę i co najmniej punkt za wyprawę, a rozmowa 10. Przy 4 godzinach wypraw dziennie i jednej rozmowie relacja dochodzi do stopnia Znajomy po 2 dniach, a do stopnia Przyjaciel po około 2 miesiącach.
5. **Samouczek Kwater.** Pytanie 294 jest wycofane, bo doszły rozmowy. Nowa kwestia czeka na akceptację w pytaniu 298.

## Wersja 0.0.67 (31.10.2026)

Autor: „Wdrażaj 0.0.67 też”.

1. **Co wchodzi do gry:**
    - poprawka „Klasa czeka” w Statystykach (zob. „Uwagi autora z 31.10, po odpowiedziach 278–284”);
    - trzy zdarzenia z dalszym wyborem: Zagubiona dziewczynka, Wesele w borze i Poszukiwacz skarbów (zob. „Zdarzenia z dalszym wyborem” i „Odpowiedzi 278–284”);
    - przedmiot z wymiany albo ze Skrzyni Konta zakłada się od poziomu klasy (zob. „Przedmiot z wymiany od poziomu klasy”).
2. **Co zostaje ukryte:** Osada (bez `SETTLEMENT`), a z nią Targowisko z Gościwitem, sprzedaż ziół u Jagny, towarzysze w Kwaterach i samouczek miejsc Osady.
3. **Migracje bazy:** 0061 (Targowisko: tabele ofert i paczek; w grze stoją puste, bo Osada jest ukryta).

## Przedmiot z wymiany od poziomu klasy (31.10.2026, w grze od 0.0.67)

Autor: „Mialo byc od poziomu klasy.” Na zrzucie: „Ten przedmiot z wymiany założysz od poziomu postaci 36.”

1. **Zasada.** Przedmiot z Wymiany albo ze Skrzyni Konta (od innej postaci) zakłada się, gdy poziom klasy dojdzie do poziomu przedmiotu. Poziom postaci się już nie liczy. Komunikat brzmi: „Przedmiot z wymiany założysz od poziomu klasy 36.” Ta zasada zastępuje „od poziomu postaci” z wpisu o Wymianie i ze Skrzyni Konta.
2. **Targowisko** liczy tak samo (241: „jak Wymiana”).
3. **Dwa wymagania naraz.** Gdy przedmiot ma też własny wymagany poziom klasy, a ten jest wyższy, karta przedmiotu i oferty podają wyższą liczbę.
4. **Towarzysz bez zmian.** Jego poziom jest zarazem poziomem klasy.

## Zielarka sprzedaje zioła (31.10.2026, na wersji testowej)

Autor: „Zielarce trzeba dać też taką funkcję żeby to ona zioła sprzedawała, więc trzeba zacząć u niej od zakładki Kup/Sprzedaj / Kup oczywiście zawsze drożej. / Niech ma na początku 3 podstawowe zioła, a w miarę zwiekszania znajomości coraz więcej.”

1. **Zakładki.** Chata zielarki zaczyna się od zakładek „Kup” i „Sprzedaj”. Najpierw otwiera się „Kup”. „Sprzedaj” to dotychczasowy skup ziół i mikstur.
2. **Ile ziół (brakujący szczegół).** Jagna sprzedaje zioła od najniższego poziomu Zielarstwa. Przy stopniu Obcy ma 3 (Żywokost, Bylica, Pokrzywa), przy Znajomym 5, przy Stałym kliencie 7, przy Zaufanym 10, a przy Przyjacielu wszystkie 13, razem z Kwiatem paproci. Pod listą jest zdanie, które zioła dojdą przy następnym stopniu.
3. **Cena (brakujący szczegół).** Każde zioło kosztuje 1,5 raza tyle, ile najwięcej płaci za nie ktokolwiek w grze: złomiarz przy najwyższym Skupie złomu, Jagna przy Przyjacielu albo najlepsze zlecenie. Gościwit liczy tak samo, ale jego ceny zmieniają się codziennie, a ceny Jagny stoją w miejscu. Przy tej cenie mikstura uwarzona z kupionych ziół najwyżej zwraca ich koszt, więc nie da się na tym zarobić. Pilnuje tego test.
4. **Relacja a ceny.** Ceny Jagny nie zależą od relacji. Jeśli w pytaniu 287 relacja obniży ceny Gościwita, to samo dotyczy Jagny.
5. **Bez dziennego limitu (brakujący szczegół).** Zakupy ogranicza tylko złoto i miejsce w plecaku. Okno zakupu podaje, ile najwyżej można kupić.
6. **Relacja i reputacja.** Zakup daje relację z Jagną i reputację Bractwa Zielarzy jak sprzedaż, w tym samym dziennym limicie 10 punktów.
7. **Encyklopedia.** Kupione zioła liczą się jak towar z handlu, więc nie odkrywają wpisów w Encyklopedii.
8. **Karta zioła.** Stuknięcie zioła otwiera jego kartę jak na Targowisku: obrazek, opis, cena u złomiarza, poziom Zielarstwa i liczba sztuk w plecaku, a pod spodem cena u Jagny i „Kup”.
9. **Samouczek.** Przy Jagnie narrator ma teraz trzy kwestie: o zakładce „Kup”, o zakładce „Sprzedaj” i o Bractwie Zielarzy. Pytanie 292 jest wycofane, a jego miejsce zajmuje pytanie 297.
10. **Drobna poprawka.** Przy najwyższej relacji zakładka „Sprzedaj” nie obiecuje już, że „z lepszą relacją” Jagna zapłaci więcej.

## Towarzysze w Kwaterach i samouczek Osady krok po kroku (31.10.2026, na wersji testowej)

Autor: „285 od nowa bo za dużo ucięte bo i waga i reszta rzeczy, daj zamiast tego coś pełnego”, „Po zwerbowaniu postac powinna zniknąć z Karczmy i pojawić się w Kwaterach - stamtąd ewentualne Odprawy, więcej info o postaci, rozmowa z nią, budowanie relacji, zmiana wyposażenia itp.” oraz „Do tego trzeba zrobić od nowa Samouczek Osady by obejmował wszystko krok po kroku -> Tablica zleceń już jest ale Karczma, Zaklinaczka, Pustelnik i Zielarka tylko pobieżnie albo wcale. Nie wspominając o samouczku Targowiska.”

1. **Popiersie Gościwita (285 od nowa, potem „285 B”).** Nowe wersje pokazują kupca do pasa: z niską futrzaną czapką, całą wagą, pasem i sakiewką, na gładkim tle (wysokiej czapki generator nie mieścił w obrazku). Autor wybrał wersję B, wyciętą z tła razem z kieszonką tła przy łokciu.
2. **Towarzysze w Kwaterach.** W Karczmie zostają tylko kandydaci z przyciskiem „Zwerbuj” oraz zdanie z liczbą posłań i odnośnikiem do Kwater. Zwerbowany towarzysz mieszka w Kwaterach w obozie. Tam jest jego karta (klasa, poziom, liczby, cechy, umiejętności, historia), sprzęt („Załóż z plecaka”), prezent tygodnia, rany i „Odpraw”.
3. **Rozmowa i relacja z towarzyszem** to nowe mechaniki, więc czekają na decyzję autora (pytania 295 i 296).
4. **Samouczek Osady.** Wycieczka po planszy zostaje (powitanie, Tablica zleceń, bractwa). Ostatnia kwestia wskazuje teraz wszystkie miejsca i zapowiada resztę. Potem narrator opowiada o każdym miejscu przy pierwszej wizycie, krok po kroku:
    - Karczma: kufel i plotka, werbunek, posłanie w Kwaterach;
    - Zaklinaczka: zaklęcie afiksu, zaklęcie żywiołu, relacja;
    - Pustelnik: zerowanie ścieżki i statystyk, zmiana ewolucji;
    - Zielarka: skup ziół i mikstur, Bractwo Zielarzy;
    - Targowisko: oferty graczy, zakładka „Moje”, mieszkańcy, Kompania Kupców;
    - Kwatery w obozie: towarzysze.
5. **Brakujący szczegół: kolejność.** Każde miejsce opowiada się samo przy pierwszej wizycie, w dowolnej kolejności, zamiast jednej długiej trasy przez całą Osadę. Postać, która skończyła dawną wycieczkę, usłyszy kwestie miejsc przy następnej wizycie.
6. **Głos.** Nowe kwestie i zmieniona kwestia końcowa czekają na akceptację tekstów (pytania 288–294). Do tego czasu wyświetlają się bez nagrania, a po akceptacji zostaną nagrane.

## Uwagi autora z 31.10, po odpowiedziach 278–284 (na wersji testowej)

1. **„Klasa czeka” bez punktów.** Autor: „Skąd ten tekst że klasa czeka na rozdanie punktów skoro nie mam punktów?” (Łucznik, 34. poziom klasy).
    - **Przyczyna:** silnik sprawdza, czy przy pierwszej ewolucji (50. poziom klasy) zostaną nierozdane Punkty Umiejętności. Liczy przy tym też punkty z poziomów, których klasa jeszcze nie ma. Ekran Umiejętności pokazywał „klasa czeka” dopiero na poziomie ewolucji, a karta Statystyki od razu.
    - **Poprawka:** Statystyki mówią „Klasa czeka: rozdaj Punkty Umiejętności” dopiero wtedy, gdy klasa stoi na poziomie ewolucji. Wcześniej pokazują „Pierwsza ewolucja: poz. klasy 50”. Ten błąd jest też w grze.
2. **Tekst o towarzyszach w Karczmie**, w brzmieniu autora: „Towarzysze idą z tobą na każdą wyprawę poza Szybkim i Błyskawicznym Polowaniem. Rosną w siłę razem z tobą. Opłata za werbunek jest jednorazowa, a im lepiej zna cię Zbylut, tym jest tańsza. Towarzysz potrzebuje posłania: zbuduj Kwatery w obozie”. Słowa „zbuduj Kwatery w obozie” są wytłuszczone i podkreślone (autor: „to w <> jakos ladnie wytluszczyc, podkreślić”). Liczba zajętych posłań („Miejsca: 1 z 2”) jest w osobnym zdaniu pod spodem, gdy Kwatery już stoją.
3. **Podgląd towaru u kupca.** Autor: „zrob tez tak bym mogl kliknac przedmiot i go sprawdzić u kupca na targowisku”. Stuknięcie zioła, mikstury, materiału albo części na Targowisku (u kupca i w ofertach graczy) otwiera kartę towaru. Karta ma obrazek, opis, cenę u złomiarza, poziom Zielarstwa, od którego zbiera się to zioło, i liczbę sztuk, które postać już ma. U kupca karta pokazuje też jego cenę i przycisk „Kup”.

## Odpowiedzi 278–284 (31.10.2026)

Autor: „278 A / 279 B / 280 D / 281 B / 282 tak / 283 tak / 284 tak”.

1. **Zdarzenia zatwierdzone (282–284).** Zagubiona dziewczynka, Wesele w borze i Poszukiwacz skarbów nie są już szkicami. Na wersji testowej przychodzą jak każde inne zdarzenie, a w grze pojawią się po najbliższym wdrożeniu.
2. **Postacie zdarzeń (279–281).** Dziewczynka jest w wersji B, poszukiwacz w D, a starosta weselny w B.
3. **Kupiec Targowiska (278 A).** Na Targowisku mieszka Gościwit, kupiec. Ma historię i powitania na każdy stopień relacji (do akceptacji autora, pytanie 286), a popiersie czeka na wybór (285).
    - **Brakujący szczegół: relacja.** Zakupy na jego straganie dają relację z nim, tyle samo punktów, co reputacji Kompanii Kupców (najwyżej 10 dziennie). Na razie relacja zmienia tylko powitanie, a czy ma też obniżać ceny, rozstrzyga pytanie 287.

## Zdarzenia z dalszym wyborem (31.10.2026, na wersji testowej)

Autor: „Niedługo będę nieobecny kilka godzin przygotuj kolejne 3 zdarzenia w tym czasie, bardziej rozbudowane (z więcej niż jedną decyzją, po której kliknięciu dalej trzeba coś decydować = 2 wybory)”.

1. **Dalszy wybór.** Opcja zdarzenia może prowadzić do kolejnego wyboru (skutek `choice` w `data/events.json`): okienko mówi, co się stało, i daje nowe opcje. Zdarzenie kończy dopiero skutek ostatniej opcji, a raport pokazuje oba wybory po kolei.
2. **Brakujące szczegóły:**
    - **Wybór zapada na stałe.** Pierwszy wybór serwer zapamiętuje przy wyprawie. Zamknięte okienko albo odświeżona strona wracają do drugiego wyboru, więc nie da się podejrzeć, co kryje pierwsza opcja, i wybrać innej.
    - **Ceny.** Opcja z ceną na pierwszym albo drugim kroku płaci na końcu zdarzenia, wszystkie ceny ścieżki razem. Opcja drugiego kroku jest wyszarzona, gdy w sakiewce nie zostaje na nią złota po cenie pierwszej.
    - **Przypadki.** Przypadek (to, co naprawdę się dzieje, losowane raz na zdarzenie) podaje skutek opcji drugiego kroku po ścieżce, np. `lead/look`. Może też opowiedzieć dalszy wybór po swojemu (inny tekst, te same opcje), jak wesele umarłych, gdy patrzy się z ukrycia.
    - **Testuj zdarzenia** wybiera zdarzenie i przypadek tak jak dotąd, a oba kroki wybiera się już w samym zdarzeniu.
3. **Trzy nowe zdarzenia (szkice, tylko na wersji testowej, do oceny autora).** Każde ma 3 opcje. Dwie prowadzą do drugiego wyboru z 3 opcjami, a trzecia kończy zdarzenie od razu.
    - **Zagubiona dziewczynka** (od regionów 6. poziomu). Przypadki: prawdziwe dziecko (60%) albo Upiór dziecka (40%). Nagrody to złoto, przedmiot rzadki albo unikalny, zioła, a u Upiora walka, przedmiot unikalny albo epicki, klątwa albo skupienie. Żelazo zdradza Upiora.
    - **Wesele w borze** (wszędzie). Przypadki: prawdziwe wesele (60%) albo wesele umarłych (40%). Skutki: wzmocnienie, przedmiot za podarunek (2 złota za poziom), omdlenie po miodzie umarłych, utrata części zasobów, XP za odesłanie zmarłych znakiem krzyża. Bez walki.
    - **Poszukiwacz skarbów** (od regionów 6. poziomu). Przypadki: uczciwy poszukiwacz (50%), zbój z kompanem (30%) albo Upiór, strażnik kurhanu (20%). Mapa kosztuje 3 złota za poziom. Skutki: złoto, przedmioty, plotka o elicie albo czempionie, walki ze zbójami albo z Upiorem, klątwa.
    - **Przeciwnicy.** Walczy się tylko z ludźmi i duchami zdarzeń (zbóje, Upiór), więc te walki nie dodają nic do Bestiariusza.
4. **Grafiki.** Postacie dziewczynki, starosty weselnego i poszukiwacza są w czterech wersjach do wyboru (279, 280 i 281). Do czasu wyboru autora wersja testowa pokazuje: 279 A, 280 B i 281 B.

## Osada, część III: Targowisko (31.10.2026, na wersji testowej)

Autor przy pytaniach 237–242: „237 A / 238 A / 239 A / 240 A / 241 tak / 242 A”, a potem: „To szykuj Targowisko”.

1. **Co się wystawia (237 A).** Przedmioty z plecaka (bez założonych), zioła, mikstury, materiały i części. Wystawione rzeczy od razu znikają z postaci i czekają na Targowisku.
2. **Licytacja (238 A).** Oferta trwa 24 godziny. Ma cenę wywoławczą i, jeśli sprzedający chce, cenę „Kup teraz”. Licytujący płaci od razu, a gdy ktoś go przebije, złoto wraca do niego od razu. „Kup teraz” kończy ofertę na miejscu i oddaje złoto temu, kto prowadził.
3. **Opłata (239 A).** Targowisko bierze 5% ceny sprzedaży, zaokrąglone w górę. Sprzedający dostaje resztę.
4. **Limit ofert (240 A).** Postać ma naraz 5 ofert i jedną więcej na każdy stopień reputacji Kompanii Kupców ponad pierwszy, czyli 9 u Przyjaciela.
5. **Jak Wymiana (241 tak).** Przedmiot z Targowiska zakłada się od jego poziomu. Postacie z jednego konta nie licytują ani nie kupują od siebie. Zioła, mikstury i materiały z Targowiska nie liczą się do Encyklopedii, jak te z Wymiany.
6. **Mieszkańcy (242 A).**
    - **Kupiec** codziennie sprzedaje 2 zioła, 2 materiały rzadkie, unikalne albo epickie i 2 części. Towar i ceny są takie same dla wszystkich i zmieniają się o północy. Postać kupi dziennie do 10 sztuk każdego towaru, a towar trafia od razu do postaci.
    - **Wędrowny handlarz** przychodzi raz w tygodniu na jeden dzień, ten sam dla wszystkich. Ma 3 przedmioty na poziom postaci i dla jej klasy, rzadkie albo epickie (w proporcji 3 do 1). Każdy przedmiot kosztuje 6 razy tyle, ile płaci za niego złomiarz, i można go kupić raz. Trafia prosto do plecaka i zakłada się go od jego poziomu, jak z Wymiany.
7. **Brakujące szczegóły:**
    - **Odbiór.** To, co daje handel, czeka na Targowisku w „Do odebrania”: wygrany albo kupiony towar, towar z oferty bez kupca i złoto ze sprzedaży. „Odbierz wszystko” zabiera złoto, materiały i części zawsze, a przedmioty, zioła i mikstury, póki jest miejsce w plecaku. Gdy coś czeka, Targowisko na planszy Osady i zakładka Osada mają kropkę.
    - **Wycofanie.** Ofertę da się wycofać tylko, dopóki nikt jej nie licytuje.
    - **Przebicie.** Kolejna oferta musi być co najmniej o 5% wyższa, a przy małych kwotach o 1 złoto. Licytacja nie może sięgnąć ceny „Kup teraz”: wtedy kupuje się od razu.
    - **Reputacja Kompanii Kupców.** Handel daje 1 punkt za każde 5 złota razy poziom postaci, najwyżej 10 punktów dziennie, jak u Jagny. Dostaje się je przy odbiorze (sprzedający i kupujący) i przy zakupach u mieszkańców. Towar, który wrócił, nie daje punktów.
    - **Ceny kupca.** Cena to 1,5 raza tyle, ile za ten towar płaci najhojniejszy NPC (złomiarz z pełnym Skupem złomu, Jagna u Przyjaciela albo najlepsze zlecenie), z dziennym wahaniem od 0,9 do 1,15. Część nigdy nie jest tańsza niż u złomiarza w obozie na 1. poziomie. Dzięki temu zasada z dokumentu, że NPC nie płaci więcej, niż sam sprzedaje, dalej obowiązuje (sprawdza to test).
    - **Usunięte konto.** Licytujący oferty usuniętej postaci dostają złoto z powrotem. Oferta, którą prowadziła usunięta postać, toczy się dalej bez jej licytacji.
    - **Test na wersji testowej.** Na jednym koncie nie ma od kogo kupić, więc w „Testuj Osadę” są dwa nowe przyciski. „Próbne oferty”: Handlarz próbny wystawia przedmiot, zioła i materiał na 15 minut, a wędrowny handlarz przychodzi dziś do tej postaci. „Zakończ licytacje” kończy od razu oferty postaci i oferty Handlarza próbnego. Za oferty Handlarza próbnego nikt nie dostaje złota.
8. **Jeszcze nie ma:** popiersia kupca na Targowisku. Na razie ekran Targowiska nie ma mieszkańca u góry.

## Werbunek przy każdym stopniu relacji (31.10.2026, na wersji testowej)

Autor: „Są postacie do zwerbowania ale nie moge ich zwerbować. Nie uzależniaj mozliwosci a cene werbunku od stopnia znajomości. Powinienem móc ale drożej niż na wyższym stopniu.”

1. **Werbunek przy każdym stopniu.** Towarzysza da się zwerbować także u Zbyluta jako Obcy. Stopień relacji ustala tylko cenę: 30 złota za poziom kandydata razy mnożnik stopnia (`priceByStanding` w `data/settlement.json`).
2. **Brakujący szczegół: mnożniki.** Obcy płaci 2 razy więcej, Znajomy 1,6 razy, Stały klient 1,3 razy, Zaufany 1,1 razy, a Przyjaciel zwykłą cenę. Kandydat na 30. poziomie kosztuje więc Obcego 1800 złota, a Przyjaciela 900.
3. **Miejsca.** Liczbę towarzyszy wyznaczają tylko posłania w Kwaterach w obozie: 1. poziom to jedno posłanie, 2. to drugie. Bez Kwater przycisk „Zwerbuj” jest wyszarzony, a Karczma mówi: „Towarzysz potrzebuje posłania: zbuduj Kwatery w obozie.” Gdy lepsza relacja obniży cenę, Karczma dopisuje: „a im lepiej zna cię Zbylut, tym jest tańszy”.

## Odpowiedzi 256–272 (31.10.2026)

Autor: „256 A wrzuć wszystko co na testowym jest (poza Osadą) na main / 257 B, ale niech pobiera i zwraca te mikstury jeśli chodzi o wyprawy / 258 A / 259 A / 262 A / 263 A / 264 B / 265 A / 266 D / 267 D / 268 B / 269 D do poprawy - za mały lub ucięty / 270 D / 271 A / 272 A”.

1. **Wdrożenie (256 A):** wersja 0.0.66 ze wszystkim z wersji testowej poza Osadą (zob. „Wersja 0.0.66”).
2. **Mikstury na drogę (257 B):** pasa na mikstury na karcie Postaci nie ma. Zostaje rezerwacja przy wyjściu: wyprawa bierze wybrane mikstury z plecaka przy „Wyrusz”, a niewypite oddaje z raportem (przy odwołaniu wszystkie), tak jak działa od 31.10.
3. **Jagna i zlecenia (258 A):** Jagna u Przyjaciela płaci o 30% więcej niż złomiarz, a zlecenia co najmniej o 20% więcej, bez zmian.
4. **Grafiki.** Zatwierdzone: portret Leszego do pojedynku (259 A), nowa Kleryczka A (262), Kleryk z całą głową (263 A), wyższa plansza obozu (271 A) i trzy wyglądy polany (272 A). Portrety do walki: Łucznik B (264), Cień kobieta (265 A), Wojownik D (266), Łuczniczka D (267), Magini B (268) i Kleryk D (270). Portret Cienia mężczyzny (269) był do poprawy, bo autor ocenił go jako „za mały lub ucięty”. Nowy, na całą wysokość obrazka, autor wybrał przy 275 („275 B”), a portret Kleryczki narysowany według jej nowego popiersia przy 274 („274 C”). Autor przy 260 i 261: „260 A” oraz „261 Mag wyglada na zbyt podobnego do Cienia, generuj jednak od nowa i popiersie i portret do walki”. Wojowniczka walczy z portretem A. Mag dostaje nowy wygląd, wyraźnie inny niż Cień (który ma rozczochrane czarne włosy i wąsik): długie, proste, rudomiedziane włosy związane z tyłu, krótka ruda bródka, zielone oczy i granatowa szata z kapturem ze srebrnymi runami. Autor wybrał popiersie D („276 D”, z włosami upiętymi w kok) i według niego portret do walki A z kosturem ze świecącym kryształem („277 A”). Tym samym wszystkich dziesięciu towarzyszy ma portrety do walki. Przy pytaniu 273 o poziomy Kwater autor: „273 już odpowiadałem”. Obowiązuje więc 104 A: poziomy Kwater dają miejsca towarzyszom, a później robotnikom. Na razie Kwatery mają 2 poziomy, a kolejne przyjdą razem z robotnikami.

## Zadania tygodniowe na cały tydzień (31.10.2026, na wersji testowej)

Autor: „Tygodniowe zadania powinny być bardziej ogólne, bo obecnie z Szybkimi Polowaniami i Błyskawicznymi idzie je zrobić w pare godzin”.

1. **Skąd to się brało.** Krótkie wyprawy dają najwięcej walk na minutę: 5 minut to 2 walki, a 4 godziny to 10 walk. Szybkie i Błyskawiczne Polowania dają od ręki ok. 24 walk dziennie. Tygodniowe zadania na stwory prosiły o tyle stworów, ile przynosi 25–40 walk, więc wpadały w kilka godzin.
2. **Tydzień prosi tylko o ogólne cele.** Nie ma już tygodniowych zadań na jeden wybrany gatunek stwora (zostają w dziennych). Tydzień prosi o:
    - stwory dowolnego rodzaju z 120–200 walk zamiast z 25–40;
    - 15–30 godzin wypraw zamiast 5–10;
    - nowe zadanie „Otwórz skrzynię dziennych zadań 3 razy” (3–4 razy). Skrzynia dzienna otwiera się raz dziennie, więc to zadanie wymaga 3–4 różnych dni;
    - na Stole rozbiórki 30–60 materiałów i 15–30 przedmiotów zamiast 10–20 i 5–10;
    - z profesji łącznie 150 ziół, 40 mikstur i 10 przedmiotów zamiast 60, 15 i 5, a w Osadzie 12 zleceń zamiast 8.
3. **Bez zmian.** Zadania dzienne, nagrody za zadania i skrzynia tygodniowa zostają jak były. Szybkie i Błyskawiczne Polowania nadal się liczą, ale przy tych liczbach dają tylko część tygodnia.
4. **Brakujący szczegół: nowa postać.** Póki nie stoi Stół rozbiórki i nie ma profesji, ogólnych rodzajów zadań jest tylko cztery, więc nowa postać dostaje 4 zadania tygodniowe zamiast 5.
5. **Od kiedy.** Nowe zadania tygodniowe losują się od następnego tygodnia (od poniedziałku). Zadania z bieżącego tygodnia zostają takie, jakie się wylosowały.

## Kwatery w obozie i wyższa plansza (31.10.2026, na wersji testowej)

Autor przy 253: „253 A, ale bedzie trzeba chyba planszę obozu rozbudować, żeby gdzies te Kwatery zmieścić (jeśli tak to motyw rozbudowania jak z Osadą będzie trzeba zrobić chyba -> rozszerzyć na większą ilość miejsca)”. Kwatery są budynkiem obozu z pytania 104 A: towarzysz zwerbowany w Karczmie mieszka w obozie.

1. **Miejsca dla towarzyszy.** Każdy poziom Kwater to posłanie dla jednego towarzysza. Werbunek potrzebuje teraz dwóch rzeczy: stopnia relacji ze Zbylutem (Znajomy dla pierwszego, Zaufany dla drugiego) i wolnego posłania w Kwaterach. Bez posłania Karczma mówi: „Zbylut poleci ci kogoś, ale towarzysz potrzebuje posłania: zbuduj Kwatery w obozie.”, a przy drugim towarzyszu: „Kolejne posłanie da rozbudowa Kwater w obozie.”
2. **Brakujący szczegół: poziomy.** Na razie Kwatery mają dwa poziomy, bo towarzyszy jest najwyżej dwóch. Na 1. poziomie stoi namiot (wygląd 1), a na 2. dwa namioty (wygląd 2). Chata (wygląd 3) przyjdzie z kolejnymi poziomami, gdy w części IV Kwatery dadzą miejsca robotnikom (zob. pytanie w raporcie). Koszt jest jak 8. i 10. poziom budynków obozu, bo Osada otwiera się na 20. poziomie postaci, gdy obóz jest już rozbudowany: 1. poziom to 1280 złota, 715 drewna, 188 kamienia i 74 rudy żelaza, a buduje się 4 godziny. 2. poziom to 5120 złota, 2574 drewna, 677 kamienia i 266 rudy żelaza, a buduje się 20 godzin. Poziom obozu skraca budowę jak przy każdym budynku.
3. **Kto już ma towarzyszy.** Postać, która zwerbowała towarzyszy przed Kwaterami, dostała je zbudowane na tylu poziomach, ilu ma towarzyszy (migracja 0060). Nikt nie traci towarzysza.
4. **Wyższa plansza.** Postać z otwartą Osadą ma wyższą planszę obozu: 360 × 564 zamiast 360 × 400, jak Osada przewijaną razem ze stroną. Pod rzędem Ogniska, Magazynu i Skupu złomu leży nowy pas polany. Kopalnia i Stół rozbiórki z dolną bramą przesunęły się niżej, a Kwatery stoją w pasie pod Magazynem. Prawa strona pasu czeka na kolejne budynki. Skrzynia Konta została obok Magazynu. Droga z Ogniska biegnie przez pas do dolnej bramy, a do Kwater i Kopalni prowadzą od niej ścieżki. Trzy wyglądy polany mają ten pas dorysowany przez inpainting Retro Diffusion: góra i dół obrazków zostały piksel w piksel. Narzędzie bierze najwyżej 256 × 256 pikseli, więc pas powstaje w dwóch oknach, najpierw lewa część, potem prawa. Bez Osady, czyli na razie w grze, obóz wygląda jak dotąd i nie ma w nim Kwater.

## Plecak poza obozem i mikstury na drogę (31.10.2026, na wersji testowej)

Autor: „Niech system pozwala na Wymianę i różne działania na przedmiotach w czasie zbierania ziół itp. Niech nie pozwala tylko na zakładanie i zmianę ekwipunku. Niech rezerwuje również ilości tego co zabiera w trasę - mikstury itp. Najlepiej niech będą możliwe do wyekwipowania na karcie Postaci i znikną wtedy z pozycji Plecaka I problem rozwiązany.”, a potem: „Zależy nam na wdrożeniu wymiany w trakcie wypraw i profesji oraz zmiany nazwy.”

1. **Plecak pod ręką.** W czasie wyprawy i pracy profesji (zioła, warzenie, Warsztat) działa Wymiana i każde działanie na plecaku. Można sprzedawać, wyrzucać i ulepszać przedmioty z plecaka, rozbierać je na Stole rozbiórki, wkładać i wyjmować je ze Skrzyni Konta, a także sprzedawać i wyrzucać zioła i mikstury. Działa też sprzedaż u Jagny, zlecenia z Tablicy (także na zioła, mikstury i wyroby), zaklęcia Zaklinaczki na przedmiotach z plecaka, prezenty i odprawa towarzyszy oraz picie mikstur na czas.
2. **Co czeka na powrót.** Zawsze czeka zakładanie i zdejmowanie przedmiotów, a także ulepszanie i zaklinanie przedmiotu, który postać ma na sobie. Czeka też zakładanie przedmiotów towarzyszowi. W czasie wyprawy czekają ponadto punkty statystyk, umiejętności, ewolucja i usługi Pustelnika, bo raport z wyprawy liczy walki z tym, co postać ma w chwili odbioru. Czeka też mikstura leczenia, bo HP z wyprawy daje raport. W czasie pracy profesji punkty, umiejętności i leczenie są dostępne.
3. **Mikstury na drogę.** Mikstury wybrane w „Wyrusz” schodzą z plecaka przy wyjściu, więc nie da się ich w tym czasie sprzedać ani oddać w Wymianie. Po odbiorze raportu niewypite wracają do plecaka, a przy odwołaniu wyprawy wracają wszystkie. Wyprawy rozpoczęte przed tą zmianą liczą mikstury po staremu: wypite schodzą z plecaka przy odbiorze. Pas na mikstury na karcie Postaci, który autor wskazał jako najlepsze rozwiązanie, jest następnym krokiem (zob. raport). Rezerwacja przy wyjściu już teraz rozwiązuje problem.
4. **Zlecenia bez „tylko w domu”.** Tablica zleceń nie odkłada już zleceń na zioła, mikstury i wyroby do powrotu postaci, a kropka na zakładce Osady liczy je zawsze.
5. **Skrzynia Konta na planszy obozu.** Autor: „Ikona Skrzyni Konta powinna być mniejsza i nie odstawać tak od reszty stylem.” Skrzynia jest mniejsza (9,5% zamiast 13% szerokości planszy), a jej obrazek ma łagodniejszy kontrast i nasycenie oraz lżejszy cień. Podpis stoi pod skrzynią, a nie na niej.

## Nowe nazwy od Systemu i jednorazowa zmiana nazwy (31.10.2026, na wersji testowej)

Autor: „W poniedziałek o godz. 1:00 czasu polskiego zmień nazwy postaci osób [...], które mają niecenzuralne na takie, które są akceptowalne. Po prostu im je wygeneruj. Daj też już każdemu w sumie opcję Zmiany nazwy postaci w Zębatce - jednorazowo, po czym opcja się blokuje.”

1. **Nowe nazwy od Systemu.** Filtr imion z wersji 0.0.62 blokuje już obie nazwy, ale ich gracze od tamtej pory nie weszli do gry, więc okno wymuszonej zmiany jeszcze się im nie pokazało. Od poniedziałku 2.11.2026, godz. 1:00 czasu polskiego (00:00 UTC, `renameAt` w `data/chat.json`), serwer o każdej pełnej godzinie sam nadaje nową nazwę każdej postaci, której imię blokuje filtr. Robi to w zadaniu, które i tak wykonuje co minutę (powiadomienia). Imię pochodzi z listy słowiańskich imion według wyglądu postaci (`generated`): pierwsze wolne w kolejności wylosowanej z numeru postaci, a gdy wszystkie są zajęte, imię z tym numerem. Wiadomości tej postaci na czacie dostają nową nazwę. Gracz przy następnym wejściu widzi słowa Systemu: „Nazwa Twojej postaci łamała zasady Google Play dotyczące nieodpowiednich treści, więc System nadał jej nową: {nazwa}. Raz możesz ją zmienić w Ustawieniach (zębatka).”
2. **Jednorazowa zmiana nazwy.** W Ustawieniach przy „Postać” stoi przycisk „Zmień nazwę”. Okno mówi: „Nazwę postaci można zmienić tylko raz. Potem ta opcja się zablokuje.” Nowa nazwa przechodzi te same sprawdzenia co przy tworzeniu postaci. Po zmianie przycisk jest wyszarzony z napisem „Zmiana nazwy wykorzystana”. Zmiana, do której zmusza filtr, i nazwa nadana przez System nie zużywają tej jednej zmiany. Zmiana działa też w czasie wyprawy, bo nic w niej nie zależy od nazwy.
3. **Wdrożenie.** Zmiana nazw zadziała o 1:00 w poniedziałek tylko wtedy, gdy ta wersja będzie już w grze. Po późniejszym wdrożeniu nazwy zmienią się o najbliższej pełnej godzinie.

## Czat od razu przy najnowszych wiadomościach (31.10.2026)

Autor: „I niech czat domyślnie wyświetla sam dół wszystkich wiadomości - najnowsze po prostu”. Czat przewijał się na dół, zanim pod wiadomościami pojawiło się pole do pisania, i to pole zasłaniało najnowszą wiadomość. Teraz po pierwszej odpowiedzi serwera, gdy pole już stoi, strona przewija się na dół jeszcze raz. To samo dzieje się po zmianie kanału i rozmowy. Ktoś, kto czyta starsze wiadomości wyżej, zostaje na swoim miejscu, jak dotąd.

## Zdarzenia na drodze: dziad, kapliczka, kupiec i Leszy (31.10.2026, na wersji testowej)

Autor: „216 ok / 217 ok / 218 tak, ale obrazek ma uciętą nogę / 219 tak, tylko obrazek Leszego jest ucięty, oraz trzeba zmienić opcje dialogowe delikatnie "Zmień swoje ubranie na lewą stronę" / 220 ok obrazek, ale samo zdarzenie niezrozumiałe, zostawmy obrazek na przyszlosc i to jedne zdarzenie robi aut, nie realizujemy”, a dalej: „221 Weles zostaje / 222 A / 223 B / 224 A / 225 tak / 226 A / 227 B” i „230 Kolejność - wszystkie w jednym wdrożeniu, więc obojętnie”. Cztery zdarzenia wchodzą razem, a Rusałki (220) odpadają.

1. **Dziad wędrowny (216, wszędzie).** „Wrzuć mu kilka monet” kosztuje 2 złota za poziom postaci. Zwykły dziad (70%) błogosławi (pancerz +10% przez 30 minut wypraw), a jego pieśń zdradza dzisiejszą plotkę o elicie albo czempionie. Przebrany Weles (10%, 221) daje za monety 1 Wolny Punkt Statystyk, za pieśń przedmiot unikalny (75%) albo epicki (25%), a przegoniony rzuca klątwę: obrażenia −10% przez 60 minut wypraw (222 A). Złodziej (20%) wyrywa sakiewkę: 10% złota, najwyżej 20 złota za poziom, i wtedy monety nie przepadają osobno. Przy pieśni jego wspólnik zabiera 20% zasobów zebranych na wyprawie.
2. **Nawiedzona kapliczka (217, od 11. poziomu).** „Odpraw egzorcyzm” widzą wszyscy, ale tylko Kleryk i jego ewolucje mogą go wybrać. Inni widzą go wyszarzonego z dopiskiem „tylko Kleryk” (223 B). Pokutująca dusza (50%): modlitwa daje Intelekt i Mądrość +10% na 30 minut wypraw, egzorcyzm przedmiot (rzadki 50%, unikalny 40%, epicki 10%), a wota złoto i klątwę na 30 minut. Upiór (35%) to przeciwnik zdarzeń jak bandyci, poza Bestiariuszem (224 A). Po modlitwie stają do walki, a egzorcyzm rozprasza go bez walki: XP jak za jego pokonanie i przedmiot (brakujący szczegół: rzadki 60%, unikalny 35%, epicki 5%, jak skrzynia Leszego). Przy wotach Upiór atakuje pierwszy, a po wygranej zostaje srebro. Pusta kapliczka (15%): wota dają złoto bez kary.
3. **Kupiec z wozem w błocie (218, od 20. poziomu, tylko z Osadą).** Uczciwy kupiec (60%) płaci za pomoc ok. 40% złota z godziny wyprawy i daje 15 punktów reputacji Kompanii Kupców (225: reputacja także ze zdarzeń). Zapłata z góry daje połowę złota, bez reputacji. Oszust (25%) odcina sakiewkę jak złodziej, a zasadzka (15%) to walka z bandytami jak przy rannej kobiecie. Zdarzenie przychodzi tylko tam, gdzie Osada jest otwarta, więc w grze dopiero razem z nią.
4. **Leszy zwodzi ścieżkę (219, Wiatrołomy i Uroczysko Kamieni, poziomy 1–50).** Opcja ma słowa autora: „Zmień swoje ubranie na lewą stronę”. Trzy razy na cztery czar pryska i Leszy zostawia dwa zioła, które zna Zielarstwo postaci, a przed otwarciem Zielarstwa garść złota. Raz na cztery stary sposób zawodzi (227 B), tak jak „Idź dalej przed siebie”: postać błądzi do zmroku i gubi 30% zebranych zasobów. Chleb i monety (2 złota za poziom) prowadzą do skrzyni (rzadki 60%, unikalny 35%, epicki 5%). Pojedynek z Leszym zostaje (226 A): wygrana daje jego dar, przedmiot unikalny (75%) albo epicki (25%), a przegrana to omdlenie.
5. **Siła Leszego i Upiora.** Obaj walczą na poziomie postaci. Leszy ma 1,8 raza więcej HP niż zwykły stwór i mocniejszy cios niż elita miejsca. W symulacji typowa postać wygrywa z nim zawsze jako Wojownik i Łucznik, jako Mag, Kleryk i Cień na poziomach 5–20 w 50–90% walk, a od 30. poziomu prawie zawsze. Wersja z przewagą poziomów okazała się nie do pokonania na niskich poziomach. Upiór ma 1,9 raza więcej HP i typowa postać wygrywa z nim w 95–100% walk.
6. **Cena opcji i sakiewka.** Cena opcji (monety dla dziada i Leszego) pokazuje się w przycisku, np. „Wrzuć mu kilka monet (60 zł)”, i schodzi z sakiewki: złota postaci razem ze złotem z wyprawy. Gdy sakiewka jest za chuda, opcja jest wyszarzona z dopiskiem „za mało złota”. Tekst skutku podaje, ile poszło.
7. **Plotka z pieśni.** Pieśń dziada mówi to samo, co tego dnia powiedziałby Zbylut, także w grze bez Osady. Plotka działa na najbliższą wyprawę w to miejsce, jak ta z Karczmy. Karczma nie traktuje jej jako swojej: kufel dalej kosztuje, daje relację ze Zbylutem i mówi to samo. Gdy postać nie ma miejsca z elitą ani czempionem do plotki, dziad śpiewa tylko starą pieśń.
8. **Klątwa.** To nowy rodzaj działania na czas, jak mikstury: zmniejsza obrażenia postaci w walkach wypraw, które obejmuje, i widać ją w „Aktywnych bonusach” jako „Klątwa: obrażenia −10%”. Raport mówi, w ilu walkach działała.
9. **Tekst dziada.** Na zatwierdzonym obrazku dziad stoi, a lira wisi mu u boku. W tekście stoi więc: „Przy drodze stoi stary dziad z lirą u boku. Ma dziurawe buty, siwą brodę i wyciąga przed siebie pusty kubek.” Wcześniej dziad siedział z lirą na kolanach.
10. **Grafiki na próbę.** Dziad ma wersję z lirą, a kapliczka wersję ze świecą. Kupiec i Leszy są narysowani od nowa, z całą postacią (251, 252). Portrety do walki Upiora i Leszego (254, 255) stoją w wersjach A do wyboru autora.

## Twarze towarzyszy (31.10.2026, na wersji testowej)

Autor przy próbnych popiersiach 231 i 232: „231 A / 232 A”, a potem: „a i zero zastrzeżeń juz co do portretów i chodu działaj”. Pozostałe osiem popiersi (243–250) stoi w grze na próbę, do oceny autora.

1. **Popiersie według klasy i płci.** Każda klasa ma dwa popiersia towarzyszy, kobiety i mężczyzny, inne niż portrety graczy (107 B). Towarzysz pokazuje popiersie swojej klasy i płci, więc dwoje towarzyszy tej samej klasy i płci ma na razie tę samą twarz.
2. **Gdzie widać twarz.** Karta towarzysza w Karczmie ma popiersie obok imienia, tak jak ekran mieszkańca, u zwerbowanych i u kandydatów. W walce karta towarzysza pokazuje głowę i ramiona z jego popiersia, a dół łagodnie zanika, jak u postaci. Walki z raportów sprzed tej zmiany pokazują portret klasy.
3. **Bez tła.** Popiersia są narysowane na gładkim jasnym tle, jak Sołtys i Zaklinaczka. `tools/cut-bust.py` zdejmuje tło od górnej krawędzi w dół, więc ramiona sięgają brzegów obrazka, a jasne drobinki tła między pasmami włosów znikają. Kilka obrazków miało w tle trawę, a Cień (kobieta) dom i słup: poprawki dla nich stoją w `tools/cut-bust.json`.
4. **Kandydat bez „Załóż z plecaka”.** Kandydat w Karczmie pokazuje tylko sprzęt, z którym przychodzi. Przycisk „Załóż z plecaka” ma dopiero towarzysz zwerbowany.

## Materiały w plecaku: potwierdzenie sprzedaży i przerób (31.10.2026)

Autor: „Na przycisk sprzedaj przy sprzedawaniu materialow trzeba nalozyc ostrzezenie, czy na pewno chcemy sprzedac dany material”, „delikatne, ale zeby trzeba bylo potwierdzic” oraz „dodac przerób tak jak przedmioty z pozycji plecaka samego bo niepotrzebnie człowiek lata z tym klika”.

1. **Potwierdzenie.** „Sprzedaj za N złota” przy materiale pyta najpierw: „Sprzedać materiał?”, z tym, co kupi złomiarz i co zrobiłby z tego Stół rozbiórki. „Anuluj” wraca do karty materiału z tą samą liczbą sztuk.
2. **Przerób z plecaka.** Karta materiału ma „Przerób ×N”, które oddaje cały stos na Stół rozbiórki, tak jak „Przerób” na ekranie stołu. Gdy stół jest za niski na tę rzadkość albo kolejka jest pełna, przycisk jest wyłączony z wyjaśnieniem. Bez zbudowanego stołu zostaje „Zbuduj Stół rozbiórki”.

## Osada: uwagi autora z 31.10 (na wersji testowej)

1. **Zbylut.** Autor: „"kilka ciekawych informacji" zamiast "ciekawych słów"”. Powitanie Znajomego brzmi teraz: „O, znowu ty. Ludzie z traktu zostawili tu dziś kilka ciekawych informacji.”
2. **Plotka bez wyjaśnień.** Autor: „nie informuj z pozycji Systemu co oznacza plotka, zeby gracz sie domyślił”. W Karczmie zostają tylko słowa Zbyluta i zdanie, że następną plotkę usłyszy jutro. Znikają wyjaśnienia o elitach i czempionach, a z ekranu Walki znika przypomnienie przy miejscu. Przed kuflem: „Za kufel Zbylut chętnie podzieli się plotką z traktu.”
3. **Werbunek.** Autor: „Werbunek to płatność jednorazowa, nie ma później żołdu jakby coś.” Tak już działa, a w Karczmie stoi: „Werbunek to jednorazowa opłata, bez żołdu.”
4. **Rany.** Autor: „Niech rany towarzyszy goją się wraz z ranami postaci.” Towarzysz, który padł, jest ranny, dopóki postać nie odpocznie do pełna HP w obozie. Gdy postać ma pełne HP przy starcie wyprawy, jego rany są wyleczone na dobre i idzie z nią. „Przewiń” odpoczynku postaci leczy więc i jego, a osobnego „Przewiń” przy towarzyszu już nie ma. Karta towarzysza mówi, ile jeszcze potrwa odpoczynek postaci.
5. **Sprzęt.** Autor: „"odda wszystko co od Ciebie dostał", a nie "co z niego dostał"”. Okno sprzętu: „…a przy odprawie odda wszystko, co od Ciebie dostał.” (dla towarzyszki: „nosiła”, „dostała”), a potwierdzenie odprawy: „…odejdzie na dobre i odda wszystko, co od Ciebie dostał.”
6. **Premia za skład (235 B).** Autor: „235 B, ale 3% kary”. Gra solo zostaje jak dotąd, a każdy towarzysz na wyprawie zabiera postaci 3% XP (`xpCost`). Pytanie 235 mówiło błędnie, że premii za skład nie ma w grze: premia solo +10% XP jest od Etapu 1 (`soloXpBonus`) i zostaje. XP klasy rośnie dalej tak jak XP postaci, więc traci tyle samo.
7. **Zlecenia a Skup (236 A).** Za zioła, mikstury i materiały zlecenie płaci co najmniej 20% więcej, niż daje złomiarz tej postaci z premią Skupu złomu (`overScrap`). Liczy się to przy każdym pokazaniu i oddaniu zlecenia, więc rośnie razem ze Skupem.
    - Zauważone: Jagna u Przyjaciela płaci 30% więcej niż złomiarz, czyli więcej niż zlecenie (20%). Pytanie do autora.

## Inkwizytorka bez krzyża (31.10.2026)

Autor: „Inkwizytorce wyrasta 3 ręka. Wyrzuć calkowicie krzyż, niech idzie tylko z buzdyganem.” Nowe klatki startowe Retro Diffusion powstały z portretu z odciętym krzyżem (dwie pozy), a PixelLab animował każdą w 3 wersjach. Wersja E miała w dwóch klatkach drugi buzdygan, więc odpadła. Autor wybrał „215 F”: druga klatka startowa (`inquisitor-female.png`, dawna `-b`), trzecia wersja PixelLab. Skóra chodu jest tylko na głowie i dłoniach (`tools/walk-tones.json`). Portret (213 A) zostaje z krzyżem.

Autor o odcieniach skóry (233): „zero zastrzeżeń juz co do portretów i chodu”.

## Osada, część III: Chata zielarki i zaklęcie żywiołu (31.10.2026, wstępnie, na wersji testowej)

Autor: „Do tego możesz wstępnie zacząć robić resztę co istnieje z Osady i wrzucać na testowy.” Z części III na razie Chata zielarki i zaklęcie żywiołu, bo ich zasady są rozstrzygnięte (101 A, 120 A, 121 A). Targowisko z ofertami graczy czeka.

1. **Skup Jagny (121 A).** Zielarka Jagna kupuje zioła i mikstury z torby za cenę złomiarza, razem z premią Skupu złomu w obozie, i dokłada do tego więcej według stopnia relacji z nią: +10% u Obcego, +15% u Znajomego, +20% u Stałego klienta, +25% u Zaufanego i +30% u Przyjaciela. Autor przy 120: „wyspecjalizowani kupcy płacą więcej niż złomiarz”. Sprzedaje się w obozie, bo na wyprawie zioła i mikstury są w torbie.
2. **Reputacja za handel (120 A).** Za każde 5 złota razy poziom postaci ze sprzedaży rośnie o punkt relacja z Jagną i reputacja Bractwa Zielarzy, najwyżej o 10 punktów dziennie. Limit dotyczy tylko reputacji, a sprzedawać można bez limitu.
    - Brakujący szczegół: liczba punktów. 10 punktów dziennie daje Znajomego po 5 dniach, tak jak kufel w Karczmie.
3. **Powitania Jagny** na każdy stopień relacji są w danych (`residents` w `data/settlement.json`).
4. **Zaklęcie żywiołu (101 A).** U Zaklinaczki, obok zaklęcia afiksu, jest „Zaklnij żywioł”. Broń zamienia 15% obrażeń każdego ciosu na wybrany żywioł, liczony z odpornością i słabością celu. Pancerz (miejsce Pancerz) dostaje odporność na ten żywioł równą rzadkiemu afiksowi odporności na swoim poziomie. Żywioł daje materiał stwora, który nim atakuje: Iskra ognika ogień, Skóra węgorza elektryczność, a Rosa rosiczki naturę.
    - Brakujące szczegóły: koszt to 40 złota za poziom przedmiotu razy mnożnik sprzedaży rzadkości (zaklęcie afiksu: 30) i 3 sztuki materiału w jego rzadkości. Przedmiot ma jeden żywioł, a nowy zastępuje stary. Relacja z Zaklinaczką rośnie o 5, jak przy zaklęciu afiksu. Zaklina się w obozie, także przedmiot założony.
5. **Jeszcze nie ma:** nauki rzadkich receptur Alchemii od wyższej relacji (121 A). Potrzebuje nowych receptur w danych, więc to propozycja na później.

## Odcienie skóry chodów: przegląd i poprawki (30.10.2026, na wersji testowej)

Autor: „Najważniejsze zrobić pełne portrety po ewolucji klas w roznych odcieniach oraz ich chód w różnych odcieniach. A no i pierwsze wybrane na starcie chody w różnych odcieniach, jesli jeszcze nie zrobiłeś.”

1. **Stan.** Wszystkie 40 portretów (10 klas i 30 ewolucji) i wszystkie 40 chodów mają pliki w siedmiu odcieniach z rampą, a ósmy odcień, Jasna, to sam rysunek. Wszystko to jest w grze od 0.0.64. U Skrytobójcy skóra to tylko pas przy oczach, bo resztę twarzy zasłania maska.
2. **Przegląd chodów.** Każdy chód jest sprawdzony we wszystkich ośmiu klatkach w odcieniu Żółta, bo w nim najlepiej widać pomyłki maski. Poprawione są:
    - Magini, Mag i Kleryczka: paski sandałów brały kolor skóry, bo ciemny brąz przy palcach liczył się jako obrys skóry. U tych postaci obrysem jest teraz tylko piksel ciemniejszy niż połowa najciemniejszego koloru skóry (`rims_below`), więc sandały zostają skórzane. Sznurowy pas Magini i wiązanie przy pasie Maga nie zmieniają już koloru.
    - Inkwizytorka: głowica buzdygana, łańcuch i guziki płaszcza; Inkwizytor: żar w kadzielnicy; Snajperka, Snajper oraz Strzelczyni i Strzelec Burzy: końce łuków i sprzączka pasa; Uzdrowicielka: dolny koniec kostura. U nich, a także u Uzdrowiciela i obojga Łowców, skóra jest tylko na głowie i dłoniach, a u Strażniczki i Strażnika tylko na twarzy (ich dłonie są w rękawicach). Strażnicy nie mają już plamki skóry na tarczy ani na rąbku tuniki. Dłoń z kosturem u Uzdrowicieli i dłoń z krzyżem u Inkwizytorki mają własne ramki, bo trzymają je wyżej niż dłonie szkieletu.
    - Łuczniczka i Łucznik: cholewy i sznurowanie butów zostają brązowe (ramka od 98. piksela w dół).
    - Gladiatorka i Gladiator: uda zmieniają kolor w całości, a nie tylko w jaśniejszych miejscach, bo cień uda ma kolor brązu nagolennika. Umbo tarczy w dwóch klatkach nie zmienia już koloru.
    - Cień: sprzączka pasa w dwóch klatkach.
3. **Narzędzie.** `tools/walk-tones.py` zna nowe miejsca szkieletu: przedramiona, uda, golenie i stopy. Ma też kolory, które są skórą tylko w danym miejscu (`add_in`, cień uda Gladiatorów), ramki pojedynczych klatek (`not_boxes`, pas Magini i umbo tarczy) i próg obrysu (`rims_below`). Poprawki postaci są w `tools/walk-tones.json`.

## Czat: przeczytane wiadomości na każdym urządzeniu (30.10.2026, na wersji testowej)

Autor przekazuje uwagę osoby testującej grę (kuzyn autora), która grała na iPhonie, a potem na komputerze: „jak np masz powiadomienie w społeczności że ktoś na chacie napisal i np odczytam tą wiad na kompie to jak wejdę na telefonie to dalej jakbym miał powiadomienie o tej wiadomości co już widziałem”.

1. **Przyczyna.** Ostatnia przeczytana wiadomość Globalnego i każdej rozmowy prywatnej była zapisana tylko w pamięci przeglądarki, więc inne urządzenie o niej nie wiedziało.
2. **Zmiana.** Znacznik przeczytania trafia też na serwer, do postaci (`POST /api/chat/seen`, kolumna `characters.chat_seen`, migracja 0058). `GET /api/chat/latest`, o który gra pyta co 15 sekund, oddaje go każdemu urządzeniu. Znacznik tylko rośnie. Kropka na zakładce Społeczność i przy czacie gaśnie więc na każdym urządzeniu po najwyżej 15 sekundach od przeczytania wiadomości na jednym z nich, a po otwarciu gry od razu.
3. **Wyciszenie** powiadomień Globalnego zostaje ustawieniem urządzenia.

## Wersja 0.0.66 (31.10.2026)

Autor: „256 A wrzuć wszystko co na testowym jest (poza Osadą) na main”.

1. **Co wchodzi do gry:**
    - plecak w czasie wypraw i profesji oraz mikstury rezerwowane na drogę (zob. „Plecak poza obozem i mikstury na drogę”);
    - jednorazowa zmiana nazwy w Ustawieniach i nowe nazwy od Systemu od poniedziałku 2.11.2026, godz. 1:00 (zob. „Nowe nazwy od Systemu i jednorazowa zmiana nazwy”);
    - czat otwierany przy najnowszych wiadomościach;
    - mniejsza Skrzynia Konta na planszy obozu;
    - potwierdzenie sprzedaży materiału i „Przerób” prosto z plecaka;
    - trzy nowe zdarzenia na drodze: dziad z lirą, nawiedzona kapliczka i Leszy z pojedynkiem (zob. „Zdarzenia na drodze: dziad, kapliczka, kupiec i Leszy”);
    - zadania tygodniowe na cały tydzień, losowane od poniedziałku (zob. „Zadania tygodniowe na cały tydzień”).
2. **Co zostaje ukryte:** Osada (bez `SETTLEMENT`), a z nią kupiec z utkniętym wozem, towarzysze z popiersiami, Kwatery i wyższa plansza obozu.
3. **Migracje bazy:** 0059 (`characters.name_changed`, `characters.name_notice`) i 0060 (Kwatery dla postaci, które mają już towarzyszy; w grze nikogo nie dotyczy).

## Wersja 0.0.65 (31.10.2026)

Autor: „Wdróż 0.0.65 tak jak mówisz”.

1. **Co wchodzi do gry:** poprawione odcienie skóry chodów (zob. „Odcienie skóry chodów: przegląd i poprawki”), nowy chód Inkwizytorki z samym buzdyganem (215 F) oraz czat, w którym wiadomość przeczytana na jednym urządzeniu nie świeci się jako nowa na drugim (zob. „Czat: przeczytane wiadomości na każdym urządzeniu”).
2. **Co zostaje ukryte:** Osada (bez `SETTLEMENT`) z częściami II i III, które są na razie tylko na wersji testowej.
3. **Migracje bazy:** 0058 (`characters.chat_seen`).

## Wersja 0.0.64 (30.10.2026)

Autor: „Po zrobieniu chodu 213 A i 214 A robisz wdrożenie”.

1. **Co wchodzi do gry:** nowe chody wszystkich 40 postaci na scenie Walki, z PixelLab, 8 klatek po 128 × 128, pełny krok w sekundę, większa postać i ścieżka w tempie kroku. Do tego odcienie skóry chodów z `tools/walk-tones.py` oraz nowe portrety Inkwizytorki (złoty krzyż, 213 A) i Truciciela (sztylet wzdłuż nogi, 214 A) z odcieniami skóry (zob. „Strona chodów i wpis na X”, punkt 4).
2. **Co zostaje bez zmian:** portrety Elementalisty i Elementalistki z ogniem (autor: „animacja może przecież różnić się od portretu”).
3. **Co zostaje ukryte:** Osada (bez `SETTLEMENT`).
4. **Migracje bazy:** brak.

## Wersja 0.0.63 (30.10.2026, wdrożenie awaryjne)

Autor: „207 tak wdróż na główny jako motyw awaryjnego wdrożenia”.

1. **Co wchodzi do gry:** liczba postaci każdej klasy na ekranie „Nowa postać” (zob. „Postacie każdej klasy przy tworzeniu postaci”).
2. **Co jeszcze przychodzi z gałęzi, poza grą:** narzędzia nowych chodów (szkielet, Retro Diffusion i PixelLab w przebiegu „Grafiki (szkice)”) i ich klatki startowe. Chody w grze zostają dawne do czasu wyboru autora.
3. **Co zostaje ukryte:** Osada (bez `SETTLEMENT`).
4. **Migracje bazy:** brak.

## Wersja 0.0.62 (30.10.2026)

Autor: „Wdrażaj filtr nazw, „Dodaj 10 Punktów”, pięć postaci, Skrzynia Konta, Encyklopedia tylko z własnych zdobyczy i kropki znajomych w 0.0.62 i chód ten co jest, a w miedzyczasie zajmij sie generowaniem z RetroDiffusion od zera tego chodu.”

1. **Co wchodzi do gry:**
    - filtr niecenzuralnych nazw postaci i okno zmiany nazwy (zob. „Uwagi autora po 0.0.61”, punkt 2);
    - „Dodaj 10 Punktów” na karcie umiejętności (punkt 3 tamże);
    - pięć postaci na koncie z wyborem postaci po zalogowaniu i „Zmień postać” w Ustawieniach (zob. „Pięć postaci na koncie”);
    - Skrzynia Konta w obozie, Encyklopedia tylko z własnych zdobyczy i kropki statusu na liście znajomych (zob. „Skrzynia Konta, Encyklopedia z własnych zdobyczy i status znajomych”).
2. **Chody** zostają w grze takie, jakie są, do czasu nowych z Retro Diffusion.
3. **Co zostaje ukryte:** Osada (bez `SETTLEMENT`).
4. **Migracje bazy:** `0056` (imiona niepowtarzalne także wśród postaci odłożonych) i `0057` (Skrzynia Konta i sztuki z wymiany poza Encyklopedią).

## Postacie każdej klasy przy tworzeniu postaci (30.10.2026, w grze od 0.0.63)

Autor: „chciałbym dorobić w miedzyczasie opcje wyswietlania ile w grze jest postaci danej klasy przy tworzeniu nowej -> po to by gracz wiedział jakiej klasy może brakować w grze komuś (w przyszlosci) do druzyny, jaka jest popularna itp.”

1. Każda karta klasy na ekranie „Nowa postać” ma wiersz „W grze: N postaci tej klasy” (z odmianą: 1 postać, 2–4 postacie, 5 i więcej postaci). Przy zerze stoi „Nikt jeszcze nie gra tą klasą.”.
2. Liczą się wszystkie postacie gry, grane i odłożone, a nie liczy się postać zaparkowana na czas „Testuj samouczki”. Ewolucja liczy się przy swojej klasie, bo ekran pokazuje pięć klas.
3. Liczby przychodzą z listą postaci konta (`GET /api/characters`, pole `classes`), którą ekran i tak pobiera, więc nie dochodzi żadne nowe zapytanie.
4. Autor: „207 tak” (zrzut ekranu „Nowa postać” z liczbami).

## Strona chodów i wpis na X (30.10.2026)

1. **Strona chodów.** Autor: „Wygeneruj mi później stronę tutaj gdzie sprawdze jedna po drugiej wszystkie animacje chodu”. Strona [Chody postaci](https://claude.ai/artifact/4HDDq5mRfAP9uT17PVwhfM) pokazuje po kolei 40 chodów z ekranu Walki (5 klas i 15 ewolucji, każda postać w wersji kobiecej i męskiej) w ośmiu odcieniach skóry, z czterema klatkami osobno na jasnym tle, na którym widać zbłąkane piksele. Zaznaczenia „Dobry” i „Do poprawy” z notatką trafiają do bazy strony (kolekcja `walks`), którą odczytuję. Notatka sama zaznacza „Do poprawy”.
2. **Wpis na X.** Autor: „Wygeneruj mi też wpis do 250 znaków na X taki luźny o tym co jest w grze do tej pory i w jaki sposób to tworzymy. [...] Duzo tutaj z Toba pisalem używaj mojego stylu. Możesz też dać jakieś atrakcyjne screeny z gry”. Wpis (pytanie 185) i zrzuty z lokalnej wersji gry, bez rzeczy, których w grze jeszcze nie ma. Autor: „186 tak / 187 tak / 188 nie - powinien być chociaż screen pełny a nie tak ucięty”, więc 188 to teraz cały ekran zakładki Ewolucja. Potem: „185 daj spokój, poradzilem sobie sam, zrzuty też porobiłem czyli do 188 pozamykane tematy”.
3. **Liczba ewolucji.** Gra ma 15 ewolucji (po trzy na klasę), a 30 to ich umiejętności i portrety (kobieta i mężczyzna). Opis wersji 0.0.61 mówił o 30 ewolucjach i jest poprawiony.
4. **Chody od zera (189).** Autor: „Chody postaci wszystkie od zera wygeneruj w RetroDiffusion bez chodu bazowego a tylko z portretami postaci jako wzorami. 4 klatki chodu w prawo, dam info które posluzy jako wzor bo za duzo do poprawy, zebym sie rozwodzil nad kazdym. Doslownie wszystkie chody generuj od zera. Postac moze byc wieksza, mniejsza, zobaczymy. Ma wygladac ładnie. Kolorowanie później.” oraz „Tymczasowo to co jest to wklej, ale to pilnie do wymiany.”
    - Pierwsza próba: sam portret jako obrazek startowy `rd_advanced_animation__walking` (0,14 USD za chód). Chód ruszał portretem tak, jak stoi, przodem do patrzącego, a 4 klatki nie składały się w pętlę. Autor: „Nie jest zloopowane”, potem „niech przerobi te portrety nawet, tylko na nich sie wzoruje” i „zbuduj szkielet sensowny i na to nakładaj portrety”. Przebiegi z resztą chodów są przerwane. Zdążyły w nich powstać 4 chody, za około 0,56 USD.
    - **Szkielet.** `tools/walk-skeleton.py` rysuje szarego manekina z boku, przodem w prawo, w 4 klatkach chodu, który się zapętla: kontakt, przejście, kontakt drugą nogą, przejście. Dalsze kończyny są ciemniejsze, a ciało przy kontakcie stoi niżej niż przy przejściu. Klatki po 128 × 128 leżą w arkuszu 2 × 2 (`art/references/walks/skeleton.png`).
    - Retro Diffusion (`rd_pro__edit`, 0,18 USD za wersję) ubiera szkielet w postać z portretu, który dostaje jako wzorzec (rodzaj `walks` w `art/prompts.json`, opisy postaci te same co przy dawnych chodach). Cała postać powstaje w jednym arkuszu, żeby klatki były spójne, a ten sam szkielet posłuży przyszłym postaciom.
    - Najpierw próba na dwóch postaciach (Inkwizytor i Wojowniczka, po dwie wersje), a reszta dopiero po zgodzie autora. Kolory skóry dojdą na końcu. Do tego czasu w grze zostają dawne chody.
    - Próba (192–195, 0,72 USD) daje postacie z boku, idące w prawo w pozach szkieletu. Autor pyta: „A jesli RetroDiffusion jest złe do animacji to moze istnieje cos lepszego do animowania”. Narzędziem właśnie do animacji pixel artu na szkielecie jest PixelLab (płatny plan, a do tego kilka centów za animację przez API).
    - Autor o próbie: „Inkwizytor w jednym miejscu skacze w drugim zmienia narzędzia miedzy rekami mimo ze nie powinien”, „wojowniczka na szkielecie B jest okey”, „ale moim zdaniem idziemy w inne narzedzie dodatkowe” oraz „RetroDiffusion dobrze generuje grafiki, ale animacja tragedia”. 192–194 odpadają, 195 jest dobra, a 196 to PixelLab.
    - **PixelLab (196).** Retro Diffusion rysuje postać raz, z boku, na szkielecie (klatka startowa w `art/references/walks/start/`). PixelLab (`animate-with-skeleton-v3`) przestawia tę jedną postać w cztery pozy szkieletu (`art/references/walks/skeleton.json` z `tools/walk-skeleton.py`). Wygląd, ręce i to, co w nich jest, zostają więc te same w każdej klatce, a chód się zapętla. Animuje `tools/animate-walks.mjs` w przebiegu „Grafiki (szkice)” jako rodzaj `walks-pixellab`, z kluczem w sekrecie `PIXELLAB_API_KEY`, a postacie i ich opisy są w `art/walks.json`. Jedna animacja to 2–3 generacje PixelLab (około 0,05 USD).
    - Najpierw próba na Wojowniczce (start z 195) i Inkwizytorze (start z drugiej klatki jego wersji B: buzdygan w prawej, bliższej ręce, kadzielnica w lewej), po dwie wersje.
    - **Strona wyboru (208).** Strona „Chody postaci” pokazuje teraz nowe chody: przy każdej postaci wersje A i B do przełączania, klatki pod spodem, a wybór („Wybieram A”, „Wybieram B”, „Do poprawy” z notatką) zapisuje się w bazie strony (kolekcja `picks`). Autor: „nie moge przejrzeć chodow nie zrobiles z nich mp4”, więc każda wersja gra jako wideo MP4 w pętli, bo animacji strony telefon autora nie odtwarza.
    - **Wybór 208 (pierwsze 12 postaci).** Autor: „Teraz fajnie tylko Elementalistka do mocnej poprawy / Co do reszty - zatwierdziłem, ale wszedzie sie przebijają szare piksele okazjonalne - może kwestia .mp4 albo coś / Może to zginie w tle gry po zmniejszeniu animacji a może musisz to ręcznie wyrzucić, zobaczymy”. Wybrane wersje są w bazie strony (kolekcja `picks`).
    - **Szare piksele.** Wideo oddaje klatki wiernie, a szare plamki dokłada sam PixelLab: w kilku klatkach (u Wojowniczki 1. i 5.) pojawiają się kolory spoza klatki startowej. `tools/walk-palette.py` przekłada każdą klatkę na kolory jej klatki startowej (najbliższy kolor w przestrzeni Lab), więc plamka staje się tkaniną albo skórą, na której leży. Robi to każdy chód przed wgraniem do gry, a strona wyboru pokazuje już chody po tej poprawce.
    - **Elementalistka.** Notatka autora przy jej chodzie: „Całość ma problem przez portret elementalistki i klatke startową, zabierz z portretu jej ogień i problem rozwiązany będzie łatwiej niż próbować to dostosować”. Ogień nad jej otwartą lewą dłonią znika z portretu w grze, ze wszystkich odcieni skóry. Opis chodu mówi teraz „her left hand open and empty”, a klatka startowa i chód powstają od nowa. Portret bez ognia: „209 tak”.
    - **Wybór 208 (wszystkie 40).** Autor: „208 gotowe, poprawek trochę, ale bez tragedii. W końcu zdrowe workflow.” Wybrane są 37 postaci (wersja A albo B w bazie strony), a trzy idą do poprawki według notatek autora:
        - Elementalista: „Ten sam problem co u Elementalistki - trzeba wywalić ogień i od nowa.” Ogień nad jego otwartą lewą dłonią znika z portretu (wszystkie odcienie skóry) i z opisu chodu, a klatka startowa i chód powstają od nowa, jak u Elementalistki.
        - Truciciel: „Pojawia sie drugi sztylet w drugiej rece mimo ze klatka startowa go nie posiada”. Opis chodu mówi teraz o jednym sztylecie w prawej ręce i pustej lewej, a PixelLab animuje go od nowa w 3 wersjach. Po nich autor: „Cały czas nowy sztylet sie generuje, od nowa wygeneruj portret/klatke startową.” Na klatce startowej sztylet był za ciałem, więc gdy bliższa ręka szła do przodu, PixelLab dorysowywał w niej drugie ostrze. Nowa klatka startowa ma sztylet ostrzem w dół w prawej ręce przed biodrem, a lewą rękę pustą. Retro Diffusion rysuje 3 wersje, a portret zmienia się dopiero wtedy, gdy i to nie pomoże. We wszystkich trzech sztylet znów jest za plecami, więc klatka startowa jest poprawiona ręcznie, w dwóch wariantach: krótkie ostrze z pięści w dół przed nogą (wersje A–C na stronie chodów) i obie ręce puste (D–F, klatka `poisoner-male-empty.png`). PixelLab animuje oba, po 3 wersje.
    - **Po 210–212.** Autor: „210 tak, ale uciales pare pikseli konturu dłoni która była pod ogniem, przyjrzyj sie”. Górny kontur palców Elementalisty (3 piksele pod ogniem) wraca we wszystkich odcieniach, a u Elementalistki koniec pasma włosów (5 pikseli), który zabrało pole ognia.
    - Autor: „211 portret Inkwizytorki generuj całkiem od nowa z zaleceniami w RetroDiffusion, bo ten krzyż wygląda żałośnie”. Retro Diffusion rysuje jej portret od nowa bez kadzielnicy, w dwóch wariantach po 3 wersje: z dużym, zdobionym złotym krzyżem uniesionym w lewej dłoni i z grubą świętą księgą przy piersi.
    - Autor: „Truciciel dalej generuje dodatkowy sztylet”. Retro Diffusion rysuje od nowa także jego portret: jeden sztylet ostrzem w dół wzdłuż nogi w prawej dłoni, lewa pusta. Klatka startowa i chód powstaną z wybranego portretu.
    - Notatki na stronie chodów zapisywały się dopiero po chwili, więc notatka wpisana tuż przed przejściem do innej postaci mogła przepaść. Strona zapisuje ją teraz przy wyjściu z pola i przy przejściu dalej.
    - **Chód może różnić się od portretu.** Autor: „Ej ale animacja może przecież różnić się od portretu!! To wrzuć portret Elementalisty i Elementalistki z tym ogniem, a animacje zostaw nowe”. Portrety obu Elementalistów wracają z ogniem, we wszystkich odcieniach skóry, tak jak przed 208. Ich chody bez ognia zostają.
    - **Truciciel: wersja D.** Autor: „Wybrałem wersję D Truciciela, ale z tego co widziałem to portret Truciciela nie wygląda dobrze”. W grze jest chód D, z pustymi rękami, i jego klatka startowa `poisoner-male-empty.png` w `art/walks.json`. Portret zostaje do decyzji autora (214).
    - **Inkwizytorka bez kadzielnicy w chodzie.** Skoro chód może różnić się od portretu, jej klatka startowa traci kadzielnicę, dym i łańcuchy, a lewa dłoń zostaje pusta. PixelLab animuje ją w 3 wersjach, niezależnie od wyboru portretu (213).
    - **Nowe portrety: „213 A 214 A”.** Inkwizytorka ma portret z Retro Diffusion ze zdobionym złotym krzyżem uniesionym w lewej dłoni i buzdyganem w prawej, bez kadzielnicy. Truciciel ma portret z jednym sztyletem ostrzem w dół wzdłuż nogi i pustą lewą dłonią. Oba portrety mają odcienie skóry z nowych masek (`tools/evolution-tones.json`: twarz i obie dłonie, krzyż zostaje złoty), a popiersia centrują się na twarzy (`faces`).
    - Autor: „Po zrobieniu chodu 213 A i 214 A robisz wdrożenie”. Klatki startowe chodów powstają z nowych portretów, PixelLab robi po 3 wersje, a najlepszą, bez latających przedmiotów i drugiego sztyletu, wybieram sam. Potem idzie wdrożenie 0.0.64.
    - **Ostatnie dwa chody.** Inkwizytorka: wersja A z trzech. Krzyż stoi uniesiony z przodu we wszystkich klatkach, a buzdygan chodzi z bliższą ręką. W wersji C krzyż skakał z biodra do góry. Truciciel: wersja A z trzech. W B i C sztylet znikał na dwie klatki, a w A był jeden w każdej klatce, poza pierwszą, gdzie przednia dłoń trzymała drugie ostrze. To ostrze leżało na tle, więc jest usunięte ręcznie. Krzyż ma kolory twarzy, więc `tools/walk-tones.py` nie bierze za skórę niczego tuż przy jego złocie (`near_not`, tylko zwarte grupy tych kolorów, nie pojedyncze piksele w oku).
        - Inkwizytorka: „Kadzidło lata jak szalone w obydwu wersjach zmienia pozycje, nie jest trzymane, jest proboem chyba z klatką startową zatem albo i portretem z którego można to kadzidlo wywalić ewentualnie i dać złoty krzyż albo coś”. Kadzielnica wisi na łańcuchu, więc w każdej klatce PixelLab ustawia ją inaczej. Portret dostaje do wyboru (211) wersję bez kadzielnicy albo ze złotym krzyżem trzymanym pionowo w lewej pięści. Klatka startowa i chód powstają po wyborze autora.
    - **Nowe chody w grze (na wersji testowej).** 37 wybranych chodów zastępuje dawne. Elementalista i Truciciel mają do wyboru autora pierwszą z trzech nowych wersji, a Inkwizytorka do czasu poprawki swoją dawną wersję A. Chód to 8 klatek po 128 × 128 w tempie 8 klatek na sekundę, czyli pełny krok w sekundę (205), w skali 1:1: postać ma około 115 pikseli wysokości, dawna miała 72 (autor: „Postac moze byc wieksza, mniejsza, zobaczymy”). Stopy stoją na ścieżce tam, gdzie stały dawne. Ścieżka przesuwa się o 94 piksele na sekundę, tyle co stopa na ziemi w szkielecie (47 pikseli w pół sekundy), więc stopy nie ślizgają się. Tło przesuwa się o 30 pikseli na sekundę (dotąd ścieżka 60, a tło 20). Postać Systemu, czyli wygląd bez własnego chodu, zostaje bez zmian (`walk.walker` i `walk.figure` w `data/animations.json`).
    - **Odcienie skóry nowych chodów** robi `tools/walk-tones.py`. Skórę portretu zna z jego szarego pliku, bo maski portretów były sprawdzane ręcznie. Kolor chodu jest skórą, gdy najbliższy mu kolor portretu jest w większości skórą, a cienie skóry, np. dłoni w cieniu, dochodzą przy niej same. Poprawki dla 13 postaci są w `tools/walk-tones.json`: brązowy hełm i nagolenniki gladiatorów, latająca księga Arkanistki, kryształy na kosturach Elementalistów, ostrza Nocnej Tancerki, sztylety Trucicieli, szaty i tarcza Kapłanów, lamówka Lodowego Władcy, dłoń Łuczniczki i oczy Zabójczyni. Za ramki służą miejsca szkieletu (głowa, dłonie, ramiona), bo PixelLab trzyma stawy tam, gdzie ma je szkielet. Każda postać jest sprawdzona we wszystkich 8 klatkach w odcieniu szarym i ciemnym. Dawne narzędzia odcieni chodów (`walker-tones.py`, `evolution-walker-tones.py`) są usunięte. Chody zapisują się jako PNG z własną paletą, piksel w piksel takie same: 320 plików zajmuje 4,3 MB zamiast 13 MB, a gra pobiera tylko jeden z nich, około 13 KB.
    - **197.** Autor wykupuje plan PixelLab „Tier 1: Pixel Apprentice” (2000 generacji na miesiąc) i dodaje klucz: „masz podpięte API i zapasu na długo”.
    - Próba PixelLab (198–201): Wojowniczka i Inkwizytor po dwie wersje, każda animacja za 3 generacje (razem 12 z 2000). Cztery klatki kosztują tyle samo co osiem, bo PixelLab liczy czas generowania: 3 klatki to 2 generacje, a 8 klatek to 3.
    - Autor: „199 tak, 201 tak, 202 tak, 203 tak”. Wojowniczka i Inkwizytor mają chody z PixelLab w wersjach B (199, 201).
    - **8 klatek (202).** Chód gra cztery pozy kluczowe szkieletu, a po każdej pozę w połowie drogi do następnej, liczoną kąt po kącie. W grze pójdzie 16 klatek na sekundę, więc z tą samą prędkością co 4 klatki po 8 na sekundę. Przykład (204) czeka na ocenę autora.
    - **Pozostałe 38 postaci (203).** Retro Diffusion rysuje każdą raz, w 2 wersjach, a opis mówi, co trzyma prawa, bliższa ręka, a co lewa, tak jak na portrecie (`art/prompts.json` i `art/walks.json`). Lepszą wersję klatki startowej wybieram sam, a PixelLab animuje każdą postać w 2 wersjach. Najpierw idzie 10 postaci z różnymi przedmiotami w rękach, potem reszta.
    - Autor: „204 tak / ale wolniej niech chodzi, mniejsze FPS w grze”. Wszystkie chody mają 8 klatek, a w grze idą wolniej niż teraz: 8 klatek na sekundę, czyli pełny krok w sekundę (autor: „205 tak”). Tempo to jedna liczba w `data/animations.json`. Chód Wojowniczki to przykład z 204.
5. **Raz, a dobrze.** Autor: „I pamietaj ze lepiej raz zainwestowac dobrze niz po troche i slaby efekt miec na końcu”. Przy wyborze narzędzia, planu albo liczby wersji liczy się efekt końcowy: lepsze narzędzie albo więcej wersji do wyboru od razu, zamiast poprawek po kawałku. Krótka próba do oceny autora i tak idzie przed każdą dużą partią.

## Skrzynia Konta, Encyklopedia z własnych zdobyczy i status znajomych (30.10.2026, na wersji testowej)

Autor: „180 ok / 181 ok”, „Niech wszystkie postaci znajduja sie w rankingu, jeśli się łapią na tę opcję.”, a dalej: „I w sumie może zróbmy w Obozie Skrzynię Konta wspólną dla wszystkich postaci. Mała liczba slotów na przedmioty. I tak większość jest obwarowana lvlami a czemu ktoś miałby nie mieć łatwiej na starcie jeśli włożył sporo czasu w pierwszą postać. Z Encyklopedii tylko wykluczyć zdobycze z wymian i Skrzyni Konta i powinno byc okey. Zrobić tak, ze postac sama musi wytworzyć przedmiot albo zdobyć żeby zaliczylo w Encyklopedii.” oraz „potrzeba statusu "online" "zajęty" i "offline" w Liście znajomych. Może to być po prostu kropka zielona żołta i czerwona. Status zajęty pokazywałby brak możliwości wymiany (bo nie wiemy tego czy postać coś robi i ma te możliwość do czasu kliknięcia Wymiany).”

1. **180 i 181** są zatwierdzone: przycisk „Dodaj 10 Punktów” i ekran wyboru postaci zostają tak, jak na obrazkach.
2. **Ranking.** Tak już jest od pięciu postaci: każda postać, także odłożona, stoi w Rankingu, gdy łapie się do pierwszej setki w wybranym porządku, a w porządku według Poziomu Profesji, gdy pracowała w którejś profesji.
3. **Skrzynia Konta** (`src/server/chest.js`, `src/client/screens/chest.js`):
    - Stoi na planszy obozu, między Magazynem a Ogniskiem, jako rysunek skrzyni skarbów, tej samej co przy skrzyniach Bestiariusza (`art/materials/chest.png`). Ma własny ekran, jak budynek.
    - Mieści 5 przedmiotów (`account.chestSlots` w `data/balance.json`), wspólnych dla wszystkich postaci na koncie. Mieści tylko przedmioty: złoto, zasoby, zioła, mikstury i materiały zostają przy swojej postaci (177 A).
    - Postać wkłada przedmiot z plecaka (nie założony) i wyjmuje go do plecaka, gdy ma w nim miejsce. Jak przy każdej zmianie plecaka, tylko wtedy, gdy jest w obozie.
    - Postać, która włożyła przedmiot, wyjmuje go taki, jaki był. Inna postać dostaje go oznaczonego jako ze Skrzyni Konta: założy go od jego poziomu, jak przedmiot z wymiany („Przedmiot ze Skrzyni Konta założysz od poziomu postaci N.”), a Encyklopedia go nie zalicza. Większość przedmiotów i tak ma wymagany poziom klasy.
    - Przy przedmiocie w skrzyni stoi, od której postaci jest, i czy obecna postać go założy.
    - Skrzynia zostaje po „Zacznij od nowa” i znika razem z kontem (`migrations/0057_account_chest.sql`).
4. **Encyklopedia tylko z własnych zdobyczy.** Encyklopedia nie zalicza przedmiotów z wymiany ani przedmiotów od innej postaci ze Skrzyni Konta. Zioła, mikstury i materiały z wymiany też się nie liczą. Gra pamięta, ile sztuk z wymiany postać ma (`characters.foreign_stacks`), i zalicza dopiero sztuki ponad nie, czyli zebrane, uwarzone albo zdobyte przez samą postać. Sztuki z wymiany zużywają się pierwsze. Odkrycia sprzed tej zmiany zostają, a trofea z materiałów liczą się tak samo jak odkrycia.
5. **Status na liście znajomych.** Przed imieniem znajomego stoi kropka:
    - zielona, online: gracz gra tą postacią i w ciągu ostatnich 2 minut miał grę otwartą, jak przy Wymianie;
    - żółta, „zajęty”: gracz jest online, ale wymiany teraz nie zacznie, bo postać jest na wyprawie albo przy pracy profesji, jest w innej wymianie, ma wymiany wyłączone albo wymiana między wami jest zablokowana;
    - czerwona, offline: także postać odłożona, gdy jej gracz gra inną.

    Lista Znajomych sama odświeża się co 30 sekund, ale nie wtedy, gdy gracz wpisuje imię do zaproszenia.
6. **Odpowiedzi autora:** „182 ok” (Skrzynia na planszy obozu), „183 ok” (ekran Skrzyni), „184 ok” (kropki znajomych). O komunikacie Systemu na ekranie Skrzyni: „Przedmiot od innej postaci będziesz mógł załozyć od jego poziomu możesz sobie darować, bo to się można domyślić. Czyli po prostu "Encyklopedia go nie zaliczy [...]" jeśli chodzi o drugie zdanie.” Potem: „Ad. Drugie zdanie komunikatu zmień na "Encyklopedia nie zaliczy przedmiotu: [...]"”. Drugie zdanie brzmi więc: „Encyklopedia nie zaliczy przedmiotu: liczy się tylko to, co postać sama zdobędzie albo wytworzy.” Przy samym przedmiocie w skrzyni nadal stoi, od którego poziomu postać go założy.

## Pięć postaci na koncie (30.10.2026, na wersji testowej)

Autor: „Następnie pięć postaci / 176 A / 177 A / 178 A” (zob. „Pięć postaci na koncie: decyzje autora”).

1. **Do pięciu postaci.** Konto ma najwyżej 5 postaci (`account.characters` w `data/balance.json`). Gracz gra jedną naraz, a pozostałe czekają odłożone. Ich rozpoczęte wyprawy i prace trwają dalej (176 A), a obóz, odpoczynek i Punkty Czasu biegną tak, jak u postaci, do której gracz akurat nie zagląda. Raport z wyprawy odłożonej postaci czeka, aż gracz znów nią zagra.
2. **Wybór postaci.** Po zalogowaniu, loginem albo przez Google, konto z więcej niż jedną postacią najpierw wybiera postać. Każda ma kartę z portretem, klasą, poziomami i tym, co robi („Eksploracja · Skraj Wiatrołomów · do 16:06”, „raport gotowy” albo „Odpoczynek”). Grana postać ma znaczek „Grasz teraz”. Konto z jedną postacią wchodzi od razu do gry. W Ustawieniach przycisk „Zmień postać” otwiera ten sam wybór. Po wyborze gra zaczyna od zakładki Walka.
3. **Nowa postać.** Na ekranie wyboru przycisk „Nowa postać” otwiera tworzenie postaci, z przyciskiem „Wróć do wyboru postaci”. Nowa postać od razu staje się graną, a poprzednia czeka odłożona. Przy pięciu postaciach zamiast przycisku stoi: „Na koncie jest już 5 postaci. Nową stworzysz, gdy usuniesz jedną z nich.” Nowa postać dostaje wprowadzenie narratora jak każda nowa postać.
4. **„Zacznij od nowa”** usuwa tylko graną postać. Pozostałe zostają, a gra otwiera wybór postaci albo, gdy żadnej nie ma, tworzenie nowej. „Usuń konto” usuwa wszystkie postacie konta.
5. **Imiona** są niepowtarzalne wśród wszystkich postaci, także odłożonych (`migrations/0056_characters_aside.sql`).
6. **Ranking, czat i znajomi.** Każda postać ma, jak dotąd, swoje miejsce w Rankingu, swoich znajomych, Upominki i rozmowy prywatne. Gracz występuje w nich jako postać, którą akurat gra: nią pisze na czacie, a „Twoje miejsce” w Rankingu i lista Znajomych dotyczą jej. Odłożone postacie zostają w Rankingu i na listach znajomych. Zaproszenie, Upominek albo prywatna wiadomość dla odłożonej postaci czekają, aż gracz nią zagra.
7. **Między postaciami jednego konta (177 A)** nie ma wymiany ani znajomości, a więc i Upominków, ani prywatnych wiadomości. Karta własnej postaci, np. po stuknięciu jej imienia w Rankingu, nie ma przycisków. Wymiana idzie tylko z postacią, którą jej gracz akurat gra i jest online. Zmiana postaci kończy trwającą wymianę.
8. **Punkty Systemu (178 A)** ma każda postać swoje. Kod podarunkowy działa raz na konto, jak dotąd. Punkty Systemu za e-mail albo Google przychodzą raz na konto, do postaci granej w tej chwili.
9. **Powiadomienia na telefon** przychodzą dla postaci, którą gracz akurat gra. Wyprawa odłożonej postaci kończy się bez powiadomienia, a ekran wyboru pokazuje przy niej „raport gotowy”.
10. **Panel autora** liczy wszystkie postacie, a przy koncie z kilkoma podaje, ile ich ma.
11. **Wersja testowa.** Gdy w „Testuj samouczki” postać czeka z boku na czas wprowadzenia, nie da się zmienić postaci ani stworzyć kolejnej, dopóki ta nie wróci („Najpierw wróć do swojej postaci w „Testuj samouczki”.”).

## Uwagi autora po 0.0.61 (30.10.2026, na wersji testowej)

1. **50. poziom klasy na próbę.** Autor: „Zmień moją postać na testowym by miała 50 poziom klasy, bo nie chce mi się przeklikiwać tego.” Stąd nie ma dostępu do bazy wersji testowej ani do konta autora, więc w „Testuj ewolucję” (Ustawienia, tylko wersja testowa) jest przycisk „Ustaw 50. poziom klasy”. Cofa ewolucję z testu, jeśli jest, i daje postaci 50. poziom klasy. Ewolucję wybiera się potem jak w grze. Postać po prawdziwej ewolucji zostaje bez zmian.
2. **Filtr imion postaci.** Autor: „Trzeba zrobić też filtr niecenzuralnych nazw postaci, bo już takie istnieją.”, „Chcemy najłagodniejszego filtra jaki jest możliwy, ale no z tego co rozumiem - musi być.” i dla istniejących nazw: „wymusić zmianę nazwy przy kolejnym wejściu do gry z komunikatem niepomijalnym: "UWAGA, nazwa Twojej postaci łamie xxx (w xxx wstaw z czym koliduje w kwestiach Sklepu Play). Musisz zmienić swoją nazwę."”
    - Filtr bierze tylko słowa, które czat i tak zamienia na gwiazdki (`words` w `data/chat.json`: 15 rdzeni mocnych wulgaryzmów i obelg). To najłagodniejsza możliwa lista. Imię nie przechodzi, gdy zawiera któreś z nich, także zapisane cyframi („Kurw4”), podobnymi literami cyrylicy, z podwojonymi literami albo ze spacjami, myślnikami, apostrofami i podkreślnikami między literami (`src/engine/names.js`). Imiona, które tylko przypominają te słowa (np. Nigel, Kurt), przechodzą.
    - Przy tworzeniu postaci gra odmawia: „To imię łamie zasady Google Play dotyczące nieodpowiednich treści. Wybierz inne.”
    - Postać, która już nosi takie imię, przy wejściu do gry dostaje okno, którego nie da się zamknąć: „UWAGA, nazwa Twojej postaci łamie zasady Google Play dotyczące nieodpowiednich treści. Musisz zmienić swoją nazwę.” W miejscu xxx stoi zasada Google Play o nieodpowiednich treściach (wulgaryzmy), a w oknie jest pole na nową nazwę, sprawdzaną jak przy tworzeniu postaci. Wiadomości tej postaci na czacie dostają nową nazwę. Zmiana nazwy działa tylko dla imion, które filtr blokuje.
    - Autor o oknie zmiany nazwy: „179 ok”.
3. **„Dodaj 10 Punktów” na karcie umiejętności.** Autor przy karcie umiejętności po ewolucji: „Po ewolucji (jak na screenie żeby nie trzeba bylo tyle klikać można dodać tu opcję "Dodaj 10 Punktów"”. Nad „Zamknij” i „Dodaj punkt” stoi przycisk „Dodaj 10 Punktów” na całą szerokość. Dodaje 10 punktów jednym stuknięciem, bez pytania, tak jak „Dodaj punkt” dodaje jeden. Pokazuje się, gdy postać ma co najmniej 10 wolnych Punktów Umiejętności, a umiejętności zostało co najmniej 10 poziomów. Działa też przed ewolucją.

## Wersja 0.0.61: ewolucje klas w grze (30.10.2026)

Autor: „Wdrażaj 0.0.61”, a wcześniej: „Deploy 0.0.61 to Ewolucje klas.”

1. **Co wchodzi do gry:** ewolucje klas na 50. poziomie klasy (przełącznik `EVOLUTIONS` w `wrangler.jsonc` ma teraz w grze wartość „on”): 15 ewolucji (po trzy na klasę) z cechami, 30 umiejętnościami z ikonami i dźwiękami, portretami w odcieniach skóry i chodem w walce (każda w wersji kobiecej i męskiej), zakładka Ewolucja z tłem źródła i portretem na karcie, ceremonia z muzyką, darmowe zerowanie statystyk po ewolucji, przywołańce we własnej karcie oraz rozdział narratora o Ewolucji z nagraniami.
2. **Co zostaje ukryte:** Osada (bez `SETTLEMENT`), a z nią zmiana ewolucji u Pustelnika.

## Pięć postaci na koncie: decyzje autora (30.10.2026)

Autor: „Chcemy też stworzyć możliwość posiadania 5 postaci na jednym koncie. Jest to wykonalne sprawnie?” i odpowiedzi „176 A / 177 A / 178 A”:

1. **176 A.** Rozpoczęta wyprawa albo praca odłożonej postaci toczy się dalej, gdy gracz gra inną.
2. **177 A.** Wymiana między postaciami tego samego konta jest zablokowana.
3. **178 A.** Każda postać ma swoje Punkty Systemu, a kod podarunkowy działa raz na konto.
4. **Plan:** wybór postaci po zalogowaniu i „Zmień postać” w Ustawieniach, tworzenie nowych postaci do pięciu, imiona niepowtarzalne wśród wszystkich postaci, a ranking, czat i znajomi pokazują postać, którą gracz akurat gra.

## Ewolucja przed 0.0.61: tło zakładki i portret na karcie (30.10.2026, w grze od 0.0.61)

Autor: „Deploy 0.0.61 to Ewolucje klas. Ale do tego potrzebujemy jeszcze odpowiedniego tła w zakładce - jakiegoś źródła wody ze stołem ceremonialnym.” oraz „przy wyborze ścieżki ewolucji powinien stac wizerunek nowej postaci z aktualnie nałożonym odcieniem skóry i płcią. [...] Sam wybierz co lepsze - bardziej estetyczne i wygodne dla gracza.”

1. **Tło zakładki.** Nagłówek „Ewolucja klasy” stoi na obrazku źródła ze stołem ceremonialnym (`place` w `data/evolutions.json`, obrazek w `src/client/art/places/`, w stylu miejsc Profesji, 192 × 96), przygaszonym jak za kartami Profesji, z nazwą na dole. Wersję obrazka wybiera autor.
2. **Portret na karcie ewolucji.** Na każdej karcie ewolucji, przy wyborze i po nim, z prawej strony stoi postać tak, jak rysuje ją ta ewolucja, w wyglądzie i odcieniu skóry postaci gracza (ok. 40% szerokości karty). Tekst opływa portret, a pod nim biegnie na całą szerokość. Półprzezroczysty portret pod tekstem byłby słabiej widać i gorzej by się go czytało, więc portret stoi obok tekstu.
3. **Odpowiedzi autora:** „174 A” (źródło z wodospadami po lewej i stołem po prawej, ta wersja stoi w grze) i „175 ok”.

## Wersja 0.0.60 (30.10.2026)

Autor: „Zrób wdrożenie 0.0.60”. Do gry wchodzi poprawka objaśnienia Encyklopedii, które pokazuje się teraz najwyżej raz (zob. „Uwagi autora po 0.0.59”, punkt 1). Osada z pochodniami, ewolucje klas i ich rozdziały narratora zostają w grze ukryte.

## Uwagi autora po 0.0.59 (30.10.2026, w grze od 0.0.60 (punkt 1))

1. **Objaśnienie Encyklopedii wracało.** Autor: „odtwarza mi sie samouczek encyklopedii na glownym serwerze co jakis czas jak wchodze chyba nie powinno tak być”. Wskazówka przy książce w górnym pasku była prowadzeniem (`lead`), a takie gra pamięta dopiero po stuknięciu. Gdy gra zamknęła się albo przeładowała, zanim gracz poszedł za wskazówką, wracała przy następnym wejściu, i tak do skutku. Teraz kwestia późna (`late`, dla postaci, które skończyły wprowadzenie przed jej dopisaniem: Encyklopedia i zadania) jest zapisana jako przeczytana, gdy tylko się pokaże. Każda pokazuje się więc najwyżej raz, a wskazówka przy książce ma `once`, żeby serwer ją pamiętał. Wskaźnik w samej Encyklopedii pokazuje się raz, przy pierwszym jej otwarciu.
2. **Pochodnie za dnia.** Autor: „Niech za dnia beda zgaszone te pochodnie całkiem”. W dzień (od 8 do 18 według godziny w Polsce) pochodnie stoją zgaszone: osobny obrazek bez płomienia, z osmolonym czubkiem (`torch-off.png`, z tego samego rysunku), bez blasku i migotania. Świtem, o zmierzchu i w nocy płoną.

## Wersja 0.0.59 (30.10.2026)

Autor: „Możesz również zrobić deploy 0.0.59 z zakresem: więcej walk na dłuższych wyprawach (166), kwestie o Bestiariuszu i Encyklopedii oraz lżejsza muzyka.”

1. **Co wchodzi do gry:**
    - więcej walk na dłuższych wyprawach z lekką premią za długość i dłuższym odpoczynkiem (zob. „Więcej walk na dłuższych wyprawach”);
    - kwestie narratora o Bestiariuszu i Encyklopedii w pierwszym wprowadzeniu (zob. „Wprowadzenie: Bestiariusz i Encyklopedia”);
    - lżejsze pliki muzyki, pobierane po starcie gry (zob. „Muzyka: lżejsze pliki, pobierane po starcie gry”).
2. **Co zostaje ukryte w grze:** ewolucje klas (`EVOLUTIONS` „off”) i Osada (bez `SETTLEMENT`), a z nimi wszystko, co od nich zależy: ich rozdziały narratora, dźwięki i chody ewolucji, przywołańce we własnej karcie i zwijane zlecenia. Ich kod i grafiki są w plikach gry, ale gra ich nie pokazuje.

## Narrator: Osada i Ewolucja (30.10.2026, na wersji testowej)

Kwestie z pytań 167 i 168 w brzmieniu z poprawkami autora (`data/tutorial.json`, części `settlement` i `evolution`). Każda część ma swój przycisk „Pomiń objaśnienie”.

1. **Osada** (od 20. poziomu postaci, gdzie gra ma Osadę, po wszystkich wcześniejszych częściach): karta „Dwudziesty poziom postaci… Życie toczy się również poza puszczą. System otworzył przed Tobą Osadę.”, potem zakładka Osada („Osada czeka w tej zakładce. Zajrzyjmy na Rozstaje.”). Na planszy narrator wskazuje Tablicę zleceń przy dwóch kwestiach o zleceniach i bractwach, a na koniec Pracownię Zaklinaczki i Chatę Pustelnika razem.
2. **Ewolucja** (od 50. poziomu klasy, dopóki ewolucja nie jest wybrana, po Osadzie): karta o Ewolucji, potem zakładka Postać, skąd narrator sam przechodzi do Ewolucji i wskazuje komunikat Systemu nad dwiema ewolucjami (karty ewolucji są za wysokie, żeby podświetlić je w całości). Kwestie o Punktach Umiejętności i o setnym poziomie klasy idą jako karty.
3. **Wersja dla postaci kobiecej.** Kwestia 168.3 ma wariant „Pora byś wybrała swoją ścieżkę.”, a reszta zdania bez zmian.
4. **Do sprawdzenia.** W trybie testowym Ustawienia mają „Objaśnienie Osady” i „Objaśnienie Ewolucji” od nowa, jak przy innych częściach. Nagrania (po 2 wersje) idą na stronę odsłuchu do wyboru autora.
    - Autor: „170 Kwestie narratora zaznaczone.” W grze grają wybrane wersje: 1 przy kwestiach Osady poza Tablicą zleceń (2), a przy Ewolucji 2 przy karcie na początek, zakładce Postać, wersji żeńskiej wyboru ewolucji i karcie na koniec, a 1 przy pozostałych.
5. **Komunikat Systemu na ekranie Ewolucji.** Autor przy komunikacie nad ewolucjami: „tego edytujemy tekst” i nowe brzmienie: „Na 50 poziomie klasy Twoja postać staje u progu ewolucji. Wybierz jedną z dwóch ścieżek. Druga ścieżka bezpowrotnie zniknie. Nie martw się jednak - zainwestowane w nią punkty bedziesz mógł jednorazowo rozdysponować, na wyewoluowane Umiejętności.” W grze stoi to brzmienie z kropką po „50”, ogonkiem w „będziesz” i półpauzą jak w innych tekstach gry, a postać kobieca widzi „będziesz mogła” (`intro` i `introFemale` w `data/evolutions.json`).

## Więcej walk na dłuższych wyprawach (30.10.2026, na wersji testowej)

Pytanie 166 wyszło z uwagi osoby testującej grę: dwie półgodzinne wyprawy dawały razem 6 walk, a jedna godzinna 4. Autor: „nie może być więcej walk w krótkiej wyprawie niż w długiej”, a dalej: „odpowiedź B, z lekką premią z C (obniżoną jednak mimo wszystko…)”.

1. **Walki** (`fightsByMinutes`): 1 minuta to 1 walka, 5 minut 2, 15 minut 3, pół godziny 4, godzina 6, 2 godziny 8, a 4 godziny 10. Każda walka nadal odpowiada za swoją część czasu (minuty na walkę podzielone przez 12), więc XP, złoto i materiały na godzinę zostają te same. Mikstur każdego rodzaju można wziąć tyle, ile walk. Punkt zastępuje liczby z punktu 6 „Nowej skali i eksploracji”.
2. **Lekka premia za długość** (`lengthBonusByMinutes`, obniżone C): do pół godziny bez premii, godzina +2% XP i złota, 2 godziny +4%, 4 godziny +6% (pomiędzy płynnie).
3. **Dłuższy odpoczynek** (`restBonusByMinutes`): po wygranej walce postać odzyskuje o 10 punktów procentowych więcej brakującego HP na godzinnej wyprawie i o 20 więcej na 4-godzinnej; do pół godziny bez zmian. Bez tego więcej walk na długiej wyprawie oznaczałoby więcej omdleń.
4. **Symulacja** (postać 50. poziomu): omdlenia przy 15 minutach 0,5%, pół godzinie 0,3%, godzinie 1,2%, 2 godzinach 1,3% i 4 godzinach 3,3% (wcześniej 0,5%, 0,3%, 0,8%, 1,3% i 4,8%). XP na godzinę prawie się nie zmienia, a na 4-godzinnej jest o ok. 6% wyższe.

## Muzyka: lżejsze pliki, pobierane po starcie gry (30.10.2026, na wersji testowej)

Autor: „53 B”.

1. **Lżejsze pliki.** Utwory są przekodowane ze zmienną przepływnością (LAME V5): 93–126 kb/s zamiast 171–190 kb/s, o 31–47% mniejsze, razem 17 MB zamiast 27 MB. Oba pliki każdego utworu są do porównania na słuch na stronie odsłuchu, w grupie „Muzyka: lżejsze pliki”.
2. **Pobieranie.** Ekran logowania nie pobiera muzyki. Utwór pokazanego ekranu pobiera się 3 s po pokazaniu pierwszego ekranu gry albo przy pierwszym stuknięciu, więc na wolnym łączu nie opóźnia startu gry ani jej obrazków (`prefetchMusic` w `src/client/music.js`).

## Wprowadzenie: Bestiariusz i Encyklopedia (30.10.2026, na wersji testowej)

Autor: „138-140 A” i „Drobiazgi - zgadzam się”.

1. **Bestiariusz.** Na Skraju Wiatrołomów, przed pierwszą wyprawą, narrator wskazuje Bestiariusz miejsca, w formie męskiej albo żeńskiej. Tylko nowe postacie.
2. **Encyklopedia.** Po kwestii o zadaniach narrator wskazuje księgę w górnym pasku, a w Encyklopedii pierwszy zestaw klasy z bronią z pierwszej wyprawy. Te dwie kwestie przychodzą raz także do postaci, które przeszły wprowadzenie wcześniej, jak kiedyś kwestia o zadaniach.
3. **Głos.** Każda kwestia ma 2 nagrania (ElevenLabs, głos i ustawienia jak w części o Rzemieślnictwie), przycięte tam, gdzie kończy się mowa. Na wersji testowej gra na razie wersja 1, a wybór jest na stronie odsłuchu, w grupie „Objaśnienie Encyklopedii i Bestiariusza”.

## Przywołańce we własnej karcie (30.10.2026, na wersji testowej)

Autor (pytanie 132 B): „Przywołańce powinni stawać w osobnych kartach w walce, a jeśli wszystkie są zajęte powinna zostać dostawiana dodatkowa - można tak też zrobić od razu”.

1. **Miejsce.** Żywiołak i Trujący Szlam stają we własnej karcie w szyku drużyny, przed postacią, która je przywołała: w najbliższym wolnym polu przed nią (z tyłu: środek, potem przód; ze środka: przód). Gdy wszystkie te pola są zajęte, karta przywołańca dochodzi jako dodatkowa w polu tuż przed postacią, a u postaci z przodu w jej własnym polu, przed nią.
2. **Karta.** Figura przywołańca, jego nazwa, poziom postaci i pasek HP, w przerywanej ramce. Ciosy wrogów wymierzone w postać lecą do karty przywołańca, a jego ciosy i plucie jadem wychodzą z niej.
3. **Koniec.** Przywołaniec, który padł, zostaje szary z krzyżykiem jak pokonany uczestnik walki, aż postać przywoła go znowu; Trujący Szlam rozpryskuje się z tej karty. Gdy minie jego czas albo padnie postać, karta znika.
4. **Silnik bez zmian.** Przywołaniec dalej nie jest osobnym uczestnikiem walki: wrogowie wybierają cel po miejscu postaci, a cios przejmuje przywołaniec. Zmienia się tylko odtwarzanie walki (`src/client/arena.js`), więc także zapisane raporty pokazują przywołańców w ich kartach.

## Ewolucje: kolory skóry (30.10.2026, na wersji testowej)

Autor: „Pamietaj jeszcze o tych odcieniach skóry do zrobienia później ręcznie maskami i przerysowaniem” i „pamiętaj żeby potem dokanczac te animacje portrety”.

1. **Maski.** Każdy z 30 portretów ewolucji i każdy z 30 chodów ma maskę skóry zrobioną ręcznie i sprawdzoną piksel po pikselu: twarz, szyja, dłonie, a gdzie je widać, także ramiona, kolana i bose stopy. Zbroja, skórzane rękawy, włosy, brody, malunki wojenne i drzewce broni zostają w kolorach szkicu, także gdy mają barwę skóry (brąz Gladiatora, rękawy Snajpera). Maski są w `tools/evolution-tones.json` i `tools/evolution-walker-tones.json`, a pliki odcieni robią `tools/evolution-tones.py` i `tools/evolution-walker-tones.py`.
2. **Odcienie.** Każdy kolor skóry zachowuje swoje miejsce między najciemniejszym a najjaśniejszym kolorem skóry postaci, na skali odcienia, jak przy portretach klas. Twarz narysowana jednym kolorem albo bez cienia (np. Skrytobójczyni, Elementalista) zaczyna od środka skali, nie od cienia, żeby w każdym odcieniu nie wyszła za ciemna.
3. **W grze.** Po ewolucji portret i chód mają kolor skóry postaci, tak jak przed nią. Inny wariant chodu z pytań 43–52 i 56 zmienia tylko maskę tego jednego chodu.
4. **Sprawdzenie.** Na wersji testowej: Ustawienia → Testuj ewolucję, potem Ustawienia → Kolor skóry; portret widać na Postaci, a chód na Walce. Próbki dla autora: pytanie 130 i obrazki 130, 130b i 130c.

## Ewolucje: balans (29–30.10.2026, na wersji testowej)

`tools/evolution-sim.mjs` porównuje każdą ewolucję z jej klasą bez ewolucji: typowa postać z `tools/simulate.mjs` na danym poziomie, w obszarze dla tego poziomu, z tymi samymi przedmiotami, a Punkty Umiejętności ewolucji są rozdane po równo (40 zwróconych i 1 za każdy poziom klasy od 51.). Narzędzie mierzy omdlenia, XP na godzinę, HP na końcu, długość walki oraz obrażenia zadane i przyjęte w jednostce czasu walki, bo XP na godzinę zależy głównie od liczby walk na wyprawie.

1. **Wyniki** (postacie 50. i 75. poziomu, klasa 56 i 89, po 30–60 godzinnych wypraw): większość ewolucji zadaje od 33% mniej do 34% więcej niż klasa, a obronne (Łowca, Władca Lodu, Arkanista, Truciciel) przyjmują o 20–62% mniej. Najsilniejsze: Inkwizytor (+49% i +112% wobec Kleryka, w liczbach tyle co Barbarzyńca), Snajper (+9% i +53%), Strzelec Burzy (+25% i +45%), Skrytobójca (+16% i +39%).
2. **Odstają trzy:**
    - Elementalista mdleje w 5–13% wypraw (Mag wcale) i przyjmuje o 86–128% więcej, bo traci spowolnienie Mroźnego podmuchu;
    - Strażnik zadaje o 42% mniej niż Wojownik, przyjmuje o 11–13% mniej, a jego walki trwają 1,6–1,7 raza dłużej;
    - Nocny Tancerz zadaje o 16% mniej niż Cień, a przyjmuje mniej więcej tyle samo.
3. **Sprawdzone poprawki** (w pamięci, dane bez zmian): spowolnienie Promienia Żywiołów jak w Mroźnym podmuchu (50–69%) daje 0–2% omdleń i o 21–53% więcej przyjętych obrażeń; Wyzwanie z ciosami silniejszymi o 50–100% daje o 6–16% mniej zadanych i o 11–12% mniej przyjętych obrażeń niż u Wojownika oraz więcej HP na końcu; Wir cieni po 30–60% zamiast 20–40% daje o 2–6% mniej zadanych niż u Cienia. Nie pomogły: więcej Siły w przyroście Strażnika, większe odbicie Wyzwania i Niezłomnego ani więcej Witalności Elementalisty.
4. **Do autora.** Liczby umiejętności ewolucji pochodzą od autora albo z zatwierdzonej propozycji (zob. „Ewolucje: odpowiedzi autora”), więc te zmiany idą jako pytania 134–137 w czacie. Do odpowiedzi gra zostaje bez zmian.
5. **Odpowiedzi autora** (30.10.2026): 134 A, 135 A i 137 A, a przy 136: „Czemu ewolucja ma zadawać mniej niż przed Ewolucją? czy chodziło Ci o inne ewolucje Cienia? jesli to drugie to A”. Cień w pytaniu 136 to ta sama postać przed ewolucją, więc Nocny Tancerz dostaje mocniejszy Wir cieni niż w propozycji: zadaje co najmniej tyle co Cień.
    - Promień Żywiołów: mróz spowalnia trafionych o 50–69%.
    - Wyzwanie: w czasie Wyzwania Strażnik zadaje o 50–100% więcej.
    - Wir cieni: cztery ciosy po 45–90% zamiast 20–40%.
    - W symulacji z tymi liczbami (postacie 50. i 75. poziomu, po 40 wypraw) Elementalista mdleje w 0–2,5% wypraw i zadaje o 20–46% więcej niż Mag, Strażnik zadaje o 4–15% mniej niż Wojownik i przyjmuje o 10–11% mniej, a Nocny Tancerz zadaje o 5–19% więcej niż Cień (o 3–20% więcej na poziomach 40–75) i przyjmuje o 2–15% więcej. Strażnik zostaje ewolucją obronną, która zadaje mniej: idzie to do autora jako pytanie 152.
6. **Odpowiedź 152** (30.10.2026): „152 dobrze zalecasz będzie B”. W czasie Wyzwania Strażnik zadaje o 75–150% więcej (zamiast 50–100%); w symulacji zadaje wtedy tyle co Wojownik na 50. poziomie i o 19% więcej na 75., a przyjmuje o 11–13% mniej.

## Grafiki ewolucji: poprawki po ocenie autora (29.10.2026, na wersji testowej)

Autor o pozycjach 24–42: „kobieta Inkwizytor wyglada jak facet, dorób jej chociaż lekki biust albo coś ręcznie / 24. A / […] / 25 Tak / 26 Popraw / 27 Tak / 28 Tak / 29 Młyn popraw, zlewa się / 30 Tak / 31 Popraw obydwa (pierwsze usuń tylko tło) / 32 Tak / 33 Popraw grot z zadziorem (parę pikseli zbędnych z prawej strony) / 34 Tak / 35 Tak / 36 Tak, tylko wygeneruj jeszcze postać żywiołaka do gry do walki w oparciu o wygląd z umiejętności) / 37 Tak, tylko w Cudzie pozbądź sie zbędnych pikseli / 38 Tak / 39 Tak / 40 Tak / 41 Tak, tylko więcej tego jadu troszkę, a Szlam musi być też postacią w grze do walki / 42 Taniec ostrzy do poprawy”.

1. **Inkwizytorka.** Krzyż na łańcuszku wisi 2 piksele wyżej, a pod nim i obok widać lekki biust: jaśniejszy łuk u góry i cień pod spodem. Poły płaszcza rozchodzą się na wysokości biustu i schodzą się w talii, a pas jest węższy o 2 piksele. Pod ustami doszła pełniejsza dolna warga w kolorze różu (3 piksele), bo z nią twarz czyta się wyraźniej jako kobieca.
2. **Elementalistka** (autor: „24. A”). Portret ma rozmiar pozostałych (postać wysokości 118 px). Chód: 4 szkice z portretu do wyboru autora (pozycja 44). Na próbę w grze stoi szkic A, z płomykiem nad dłonią w każdej klatce.
3. **Chód Kapłana** (autor: „26 Popraw”). Zamówienie chodu podawało „srebrną tarczę i kropidło”, a na portrecie Kapłan ma biało-złotą tarczę i buzdygan. Stąd tarcza widziana z boku w co drugiej klatce. Opis jest poprawiony i są 4 nowe szkice. Do wyboru autora idą C i D, bo A ma inne włosy niż portret, a B znowu pokazuje tarczę z boku. Na próbę w grze stoi szkic D: ta sama postać w każdej klatce, bez tarczy. Szkic C ma tarczę, widać ją, gdy ręka idzie do tyłu.
4. **Ikony umiejętności ewolucji:**
    - Kwadratowe tła schodzą, jak przy umiejętnościach klas (zob. „Ewolucje: portrety”, punkt 9): Riposta, Przebijający strzał (autor: „pierwsze usuń tylko tło”), Burza strzał, Chmura burzowa, Wybuch ognia, Promień żywiołów, Lustro many i Znak śmierci. Zamieć zostaje w kwadracie, bo jej wir wypełnia cały obrazek.
    - Młyn: szary wir za mieczem jest teraz ciemnobrązowy, a stalowe ostrze ma czarny obrys z obu stron.
    - Strzał z ukrycia: nowy szkic, łucznik w kapturze ukryty w krzaku i strzały wylatujące z niego. Krzak był ucięty prosto przy prawej krawędzi, więc dostał zaokrąglony bok z obrysem.
    - Grot z zadziorem: zdjęta czerwona kreska za obrysem grotu, z prawej strony. Kropla krwi pod grotem zostaje.
    - Cud: zdjęty ciemny kształt obok pióra.
    - Czarny jad: więcej jadu, czyli nowe strugi, kropla i ciemnozielony połysk.
    - Taniec ostrzy: 3 nowe szkice, dwa sztylety wirujące w fioletowych smugach. Na próbę w grze stoi szkic A.
    - Pozostałe ikony z „Tak” są w grze bez zmian. Ikony są na ekranie Umiejętności i w podglądzie autora.
5. **Żywiołak i Trujący Szlam w walce.** Przywołany stwór stoi w lewym górnym rogu karty przywołującego, przed jego popiersiem, od przywołania aż do upadku albo odejścia. Jego HP zostaje w wierszu stanu karty. Obrazki to szkice z Retro Diffusion na wzór ikon umiejętności, przycięte ciasno wokół postaci. Na próbę w grze stoją Żywiołak B i Szlam A, z 4 szkiców każdego. *Od 30.10 przywołaniec stoi we własnej karcie: zob. „Przywołańce we własnej karcie”.*
6. **Chody nowych ewolucji (43–52), na próbę.** Autor jeszcze ich nie wybrał, więc w grze stoją wersje najbliższe portretom, a przy ocenie można wybrać inną literę:
    - Łowca A i Łowczyni A; Elementalista A; Arkanista A i Arkanistka A; Uzdrowiciel A i Uzdrowicielka B; Inkwizytor A i Inkwizytorka A; Truciciel A i Trucicielka B; Nocny Tancerz A i Nocna Tancerka A; Barbarzyńca A i Barbarzynka A; Gladiator A i Gladiatorka A; Strzelec Burzy A i Strzelczyni Burzy C.
    - Poprawki ręczne: Elementalista traci kostur w klatkach 1 i 4, bo w klatkach 2 i 3 go nie miał (tak jak tarcza Kapłana, punkt 3); Gladiator traci miecz w klatce 2 z tego samego powodu; Barbarzynka dostaje topór także w klatce 3, przeniesiony z klatki 2; Arkanistka stoi 3–4 piksele wyżej, na linii stóp pozostałych postaci; jaskrawe różowe i purpurowe piksele u Łowcy, Łowczyni, Barbarzyńcy i Truciciela mają teraz brązy łuku i skóry albo kolor sąsiednich pikseli.
7. **Koszt:** chody 0,56 USD, ikony 1,08 USD (Taniec ostrzy powtórzony po błędzie serwera Retro Diffusion), stwory 1,44 USD. Zostało 48,10 USD.

## Ewolucje: portrety (29.10.2026, na wersji testowej)

Autor: „Kolejna rzecz to portrety dla wyewoluowanych klas, bez tego nie wdrażamy ewolucji też.”, „nie giftcode i wszystko zaczekaja”, „0.0.58 to bedzie duzy update po prostu”. Kod podarunkowy, Encyklopedia i ewolucje czekały więc na portrety, by wejść do gry razem, jako 0.0.58. Później plan się zmienia: 0.0.58 wchodzi do gry bez ewolucji (zob. „Wersja 0.0.58 bez ewolucji klas”).

1. **Dawne portrety dla pięciu ewolucji.** Autor: „części może można użyć nawet zastanow sie czy mozna przyporządkować”. Dawne, bogatsze portrety klas (`art/evolution/portraits/`, zob. „Skromne portrety na start”, punkt 2) dostały ewolucje, do których pasują strojem i umiejętnościami: Strażnik (Wojownik), Snajper (Łucznik), Władca Lodu (Mag), Kapłan (Kleryk) i Skrytobójca (Cień). Autor zatwierdził wszystkie pięć, w trzech męskich wersjach z poprawkami: „1 tak 2 Snajper męski ma ucięty kaptur do ręcznej poprawy 3 tak 4 Kapłan męski ma ucięte wlosy 5 Skrytobójca męski ma od razu odcień skóry szary”.
2. **Poprawki** (autor: „2 4 i 5 tak”):
    - Snajper: dorysowany czubek kaptura. Obrazek był ucięty także na dole, więc dorysowane są też podeszwy butów i oba końce łuku.
    - Kapłan: dorysowany czubek głowy w kolorach reszty włosów.
    - Skrytobójca: szara skóra między kapturem a maską ma teraz jasny odcień, jak na portretach startowych. Oczy i obrys zostały.
3. **Wspólna wielkość.** Wszystkie portrety ewolucji mają postać wysokości 118 px, ze stopami na tej samej linii co postacie startowe. Przy zmniejszaniu bez wygładzania wypadał rząd pikseli z oczami Snajpera, więc skalowanie wybiera przesunięcie, które zostawia najwięcej szczegółów twarzy. Popiersie w walce centruje się na środku skóry twarzy, bo łuki i kostury przy głowie przesuwały środek postaci.
4. **Gdzie widać portret ewolucji.** Na ekranie Postaci, w popiersiu w odtwarzaniu walki i w profilu gracza (z czatu, rankingu i Znajomych). Ewolucja, która nie ma jeszcze portretu, pokazuje portret klasy (brakujący szczegół). Chód na ekranie Walka: punkt 8.
5. **Kolory skóry.** Autor: „Pamietaj jeszcze o tych odcieniach skóry do zrobienia później ręcznie maskami i przerysowaniem”. Portrety ewolucji mają na razie tylko jasną skórę, w której są narysowane. Postać z innym kolorem skóry widzi do tego czasu portret ewolucji w jasnym odcieniu.
6. **Pozostałe 10 ewolucji** dostają nowe portrety z Retro Diffusion (`evolutions` w `art/prompts.json`): po 2 wersje każdego wyglądu, w ramce portretów startowych, z włosami postaci startowej i bronią poniżej czubka głowy, żeby postacie skalowały się jak reszta. Szkice kosztowały 7,20 USD.
7. **Wybór autora** (pozycje 6–15): „6. obydwa B 7. obydwa A 8. obydwa B 9. obydwa B 10. facet B, kobieta do przerobienia ani A ani B 11. obydwa B 12. facet B, kobieta A 13. obydwa A, ale do poprawy przycięte głowy 14. obydwa A, ale facetowi dorobić nogę, bo ucięło 15. obydwa A”. Wybrane portrety są w grze, z poprawkami:
    - Arkanista i Uzdrowiciel: dorysowany czubek włosów, ucięty przez generator. U Uzdrowiciela także koniec gałązki na kosturze. Łowca: główka sokoła.
    - Inkwizytor: dorysowany czubek głowy. Autor: „Inkwizytor juz widze ma zbyt scieta glowe”, więc głowy obojga są wyższe i okrąglejsze. Trzy (on) i cztery (ona) rzędy włosów wychodzą ponad wspólną linię głów, jak dorysowane włosy w `tools/normalize-portraits.py`. Jego lewy but dostał podeszwę i czubek, a mały przedmiot przy jego nodze zniknął. U niej generator uciął czoło, więc dorysowane są ciemne, zaczesane do tyłu włosy, a nie skóra.
    - Truciciel: dalsza noga kończyła się na kolanie, więc dostała but jak bliższa, o rząd wyżej, bo stoi dalej.
    - Elementalistka rysuje się od nowa (4 wersje), w stroju wybranego Elementalisty. Do czasu wyboru ma portret Maga.
8. **Chody ewolucji na ekranie Walka.** Autor: „bedziesz musial jeszcze wygenerowac te drobne sprite'y z animacja chodu do wypraw (w tle)”. Szkice z Retro Diffusion (`four_angle_walking`, 0,07 USD za szkic) powstały z zatwierdzonych portretów; do gry trafia rząd postaci idącej w prawo. Wybór autora dla pięciu ewolucji z dawnymi portretami: „16. facet C, kobieta A 17. obydwa A 18. facet A, kobieta B po przerobieniu kosturu, źle trzyma i w ogóle 19. facet B, jeśli go dorobić, bo ucięty, kobieta A 20. obydwa A, ale kobiecie dorobić oczy”. Poprawki (do oceny autora):
    - Władczyni Lodu: kostur narysowany od nowa, pionowo w zaciśniętej dłoni, w każdej klatce tak samo, z lodowym kryształem nad głową. W trzeciej klatce dłoń wraca na miejsce z pozostałych klatek.
    - Kapłan: co drugą klatkę z pleców wystawała płaska listwa (tarcza widziana z boku) i plecy wyglądały na ucięte. Listwy nie ma, w każdej klatce widać plecy szaty.
    - Skrytobójczyni: twarz była gołą skórą z plamką nisko. Ma oko pod brwią i ciemną maskę na nos i usta, jak na portrecie.
    - Ewolucja bez własnego chodu idzie chodem klasy, w swoim kolorze skóry (brakujący szczegół). Chody ewolucji, jak ich portrety, mają na razie tylko skórę, w której są narysowane (punkt 5).
    - Dziewięć nowych ewolucji ma już szkice chodów z zatwierdzonych portretów, po 2 na wygląd (do wyboru autora, pozycje 43–52). Dziewięć szkiców Barbarzyńcy, Gladiatora i Strzelca Burzy wróciło jako jedna nieruchoma postać, więc te powstały od nowa. Chód Elementalistki powstanie z jej portretu po wyborze.
9. **Ikony i dźwięki umiejętności ewolucji** (autor: „22 Tak”, do 0.0.58). Ikony 48×48 z Retro Diffusion, po jednej na umiejętność, czekają na ocenę autora (pozycje 28–42); kwadratowe tła usuwa się po wyborze, jak przy umiejętnościach klas. Dźwięki z ElevenLabs, po 2 wersje, są na stronie odsłuchu „Dźwięki Insight”, w grupie „Umiejętności ewolucji”. Koszt: ikony 5,58 USD, chody 3,50 USD, dźwięki ok. 1800 kredytów ElevenLabs. Zostało 51,39 USD i ok. 17 500 kredytów.

## Ewolucje: walka (29.10.2026, na wersji testowej)

Wszystkie 30 umiejętności ewolucji i 15 cech działa w walce (`src/engine/combat.js`), a odtwarzanie walki pokazuje ich skutki. Liczby są robocze, do symulacji balansu (krok D). Brakujące szczegóły, rozstrzygnięte najprościej:

1. **Postawy** (Krwawy szał, Wyzwanie, Chmura burzowa, Sokół, Psalm) budzą się na początku ruchu postaci, obok jej ciosu, i trwają tyle jej ruchów, ile podaje opis. Czas odnowienia liczy się od chwili, gdy się obudzą. Psalm czeka, aż ktoś z drużyny ma mniej niż 80% HP.
2. **Przywołańce** (Żywiołak, Trujący Szlam) nie mają własnej karty w walce. Stoją przed postacią, a jej karta pokazuje ich HP, np. „Żywiołak · 282”. Biorą na siebie ciosy wrogów wymierzone w postać, bez uników, z pancerzem i odpornościami postaci. Działają w ruchu przywołania i w każdym kolejnym ruchu postaci, aż minie ich czas albo padną. *Karta przywołańca jest nieaktualna: od 30.10 przywołaniec ma własną kartę, zob. „Przywołańce we własnej karcie”.*
3. **Wychłodzenie.** Zamieć wychładza trafionych do końca walki, co dopisano do jej opisu. Wychłodzony jest też ten, kto ma na sobie Wychłodzenie od stwora.
4. **Odporności z cech.** „Odporność na mróz rośnie o 15%” (Zimowy oddech) i „odporność na truciznę rośnie o 20%” (Toksyny) to o tyle mniej obrażeń od tego żywiołu, z ciosów i z efektów. Samo mnożenie odporności nic by nie dało postaci bez odporności z przedmiotów. Opoka mnoży pancerz i odporności przez 1,1, a wrogowie biją w Strażnika dwa razy chętniej niż wynika to z jego miejsca.
5. **Namaszczenie** mnoży premie Błogosławieństwa przez 1,25, a ich dzielenie się w drużynie jest o 25% słabsze. **Opiekun** mnoży leczenie przez 1,2, a każde leczenie umiejętnością zdejmuje najstarszy zły efekt.
6. **Cud** płaci manę w chwili omdlenia. Może podnieść także samego Uzdrowiciela, bo ten zwykle walczy sam. Działa przed Kwiatem paproci, więc mikstura zostaje na później.
7. **Zimna krew**: krytyczny jest pierwszy cios, który trafi. **Krok cienia**: premia po uniku działa na najbliższy własny cios, a nie na kontrę ani cięcie Tańca ostrzy.
8. **Strzał z ukrycia** idzie w pierwszym ruchu przed innymi umiejętnościami. **Wyrok** czeka na wroga poniżej 40% HP. **Przebijający strzał** trafia wroga w najbliższym rzędzie za celem. **Znak śmierci** pada na wroga, w którego postać i tak bije.
9. **Naelektryzowane groty** działają na każdy cios poza piorunami Chmury burzowej. **Tropiciel** daje 10% więcej materiałów ze stworów.
10. **Zgodność.** Walki postaci bez ewolucji losują dokładnie to samo co wcześniej, co sprawdzono na 540 walkach, więc ich wyniki się nie zmieniają.
11. **Podgląd autora** (Panel autora, „Podgląd umiejętności”) pokazuje też umiejętności ewolucji: postać na poziomie 60, umiejętność na poziomie 20. Panel działa w grze, więc ten podgląd będzie po wdrożeniu.
12. **Do balansu (krok D).** Riposta Gladiatora działa po uniku, a Wojownik rzadko unika: w próbie wyszedł mniej więcej jeden unik na 80 ruchów. Uzdrowiciel zadaje mało obrażeń. Snajper i Skrytobójca mają bardzo mocny pierwszy cios.
13. **Riposta z unikiem.** Autor zgodził się dodać Ripoście uniki („21 Tak”): do końca walki unik postaci rośnie o 15 pkt proc., ponad zwykły limit uniku, jak w Tańcu ostrzy. W próbie wilk chybia Gladiatora w 16,6% ciosów zamiast w 1,4%. Opis umiejętności i relacja walki podają ten unik.

## Ewolucje: budowa (29.10.2026, na wersji testowej)

Ewolucje według „Ewolucji: odpowiedzi autora” i zatwierdzonej propozycji (cechy, przyrost statystyk, umiejętności). Dane są w `data/evolutions.json`, zasady w `src/engine/evolutions.js`. Liczby to brakujące szczegóły, rozstrzygnięte najprościej, do ustawienia w symulacji.

1. **Wybór.** Na 50. poziomie klasy, gdy obie ścieżki są wybrane, a punkty rozdane, gracz widzi w zakładce Ewolucja (zob. „Uwagi autora: kod podarunkowy i zakładka Ewolucja”) dwie ewolucje swoich ścieżek, główną pierwszą. Każda karta ma przyrost statystyk, cechę i dwie umiejętności z liczbami na 45. poziomie. Wybór jest na stałe i potwierdzony jeszcze raz.
    - Klasa czeka na 50. poziomie, aż gracz wybierze ewolucję, tak jak dziś czeka na drugą ścieżkę i punkty (brakujący szczegół). Zdobyte XP klasy nie przepada.
    - Postać, która przekroczyła już 50. poziom bez ewolucji, wybiera ją w każdej chwili. Przyrost ewolucji liczy się wtedy od 51. poziomu.
2. **Umiejętności i punkty.** Obie dotychczasowe umiejętności znikają, a w ich miejsce wchodzą dwie umiejętności ewolucji na poziomie 0. Wraca 40 Punktów Umiejętności, a poziomy klasy 50–99 dają po jednym, razem 90 na dwie umiejętności po 45 poziomów.
    - Umiejętność ewolucji na poziomie 20 jest co najmniej tak silna jak stara na 20 i ma swój nowy skutek.
    - Na 100. poziomie klasa czeka, dopóki zostają punkty (E8).
3. **Statystyki.** Od 51. poziomu klasy statystyki rosną według ewolucji, a nie klasy. HP i mana na poziom klasy zostają jak w klasie, a Arkanista dostaje 4 many zamiast 3 (brakujący szczegół).
4. **Nazwa.** Górny pasek pokazuje trzy pierwsze litery ewolucji, np. „BAR”, ranking jej pełną nazwę, a karta postaci dopisek „z klasy: Wojownik”. Czat zostaje przy znaku klasy.
5. **Ceremonia.** Po wyborze otwiera się karta Systemu z nazwą ewolucji i cechą, a gra muzyka autora „Ewolucja klasy” (`evolution-v1`). Zdanie karty jest od autora: „Twoja nowa klasa to: Barbarzyńca. Rozdaj Punkty Umiejętności na nowe zdolności.” (autor: „Zamiast "Twoja klasa staje się:" to "Twoja nowa klasa to:"”, a potem: „albo "Rozdaj Punkty Umiejętności na nowe zdolności" lepiej”). Po zamknięciu karty wraca muzyka zakładki. Na razie ceremonia jest bez głosu narratora (brakujący szczegół): kwestie można dodać po zatwierdzeniu tekstów.
6. **Testuj ewolucję** (wersja testowa, przycisk w Ustawieniach, obok „Testuj samouczki”). Daje każdą z trzech ewolucji klasy na dowolnym poziomie klasy. „Cofnij ewolucję” przywraca umiejętności sprzed testu.
7. **Teksty i grafiki.** Zdania fabularne pod nazwami umiejętności ewolucji są robocze, do oceny autora. Do czasu nowych ikon rozwinięta umiejętność ma ikonę tej, z której wyrasta, a nowa pierwszą literę. Portrety ewolucji przyjdą osobno.
8. **Walka.** Skutki umiejętności i cech działają w walce, zob. „Ewolucje: walka”.

## Encyklopedia (29.10.2026, w grze od 0.0.57)

To plan autora z „Uwag autora po 0.0.55”, punkty 5–7. Liczby i szczegóły to brakujące szczegóły, rozstrzygnięte najprościej.

1. **Wejście.** Ikona Encyklopedii (zatwierdzona grafika) stoi w górnym pasku w miejscu sakwy, obok bieżącego zajęcia. Złota kropka świeci, gdy czeka skrzynia Encyklopedii albo Bestiariusza. Części do rzemiosła są na Postaci, w zakładce „Części” plecaka, więc lista pod sakwą zniknęła.
2. **Zakładki.** Bestiariusz, Przedmioty, Mikstury, Zioła, Materiały i Części (`data/encyclopedia.json`).
3. **Odkrycia.** Odkryta jest każda rzecz, którą postać kiedykolwiek miała: przedmiot (w plecaku albo założony), mikstura, zioło, materiał (każdy stopień osobno) i część.
    - Serwer zapisuje je przy każdym żądaniu (`characters.discovered`), więc zostają po sprzedaży albo zużyciu.
    - Przedmiot pamięta najrzadszy zdobyty egzemplarz.
    - Liczy się od tej wersji: rzecz sprzedaną wcześniej trzeba zdobyć jeszcze raz.
4. **Tiery.** Przedmioty dzielą się według poziomu klasy, od którego się je zakłada: Tier I od początku, II od 10., III od 25., IV od 50.
    - Mikstury i zioła dzielą się według poziomu profesji, a materiały według najwyższego poziomu swojego stwora: I do 25, II do 50, III do 75, IV do 100.
    - Części leżą w jednym rzędzie według rzadkości.
5. **Wskazówki.** Każdy wpis, także nieodkryty, mówi, skąd go wziąć:
    - przedmiot: od którego regionu wypada, dla jakich klas, od którego poziomu klasy się go zakłada i od którego poziomu Rzemieślnictwa Warsztat zna jego wzór;
    - mikstura: od którego poziomu Alchemii jest przepis, a po odkryciu też składniki i katalizator;
    - zioło: od którego poziomu Zielarstwa się je zbiera i czy daje je zdarzenie;
    - materiał: który stwór go zostawia i gdzie żyje (nieznany stwór jako „???”), zdobyte stopnie i trofeum;
    - część: Stół rozbiórki, wymiana w Warsztacie i od którego poziomu Skupu złomu sprzedaje ją Lada złomiarza.

    Nieodkryty wpis to cień z nazwą „???”, jak w Bestiariuszu.
6. **Zestawy przedmiotów.** W każdym tierze jest zestaw każdej klasy (jej bronie, druga ręka i zbroje) i zestaw „Dodatki” dla wszystkich (rękawice, buty, amulet, pierścień, talizman), razem 24 zestawy. Pełny zestaw otwiera skrzynię swojego tieru.
7. **Progi odkryć.** Mikstury, zioła, materiały i części mają skrzynie za liczbę odkryć:
    - mikstury: 4, 8, 12 i 16;
    - zioła: 3, 6, 9 i 13;
    - materiały (gatunki): 10, 25, 50 i 88;
    - części: 3, 5 i 7.

    Kolejne progi dają kolejne skrzynie.
8. **Skrzynie.** Jak w Bestiariuszu, skrzynia otwiera się raz.
    - Tier I daje 50 złota, 5 Punktów Czasu i 2 Punkty Systemu, II 150, 10 i 4, III 400, 20 i 8, a IV 1000, 40 i 16.
    - Punkty Systemu są jak w Bestiariuszu, ale mniejsze. Autor: „Skrzynie Encyklopedii mają dawać Punkty Systemu tak jak w Bestiariuszu i zostawmy te 20.” Potem: „Jednak to bedzie za dużo za tier 1 musi być mniej”, „i za duzo tych Punktów by było” i „Wyskaluj dobrze te Punkty Systemu za Encyklopedie, ale dodaj je”.
    - Skala to brakujący szczegół, rozstrzygnięty najprościej: Punkty Systemu rosną jak Punkty Czasu, dwa razy z każdym tierem, od 2 do 16. Progi odkryć biorą skrzynie kolejnych tierów, więc kolejne progi dają 2, 4, 8 i 16.
    - Razem 39 skrzyń daje 284 Punkty Systemu: Tier I 20, II 40, III 80 i IV 144. Bestiariusz daje 500 (20 za region wewnętrzny, 25 za krainę).
    - Skrzynie otwarte wcześniej na wersji testowej nie dostają Punktów Systemu wstecz. W grze Encyklopedia od początku daje je w skrzyniach.
    - Skrzynia zestawu, do którego dojdą później nowe przedmioty, zostaje otwarta.
9. **Trofea** (zastosowanie materiałów 7). Materiał zdobyty w stopniu swojego gatunku i w dwóch wyższych to trofeum: ciosy przeciw jego stworowi zadają o 5% więcej (`trophy` w `data/encyclopedia.json`).
    - Wymóg wszystkich stopni byłby dla wielu gatunków nieosiągalny. Stopień o 4 wyżej od gatunku wypada raz na kilka tysięcy sztuk, a o 5 wyżej raz na 40 000. Stopień o 2 wyżej wypada raz na 40–200 sztuk.
    - Bonus działa na ciosy, bez obrażeń rozłożonych w czasie.
    - Wyprawa bierze trofea swoich stworów przy starcie, więc raport wychodzi zawsze taki sam.
    - Trofea zostają. Autor: „Trofeum zostaw, choć nie widzę zastosowania w dłuższym terminie (chociaż w sumie te potwory na wyższych lvlach bedziemy mogli wrzucić w Lochach pozniej to może jednak!”. Stwory z niższych krain na wyższych poziomach w Lochach to pomysł na później.
10. **Bestiariusz** w Encyklopedii pokazuje każdą krainę i jej regiony wewnętrzne z tymi samymi listami i skrzyniami co w Walce. Skrzynie otwierają się w obu miejscach.
11. **API.** `GET /api/encyclopedia` daje zakładki z wpisami i skrzyniami, a `POST /api/encyclopedia/chest` z `{ id }` otwiera skrzynię. Widok postaci ma `encyclopedia.ready`, liczbę skrzyń gotowych do otwarcia.

## Materiały: Skup złomu, Wymiana, katalizatory i Kowadło od +5 (29.10.2026, w grze od 0.0.57)

To cztery pierwsze z zastosowań materiałów wybranych przez autora („Uwagi autora po 0.0.55”, punkt 7). Liczby i szczegóły to brakujące szczegóły, rozstrzygnięte najprościej.

1. **Skup złomu kupuje materiały.** Karta materiału w zakładce „Materiały” plecaka ma wybór liczby sztuk (−, +, „wszystkie”) i przycisk „Sprzedaj za N złota”.
    - Sztuka kosztuje 2 złota razy mnożnik rzadkości, ten sam co przy przedmiotach (`sell` w `data/rarities.json`). Pospolita kosztuje 2 złota, rzadka 4, unikalna 8, epicka 16, legendarna 32, mityczna 64, a boska 128 (`crafting.sellGold` w `data/balance.json`).
    - Każdy poziom Skupu złomu dodaje 10% do ceny, jak przy przedmiotach.
    - Sprzedaż działa też w trakcie wyprawy, jak Stół rozbiórki.
    - Sprzedaje `POST /api/materials/sell` z `{ key, count }`.
2. **Materiały w Wymianie.** Oferta ma sekcję „Materiały” z polem na każdy stos, jak zioła i mikstury. Materiały każdego stopnia przechodzą razem z resztą oferty i nie zajmują miejsca w plecaku.
3. **Katalizatory w Alchemii.** Siedem przepisów bierze 1 sztukę materiału stwora na miksturę (`catalyst` w `data/professions.json`):
    - Odtrutka: Łuska żmii;
    - Zwykła mikstura szybkości: Żądło szerszenia;
    - Wywar kamiennej skóry: Róg jelonka;
    - Wywar siły: Kieł dzika;
    - Mikstura skupienia: Pióro puszczyka;
    - Olejek z tojadu: Pajęcze wylinki;
    - Eliksir jemiołowy: Pył chochlika.

    Bez katalizatora zostają mikstury leczenia i many, Mniejsza mikstura szybkości (początek Alchemii) i Duża mikstura szybkości, która ma już rzadszy składnik, Żurawinę. Bez katalizatora jest też Napar z kwiatu paproci, który ma Kwiat paproci.
    - Stopień katalizatora wybiera się z listy pod przepisem. Domyślnie stoi najpospolitszy, a wybór zostaje zapamiętany.
    - Każdy stopień ponad rzadkość gatunku dodaje 15 punktów procentowych do 5% szansy na dodatkową miksturę (`brewing.catalystStep`). Rzadka łuska żmii daje więc 20%, a unikalna 35%.
    - Katalizator schodzi na początku warzenia, jak zioła. Przerwane warzenie oddaje sztuki na mikstury nieuwarzone.
    - Gdy katalizatora brak, lista przepisów pisze „brak katalizatora”, a formularz: „Brakuje katalizatora: … Zostawiają go pokonane stwory.”
4. **Kowadło od +5.** Od ulepszenia +4 → +5 każde ulepszenie bierze też materiały rzadkości przedmiotu: 1 sztukę na +5 i o jedną więcej na każdym kolejnym poziomie, czyli 6 sztuk na +10 (`upgrades.materialFrom` w `data/balance.json`).
    - Pasuje materiał dowolnego gatunku tej rzadkości. Domyślnie schodzi ze stosu z największą liczbą sztuk, a lista na karcie pozwala wybrać inny.
    - Porażka zabiera materiał, tak samo jak złoto i rudę.
    - Bez materiału przycisk pisze „Brakuje materiału”, a serwer odpowiada 409 `no_material`.
    - Autor: „pamietaj, ze ulepsza sie przedmioty nie tylko na Kowadle, ale i z pozycji samego przedmiotu”. Ekran Kowadła w obozie ma teraz część „Ulepszanie przedmiotów”: listę przedmiotów, założonych i z plecaka. Dotknięcie otwiera kartę przedmiotu z tym samym ulepszeniem co w plecaku, z materiałem od +5. Serwer pilnuje materiału przy każdym ulepszeniu, skądkolwiek przyjdzie.
5. **Sprawdzanie.** Walidator danych sprawdza, czy każdy katalizator to istniejący materiał. Testy obejmują sprzedaż, Wymianę, katalizatory i Kowadło.

## Uwagi autora po 0.0.55 (29.10.2026, w grze od 0.0.56)

1. **Wdrożenia na komendę autora.** Autor: „Od kolejnej rundy wdrożenia (poza awaryjnymi, które podpiszę) robimy rzadziej na moją komendę. Możesz sugerować wdrożenie, ale sam go nie bedziesz wykonywał.”
    - Zmiany trafiają na wersję testową (push na gałąź roboczą), jak dotąd. Do gry (push do `main`) wchodzą tylko na komendę autora albo jako wdrożenie awaryjne podpisane przez autora. Raport na koniec etapu mówi, czy wdrożenie jest zalecane.
    - Numer wersji rośnie tylko przy wdrożeniu do gry (brakujący szczegół). Do tego czasu wersja testowa pokazuje ostatni numer z gry i nowy skrót commita, np. „0.0.55 (abc1234)”.
    - `CLAUDE.md` przypomina o tym kolejnym sesjom.
2. **Niebieski grzyb zatwierdzony.** Autor: „grzyb tak” i „"Przy ścieżce rośnie grzyb, którego nie znasz." Lekka poprawka do opisu”.
    - Zdarzenie nie jest już szkicem. Przychodzi w każdym regionie wewnętrznym, w grze od najbliższego wdrożenia. Zasady są jak w „Uwagach autora po 0.0.52”, punkt 1.
    - Opis zaczyna się od zdania autora („którego” zamiast „jakiego”), a dalej jest bez zmian.
3. **Błyskawiczne polowanie.** Autor: „Zmieńmy Szybkie Polowania / 3 razy po 15 minut jest ale dodajmy jeszcze opcje 3 razy po 10 minut (Błyskawiczne polowanie) resetowane co 12h po zużyciu jako drugi przycisk”.
    - Pod Szybkim Polowaniem w Walce jest drugi przycisk, „Błyskawiczne polowanie”: wyprawa jak na 10 minut, z raportem od razu, jak Szybkie Polowanie. Opcje wyprawy, tropienie i mikstury (przycięte do 10 minut) działają tak samo, od 5. poziomu.
    - Są trzy. Po zużyciu trzeciego wszystkie wracają 12 godzin po nim, a wcześniej żadne nie wraca (`flashHunt` w `data/balance.json`). Przycisk podaje „Zostało: N z 3”, a po zużyciu dzień i godzinę powrotu.
    - Szybkie Polowania (3 na dzień, liczone od północy w Warszawie) są od nich niezależne.
    - Raport ma tytuł „Błyskawiczne polowanie”. Serwer zapisuje zużycie w `characters.quick_hunts` obok Szybkich Polowań, więc migracja nie była potrzebna. `POST /api/hunts/quick` z `kind: 'flash'` startuje Błyskawiczne, a bez wolnego odpowiada 409 `no_flash_hunts`.
4. **Moneta złota i klepsydra Punktów Czasu.** Autor: „Wygenerujmy też ikonkę dla złota (złota moneta oraz Punktów Czasu -> klepsydra) i wrzucajmy wszedzie gdzie trzeba / tylko Punkty Systemu będą w takiej wyróżniającej formie jak do tej pory” i po szkicach: „zloto i punkty Czasu sa okey, ale złotą monetę musisz tak dostosowac by była wielkościowo i pozycją zbliżona do Punktów Systemu - lub odwrotnie”.
    - Obie grafiki to rodzaj `icons`, 32 × 32. Monecie dorysowano środek, który zniknął przy usuwaniu tła, a klepsydra ma bursztynowy piasek w kolorze Punktów Czasu.
    - W górnym pasku moneta i znak Punktów Systemu mają po 20 px (wcześniej po 16 px) i stoją jeden nad drugim w jednej kolumnie, więc obie liczby zaczynają się w tym samym miejscu.
    - W portfelu wszystkie znaki mają 24 px: moneta, znak Punktów Systemu, klepsydra i zasoby. Nazwy stoją w jednej kolumnie.
    - Moneta stoi też w kosztach i magazynach obozu, w nagrodach zadań, w Wymianie i przy cenie Awatara Systemu, a klepsydra na przycisku „Przewiń”. Kreskowa klepsydra zostaje tam, gdzie znaczy tylko czas: przy budowie, w kolejce i w „Czasie budowy”.
    - Punkty Systemu zachowują kreskowy znak w kolorze Systemu.
5. **Ikona Encyklopedii zatwierdzona.** Autor: „Encyklopedia wygląda dobrze.” Grafika czeka w `src/client/art/icons/encyclopedia.png`. Wejdzie do górnego paska z Encyklopedią, w miejsce sakwy (autor: „mysle ze sakiewke z czesciami do rzemiosła wrzucimy do Postaci gdzies a w jej miejsce ikonke Encyklopedii właśnie która rozwinie cały nowy moduł”).
6. **Encyklopedia: plan autora.** Autor: „Z kolejnych wielkich kroków to zbudowanie Encyklopedii (ale najpierw sprawdzenie i zebranie wszystkich danych o przedmiotach, miksturach, materiałach i zebranie tego) i tam wrzucamy też Bestiariusz (pomimo skrzynek przy wyprawach - do odbioru też z pozycji Encyklopedii)”, „Ma to działać tak jak Bestiariusz - odkrywanie nowych zestawów przedmiotów daje drobny bonus, mikstur itp. jak nie da się zestawami to za konkretne ilości odkryć”, „Konieczny podział na zakładki rzeczy i wszystkiego” i wcześniej: „Encyklopedia niech wskazuje i bedzie posegregowana tierami też”.
    - Najpierw przegląd i zebranie danych o przedmiotach, miksturach i materiałach, potem moduł z zakładkami.
    - Bestiariusz trafi do Encyklopedii. Jego skrzynie da się odebrać i tam, i jak dziś przy wyprawach.
    - Odkrycie zestawu przedmiotów, mikstur itd. da drobny bonus, a gdzie zestawów nie ma, bonus dadzą liczby odkryć.
    - Wpisy będą wskazywać, gdzie zdobyć daną rzecz, i będą ułożone według tierów.
    - Części do rzemiosła z sakwy przejdą do Postaci.
    - Na razie nic z tego nie ma w grze.
7. **Nowe zastosowania materiałów.** Autor: „Nowe zastosowania Materiałów: 1, 2, 3, 4, 5, 6(afiksu i bonusów - zarówno czasem rzadkich jak i zwykłych, zależnie od przedmiotu), 7”. Wybrane są wszystkie propozycje z czatu:
    - Skup złomu kupuje materiały za złoto, a cena rośnie z rzadkością.
    - Materiały w Wymianie między graczami, jak przedmioty, zioła i mikstury.
    - Katalizatory w Alchemii. Wybrane mikstury biorą jeden materiał stwora, np. Łuskę żmii do Odtrutki, a rzadszy materiał daje szansę na dodatkową miksturę.
    - Kowadło od +5. Wyższe ulepszenia biorą też materiał rzadkości przedmiotu.
    - Tablica zleceń w Osadzie. Mieszkańcy zamawiają np. „5 × Skóra wilka” za złoto, reputację albo Punkty Systemu.
    - Zaklinaczka w Osadzie przekuwa afiksy i bonusy przedmiotów. Kosztuje to materiały czasem rzadkie, a czasem zwykłe, zależnie od przedmiotu.
    - Trofea w Encyklopedii. Materiał jednego gatunku zebrany w każdym stopniu daje trofeum z drobnym bonusem przeciw temu gatunkowi.
    - Kolejność (brakujący szczegół): najpierw cztery pierwsze, bo nie czekają na nowe moduły, trofea razem z Encyklopedią, a tablica zleceń i Zaklinaczka razem z Osadą.
8. **Aktywne bonusy na widoku.** Autor (ze zrzutem górnego paska z fiolką „30:00”): „efekt grzyba jest widoczny widze tylko tu, a w wyajtkowych sytuacjach jak się dwa bonusy nałożą albo ktoś miksture wypije to co? powinny byc bonusy przed wyprawą napisane gdzieś i w oknie postaci, najlepiej nad postacią jakie aktualne są obecne, bo tak to lipa”.
    - Lista „Aktywne bonusy” stoi na Postaci nad portretem i w widoku wyprawy nad „Opcjami wyprawy”. Bez bonusów jej nie ma.
    - Każdy bonus ma obrazek mikstury swojego rodzaju, nazwę, działanie i czas, np. „Szybkość: ruchy w walkach +25%” i „jeszcze 30 min wypraw”. W trakcie wyprawy czas odlicza się na żywo.
    - Nazwy mówią o działaniu, nie o miksturze, bo ten sam bonus daje mikstura albo grzyb: Szybkość, Twarda skóra, Siła, Skupienie, Trucizna na broni i Osłona przed magią (wcześniej np. „Mikstura szybkości: …”).
    - Bonusy różnych rodzajów to osobne wiersze. Dwa jednego rodzaju, np. z grzyba i z Mikstury szybkości, to jeden wiersz z silniejszym bonusem i wspólnym czasem, jak w zasadach mikstur („Zioła i mikstury: wybory autora”, punkt 6).
    - Fiolka w górnym pasku zostaje i dalej prowadzi do Postaci.
9. **Opis Łutu szczęścia.** Autor (ze zrzutem formularza Warsztatu): „korekta opisu Łutu szczescia: 5% szans na przedmiot o wyższej rzadkości, 1% szans na przemiot rzadkości wyższej o 2 stopnie. Szanse rosną co 20 poziomów Rzemieślnictwa.” Formularz Warsztatu pisze to słowami autora, z poprawioną literówką („przedmiot”). Liczby to obecne szanse postaci, więc od 20. poziomu Rzemieślnictwa są wyższe.

## Uwagi autora po 0.0.54 (29.10.2026, w grze od 0.0.55)

1. **Materiały wyższej rzadkości ze zwykłych stworów.** Autor: „Niech materiały ze zwykłych stworow też czasem będą wyzszego stopnia rzadkosci - drugiego i o wiele rzadziej - trzeciego / te na niskich lvlach, a pozniej jeszcze wyższe stopnie rzadkości / do tego pewnie przyda sie Osada ale musimy o tym pamiętać”.
    - Każda sztuka materiału losuje swój stopień. O jedną rzadkość wyżej niż gatunek wypada z szansą 0,5% za poziom stwora, ale co najmniej 5% (do 10. poziomu) i najwyżej 25% (od 50. poziomu).
    - Każdy kolejny stopień jest dziesięć razy rzadszy: o dwie rzadkości wyżej 0,5–2,5%.
    - Co 25 poziomów stworów otwiera się następny stopień: trzeci od 26. poziomu, czwarty od 51., piąty od 76. Materiał nigdy nie przekracza ostatniej rzadkości.
    - Wcześniej materiał bywał najwyżej o jedną rzadkość wyżej, z szansą 0,5% za poziom stwora.
    - Rzadszy materiał daje na Stole rozbiórki część swojej rzadkości, a Stół przyjmuje go, gdy jego poziom otwiera tę rzadkość, jak dotąd.
    - Osada i nowe zastosowania materiałów czekają na wybór autora z propozycji w czacie. *Autor wybrał wszystkie: zob. „Uwagi autora po 0.0.55”, punkt 7.*
2. **Powiadomienia przestają przychodzić.** Autor: „Czy nowe wersje wdrażane moga miec wplyw na przychodzenie powiadomień? kuzynka zgłosiła problem, wczesniej ktos inny / zresetowala to ustawienie w iPhonie i grze i pomogło, ale tak za kazdym razem robic?”.
    - Wdrożenia nie zmieniają kluczy powiadomień (są w bazie), zapisanych telefonów ani pliku service workera (bez zmian od 0.0.36).
    - Słaby punkt był gdzie indziej. Gdy usługa powiadomień telefonu (Apple, Google) przestała znać subskrypcję, serwer ją usuwał. Telefon przy każdym starcie odsyłał tę samą martwą subskrypcję, a przełącznik w grze dalej pokazywał „Włączone”. Pomagało dopiero wyłączenie i włączenie powiadomień.
    - Teraz serwer pamięta taką subskrypcję jako porzuconą (`gone_at`, migracja 0050) i nic do niej nie wysyła. Przy następnym wejściu do gry telefon słyszy, że jest martwa, i sam zakłada nową, bez pytania, bo zgoda telefonu dalej jest.
    - Gra pamięta też, że powiadomienia były włączone. Telefon, który sam zgubił subskrypcję, dostaje nową przy starcie gry.
    - Gdy telefon nie da nowej subskrypcji bez dotknięcia, gra raz mówi: „Powiadomienia przestały docierać na ten telefon. Włącz je ponownie w Ustawieniach (zębatka).” Wystarczy wtedy przełącznik w grze, bez ustawień iPhone'a.
    - „Wyślij próbne powiadomienie” przy martwej subskrypcji od razu zakłada nową i wysyła próbę na nią.
    - Service worker przyjmuje też zmianę subskrypcji, gdy przeglądarka wymieni ją sama (`pushsubscriptionchange`).
    - Porzucone subskrypcje znikają z bazy po 30 dniach.

## Uwagi autora po 0.0.53 (29.10.2026, w grze od 0.0.54)

1. **Listy zamiast kafelków w profesjach.** Autor: „Stworz też listy mikstur do warzenia, zioł do zbierania i przedmiotów bo dużo ich się zrobiło i ekrany są długie do przewijania”.
    - Zioła w Zielarstwie, przepisy w Alchemii i wzory w Warsztacie to rozwijane listy, jak „Opcje wyprawy”. Zwinięta lista pokazuje tylko wybór: grafikę, nazwę i krótką linię (w plecaku, dla kogo wzór). „Zmień” rozwija wiersze ze wszystkimi znanymi pozycjami.
    - Wybór jednej pozycji zwija listę. Zioła, gdy wolno zbierać kilka rodzajów naraz, zaznacza się po kolei, a listę zwija „Gotowe” albo jej przycisk.
    - Pozycje ukryte przez System to już nie osobne kafelki z „???”. Zamiast tego jest jeden wiersz na poziom, który je odsłoni: czarne sylwetki i zdanie Systemu, np. „Ukryte przez System do 10. poziomu Rzemieślnictwa.”
    - Przy przepisie bez ziół na choć jedną miksturę lista dopisuje „brak ziół” (brakujący szczegół).
    - Ekrany na telefonie są krótsze: Zielarstwo z ok. 1600 do 1060 px, Alchemia z ok. 1970 do 1070 px, a Warsztat z ok. 2750 do 1800 px.
2. **Ikonki zasobów przy obozie.** Autor: „Nie zmieniłes chyba ikonek do zbierania zasobów przy obozie”. Dymki „Zbierz” nad Tartakiem, Kamieniołomem i Kopalnią miały już nowe grafiki, ale w 14 px, gdzie wyglądały jak dawne ikonki. Grafika zasobu ma teraz zawsze co najmniej 24 px: w dymkach, magazynach, wymianie, kosztach budowy i ulepszeń oraz w portfelu. Kreskowe ikonki złota i punktów zostają w swoim rozmiarze, a w portfelu stoją w tej samej kolumnie co grafiki. *Złoto i Punkty Czasu mają teraz grafiki: zob. „Uwagi autora po 0.0.55”, punkt 4.*
3. **Ikona Encyklopedii.** Autor: „Encyklopedii ikonkę w ten róg wygeneruj w RetroDiffusion a nie rysuj jak coś”. Jest jeden szkic (rodzaj grafik `icons`, 32 × 32): skórzana księga z niebieskim kamieniem Systemu. Czeka na ocenę autora. Do gry wejdzie razem z Encyklopedią, w rogu górnego paska zamiast sakwy, której części są już w plecaku. *Zatwierdzona: zob. „Uwagi autora po 0.0.55”, punkt 5.*

## Uwagi autora po 0.0.52 (29.10.2026, w grze od 0.0.53)

1. **Niebieski grzyb, zdarzenie ogólne (szkic na wersji testowej).** Autor: „Kolejna rzecz - jedno zdarzenie ogólne, mocno losowe, możliwe w każdej lokacji. Nie wiem co można wymyślic, ale musza tam byc albo zewnętrzne stwory tylko albo najlepiej ich brak” i „Co do tego zdarzenia to może natrafienie na nieznanego niebieskiego grzyba i decyzja o tym co z nim zrobić i losowo - utrata przytomności i części złota albo wzmocnienie na 30 minut jakieś albo zdobycie 1 Wolnego Punktu Statystyk”, „Tu byłoby używane tło danej krainy”.
    - Zdarzenie przychodzi po wyprawie w każdym regionie wewnętrznym i na każdym poziomie, bez stworów. Tłem jest obraz krainy, w której była wyprawa (`scene` „land”).
    - Opcje: „Zjedz grzyba” i „Zostaw go”. Zjedzenie losuje: omdlenie (waga 40), wzmocnienie na 30 minut wypraw (40, po 10 na każde z czterech) albo Wolny Punkt Statystyk (20).
    - Omdlenie zabiera 30% złota z tej wyprawy (`goldLoss`), co najmniej 1, jeśli było jakieś złoto. Tekst dopisuje wtedy „Sakiewka jest wyraźnie lżejsza (−N złota).”
    - Wzmocnienia działają jak mikstury na czas: lekkość (ruchy w walkach +25%), twarda skóra (pancerz +15%), siła (obrażenia +10%) albo jasność umysłu (Intelekt i Mądrość +10%), każde przez 30 minut wypraw. Dodają się do wypitych mikstur jak kolejna mikstura tego rodzaju.
    - Wolny Punkt Statystyk zapisuje się osobno (`bonus_points`, migracja 0049) i liczy się do punktów z poziomów. Gra pokazuje go jak inne wolne punkty.
    - To szkic: przychodzi tylko na wersji testowej i da się go wybrać w „Testuj zdarzenia”, także z konkretnym skutkiem. Do gry wejdzie po zatwierdzeniu przez autora razem z grafiką grzyba (jeden szkic Retro Diffusion). *Zatwierdzony: zob. „Uwagi autora po 0.0.55”, punkt 2.*
2. **Plecak: trzy zakładki.** Autor (ze zrzutem ekranu plecaka): „Podzielić na 3: Przedmioty, Materiały, Części”. Plecak ma zakładki „Przedmioty”, „Materiały” i „Części”, a przy dwóch ostatnich liczbę sztuk. Części, jak materiały, nie zajmują miejsca w plecaku. Stuknięta część pokazuje opis, liczbę sztuk i przycisk „Do Warsztatu”. Sakwa w górnym pasku zostaje bez zmian.

## Uwagi autora po 0.0.51 (29.10.2026, w grze od 0.0.52)

1. **Ikonki zasobów.** Autor: „Wygenerujmy może też normalne ikonki zasobów” i o szkicach: „1 tak / 2 tak tylko usuń ziemie spod kamieni / 3 przemaluj ten brązowy kolor na pasujący pod żelazo”.
    - Drewno weszło bez zmian. Kamień nie ma już brązowej plamy ziemi i ma domknięty ciemny kontur. Ruda żelaza ma żyły przemalowane z rdzawego brązu na zimną stal, a białe błyski kruszcu zostały.
    - Ikonki stoją wszędzie, gdzie były kreskowe: w portfelu, w zasobach i kosztach obozu, w Magazynach, u Ducha ognia, przy wymianie na Stole rozbiórki, w kosztach Kowadła i w nagrodach zadań. Złoto zostaje monetą. *Moneta ma teraz grafikę: zob. „Uwagi autora po 0.0.55”, punkt 4.*
2. **Ikonki mikstur.** Autor: „Dorób kontury dużych mikstur reszta super”. Trzy Duże mikstury mają domknięty ciemny kontur (dół i boki kolby oraz sznurek). Olejek z tojadu, Eliksir jemiołowy, Napar z kwiatu paproci i drugi szkic Jemioły weszły bez zmian.
3. **Opcje wyprawy: wszystko w jednym miejscu, jako zakładka.** Autor: „Skoro tworzysz "Opcje wyprawy" to wrzuć tam wszystko wlącznie z zabieranymi miksturami i w ogóle, bo to ładniej będzie” i „Opcje wyprawy niech staną się rozwijaną zakładką”.
    - „Opcje wyprawy” to jedna zakładka nad zagrożeniem i „Wyrusz”: czas wyprawy, mikstury na wyprawę i cztery pola, z cienką linią między nimi.
    - Zakładka jest na początku zwinięta. Na pasku widać czas wyprawy, liczbę wziętych mikstur i liczbę zaznaczonych pól, np. „15 min · 2 mikstury · 1 opcja”. Telefon pamięta, czy zakładka była rozwinięta.
    - Pierwsza wyprawa z narratorem ma tylko czas wyprawy, bez zakładki, bo narrator pokazuje suwak.
4. **Łut szczęścia w Warsztacie.** Autor: „Niech wytwarzanie teoretycznie przedmiotu danej rzadkości ma szansę wytworzenia przedmiotu wyzszej rzadkości w zależności totalnie od łutu szczęścia. 5% na poziom rzadkości wyższej niż oczekiwana, 1% na dwa poziomy wyżej. Rośnie wraz z levelem Profesji co 20 lvli o 1% obydwa wskaźniki”.
    - Każdy udany przedmiot losuje raz: 5% szans na rzadkość o jedną wyżej i 1% na dwie wyżej. Od 20. poziomu Rzemieślnictwa 6% i 2%, od 40. 7% i 3%, aż do 10% i 6% na 100. poziomie (`luck` w `data/professions.json`).
    - Nigdy wyżej niż boski. Części i czas są takie, jak dla zamówionej rzadkości.
    - Raport pisze „Łut szczęścia! Przedmiot wyższej rzadkości: Topór (rzadki).”, a formularz Warsztatu podaje obecne szanse.
5. **Kwiat paproci bez Licha wszędzie.** Autor: „Zdarzenie Kwiat Paproci bez Licha (w drugiej wersji jakby) powinno moc sie tez wyswietlac wszędzie”, „Ale Kwiat Paproci rzadko mozna zdobyć”, „ale nie na startowych lvlach” i na pytanie o poziom: „Od 26. poziomu, jak zdarzenie”.
    - Druga wersja (`fern-flower-calm`) przychodzi we wszystkich regionach wewnętrznych od 26. poziomu, poza czterema miejscami, w których żyje Licho i przychodzi pełna wersja. Dziś to Pajęczy Parów oraz całe Zarośnięte Rozlewiska i Torfowe Mszary. W Wiatrołomach jej nie ma.
    - Licha w niej nie ma. Zerwany kwiat zostawia przedmiot (rzadki, unikatowy albo epicki), a Kwiat paproci tylko raz na 10 razy (w pełnej wersji raz na 4).
    - Tekst jest jak w pełnej wersji, bez głazu i bez ruchu między kamieniami: „Wśród paproci żarzy się czerwone światło. To kwiat paproci, o którym opowiadają w każdej wsi: kto go zerwie, temu szczęście już nie odstąpi.”
    - W „Testuj zdarzenia” ta wersja nazywa się „Kwiat paproci bez Licha”.

## Uwagi autora po 0.0.50 (29.10.2026, w grze od 0.0.51)

1. **Stół rozbiórki.** Autor (ze zrzutami ekranu): „Podstawowa funkcja stołu do rozbiórki powinna być wyżej, tak jak zaznaczone”. Materiały, kolejka i części stoją teraz zaraz pod kartą ulepszenia, nad obrazkiem stołu, opisem i wymianą zasobów. Weszło już w 0.0.50.
2. **Czas w Warsztacie.** Autor: „Rzemieślnictwo też zajmuje za dużo czasu na pospolite przedmioty (powinno okolo 30 minut na przedmiot pospolity zamiast 1h na 1 lvlu Profesji)”. Pospolity przedmiot trwa 30 minut na 1. poziomie (`itemMinutes` 30 zamiast 60). Zasada „każda rzadkość wyżej dwa razy dłużej” zostaje, więc wszystkie rzadkości są dwa razy krótsze: rzadki 1 godzinę, unikatowy 2 godziny i dalej. Poziomy nadal skracają czas o 1% na poziom, najwyżej o połowę (pospolity od 51. poziomu 15 minut).
3. **Wymiana części jako zakładka.** Autor: „Wymiana części w Rzemieślnictwie powinna być na górze jako zakładka a nie że trzeba przewijać na sam dół”. Pod pracą w toku ekran Rzemieślnictwa ma dwie zakładki: „Warsztat” (miejsce, poziom, wzory i Zwój ochronny) i „Wymiana części”.
4. **Trop nieznane stwory.** Autor: „Dodajmy też "trop nieznane stwory" pod Wyprawę - do uzupełniania Bestiariusza. Zwiększa szansę napotkania nieznanego stwora o 10%”.
    - Pole „Trop nieznane stwory” stoi pod „Trop przede wszystkim stwory z zadań”. Telefon pamięta wybór, a „Wyrusz ponownie” i Szybkie Polowanie też go biorą.
    - Spotkanie ze stworem, którego postać jeszcze nie spotkała, ma o 10% większą wagę (`unknownTrackBonus` 0,1, liczone jak 50% przy zadaniach). Oba tropienia mogą działać naraz i wtedy mnożą się.
    - Elita i czempion mają własne szanse, więc tropienie ich nie zmienia.
    - Lista nieznanych stworów zapisuje się na początku wyprawy, tak jak stwory z zadań.
    - Gdy wszystkie stwory miejsca są już w Bestiariuszu, pod polem pojawia się zdanie „Wszystkie stwory z tego miejsca są już w Bestiariuszu.”
5. **Opcje wyprawy w jednym miejscu.** Autor (ze zrzutem ekranu): „i takie wszystkie opcje wraz z tropieniem stworów z zadań oraz z bestiariusza powinny być w jednym miejscu -> albo na górze albo na dole, zależnie jak bardziej pasuje, bo są rozrzucone”. Wszystkie cztery pola stoją w sekcji „Opcje wyprawy” na dole, pod miksturami, a nad zagrożeniem i „Wyrusz”: „Unikaj elit i czempionów”, „Trop elity i czempiony”, „Trop przede wszystkim stwory z zadań” i „Trop nieznane stwory”. Dół pasuje bardziej, bo dwa pierwsze pola zmieniają zagrożenie, które jest tuż pod nimi.
6. **Czas jednego przedmiotu.** Autor: „Rzemieślnictwo musi też pokazywac czas wyrobu jednego przedmiotu”. Przy jednym przedmiocie Warsztat pisze „Czas wyrobu jednego przedmiotu: 30 min”, a przy kilku „Czas wyrobu: 1 h 30 min, po 30 min na przedmiot”. Zwój ochronny tak samo: „Czas jednego zwoju” albo „po 1 h na zwój”.
7. **Ikonka na Discord** (autor: „Daj mi do pobrania ikonkę na serwer Discord dla gry”): logo gry z ikony aplikacji, 1024×1024 px, z ciemnym tłem, wysłane w czacie do pobrania. Discord sam przycina ją do koła.

## Zioła i mikstury: wybory autora (29.10.2026, w grze od 0.0.50)

Propozycja: 10 nowych ziół Zielarstwa i 13 nowych mikstur Alchemii, po jednym szkicu Retro Diffusion na każde. Autor ocenia je w czacie, pozycja po pozycji.

1. **Zioła.** Autor: „Zioła: 1/10 - super do Zwykłej mikstury i wszystkie do zwykłej / 2/10 - super / 3/10 - super / 4/10 - super tylko popraw szkic ręcznie / 5/10 - super / 6/10 - super / 7/10 - super, tylko zmniejsz jagody / 8/10 - super / 9/10 - zrób drugi szkic / 10/10 - super”.
    - Szkice Babki lancetowatej, Dziurawca, Tataraku, Piołunu, Kozłka, Tojadu i Kwiatu paproci są w grze bez zmian.
    - Arnika ma szkic poprawiony ręcznie, a Żurawina mniejsze jagody.
    - Jemioła ma drugi szkic, który czeka na ocenę. Do tego czasu w grze nie ma ikony. *Od 0.0.52 drugi szkic jest w grze (autor: „reszta super”).*
    - Poziom Zielarstwa, zbiór na godzinę i cena u złomiarza: Babka lancetowata 8, 4, 5 złota; Dziurawiec 12, 4, 6; Tatarak 16, 3, 7; Arnika 22, 3, 8; Piołun 28, 3, 10; Kozłek 34, 2, 12; Żurawina 40, 2, 14; Tojad 50, 2, 18; Jemioła 65, 1, 24; Kwiat paproci 90, 0,5, 60.
2. **Przepisy.** Babka, Dziurawiec i Arnika idą tylko do Zwykłych mikstur. Duże biorą po 3 Żywokostu, Bylicy albo Pokrzywy i 2 Żurawiny (wybór w czacie: „Tak, Duże bez nich (zalecane)”). Poziom Alchemii, zioła i działanie:
    - Zwykła mikstura leczenia: 10, Żywokost ×2 i Babka ×2, leczy 35% maks. HP;
    - Zwykła mikstura many: 14, Bylica ×2 i Dziurawiec ×2, oddaje 45% maks. many;
    - Odtrutka: 18, Tatarak ×3, zdejmuje Zatrucie;
    - Zwykła mikstura szybkości: 24, Pokrzywa ×2 i Arnika ×1, ruchy w walkach +25%;
    - Wywar kamiennej skóry: 26, Arnika ×3, pancerz +15%;
    - Wywar siły: 32, Piołun ×3, obrażenia +10%;
    - Mikstura skupienia: 36, Kozłek ×3, Intelekt i Mądrość +10%;
    - Duża mikstura leczenia: 45, Żywokost ×3 i Żurawina ×2, leczy 50% maks. HP;
    - Duża mikstura many: 48, Bylica ×3 i Żurawina ×2, oddaje 60% maks. many;
    - Duża mikstura szybkości: 52, Pokrzywa ×3 i Żurawina ×2, ruchy w walkach +35%;
    - Olejek z tojadu: 55, Tojad ×2, 50% szans na Zatrucie przy ciosie;
    - Eliksir jemiołowy: 65, Jemioła ×3, obrażenia od magii −20%;
    - Napar z kwiatu paproci: 90, Kwiat paproci ×1 i Żywokost ×5, raz na wyprawę chroni przed omdleniem.
3. **Mikstura skupienia.** Autor: „skupienia zmień działanie na wzrost statystyki Intelektu i Mądrości na jakis czas o ileś”. Liczby to brakujący szczegół: +10% Intelektu i Mądrości na 30 minut wypraw, jak u innych mikstur na czas. Mądrość daje więcej many, mocniejsze leczenie i odpoczynek po walce, a Intelekt mocniejsze ciosy broni, która od niego zależy.
4. **Olejek z tojadu.** Autor: „Olejek z Tojadu powinien dawać dużą szansę zatrucia a nie zawsze zatruwać wrogów”.
    - Na 30 minut wypraw każdy cios postaci ma 50% szans na Zatrucie: 0,2 siły ciosu przez 3 ruchy. Wola celu może je odeprzeć jak każde Zatrucie.
    - Nakłada się go z plecaka przyciskiem „Nałóż” zamiast „Wypij”.
    - Zatrute ostrze Cienia kładzie na broń w walce własną truciznę w miejsce olejku.
5. **Butelki.** Autor: „Duże mikstury muszą być inne, brzydko wygenerowane tak samo Olejek z tojadu i Eliksir jemiołowy i Napar z kwiatu paproci / […] Reszta super”.
    - Grafiki Zwykłych mikstur leczenia, many i szybkości, Odtrutki, Wywaru kamiennej skóry, Wywaru siły i Mikstury skupienia są w grze.
    - Nowe szkice czekają na ocenę: stożkowa kolba dla trzech Dużych w ich kolorach, wąska fiolka olejku, rombowa flaszka eliksiru i złota flaszka naparu. Do tego czasu te mikstury mają w grze zwykłą ikonę kolby.
6. **Jak działają nowe rodzaje** (brakujące szczegóły, najprostsze rozwiązania):
    - Odtrutka działa sama w walce. Postać pije ją w chwili, gdy dopada ją Zatrucie. Trucizna znika i do końca walki już się jej nie ima.
    - Napar z kwiatu paproci też działa sam. Gdy HP spada do zera, postać zamiast paść wstaje z 30% maks. HP. Wyprawa zabiera najwyżej jeden, więc chroni raz na wyprawę.
    - Eliksir jemiołowy zmniejsza tylko obrażenia od ciosów magicznych.
    - Z kilku mikstur jednego rodzaju postać pije najpierw najsilniejszą, np. Dużą leczenia przed Zwykłą.
    - Mikstury na czas różnych rodzajów działają naraz, każda ze swoim czasem. Pasek u góry pokazuje czas tej, która zostanie najdłużej.
    - Dwie mikstury jednego rodzaju o różnej sile, np. Mniejsza i Duża szybkości, zostawiają silniejszy bonus. Minuty słabszej liczą się tyle, ile są przy nim warte: 30 minut po 35% i 30 minut po 15% dają ok. 43 minut po 35%. Inaczej tania Mniejsza przedłużałaby Dużą za darmo.
7. **Kwiat paproci ze zdarzenia.** Autor: „ale nie na startowych lvlach”. Zdarzenie z kwiatem przychodzi tylko w Uroczysku Kamieni (regiony 26–50). Na pytanie o próg w czacie wybrane jest „Od 26. poziomu, jak zdarzenie”, więc dodatkowego progu nie ma.
    - W przypadku „Kwiat bez stróża” opcja „Zerwij kwiat” zostawia przedmiot (75%) albo Kwiat paproci (25%), który trafia do plecaka.
    - Kwiat zajmuje miejsce w plecaku przed znalezionymi przedmiotami. Gdy miejsca brak, złomiarz odkupuje najsłabszy przedmiot, jak przy pełnym plecaku.
    - W „Testuj zdarzenia” można wybrać oba zakończenia.
8. **Id:** zioła `plantain`, `st-johns-wort`, `calamus`, `arnica`, `wormwood`, `valerian`, `cranberry`, `aconite`, `mistletoe`, `fern-blossom`; mikstury `healing`, `mana`, `antidote`, `speed`, `stoneskin-brew`, `strength-brew`, `focus-draught`, `greater-healing`, `greater-mana`, `greater-speed`, `aconite-oil`, `mistletoe-elixir`, `fern-brew`.

## Ewolucje: odpowiedzi autora (29.10.2026)

Odpowiedzi na pytania E1–E7 z propozycji ewolucji, zadane w czacie. Autor: „Ja nie lubię tych dokumentów […] wolę przedmiot po przedmiocie tutaj decydować i tak samo z ewolucjami klas i wszystkim”, więc dalsze pytania idą w czacie.

1. **Zestaw (E1):** pełny. Ewolucja daje nową nazwę klasy, przyrost statystyk pod ścieżkę, stałą cechę, dwie umiejętności ewolucji i nowy strój.
2. **Bez próby (E2):** gracz wybiera ewolucję i ogląda ceremonię. Próby zostają na ukryte ewolucje od 100. poziomu.
3. **Jedna ścieżka.** Autor przy E3: „umiejętności dotychczasowe muszą się przekształcić w nową. Gracz wybiera jedną ścieżkę ewolucji z dwóch dostępnych dla niego. Reszta znika i już później co ewolucję (poza ukrytymi) jest tylko jedna ścieżka, z dwoma nowymi umiejętnościami”.
    - Na 50. poziomie klasy gracz wybiera ewolucję swojej ścieżki głównej albo pobocznej.
    - Obie dotychczasowe umiejętności zamieniają się w dwie umiejętności tej ewolucji: rozwiniętą umiejętność ścieżki i drugą, nową. Druga ścieżka znika.
    - Kolejne ewolucje (100, 200…) prowadzą tę jedną ścieżkę dalej, każda z dwiema nowymi umiejętnościami.
4. **Punkty przy przemianie (E3).** Autor: „Nowe umiejętności powinny być na tyle silne bazowo by odpowiadały starym na najwyższym stopniu rozwoju. Jeśli uważasz, że to bez sensu to Zwrot punktów”. Wybrany jest zwrot punktów:
    - przy ewolucji wraca 40 Punktów Umiejętności, które gracz od razu rozdaje na dwie nowe umiejętności;
    - nowa umiejętność na 20. poziomie jest co najmniej tak silna jak stara na 20. i ma swoje nowe działanie;
    - punkty z poziomów klasy 50–99 (po 1 za poziom, razem 50) podnoszą obie dalej, do 45. poziomu każda (90 = 45 + 45, nic nie zostaje);
    - silna baza od 1. poziomu wymagałaby darmowego 1. poziomu obu umiejętności, a wtedy 50 punktów nie dzieli się równo. Inaczej druga umiejętność czekałaby na punkt cały poziom klasy, czyli ok. 5 godzin wypraw.
5. **Zmiana ewolucji (E4).** Autor: „U mieszkańca Osady, ale tylko raz darmowo, a później baaaardzo baaaardzo drogo (może nawet za Punkty Systemu, bo to nie pay2win)”. Pierwsza zmiana jest darmowa, a każda następna bardzo droga, w złocie albo w Punktach Systemu. Cenę ustalimy razem z Osadą.
6. **Portrety (E5):** 30 nowych portretów, po dwa na każdą z 15 ewolucji (kobieta i mężczyzna), ok. 16 USD w Retro Diffusion.
7. **Muzyka ceremonii (E6):** utwór autora z Suno. Ceremonia czeka na niego.
8. **Nazwa klasy (E7):** sama nowa nazwa w górnym pasku, na czacie i w rankingu, np. „Barbarzyńca”. Klasa podstawowa zostaje dopiskiem w karcie postaci.
9. **Czekanie (E8):** przed kolejną ewolucją, na 100. poziomie klasy, klasa czeka, aż gracz rozda wszystkie Punkty Umiejętności, tak jak dziś przed 50.
10. **Kolejność (E9):** po przedmiotach, ziołach i miksturach najpierw ewolucje na wersji testowej, z „Testuj ewolucję” w trybie testowym, a potem Osada.
11. **Liczby umiejętności.** Autor przy Barbarzyńcy: „te 25% to na najwyższym poziomie rozwoju umiejętności”. Liczby w opisach umiejętności ewolucji dotyczą ich najwyższego poziomu (45.), a od 1. poziomu rosną do nich równo, jak dziś.
12. **Wojownik:**
    - **Barbarzyńca:** Druzgocący cios (Potężny cios, po którym cel traci najbliższy ruch, z szansą do 25%) i Krwawy szał (przez 3 ruchy +40% obrażeń i leczenie do 15% zadanych, ale postać przyjmuje o 20% więcej);
    - **Gladiator:** Młyn (Szeroki zamach bez chybień, trafieni tracą 10% pancerza do końca walki) i Riposta (po uniku postać oddaje cios za 120%), z dodatkiem autora: cios Riposty powoduje też krwawienie.
    - **Strażnik:** Niezłomny (Nieugięty leczy więcej i odbija 20% przyjętych obrażeń; autor: bez „przez swoje ruchy” w opisie) i Wyzwanie (prowokacja na 3 ruchy i odbicie 30% przyjętych obrażeń).
13. **Łucznik:**
    - **Snajper:** Przebijający strzał (Celny strzał przebija cel i trafia stojącego za nim za połowę) i Strzał z ukrycia (raz na walkę, w pierwszym ruchu, 280% we wroga z największym HP);
    - **Strzelec Burzy:** Burza strzał (Grad strzał z elektrycznością, trafiony ma 15% szans stracić najbliższy ruch) i Chmura burzowa (przez 3 ruchy 40% elektryczności we wszystkich wrogów);
    - **Łowca:** Grot z zadziorem (Przyszpilenie, po którym cel krwawi przez 3 ruchy) i Sokół (przez 4 ruchy sokół dziobie losowy cel za 40%).
14. **Mag:**
    - **Elementalista:** Ognisty wybuch (Kula ognia wybucha i parzy pozostałych wrogów za 30%) i Promień Żywiołów. Autor: „Promień Żywiołów zadający 100% obrażeń w każdego wroga (po równej ilości % każdego dostępnego Elementaliście żywiołu)”, czyli w każdego wroga po jednej trzeciej ze 100% ognia, mrozu i elektryczności;
    - **Władca Lodu:** Zamieć i Lodowa włócznia (220% mrozu w jeden cel, wychłodzony dostaje o 50% więcej). Autor: „Zamieć musi być mocniejsza i zamrażać całkiem, bo na bazowym poziomie już było spowolnienie. Tutaj będzie 20% na zamrożenie”. Zamieć to Mroźny podmuch, po którym każdy trafiony wróg ma 20% szans na zamrożenie i traci najbliższy ruch;
    - **Arkanista:** Lustro many (Osłona many odbija 25% pochłoniętych obrażeń w napastnika) i Przywołanie żywiołaka. Autor: „Dodaj jakąś umiejętność Przywołania żywiołaka, skoro później będzie Druid”. Żywiołak działa jak przywołania z punktu 18 i co ruch uderza losowego wroga za 50% żywiołem, na który ten jest najsłabszy.
15. **Kleryk:**
    - **Uzdrowiciel:** Odnowa i Cud. Autor o Odnowie: „Większe leczenie z Odnowy lub takie samo, ale na wszystkie postaci”. W czacie wybrana jest wersja z obiema zmianami naraz: Modlitwa o zdrowie leczy całą drużynę, a potem każdego przez 3 ruchy po 10% maks. HP. Cud: autor: „Cud -> wskrzeszenie z 50% HP”, czyli raz na walkę omdlała postać wstaje z 50% maks. HP;
    - **Inkwizytor:** Sąd (Egzorcyzm piętnuje trafione duchy, które przez 3 ruchy dostają o 20% więcej obrażeń) i Wyrok (220% sakrum w cel poniżej 40% HP);
    - **Kapłan:** Wielkie błogosławieństwo (Błogosławieństwo daje też +10% szybkości) i Psalm. Autor: „Psalm ale mocniejszy (około 10% na ostatnim lvlu umiejętności)”: przez 3 ruchy drużyna odzyskuje po 10% maks. HP.
16. **Cień:**
    - **Skrytobójca:** Egzekucja (Cios w plecy zadaje podwójne obrażenia celowi poniżej 30% HP) i Znak śmierci (po 3 ruchach cel dostaje jeszcze raz połowę obrażeń, które dostał w tym czasie);
    - **Truciciel:** Czarny jad (Zatrucie z Zatrutego ostrza zmniejsza też obrażenia celu o 10%) i Trujący Szlam. Autor: „Coś a'la Nekromanta - przyzwanie Trującego Szlamu na przykład”. Szlam działa jak przywołania z punktu 18, co ruch zatruwa losowego wroga, a gdy zginie, rozpryskuje się i zatruwa wszystkich wrogów;
    - **Nocny Tancerz:** Taniec ostrzy (podczas Tańca cieni każdy unik oddaje cios za 60%) i Wir cieni (cztery ciosy po 40% w losowych wrogów).
17. **Cechy i statystyki** wszystkich 15 ewolucji zostają takie jak w propozycji, bez uwag autora.
18. **Przywołania** (Żywiołak i Trujący Szlam): przywołaniec staje w szyku przed postacią na 4 ruchy i ma 30% jej maks. HP, a wrogowie mogą go atakować, jak u przyszłego Nekromanty. Sokół Łowcy zostaje bez zmian: tylko atakuje i sam nie przyjmuje ciosów.

## Ewolucje i Osada: propozycje (28.10.2026)

Autor: „Pomyśl nad modułem Osady. Ja na pewno chciałbym żeby trafiła tam Zaklinaczka” oraz „przede wszystkim musimy też ruszyć Ewolucje na 50 poziomie klasy. To ważny aspekt. Przygotuj propozycje i pytania.”

1. **Dokument.** [Insight — Ewolucje i Osada: propozycje i pytania](https://claude.ai/artifact/ExqU9vANqjsGVXKvcSns71) zawiera:
    - zasady ewolucji: nazwa klasy, przyrost statystyk, cecha, rozwinięta umiejętność ścieżki, nowa umiejętność 1 z 2, Punkty Umiejętności od 50. do 99. poziomu i nowy strój;
    - 15 pierwszych ewolucji z cechami i umiejętnościami;
    - przebieg ewolucji na ekranie, grafiki, dźwięki i koszty;
    - Osadę Rozstaje: reputację w pięciu stopniach, Zaklinaczkę (przekucie afiksu, zaklęcie żywiołu, przeniesienie afiksu), Karczmę z werbunkiem towarzyszy i plotkami, Tablicę zleceń, Targ, Chatę zielarki i Pustelnika;
    - szkic planszy Osady i ekranu miejsca, kolejność prac i 20 pytań z zaleceniami (E1–E9, O1–O11).
2. **Nic z niego nie wchodzi do gry** przed odpowiedziami autora.
3. **Liczby z krzywej.** 50. poziom klasy przychodzi według obecnej krzywej po ok. 80 godzinach wypraw, przy ok. 44. poziomie postaci, a 100. po ok. 400 godzinach.
