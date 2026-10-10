import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CommercialDataPage from "@/app/commercial-data/page";
import CommercialInterestForm from "@/components/CommercialInterestForm";
import { BUYER_SEGMENTS, MAX_USE_LENGTH, PILOT_PRICE_USD_PER_MONTH, parseSegment, parseUse } from "@/lib/commercial";

const calls = () => (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
const bodyOf = (i: number) => JSON.parse(calls()[i][1].body as string);

const cta = () => screen.getByRole("button", { name: /join the pilot list/i });
const send = () => screen.getByRole("button", { name: /^send$/i });

beforeEach(() => {
  globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
});
afterEach(() => vi.restoreAllMocks());

describe("parseSegment", () => {
  it("accepts every listed segment and nothing else", () => {
    for (const s of BUYER_SEGMENTS) expect(parseSegment(s.value)).toBe(s.value);
    expect(parseSegment("Egg-Poultry-Buyer")).toBeNull();
    expect(parseSegment(undefined)).toBeNull();
  });
});

describe("parseUse", () => {
  it("returns null for empty or non-string answers", () => {
    expect(parseUse("   ")).toBeNull();
    expect(parseUse(undefined)).toBeNull();
    expect(parseUse(42)).toBeNull();
  });

  it("removes angle brackets and control characters and collapses whitespace", () => {
    expect(parseUse("a\u0000b <@here>\t\tc​")).toBe("a b @here c");
  });

  it("caps the length", () => {
    expect(parseUse("x".repeat(MAX_USE_LENGTH + 50))).toHaveLength(MAX_USE_LENGTH);
  });
});

describe("/commercial-data page", () => {
  it("says up front that the feed is not built, and shows the price", () => {
    render(<CommercialDataPage />);
    expect(screen.getByRole("heading", { name: /not available yet/i })).toBeInTheDocument();
    expect(screen.getByText(/nothing is sold or charged here/i)).toBeInTheDocument();
    expect(screen.getByText(/per month, per team/i).parentElement).toHaveTextContent(`$${PILOT_PRICE_USD_PER_MONTH}`);
  });
});

describe("CommercialInterestForm", () => {
  it("starts as one button with the price and reports the click", () => {
    render(<CommercialInterestForm />);
    expect(cta()).toHaveTextContent(`$${PILOT_PRICE_USD_PER_MONTH}/month`);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    fireEvent.click(cta());
    expect(bodyOf(0)).toEqual({ kind: "commercial-open" });
    expect(screen.getByLabelText(/work email/i)).toHaveFocus();
  });

  it("asks for a segment before sending", () => {
    render(<CommercialInterestForm />);
    fireEvent.click(cta());
    fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: "buyer@foods.example" } });
    fireEvent.click(send());
    expect(screen.getByRole("alert")).toHaveTextContent(/describes you/i);
    expect(calls()).toHaveLength(1); // only the open ping
  });

  it("sends email, segment and answer, then thanks the visitor", async () => {
    render(<CommercialInterestForm />);
    fireEvent.click(cta());
    fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: " buyer@foods.example " } });
    fireEvent.change(screen.getByLabelText(/describes you/i), { target: { value: "egg-poultry-buyer" } });
    fireEvent.change(screen.getByLabelText(/what decision/i), { target: { value: "forward contracts" } });
    fireEvent.click(send());

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/nothing is charged/i));
    expect(bodyOf(1)).toEqual({
      kind: "commercial",
      email: "buyer@foods.example",
      segment: "egg-poultry-buyer",
      use: "forward contracts",
      website: "",
    });
  });

  it("shows the server's message and keeps the form when sending fails", async () => {
    render(<CommercialInterestForm />);
    fireEvent.click(cta());
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Too many attempts. Please try again later." }), { status: 429 }),
    );
    fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: "buyer@foods.example" } });
    fireEvent.change(screen.getByLabelText(/describes you/i), { target: { value: "trader" } });
    fireEvent.click(send());

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/too many attempts/i));
    expect(send()).toBeEnabled();
  });
});
