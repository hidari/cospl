import type { Locator, Page } from "@playwright/test";

// index.html の data-tag と一致するタグ集合。
export type Tag = "BY" | "NC" | "ND" | "NAI" | "TD" | "SB" | "MR";

// CosPL 生成画面の Page Object。セレクタと操作をここに集約し、spec を生セレクタから分離する。
export class LicensePage {
  readonly page: Page;
  readonly output: Locator;
  readonly endpoint: Locator;
  readonly ident: Locator;
  readonly flashStatus: Locator;
  readonly copyButton: Locator;
  readonly linkButton: Locator;
  readonly clearButton: Locator;
  readonly photographer: Locator;
  readonly inputsSummary: Locator;
  readonly contacts: Locator;
  readonly sendBack: Locator;
  readonly extensionAdd: Locator;
  readonly humanTab: Locator;
  readonly aiTab: Locator;
  readonly creditGroup: Locator;
  readonly creditAny: Locator;

  constructor(page: Page) {
    this.page = page;
    this.output = page.locator("#out");
    this.endpoint = page.locator("#ep");
    this.ident = page.locator("#ident");
    this.flashStatus = page.locator("#flash-status");
    this.copyButton = page.locator("#copy");
    this.linkButton = page.locator("#link");
    this.clearButton = page.locator("#clear-fields");
    this.photographer = page.locator("#f-photographer");
    this.inputsSummary = page.locator("#inputs > summary");
    this.contacts = page.getByLabel("連絡先", { exact: true });
    this.sendBack = page.getByLabel("データバックの追記事項");
    this.extensionAdd = page.getByRole("button", { name: "＋ 項目を追加" });
    // タブは aria-label でアクセシブル名が安定するため role ベースで取得する。
    this.humanTab = page.getByRole("tab", { name: "README用" });
    this.aiTab = page.getByRole("tab", { name: "AI向け宣言" });
    // クレジットの選択肢は fieldset + legend の radiogroup として取得する。
    this.creditGroup = page.getByRole("group", { name: "クレジットのお願いの仕方" });
    this.creditAny = page.getByRole("radio", { name: "方法は問わない" });
  }

  // hash は "#tags=BY-NC" の形（先頭 # 含む）。未指定は素のトップ。
  async goto(hash = ""): Promise<void> {
    await this.page.goto(`/${hash}`);
  }

  // 任意入力欄は既定で閉じている。入力する前に開く（開いていれば何もしない）。
  async openInputs(): Promise<void> {
    if ((await this.page.locator("#inputs[open]").count()) === 0) {
      await this.inputsSummary.click();
    }
  }

  // タグ chip は data-tag 属性で一意に引く（アクセシブル名は複数 span 連結で不安定なため）。
  chip(tag: Tag): Locator {
    return this.page.locator(`.chip[data-tag="${tag}"]`);
  }

  async toggleTag(tag: Tag): Promise<void> {
    await this.chip(tag).click();
  }

  async selectAiView(): Promise<void> {
    await this.aiTab.click();
  }

  // 拡張の入力欄は 1 始まりの番号を aria-label に持つ（支援技術から見える名前と一致させる）。
  extensionHeading(n: number): Locator {
    return this.page.getByLabel(`追加事項 ${n} の見出し`);
  }

  extensionBody(n: number): Locator {
    return this.page.getByLabel(`追加事項 ${n} の本文`);
  }

  // ひな形ボタンは id（EXTENSION_PRESETS）で引く。表示名はチップ「加工禁止」等と部分一致しうるため。
  preset(id: "contents" | "editing" | "photographer-use"): Locator {
    return this.page.locator(`[data-preset="${id}"]`);
  }

  // 削除ボタンのアクセシブル名は「<見出し> を削除」。
  deleteButton(label: string): Locator {
    return this.page.getByRole("button", { name: `${label} を削除`, exact: true });
  }
}
