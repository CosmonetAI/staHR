
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL =
  Deno.env.get("PROJECT_SUPABASE_URL") ||
  Deno.env.get("SUPABASE_URL") ||
  Deno.env.get("VITE_SUPABASE_URL");

const SUPABASE_ANON_KEY =
  Deno.env.get("PROJECT_SUPABASE_ANON_KEY") ||
  Deno.env.get("SUPABASE_ANON_KEY") ||
  Deno.env.get("VITE_SUPABASE_ANON_KEY");

const SUPABASE_SERVICE_ROLE =
  Deno.env.get("PROJECT_SUPABASE_SERVICE_ROLE") ||
  Deno.env.get("SUPABASE_SERVICE_ROLE") ||
  Deno.env.get("VITE_SUPABASE_SERVICE_ROLE");

const OPENAI_API_KEY =
  Deno.env.get("OPENAI_API_KEY") ||
  Deno.env.get("OPENAI_KEY");

const OPENAI_MODEL =
  Deno.env.get("OPENAI_MODEL") || "gpt-4.1";

const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin || "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, apikey, x-api-key, x-apikey",
  "Access-Control-Allow-Credentials": "true",
  "Content-Type": "application/json",
});

let sb: any = null;
let sbAdmin: any = null;

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  sb = createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );
}

if (SUPABASE_URL && SUPABASE_SERVICE_ROLE) {
  try {
    sbAdmin = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE
    );
  } catch (error) {
    console.warn(
      "Failed to create admin Supabase client:",
      error
    );
  }
}

function jsonResponse(
  data: unknown,
  status: number,
  origin: string
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: corsHeaders(origin),
    }
  );
}

function ensureArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  if (value === null || value === undefined) {
    return [];
  }

  return String(value)
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function ensureNumber(
  value: unknown,
  defaultValue = 0
): number {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return Math.round(value);
  }

  if (
    typeof value === "string" &&
    value.trim() !== ""
  ) {
    const parsed = Number(
      value.replace(/[^\d.-]/g, "")
    );

    if (Number.isFinite(parsed)) {
      return Math.round(parsed);
    }
  }

  return defaultValue;
}

function extractJson(content: string): any | null {
  if (!content) {
    return null;
  }

  // Remove markdown code fences if the model returned them.
  let cleaned = content
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  // First attempt: direct JSON parsing.
  try {
    return JSON.parse(cleaned);
  } catch {
    // Continue with extraction.
  }

  // Find the first JSON object.
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (
    firstBrace !== -1 &&
    lastBrace !== -1 &&
    lastBrace > firstBrace
  ) {
    const jsonString = cleaned.slice(
      firstBrace,
      lastBrace + 1
    );

    try {
      return JSON.parse(jsonString);
    } catch (error) {
      console.error(
        "Unable to parse extracted JSON:",
        error
      );
    }
  }

  return null;
}

