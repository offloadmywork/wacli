import { AmbiguousChatError } from './store.js';

// Quoted choices cannot insert extra terminal lines or directional controls.
const quote = (value: unknown) => JSON.stringify(value).replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu,
  character => character.split('').map(unit => `\\u${unit.charCodeAt(0).toString(16).padStart(4, '0')}`).join(''));

export function ambiguousChatOutput(error: AmbiguousChatError, json: boolean): string {
  if (json) return quote({error: error.code, message: error.message, candidates: error.candidates});
  return [error.message, ...error.candidates.map((candidate, index) =>
    `${index + 1}. name=${quote(candidate.name)} id=${quote(candidate.id)}`)].join('\n');
}
