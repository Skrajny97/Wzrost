-- Orders taken off the Stół rozbiórki's queue (src/server/crafting.js,
-- cancelOrders; the author: "nie wiem czy jest sens karania za takie
-- pomyłki"): a trial of the Próby Gildii keeps what came over its count as
-- it was done (`extra`, trialProgress in src/server/guild-trials.js), so a
-- cancelled order takes back exactly what it brought, and a trial done with
-- work never done opens again only when the rest falls below its count.
ALTER TABLE guild_trials ADD COLUMN extra INTEGER NOT NULL DEFAULT 0;
