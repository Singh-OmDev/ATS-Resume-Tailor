const express = require('express');
console.log("!!! SERVER RELOADED - SWITCHED TO GROQ API !!!");
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const { PDFParse } = require('pdf-parse');
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');


dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increase limit for large text/PDFs

// Multer setup for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Initialize Groq
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});



// Routes

// Health check
app.get('/', (req, res) => {
    res.send('AI ATS Resume Tailor API is running (Groq Powered)');
});

// PDF Parse Endpoint
app.post('/api/parse-pdf', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const parser = new PDFParse({ data: req.file.buffer });
        const data = await parser.getText();
        await parser.destroy();

        res.json({ text: data.text });
    } catch (error) {
        console.error('PDF Parse Error:', error);
        res.status(500).json({ error: 'Failed to parse PDF' });
    }
});



// Analyze Endpoint
app.post('/api/analyze', async (req, res) => {
    try {
        const { jobDescription, resumeText } = req.body;

        if (!jobDescription || !resumeText) {
            return res.status(400).json({ error: 'Both Job Description and Resume text are required' });
        }

        const prompt = `
You are an ATS (Applicant Tracking System) and expert resume coach. You will receive:

1) A Job Description (JD)
2) A Candidate Resume

Your tasks:
- Extract a list of important skills, tools, and keywords from the JD.
- Extract current skills, experience, and keywords from the Resume.
- Compare both and find:
  - Matched skills / keywords
  - Missing but important skills / keywords
- Then generate:
  (a) An optimized professional summary for the resume, tailored to the JD (3–5 lines). Write in a natural, human tone. Avoid robotic phrasing, excessive parallelism, or "AI-sounding" patterns. Make it sound like a real person wrote it.
  (b) Rewritten experience bullet points that better match the JD while staying honest. Vary the sentence structure to sound authentic and not like AI-generated text. Do not make them all sound exactly the same structure.
  (c) A list of missing or weakly covered keywords that the candidate should add.
  (d) An ATS score from 0 to 100, based on how well the resume matches the JD.
  (e) 3–5 improvement tips to increase the ATS score.

Return your response STRICTLY in the following JSON format (no markdown, no backticks):

{
  "matchedSkills": ["skill1", "skill2", ...],
  "missingSkills": ["skillA", "skillB", ...],
  "extraKeywords": ["keyword1", "keyword2", ...],
  "optimizedSummary": "text...",
  "optimizedExperienceBullets": ["bullet1", "bullet2", ...],
  "atsScore": 87,
  "improvementTips": ["tip1", "tip2", ...]
}

Job Description:
${jobDescription}

Resume:
${resumeText}
    `;

        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are a helpful AI assistant that analyzes resumes against job descriptions and outputs strict JSON."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.2,
            response_format: { type: "json_object" }
        });

        const text = completion.choices[0]?.message?.content || "{}";

        // Clean up the response to ensure it's valid JSON (just in case)
        const jsonString = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const jsonResponse = JSON.parse(jsonString);

        res.json(jsonResponse);

    } catch (error) {
        console.error('Analysis Error:', error);
        res.status(500).json({ error: 'Failed to analyze resume' });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
