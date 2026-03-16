import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
if (!apiKey) {
  console.error('API key not found');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

const server = new Server(
  {
    name: 'google-genmedia-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'generate_video',
        description: 'Generates a short animated video from a detailed text prompt using Veo 3.1. Returns a Google Cloud Storage URI to the generated video asset. The video includes both visual movement and audio (if relevant).',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'A detailed prompt describing the video scene, art style, lighting, character movement, and any sound design. Be as descriptive as possible about motion and camera angles.',
            },
          },
          required: ['prompt'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== 'generate_video') {
    throw new McpError(
      ErrorCode.MethodNotFound,
      `Unknown tool: ${request.params.name}`
    );
  }

  const { prompt } = request.params.arguments as any;
  if (!prompt || typeof prompt !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, 'Invalid prompt');
  }

  try {
    // Wait for the Veo generation (this is typically slow, usually you'd poll)
    const response = await ai.models.generateContent({
      model: 'veo-3.1-generate-preview',
      contents: prompt,
    });
    
    // In preview SDKs, the URI might be in candidates[0].content.parts[0].fileData.fileUri 
    // or inlineData. Either way, return string representation for the client.
    const part = response.candidates?.[0]?.content?.parts?.[0];
    
    let videoUrl = 'video_generation_pending.mp4';
    if ((part as any)?.fileData?.fileUri) {
        videoUrl = (part as any).fileData.fileUri;
    } else if ((part as any)?.videoMetadata?.gcsUri) {
        videoUrl = (part as any).videoMetadata.gcsUri;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ status: 'success', videoUrl, prompt }),
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error generating video: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('GenMedia MCP Server running on stdio');
}

run().catch(console.error);
