import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpClient } from "../src/lib/op-client.js";

const mockSdk = {
  listVaults: vi.fn(),
  listItems: vi.fn(),
  getItemByTitle: vi.fn(),
  getItemOTP: vi.fn(),
};

vi.mock("@1password/connect", () => ({
  OnePasswordConnect: vi.fn(() => mockSdk),
}));

describe("OpClient", () => {
  beforeEach(() => Object.values(mockSdk).forEach((fn) => fn.mockReset()));

  it("returns vault list from listVaults", async () => {
    mockSdk.listVaults.mockResolvedValue([
      { id: "v1", name: "infrastructure" },
    ]);
    const c = new OpClient({ url: "https://1p", token: "t" });
    const out = await c.listVaults();
    expect(out).toEqual([{ id: "v1", name: "infrastructure" }]);
  });

  it("returns field value via getField", async () => {
    mockSdk.getItemByTitle.mockResolvedValue({
      id: "i1",
      title: "cloudflare",
      fields: [
        { id: "f1", label: "username", value: "nick" },
        { id: "f2", label: "api_key", value: "abc-123" },
      ],
    });
    const c = new OpClient({ url: "https://1p", token: "t" });
    const v = await c.getField("infrastructure", "cloudflare", "api_key");
    expect(v).toBe("abc-123");
  });

  it("throws when field is missing", async () => {
    mockSdk.getItemByTitle.mockResolvedValue({ id: "i1", fields: [] });
    const c = new OpClient({ url: "https://1p", token: "t" });
    await expect(
      c.getField("infrastructure", "cloudflare", "missing"),
    ).rejects.toThrow(/field/i);
  });

  it("returns OTP via getOtp", async () => {
    mockSdk.getItemOTP.mockResolvedValue("123456");
    const c = new OpClient({ url: "https://1p", token: "t" });
    const out = await c.getOtp("services", "github");
    expect(out).toBe("123456");
  });

  it("returns item titles from listItems", async () => {
    mockSdk.listItems.mockResolvedValue([
      { id: "i1", title: "cloudflare" },
      { id: "i2", title: "neon" },
    ]);
    const c = new OpClient({ url: "https://1p", token: "t" });
    const out = await c.listItems("infrastructure");
    expect(out).toEqual([
      { id: "i1", title: "cloudflare" },
      { id: "i2", title: "neon" },
    ]);
  });
});
