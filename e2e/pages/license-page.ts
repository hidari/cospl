import type { Locator, Page } from "@playwright/test";

// index.html の data-tag と一致するタグ集合。
export type Tag = "BY" | "NC" | "NAI" | "TD" | "MR";

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
  readonly contact: Locator;
  readonly humanTab: Locator;
  readonly aiTab: Locator;

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
    this.contact = page.locator("#f-contact");
    // タブは aria-label でアクセシブル名が安定するため role ベースで取得する。
    this.humanTab = page.getByRole("tab", { name: "README用" });
    this.aiTab = page.getByRole("tab", { name: "AI向け宣言" });
  }

  // hash は "#tags=BY-NC" の形（先頭 # 含む）。未指定は素のトップ。
  async goto(hash = ""): Promise<void> {
    await this.page.goto(`/${hash}`);
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

  // 入力フォーム（撮影者名・連絡先など）を含む details.fill を開く。
  // index.html の markup（details.fill > summary、初期は閉じた状態）に依存する。
  // 開いている details の summary を click すると閉じてしまうため、open 判定で冪等にする。
  async openFillSection(): Promise<void> {
    const details = this.page.locator("details.fill");
    const isOpen = await details.evaluate((el) => (el as HTMLDetailsElement).open);
    if (!isOpen) {
      await details.locator("summary").click();
    }
  }
}
