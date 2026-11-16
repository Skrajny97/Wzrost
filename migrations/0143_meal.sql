-- Gotowanie (src/engine/cooking.js; 999.3-999.5 v2, 1059): the meal a
-- character has eaten as it set out on an exploration, its dish and the
-- minutes of explorations it still works for ({"dish": "zurek", "left":
-- 120}); NULL without one, or once used up. Cooking sits in activities and
-- avatar_activities as any other work (kind "dishes"), and the dishes in the
-- Spiżarnia (characters.pantry).
ALTER TABLE characters ADD COLUMN meal TEXT;
