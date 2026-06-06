export async function logAITask({
  userId,
  taskType,
  input,
  output,
  provider,
  model,
  inputTokens,
  outputTokens
}: {
  userId: string;
  taskType: string;
  input: unknown;
  output: unknown;
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return;

  try {
    await fetch(`${url}/rest/v1/ai_tasks`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        user_id: userId,
        task_type: taskType,
        input_json: input,
        output_json: output,
        provider,
        model,
        estimated_input_tokens: inputTokens ?? 0,
        estimated_output_tokens: outputTokens ?? 0
      }),
      cache: "no-store"
    });
  } catch {
    // Usage logging should never block the user action.
  }
}
