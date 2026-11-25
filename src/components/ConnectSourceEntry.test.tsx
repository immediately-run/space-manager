// Connect Google Drive. This app names the scheme and reflects the result; every authority
// step (the Google consent, the folder browser, the access choice) is drawn by the host
// and tested there. What is worth pinning here is that this app paints none of it.
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { doubles, live, refusal, resetDoubles } from "../test/sdkDouble";

vi.mock("@immediately-run/sdk", async () => (await import("../test/sdkDouble")).sdkModule);
vi.mock("@immediately-run/sdk/sandboxUtils", async () => (await import("../test/sdkDouble")).sandboxUtilsModule);

import ConnectSourceEntry from "./ConnectSourceEntry";

const connect = () => userEvent.click(screen.getByRole("button", { name: "Connect Google Drive" }));

beforeEach(() => {
  resetDoubles();
  doubles.protocolRequest.mockResolvedValue({ id: "drive:folder-1" });
});

describe("ConnectSourceEntry", () => {
  it("names only the scheme, then reflects the result", async () => {
    const onConnected = vi.fn();
    render(<ConnectSourceEntry onConnected={onConnected} />);
    await connect();
    await waitFor(() => expect(onConnected).toHaveBeenCalledTimes(1));
    expect(doubles.protocolRequest).toHaveBeenCalledTimes(1);
    expect(doubles.protocolRequest).toHaveBeenCalledWith("protocol-spaces", "connectSource", [{ scheme: "drive" }]);
  });

  it("paints no authorization chrome of its own: a busy label and nothing else", async () => {
    let resolve: (v: unknown) => void = () => {};
    doubles.protocolRequest.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<ConnectSourceEntry onConnected={() => {}} />);
    await connect();

    expect(await screen.findByRole("button", { name: "Connecting…" })).toBeDisabled();
    expect(screen.queryByText(/drive\.file/)).not.toBeInTheDocument();
    expect(screen.queryByText(/single-writer/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Read and write/ })).not.toBeInTheDocument();
    await act(async () => resolve({}));
  });

  it("treats `cancelled` as calm: the reader backed out, nothing failed", async () => {
    doubles.protocolRequest.mockRejectedValue(refusal("cancelled"));
    render(<ConnectSourceEntry onConnected={() => {}} />);
    await connect();
    await waitFor(() => expect(screen.getByRole("button", { name: "Connect Google Drive" })).toBeEnabled());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("says what to do when the Google connection needs re-authorizing", async () => {
    doubles.protocolRequest.mockRejectedValue(refusal("google_reauth_required"));
    render(<ConnectSourceEntry onConnected={() => {}} />);
    await connect();
    expect(await screen.findByText(/Reconnect Google in Settings/)).toBeInTheDocument();
  });

  it("says so plainly when the deployment has no Drive connector", async () => {
    doubles.protocolRequest.mockRejectedValue(refusal("unsupported-scheme"));
    render(<ConnectSourceEntry onConnected={() => {}} />);
    await connect();
    expect(await screen.findByText(/isn’t available on this deployment/)).toBeInTheDocument();
  });

  it("is absent while signed out", () => {
    live.auth = "signed-out";
    const { container } = render(<ConnectSourceEntry onConnected={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
