import path from "path";
import fs from "fs/promises";

export class PersonaService {
	private personasDir: string;
	private loadedPersonas: Record<string, string> = {};
	private defaultFallbackPrompt =
		"あなたは親切なコードレビュアーです。以下のコード変更をレビューしてください。";

	constructor(personasDirPath: string = path.join(__dirname, "../../personas")) {
		this.personasDir = personasDirPath;
	}

	async loadPersonas(): Promise<void> {
		console.log(
			`人格ファイルをディレクトリ "${this.personasDir}" から読み込みます...`,
		);
		this.loadedPersonas = {};
		try {
			const files = await fs.readdir(this.personasDir);
			for (const file of files) {
				const filePath = path.join(this.personasDir, file);
				const personaName = path
					.basename(file, path.extname(file))
					.toLowerCase();

				if (personaName === "index" || personaName === "persona_service")
					continue; // 自分自身やインデックスファイルはスキップ

				if (file.endsWith(".txt") || file.endsWith(".md")) {
					const promptContent = await fs.readFile(filePath, "utf-8");
					this.loadedPersonas[personaName] = promptContent.trim();
					console.log(
						`人格 "${personaName}" (from ${path.extname(file)}) を読み込みました。`,
					);
				}
				// .tsファイルからの動的読み込みは、セキュリティと複雑性の観点から一旦省略
				// 必要であれば、安全な方法で実装を検討
			}
		} catch (error) {
			console.error("人格ファイルの読み込み中にエラーが発生しました:", error);
			// ディレクトリが存在しない場合など
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				console.warn(`人格ディレクトリが見つかりません: ${this.personasDir}`);
			}
		}

		if (Object.keys(this.loadedPersonas).length === 0) {
			console.warn(
				"利用可能な人格が読み込まれませんでした。デフォルトプロンプトが使用されます。",
			);
		} else {
			console.log("読み込み完了した人格:", Object.keys(this.loadedPersonas));
		}
	}

	getPersonaPrompt(
		personaName: string,
		defaultPersonaKey: string = "default",
	): string {
		const lowerPersonaName = personaName.toLowerCase();
		if (this.loadedPersonas[lowerPersonaName]) {
			return this.loadedPersonas[lowerPersonaName];
		}
		if (this.loadedPersonas[defaultPersonaKey.toLowerCase()]) {
			console.warn(
				`指定人格 "${personaName}" が見つかりません。デフォルト人格 "${defaultPersonaKey}" を使用します。`,
			);
			return this.loadedPersonas[defaultPersonaKey.toLowerCase()];
		}
		console.warn(
			`指定人格 "${personaName}" もデフォルト人格 "${defaultPersonaKey}" も見つかりません。組み込みのフォールバックプロンプトを使用します。`,
		);
		return this.defaultFallbackPrompt;
	}
}
