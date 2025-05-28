import express from "express";
import { config } from "./config";
import { GitHubService } from "./services/github_service";
import { GeminiService } from "./services/gemini_service";
import { PersonaService } from "./services/persona_service";
import { ReviewService } from "./services/review_service";
import { ReviewController } from "./controllers/review_controller";
import { createWebhookRouter } from "./webhook_router";

async function bootstrap() {
	// 1. サービスのインスタンス化
	const githubService = new GitHubService(
		config.github.appId,
		config.github.privateKey,
	);
	const geminiService = new GeminiService(
		config.gemini.apiKey,
		config.gemini.modelName,
		config.gemini.maxOutputTokens,
		config.gemini.temperature,
	);
	const personaService = new PersonaService(); // デフォルトのパスを使用
	await personaService.loadPersonas(); // アプリケーション起動時に人格を読み込む

	const reviewService = new ReviewService(
		githubService,
		geminiService,
		personaService,
	);

	// 2. コントローラーのインスタンス化
	const reviewController = new ReviewController(reviewService);

	// 3. Expressアプリケーションの設定
	const app = express();
	app.use(express.json()); // Webhookペイロード(JSON)のパースのため

	// ルーターの設定
	const webhookRouter = createWebhookRouter(reviewController);
	app.use("/webhook", webhookRouter); // Webhookは /webhook エンドポイントで待ち受ける

	app.get("/", (req, res) => {
		res.send("GitHub AI Reviewer is running (v2 - Class Based)!");
	});

	// 4. サーバー起動
	app.listen(config.server.port, () => {
		console.log(`サーバーがポート ${config.server.port} で起動しました`);
		console.log("Webhookエンドポイント: /webhook");
		if (process.env.SMEE_URL) {
			console.log(`Smee.io URL: ${process.env.SMEE_URL}/webhook`);
		}
	});
}

bootstrap().catch((error) => {
	console.error("アプリケーションの起動に失敗しました:", error);
	process.exit(1);
});
