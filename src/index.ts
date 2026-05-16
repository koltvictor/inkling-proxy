interface Env {
  ANTHROPIC_API_KEY: string;
  SHARED_SECRET: string;
}

interface ScreenerResult {
  screenerId: string;
  shortName: string;
  fullName: string;
  totalScore: number;
  scoreMax: number;
  cutoff: number | null;
  cutoffMet: boolean;
  subscales: Record<string, number> | null;
  subscaleMaxes: Record<string, number> | null;
}

interface InterpretRequest {
  sessionId: string;
  screenerResults: ScreenerResult[];
  intakeContext?: {
    ageBucket?: string;
    sexAtBirth?: string;
    triageSummary?: string;
  };
}

const corsHeaders = (): HeadersInit => ({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
});

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });

const text = (body: string, status = 200): Response =>
  new Response(body, { status, headers: corsHeaders() });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (url.pathname === '/health' && request.method === 'GET') {
      return text('ok');
    }

    if (url.pathname === '/interpret' && request.method === 'POST') {
      return handleInterpret(request, env);
    }

    return text('Not found', 404);
  },
};

async function handleInterpret(request: Request, env: Env): Promise<Response> {
  const auth = request.headers.get('Authorization');
  if (!env.SHARED_SECRET || auth !== `Bearer ${env.SHARED_SECRET}`) {
    return text('Unauthorized', 401);
  }
  if (!env.ANTHROPIC_API_KEY) {
    return text('Server not configured', 500);
  }

  let body: InterpretRequest;
  try {
    body = (await request.json()) as InterpretRequest;
  } catch {
    return text('Invalid JSON', 400);
  }

  if (!body.screenerResults?.length) {
    return text('Missing screenerResults', 400);
  }

  try {
    const interpretation = await generateInterpretation(env.ANTHROPIC_API_KEY, body);
    return json({ interpretation, generatedAt: Date.now() });
  } catch (err) {
    return text('Interpretation failed', 502);
  }
}

const SYSTEM_PROMPT = `You are Inkling, a thoughtful interpretation assistant for adult mental health and neurodivergence screening instruments.

Your role is to help adults orient around possible patterns in their screening results — not to diagnose, alarm, or medicalize.

Voice: editorial, warm, precise. Think of the register of a long-form essay in The New Yorker, Kinfolk, or The Marginalian: confident but humble, specific but never clinical-jargon-y, considered prose with intentional rhythm. Pure prose paragraphs. No bullet lists, no headers, no markdown formatting of any kind.

What you must do:
- Speak directly to the reader as "you"
- Name what the score patterns suggest in plain language
- Acknowledge the specific subscale shape where it adds insight
- Hold the diagnostic line clearly: screening surfaces patterns; it does not diagnose
- Suggest gentle next steps: peer community, a clinician familiar with adult neurodivergence, first-hand accounts, or simply sitting with the results
- Write 3-5 paragraphs, approximately 300-500 words total

What you must not do:
- Diagnose or strongly imply a diagnosis (no "you have autism" / "you are autistic")
- Use bullet points, headers, or any markdown formatting
- Use clinical jargon that needs translation
- Be saccharine, falsely reassuring, or alarmist
- Suggest specific treatments or medications
- Pathologize traits that the reader may experience neutrally or positively`;

function buildUserPrompt(req: InterpretRequest): string {
  const lines: string[] = ['The reader completed the following screening instruments:', ''];

  for (const r of req.screenerResults) {
    lines.push(`${r.fullName} (${r.shortName})`);
    lines.push(`  Total: ${r.totalScore} of ${r.scoreMax}`);
    if (r.cutoff !== null) {
      lines.push(`  Cutoff: ${r.cutoff} (${r.cutoffMet ? 'met or exceeded' : 'below'})`);
    }
    if (r.subscales) {
      lines.push('  Subscales:');
      for (const [name, value] of Object.entries(r.subscales)) {
        const max = r.subscaleMaxes?.[name];
        const display = name.replace(/_/g, ' ');
        lines.push(`    ${display}: ${value}${max ? ` of ${max}` : ''}`);
      }
    }
    lines.push('');
  }

  if (req.intakeContext) {
    lines.push('Context they shared:');
    if (req.intakeContext.ageBucket) lines.push(`  Age range: ${req.intakeContext.ageBucket}`);
    if (req.intakeContext.sexAtBirth) lines.push(`  Sex at birth: ${req.intakeContext.sexAtBirth}`);
    if (req.intakeContext.triageSummary)
      lines.push(`  What brought them here: ${req.intakeContext.triageSummary}`);
    lines.push('');
  }

  lines.push(
    'Write an interpretation in your editorial voice. Speak directly to the reader. Prose only — no lists, no headers, no markdown.'
  );

  return lines.join('\n');
}

async function generateInterpretation(
  apiKey: string,
  req: InterpretRequest
): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-7',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(req) }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API ${response.status}: ${errText}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text?: string }>;
  };
  const textBlock = data.content.find((c) => c.type === 'text');
  return textBlock?.text ?? '';
}
