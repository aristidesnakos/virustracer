import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AlertsInterestWidget from "@/components/AlertsInterestWidget";

const calls = () => (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
const bodyOf = (i: number) => JSON.parse(calls()[i][1].body as string);

const pill = () => screen.getByRole("button", { name: /get alerts/i });
const send = () => screen.getByRole("button", { name: /^send$/i });
const emailChannel = () => screen.getByLabelText(/^email$/i, { selector: "input[type=radio]" });
const emailField = () => screen.getByLabelText(/email \(optional\)/i);

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

  it("requires an alert type and a channel before sending", () => {
    render(<AlertsInterestWidget />);
    fireEvent.click(pill());

    fireEvent.click(send());
    expect(screen.getByRole("alert")).toHaveTextContent(/at least one alert/i);

    fireEvent.click(screen.getByLabelText(/new country reports cases/i));
    fireEvent.click(send());
    expect(screen.getByRole("alert")).toHaveTextContent(/how you would want to be alerted/i);
    expect(calls()).toHaveLength(1); // only the open ping
  });

  it("rejects a malformed email without calling the server", () => {
    render(<AlertsInterestWidget />);
    fireEvent.click(pill());
    fireEvent.click(screen.getByLabelText(/new country reports cases/i));
    fireEvent.click(emailChannel());
    fireEvent.change(emailField(), { target: { value: "nope" } });
    fireEvent.click(send());
    expect(screen.getByRole("alert")).toHaveTextContent(/email address/i);
    expect(calls()).toHaveLength(1);
  });

  it("submits the answers, thanks the visitor and remembers it", async () => {
    const { unmount } = render(<AlertsInterestWidget />);
    fireEvent.click(pill());
    fireEvent.click(screen.getByLabelText(/new country reports cases/i));
    fireEvent.click(screen.getByLabelText(/death toll passes a milestone/i));
    fireEvent.click(emailChannel());
    fireEvent.change(screen.getByLabelText(/i am/i), { target: { value: "journalist" } });
    fireEvent.change(emailField(), { target: { value: "reader@example.org" } });
    fireEvent.click(send());

    await waitFor(() => expect(screen.getByText(/thank you/i)).toBeInTheDocument());
    expect(bodyOf(1)).toMatchObject({
      kind: "submit",
      events: ["new-country", "milestone"],
      channel: "email",
      role: "journalist",
      email: "reader@example.org",
      website: "",
    });
    expect(screen.getByText(/write to you once/i)).toBeInTheDocument();

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
    fireEvent.click(screen.getByLabelText(/new country reports cases/i));
    fireEvent.click(emailChannel());
    fireEvent.click(send());

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/not available right now/i));
    expect(send()).toBeEnabled();
    expect(window.localStorage.getItem("ebola-alerts-interest-submitted")).toBeNull();
  });
});
