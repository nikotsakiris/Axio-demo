// server.js
// Backend for the AI Judge Demo + Room Chat (Socket.IO), with image evidence support + standardized PDF export

require('dotenv').config();

const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const OpenAI = require('openai');
const PDFDocument = require('pdfkit');
const { PdfReader } = require('pdfreader');   // <-- use pdfreader

// --- NEW: HTTP server + Socket.IO for chat ---
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Create HTTP server and attach Socket.IO
const server = http.createServer(app);
const io = new Server(server);

// Parse JSON bodies (for /api/case-pdf)
app.use(express.json());

// Serve static frontend (index.html, rooms.html, chat.html, judge.html, etc.)
app.use(express.static(__dirname));

// Check for API key
if (!process.env.OPENAI_API_KEY) {
  console.error("ERROR: OPENAI_API_KEY is not set in .env");
  process.exit(1);
}

// Initialize OpenAI client
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Simple helper: detect if extension is an image
function isImageExt(ext) {
  return ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.heic', '.heif'].includes(ext);
}

// Map extension to MIME type for data URLs
function mimeForExt(ext) {
  switch (ext) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.gif': return 'image/gif';
    case '.heic':
    case '.heif': return 'image/heic';
    default: return 'image/jpeg';
  }
}

// Helper to extract text from a PDF buffer using pdfreader
function extractPdfText(buffer) {
  return new Promise((resolve, reject) => {
    let text = '';

    new PdfReader().parseBuffer(buffer, (err, item) => {
      if (err) {
        return reject(err);
      }
      if (!item) {
        // end of file
        return resolve(text);
      }
      if (item.text) {
        // Simple version: just concatenate all text items with spaces
        text += item.text + ' ';
      }
    });
  });
}

