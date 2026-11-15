require("dotenv").config();
const express = require("express");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const GROQ_URL = "https://api.groq.com/openai/v1";
const DEFAULT_MODEL = "openai/gpt-oss-20b";
const ALLOWED_MODELS = [
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "qwen/qwen3.8-27b"
];

const SYSTEM_PROMPT = `
You are NOVA AI, a helpful, intelligent and friendly AI assistant.
Your name is NOVA AI. You were created by Ayush. If asked who created you,
say "Mujhe Ayush ne banaya hai." or "I was created by Ayush."
Never claim someone else created you. Respond in the user's language.
Be accurate, clear, natural, and say when you are unsure.
`;

const getGroqKey = () => process.env.GROQ_API_KEY;

function cleanMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter(m => m && ["user", "assistant"].includes(m.role) &&
      typeof m.content === "string")
    .slice(-20)
    .map(m => ({ role: m.role, content: m.content.slice(0, 20000) }));
}

function selectedModel(value) {
  return ALLOWED_MODELS.includes(value) ? value : DEFAULT_MODEL;
}

function errorMessage(data, fallback) {
  return data?.error?.message || fallback;
}

async function groqChat({ messages, model, stream = false, signal, temperature = 0.7, maxTokens = 2048 }) {
  const key = getGroqKey();
  if (!key) throw new Error("Groq API key is missing in .env");
  return fetch(`${GROQ_URL}/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: selectedModel(model),
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      temperature,
      max_completion_tokens: maxTokens,
      stream
    })
  });
}

// Status
app.get("/api/status", (req, res) => {
  res.json({
    project: "NOVA AI",
    status: "Working",
    creator: "Ayush",
    features: ["Chat", "Streaming", "Model Selection", "Image Generation",
      "Automatic Visual Replies", "Video Generation", "Voice", "History"]
  });
});

// Models
app.get("/api/models", async (req, res) => {
  try {
    if (!getGroqKey()) return res.status(500).json({ error: "Groq API key is missing in .env" });
    const response = await fetch(`${GROQ_URL}/models`, {
      headers: { Authorization: `Bearer ${getGroqKey()}` }
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({
      error: errorMessage(data, "Could not load models")
    });

    const models = (data.data || [])
      .filter(m => m.active !== false && ALLOWED_MODELS.includes(m.id))
      .map(m => ({
        id: m.id,
        name: m.id === "openai/gpt-oss-20b" ? "GPT OSS 20B" :
          m.id === "openai/gpt-oss-120b" ? "GPT OSS 120B" : "Qwen 3.8 27B"
      }));
    res.json({ models, defaultModel: DEFAULT_MODEL });
  } catch (error) {
    console.error("Models error:", error);
    res.status(500).json({ error: error.message || "Could not load models" });
  }
});

// Non-streaming compatibility route
app.post("/api/chat", async (req, res) => {
  try {
    const messages = cleanMessages(req.body.messages);
    if (!messages.length) return res.status(400).json({ error: "Invalid messages" });
    const response = await groqChat({ messages, model: req.body.model });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({
      error: errorMessage(data, "Groq API request failed")
    });
    const reply = data.choices?.[0]?.message?.content;
    if (!reply) return res.status(502).json({ error: "NOVA could not generate a reply" });
    res.json({ reply });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ error: error.message || "Something went wrong with NOVA chat" });
  }
});

// Streaming chat
app.post("/api/chat/stream", async (req, res) => {
  const controller = new AbortController();
  let disconnected = false;
  res.on("close", () => {
    if (!res.writableEnded) {
      disconnected = true;
      controller.abort();
    }
  });

  try {
    const messages = cleanMessages(req.body.messages);
    if (!messages.length) return res.status(400).json({ error: "Invalid messages" });

    const upstream = await groqChat({
      messages, model: req.body.model, stream: true, signal: controller.signal
    });
    if (!upstream.ok) {
      const data = await upstream.json().catch(() => ({}));
      return res.status(upstream.status).json({
        error: errorMessage(data, "Groq streaming request failed")
      });
    }
    if (!upstream.body) return res.status(502).json({ error: "No streaming response received" });

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (!disconnected) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") {
            res.write("data: [DONE]\n\n");
            continue;
          }
          try {
            const parsed = JSON.parse(payload);
            const content = parsed.choices?.[0]?.delta?.content;
            if (typeof content === "string" && content) {
              res.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
          } catch { /* Ignore incomplete SSE fragments. */ }
        }
      }
    } finally {
      try { reader.releaseLock(); } catch {}
    }
    if (!disconnected && !res.writableEnded) {
      res.write("data: [DONE]\n\n");
      res.end();
    }
  } catch (error) {
    if (error.name === "AbortError" || disconnected) return;
    console.error("Streaming error:", error);
    if (!res.headersSent) return res.status(500).json({ error: error.message || "NOVA streaming failed" });
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: "NOVA streaming failed" })}\n\n`);
      res.end();
    }
  }
});

