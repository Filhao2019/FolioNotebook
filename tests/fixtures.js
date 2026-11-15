import { randomUUID } from "node:crypto";

export const sourceText =
  "Mitochondria are sites of aerobic cellular respiration. They transfer energy from nutrients into ATP. The nucleus contains DNA. Plant cells have a cellulose cell wall and chloroplasts. Chloroplasts absorb light for photosynthesis. Plants also carry out cellular respiration.";
export function pdfFixture() {
  const stream =
    "BT /F1 12 Tf 50 730 Td (Mitochondria transfer energy into ATP through cellular respiration.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf +=
    "xref\n0 6\n0000000000 65535 f \n" +
    offsets
      .slice(1)
      .map((o) => String(o).padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
const ref = { refs: [1] };
export function fixtureProvider(provider) {
  const models = [
    {
      id: "fixture-text",
      name: "CI fixture text (mock)",
      context: 32000,
      capabilities: { text: true, embeddings: false },
      pricing: null,
    },
    {
      id: "fixture-embedding",
      name: "CI fixture embedding (mock)",
      capabilities: { text: false, embeddings: true },
      pricing: null,
    },
  ];
  return {
    id: provider,
    async listModels() {
      return models;
    },
    async validateConnection() {
      return models;
    },
    async *streamChat() {
      yield { text: "Mitochondria transfer energy " };
      yield { text: "into ATP during cellular respiration [1]." };
      yield { usage: { input: 120, output: 24 } };
    },
    async chat(request) {
      const prompt = request.messages.at(-1).content;
      let data;
      if (request.system?.includes("The learner is studying this flashcard"))
        return {
          text: "ATP stores the energy [1] and [9].",
          usage: { input: 150, output: 20 },
        };
      if (prompt.includes("Explain this flashcard"))
        data = {
          why: "Mitochondria run aerobic respiration.",
          detail: "Energy from nutrients is transferred into ATP.",
          simple: "They make the cell's energy.",
          example: "Muscle cells have many mitochondria.",
          takeaway: "Mitochondria make ATP.",
          refs: [1],
          followUp: { front: "What is ATP?", back: "The cell's energy carrier." },
        };
      else if (prompt.includes("Rewrite this flashcard"))
        data = {
          front: "Which organelle makes ATP?",
          back: "The mitochondrion.",
          hint: "Powerhouse.",
          explanation: "Aerobic respiration happens there.",
          refs: [1],
        };
      else if (prompt.includes("Suggest three short questions"))
        data = {
          questions: [
            "What do mitochondria do?",
            "Where is DNA stored in a cell?",
            "How do plant cells capture light?",
          ],
        };
      else if (prompt.includes("Label each source"))
        data = { labels: [{ source: 1, topic: "Cell biology" }] };
      else if (prompt.includes("Generate a infographic"))
        data = {
          title: "How cells handle energy",
          subtitle: "Respiration and photosynthesis at a glance",
          stats: [
            {
              value: "ATP",
              label: "Molecule that stores transferred energy",
              ...ref,
            },
          ],
          sections: [
            {
              heading: "Mitochondria",
              points: ["Site of aerobic cellular respiration."],
              ...ref,
            },
            {
              heading: "Chloroplasts",
              points: ["Absorb light for photosynthesis."],
              ...ref,
            },
          ],
          takeaway: "Mitochondria transfer energy into ATP.",
        };
      else if (prompt.includes("Generate a flashcards"))
        data = {
          title: "Cell recall",
          cards: [
            {
              front: "What do mitochondria do?",
              back: "Transfer energy into ATP during respiration.",
              hint: "Think ATP.",
              explanation: "Mitochondria support aerobic respiration.",
              tag: "Organelles",
              ...ref,
            },
            {
              front: "What contains DNA?",
              back: "The nucleus.",
              hint: "Cell organelle",
              explanation: "The nucleus contains DNA.",
              ...ref,
            },
          ],
        };
      else if (prompt.includes("Generate a quiz"))
        data = {
          title: "Cell check",
          questions: [
            {
              question: "Which molecule stores transferred energy?",
              options: ["ATP", "Cellulose", "Water"],
              answer: 0,
              hint: "Think about what respiration produces.",
              explanation:
                "The source states that energy is transferred into ATP.",
              explainWrong: {
                1: "Cellulose builds plant cell walls.",
                2: "Water is a product, not an energy store.",
              },
              topic: "Cellular respiration",
              difficulty: 1,
              ...ref,
            },
            {
              question: "Where does aerobic respiration occur?",
              options: ["Cell wall", "Mitochondria", "Vacuole"],
              answer: 1,
              explanation:
                "Mitochondria are sites of aerobic cellular respiration.",
              topic: "Organelles",
              ...ref,
            },
          ],
        };
      else if (prompt.includes("Generate a mindmap"))
        data = {
          title: "Cells",
          nodes: [
            {
              id: "root",
              parent: null,
              label: "Cells",
              detail: "Cells have organelles.",
              ...ref,
            },
            {
              id: "mito",
              parent: "root",
              label: "Mitochondria",
              detail: "Respiration transfers energy.",
              ...ref,
            },
          ],
        };
      else if (prompt.includes("Generate a slides"))
        data = {
          title: "Cell biology slides",
          slides: [
            {
              title: "Energy transfer",
              bullets: ["Mitochondria transfer energy into ATP."],
              speakerNotes:
                "Aerobic cellular respiration takes place in mitochondria.",
              ...ref,
            },
            {
              title: "Plant cells",
              bullets: ["Chloroplasts absorb light for photosynthesis."],
              speakerNotes: "Plants also carry out cellular respiration.",
              ...ref,
            },
          ],
        };
      else if (prompt.includes("Generate a audio"))
        data = {
          title: "Cells, energy and light",
          summary: "Two hosts talk through how cells transfer energy.",
          lines: [
            {
              speaker: "A",
              text: "Today we are looking at how cells handle energy.",
              ...ref,
            },
            {
              speaker: "B",
              text: "So where does that energy actually end up?",
              ...ref,
            },
            {
              speaker: "A",
              text: "Mitochondria transfer energy from nutrients into ATP.",
              ...ref,
            },
            {
              speaker: "B",
              text: "And plants do that too, alongside photosynthesis.",
              ...ref,
            },
          ],
        };
      else if (prompt.includes("Generate a table"))
        data = {
          title: "Organelles",
          columns: ["Organelle", "Role"],
          rows: [["Mitochondria", "Respiration"]],
          ...ref,
        };
      else
        data = {
          title: "Cell study guide",
          markdown:
            "## Mitochondria\nMitochondria transfer energy into ATP [1].\n\n## Review\nWhat is the function of mitochondria?",
          coveredTopics: ["Mitochondria", "Respiration"],
          ...ref,
        };
      return { text: JSON.stringify(data), usage: { input: 230, output: 90 } };
    },
    async embed(_model, texts) {
      return texts.map(() => [0.2, 0.4, 0.8]);
    },
    mockId: randomUUID(),
  };
}
