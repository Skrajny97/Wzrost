// The Umiejętności tab: learning one of the three skills of the class at its
// class level, and raising a learned skill with a Skill Point (skills.js in
// the engine). Like stat points, skills change only at home: an exploration
// keeps the character it started with.

import { learnBlock, raiseBlock } from '../engine/index.js';
import { characterView, engineCharacter, requireBuildPlayer } from './characters.js';
import { content } from './content.js';
import { ApiError, json, readJson } from './http.js';

async function saveSkills(context, player, skills) {
  const value = JSON.stringify(skills);
  const result = await context.env.DB.prepare('UPDATE characters SET skills = ?, version = version + 1 WHERE id = ? AND version = ?')
    .bind(value, player.row.id, player.row.version)
    .run();
  if (result.meta.changes !== 1) {
    throw new ApiError(409, 'conflict', 'Postać zmieniła się w międzyczasie. Spróbuj ponownie.');
  }
  const updated = { ...player, row: { ...player.row, skills: value, version: player.row.version + 1 } };
  return json({ character: characterView(updated, context.now) });
}

function skillOf(body) {
  if (typeof body.skillId !== 'string') throw new ApiError(400, 'invalid_skill', 'Wybierz umiejętność.');
  return body.skillId;
}

// { skillId }: learn one of the skills of the class's milestone, at level 1.
export async function learnSkill(context) {
  const { player } = await requireBuildPlayer(context);
  const skillId = skillOf(await readJson(context.request));
  const character = engineCharacter(player.row);
  const block = learnBlock(character, skillId, content);
  if (block) throw new ApiError(block.code === 'unknown_skill' ? 400 : 409, block.code, block.message);
  return saveSkills(context, player, { ...character.skills, [skillId]: 1 });
}

// { skillId, count }: Skill Points into a learned skill, one unless `count`
// says more ("Dodaj 10 Punktów" on the skill's card).
export async function raiseSkill(context) {
  const { player } = await requireBuildPlayer(context);
  const body = await readJson(context.request);
  const skillId = skillOf(body);
  const count = body.count ?? 1;
  if (!Number.isInteger(count) || count < 1) throw new ApiError(400, 'invalid_count', 'Podaj liczbę punktów.');
  const character = engineCharacter(player.row);
  const block = raiseBlock(character, skillId, content, count);
  if (block) throw new ApiError(409, block.code, block.message);
  return saveSkills(context, player, { ...character.skills, [skillId]: character.skills[skillId] + count });
}
