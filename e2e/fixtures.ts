import { test as base } from "@playwright/test";
import { LicensePage } from "./pages/license-page";

// licensePage fixture を提供する拡張 test。全 spec はここから test / expect を import する。
export const test = base.extend<{ licensePage: LicensePage }>({
  licensePage: async ({ page }, use) => {
    await use(new LicensePage(page));
  },
});

export { expect } from "@playwright/test";
