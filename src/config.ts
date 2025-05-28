// src/config.ts
import { config as dotenvConfig } from "dotenv";
import fs from "fs";

dotenvConfig();

function readPrivateKey(): string {
	if (process.env.PRIVATE_KEY_PATH) {
		try {
			return fs.readFileSync(process.env.PRIVATE_KEY_PATH, "utf-8");
		} catch (error) {
			console.error(
				"秘密鍵ファイルの読み込みに失敗しました (PRIVATE_KEY_PATH):",
				error,
			);
			throw new Error("Failed to read private key from PRIVATE_KEY_PATH");
		}
	} else if (process.env.PRIVATE_KEY) {
		return process.env.PRIVATE_KEY.replace(/\\n/g, "\n");
	}
	throw new Error(
		"PRIVATE_KEY_PATH または PRIVATE_KEY 環境変数が設定されていません。",
	);
}

export const config = {
	server: {
		port: parseInt(process.env.PORT || "3000", 10),
	},
	github: {
		appId: process.env.APP_ID!,
		webhookSecret: process.env.WEBHOOK_SECRET!,
		privateKey: readPrivateKey(),
		reviewCommand: process.env.REVIEW_COMMAND || "!review",
        planCommand: process.env.PLAN_COMMAND || '!plan', // 新しいプランニングコマンド
	},
	gemini: {
		apiKey: process.env.GEMINI_API_KEY!,
		modelName: process.env.GEMINI_MODEL_NAME || "gemini-1.5-flash",
		maxOutputTokens: parseInt(
			process.env.GEMINI_MAX_OUTPUT_TOKENS || "8192",
			10,
		),
		temperature: parseFloat(process.env.GEMINI_TEMPERATURE || "0.7"),
	},
	persona: {
		defaultPersona: process.env.DEFAULT_PERSONA || "default",
		// REVIEW_PERSONA はコマンドで上書きされるため、ここでは主にデフォルトを指定
	},
};

// 必須チェック
if (
	!config.github.appId ||
	!config.github.webhookSecret ||
	!config.gemini.apiKey
) {
	console.error(
		"必須の環境変数 (APP_ID, WEBHOOK_SECRET, GEMINI_API_KEY) が設定されていません。",
	);
	process.exit(1);
}
