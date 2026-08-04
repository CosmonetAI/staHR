import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js'
import pdfParse from 'npm:pdf-parse'
import mammoth from 'npm:mammoth'

const SUPABASE_URL = Deno.env.get('PROJECT_SUPABASE_URL') || Deno.env.get('SUPABASE_URL') || Deno.env.get('VITE_SUPABASE_URL')
const SUPABASE_ANON_KEY = Deno.env.get('PROJECT_SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('VITE_SUPABASE_ANON_KEY')
const SUPABASE_SERVICE_ROLE = Deno.env.get('PROJECT_SUPABASE_SERVICE_ROLE') || Deno.env.get('SUPABASE_SERVICE_ROLE') || Deno.env.get('VITE_SUPABASE_SERVICE_ROLE')

let sb: any = null
let sbAdmin: any = null
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  sb = createClient(String(SUPABASE_URL), String(SUPABASE_ANON_KEY))
} else {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables')
}
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE) {
  try {
    sbAdmin = createClient(String(SUPABASE_URL), String(SUPABASE_SERVICE_ROLE))
  } catch (e) {
    console.warn('Failed to create admin Supabase client', e)
    sbAdmin = null
  }
}

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || Deno.env.get('OPENAI_KEY')
const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL') || 'gpt-4.1'

const corsHeaders = (origin: string) => ({
  'Access-Control-Allow-Origin': origin || '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-api-key, x-apikey',
  'Access-Control-Allow-Credentials': 'true'
})

function extractExt(name: string) {
  const m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/)
  return m ? m[1] : ''
}

