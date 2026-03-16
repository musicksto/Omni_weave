import { getApps, initializeApp, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';

export interface GraphNode {
  type: 'character' | 'location' | 'event' | 'motif';
  name: string;
  topic: 'continuity' | 'world_state' | 'atmosphere' | 'plot_anchor';
  traits: string[];
  storyIds: string[];
  embedding?: number[];
}

export interface GraphEdge {
  from: string;
  to: string;
  relation: string;
}

export interface MemoryGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  updatedAt: string;
}

const EXTRACT_PROMPT = `You are a cinematic entity extractor and narrative theorist. Given a story text, extract key entities and story DNA categorized by high-level Memory Topics.

Return ONLY valid JSON matching this exact schema:
{
  "nodes": [
    { 
      "type": "character" | "location" | "event" | "motif", 
      "name": "string",
      "topic": "continuity" | "world_state" | "atmosphere" | "plot_anchor",
      "traits": ["string"] 
    }
  ],
  "edges": [
    { "from": "string", "to": "string", "relation": "string" }
  ]
}

Topic Definitions:
- "continuity": Character arcs, deep traits, relationships, and essential history.
- "world_state": Geographical facts, political climate, established rules of reality.
- "atmosphere": Lighting motifs, color palettes, textures, sensory recurring themes.
- "plot_anchor": Critical events or objects that hold the current narrative together.

Rules:
- "traits" MUST include "Cinematic DNA": 
  - For characters: age/build, specific hair/eye color, outfit details, voice tone, lighting motifs.
  - For locations: architecture, time of day, weather, specific color palettes.
- "edges" describe relationships: "allies with", "lives in", "opposes", "triggers", "embodies".
- Extract only entities with meaningful narrative impact.
- Do not include generic placeholders.`;

let adminApp: App | null = null;

function getAdminFirestore(): Firestore {
  if (!adminApp) {
    const existingApps = getApps();
    if (existingApps.length > 0) {
      adminApp = existingApps[0];
    } else {
      const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0001923421';
      adminApp = initializeApp({ projectId });
    }
  }
  const databaseId =
    process.env.FIRESTORE_DATABASE_ID ||
    'ai-studio-b1260629-87fa-4e1d-8d73-d8915da0d2f0';
  return getFirestore(adminApp, databaseId);
}

async function getEmbedding(text: string, genAI: any): Promise<number[]> {
  try {
    const ai = genAI || new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY || '' });
    const result = await ai.models.embedContent({
      model: 'gemini-embedding-2-preview',
      contents: [{ parts: [{ text }] }],
    });
    // Handle both possible response shapes from different SDK versions
    const embedding = result.embeddings?.[0] || (result as any).embedding;
    return embedding?.values || [];
  } catch (err) {
    console.error('[graphRag] getEmbedding error:', err);
    return [];
  }
}

function cosineSimilarity(v1: number[], v2: number[]): number {
  if (!v1.length || !v2.length || v1.length !== v2.length) return 0;
  let dot = 0;
  let m1 = 0;
  let m2 = 0;
  for (let i = 0; i < v1.length; i++) {
    dot += v1[i] * v2[i];
    m1 += v1[i] * v1[i];
    m2 += v2[i] * v2[i];
  }
  const denom = Math.sqrt(m1) * Math.sqrt(m2);
  return denom === 0 ? 0 : dot / denom;
}