function normalizeJobData(parsed: any) {
  const experience =
    parsed?.experience || {};

  const budget =
    parsed?.budget || {};

  const numberOfPositions =
    ensureNumber(
      parsed?.numberOfPositions ??
        parsed?.number_of_positions,
      1
    );

  return {
    jobTitle:
      parsed?.jobTitle ||
      parsed?.title ||
      "",

    department:
      parsed?.department || "",

    experience: {
      minimum: ensureNumber(
        experience?.minimum ??
          experience?.min,
        0
      ),

      maximum: ensureNumber(
        experience?.maximum ??
          experience?.max,
        0
      ),
    },

    employmentType:
      parsed?.employmentType ||
      parsed?.employment_type ||
      parsed?.employment ||
      "",

    workMode:
      parsed?.workMode ||
      parsed?.work_mode ||
      "",

    location:
      parsed?.location || "",

    numberOfPositions:
      Math.max(1, numberOfPositions),

    budget: {
      minimum:
        budget?.minimum ??
        budget?.min ??
        "",

      maximum:
        budget?.maximum ??
        budget?.max ??
        "",

      currency:
        budget?.currency ||
        "INR",
    },

    noticePeriod:
      parsed?.noticePeriod ||
      parsed?.notice_period ||
      "",

    primarySkills: ensureArray(
      parsed?.primarySkills ||
        parsed?.primary_skills ||
        parsed?.primary ||
        parsed?.skills
    ),

    secondarySkills: ensureArray(
      parsed?.secondarySkills ||
        parsed?.secondary_skills
    ),

    responsibilities: ensureArray(
      parsed?.responsibilities
    ),

    qualifications: ensureArray(
      parsed?.qualifications
    ),

    preferredSkills: ensureArray(
      parsed?.preferredSkills ||
        parsed?.preferred_skills
    ),

    tools: ensureArray(
      parsed?.tools
    ),

    certifications: ensureArray(
      parsed?.certifications
    ),

    education:
      parsed?.education || "",

    industry:
      parsed?.industry || "",

    summary:
      parsed?.summary || "",

    jobDescription:
      parsed?.jobDescription ||
      parsed?.job_description ||
      "",
  };
}

async function parseRequestBody(req: Request) {
  const contentType =
    req.headers.get("content-type") || "";

  /*
   * Preferred format:
   *
   * {
   *   "text": "job description..."
   * }
   */

  if (
    contentType.includes("application/json")
  ) {
    const body = await req.json();

    return {
      text:
        typeof body?.text === "string"
          ? body.text
          : "",
    };
  }

  /*
   * Also support multipart/form-data
   * if the frontend already sends FormData.
   *
   * IMPORTANT:
   * This function no longer parses PDF/DOCX itself.
   * The file must contain plain text or the
   * frontend must send a "text" field.
   */

  if (
    contentType.includes("multipart/form-data")
  ) {
    const form = await req.formData();

    const textField =
      form.get("text");

    if (
      typeof textField === "string"
    ) {
      return {
        text: textField,
      };
    }

    const file =
      form.get("file");

    if (file instanceof File) {
      const fileType =
        file.type || "";

      /*
       * Plain text files can still be processed
       * directly without any dependency.
       */
      if (
        fileType === "text/plain" ||
        file.name
          .toLowerCase()
          .endsWith(".txt")
      ) {
        return {
          text: await file.text(),
        };
      }

      throw new Error(
        "PDF/DOCX files must be converted to text before calling this function."
      );
    }
  }

  return {
    text: "",
  };
}

