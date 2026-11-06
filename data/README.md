# Treść gry

Tu leży treść gry w plikach JSON: statystyki, żywioły, efekty, rzadkości, sloty, klasy, bazy przedmiotów, afiksy, potwory, regiony, zasoby, budynki obozu, stałe balansu, teksty raportów, kolejność odblokowań, kwestie narratora i jego zadania dzienne i tygodniowe (`quests.json`). Treść nigdy nie trafia do logiki silnika.

Każdy plik ma schemat w `schemas/`. Polecenie `npm run validate` sprawdza schematy i odwołania między plikami, np. czy region wskazuje istniejące potwory. Workflow robi to przy każdym pushu, więc błędne dane nie trafią do gry.

Teksty w `texts.json` mają po kilka wariantów, bo raporty czyta się setki razy. Wariant wybiera silnik, a w nawiasach klamrowych są wstawiane wartości, np. `{target}` albo `{damage}`.

Teksty zadań w `quests.json` mają `{count}` (ile) i `{noun}` (rzeczownik w formie do tej liczby: 1, 2–4, 5 i więcej). Stwór w zadaniu bierze formy ze swojego `counted` w `monsters.json`, np. „wilka”, „wilki”, „wilków”.

Region ma swoją elitę (`elite` w `regions.json`), a region wewnętrzny może mieć własną elitę i czempiona (`champion`). Elita i czempion to potwory z `elite: true` albo `champion: true` w `monsters.json`. Walidator pilnuje, żeby czempion mieszkał najwyżej w jednym regionie wewnętrznym każdego regionu i nie trafiał do zwykłych spotkań.

Cios stwora może mieć też `slow` (Ugrzęźnięcie z `effects.json`: z szansą `chance`, mniejszą o Wolę celu, następny ruch celu przychodzi później, 1 / (1 − `slow`) razy później) i `drain` (Wysysanie: stwór odzyskuje taką część zadanych obrażeń). `weaknesses` stwora to słabość na żywioł, np. `{ "fire": 0.5 }`: o połowę więcej obrażeń od ognia, z ciosów i z Oparzenia. Cecha regionu może dać postaci z tyłu szyku więcej uniku (`backDodgeBonus`) albo przedłużyć efekt o kilka ruchów, u stworów i u postaci (`effectTicks`, np. `{ "poisoned": 1 }`).

Stwór z `ambush: true` (Zasadzka, np. Piaskun) czeka w zasadzce: walka, w której jest, zaczyna się od ruchów wszystkich stworów, jak zasadzka w zdarzeniach, gdziekolwiek stwór walczy. Atak z `target: "back"` (Atak na tył szyku, np. Lelek) bije postać stojącą najdalej z tyłu szyku, a gdy tył jest pusty, najdalej z tyłu z tych, które stoją. Efekt ataku z `all: true` (Ognista nawałnica Raroga) może dotknąć każdego z drużyny, każdego osobno, nie tylko trafionego.

Stwór z `hidden: true` (Ukryty w mroku, np. Szeleśnik) kryje się w ciemności: drużyna nie wybiera go na cel, dopóki walczy obok niego stwór bez tej cechy, a gdy zostaną same ukryte, bije je jak każde. Ciosy w kilku wrogów naraz (zamach, chmura, rozprysk, przebicie, wir cieni) trafiają go jak każdego. Atak z `cleave` (Cios w cały szyk, np. `0.6` u Księżycożercy) po ciosie w wybrany cel trafia też każdego innego żywego członka drużyny z taką częścią siły, każdego osobno.
