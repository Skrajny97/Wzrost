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

11. **Cel ataku.** Postać bije przeciwnika, którego pokona najszybciej. Liczy, ile średnich ciosów potrzeba na HP każdego przeciwnika, z jego pancerzem albo odpornością na żywioł broni. Nie rozprasza więc ciosów między stwory. Potwory dalej wybierają cel losowo, przednią linię częściej.
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
2. **Magazyn na godzinę za każdy poziom.** Zgodnie z życzeniem autora magazyn budynku na poziomie 1 mieści godzinę produkcji, a na poziomie 10 dziesięć godzin (`storageHours` 1 za poziom). Pojemność rośnie więc szybciej niż tempo:
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
10. **Kilka awansów w jednym wierszu.** Kilka poziomów naraz daje jeden wiersz dla postaci i jeden dla klasy, z sumą punktów, np. „Osiągnięto poziom 4. Wolne punkty statystyk: +24.” Komunikaty o odblokowaniach zostają osobno.
11. **Ewolucje klas.** Autor zaproponował pierwszą ewolucję na poziomie klasy 50, a kolejne co 100 poziomów, chyba że jest lepszy pomysł. Ewolucje są na poziomach klasy 50, 100, 200, 300, 400 i 500 (`classEvolutionLevels` w `data/balance.json`):
    - druga przychodzi po ok. 100 godzinach eksploracji, a nie po ok. 260 przy progu 150,
    - ostatnia wypada na najwyższym poziomie klasy.

    Według krzywej poziom klasy 50 przychodzi po ok. 23 godzinach eksploracji (postać ma wtedy ok. 43 poziom), 100 po ok. 100 godzinach, 200 po ok. 500, 300 po ok. 1260, 400 po ok. 2440, a 500 po ok. 4080. Ekran statystyk pokazuje „Pierwsza ewolucja: poz. klasy 50”. Same ewolucje powstaną w Etapie 3. Gdyby autor wolał progi 150, 250, 350 i 450, wystarczy zmienić listę. Punkt zastępuje poziom 30 z punktu 10 „Regionów wewnętrznych i obozu”.

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
    - 3 za każdy poziom postaci i 2 za każdy poziom klasy,
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

Niedźwiedzi, Wilczy, Rysi i Kruka już nosiły nazwy potworów i zostają. Pięć przyrostków odporności (Topieli, Burzy, Skał, Mchu, Kapliczki) zostaje, dopóki nie pojawią się potwory wody, elektryczności, ziemi, natury i sakrum. Afiksy nadal losują się z całej listy, bez względu na potwora z walki.

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
6. **Stół rzemieślniczy** (`craft-table`) to nowy budynek obozu, bardzo tani na start: 3 złota i 3 drewna, minuta budowy. Za darmo przerabia materiał na jedną część tej samej rzadkości. Części nazwał autor: Ścinki, Rzemienie, Okucia, Runy, Bursztyn, Krwawnik i Gwiezdny odprysk.
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
