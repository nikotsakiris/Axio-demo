// server.js
// Backend for the AI Judge Demo, with image evidence support + standardized PDF export

require('dotenv').config();

const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const OpenAI = require('openai');
const PDFDocument = require('pdfkit');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Parse JSON bodies (for /api/case-pdf)
app.use(express.json());

// Serve static frontend (index.html, judge.html, etc.)
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

    // Build the `content` for the user message:
    //  - First: a text block describing testimony + evidence
    //  - Then: one input_image block per uploaded image (if any)
    const userContentParts = [
      {
        type: "input_text",
        text: JSON.stringify(userPayload, null, 2)
      },
      ...imageContentParts
    ];

    // --- 3) Call OpenAI Responses API with JSON schema output ---
    console.log('----------------------');
    console.log('Testimony submitted:', JSON.stringify(userPayload, null, 2));
    console.log('Image parts count:', imageContentParts.length);
    console.log('----------------------');

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: userContentParts
        }
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

    // The structured JSON is returned as text in response.output_text
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
    // Clean up uploaded files
    const uploadedFiles = req.files || [];
    for (const file of uploadedFiles) {
      fs.unlink(file.path).catch(() => {});
    }
  }
});

/**
 * POST /api/case-pdf
 * Accepts JSON:
 * {
 *   testimony: string,
 *   chance_bucket: "low" | "medium" | "high",
 *   explanation: string,
 *   key_factors: string[],
 *   missing_information: string[],
 *   evidence_files: string[]
 * }
 * Returns: application/pdf stream
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

    // Title
    doc
      .fontSize(18)
      .text('Axio – Standardized Party Case Summary', { align: 'center' })
      .moveDown(0.5);

    // Meta
    doc
      .fontSize(10)
      .text(`Generated: ${new Date().toISOString()}`)
      .moveDown(0.3)
      .text(`AI Strength Assessment: ${String(chance_bucket).toUpperCase()}`)
      .moveDown();

    // Section 1 – Party narrative
    doc
      .fontSize(13)
      .text('1. Party Narrative (as submitted)', { underline: true })
      .moveDown(0.4);

    doc
      .fontSize(10)
      .text(testimony, { align: 'left' })
      .moveDown();

    // Section 2 – AI assessment (informational only)
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

    // Section 3 – Evidence filenames
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

    // Footer / disclaimer
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

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI Mediator server running at http://localhost:${PORT}`);
});
