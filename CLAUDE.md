# Insight: wskazówki dla sesji budowania

- Przed zmianą kodu przeczytaj w całości [dokument projektowy](https://claude.ai/artifact/9jPtkYkTJ67d3akFB8imGX) i `DECISIONS.md`. Decyzje z dokumentu są ustalone: zmianę proponuj autorowi jako pytanie.
- Brakujący szczegół rozstrzygnij najprostszym rozwiązaniem zgodnym z filarami gry i dopisz go do `DECISIONS.md`.
- Uwagi autora wtrącone w trakcie pracy, które nie dotyczą bieżącego zadania, zapisz na później i nie przerywaj pracy. Gdy trzeba przerwać, autor sam to powie.
- Przed każdym dłuższym raportem przejrzyj wszystkie wiadomości autora od poprzedniego raportu. Nie pytaj o to, co autor już rozstrzygnął, i nie proponuj własnych wersji tekstów, które autor napisał.
- Teksty czytane głosem, np. kwestie narratora, daj autorowi do zatwierdzenia przed nagraniem. Autor usuwa z nich naleciałości AI.
- Nagrania autor sprawdza sam, na słuch: wrzucaj mu je w czacie albo na stronę odsłuchu. Nie pobieraj programów do rozpoznawania mowy ani innych modeli.
- Nowe grafiki pokazuj autorowi do oceny pojedynczo, jedną po drugiej, zaraz po powstaniu, gdy autor nie śpi.
- Z autorem rozmawiaj po polsku. Kod, nazwy plików i identyfikatory są po angielsku, a teksty widoczne w grze po polsku.
- Autor pracuje wyłącznie z telefonu. Każdą czynność po jego stronie opisz krok po kroku dla przeglądarki mobilnej.
- Treść gry (zdarzenia, przedmioty, potwory, NPC, teksty) trafia do `data/`, nigdy do logiki.
- `src/engine/` to czyste, deterministyczne funkcje, bez `Date.now()`, `Math.random()` i wejścia-wyjścia. Czas i ziarno losowości podaje serwer.
- Gra działa na planie Workers Paid: do 30 s CPU na żądanie, a 30 mln ms CPU miesięcznie jest w cenie. Żądania i tak mają być szybkie.
- Docelowo gra trafi do Sklepu Play jako aplikacja. Autor może dokupić tani plan Cloudflare albo domenę: zalecaj taki zakup, gdy się przyda.
- Polecenia: `npm ci`, `npm test`, `npm run dev`.
- Push do `main` testuje i wdraża grę (`.github/workflows/deploy.yml`). Etap kończy się wdrożoną wersją i raportem: co zrobiono, co sprawdzić w grze, co dalej.
- Każde wdrożenie do gry podnosi numer wersji w `package.json` o jeden na ostatnim miejscu (0.0.1, 0.0.2…): `npm version <numer> --no-git-tag-version`. Raport podaje ten numer, a Ustawienia gry pokazują go w „Wersja gry”.
