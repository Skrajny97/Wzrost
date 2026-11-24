# Gra 3D w świecie Insight, w stylu Coral Island: rozpoznanie

> Plan na przyszłość, odłożony 24.11.2026. Autor: „Na razie zapisujemy ten plan na przyszłość. Może go kiedyś zaczniemy realizować – ten projekt a’la Coral Island”. Nic z tego nie dotyczy bieżącej gry. Linki i wersje narzędzi są ze stanu na 24.11.2026; przed startem trzeba je sprawdzić od nowa.

Stan na 24.11.2026. Osobna gra: własne repozytorium, wdrożenia i konta, robiona po trochu obok Insight, z której tylko kopiujemy to, co się przyda.

## Najważniejsze

- **Da się, ale to inna skala niż Insight.** Gra 3D w czasie rzeczywistym ma dużo więcej ruchomych części (kamera, kolizje, animacje, płynność), a agent nie czuje sterowania i nie ma Twojego telefonu. Każdy krok musi kończyć się czymś, co sprawdzasz palcem.
- **Rekomendacja: Godot 4.7 w 3D, na Androidzie jako zwykła aplikacja.** Sceny to pliki tekstowe, a testy i budowanie idą poleceniami, bez okienek, więc agent zrobi wszystko sam. Silnik jest darmowy, bez opłat od przychodu.
- **Unreal** (silnik Coral Island) odpada: pliki binarne, ogromne narzędzia, ciężki na telefonach. **Unity** współpracuje z agentem głównie przez edytor na komputerze, którego nie masz. **3D w przeglądarce** (Babylon.js, three.js) to plan B: łatwo oglądać, ale wolniej działa.
- **Grafika: modele 3D na wspólnym szkielecie zamiast pixel artu.** Jedna animacja działa dla wszystkich postaci, a stroje, zbroje i narzędzia zakłada się jak warstwy. Podstawa to darmowe paczki CC0, AI 3D (Meshy, Tripo) robi rzeczy unikalne, np. stwory Insight, a jeden shader i paleta trzymają styl.
- **Z Insight kopiujemy** świat, stwory, przedmioty, profesje, teksty PL/EN, wzory walki, muzykę i doświadczenie z serwerem. Grafiki 2D będą tylko wzorem.
- **Plan: 10 małych etapów** do sprawdzenia na telefonie, od postaci chodzącej po wyspie po test w Sklepie Play. Taki wycinek gry to ok. 1–2 tygodni intensywnej pracy agenta, a po trochu ok. 2–3 miesięcy. Pełna gra w skali Coral Island to raczej lata.

## 1. Silnik

