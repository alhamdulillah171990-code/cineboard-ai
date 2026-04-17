const callGemini = async (
  prompt: string,
  schema: any,
  cacheKey?: string,
  fallbackOptions?: any
) => {
  return executeWithSystem(async () => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-1.5-pro",
        contents: [{ text: prompt }],
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      });

      const text =
        response?.text ||
        response?.candidates?.[0]?.content?.parts?.[0]?.text;

      console.log("Gemini RAW:", text);

      if (!text) {
        throw new Error("Empty response from Gemini");
      }

      try {
        return JSON.parse(text);
      } catch {
        console.warn("JSON parse failed, trying fallback...");

        const match = text.match(/\{[\s\S]*\}/);

        if (match && match[0]) {
          return JSON.parse(match[0]);
        }

        throw new Error("Invalid JSON format");
      }
    } catch (error) {
      console.error("Gemini API Error:", error);

      if (fallbackOptions?.templateFallback?.enabled) {
        return fallbackOptions.templateFallback.context;
      }

      throw error;
    }
  }, { cacheKey, fallback: fallbackOptions });
};
