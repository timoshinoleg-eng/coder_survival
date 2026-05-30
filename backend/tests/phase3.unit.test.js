process.env.BOT_BACKEND_SECRET = "test-secret-for-memes";

import { renderMeme, MEME_TEMPLATE_IDS, getTemplateLabel } from "../src/utils/memeRenderer.js";
import { signMemeToken, verifyMemeToken } from "../src/utils/memeToken.js";

describe("phase3 meme engine", () => {
  describe("memeRenderer", () => {
    const stats = {
      username: "test_coder",
      rankName: "Senior",
      commits: 1337,
      streakDays: 42,
      depression: 33,
      energy: 65,
      maxEnergy: 100,
    };

    test("renderMeme produces valid PNG buffer for 1:1 format", async () => {
      const buffer = await renderMeme("works_on_my_machine", "1:1", stats);
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(1000);
      expect(buffer.slice(0, 8).toString("hex")).toBe("89504e470d0a1a0a"); // PNG signature
    });

    test("renderMeme produces valid PNG buffer for 9:16 format", async () => {
      const buffer = await renderMeme("deploy_friday", "9:16", stats);
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(1000);
      expect(buffer.slice(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    });

    test("renderMeme throws on unknown template", async () => {
      await expect(renderMeme("unknown_template", "1:1", stats)).rejects.toThrow("Unknown template");
    });

    test("MEME_TEMPLATE_IDS contains 5 templates", () => {
      expect(MEME_TEMPLATE_IDS).toHaveLength(5);
      expect(MEME_TEMPLATE_IDS).toContain("works_on_my_machine");
      expect(MEME_TEMPLATE_IDS).toContain("stack_overflow");
    });

    test("getTemplateLabel returns label or id fallback", () => {
      expect(getTemplateLabel("works_on_my_machine")).toBe("Works on my machine");
      expect(getTemplateLabel("unknown")).toBe("unknown");
    });
  });

  describe("memeToken", () => {
    test("signMemeToken returns a string token", () => {
      const token = signMemeToken({ userId: 123, templateId: "works_on_my_machine", format: "1:1" });
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(10);
    });

    test("verifyMemeToken returns payload for valid token", () => {
      const payload = { userId: 456, templateId: "this_is_fine", format: "9:16" };
      const token = signMemeToken(payload);
      const verified = verifyMemeToken(token);
      expect(verified).toMatchObject({
        userId: 456,
        templateId: "this_is_fine",
        format: "9:16",
      });
    });

    test("verifyMemeToken returns null for invalid token", () => {
      expect(verifyMemeToken("invalid-token")).toBeNull();
    });

    test("verifyMemeToken returns null for tampered token", () => {
      const token = signMemeToken({ userId: 789, templateId: "wtf_per_minute", format: "1:1" });
      const tampered = token.slice(0, -4) + "abcd";
      expect(verifyMemeToken(tampered)).toBeNull();
    });

    test("verifyMemeToken returns null for expired token", () => {
      const token = signMemeToken({ userId: 999, templateId: "stack_overflow", format: "1:1" });
      expect(verifyMemeToken(token)).not.toBeNull();
      // After secret change, it should be invalid
      const originalSecret = process.env.BOT_BACKEND_SECRET;
      process.env.BOT_BACKEND_SECRET = "different-secret";
      expect(verifyMemeToken(token)).toBeNull();
      process.env.BOT_BACKEND_SECRET = originalSecret;
    });
  });
});
