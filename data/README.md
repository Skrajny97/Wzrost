# Treść gry

Tu leży treść gry w plikach JSON: statystyki, żywioły, efekty, rzadkości, sloty, klasy, bazy przedmiotów, afiksy, potwory, regiony, zasoby, budynki obozu, stałe balansu, teksty raportów, kolejność odblokowań, kwestie narratora i jego zadania dzienne i tygodniowe (`quests.json`). Treść nigdy nie trafia do logiki silnika.

Każdy plik ma schemat w `schemas/`. Polecenie `npm run validate` sprawdza schematy i odwołania między plikami, np. czy region wskazuje istniejące potwory. Workflow robi to przy każdym pushu, więc błędne dane nie trafią do gry.

Teksty w `texts.json` mają po kilka wariantów, bo raporty czyta się setki razy. Wariant wybiera silnik, a w nawiasach klamrowych są wstawiane wartości, np. `{target}` albo `{damage}`.

Teksty zadań w `quests.json` mają `{count}` (ile) i `{noun}` (rzeczownik w formie do tej liczby: 1, 2–4, 5 i więcej). Stwór w zadaniu bierze formy ze swojego `counted` w `monsters.json`, np. „wilka”, „wilki”, „wilków”.
