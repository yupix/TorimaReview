// src/main.ts
import express from 'express';
import { config } from './config';
import { GitHubService } from './services/github_service';
import { GeminiService } from './services/gemini_service';
import { PersonaService } from './services/persona_service';
import { ReviewService } from './services/review_service';
import { PlanningService } from './services/planning_service'; // PlanningServiceをインポート
import { ReviewController } from './controllers/review_controller';
import { PlanningController } from './controllers/planning_controller'; // PlanningControllerをインポート
import { createWebhookRouter } from './webhook_router';

async function bootstrap() {
  // 1. サービスのインスタンス化
  const githubService = new GitHubService(config.github.appId, config.github.privateKey);
  const geminiService = new GeminiService(
    config.gemini.apiKey,
    config.gemini.modelName,
    config.gemini.maxOutputTokens,
    config.gemini.temperature
  );
  const personaService = new PersonaService(); // デフォルトのpersonasディレクトリパスを使用
  await personaService.loadPersonas(); // アプリケーション起動時に人格プロンプトを読み込む

  const reviewService = new ReviewService(githubService, geminiService, personaService);
  const planningService = new PlanningService(githubService, geminiService, personaService); // PlanningServiceをインスタンス化

  // 2. コントローラーのインスタンス化
  const reviewController = new ReviewController(reviewService);
  const planningController = new PlanningController(planningService); // PlanningControllerをインスタンス化

  // 3. Expressアプリケーションの設定
  const app = express();
  // @octokit/webhooks の createNodeMiddleware がリクエストボディのパースと署名検証を行うため、
  // Webhookエンドポイントより前にグローバルな express.json() を置くと問題が起きる可能性がある。
  // 他のエンドポイントでJSONボディが必要な場合は、そのエンドポイントに限定してミドルウェアを適用する。
  // 今回は /webhook 以外にJSONを期待するエンドポイントはないため、app.use(express.json()) は不要。

  // ルーターの設定
  // createWebhookRouter に planningController を渡すように変更
  const webhookRouter = createWebhookRouter(reviewController, planningController);
  app.use('/webhook', webhookRouter); // Webhookは /webhook エンドポイントで待ち受ける

  app.get('/', (req, res) => {
    res.send('GitHub AI Reviewer & Planner is running!');
  });

  // 4. サーバー起動
  app.listen(config.server.port, () => {
    console.log(`サーバーがポート ${config.server.port} で起動しました`);
    console.log(`Webhookエンドポイント: http://localhost:${config.server.port}/webhook`);
    if (process.env.SMEE_URL) {
      console.log(`Smee.io URL (転送先を上記ローカルエンドポイントに設定): ${process.env.SMEE_URL}`);
    }
  });
}

bootstrap().catch(error => {
  console.error("アプリケーションの起動に失敗しました:", error);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});