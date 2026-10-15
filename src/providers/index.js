const config = require('../config');

class ProviderConfigurationError extends Error {}

function getProvider() {
  if (!config.provider) {
    throw new ProviderConfigurationError('AI generation is not configured yet. Add a provider, API key, and model to your .env file, then restart the server.');
  }
  if (config.provider !== 'openai-compatible') {
    throw new ProviderConfigurationError(`The provider "${config.provider}" is not supported yet. Set AI_PROVIDER=openai-compatible, or add a provider adapter in src/providers.`);
  }
  if (!config.apiKey || !config.model) {
    throw new ProviderConfigurationError('AI configuration is incomplete. Add AI_API_KEY and AI_MODEL to your .env file, then restart the server.');
  }
  return openAICompatibleProvider;
}

const openAICompatibleProvider = {
  async generate(brief) {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'You are a skilled content writer for Venbhas Softwares. Write original, useful, well-structured blog articles. Return only valid JSON with these string fields: title, introduction, headings (an array of 4 to 7 concise strings), body (the complete article body, with sections matching the headings and no title or conclusion), conclusion, seoTitle, metaDescription, callToAction. Do not use markdown fences. Follow the requested tone, audience, keywords, and approximate article length.'
          },
          {
            role: 'user',
            content: `Write a blog article using this brief:\n${JSON.stringify(brief, null, 2)}\n\nThe requested length is approximate and refers to the article body, introduction, and conclusion together.`
          }
        ]
      }),
      signal: AbortSignal.timeout(90000)
    });

    if (!response.ok) {
      const messages = {
        400: 'Google rejected the request. Check that the model name is correct and available for your API key.',
        401: 'Google did not accept the API key. Check that the full key is in .env, then restart the server.',
        403: 'Google denied access to this API key or project. Check the key restrictions and Gemini API access in Google AI Studio.',
        404: 'Google could not find the requested model or endpoint. Check AI_MODEL and AI_BASE_URL in .env.',
        429: 'The Gemini free-tier request limit was reached. Wait for the limit to reset, then try again.',
        500: 'Google AI Studio is temporarily having a problem. Wait a moment and try again.',
        503: 'Google AI Studio is temporarily unavailable. Wait a moment and try again.'
      };
      const err = new Error(messages[response.status] || `The AI provider returned an error (HTTP ${response.status}). Check its settings and try again.`);
      err.status = response.status;
      throw err;
    }
    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('The AI service returned an unexpected response. Please try again.');
    const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    let article;
    try {
      article = JSON.parse(cleaned);
    } catch {
      throw new Error('The AI response could not be read as an article. Please try generating it again.');
    }
    return normalizeArticle(article);
  }
};

function normalizeArticle(article) {
  const fields = ['title', 'introduction', 'body', 'conclusion', 'seoTitle', 'metaDescription', 'callToAction'];
  const result = {};
  for (const field of fields) result[field] = typeof article[field] === 'string' ? article[field].trim() : '';
  result.headings = Array.isArray(article.headings) ? article.headings.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, 12) : [];
  if (fields.some((field) => !result[field]) || result.headings.length === 0) {
    throw new Error('The AI response was missing one or more article sections. Please try generating it again.');
  }
  return result;
}

module.exports = { getProvider, ProviderConfigurationError };