export async function extractEntities(
  storyText: string,
  storyId: string,
  genAI: any
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const empty = { nodes: [], edges: [] };
  try {
    const ai = genAI || new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY || '' });
    // Structured output with JSON schema for guaranteed valid extraction
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: `STORY:\n${storyText.slice(0, 8000)}\n\n${EXTRACT_PROMPT}` }] }],
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: {
          type: 'object',
          properties: {
            nodes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['character', 'location', 'event', 'motif'] },
                  name: { type: 'string' },
                  topic: { type: 'string', enum: ['continuity', 'world_state', 'atmosphere', 'plot_anchor'] },
                  traits: { type: 'array', items: { type: 'string' } }
                },
                required: ['type', 'name', 'topic', 'traits'],
              },
            },
            edges: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  from: { type: 'string' },
                  to: { type: 'string' },
                  relation: { type: 'string' },
                },
                required: ['from', 'to', 'relation'],
              },
            },
          },
          required: ['nodes', 'edges'],
        },
      },
    });

    const raw: string = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!raw.trim()) return empty;

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return empty;
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        return empty;
      }
    }

    const rawNodes: any[] = Array.isArray(parsed?.nodes) ? parsed.nodes : [];
    const rawEdges: any[] = Array.isArray(parsed?.edges) ? parsed.edges : [];

    const nodes: GraphNode[] = await Promise.all(
      rawNodes
        .filter(
          (n) => n && typeof n.name === 'string' && n.topic
        )
        .map(async (n) => {
          const name = String(n.name).trim();
          const traits = Array.isArray(n.traits)
            ? n.traits.filter((t: any) => typeof t === 'string')
            : [];
          // Generate embedding for semantic search
          const embedding = await getEmbedding(`${name}: ${traits.join(', ')}`, ai);
          
          return {
            type: n.type as 'character' | 'location' | 'event' | 'motif',
            name,
            topic: n.topic as 'continuity' | 'world_state' | 'atmosphere' | 'plot_anchor',
            traits,
            storyIds: [storyId],
            embedding,
          };
        })
    );

    const edges: GraphEdge[] = rawEdges
      .filter(
        (e) =>
          e &&
          typeof e.from === 'string' &&
          typeof e.to === 'string' &&
          typeof e.relation === 'string'
      )
      .map((e) => ({
        from: String(e.from).trim(),
        to: String(e.to).trim(),
        relation: String(e.relation).trim(),
      }));

    return { nodes, edges };
  } catch (err: any) {
    console.error('[graphRag] extractEntities error:', err.message);
    return empty;
  }
}

export async function saveGraph(
  uid: string,
  newNodes: GraphNode[],
  newEdges: GraphEdge[],
  _db?: any
): Promise<void> {
  const db = getAdminFirestore();
  const ref = db
    .collection('users')
    .doc(uid)
    .collection('memoryBank')
    .doc('graph');

  const snap = await ref.get();
  const existing: MemoryGraph = snap.exists
    ? (snap.data() as MemoryGraph)
    : { nodes: [], edges: [], updatedAt: '' };

  const nodeMap = new Map<string, GraphNode>(
    existing.nodes.map((n) => [n.name.toLowerCase(), n])
  );

  for (const node of newNodes) {
    const key = node.name.toLowerCase();
    if (nodeMap.has(key)) {
      const existing_node = nodeMap.get(key)!;
      const mergedTraits = Array.from(
        new Set([...existing_node.traits, ...node.traits])
      );
      const mergedStoryIds = Array.from(
        new Set([...existing_node.storyIds, ...node.storyIds])
      );
      nodeMap.set(key, {
        ...existing_node,
        traits: mergedTraits,
        storyIds: mergedStoryIds,
        // Update embedding if new node has one
        embedding: node.embedding || existing_node.embedding,
      });
    } else {
      nodeMap.set(key, node);
    }
  }

  const edgeSet = new Set<string>(
    existing.edges.map((e) => `${e.from}|${e.to}|${e.relation}`)
  );
  const mergedEdges: GraphEdge[] = [...existing.edges];
  for (const edge of newEdges) {
    const key = `${edge.from}|${edge.to}|${edge.relation}`;
    if (!edgeSet.has(key)) {
      edgeSet.add(key);
      mergedEdges.push(edge);
    }
  }

  const merged: MemoryGraph = {
    nodes: Array.from(nodeMap.values()),
    edges: mergedEdges,
    updatedAt: new Date().toISOString(),
  };

  await ref.set(merged);
}

