# Silnik

Silnik gry to deterministyczne, czyste funkcje: ten sam stan, czas i ziarno losowości zawsze dają ten sam wynik. Silnik nie woła `Date.now()`, `Math.random()`, sieci ani bazy, bo czas i ziarno podaje serwer.

Ten sam kod działa na serwerze, który rozstrzyga wynik, i w kliencie, który używa go tylko do podglądu. Każde wywołanie musi zmieścić się w limicie 10 ms CPU.

Pierwszy kod silnika pojawi się w etapie 1: walka trzy na trzy i polowania.
