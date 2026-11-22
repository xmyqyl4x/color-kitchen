import { generateText, jsonSchema, NoObjectGeneratedError, NoOutputGeneratedError, Output, type LanguageModel } from 'ai';
import { colorCss } from '../color/css.js';
import { guideRoles, InvalidGuideReply } from './response.js';
import { guideOutputTokens, type GuideProvider } from './service.js';

const languages = { en: 'English', fr: 'French', es: 'Spanish', pt: 'Portuguese', de: 'German' } as const;
const schema = jsonSchema({
  type: 'object',
  additionalProperties: false,
  required: ['message', 'colors', 'roles', 'contrasts'],
  properties: {
    message: { type: 'string', minLength: 1, maxLength: 600 },
    colors: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 160 } },
    roles: { type: 'array', maxItems: guideRoles.length, items: {
      type: 'object', additionalProperties: false, required: ['name', 'index'],
      properties: { name: { type: 'string', enum: [...guideRoles] }, index: { type: 'integer', minimum: 0, maximum: 11 } },
    } },
    contrasts: { type: 'array', maxItems: 4, items: {
      type: 'object', additionalProperties: false, required: ['foreground', 'background', 'backing'],
      properties: { foreground: { type: 'string' }, background: { type: 'string' }, backing: { type: ['string', 'null'] } },
    } },
  },
});

export function aiColorGuideProvider(model: LanguageModel): GuideProvider {
  return {
    async generate(input, signal) {
      const swatches = input.colors.map(colorCss);
      try {
        const result = await generateText({
          model,
          instructions: `You are Color Kitchen's public color guide. Write the message in ${languages[input.locale]} (${input.locale}). ` +
            'Keep it concise and about palettes, color roles, or accessible contrast. Return plain text with no measurements or claims that a pair passes. ' +
            'Return requested contrast pairs as foreground and background color strings, with an opaque backing string for transparency or null otherwise. ' +
            'The application computes the results. Use known CSS color syntax and zero-based indexes for roles.',
          messages: [
            ...input.history.map(turn => ({ role: turn.role, content: turn.text })),
            { role: 'user', content: JSON.stringify({ prompt: input.prompt, selectedColors: swatches }) },
          ],
          output: Output.object({ schema }),
          abortSignal: signal,
          maxOutputTokens: guideOutputTokens,
          maxRetries: 0,
          telemetry: { isEnabled: false, recordInputs: false, recordOutputs: false },
        });
        return result.output;
      } catch (error) {
        if (NoObjectGeneratedError.isInstance(error) || NoOutputGeneratedError.isInstance(error)) throw new InvalidGuideReply();
        throw error;
      }
    },
  };
}
