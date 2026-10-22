# Wzrost: wskazówki dla sesji budowania

- Przed zmianą kodu przeczytaj w całości [dokument projektowy](https://claude.ai/artifact/9jPtkYkTJ67d3akFB8imGX) i `DECISIONS.md`. Decyzje z dokumentu są ustalone: zmianę proponuj autorowi jako pytanie.
- Brakujący szczegół rozstrzygnij najprostszym rozwiązaniem zgodnym z filarami gry i dopisz go do `DECISIONS.md`.
- Z autorem rozmawiaj po polsku. Kod, nazwy plików i identyfikatory są po angielsku, a teksty widoczne w grze po polsku.
- Autor pracuje wyłącznie z telefonu. Każdą czynność po jego stronie opisz krok po kroku dla przeglądarki mobilnej.
- Treść gry (zdarzenia, przedmioty, potwory, NPC, teksty) trafia do `data/`, nigdy do logiki.
- `src/engine/` to czyste, deterministyczne funkcje, bez `Date.now()`, `Math.random()` i wejścia-wyjścia. Czas i ziarno losowości podaje serwer.
- Darmowy plan Workers daje 10 ms CPU na żądanie.
- Polecenia: `npm ci`, `npm test`, `npm run dev`.
- Push do `main` testuje i wdraża grę (`.github/workflows/deploy.yml`). Etap kończy się wdrożoną wersją i raportem: co zrobiono, co sprawdzić w grze, co dalej.