**Godot 4.7 (polecany).**
- Agent: sceny `.tscn` to tekst, eksport to jedno polecenie ([docs](https://docs.godotengine.org/en/stable/tutorials/export/exporting_projects.html)). Twórcy z 2026 r. potwierdzają, że agent sam buduje i testuje grę bez okienek ([Caleb Leak](https://calebleak.com/posts/dog-game), [ABA Games](https://dev.to/abagames/godot-is-well-suited-for-game-development-with-ai-coding-agents-2lcm)).
- Telefon: renderer „Mobile” na nowszych telefonach, „Compatibility” na słabszych i w przeglądarce. Brakuje w nich drogich efektów (SSAO, odbicia), których stylizowana grafika nie potrzebuje ([renderery](https://docs.godotengine.org/en/stable/tutorials/rendering/renderers.html)).
- Sklep Play: aplikacja budowana w GitHubie; wtyczką płatności Google zajęła się Fundacja Godot ([2026](https://godotengine.org/article/godot-mobile-update-apr-2026/)).
- Oglądanie: wersja w przeglądarce do szybkiego podglądu (wolniejsza od aplikacji, [docs](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html)), płynność w teście wewnętrznym Sklepu Play. Godot sam nagrywa rozgrywkę do filmu ([Movie Maker](https://docs.godotengine.org/en/stable/tutorials/animation/creating_movies.html)), więc filmy na stronę ocen zrobią się automatycznie.
- Koszt: 0 zł (MIT).

**Unity 6.** Najdojrzalszy na telefonach, ale sceny są pełne identyfikatorów, które agent łatwo psuje, a oficjalny serwer MCP (beta od maja 2026) wymaga działającego edytora, Unity Cloud i subskrypcji ([Unity](https://unity.com/blog/unity-ai-mcp-how-to-get-started)). Darmowy do 200 tys. USD przychodu ([cennik](https://unity.com/products/pricing-updates)).

**Unreal 5.** Coral Island to Unreal Engine 4 i Blueprinty, wydana na PC i konsole ([Wikipedia](https://en.wikipedia.org/wiki/Coral_Island_%28video_game%29)). Blueprinty i poziomy to pliki binarne, MCP od Epic jest eksperymentalne i działa w edytorze ([Epic](https://dev.epicgames.com/documentation/unreal-engine/unreal-mcp-in-unreal-editor)), a na telefony trzeba wszystko mocno ciąć. Przy pracy z telefonu: nierealne.

**3D w przeglądarce (three.js, Babylon.js, PlayCanvas).** Plusy: JavaScript jak w Insight, Cloudflare, link na telefonie, droga do Sklepu Play jak w Insight. Minusy: wolniej niż aplikacja, WebGPU tylko na części Androidów ([web.dev](https://web.dev/blog/webgpu-supported-major-browsers)), więcej do zbudowania samemu (fizyka, nawigacja, sceny).

## 2. Grafika 3D z AI

Twoja intuicja jest trafna: w 3D animacja jest oddzielona od wyglądu. Gracz, mieszkańcy i stroje używają tych samych animacji, a miecz czy motykę „przypina się” do kości dłoni. W pixel arcie każdy strój × kierunek × ruch to nowy rysunek (Insight ma już po 1350 arkuszy chodu i jazdy).

Linia produkcyjna, cała jako skrypty bez okienek:
1. **Podstawa z paczek CC0** (za darmo, także komercyjnie): [Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html) (ponad 120 animacji na wspólnym szkielecie) i jej [druga część](https://quaternius.com/packs/universalanimationlibrary2.html), [modułowe stroje](https://quaternius.com/packs/modularcharacteroutfitsfantasy.html) (12 strojów z 62 części), [KayKit Adventurers](https://kaylousberg.itch.io/kaykit-adventurers) (75 animacji, ponad 25 dodatków), do tego natura, budynki i meble.
2. **AI do rzeczy unikalnych:** [Meshy](https://docs.meshy.ai/api/rigging-and-animation) (model z opisu lub obrazka, szkielet, kilkaset gotowych animacji, [odchudzanie do 100–15 000 trójkątów](https://docs.meshy.ai/api/remesh)) i [Tripo](https://developers.tripo3d.com/en/models/rig) (szkielety też dla czworonogów, ptaków, węży, czyli dla stworów Insight). [TRELLIS.2](https://huggingface.co/microsoft/TRELLIS.2-4B) jest otwarty, ale wymaga karty z 24 GB. **Hunyuan3D odpada: licencja wyklucza Unię Europejską** ([licencja](https://huggingface.co/tencent/Hunyuan3D-2/blob/main/LICENSE)). Mixamo działa tylko przez stronę, bez API ([Adobe](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html)).
3. **Blender bez okna** ([polecenia](https://docs.blender.org/manual/en/latest/advanced/command_line/arguments.html)): odchudzanie, wersje na odległość, wspólna tekstura z paletą, animacje na wspólny szkielet, ikony przedmiotów renderowane z modeli, filmy obrotowe do oceny.
4. **Styl:** jeden shader „toon” (2–3 stopnie cienia, obrys) i jedna paleta dla wszystkiego. To on ujednolica modele z różnych źródeł.
5. **Teren i rośliny:** pola na kratce (farma i tak jest kratką), trawa i uprawy jako powielane kopie. Wtyczka Terrain3D ma telefon i przeglądarkę jako „eksperymentalne” ([docs](https://terrain3d.readthedocs.io/en/latest/docs/mobile_web.html)), więc nie na start.
6. **Budynki i wnętrza:** modułowe ściany i dachy z paczek, meble z AI, wnętrza jako osobne małe sceny.
7. **Uprawy:** skrypt robi 4–5 etapów wzrostu z jednego dojrzałego modelu, bo AI rysujące każdy etap osobno gubi spójność.

**Agent utrzyma spójnie** skalę, szkielet, paletę, shader i budżety (automat odrzuca model za ciężki). **Nie utrzyma** twarzy ludzi z AI, bo każda wyjdzie inna: dlatego postacie z paczek ze stylizowanymi twarzami, a stwory z AI po kilka na etap, każdy na stronie ocen.

## 3. Budżet średniego telefonu

- 30 klatek/s jako podstawa, 60 jako opcja.
- Do ok. 150–200 tys. trójkątów na klatkę ([demo Google: ok. 210 tys. przy 30 kl./s](https://developer.android.com/games/optimize/geometry)) i ok. 100–300 wywołań rysowania ([Epic: ok. 700 na Galaxy Tab S6, poniżej 500 na słabszych](https://dev.epicgames.com/documentation/unreal-engine/optimization-and-development-best-practices-for-mobile-projects-in-unreal-engine)).
- Postać 3–8 tys. trójkątów, przedmiot do 2 tys., tekstury do 1024 px, jedno słońce z krótkim cieniem, obraz w ok. 75% rozdzielczości.
- Aplikacja do 200 MB ([Google Play](https://developer.android.com/guide/app-bundle/faq)), reszta dociągana.

## 4. Krótko o 2D

- **Pixel art:** najlżejszy, ale bez warstw i z walką o spójność klatek.
- **2D na kościach** ([Spine](https://esotericsoftware.com/spine-purchase) 69 albo 379 USD; w Godocie za darmo): warstwy działają, ale każdy kierunek wymaga osobnych części, a AI słabo dzieli postać na spójne kawałki.
- **3D renderowane do obrazków** (jak w [Dead Cells](https://www.jikguard.com/news/art-design-deep-dive-using-a-3d-pipeline-for-2d-animation-in-dead-cells)): dobre do gry 2D, ale przy wyglądzie Coral Island lepiej od razu prawdziwe 3D na tych samych modelach.

## 5. Co kopiujemy, co nowe

**Kopia:** 14 krain, 258 stworów z żywiołami i efektami, 220 baz przedmiotów, 258 materiałów, 8 profesji z treścią (18 upraw, 18 ryb, 18 ziół, 20 dań, 31 mikstur), teksty PL/EN, wzory walki przepisane na GDScript i pilnowane testami porównującymi wyniki z silnikiem Insight, muzyka, dźwięki i sposób pracy (testy, wdrożenia z GitHuba, strona ocen). Serwer Cloudflare (zapis w chmurze, płatności) później, jako osobna kopia.

**Nowe:** modele i animacje 3D, teren, budynki, wnętrza, etapy upraw, narzędzia, kamera, sterowanie dotykiem (joystick i przyciski, raczej ekran poziomy), interfejs, walka w czasie rzeczywistym (z automatycznej walki Insight przejdą tylko wzory), zachowanie stworów, zapis stanu świata.

## 6. Trudne miejsca

- **Wyczucie gry** (reakcja na dotyk, odrzut, „zamrożenie” przy trafieniu): agent tego nie czuje, więc liczby w danych i suwaki w menu testowym, a decyzja jest Twoja.
- **Kamera i kolizje:** kształty kolizji rysowane na zrzutach dla agenta; bez tego błędy zderzeń się nie poprawiały ([ABA Games](https://dev.to/abagames/godot-is-well-suited-for-game-development-with-ai-coding-agents-2lcm)).
- **Ścieżki stworów:** siatka nawigacji i testy w rodzaju „stwór obchodzi płot”.
- **Zapis:** jeden plik z numerem wersji, zapis przy pójściu spać.
- **Ekonomia:** boty grające po 100 dni różnymi sposobami, jak symulacje w Insight.
- **Mapy:** AI słabo układa przestrzeń, więc proste strefy na kratce i kopalnia losowana z reguł.
- **Testy:** logika (walka, uprawy, czas) jako czysty kod z ziarnem, testowany bez grafiki, plus nagrane ruchy odtwarzane w testach oraz zrzuty i filmy dla agenta.
- **Wydajność:** licznik klatek w każdej wersji, a sędzią jest Twój telefon.

## 7. Przykłady z lat 2025–2026

- [fly.pieter.com](https://levels.io/full-multiplayer-python-websockets-game-ai) (2025, three.js): pierwsza wersja w 3 godziny, 87 tys. USD miesięcznie po 17 dniach, potem [spadek do zera](https://dev.to/promptway/he-built-a-flight-simulator-in-three-hours-and-hit-1m-a-year-in-17-days-then-it-went-to-zero-1b1l). Szybki prototyp to jeszcze nie trwała gra.
- [Caleb Leak](https://calebleak.com/posts/dog-game) (2026, Godot, Claude Code): gry stały się grywalne dopiero, gdy agent dostał zrzuty ekranu, testowe sterowanie i sprawdzanie scen; most do edytora Unity się zawieszał.
- [Void Balls](https://www.loopedin.games/blog/how-i-built-void-balls-using-ai/) (2026, Unity 6, Claude Code): 2 tygodnie do pierwszej wersji, ale z edytorem na komputerze.
- [Just Farm](https://x.com/hakimieiqbal/status/2121242111538536900) (listopad 2026, Unity 6, Claude Opus 5.5): gra farmerska na Steamie w 5 tygodni, autor z 19-letnim stażem. Znana tylko z wpisu w mediach społecznościowych.

## 8. Plan: etapy do sprawdzenia na telefonie

0. **Fundament:** repozytorium, Godot, testy i budowanie w GitHubie, wersja pod adresem testowym. *Oceniasz:* scenę testową i licznik klatek.
1. **Spacer:** kawałek wyspy, postać z paczki (stoi, idzie, biegnie), joystick, dwa warianty kamery. *Oceniasz:* sterowanie, kamerę, płynność.
2. **Styl:** shader, paleta, 10–15 przedmiotów z paczek i z AI. *Oceniasz:* filmy obrotowe na stronie ocen.
3. **Pole:** motyka, konewka, uprawa w 4 etapach, sen i nowy dzień, skrzynia na sprzedaż. *Oceniasz:* 3 dni gry.
4. **Zapis** przy śnie i wczytanie po zamknięciu. *Oceniasz:* zamykasz i otwierasz.
5. **Walka:** stwór z Insight w 3D (np. wilk), pościg, zamach z ostrzeżeniem, unik, odrzut, łup. *Oceniasz:* walkę i suwaki wyczucia.
6. **Ekwipunek:** stroje i broń na wspólnym szkielecie. *Oceniasz:* przebieralnię.
7. **Kopalnia:** losowane piętra, rudy, 2–3 stwory. *Oceniasz:* 5 pięter.
8. **Osada:** mieszkaniec z rozmową PL/EN i sklepem. *Oceniasz:* rozmowę.
9. **Sklep Play:** test wewnętrzny i poprawki płynności. *Oceniasz:* instalujesz ze Sklepu Play (kroki dostaniesz wtedy).

**Punkty decyzji:** po etapie 1 (czy Twój telefon trzyma 30 klatek?), po 5 (czy walka cieszy?) i po 9 (iść dalej?).

**Nakład:** etap to 1–3 sesje agenta, więc przy kilku krokach w tygodniu wycinek zajmie ok. 2–3 miesięcy. W Insight w miesiąc powstało ok. 2900 zmian, 120 tys. linii kodu i 5,5 tys. grafik. Mała gra w stylu Coral Island (jedna wyspa, 4 profesje, ok. 20 stworów, 10 mieszkańców, rok pór) to kilka takich miesięcy, a po trochu raczej ponad rok. Wąskim gardłem jest grafika, wyczucie gry i Twoje oceny, nie kod.

**Ryzyka:** płynność na tańszych telefonach, rozjeżdżający się styl modeli z AI, licencje generatorów (CC0 jest bezpieczne), abonamenty, jednorazowe dodanie Godota i narzędzi Androida do środowiska agenta i Twój czas na oceny.

**Obok Insight:** osobne repozytorium z własnym CLAUDE.md, osobna strona ocen, osobne sesje agenta. Insight ma pierwszeństwo.

## Do decyzji, gdy zechcesz ruszyć

- **S1. Silnik:** A) Godot 4.7 (zalecam), B) 3D w przeglądarce (Babylon.js).
- **S2. Ekran:** A) poziomy, jak w grach akcji na telefon (zalecam), B) pionowy, jak Insight.
- **S3. Start:** A) etapy 0–1 od razu, po trochu, B) po bieżących pracach w Insight.
