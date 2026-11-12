#!/usr/bin/env node
const readline = require("readline");
const fs = require("fs");
const path = require("path");

const rl = readline.createInterface({ input: process.stdin });
const send = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");

rl.on("line", async (line) => {
  if (!line.trim()) return;
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    return;
  }

  if (req.id === undefined || req.id === null) return;

  if (req.method === "initialize") {
    return send({
      jsonrpc: "2.0",
      id: req.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "stable-diffusion", version: "1.0.0" },
      },
    });
  }

  if (req.method === "tools/list") {
    return send({
      jsonrpc: "2.0",
      id: req.id,
      result: {
        tools: [
          {
            name: "generate_image",
            description: "Generate an image from a text prompt using local Stable Diffusion. Always output the returned markdown image link verbatim to the user.",
            inputSchema: {
              type: "object",
              properties: {
                prompt: { type: "string", description: "Detailed image description" },
              },
              required: ["prompt"],
            },
          },
        ],
      },
    });
  }

  if (req.method === "tools/call" && req.params?.name === "generate_image") {
    try {
      const res = await fetch("http://stable-diffusion-vulkan:1234/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "DreamShaper8_LCM.safetensors",
          prompt: req.params.arguments?.prompt || "a scenic landscape",
          n: 1,
          size: "512x512",
          response_format: "b64_json",
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText}`);
      }
      const json = await res.json();
      const b64 = json.data && json.data[0] && json.data[0].b64_json;
      if (!b64) {
        throw new Error("Unexpected SD response: " + JSON.stringify(json).slice(0, 300));
      }

      const file = `sd-${Date.now()}.png`;
      fs.writeFileSync(path.join("/app/client/public/images", file), Buffer.from(b64, "base64"));

      return send({
        jsonrpc: "2.0",
        id: req.id,
        result: {
          content: [
            { type: "image", data: b64, mimeType: "image/png" },
            { type: "text", text: `Image generated. Output this exact Markdown image tag so the user sees it:\n![Generated Image](/images/${file})` },
          ],
        },
      });
    } catch (err) {
      return send({
        jsonrpc: "2.0",
        id: req.id,
        result: { isError: true, content: [{ type: "text", text: String(err) }] },
      });
    }
  }

  return send({
    jsonrpc: "2.0",
    id: req.id,
    error: { code: -32601, message: `Method not found: ${req.method}` },
  });
});
