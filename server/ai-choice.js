// Which AI connection a user is "currently using". A user may keep several
// connections (for example Claude and GPT) and switch between them in
// Settings; each connection remembers the model last chosen for it.

/**
 * @typedef {{ id: string, models: { id: string, capabilities: { text?: boolean } }[] }} ConnectionLike
 * @typedef {{ activeConnectionId?: string, activeModels?: Record<string, string> }} AiSettings
 */

const textModels = (connection) =>
  connection.models.filter((m) => m.capabilities?.text);

/**
 * Resolve the active connection and model, falling back to the first usable
 * connection when the chosen one was removed or offers no text model.
 * @param {AiSettings} settings
 * @param {ConnectionLike[]} connections ordered oldest first
 * @returns {{ connectionId: string, model: string } | null}
 */
export function resolveActiveAi(settings, connections) {
  const usable = connections.filter((c) => textModels(c).length);
  const connection =
    usable.find((c) => c.id === settings.activeConnectionId) || usable[0];
  if (!connection) return null;
  const models = textModels(connection);
  const remembered = settings.activeModels?.[connection.id];
  const model = models.find((m) => m.id === remembered) || models[0];
  return { connectionId: connection.id, model: model.id };
}

/**
 * Record a switch to `connectionId` (and optionally a model for it) without
 * forgetting the models remembered for other connections.
 * @param {AiSettings} settings
 * @param {string} connectionId
 * @param {string} [model]
 * @returns {AiSettings}
 */
export function rememberChoice(settings, connectionId, model) {
  return {
    ...settings,
    activeConnectionId: connectionId,
    activeModels: model
      ? { ...settings.activeModels, [connectionId]: model }
      : { ...settings.activeModels },
  };
}