// ----------------------------------------------------
// REALTIME CHAT VIA SOCKET.IO
// ----------------------------------------------------
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Join a specific "room" (case/chat room)
  socket.on('joinRoom', (roomId) => {
    if (!roomId) return;
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room ${roomId}`);
  });

  // Receive a chat message and broadcast it to the room
  socket.on('chatMessage', ({ caseId, sender, text }) => {
    if (!caseId || !text) return;

    const payload = {
      sender: sender || 'Anonymous',
      text,
      timestamp: new Date().toISOString()
    };

    // Emit to everyone in that room (including sender)
    io.to(caseId).emit('chatMessage', payload);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// ----------------------------------------------------
//  EXISTING ENDPOINTS BELOW (unchanged)
// ----------------------------------------------------

/**
 * POST /api/judge
 * Accepts: multipart/form-data with "testimony" (text) and "evidence" (files)
 * Returns: structured JSON with chance_bucket, explanation, key_factors, missing_information
 */
app.post('/api/judge', upload.array('evidence'), async (req, res) => {
  const uploadedFiles = req.files || [];

  try {
    const testimony = req.body.testimony || '';

    if (!testimony.trim()) {
      return res.status(400).json({ error: 'Testimony is required.' });
    }

    // --- 1) Summarize evidence and collect image content for the model ---
    const evidenceSummaries = [];
    const imageContentParts = []; // will hold { type: "input_image", image_url: "data:..." }

    for (const file of uploadedFiles) {
      const ext = path.extname(file.originalname).toLowerCase();

      // Image files: convert to base64 data URL and attach as input_image
      if (isImageExt(ext)) {
        try {
          const buffer = await fs.readFile(file.path);
          const b64 = buffer.toString('base64');
          const mime = mimeForExt(ext);

          imageContentParts.push({
            type: "input_image",
            image_url: `data:${mime};base64,${b64}`
          });

          evidenceSummaries.push({
            filename: file.originalname,
            type: 'image',
            note: 'Image evidence included in the prompt.'
          });
        } catch {
          evidenceSummaries.push({
            filename: file.originalname,
            type: 'image',
            note: 'Image was provided but could not be read.'
          });
        }
      } else {
        // Non-image files: just mention them as binary evidence
        evidenceSummaries.push({
          filename: file.originalname,
          type: 'binary',
          note: 'Non-image evidence (e.g., PDF or other file type).'
        });
      }
    }

    // --- 2) Build instructions and payload for the AI ---
    const systemPrompt = `
You are Axio, an AI system that performs structured, deterministic legal-style evaluations of civil and contract-related disputes. You are NOT a lawyer and do NOT give legal advice. You only evaluate the information provided.

EVALUATION PRINCIPLES:
1. Base your conclusions ONLY on facts stated or shown.
2. Apply a consistent decision rubric:
   - clarity of contract or agreement
   - proof of performance or non-performance
   - documentation of promises
   - reliability and completeness of evidence
   - consistency of timeline
   - reasonableness of claims
3. Be conservative; avoid assumptions.
4. Never use numeric probabilities.
5. Classify strength: LOW, MEDIUM, HIGH.
6. Stay neutral.

OUTPUT FORMAT:
strength_bucket: <low | medium | high>

explanation:
- A concise, formal summary.

key_factors:
- Bullet list of facts influencing evaluation.

missing_information:
- Bullet list of missing facts that would affect outcome.

image_observations:
- Bullet list describing what provided images show.

RULES:
- Extract only factual components.
- Note contradictions explicitly.
- Medium when uncertain.
- High only when well-supported.
- Only consider attached documents as evidence, not mentions of evidence in the prompt.
`.trim();

    const userPayload = {
      testimony,
      evidence_summaries: evidenceSummaries
      // Note: images themselves are passed separately as input_image parts
    };

    const userContentParts = [
      {
        type: "input_text",
        text: JSON.stringify(userPayload, null, 2)
      },
      ...imageContentParts
    ];

    console.log('----------------------');
    console.log('Testimony submitted:', JSON.stringify(userPayload, null, 2));
    console.log('Image parts count:', imageContentParts.length);
    console.log('----------------------');

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContentParts }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "CaseAssessment",
          strict: true,
          schema: {
            type: "object",
            properties: {
              chance_bucket: {
                type: "string",
                description: "How strong the user's position appears: 'low', 'medium', or 'high'.",
                enum: ["low", "medium", "high"]
              },
              explanation: {
                type: "string",
                description: "Plain-language explanation of why you chose that bucket."
              },
              key_factors: {
                type: "array",
                items: { type: "string" },
                description: "Key factors that influenced your assessment."
              },
              missing_information: {
                type: "array",
                items: { type: "string" },
                description: "Information that, if known, could significantly change the assessment."
              }
            },
            required: [
              "chance_bucket",
              "explanation",
              "key_factors",
              "missing_information"
            ],
            additionalProperties: false
          }
        }
      }
    });

    const rawText = response.output_text;
    if (!rawText) {
      console.error("No output_text in AI response:", JSON.stringify(response, null, 2));
      return res.status(500).json({ error: "AI response did not contain text output." });
    }

    let result;
    try {
      result = JSON.parse(rawText);
    } catch (e) {
      console.error("Failed to parse JSON from AI response:", rawText);
      return res.status(500).json({ error: "Failed to parse AI JSON output." });
    }

    res.json(result);

  } catch (error) {
    console.error("Error in /api/judge:", error);
    res.status(500).json({ error: "Internal server error." });
  } finally {
    const uploadedFiles = req.files || [];
    for (const file of uploadedFiles) {
      fs.unlink(file.path).catch(() => {});
    }
  }
});

/**
 * POST /api/case-pdf
 * (unchanged)
 */
app.post('/api/case-pdf', (req, res) => {
  try {
    const {
      testimony,
      chance_bucket,
      explanation,
      key_factors = [],
      missing_information = [],
      evidence_files = []
    } = req.body || {};

    if (!testimony || !chance_bucket || !explanation) {
      return res.status(400).json({ error: 'Missing required case data.' });
    }

    const doc = new PDFDocument({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="axio_case_summary.pdf"');

    doc.pipe(res);

    doc
      .fontSize(18)
      .text('Axio – Standardized Party Case Summary', { align: 'center' })
      .moveDown(0.5);

    doc
      .fontSize(10)
      .text(`Generated: ${new Date().toISOString()}`)
      .moveDown(0.3)
      .text(`AI Strength Assessment: ${String(chance_bucket).toUpperCase()}`)
      .moveDown();

    doc
      .fontSize(13)
      .text('1. Party Narrative (as submitted)', { underline: true })
      .moveDown(0.4);

    doc
      .fontSize(10)
      .text(testimony, { align: 'left' })
      .moveDown();

    doc
      .fontSize(13)
      .text('2. AI Assessment (Informational Only)', { underline: true })
      .moveDown(0.4);

    doc
      .fontSize(10)
      .text('Explanation:', { continued: false })
      .moveDown(0.2)
      .text(explanation)
      .moveDown(0.8);

    if (key_factors.length) {
      doc.fontSize(10).text('Key factors considered:').moveDown(0.2);
      key_factors.forEach((f) => {
        doc.text('• ' + f);
      });
      doc.moveDown(0.8);
    }

    if (evidence_files.length) {
      doc
        .fontSize(13)
        .text('3. Evidence Provided (Filenames)', { underline: true })
        .moveDown(0.4);

      doc.fontSize(10);
      evidence_files.forEach((name) => {
        doc.text('• ' + name);
      });
      doc.moveDown();
    }

    doc
      .moveDown()
      .fontSize(8)
      .fillColor('#555555')
      .text(
        'This document summarizes one party’s narrative and an AI-generated, informational assessment. ' +
        'It is not legal advice, does not create a lawyer–client relationship, and is not a formal legal pleading. ' +
        'It is intended to be compared later against the other party’s standardized summary in Axio’s dispute resolution workflow.',
        { align: 'left' }
      );

    doc.end();
  } catch (err) {
    console.error('Error generating PDF:', err);
    res.status(500).json({ error: 'Failed to generate PDF.' });
  }
});

/**
 * POST /api/resolve
 * Accepts: multipart/form-data with:
 *   - partyA (PDF file)
 *   - partyB (PDF file)
 *   - context (text, optional)
 * Returns: {
 *   recommended_outcome: string,
 *   negotiation_strategy: string,
 *   reasoning: string
 * }
 */
app.post(
  '/api/resolve',
  upload.fields([
    { name: 'partyA', maxCount: 1 },
    { name: 'partyB', maxCount: 1 }
  ]),
  async (req, res) => {
    const partyAFiles = (req.files && req.files.partyA) || [];
    const partyBFiles = (req.files && req.files.partyB) || [];
    const context = req.body.context || '';

    try {
      if (!partyAFiles.length || !partyBFiles.length) {
        return res.status(400).json({
          error: 'Both Party A and Party B PDF files are required.'
        });
      }

      const partyABuffer = await fs.readFile(partyAFiles[0].path);
      const partyBBuffer = await fs.readFile(partyBFiles[0].path);

      // Extract text from PDFs using pdfreader
      const partyATextRaw = await extractPdfText(partyABuffer);
      const partyBTextRaw = await extractPdfText(partyBBuffer);

      let partyAText = (partyATextRaw || '').trim();
      let partyBText = (partyBTextRaw || '').trim();

      if (!partyAText || !partyBText) {
        return res.status(400).json({
          error: 'One of the uploaded PDFs appears to have no extractable text.'
        });
      }

      // Truncate to avoid huge contexts
      const MAX_CHARS = 15000;
      if (partyAText.length > MAX_CHARS) partyAText = partyAText.slice(0, MAX_CHARS);
      if (partyBText.length > MAX_CHARS) partyBText = partyBText.slice(0, MAX_CHARS);

      const systemPrompt = `
You are Axio, an AI business dispute resolution consultant for commercial and B2B conflicts.

You receive:
- Party A's case (PDF text)
- Party B's case (PDF text)
- Optional business constraints or goals

Your goals:
1. Propose a concrete, implementable RESOLUTION OUTCOME that:
   - Is as fair as possible given the information
   - Minimizes future conflict
   - Respects business constraints and practicality

2. Design a NEGOTIATION STRATEGY for Party A that:
   - Maximizes the chances Party B will accept
   - Frames the outcome in a way that feels respectful and face-saving
   - Emphasizes long-term relationship value where relevant
   - Avoids legal advice and stays at the level of strategy & structure

Important:
- You are NOT a lawyer and NOT giving legal advice.
- Be explicit about assumptions and uncertainties.
- Write in clear business language, not legalese.
- Never output numeric probabilities of winning in court.

Respond in VALID JSON with EXACTLY the following keys:
{
  "recommended_outcome": "string - detailed description of the proposed resolution terms",
  "negotiation_strategy": "string - step-by-step strategy Party A should follow when negotiating with Party B",
  "reasoning": "string - concise explanation of tradeoffs and why this is fair / likely acceptable"
}
`.trim();

      const userText = `
PARTY A CASE (text extracted from PDF):
${partyAText}

PARTY B CASE (text extracted from PDF):
${partyBText}

CONTEXT / CONSTRAINTS (if any):
${context.trim() || 'None provided.'}
`.trim();

      const response = await client.responses.create({
        model: 'gpt-4.1-mini',
        input: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: userText
              }
            ]
          }
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'ResolutionRecommendation',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                recommended_outcome: {
                  type: 'string',
                  description: 'Detailed description of the proposed resolution terms.'
                },
                negotiation_strategy: {
                  type: 'string',
                  description: 'Step-by-step strategy Party A should follow when negotiating with Party B.'
                },
                reasoning: {
                  type: 'string',
                  description: 'Concise explanation of tradeoffs and why this outcome is fair / likely acceptable.'
                }
              },
              required: ['recommended_outcome', 'negotiation_strategy', 'reasoning'],
              additionalProperties: false
            }
          }
        }
      });

      const rawText = response.output_text;
      if (!rawText) {
        console.error('No output_text in AI response for /api/resolve:', JSON.stringify(response, null, 2));
        return res.status(500).json({ error: 'AI response did not contain text output.' });
      }

      let result;
      try {
        result = JSON.parse(rawText);
      } catch (e) {
        console.error('Failed to parse JSON from AI response (/api/resolve):', rawText);
        result = {
          recommended_outcome: rawText,
          negotiation_strategy: '',
          reasoning: ''
        };
      }

      const {
        recommended_outcome = '',
        negotiation_strategy = '',
        reasoning = ''
      } = result;

      return res.json({
        recommended_outcome,
        negotiation_strategy,
        reasoning
      });
    } catch (error) {
      console.error('Error in /api/resolve:', error);
      return res.status(500).json({ error: 'Internal server error.' });
    } finally {
      const allFiles = [
        ...partyAFiles,
        ...partyBFiles
      ];
      for (const f of allFiles) {
        fs.unlink(f.path).catch(() => {});
      }
    }
  }
);

// ----------------------------------------------------
// START SERVER (HTTP + Socket.IO)
// ----------------------------------------------------
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Axio server listening on http://localhost:${PORT}`);
});
