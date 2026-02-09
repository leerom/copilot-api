import { test, expect, mock } from "bun:test"

import type { ChatCompletionsPayload } from "../src/services/copilot/create-chat-completions"

import { state } from "../src/lib/state"
import { createChatCompletions } from "../src/services/copilot/create-chat-completions"

// Mock state
state.copilotToken = "test-token"
state.vsCodeVersion = "1.0.0"
state.accountType = "individual"

// Helper to mock fetch
type FetchMockOptions = { headers: Record<string, string>; body?: string }
const fetchMock = mock(
  (_url: string, opts: FetchMockOptions) => {
    return {
      ok: true,
      json: () => ({ id: "123", object: "chat.completion", choices: [] }),
      headers: opts.headers,
    }
  },
)
// @ts-expect-error - Mock fetch doesn't implement all fetch properties
;(globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock

test("sets X-Initiator to agent if tool/assistant present", async () => {
  const payload: ChatCompletionsPayload = {
    messages: [
      { role: "user", content: "hi" },
      { role: "tool", content: "tool call" },
    ],
    model: "gpt-test",
  }
  await createChatCompletions(payload)
  expect(fetchMock).toHaveBeenCalled()
  const headers = (fetchMock.mock.calls[0][1] as FetchMockOptions).headers
  expect(headers["X-Initiator"]).toBe("agent")
})

test("sets X-Initiator to user if only user present", async () => {
  const payload: ChatCompletionsPayload = {
    messages: [
      { role: "user", content: "hi" },
      { role: "user", content: "hello again" },
    ],
    model: "gpt-test",
  }
  await createChatCompletions(payload)
  expect(fetchMock).toHaveBeenCalled()
  const headers = (fetchMock.mock.calls[1][1] as FetchMockOptions).headers
  expect(headers["X-Initiator"]).toBe("user")
})

test("fills missing properties for mcp tool schema", async () => {
  const payload: ChatCompletionsPayload = {
    messages: [{ role: "user", content: "hi" }],
    model: "gpt-test",
    tools: [
      {
        type: "function",
        function: {
          name: "mcp__example",
          parameters: {
            type: "object",
          },
        },
      },
    ],
  }
  await createChatCompletions(payload)
  expect(fetchMock).toHaveBeenCalled()
  const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
  const body = (lastCall[1] as FetchMockOptions).body
  expect(body).toBeDefined()
  const parsed = JSON.parse(body ?? "{}") as ChatCompletionsPayload
  const parameters = parsed.tools?.[0].function.parameters as Record<
    string,
    unknown
  >
  expect(parameters).toMatchObject({ type: "object", properties: {} })
})
