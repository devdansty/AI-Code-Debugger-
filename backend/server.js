// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const OpenAI = require('openai');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '200kb' }));

const PROVIDER = (process.env.OPENAI_PROVIDER || 'openai').toLowerCase(); // 'openai' | 'groq'
const OPENAI_KEY = process.env.OPENAI_API_KEY || null;
const GROQ_KEY = process.env.GROQ_API_KEY || null;
const PORT = process.env.PORT || 4000;

let openai = null;
let providerUsed = 'mock';

try {
  if (PROVIDER === 'groq' && GROQ_KEY) {
    openai = new OpenAI({
      apiKey: GROQ_KEY,
      baseURL: 'https://api.groq.com/openai/v1' // Groq's OpenAI-compatible base URL
    });
    providerUsed = 'groq';
  } else if (PROVIDER === 'openai' && OPENAI_KEY) {
    openai = new OpenAI({ apiKey: OPENAI_KEY });
    providerUsed = 'openai';
  } else {
    // no key provided for selected provider -> mock
    providerUsed = 'mock';
  }
} catch (e) {
  console.error('Error initializing OpenAI client:', e);
  openai = null;
  providerUsed = 'mock';
}

console.log(`Starting backend — provider=${PROVIDER} (using: ${providerUsed})`);
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString(), provider: providerUsed }));

// prompt builder (same schema)
function buildPrompts(language, code, errorOutput) {
  const system = `
You are an expert software debugger. YOU MUST RESPOND WITH VALID JSON ONLY (no explanations, no markdown).
Return an object with keys:
  - summary: string (1-2 sentences)
  - issues: array of { line: number|null, type: "syntax"|"logic"|"dependency"|"style"|"other", explanation: string }
  - fixes: array of {
       line_range: [startLine,endLine] or null,
       suggested_fix: string (the replacement code snippet - plain text),
       explanation: string,
       patch?: string (OPTIONAL: unified diff/patch text)
    }
  - confidence: "low"|"medium"|"high"
  - tests_to_run: array of strings (short steps)

If line numbers are unknown, use null. Keep strings concise.

EXAMPLE output (JSON only):
{
  "summary":"Fix division by zero in divide function",
  "issues":[{"line":2,"type":"logic","explanation":"No guard for zero denominator"}],
  "fixes":[{"line_range":[1,3],"suggested_fix":"function divide(a,b){ if(b===0) throw new Error('div by zero'); return a/b; }","explanation":"Add guard","patch":"--- a/file.js\\n+++ b/file.js\\n@@ -1,3 +1,4 @@\\n-function divide(a,b){ return a/b }\\n+function divide(a,b){ if(b===0) throw new Error('div by zero'); return a/b }"}],
  "confidence":"high",
  "tests_to_run":["Call divide(4,2) => 2","Call divide(1,0) => throws error"]
}
`;

  const user = `Language: ${language}
Error: ${errorOutput || 'None'}
Code:
\`\`\`
${code}
\`\`\`
Respond ONLY with valid JSON.`;

  return { system, user };
}

function tryParseJSON(text) {
  try {
    return { ok: true, json: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

app.post('/api/debug', async (req, res) => {
  try {
    const { code, language, errorOutput } = req.body || {};
    if (!code || !language) return res.status(400).json({ error: 'code and language required' });

    if (code.length > 100_000) return res.status(413).json({ error: 'code too large' });

    // If no provider client available, return mock for offline dev
    if (!openai) {
      const mock = {
        summary: `Mock analysis for ${language}.`,
        issues: [{ line: 1, type: 'logic', explanation: 'Potential divide by zero.' }],
        fixes: [{
          line_range: [1, 3],
          suggested_fix: `function safeDivide(a,b){ if(b===0) throw new Error('div by zero'); return a/b; }`,
          explanation: 'Add guard for b === 0'
        }],
        confidence: 'medium',
        tests_to_run: ['Call safeDivide(4,2) -> expect 2', 'Call safeDivide(1,0) -> expect error']
      };
      return res.json({ success: true, result: mock, debug: 'mocked (no provider key configured)', provider: providerUsed });
    }

    const { system, user } = buildPrompts(language, code, errorOutput);

    // Primary call (OpenAI-compatible method; works with Groq's OpenAI-compatible endpoint too)
    let first;
    try {
      first = await openai.chat.completions.create({
        model: process.env.MODEL_NAME || (providerUsed === 'groq' ? 'llama3-70b' : 'gpt-4o-mini'),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        temperature: 0.0,
        max_tokens: 900
      });
    } catch (err) {
      console.error('Provider API call failed:', err);
      // Pass provider-specific details back to client for debugging (do not leak secrets)
      const status = err?.status || err?.response?.status || null;
      const body = err?.response?.data || err?.response || null;
      return res.status(500).json({ error: 'Provider API call failed', provider: providerUsed, status, body, message: err.message || String(err) });
    }

    const firstText = first?.choices?.[0]?.message?.content || '';
    let parsed = tryParseJSON(firstText);
    if (parsed.ok) {
      return res.json({ success: true, result: parsed.json, raw: firstText, debug: 'parsed_first', provider: providerUsed });
    }

    // Repair pass: request JSON-only using previous text
    const repairSystem = `You previously responded but the response was not valid JSON. NOW RESPOND WITH VALID JSON ONLY. Use the original schema.`;
    const repairUser = `Previous response:\n\`\`\`\n${firstText}\n\`\`\`\nReturn only valid JSON matching the schema.`;

    let second;
    try {
      second = await openai.chat.completions.create({
        model: process.env.MODEL_NAME || (providerUsed === 'groq' ? 'llama3-70b' : 'gpt-4o-mini'),
        messages: [
          { role: 'system', content: repairSystem },
          { role: 'user', content: repairUser }
        ],
        temperature: 0.0,
        max_tokens: 700
      });
    } catch (err2) {
      console.error('Provider repair call failed:', err2);
      const status = err2?.status || err2?.response?.status || null;
      const body = err2?.response?.data || err2?.response || null;
      return res.status(500).json({ error: 'Provider repair call failed', provider: providerUsed, status, body, message: err2.message || String(err2) });
    }

    const secondText = second?.choices?.[0]?.message?.content || '';
    parsed = tryParseJSON(secondText);
    if (parsed.ok) {
      return res.json({ success: true, result: parsed.json, raw: secondText, debug: 'parsed_second', provider: providerUsed });
    }

    // Unparseable fallback
    return res.json({
      success: true,
      result: null,
      raw_attempts: [firstText, secondText],
      debug: 'unparseable',
      provider: providerUsed
    });
  } catch (err) {
    console.error('Unhandled server error:', err);
    return res.status(500).json({ error: err.message || 'server error', stack: err.stack || null, provider: providerUsed });
  }
});

app.listen(PORT, () => console.log(`Backend listening on http://localhost:${PORT} (provider=${providerUsed})`));
