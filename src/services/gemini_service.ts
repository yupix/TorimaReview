import {
	GoogleGenerativeAI,
	HarmCategory,
	HarmBlockThreshold,
	GenerationConfig,
} from "@google/generative-ai";

export class GeminiService {
	private genAI: GoogleGenerativeAI;
	private modelName: string;
	private generationConfig: GenerationConfig; // GenerationConfig をインポートして使用
	private safetySettings = [
		{
			category: HarmCategory.HARM_CATEGORY_HARASSMENT,
			threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
		},
		{
			category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
			threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
		},
		{
			category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
			threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
		},
		{
			category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
			threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
		},
	];

	constructor(
		apiKey: string,
		modelName: string,
		maxOutputTokens: number,
		temperature: number,
	) {
		if (!apiKey) {
			throw new Error("Gemini APIキーが提供されていません。");
		}
		this.genAI = new GoogleGenerativeAI(apiKey);
		this.modelName = modelName;
		this.generationConfig = {
			temperature,
			// topK: 1, // 必要に応じて設定
			// topP: 1, // 必要に応じて設定
			maxOutputTokens,
		};
	}

	async generateReview(prompt: string): Promise<string | null> {
		try {
			const model = this.genAI.getGenerativeModel({ model: this.modelName });
			const result = await model.generateContentStream({
				contents: [{ role: "user", parts: [{ text: prompt }] }],
				generationConfig: this.generationConfig,
				safetySettings: this.safetySettings,
			});

			let text = "";
			for await (const chunk of result.stream) {
				text += chunk.text();
			}
			return text.trim();
		} catch (error) {
			console.error("Gemini APIリクエストエラー:", error);
			// エラーメッセージに詳細を含める
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			return `Error: Gemini APIとの通信中にエラーが発生しました。\n\`\`\`\n${errorMessage}\n\`\`\``;
		}
	}
}
