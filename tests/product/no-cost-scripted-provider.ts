import type { LlmProvider, LlmRequest } from '@/modules/llm-services'
import { readAgentSession } from '@/modules/llm-services/src/providers/agent-session'

const MODEL = 'gpt-5.6-luna'
const SOURCE_TEXT = ['COUNTY PUBLIC NOTICE', 'Permit deadline: October 19, 2026']

function requestText(request: LlmRequest): string {
  return request.messages
    .flatMap((message) => message.parts)
    .flatMap((part) => (part.type === 'text' ? [part.text] : []))
    .join('\n')
}

/**
 * Deterministic provider for generated one-page test PDFs. Its replies are test inputs, never
 * evidence of model accuracy; rendering, validation, receipt generation, and merging remain real.
 */
export function createNoCostScriptedProvider(): LlmProvider & {
  readonly calls: readonly string[]
} {
  const calls: string[] = []
  let latestVisualFingerprint: string | undefined
  const provider: LlmProvider & { readonly calls: readonly string[] } = {
    name: 'openai',
    calls,
    async generate(request, schema) {
      calls.push(request.chargeContext?.requestId ?? 'structured')
      const options: readonly unknown[] = [
        { rotationNeeded: 0, authoringSkills: [] },
        { complete: true, issues: [] },
      ]
      for (const option of options) {
        const parsed = schema.safeParse(option)
        if (parsed.success)
          return {
            content: JSON.stringify(option),
            parsedOutput: parsed.data,
            model: request.model,
            finishReason: 'stop',
            usage: { inputTokens: 1, outputTokens: 1 },
          }
      }
      throw new Error(
        `No scripted structured response for ${request.chargeContext?.stage ?? 'unknown stage'}`,
      )
    },
    async generateWithTools(request, tools) {
      calls.push(request.chargeContext?.requestId ?? 'tool')
      const currentFingerprint = requestText(request).match(
        /candidate_fingerprint=([a-f\d]{64})/iu,
      )?.[1]
      if (currentFingerprint) latestVisualFingerprint = currentFingerprint
      const scriptedToolNames = new Set([
        'record_page_source_evidence',
        'create_page_html',
        'inspect_page_render',
        'submit_page_for_acceptance',
        'submit_page_visual_verdict',
      ])
      const isAllowed = (name: string) =>
        request.allowedToolNames === undefined || request.allowedToolNames.includes(name)
      const inspectedRender = request.toolOutputs?.some(
        ({ toolName }) => toolName === 'inspect_page_render',
      )
      const preferredTool = tools.some(({ name }) => name === 'submit_page_visual_verdict')
        ? 'submit_page_visual_verdict'
        : request.allowedToolNames?.includes('record_page_source_evidence') === true
          ? 'record_page_source_evidence'
          : request.allowedToolNames?.includes('create_page_html') === true
            ? 'create_page_html'
            : request.allowedToolNames?.includes('submit_page_for_acceptance') === true &&
                inspectedRender === true
              ? 'submit_page_for_acceptance'
              : request.allowedToolNames?.includes('inspect_page_render') === true
                ? 'inspect_page_render'
                : undefined
      const tool =
        preferredTool === undefined
          ? tools.find(({ name }) => scriptedToolNames.has(name) && isAllowed(name))
          : tools.find(({ name }) => name === preferredTool)
      if (!tool)
        throw new Error(
          `Scripted provider found no supported tool among [${tools.map(({ name }) => name).join(', ')}]; allowed [${request.allowedToolNames?.join(', ') ?? 'all'}]`,
        )

      let args: Record<string, unknown>
      if (tool.name === 'record_page_source_evidence') {
        args = {
          blank: false,
          items: SOURCE_TEXT.map((content) => ({
            kind: 'text',
            content: [content],
            uncertainty: null,
          })),
        }
      } else if (tool.name === 'create_page_html') {
        args = {
          html: [
            '<!doctype html>',
            '<html lang="en-US">',
            '<head>',
            '<meta charset="utf-8">',
            '<title>County Public Notice</title>',
            '<style data-plyft-page-style="page-0001">',
            '@page plyft_page_0001 { size: 612pt 792pt; margin: 0; }',
            'html, body { margin: 0; padding: 0; }',
            '.plyft-page-0001 { page: plyft_page_0001; width: 612pt; height: 792pt; box-sizing: border-box; overflow: visible; font-family: "DejaVu Sans"; font-style: normal; font-weight: 400; }',
            '.plyft-page-0001 h1 { position: absolute; left: 72pt; top: 68pt; margin: 0; color: #0d264d; font-size: 22pt; line-height: 26pt; }',
            '.plyft-page-0001 p { position: absolute; left: 72pt; top: 123pt; margin: 0; color: #191919; font-size: 14pt; line-height: 17pt; }',
            '</style>',
            '</head>',
            '<body>',
            '<main class="plyft-page plyft-page-0001" data-plyft-page="1">',
            `<h1>${SOURCE_TEXT[0]}</h1>`,
            `<p>${SOURCE_TEXT[1]}</p>`,
            '</main>',
            '</body>',
            '</html>',
          ].join('\n'),
        }
      } else if (tool.name === 'inspect_page_render') {
        args = {
          source_region: { left: 0, top: 0, right: 1, bottom: 1 },
          candidate_region: { left: 0, top: 0, right: 1, bottom: 1 },
        }
      } else if (tool.name === 'submit_page_for_acceptance') {
        const revision = requestText(request).match(
          /(?:revision|html_sha256)[=: ]+([a-f\d]{64})/iu,
        )?.[1]
        if (!revision)
          throw new Error('Acceptance request did not include its current HTML revision')
        args = { revision }
      } else if (tool.name === 'submit_page_visual_verdict') {
        const fingerprintInCurrentRequest =
          `${request.systemPrompt}\n${requestText(request)}`.match(
            /candidate_fingerprint["'\s:=]+([a-f\d]{64})/iu,
          )?.[1]
        if (fingerprintInCurrentRequest) latestVisualFingerprint = fingerprintInCurrentRequest
        const fingerprint = latestVisualFingerprint
        if (!fingerprint)
          throw new Error('Visual review request did not include its candidate fingerprint')
        args = {
          candidate_fingerprint: fingerprint,
          source_checks: { review_complete: true, exceptions: [] },
          visual_verdict: {
            verdict: 'PASS',
            defects: [],
            wcagVisualAudits: [{ ruleId: '1.4.1', verdict: 'PASS' }],
          },
        }
      } else {
        throw new Error(`Unexpected scripted provider tool: ${tool.name}`)
      }

      const parsed = tool.parameters.safeParse(args)
      if (!parsed.success)
        throw new Error(`Scripted response did not match ${tool.name}: ${parsed.error.message}`)
      const previous = readAgentSession(request, provider.name, request.model)
      return {
        content: '',
        model: request.model,
        finishReason: 'stop',
        usage: { inputTokens: 1, outputTokens: 1 },
        agentSession: {
          provider: provider.name,
          model: request.model,
          opaqueState: {
            systemPrompt: request.systemPrompt,
            history: [
              ...(previous?.history ?? []),
              request.chargeContext?.requestId ?? 'scripted-turn',
            ],
          },
        },
        toolCalls: [{ name: tool.name, callId: `script-${calls.length}`, args: parsed.data }],
      }
    },
  }
  return provider
}

export { MODEL, SOURCE_TEXT }