// Decide whether a normal answer would genuinely benefit from an image.
// The browser calls this after the text reply; failures never break chat.
app.post("/api/visual-decision", async (req, res) => {
  try {
    const question = typeof req.body.question === "string" ? req.body.question.trim() : "";
    const answer = typeof req.body.answer === "string" ? req.body.answer.trim() : "";
    if (!question || !answer) return res.status(400).json({ shouldGenerate: false });
    if (question.length > 3000 || answer.length > 7000) {
      return res.status(400).json({ shouldGenerate: false });
    }
    const key = getGroqKey();
    if (!key) return res.json({ shouldGenerate: false });

    const response = await fetch(`${GROQ_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        temperature: 0,
        max_completion_tokens: 120,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Decide if the user would benefit from seeing a generated illustrative image in addition to the text answer. Generate only for visual requests or topics where a picture/diagram/scene materially helps (for example: "show me a solar system", "what does a neuron look like", a visual design concept). Do NOT generate for ordinary factual questions, coding, calculations, writing, advice, or when an image is unnecessary. Return ONLY JSON: {"shouldGenerate":true|false,"prompt":"short safe image prompt or empty string"}. If true, create a concise image prompt describing a useful educational/illustrative visual.`
          },
          {
            role: "user",
            content: `Question: ${question}\nAnswer: ${answer}`
          }
        ]
      })
    });
    const data = await response.json();
    if (!response.ok) return res.json({ shouldGenerate: false });
    const raw = data.choices?.[0]?.message?.content || "{}";
    let decision;
    try { decision = JSON.parse(raw); } catch { decision = {}; }
    const shouldGenerate = decision.shouldGenerate === true &&
      typeof decision.prompt === "string" && decision.prompt.trim().length > 0;
    res.json({
      shouldGenerate,
      prompt: shouldGenerate ? decision.prompt.trim().slice(0, 1200) : ""
    });
  } catch (error) {
    console.error("Visual decision error:", error);
    res.json({ shouldGenerate: false });
  }
});

// Cloudflare Flux image generation
app.post("/api/image", async (req, res) => {
  try {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    if (!accountId || !apiToken) {
      return res.status(500).json({ error: "Cloudflare credentials are missing in .env" });
    }
    const prompt = req.body.prompt;
    if (typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: "Please enter an image description" });
    }
    if (prompt.length > 2048) {
      return res.status(400).json({ error: "Image prompt must be 2048 characters or less" });
    }

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ prompt: prompt.trim(), steps: 4 })
      }
    );
    const data = await response.json();
    if (!response.ok || !data.success) {
      console.error("Cloudflare image error:", data);
      return res.status(502).json({
        error: data.errors?.[0]?.message || "Image generation failed. Please try again."
      });
    }
    if (!data.result?.image) return res.status(502).json({ error: "Cloudflare did not return an image" });
    res.json({ image: `data:image/jpeg;base64,${data.result.image}` });
  } catch (error) {
    console.error("Image generation error:", error);
    res.status(500).json({ error: "Could not generate image. Please try again." });
  }
});

// FAL AI video generation
const FAL_MODEL = "fal-ai/wan/v2.7/text-to-video";
async function getFalClient() {
  if (!process.env.FAL_KEY) throw new Error("FAL_KEY is missing in .env");
  const { fal } = await import("@fal-ai/client");
  fal.config({ credentials: process.env.FAL_KEY });
  return fal;
}

app.post("/api/video", async (req, res) => {
  try {
    if (process.env.FAL_VIDEO_ENABLED !== "true") {
      return res.status(403).json({ error: "Video generation is currently disabled." });
    }
    const prompt = req.body.prompt;
    if (typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: "Please enter a video description." });
    }
    if (prompt.length > 5000) return res.status(400).json({ error: "Video prompt must be 5000 characters or less." });
    const fal = await getFalClient();
    const result = await fal.queue.submit(FAL_MODEL, {
      input: {
        prompt: prompt.trim(),
        aspect_ratio: "16:9",
        resolution: "720p",
        duration: 5,
        enable_safety_checker: true
      }
    });
    res.status(202).json({ requestId: result.request_id, status: "IN_QUEUE" });
  } catch (error) {
    console.error("Fal video submission error:", error);
    res.status(500).json({ error: error.message || "Could not submit video generation request." });
  }
});

app.get("/api/video/:requestId", async (req, res) => {
  try {
    if (process.env.FAL_VIDEO_ENABLED !== "true") {
      return res.status(403).json({ error: "Video generation is currently disabled." });
    }
    const requestId = req.params.requestId;
    if (!/^[a-zA-Z0-9-]{10,100}$/.test(requestId)) {
      return res.status(400).json({ error: "Invalid video request ID." });
    }
    const fal = await getFalClient();
    const status = await fal.queue.status(FAL_MODEL, { requestId, logs: false });
    if (status.status === "COMPLETED") {
      const result = await fal.queue.result(FAL_MODEL, { requestId });
      const videoUrl = result.data?.video?.url;
      if (!videoUrl) return res.status(502).json({ error: "Video completed but no URL was returned." });
      return res.json({ status: "COMPLETED", video: videoUrl });
    }
    if (status.status === "FAILED") {
      return res.status(502).json({ status: "FAILED", error: "Video generation failed. Please try another prompt." });
    }
    res.json({ status: status.status || "IN_PROGRESS" });
  } catch (error) {
    console.error("Fal video status error:", error);
    res.status(500).json({ error: "Could not check video generation status." });
  }
});

app.use("/api", (req, res) => res.status(404).json({ error: "API route not found" }));
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => console.log(`NOVA AI running at http://localhost:${PORT}`));
