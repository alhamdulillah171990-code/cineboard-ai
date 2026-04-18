import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import { executeWithSystem } from "./src/lib/requestSystem.js";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // AI Service Lazy Initialization
  let ai: GoogleGenAI | null = null;
  const getAI = () => {
    if (!ai) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY environment variable is required");
      }
      ai = new GoogleGenAI({ apiKey: apiKey });
    }
    return ai;
  };

  // API Logging Middleware
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  // AI Endpoint Proxy
  app.post("/api/ai/generate", async (req, res) => {
    try {
      const { prompt, schema, config, cacheKey, fallbackOptions } = req.body;

      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      console.log(`[AI Backend] Generating content for prompt: ${prompt.substring(0, 50)}...`);

      const result = await executeWithSystem(async () => {
        const aiInstance = getAI();
        
        const response = await aiInstance.models.generateContent({
          model: config?.model || "gemini-3.1-pro-preview",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: schema
          }
        });

        const text = response.text;
        if (!text) throw new Error("No text returned from AI");
        return JSON.parse(text);
      }, { cacheKey, fallback: fallbackOptions });

      res.json(result);
    } catch (error: any) {
      console.error("[AI Backend Error]:", error);
      res.status(error.status || 500).json({ 
        error: error.message || "Internal Server Error",
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });

  // Image Generation Endpoint
  app.post("/api/ai/image", async (req, res) => {
    try {
      const { prompt, aspectRatio, cacheKey } = req.body;

      console.log(`[AI Backend] Generating image for prompt: ${prompt.substring(0, 50)}...`);

      const result = await executeWithSystem(async () => {
        const aiInstance = getAI();
        
        const response = await aiInstance.models.generateContent({
          model: "gemini-2.5-flash-image",
          contents: prompt,
          config: {
            imageConfig: {
              aspectRatio: aspectRatio || "16:9"
            }
          }
        });

        // Search for inlineData in parts
        for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) {
            return `data:image/png;base64,${part.inlineData.data}`;
          }
        }
        throw new Error("No image data returned from AI");
      }, { cacheKey });

      res.json({ imageUrl: result });
    } catch (error: any) {
      console.error("[AI Image Error]:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
    console.log(`Mode: ${process.env.NODE_ENV || 'development'}`);
  });
}

startServer();
