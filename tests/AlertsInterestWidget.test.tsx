import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AlertsInterestWidget from "@/components/AlertsInterestWidget";

const calls = () => (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
const bodyOf = (i: number) => JSON.parse(calls()[i][1].body as string);

const pill = () => screen.getByRole("button", { name: /get alerts/i });
const send = () => screen.getByRole("button", { name: /notify me/i });
const emailField = () => screen.getByLabelText(/^email$/i);

beforeEach(() => {
  window.localStorage.clear();
  globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
});
afterEach(() => vi.restoreAllMocks());

describe("AlertsInterestWidget", () => {
  it("starts as a single pill and reports the first open once", () => {
    render(<AlertsInterestWidget />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(pill());
    expect(screen.getByRole("dialog", { name: /want outbreak alerts/i })).toBeInTheDocument();
    expect(bodyOf(0)).toEqual({ kind: "open" });

    fireEvent.click(pill()); // close
    fireEvent.click(pill()); // reopen
    expect(calls()).toHaveLength(1);
  });

  it("says plainly that alerts do not exist yet", () => {
    render(<AlertsInterestWidget />);
    fireEvent.click(pill());
    expect(screen.getByText(/alerts are not built yet/i)).toBeInTheDocument();
  });

  it("closes on Escape and returns focus to the pill", () => {
    render(<AlertsInterestWidget />);
    fireEvent.click(pill());
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(pill()).toHaveFocus();
  });

  it("rejects a missing or malformed email without calling the server", () => {
    render(<AlertsInterestWidget />);
    fireEvent.click(pill());
    fireEvent.click(send());
    expect(screen.getByRole("alert")).toHaveTextContent(/email address/i);
    fireEvent.change(emailField(), { target: { value: "nope" } });
    fireEvent.click(send());
    expect(screen.getByRole("alert")).toHaveTextContent(/email address/i);
    expect(calls()).toHaveLength(1); // only the open ping
  });

  it("submits the email and page, thanks the visitor and remembers it", async () => {
    const { unmount } = render(<AlertsInterestWidget />);
    fireEvent.click(pill());
    fireEvent.change(emailField(), { target: { value: " reader@example.org " } });
    fireEvent.click(send());

    await waitFor(() => expect(screen.getByText(/thank you/i)).toBeInTheDocument());
    expect(bodyOf(1)).toEqual({
      kind: "submit",
      email: "reader@example.org",
      page: window.location.pathname,
      website: "",
    });

    // A later visit does not nag.
    unmount();
    render(<AlertsInterestWidget />);
    expect(screen.queryByRole("button", { name: /get alerts/i })).not.toBeInTheDocument();
  });

  it("shows the server's message and lets the visitor retry when sending fails", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 200 })) // open ping
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Sign-ups are not available right now." }), { status: 503 }),
      );
    render(<AlertsInterestWidget />);
    fireEvent.click(pill());
    fireEvent.change(emailField(), { target: { value: "reader@example.org" } });
    fireEvent.click(send());

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/not available right now/i));
    expect(send()).toBeEnabled();
    expect(window.localStorage.getItem("outbreak-alerts-interest-submitted")).toBeNull();
  });
});