serve(async (req) => {
  const origin = req.headers.get('origin') || '*'
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }

  if (!sb) return new Response(JSON.stringify({ error: 'Server misconfiguration: missing SUPABASE_URL or SUPABASE_ANON_KEY' }), { status: 500, headers: corsHeaders(origin) })

  try {
    // Expect multipart form with file field 'file'
    if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders(origin) })

    const contentType = req.headers.get('content-type') || ''
    if (!contentType.includes('form-data') && !contentType.includes('multipart')) {
      return new Response(JSON.stringify({ error: 'Expected multipart/form-data' }), { status: 400, headers: corsHeaders(origin) })
    }

    const form = await req.formData()
    const file = form.get('file') as any
    if (!file) return new Response(JSON.stringify({ error: 'Missing file field' }), { status: 400, headers: corsHeaders(origin) })

    const filename = file.name || 'upload'
    const ext = extractExt(filename)
    const buf = await file.arrayBuffer()
    let text = ''

    if (ext === 'pdf') {
      try {
        const data = await pdfParse(Buffer.from(buf))
        text = data.text || ''
      } catch (e) {
        console.error('pdf parse error', e)
        return new Response(JSON.stringify({ error: 'Failed to parse PDF' }), { status: 500, headers: corsHeaders(origin) })
      }
    } else if (ext === 'docx') {
      try {
        const r = await mammoth.extractRawText({ buffer: buf })
        text = r?.value || ''
      } catch (e) {
        console.error('docx parse error', e)
        return new Response(JSON.stringify({ error: 'Failed to parse DOCX' }), { status: 500, headers: corsHeaders(origin) })
      }
    } else if (ext === 'txt') {
      try {
        text = new TextDecoder().decode(buf)
      } catch (e) {
        console.error('txt decode error', e)
        return new Response(JSON.stringify({ error: 'Failed to read text file' }), { status: 500, headers: corsHeaders(origin) })
      }
    } else if (ext === 'doc') {
      return new Response(JSON.stringify({ error: 'Legacy .doc files are not supported. Please save as .docx or PDF' }), { status: 400, headers: corsHeaders(origin) })
    } else {
      return new Response(JSON.stringify({ error: 'Unsupported file type' }), { status: 400, headers: corsHeaders(origin) })
    }

    // Trim and sanity check
    text = String(text || '').trim()
    if (!text) return new Response(JSON.stringify({ error: 'Extracted text is empty' }), { status: 400, headers: corsHeaders(origin) })

    if (!OPENAI_API_KEY) return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), { status: 500, headers: corsHeaders(origin) })

    const systemPrompt = `You are a JSON generator. Given a job description text, extract the requested fields and output STRICT JSON only, with keys exactly as specified. Do not output any additional text, commentary, or markdown. The JSON schema is:
{
  "jobTitle": "",
  "department": "",
  "experience": { "minimum": 0, "maximum": 0 },
  "employmentType": "",
  "workMode": "",
  "location": "",
  "numberOfPositions": 1,
  "budget": { "minimum": "", "maximum": "", "currency": "INR" },
  "noticePeriod": "",
  "primarySkills": [],
  "secondarySkills": [],
  "responsibilities": [],
  "qualifications": [],
  "preferredSkills": [],
  "tools": [],
  "certifications": [],
  "education": "",
  "industry": "",
  "summary": "",
  "jobDescription": ""
}

Rules:
- Return valid JSON only. If a field is not present, use empty string, empty array, or reasonable default as in the schema.
- Experience numbers should be integers (years) when extractable, otherwise 0 or null.
- numberOfPositions should be an integer >=1.
`

    const userPrompt = `Extract structured data from the following job description. Return STRICT JSON only (no commentary):\n\n${text}`

    const body = {
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0
    }

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify(body)
    })

    if (!openaiRes.ok) {
      const t = await openaiRes.text().catch(() => '')
      console.error('OpenAI error', openaiRes.status, t)
      return new Response(JSON.stringify({ error: 'OpenAI API error' }), { status: 500, headers: corsHeaders(origin) })
    }

    const openaiJson = await openaiRes.json()
    const content = openaiJson?.choices?.[0]?.message?.content || openaiJson?.choices?.[0]?.text || ''

    // Try to parse the returned JSON. Allow for some wrappers by finding first/last braces
    let parsed: any = null
    try {
      parsed = JSON.parse(content)
    } catch (e) {
      // attempt to extract JSON substring
      const first = content.indexOf('{')
      const last = content.lastIndexOf('}')
      if (first !== -1 && last !== -1 && last > first) {
        try {
          parsed = JSON.parse(content.slice(first, last + 1))
        } catch (e2) {
          console.error('Failed to parse JSON from model output', e2)
        }
      }
    }

    if (!parsed) {
      console.error('Model returned non-JSON', content)
      return new Response(JSON.stringify({ error: 'Model did not return valid JSON' }), { status: 500, headers: corsHeaders(origin) })
    }

    // Ensure minimal shape and defaults
    const ensureArray = (v: any) => Array.isArray(v) ? v : (v ? String(v).split(/[\n,]+/).map((s: string) => s.trim()).filter(Boolean) : [])
    const out = {
      jobTitle: parsed.jobTitle || parsed.title || '',
      department: parsed.department || '',
      experience: {
        minimum: typeof parsed.experience?.minimum === 'number' ? parsed.experience.minimum : (parsed.experience?.min || 0),
        maximum: typeof parsed.experience?.maximum === 'number' ? parsed.experience.maximum : (parsed.experience?.max || 0)
      },
      employmentType: parsed.employmentType || parsed.employment_type || parsed.employment || '',
      workMode: parsed.workMode || parsed.work_mode || '',
      location: parsed.location || '',
      numberOfPositions: typeof parsed.numberOfPositions === 'number' ? parsed.numberOfPositions : (parsed.number_of_positions ? Number(parsed.number_of_positions) : 1),
      budget: parsed.budget || { minimum: '', maximum: '', currency: 'INR' },
      noticePeriod: parsed.noticePeriod || '',
      primarySkills: ensureArray(parsed.primarySkills || parsed.primary_skills || parsed.primary || parsed.skills),
      secondarySkills: ensureArray(parsed.secondarySkills || parsed.secondary_skills || []),
      responsibilities: ensureArray(parsed.responsibilities || []),
      qualifications: ensureArray(parsed.qualifications || []),
      preferredSkills: ensureArray(parsed.preferredSkills || parsed.preferred_skills || []),
      tools: ensureArray(parsed.tools || []),
      certifications: ensureArray(parsed.certifications || []),
      education: parsed.education || '',
      industry: parsed.industry || '',
      summary: parsed.summary || '',
      jobDescription: parsed.jobDescription || parsed.job_description || ''
    }

    return new Response(JSON.stringify(out), { status: 200, headers: corsHeaders(origin) })

  } catch (err) {
    console.error('parse-job-description error', err)
    const origin = req.headers.get('origin') || '*'
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: corsHeaders(origin) })
  }
})
