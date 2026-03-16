import { GoogleGenAI, Modality } from '@google/genai';

/**
 * Story session ID -> Chat session for consistent image generation
 */
const imageChatSessions = new Map<string, { chat: any; lastUsed: number }>();

/**
 * TTL for cleanup: 5 minutes of inactivity
 */
const SESSION_TTL = 5 * 60 * 1000;

/**
 * Cleanup inactive sessions to prevent memory leaks
 */
function cleanupSessions() {
  const now = Date.now();
  for (const [sessionId, session] of imageChatSessions.entries()) {
    if (now - session.lastUsed > SESSION_TTL) {
      console.log(`[ImageChat] Cleaning up expired session: ${sessionId}`);
      imageChatSessions.delete(sessionId);
    }
  }
}

// Run cleanup every minute
setInterval(cleanupSessions, 60 * 1000);

/**
 * Get or create a chat session for image generation.
 */
export async function getOrCreateImageChat(ai: any, sessionId: string, characterSheet?: string) {
  let session = imageChatSessions.get(sessionId);

  if (!session) {
    console.log(`[ImageChat] Creating new session for story: ${sessionId}`);
    const chat = ai.chats.create({
      model: 'gemini-3.1-flash-image-preview',
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
        imageConfig: { aspectRatio: '16:9', imageSize: '1K' },
      },
    });

    // Send the character sheet as initial context if provided
    if (characterSheet) {
      console.log('[ImageChat] Sending character sheet to establish visual context');
      try {
        await chat.sendMessage(`CHARACTER SHEET:\n${characterSheet}\n\nUse these character descriptions and art style for all images in this chat.`);
      } catch (err: any) {
        console.warn('[ImageChat] Failed to send character sheet:', err.message);
      }
    }

    session = { chat, lastUsed: Date.now() };
    imageChatSessions.set(sessionId, session);
  } else {
    session.lastUsed = Date.now();
  }

  return session.chat;
}

/**
 * Generate an image within an existing chat session for consistency
 */
export async function generateImageInChat(chat: any, prompt: string) {
  try {
    const response = await chat.sendMessage(prompt + ' Do not include any text, watermarks, logos, UI elements, or written words in the image.');

    // SDK returns response.candidates directly (not response.response.candidates)
    const candidates = response.candidates || response.response?.candidates;
    const part = candidates?.[0]?.content?.parts?.find(
      (p: any) => p.inlineData
    );

    if (part?.inlineData) {
      return {
        status: 'success',
        imageDataUri: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
        mimeType: part.inlineData.mimeType,
      };
    }
    return null;
  } catch (err: any) {
    console.warn('[ImageChat] generateImageInChat error:', err.message);
    return null;
  }
}