Deno.serve(async (req: Request) => {
  const origin =
    req.headers.get("origin") || "*";

  // CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(origin),
    });
  }

  // Only POST is supported.
  if (req.method !== "POST") {
    return jsonResponse(
      {
        error:
          "Method not allowed. Use POST.",
      },
      405,
      origin
    );
  }

  try {
    // -----------------------------------------
    // Configuration validation
    // -----------------------------------------

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return jsonResponse(
        {
          error:
            "Server misconfiguration: Supabase URL or anonymous key is missing.",
        },
        500,
        origin
      );
    }

    if (!OPENAI_API_KEY) {
      return jsonResponse(
        {
          error:
            "OpenAI API key is not configured.",
        },
        500,
        origin
      );
    }

    // -----------------------------------------
    // Read request
    // -----------------------------------------

    const { text } =
      await parseRequestBody(req);

    const jobDescriptionText = String(text || "").trim();

    console.debug('parse-job-description: received text length=', jobDescriptionText.length)

    if (!jobDescriptionText) {
      return jsonResponse(
        {
          error: "PDF_TEXT_EMPTY",
          message:
            "No readable job description text found. Send { text: '...' } in the request body. If you uploaded a PDF/DOCX file, convert it to plain text on the client before calling this function or enable OCR fallback on the client.",
        },
        400,
        origin
      );
    }

    // Prevent unnecessarily huge OpenAI requests.
    const MAX_TEXT_LENGTH = 50000;

    const trimmedText =
      jobDescriptionText.length >
      MAX_TEXT_LENGTH
        ? jobDescriptionText.slice(
            0,
            MAX_TEXT_LENGTH
          )
        : jobDescriptionText;

    // -----------------------------------------
    // OpenAI prompt
    // -----------------------------------------

    const systemPrompt = `
You are an expert HR recruitment assistant.

Your task is to analyze a job description and
extract structured recruitment information.

Return STRICT JSON ONLY.

Do not return:
- Markdown
- Code fences
- Explanations
- Comments
- Additional text

Use exactly this JSON structure:

{
  "jobTitle": "",
  "department": "",
  "experience": {
    "minimum": 0,
    "maximum": 0
  },
  "employmentType": "",
  "workMode": "",
  "location": "",
  "numberOfPositions": 1,
  "budget": {
    "minimum": "",
    "maximum": "",
    "currency": "INR"
  },
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

1. Extract only information that is supported
   by the job description.

2. If a value is not available, return:
   - "" for text
   - [] for arrays
   - 0 for numeric values

3. Experience must contain integer years.

4. numberOfPositions must be an integer
   greater than or equal to 1.

5. primarySkills should contain the most
   important technical or professional skills
   required for the role.

6. secondarySkills should contain additional
   useful skills.

7. responsibilities should contain individual
   responsibilities as separate array items.

8. qualifications should contain individual
   qualifications as separate array items.

9. preferredSkills should contain skills marked
   as preferred, optional, or desirable.

10. tools should contain software, platforms,
    frameworks, or technologies.

11. certifications should contain certifications
    explicitly mentioned.

12. Keep the original meaning of the job
    description.

13. Do not invent salary, experience, location,
    skills, or other information.

14. Currency should default to INR if salary
    information is expressed in Indian Rupees.

15. Return valid JSON only.
`;

    const userPrompt = `
Extract structured recruitment information from
the following job description.

JOB DESCRIPTION:

${trimmedText}
`;

    // -----------------------------------------
    // OpenAI API
    // -----------------------------------------

    const openaiResponse =
      await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${OPENAI_API_KEY}`,
          },

          body: JSON.stringify({
            model: OPENAI_MODEL,

            temperature: 0,

            messages: [
              {
                role: "system",
                content: systemPrompt,
              },

              {
                role: "user",
                content: userPrompt,
              },
            ],
          }),
        }
      );

    // -----------------------------------------
    // OpenAI error handling
    // -----------------------------------------

    if (!openaiResponse.ok) {
      const errorText =
        await openaiResponse.text()
          .catch(() => "");

      console.error(
        "OpenAI API error:",
        openaiResponse.status,
        errorText
      );

      return jsonResponse(
        {
          error:
            "OpenAI API request failed.",
          status:
            openaiResponse.status,
        },
        500,
        origin
      );
    }

    // -----------------------------------------
    // Read OpenAI response
    // -----------------------------------------

    const openaiJson =
      await openaiResponse.json();

    const content =
      openaiJson?.choices?.[0]
        ?.message?.content || "";

    if (!content) {
      return jsonResponse(
        {
          error:
            "OpenAI returned an empty response.",
        },
        500,
        origin
      );
    }

    // -----------------------------------------
    // Parse JSON
    // -----------------------------------------

    const parsed =
      extractJson(content);

    if (!parsed) {
      console.error(
        "Invalid JSON returned by OpenAI:",
        content
      );

      return jsonResponse(
        {
          error:
            "OpenAI did not return valid JSON.",
        },
        500,
        origin
      );
    }

    // -----------------------------------------
    // Normalize result
    // -----------------------------------------

    const result =
      normalizeJobData(parsed);

    // -----------------------------------------
    // Return final response
    // -----------------------------------------

    return jsonResponse(
      result,
      200,
      origin
    );

  } catch (error) {
    console.error(
      "parse-job-description error:",
      error
    );

    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Internal server error.",
      },
      500,
      origin
    );
  }
});