export async function queryGraph(
  uid: string,
  prompt: string,
  genAI?: any
): Promise<string> {
  const ai = genAI || new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY || '' });
  const db = getAdminFirestore();
  const ref = db
    .collection('users')
    .doc(uid)
    .collection('memoryBank')
    .doc('graph');

  const snap = await ref.get();
  if (!snap.exists) return '';

  const graph = snap.data() as MemoryGraph;
  if (!graph.nodes || graph.nodes.length === 0) return '';

  let nodesToUse: GraphNode[] = [];

  if (prompt.trim()) {
    // 1. Semantic Search for better retrieval
    const queryEmbedding = await getEmbedding(prompt, ai);
    if (queryEmbedding.length) {
      const scoredNodes = graph.nodes
        .map(n => ({ 
          node: n, 
          score: n.embedding ? cosineSimilarity(n.embedding, queryEmbedding) : 0 
        }))
        .filter(sn => sn.score > 0.7) // Threshold for relevance
        .sort((a, b) => b.score - a.score);
      
      nodesToUse = scoredNodes.map(sn => sn.node).slice(0, 10);
    } else {
      // Fallback to keyword match if embedding fails
      const lowerPrompt = prompt.toLowerCase();
      nodesToUse = graph.nodes.filter(n => 
        lowerPrompt.includes(n.name.toLowerCase())
      ).slice(0, 5);
    }
  } else {
    nodesToUse = graph.nodes.slice(0, 10);
  }

  if (nodesToUse.length === 0) return '';

  // 2. Neighbor Recall: Pull in related edges and the entities they connect to
  const relevantNames = new Set(nodesToUse.map((n) => n.name.toLowerCase()));
  const neighborEdges = graph.edges.filter(
    (e) =>
      relevantNames.has(e.from.toLowerCase()) ||
      relevantNames.has(e.to.toLowerCase())
  );

  // Add neighbors to nodesToUse if they aren't already there
  for (const edge of neighborEdges) {
    const fromLower = edge.from.toLowerCase();
    const toLower = edge.to.toLowerCase();
    if (!relevantNames.has(fromLower)) {
      const neighbor = graph.nodes.find(n => n.name.toLowerCase() === fromLower);
      if (neighbor) {
        nodesToUse.push(neighbor);
        relevantNames.add(fromLower);
      }
    }
    if (!relevantNames.has(toLower)) {
      const neighbor = graph.nodes.find(n => n.name.toLowerCase() === toLower);
      if (neighbor) {
        nodesToUse.push(neighbor);
        relevantNames.add(toLower);
      }
    }
  }

  const lines: string[] = ['Memory Bank (Graph RAG) Context:'];
  // Group by topic for better presentation to the model
  const byTopic: Record<string, GraphNode[]> = {};
  for (const node of nodesToUse) {
    const topic = node.topic || 'unassigned';
    if (!byTopic[topic]) byTopic[topic] = [];
    byTopic[topic].push(node);
  }

  for (const [topic, nodes] of Object.entries(byTopic)) {
    lines.push(`\n[Topic: ${topic}]`);
    for (const node of nodes) {
      lines.push(`- ${node.name} (${node.type}): ${node.traits.join(', ')}`);
    }
  }

  if (neighborEdges.length > 0) {
    lines.push('\nRelationships:');
    for (const edge of neighborEdges) {
      lines.push(`- ${edge.from} ${edge.relation} ${edge.to}`);
    }
  }

  return lines.join('\n');
}

export async function getRawGraph(uid: string): Promise<MemoryGraph | null> {
  const db = getAdminFirestore();
  const ref = db
    .collection('users')
    .doc(uid)
    .collection('memoryBank')
    .doc('graph');
  const snap = await ref.get();
  return snap.data() as MemoryGraph;
}

export async function extractToGraph(
  storyText: string,
  uid: string,
  genAI?: any
): Promise<void> {
  const ai = genAI || new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY || '' });
  
  const { nodes, edges } = await extractEntities(storyText, `session-${Date.now()}`, ai);
  if (nodes.length > 0) {
    await saveGraph(uid, nodes, edges);
    console.log(`[graphRag] Extracted ${nodes.length} entities to graph for uid ${uid}`);
  }
}
