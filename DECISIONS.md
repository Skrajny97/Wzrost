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

1. **Jedna postać na konto.** Postać ma rolę `player`. Towarzysze dostaną w Etapie 5 tę samą tabelę i strukturę z inną rolą. Imię ma 2–20 liter i może zawierać spacje, myślniki i apostrofy. Imiona nie muszą być unikalne.
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

   Wartości są w `data/balance.json` (`progression`): `maxLevel`, `firstLevelMinutes`, `flatLevels`, `levelTimeExponent` i `xpPerHourScale` 650. XP z potworów jest dziesięć razy większe (`xpBase` 100), żeby liczby rosły szybciej. Symulacja: na poziomach 1–5 5-minutowa wyprawa daje poziom postaci w ok. 90% przypadków, a poziom klasy zawsze. Poziom klasy wymaga dalej 60% XP poziomu postaci, więc klasa wyprzedza postać. Przykład: po 4-godzinnej wyprawie na poziomie 2 Cień miał poziom postaci 12 i poziom klasy 14. Tabela odblokowań z dokumentu się nie zmieniła, więc umiejętności (poziom 4), profesje (6), trening (8), osada (10) i lochy (12) przychodzą teraz w pierwszej godzinie eksploracji, a ewolucja klasy (25) po ok. 6 godzinach. To pytanie do autora. Punkt zastępuje punkty 5 i 6 z „Uwag autora po Etapie 1” (krzywa i czasy). *Poziomy odblokowań i ewolucji są nieaktualne: zob. „Regiony wewnętrzne i obóz”, punkt 10.*
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

   Nazwy są tylko podpowiedzią, bo o wszystkim decyduje czas. Punkt zastępuje minimum 5 minut z punktu 1 „Odpowiedzi autora na otwarte kwestie” i zakres suwaka z punktu 20 „Odpowiedzi autora po wdrożeniu”.
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

    Darmowe zerowanie statystyk działa do poziomu 20 (wcześniej 10), a pierwsza ewolucja klasy jest na poziomie klasy 30 (wcześniej 25). Dokument projektowy ma nową tabelę odblokowań. Punkt zastępuje poziomy odblokowań z punktu 1 „Nowej skali i eksploracji” i próg zerowania z punktu 6 Etapu 1.
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

1. **Szybsze poziomy 2–5.** Zgodnie z odpowiedzią autora pierwsze poziomy wymagają mniej XP (`earlyXpFactors` w `data/balance.json`: 1, 0,861, 0,551, 0,402 i 0,314). Poziom 1 wymaga 43 XP, a poziomy 2–5 po 80 XP, więc próg nigdy nie maleje. Każdy z poziomów 1–5 trwa w Skraju Wiatrołomów średnio ok. 5 minut: 4,9, 4,8, 4,8, 5,1 i 5,1 minuty (wcześniej poziom 3 trwał 8, a poziom 4 12 minut). Pięciominutowa wyprawa daje awans postaci na poziomie 1 w 84% przypadków, a na poziomach 2–5 w ok. 45–55%. Awans klasy daje w ok. 75–100% przypadków. Trzydzieści minut z poziomu 2 daje teraz ok. poziomu 5,8 zamiast 4,8. Cztery godziny z poziomu 2 dalej kończą się na poziomie ok. 8. Punkt rozstrzyga pytanie o tempo z punktu 17 „Regionów wewnętrznych i obozu”.
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
2. **PS należą do konta.** Waluta premium nie może przepaść przez „Zacznij od nowa”, więc PS leżą w tabeli `users` (`system_points`, migracja `0005_system_points.sql`), a nie w zasobach postaci. Postać w API ma pole `systemPoints`. Zasób `system-points` zniknął z `data/resources.json`, a z nim oznaczenie `system` i jego sprawdzanie w teście danych. Budynek ani znalezisko nie użyją PS, bo test danych odrzuca nieznane zasoby. Punkt zastępuje punkt 7 „Produkcji w obozie”.
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

   Do czasu grafik gra pokazuje dotychczasowe ikony. Wektorowe popiersia klas z podglądu zostają wstępnie i wejdą do walki razem ze sprite'ami.
9. **Jak powstają grafiki.** Opisy, style i rozmiary są w `art/prompts.json`. Przebieg „Grafiki (szkice)” (`.github/workflows/art.yml`), uruchamiany ręcznie, woła `tools/generate-art.mjs` z sekretem repozytorium `RETRO_DIFFUSION_API_KEY`. Skrypt najpierw darmowo wycenia każde zapytanie i nie wydaje więcej niż limit przebiegu, domyślnie 2 USD. Szkice z przezroczystym tłem trafiają na osobną gałąź `art-drafts`, której workflow gry nie testuje ani nie wdraża. Zatwierdzone sprite'y trafią do `src/client/art/`, a wybrane z nich, jako wzorce stylu dla kolejnych, do `art/references/`.

