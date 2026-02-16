import { getZapierWebhookUrl } from '../config/env';

export interface FunctionCallResult {
  success: boolean;
  data?: any;
  error?: string;
}

export async function executeFunctionCall(
  functionName: string,
  args: string
): Promise<FunctionCallResult> {
  try {
    console.log(`[Function Call] Attempting to execute: ${functionName}`);
    console.log(`[Function Call] Arguments:`, args);

    const webhookUrl = getZapierWebhookUrl(functionName);

    if (!webhookUrl) {
      console.error(`[Function Call] No webhook URL configured for function: ${functionName}`);
      console.error(`[Function Call] Make sure you have set the environment variable for this function`);
      return {
        success: false,
        error: `Webhook URL not configured for ${functionName}. Please add the appropriate environment variable.`
      };
    }

    console.log(`[Function Call] Webhook URL found: ${webhookUrl.substring(0, 50)}...`);

    const parsedArgs = JSON.parse(args);

    console.log(`[Function Call] Parsed arguments:`, parsedArgs);

    console.log(`[Function Call] Sending webhook request to Zapier...`);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        function: functionName,
        timestamp: new Date().toISOString(),
        ...parsedArgs
      })
    });

    console.log(`[Function Call] Webhook response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Function Call] Zapier webhook failed for ${functionName}:`, errorText);
      return {
        success: false,
        error: `Webhook request failed with status ${response.status}: ${errorText}`
      };
    }

    const responseData = await response.json().catch(() => ({}));

    console.log(`[Function Call] ✅ Function ${functionName} executed successfully`);
    console.log(`[Function Call] Response data:`, responseData);

    return {
      success: true,
      data: responseData
    };
  } catch (error) {
    console.error(`[Function Call] ❌ Error executing function ${functionName}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function handleToolCalls(toolCalls: any[]): Promise<Array<{ tool_call_id: string; output: string }>> {
  console.log(`[Tool Calls] Handling ${toolCalls.length} tool call(s)`);

  const toolOutputs = [];

  for (const toolCall of toolCalls) {
    const { id, function: func } = toolCall;
    const { name, arguments: args } = func;

    console.log(`[Tool Calls] Processing tool call ID: ${id}`);
    console.log(`[Tool Calls] Function name: ${name}`);
    console.log(`[Tool Calls] Arguments:`, args);

    const result = await executeFunctionCall(name, args);

    console.log(`[Tool Calls] Result for ${name}:`, result);

    toolOutputs.push({
      tool_call_id: id,
      output: JSON.stringify(result)
    });
  }

  console.log(`[Tool Calls] All tool calls processed. Returning ${toolOutputs.length} output(s)`);

  return toolOutputs;
}
