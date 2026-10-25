import { describe, expect, test } from "vitest";
import {
  addContact,
  addExtension,
  canAddContact,
  canAddExtension,
  contactRows,
  removeContact,
  removeExtension,
  setContact,
  setExtension,
  setTextField,
} from "../../src/license/draft-edit";
import { EXTENSION_PRESETS } from "../../src/license/presets";
import { EMPTY_DRAFT, MAX_CONTACTS, MAX_EXTENSIONS } from "../../src/license/sanitize";

describe("setTextField", () => {
  test("指定した単一行欄だけを書き換える", () => {
    const next = setTextField(EMPTY_DRAFT, "photographer", "太郎");
    expect(next).toEqual({ ...EMPTY_DRAFT, photographer: "太郎" });
  });

  test("データバックの追記事項も同じ経路で書き換える", () => {
    expect(setTextField(EMPTY_DRAFT, "sendBack", "a\nb").sendBack).toBe("a\nb");
  });
});

describe("連絡先", () => {
  test("空のときも入力行は 1 行見せる", () => {
    expect(contactRows(EMPTY_DRAFT)).toEqual([""]);
  });

  test("空の状態で追加すると、見えている 1 行目に続けて 2 行になる", () => {
    expect(addContact(EMPTY_DRAFT).contacts).toEqual(["", ""]);
  });

  test("空の状態で 1 行目に入力すると 1 件になる", () => {
    expect(setContact(EMPTY_DRAFT, 0, "x").contacts).toEqual(["x"]);
  });

  test("指定行だけを書き換える", () => {
    const draft = { ...EMPTY_DRAFT, contacts: ["a", "b"] };
    expect(setContact(draft, 1, "c").contacts).toEqual(["a", "c"]);
  });

  test("指定行を削除する。最後の 1 行を消すと空に戻る", () => {
    const draft = { ...EMPTY_DRAFT, contacts: ["a", "b"] };
    expect(removeContact(draft, 0).contacts).toEqual(["b"]);
    expect(removeContact(removeContact(draft, 0), 0).contacts).toEqual([]);
  });

  test("上限に達したら追加できず、状態も変わらない", () => {
    const full = { ...EMPTY_DRAFT, contacts: Array.from({ length: MAX_CONTACTS }, () => "x") };
    expect(canAddContact(full)).toBe(false);
    expect(addContact(full)).toEqual(full);
    expect(canAddContact({ ...full, contacts: full.contacts.slice(1) })).toBe(true);
  });
});

describe("拡張", () => {
  test("引数なしの追加は白紙の拡張", () => {
    expect(addExtension(EMPTY_DRAFT).extensions).toEqual([{ heading: "", body: "" }]);
  });

  test("ひな形の追加はその見出しと本文を持つ", () => {
    const editing = EXTENSION_PRESETS.find((p) => p.id === "editing");
    expect(editing).toBeDefined();
    expect(addExtension(EMPTY_DRAFT, "editing").extensions).toEqual([
      { heading: editing?.heading, body: editing?.body },
    ]);
  });

  test("見出しと本文を別々に書き換える", () => {
    const draft = addExtension(addExtension(EMPTY_DRAFT));
    const next = setExtension(setExtension(draft, 1, "heading", "その他"), 1, "body", "a\nb");
    expect(next.extensions).toEqual([
      { heading: "", body: "" },
      { heading: "その他", body: "a\nb" },
    ]);
  });

  test("指定の拡張を削除する", () => {
    const draft = addExtension(addExtension(EMPTY_DRAFT, "contents"), "editing");
    expect(removeExtension(draft, 0).extensions.map((e) => e.heading)).toEqual(["加工"]);
  });

  test("上限に達したら追加できず、状態も変わらない", () => {
    let draft = EMPTY_DRAFT;
    for (let i = 0; i < MAX_EXTENSIONS; i++) draft = addExtension(draft);
    expect(canAddExtension(draft)).toBe(false);
    expect(addExtension(draft)).toEqual(draft);
    expect(canAddExtension(removeExtension(draft, 0))).toBe(true);
  });

  test("元の draft を書き換えない", () => {
    const draft = addExtension(EMPTY_DRAFT);
    setExtension(draft, 0, "heading", "x");
    expect(draft.extensions[0]?.heading).toBe("");
  });
});
