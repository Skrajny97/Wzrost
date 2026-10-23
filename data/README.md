# Treść gry

Tu leży treść gry w plikach JSON: statystyki, żywioły, efekty, rzadkości, sloty, klasy, bazy przedmiotów, afiksy, potwory, regiony, stałe balansu, teksty raportów i kolejność odblokowań. Treść nigdy nie trafia do logiki silnika.

Każdy plik ma schemat w `schemas/`. Polecenie `npm run validate` sprawdza schematy i odwołania między plikami, np. czy region wskazuje istniejące potwory. Workflow robi to przy każdym pushu, więc błędne dane nie trafią do gry.

Teksty w `texts.json` mają po kilka wariantów, bo raporty czyta się setki razy. Wariant wybiera silnik, a w nawiasach klamrowych są wstawiane wartości, np. `{target}` albo `{damage}`.
