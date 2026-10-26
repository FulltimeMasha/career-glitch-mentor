// server/engine-bridge.mjs
// Re-export shim so server/mentor-core.mjs has ONE import site for the
// engine. Repo layout: engine lives at ../engine/. The deployed bundle
// (scripts/sync_api_bundle.mjs) writes its own bridge next to the copied
// engine under api/_lib/engine/.
export {
  createSession,
  applyCddq,
  stagePrompt,
  applyStage,
  applyPerceivedFit,
  generateReport,
  deserializeSession,
  serializeSession,
} from '../engine/interview.mjs';
export { metaRespond, MODELS } from '../engine/llm.mjs';
export { loadProfessions, buildProfessions, ROADMAP_FILE_NAMES } from '../engine/professions.mjs';
