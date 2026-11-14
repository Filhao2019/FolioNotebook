// Knowledge graph: notebooks, their sources, saved resources and the topics
// those resources cover. Links come only from stored records — a resource
// links to the sources it cites and to the topics it names — so the graph
// never invents a relationship.

const TOPICS_PER_RESOURCE = 12;
const TOPIC_LENGTH = 60;

/** Topics are matched across resources and notebooks by a normalized key. */
export const topicKey = (label) =>
  String(label ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const parse = (text, fallback) => {
  try {
    return JSON.parse(text) ?? fallback;
  } catch {
    return fallback;
  }
};

/** Topic labels a resource names explicitly. */
export function resourceTopics(kind, content) {
  let labels = [];
  if (kind === "guide") labels = content.coveredTopics || [];
  else if (kind === "quiz")
    labels = (content.questions || []).map((q) => q.topic);
  else if (kind === "mindmap") {
    const nodes = content.nodes || [];
    const root = nodes.find((n) => n.parent === null);
    labels = nodes
      .filter((n) => root && n.parent === root.id)
      .map((n) => n.label);
  }
  const seen = new Map();
  for (const label of labels) {
    const clean = String(label ?? "")
      .replace(/\s+/g, " ")
      .trim();
    const key = topicKey(clean);
    if (!key || clean.length > TOPIC_LENGTH || seen.has(key)) continue;
    seen.set(key, clean);
    if (seen.size === TOPICS_PER_RESOURCE) break;
  }
  return [...seen].map(([key, label]) => ({ key, label }));
}

/**
 * @param {{ all: (sql: string, ...args: any[]) => Record<string, any>[] }} db
 * @param {Record<string, any>[]} notebooks Rows the caller may already read.
 */
export function buildGraph(db, notebooks) {
  const nodes = [],
    links = [],
    topics = new Map(),
    linked = new Set();
  const link = (source, target) => {
    const key = source + "|" + target;
    if (source === target || linked.has(key)) return;
    linked.add(key);
    links.push({ source, target });
  };
  for (const notebook of notebooks) {
    const hub = "n:" + notebook.id;
    nodes.push({
      id: hub,
      kind: "notebook",
      ref: notebook.id,
      notebookId: notebook.id,
      label: notebook.title,
    });
    const sources = db.all(
      "SELECT id,title,format,status FROM sources WHERE notebook_id=? ORDER BY created",
      notebook.id,
    );
    const known = new Set(sources.map((s) => s.id));
    for (const s of sources) {
      nodes.push({
        id: "s:" + s.id,
        kind: "source",
        type: s.format,
        ref: s.id,
        notebookId: notebook.id,
        label: s.title,
      });
      link("s:" + s.id, hub);
    }
    const artifacts = db.all(
      "SELECT id,kind,title,content,citations FROM artifacts WHERE notebook_id=? ORDER BY rowid",
      notebook.id,
    );
    for (const a of artifacts) {
      const id = "a:" + a.id;
      nodes.push({
        id,
        kind: "resource",
        type: a.kind,
        ref: a.id,
        notebookId: notebook.id,
        label: a.title,
      });
      const cited = new Set(
        parse(a.citations, [])
          .map((c) => c?.sourceId)
          .filter((sourceId) => known.has(sourceId)),
      );
      for (const sourceId of cited) link(id, "s:" + sourceId);
      // Resources without a surviving cited source still belong somewhere.
      if (!cited.size) link(id, hub);
      for (const topic of resourceTopics(a.kind, parse(a.content, {}))) {
        const topicId = "t:" + topic.key;
        if (!topics.has(topicId)) {
          topics.set(topicId, {
            id: topicId,
            kind: "topic",
            label: topic.label,
            notebookIds: [],
          });
          nodes.push(topics.get(topicId));
        }
        const node = topics.get(topicId);
        if (!node.notebookIds.includes(notebook.id))
          node.notebookIds.push(notebook.id);
        link(id, topicId);
      }
    }
  }
  return { nodes, links };
}
